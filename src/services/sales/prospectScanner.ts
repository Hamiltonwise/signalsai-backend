/**
 * Manifest v2 Card 6 (Sales Agent Brick 1) — Prospect Scanner.
 *
 * Daily job (Worker #16). Loads ICP Definition v1, then for every vertical
 * in scope:
 *   1. Discovers candidate URLs by querying Google Places by
 *      vertical + metro (the same Places infra that recognitionScorer uses
 *      for placeId lookup). This is the practical reuse of the public-data
 *      lookup pattern from Card 5 Run 2's Data Gap Resolver.
 *   2. For each candidate URL not already in `prospects`:
 *        - Run Recognition Tri-Score
 *        - Apply ICP disqualifiers (existing client, opt-out domain,
 *          competitor-referral)
 *        - If passes, insert with status=candidate
 *        - Emit PROSPECT_IDENTIFIED
 *   3. For each existing prospect older than 7 days: rescan, update scores,
 *      emit PROSPECT_SCORE_CHANGED if any dimension shifted >10 points,
 *      and reclassify if status needs to change.
 *
 * Feature flag: prospect_scanner_enabled (default false, instance-scoped).
 * Shadow mode when off: discovers + scores but does NOT insert/update
 * prospects, does NOT emit downstream events. Discovery counts archived
 * via the SCANNER_STARTED/COMPLETED envelope events for shadow analysis.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { isEnabled } from "../featureFlags";
import { scoreRecognition } from "../checkup/recognitionScorer";
import type { RecognitionScorerResult } from "../checkup/recognitionScorer";
import {
  textSearch,
  isApiKeyConfigured,
} from "../../controllers/places/feature-services/GooglePlacesApiService";
import { loadIcpConfig } from "./icpConfig";
import type { IcpConfig, Vertical, VerticalRule } from "./icpConfig";
import {
  PROSPECT_IDENTIFIED,
  PROSPECT_SCORE_CHANGED,
  PROSPECT_SCANNER_STARTED,
  PROSPECT_SCANNER_COMPLETED,
} from "../../constants/eventTypes";
import { runFlaggerOnIdentified, runFlaggerOnScoreChanged } from "./candidateFlagger";

const RESCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MATERIAL_SCORE_DELTA = 10;

const VERTICAL_QUERY_LABEL: Record<Vertical, string> = {
  endo: "endodontist",
  ortho: "orthodontist",
  chiro: "chiropractor",
  optometry: "optometrist",
  legal: "law firm",
  cpa: "CPA accountant",
  vet: "veterinarian",
  financial_advisor: "financial advisor",
};

export interface TriScoreSnapshot {
  seo: number | null;
  aeo: number | null;
  cro: number | null;
  composite: number | null;
}

export interface CandidateDiscovery {
  url: string;
  vertical: Vertical;
  location: string;
  placeId?: string;
  name?: string;
}

export interface ProspectInsertion {
  prospectId: string;
  url: string;
  vertical: Vertical;
  triScore: TriScoreSnapshot;
}

export interface ProspectScanResult {
  mode: "live" | "shadow";
  verticalsScanned: Vertical[];
  candidatesDiscovered: number;
  newProspects: number;
  rescannedProspects: number;
  scoreChangeEvents: number;
  disqualifiedCount: number;
  durationMs: number;
}

// ── Disqualifier checks ──────────────────────────────────────────────

interface DisqualifierContext {
  url: string;
  vertical: Vertical;
}

interface DisqualifierResult {
  disqualified: boolean;
  reason?: string;
}

function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function checkDisqualifiers(
  ctx: DisqualifierContext,
  config: IcpConfig
): Promise<DisqualifierResult> {
  const { disqualifiers } = config;
  const domain = normalizeDomain(ctx.url);

  if (disqualifiers.optOutDomains.length > 0) {
    for (const optOut of disqualifiers.optOutDomains) {
      if (domain.includes(optOut.toLowerCase())) {
        return { disqualified: true, reason: `opt_out_domain:${optOut}` };
      }
    }
  }

  if (disqualifiers.existingClientCheck) {
    const existingClient = await isExistingClient(domain);
    if (existingClient) {
      return { disqualified: true, reason: "existing_client" };
    }
  }

  if (disqualifiers.competitorReferral) {
    const isCompRef = await isCompetitorReferral(domain);
    if (isCompRef) {
      return { disqualified: true, reason: "competitor_referral" };
    }
  }

  return { disqualified: false };
}

async function isExistingClient(domain: string): Promise<boolean> {
  try {
    const row = await db("organizations")
      .whereNull("deleted_at")
      .where(function () {
        this.whereRaw("LOWER(website_url) LIKE ?", [`%${domain}%`])
          .orWhereRaw("LOWER(business_data::text) LIKE ?", [`%${domain}%`]);
      })
      .first("id");
    return !!row;
  } catch {
    return false;
  }
}

async function isCompetitorReferral(domain: string): Promise<boolean> {
  try {
    const hasTable = await db.schema.hasTable("competitor_snapshots");
    if (!hasTable) return false;
    const row = await db("competitor_snapshots")
      .whereRaw("LOWER(website_url) LIKE ?", [`%${domain}%`])
      .first("id");
    return !!row;
  } catch {
    return false;
  }
}

// ── Candidate URL discovery ──────────────────────────────────────────

/**
 * Reuses the same Google Places infrastructure that recognitionScorer
 * uses for placeId lookup. This is the practical "public data sources"
 * reuse called for in the spec — the Data Gap Resolver enriches existing
 * orgs; discovery for new prospects comes from the same upstream API.
 */
