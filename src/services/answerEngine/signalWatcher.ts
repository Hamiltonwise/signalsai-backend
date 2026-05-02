/**
 * Signal Watcher (Continuous Answer Engine Loop, Phase 1).
 *
 * Reads the active practice list, fetches the last two 7-day GSC windows
 * per property, computes per-query rank/impression/new-query deltas, and
 * emits structured rows to the signal_events table for the Trigger Router
 * to consume.
 *
 * Phase 1 scope:
 *  - GSC delta detection only. GBP / competitor / AEO signals ship in
 *    later phases (AEO Monitor itself is in this PR but emits via the
 *    same emitSignalEvent helper).
 *  - Non-destructive. No Notion writes, no email, no Mailgun. Each
 *    detected delta becomes one row in signal_events.
 *  - Active list is `patientpath_status in ('preview_ready', 'live')`,
 *    same filter the spec dictates.
 *
 * The GSC fetcher is injectable to keep the unit tests deterministic and
 * away from network calls. Production callers use the default fetcher
 * which talks to google.searchconsole via the org's google_connection.
 */

import { google } from "googleapis";
import { db } from "../../database/connection";
import {
  RANK_DELTA_THRESHOLD,
  IMPRESSION_SPIKE_PCT,
  NEW_QUERY_IMPRESSION_FLOOR,
  computeGscDeltas,
} from "./signalDeltas";
import type {
  GscDelta,
  GscQueryRow,
  GscWindowResult,
  SignalEventRow,
  SignalType,
  SignalWatcherRunResult,
  Severity,
} from "./types";

// ── Active practice loader ──────────────────────────────────────────

export interface ActivePractice {
  id: number;
  name: string;
  /** GSC siteUrl, e.g. "sc-domain:caswellorthodontics.com" or "https://garrisonorthodontics.com/". */
  gscSiteUrl: string;
  /** OAuth refresh token from google_connections (org-level or HW master fallback). */
  refreshToken: string;
  accessToken: string | null;
  email: string;
}

/**
 * Resolve the set of practices Phase 1 watches.
 *
 * Default behavior: organizations.patientpath_status in
 * ('preview_ready', 'live') AND google_connections row exists with a
 * gsc.siteUrl.
 *
 * Optional override: if `practiceIdsOverride` is supplied, the filter
 * skips the patientpath_status check (used by smoke tests / manual runs
 * targeted at practices that have GSC connected but are not yet flagged
 * preview_ready/live in production data).
 */
export async function loadActivePractices(
  practiceIdsOverride?: number[],
): Promise<ActivePractice[]> {
  const baseQuery = db("organizations as o")
    .leftJoin("google_connections as g", "g.organization_id", "o.id")
    .select(
      "o.id as id",
      "o.name as name",
      "g.refresh_token",
      "g.access_token",
      "g.email",
      "g.google_property_ids",
    );

  const rows: Array<{
    id: number;
    name: string;
    refresh_token: string | null;
    access_token: string | null;
    email: string | null;
    google_property_ids: unknown;
  }> = practiceIdsOverride
    ? await baseQuery.whereIn("o.id", practiceIdsOverride)
    : await baseQuery.whereIn("o.patientpath_status", [
        "preview_ready",
        "live",
      ]);

  const out: ActivePractice[] = [];
  for (const r of rows) {
    if (!r.refresh_token) continue;
    const pids =
      typeof r.google_property_ids === "string"
        ? JSON.parse(r.google_property_ids)
        : (r.google_property_ids as Record<string, unknown> | null);
    const gscSiteUrl =
      pids &&
      typeof pids === "object" &&
      "gsc" in pids &&
      pids.gsc &&
      typeof pids.gsc === "object" &&
      "siteUrl" in pids.gsc
        ? ((pids.gsc as { siteUrl?: string }).siteUrl as string | undefined)
        : undefined;
    if (!gscSiteUrl) continue;
    out.push({
      id: r.id,
      name: r.name,
      gscSiteUrl,
      refreshToken: r.refresh_token,
      accessToken: r.access_token,
      email: r.email ?? "(unknown)",
    });
  }
  return out;
}

