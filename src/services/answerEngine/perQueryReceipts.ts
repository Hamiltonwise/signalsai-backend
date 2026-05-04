/**
 * Card 7 — Per-Query Receipt composer (May 4 2026).
 *
 * Given a signal_event, builds the three demonstration-receipt fields
 * that Card 7 attaches to the live_activity_entries row:
 *
 *   patient_question      — extracted from signal_data.query (when present)
 *   visibility_snapshot   — Google rank from weekly_ranking_snapshots +
 *                           per-platform citation status from aeo_citations
 *                           at (or just before) the signal timestamp
 *   action_taken          — composed from signal_event.action_log when
 *                           populated, else from the route decision
 *
 * Voice constraints on action_taken are enforced at write time inside
 * writeLiveActivityEntry; this composer's job is to produce the strings.
 */

import { db } from "../../database/connection";
import type { SignalType } from "./types";

export interface PerQueryReceiptInput {
  practiceId: number;
  signalType: SignalType;
  signalData: Record<string, unknown>;
  signalTimestamp?: Date;
  /** Optional pre-populated action chain from the regeneration pipeline. */
  actionLog?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  /** When no action_log present, this is what the trigger router decided. */
  routedTo?: string | null;
}

export interface PerQueryReceipt {
  patientQuestion: string | null;
  visibilitySnapshot: VisibilitySnapshot | null;
  actionTaken: string | null;
}

/**
 * Build the receipt for one signal-driven Live Activity entry.
 */
export async function composePerQueryReceipt(
  input: PerQueryReceiptInput,
): Promise<PerQueryReceipt> {
  const patientQuestion = extractPatientQuestion(input.signalData);

  const visibilitySnapshot = patientQuestion
    ? await composeVisibilitySnapshot(
        input.practiceId,
        patientQuestion,
        input.signalTimestamp,
      )
    : null;

  const actionTaken = composeActionTaken({
    signalType: input.signalType,
    actionLog: input.actionLog,
    routedTo: input.routedTo,
    patientQuestion,
  });

  return { patientQuestion, visibilitySnapshot, actionTaken };
}

// ── Patient question extraction ─────────────────────────────────────

function extractPatientQuestion(signalData: Record<string, unknown>): string | null {
  // Most GSC + AEO signals carry the literal query under signal_data.query
  const direct = signalData.query;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  // Some adapter shapes nest it (e.g., aeo_citation_lost / aeo_citation_competitor)
  const nested = (signalData.citation as Record<string, unknown> | undefined)
    ?.query;
  if (typeof nested === "string" && nested.trim().length > 0) {
    return nested.trim();
  }
  return null;
}

// ── Visibility snapshot composer ────────────────────────────────────

interface PlatformCitationStatus {
  platform: string;
  cited: boolean;
  competitor_cited: string | null;
}

export interface VisibilitySnapshot {
  query: string;
  google_rank: number | null;
  per_platform: PlatformCitationStatus[];
  /** Deterministic one-line rendering for the frontend (mid-dot separator). */
  display: string;
  snapshot_at: string;
}

async function composeVisibilitySnapshot(
  practiceId: number,
  query: string,
  signalTimestamp?: Date,
): Promise<VisibilitySnapshot> {
  const at = signalTimestamp ?? new Date();
  const atIso = at.toISOString();

  // Google rank from weekly_ranking_snapshots — the most recent row at
  // or before the signal timestamp, matched by query text.
  let googleRank: number | null = null;
  try {
    const rankRow = await db("weekly_ranking_snapshots")
      .where({ org_id: practiceId, query })
      .andWhere("snapshot_at", "<=", atIso)
      .orderBy("snapshot_at", "desc")
      .first("rank");
    if (rankRow && typeof rankRow.rank === "number") {
      googleRank = rankRow.rank;
    } else if (rankRow && typeof rankRow.rank === "string") {
      const n = Number(rankRow.rank);
      if (Number.isFinite(n)) googleRank = n;
    }
  } catch {
    // Table or column shape may differ; tolerate and surface null.
    googleRank = null;
  }

  // Per-platform citation status from aeo_citations — most recent row per
  // platform at or before the signal timestamp for this practice + query.
  const perPlatform: PlatformCitationStatus[] = [];
  try {
    const rows = await db("aeo_citations")
      .where({ practice_id: practiceId, query })
      .andWhere("checked_at", "<=", atIso)
      .orderBy("checked_at", "desc")
      .select("platform", "cited", "competitor_cited", "checked_at");
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.platform)) continue;
      seen.add(r.platform);
      perPlatform.push({
        platform: String(r.platform),
        cited: !!r.cited,
        competitor_cited:
          typeof r.competitor_cited === "string" && r.competitor_cited.length > 0
            ? r.competitor_cited
            : null,
      });
    }
  } catch {
    /* tolerate */
  }

  return {
    query,
    google_rank: googleRank,
    per_platform: perPlatform,
    display: renderVisibilityDisplay({
      googleRank,
      perPlatform,
    }),
    snapshot_at: atIso,
  };
}