export async function discoverCandidates(
  vertical: Vertical,
  metros: string[]
): Promise<CandidateDiscovery[]> {
  if (!isApiKeyConfigured()) return [];

  const label = VERTICAL_QUERY_LABEL[vertical];
  const out: CandidateDiscovery[] = [];
  const seenUrls = new Set<string>();

  for (const metro of metros) {
    const query = `${label} in ${metro}`;
    let places: any[] = [];
    try {
      places = await textSearch(query, 20);
    } catch {
      continue;
    }
    for (const place of places) {
      const websiteUri: string | undefined = place?.websiteUri;
      if (!websiteUri) continue;
      const normalized = normalizeDomain(websiteUri);
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);
      out.push({
        url: websiteUri,
        vertical,
        location: metro,
        placeId: place?.id,
        name: place?.displayName?.text ?? place?.displayName,
      });
    }
  }

  return out;
}

// ── Tri-score helpers ────────────────────────────────────────────────

function snapshotTriScore(result: RecognitionScorerResult): TriScoreSnapshot {
  const seo = result.practice.seo_composite;
  const aeo = result.practice.aeo_composite;
  const cro = result.practice.cro_composite;
  const dims = [seo, aeo, cro].filter((v): v is number => typeof v === "number");
  const composite = dims.length > 0 ? Math.round(dims.reduce((a, b) => a + b, 0) / dims.length) : null;
  return { seo, aeo, cro, composite };
}

function scoreShifted(
  prior: TriScoreSnapshot | null,
  next: TriScoreSnapshot
): { shifted: boolean; deltas: Record<"seo" | "aeo" | "cro" | "composite", number | null> } {
  const deltas = {
    seo: prior?.seo != null && next.seo != null ? next.seo - prior.seo : null,
    aeo: prior?.aeo != null && next.aeo != null ? next.aeo - prior.aeo : null,
    cro: prior?.cro != null && next.cro != null ? next.cro - prior.cro : null,
    composite:
      prior?.composite != null && next.composite != null
        ? next.composite - prior.composite
        : null,
  };
  const shifted = (["seo", "aeo", "cro"] as const).some((k) => {
    const d = deltas[k];
    return d != null && Math.abs(d) > MATERIAL_SCORE_DELTA;
  });
  return { shifted, deltas };
}

// ── Insertion + update ──────────────────────────────────────────────