// ── GSC fetch ───────────────────────────────────────────────────────

export type GscFetcher = (input: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  refreshToken: string;
  accessToken: string | null;
}) => Promise<GscWindowResult | null>;

const defaultGscFetcher: GscFetcher = async ({
  siteUrl,
  startDate,
  endDate,
  refreshToken,
  accessToken,
}) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn(
      "[SignalWatcher] GOOGLE_CLIENT_ID/SECRET missing — cannot fetch GSC.",
    );
    return null;
  }
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
  });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth });
  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 250,
        type: "web",
      },
    });
    const rows: GscQueryRow[] = (res.data.rows || []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: Math.round((r.position ?? 0) * 10) / 10,
      ctr: Math.round((r.ctr ?? 0) * 1000) / 10,
    }));
    return { startDate, endDate, rows };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[SignalWatcher] GSC fetch failed for ${siteUrl} (${startDate} → ${endDate}): ${message}`,
    );
    return null;
  }
};

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Return ISO YYYY-MM-DD pairs for the "current 7-day window" and the
 * "prior 7-day window" relative to a reference date. Default reference
 * is "now". The current window is days [-7, -1] inclusive (yesterday and
 * the six days before); GSC data lags by up to 2 days but the 7-day
 * window absorbs that lag.
 */
export function computeGscWindows(now: Date = new Date()): {
  current: { start: string; end: string };
  prior: { start: string; end: string };
} {
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);

  const currentEnd = yesterday;
  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentEnd.getUTCDate() - 6);

  const priorEnd = new Date(currentStart);
  priorEnd.setUTCDate(currentStart.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorEnd.getUTCDate() - 6);

  return {
    current: { start: iso(currentStart), end: iso(currentEnd) },
    prior: { start: iso(priorStart), end: iso(priorEnd) },
  };
}

function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Severity classification for an emitted signal. */
function severityForDelta(d: GscDelta): Severity {
  // gsc_new_query above 100 imps is "watch" (worth knowing).
  if (d.signal_type === "gsc_new_query") return "watch";
  // gsc_rank_delta of 5+ is "action"; 3–4 is "watch".
  if (d.signal_type === "gsc_rank_delta") {
    return Math.abs(d.rankDelta ?? 0) >= 5 ? "action" : "watch";
  }
  // gsc_impression_spike of 100%+ is "action"; otherwise "watch".
  if (d.signal_type === "gsc_impression_spike") {
    return Math.abs(d.impressionPct ?? 0) >= 100 ? "action" : "watch";
  }
  return "info";
}

function recommendedActionForDelta(d: GscDelta): string {
  if (d.signal_type === "gsc_rank_delta") {
    const direction = (d.rankDelta ?? 0) < 0 ? "improved" : "worsened";
    return `Rank ${direction} ${Math.abs(d.rankDelta ?? 0).toFixed(1)} positions on "${d.query}" (${d.rankBefore} → ${d.rankAfter}). Phase 2: route to Research Agent (regeneration mode) to integrate this query into research_brief.`;
  }
  if (d.signal_type === "gsc_impression_spike") {
    return `Impressions ${(d.impressionPct ?? 0) > 0 ? "spiked" : "dropped"} ${Math.abs(d.impressionPct ?? 0).toFixed(0)}% on "${d.query}" (${d.impressionsBefore} → ${d.impressionsAfter}). Phase 2: regenerate copy referencing this query.`;
  }
  if (d.signal_type === "gsc_new_query") {
    return `New query "${d.query}" appeared with ${d.impressionsAfter} impressions. Phase 2: route to Research Agent to evaluate as fear_category candidate.`;
  }
  return "No recommended action.";
}

// ── emit ───────────────────────────────────────────────────────────

export async function emitSignalEvent(input: {
  practice_id: number;
  signal_type: SignalType;
  signal_data: Record<string, unknown>;
  severity: Severity;
  recommended_action: string;
}): Promise<string> {
  const [row] = await db("signal_events")
    .insert({
      practice_id: input.practice_id,
      signal_type: input.signal_type,
      signal_data: JSON.stringify(input.signal_data),
      severity: input.severity,
      recommended_action: input.recommended_action,
    })
    .returning(["id"]);
  return (row as { id: string }).id;
}

// ── Run entry point ─────────────────────────────────────────────────

export interface RunSignalWatcherInput {
  /** Inject a deterministic GSC fetcher in tests. */
  gscFetcher?: GscFetcher;
  /** Override the active practice list for smoke tests. */
  practiceIdsOverride?: number[];
  /** Override the reference date (UTC). Default: new Date(). */
  now?: Date;
  /** When true, do not write to signal_events. Returns deltas in result for inspection. */
  dryRun?: boolean;
}

export interface RunSignalWatcherResult extends SignalWatcherRunResult {
  /** Set when dryRun=true. */
  detectedDeltas?: Array<{ practiceId: number; delta: GscDelta }>;
}

export async function runSignalWatcher(
  input: RunSignalWatcherInput = {},
): Promise<RunSignalWatcherResult> {
  const fetcher = input.gscFetcher ?? defaultGscFetcher;
  const now = input.now ?? new Date();
  const windows = computeGscWindows(now);
  const practices = await loadActivePractices(input.practiceIdsOverride);

  const out: RunSignalWatcherResult = {
    practicesChecked: 0,
    practicesSkipped: 0,
    signalsEmitted: 0,
    perPractice: [],
    detectedDeltas: input.dryRun ? [] : undefined,
  };

  for (const p of practices) {
    let queriesCurrent = 0;
    let queriesPrior = 0;
    let deltasFound = 0;
    let skipReason: string | undefined;

    try {
      const [current, prior] = await Promise.all([
        fetcher({
          siteUrl: p.gscSiteUrl,
          startDate: windows.current.start,
          endDate: windows.current.end,
          refreshToken: p.refreshToken,
          accessToken: p.accessToken,
        }),
        fetcher({
          siteUrl: p.gscSiteUrl,
          startDate: windows.prior.start,
          endDate: windows.prior.end,
          refreshToken: p.refreshToken,
          accessToken: p.accessToken,
        }),
      ]);

      if (!current || !prior) {
        skipReason = "GSC fetch returned null for one or both windows";
        out.practicesSkipped += 1;
      } else {
        queriesCurrent = current.rows.length;
        queriesPrior = prior.rows.length;
        const deltas = computeGscDeltas(prior.rows, current.rows);
        deltasFound = deltas.length;

        for (const d of deltas) {
          if (input.dryRun) {
            out.detectedDeltas!.push({ practiceId: p.id, delta: d });
            continue;
          }
          await emitSignalEvent({
            practice_id: p.id,
            signal_type: d.signal_type,
            signal_data: {
              query: d.query,
              rankBefore: d.rankBefore,
              rankAfter: d.rankAfter,
              rankDelta: d.rankDelta,
              impressionPct: d.impressionPct,
              impressionsBefore: d.impressionsBefore,
              impressionsAfter: d.impressionsAfter,
              window_current: windows.current,
              window_prior: windows.prior,
            },
            severity: severityForDelta(d),
            recommended_action: recommendedActionForDelta(d),
          });
          out.signalsEmitted += 1;
        }
        out.practicesChecked += 1;
      }
    } catch (err: unknown) {
      skipReason = err instanceof Error ? err.message : String(err);
      out.practicesSkipped += 1;
    }

    out.perPractice.push({
      practiceId: p.id,
      name: p.name,
      queriesFetchedCurrent: queriesCurrent,
      queriesFetchedPrior: queriesPrior,
      deltasFound,
      skipReason,
    });
  }

  return out;
}

// ── Re-exports ──────────────────────────────────────────────────────

export {
  RANK_DELTA_THRESHOLD,
  IMPRESSION_SPIKE_PCT,
  NEW_QUERY_IMPRESSION_FLOOR,
  computeGscDeltas,
};

export type { SignalEventRow };