/**
 * Deterministic one-line rendering. Mid-dot (·, U+00B7) separator
 * per AR-002 (NOT em-dash). Used by the frontend so it can render the
 * snapshot without re-deriving the order.
 */
export function renderVisibilityDisplay(input: {
  googleRank: number | null;
  perPlatform: PlatformCitationStatus[];
}): string {
  const parts: string[] = [];
  if (input.googleRank != null) {
    parts.push(`Google rank ${input.googleRank}`);
  } else {
    parts.push("Google rank not available");
  }
  if (input.perPlatform.length === 0) {
    parts.push("AI platforms not yet polled");
  } else {
    const cited = input.perPlatform.filter((p) => p.cited);
    const competitor = input.perPlatform.filter(
      (p) => !p.cited && p.competitor_cited,
    );
    const not = input.perPlatform.filter(
      (p) => !p.cited && !p.competitor_cited,
    );
    if (cited.length > 0) {
      parts.push(`Cited on ${cited.map((p) => formatPlatform(p.platform)).join(", ")}`);
    }
    if (competitor.length > 0) {
      parts.push(
        `Competitor on ${competitor.map((p) => formatPlatform(p.platform)).join(", ")}`,
      );
    }
    if (not.length > 0) {
      parts.push(`Not yet on ${not.map((p) => formatPlatform(p.platform)).join(", ")}`);
    }
  }
  return parts.join(" · ");
}

function formatPlatform(p: string): string {
  switch (p) {
    case "google_ai_overviews":
      return "Google AI";
    case "chatgpt":
      return "ChatGPT";
    case "perplexity":
      return "Perplexity";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "siri":
      return "Siri";
    default:
      return p;
  }
}

// ── action_taken composer ───────────────────────────────────────────

/**
 * Compose a plain-English description of what Alloro did in response
 * to the signal. Reads from action_log (if present, the regeneration
 * pipeline populated it). Falls back to a route-decision-based
 * sentence so the field is never empty when the routedTo is known.
 */
export function composeActionTaken(input: {
  signalType: SignalType;
  actionLog?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  routedTo?: string | null;
  patientQuestion: string | null;
}): string | null {
  const log = input.actionLog;
  if (log && Array.isArray(log) && log.length > 0) {
    return composeFromLogArray(log, input.patientQuestion);
  }
  if (log && typeof log === "object" && !Array.isArray(log)) {
    return composeFromLogObject(log as Record<string, unknown>, input.patientQuestion);
  }

  // Fallback: compose from route decision.
  if (input.routedTo) {
    if (input.routedTo === "regeneration") {
      return input.patientQuestion
        ? `Started regeneration on the page that answers "${input.patientQuestion}".`
        : "Started regeneration on the page that answers this query.";
    }
    if (input.routedTo === "watching") {
      return input.patientQuestion
        ? `Watching "${input.patientQuestion}". No action needed yet.`
        : "Watching this signal. No action needed yet.";
    }
    if (input.routedTo === "noop") {
      return null;
    }
    return `Routed to ${input.routedTo}.`;
  }
  return null;
}

function composeFromLogArray(
  log: Array<Record<string, unknown>>,
  patientQuestion: string | null,
): string {
  const steps = log
    .map((entry) => {
      const step = typeof entry.step === "string" ? entry.step : null;
      const verdict = typeof entry.verdict === "string" ? entry.verdict : null;
      if (step && verdict) return `${formatStep(step)} (${verdict})`;
      if (step) return formatStep(step);
      if (verdict) return verdict;
      return null;
    })
    .filter((s): s is string => !!s);
  const head = patientQuestion
    ? `For "${patientQuestion}": `
    : "";
  return `${head}${steps.join(", then ")}.`;
}

function composeFromLogObject(
  log: Record<string, unknown>,
  patientQuestion: string | null,
): string {
  const summary = typeof log.summary === "string" ? log.summary : null;
  if (summary) {
    return patientQuestion ? `For "${patientQuestion}": ${summary}` : summary;
  }
  const verdict = typeof log.verdict === "string" ? log.verdict : null;
  if (verdict) {
    return patientQuestion
      ? `For "${patientQuestion}": Reviewer Claude verdict ${verdict}.`
      : `Reviewer Claude verdict ${verdict}.`;
  }
  return patientQuestion
    ? `For "${patientQuestion}": action recorded.`
    : "Action recorded.";
}

function formatStep(step: string): string {
  switch (step) {
    case "research":
      return "Researched fresh content";
    case "copy":
      return "Drafted updated copy";
    case "reviewer_claude":
      return "Ran Reviewer Claude";
    case "deploy":
      return "Deployed the update";
    case "skipped":
      return "Skipped";
    default:
      return step;
  }
}