interface ProspectRow {
  id: string;
  url: string;
  vertical: string;
  status: string;
  recognition_tri_score: TriScoreSnapshot | string | null;
  last_scanned_at: Date | null;
  source: string;
}

async function getProspectByUrl(url: string): Promise<ProspectRow | null> {
  const row = await db("prospects").where({ url }).first();
  return (row as ProspectRow | undefined) ?? null;
}

function parseStoredScore(raw: unknown): TriScoreSnapshot | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TriScoreSnapshot;
    } catch {
      return null;
    }
  }
  return raw as TriScoreSnapshot;
}

async function insertProspect(
  candidate: CandidateDiscovery,
  triScore: TriScoreSnapshot,
  missingExamples: unknown[],
  source: "watcher_scan" | "checkup_self_serve" = "watcher_scan"
): Promise<string> {
  const [row] = await db("prospects")
    .insert({
      url: candidate.url,
      vertical: candidate.vertical,
      location: candidate.location,
      status: "candidate",
      recognition_tri_score: JSON.stringify(triScore),
      missing_examples: JSON.stringify(missingExamples ?? []),
      identified_at: new Date(),
      last_scanned_at: new Date(),
      source,
    })
    .returning(["id"]);
  return row.id;
}

async function updateProspectScore(
  prospectId: string,
  triScore: TriScoreSnapshot,
  missingExamples: unknown[]
): Promise<void> {
  await db("prospects")
    .where({ id: prospectId })
    .update({
      recognition_tri_score: JSON.stringify(triScore),
      missing_examples: JSON.stringify(missingExamples ?? []),
      last_scanned_at: new Date(),
      updated_at: new Date(),
    });
}

// ── Main scan ────────────────────────────────────────────────────────

export interface RunProspectScanOptions {
  /** Cap candidates per vertical (test/dry-run convenience). Default 50. */
  maxCandidatesPerVertical?: number;
  /** When true, skip flagger invocation (used by tests that assert scanner output in isolation). */
  skipFlaggerHook?: boolean;
}

export async function runProspectScan(
  opts: RunProspectScanOptions = {}
): Promise<ProspectScanResult> {
  const start = Date.now();
  const flagOn = await isEnabled("prospect_scanner_enabled");
  const mode: "live" | "shadow" = flagOn ? "live" : "shadow";

  await BehavioralEventModel.create({
    event_type: PROSPECT_SCANNER_STARTED,
    properties: { mode, started_at: new Date().toISOString() },
  }).catch(() => {});

  const { config } = await loadIcpConfig();
  const cap = opts.maxCandidatesPerVertical ?? 50;

  let candidatesDiscovered = 0;
  let newProspects = 0;
  let rescannedProspects = 0;
  let scoreChangeEvents = 0;
  let disqualifiedCount = 0;

  // Pass 1: discover and insert new candidates
  for (const rule of config.verticals) {
    const candidates = await discoverCandidates(rule.vertical, config.locationScope.metros);
    candidatesDiscovered += candidates.length;

    for (const candidate of candidates.slice(0, cap)) {
      const existing = await getProspectByUrl(candidate.url);
      if (existing) continue;

      const dq = await checkDisqualifiers(
        { url: candidate.url, vertical: rule.vertical },
        config
      );
      if (dq.disqualified) {
        disqualifiedCount += 1;
        if (mode === "live") {
          await db("prospects")
            .insert({
              url: candidate.url,
              vertical: candidate.vertical,
              location: candidate.location,
              status: "disqualified",
              recognition_tri_score: null,
              missing_examples: JSON.stringify([]),
              identified_at: new Date(),
              last_scanned_at: new Date(),
              disqualification_reason: dq.reason ?? "unknown",
              source: "watcher_scan",
            })
            .onConflict("url")
            .ignore()
            .catch(() => {});
        }
        continue;
      }

      let scoreResult: RecognitionScorerResult;
      try {
        scoreResult = await scoreRecognition({
          practiceUrl: candidate.url,
          specialty: rule.vertical,
          location: candidate.location,
          placeId: candidate.placeId,
        });
      } catch {
        continue;
      }

      const triScore = snapshotTriScore(scoreResult);
      const missingExamples = scoreResult.practice.missing_examples ?? [];

      if (mode === "live") {
        const prospectId = await insertProspect(
          candidate,
          triScore,
          missingExamples,
          "watcher_scan"
        );
        newProspects += 1;

        await BehavioralEventModel.create({
          event_type: PROSPECT_IDENTIFIED,
          properties: {
            prospect_id: prospectId,
            url: candidate.url,
            vertical: candidate.vertical,
            location: candidate.location,
            tri_score: triScore,
            source: "watcher_scan",
          },
        }).catch(() => {});

        if (!opts.skipFlaggerHook) {
          await runFlaggerOnIdentified({
            prospectId,
            url: candidate.url,
            vertical: candidate.vertical,
            triScore,
            source: "watcher_scan",
          }).catch(() => {});
        }
      } else {
        // Shadow: count it for telemetry, do not write
        newProspects += 1;
      }
    }
  }

  // Pass 2: rescan stale prospects
  if (mode === "live") {
    const cutoff = new Date(Date.now() - RESCAN_INTERVAL_MS);
    const stale = await db("prospects")
      .whereIn("status", ["candidate", "flagged"])
      .where(function () {
        this.whereNull("last_scanned_at").orWhere("last_scanned_at", "<", cutoff);
      })
      .select("id", "url", "vertical", "status", "recognition_tri_score", "last_scanned_at");

    for (const prospect of stale) {
      const rule = config.verticals.find((v) => v.vertical === prospect.vertical);
      let scoreResult: RecognitionScorerResult;
      try {
        scoreResult = await scoreRecognition({
          practiceUrl: prospect.url,
          specialty: prospect.vertical,
        });
      } catch {
        continue;
      }
      rescannedProspects += 1;

      const next = snapshotTriScore(scoreResult);
      const prior = parseStoredScore(prospect.recognition_tri_score);
      const { shifted, deltas } = scoreShifted(prior, next);

      await updateProspectScore(
        prospect.id,
        next,
        scoreResult.practice.missing_examples ?? []
      );

      if (shifted) {
        scoreChangeEvents += 1;
        await BehavioralEventModel.create({
          event_type: PROSPECT_SCORE_CHANGED,
          properties: {
            prospect_id: prospect.id,
            url: prospect.url,
            vertical: prospect.vertical,
            prior_tri_score: prior,
            new_tri_score: next,
            deltas,
          },
        }).catch(() => {});

        if (!opts.skipFlaggerHook && rule) {
          await runFlaggerOnScoreChanged({
            prospectId: prospect.id,
            url: prospect.url,
            vertical: prospect.vertical as Vertical,
            triScore: next,
          }).catch(() => {});
        }
      }
    }
  }

  const result: ProspectScanResult = {
    mode,
    verticalsScanned: config.verticals.map((v) => v.vertical),
    candidatesDiscovered,
    newProspects,
    rescannedProspects,
    scoreChangeEvents,
    disqualifiedCount,
    durationMs: Date.now() - start,
  };

  await BehavioralEventModel.create({
    event_type: PROSPECT_SCANNER_COMPLETED,
    properties: {
      mode,
      verticals_scanned: result.verticalsScanned,
      candidates_discovered: result.candidatesDiscovered,
      new_prospects: result.newProspects,
      rescanned_prospects: result.rescannedProspects,
      score_change_events: result.scoreChangeEvents,
      disqualified_count: result.disqualifiedCount,
      duration_ms: result.durationMs,
    },
  }).catch(() => {});

  return result;
}

// ── Test hooks ───────────────────────────────────────────────────────

export const _internals = {
  snapshotTriScore,
  scoreShifted,
  normalizeDomain,
  checkDisqualifiers,
  VERTICAL_QUERY_LABEL,
};
