/**
 * Recovery Confirmation Worker (Continuous Answer Engine Loop, Phase 3).
 *
 * Closes the recovery loop. Architecture spec AR-009 Component 6:
 *
 *   aeo_citation_lost / aeo_citation_competitor signal
 *      -> Trigger Router routes to Research Agent in AEO_recovery mode (Phase 2)
 *      -> Copy Agent generates new FAQ block + schema (Phase 2)
 *      -> Reviewer Claude gates, sandbox publishes (Phase 2)
 *      -> [PHASE 3] AEO Monitor re-tests within 24h to confirm recovery
 *      -> writes citation_recovered live_activity_entry on success
 *      -> writes watching_started entry if not yet recovered after 7 days
 *
 * This module runs the re-test step. It looks for `regeneration_published`
 * entries written in the last 24h whose source signal was an AEO citation
 * loss/competitor, re-checks the citation across the relevant platform,
 * and writes the outcome entry. After 7 days without recovery, switches
 * to `watching_started` so the doctor sees what is being monitored.
 */

import { db } from "../../database/connection";
import { writeLiveActivityEntry } from "./liveActivity";
import { renderEntry } from "../narrator/liveActivityRenderer";
import { PLATFORM_ADAPTERS, getAdapter } from "./platforms/registry";
import {
  getLatestCitation,
  loadAeoActivePractices,
  recordCitation,
  type AeoMonitorPractice,
} from "./aeoMonitor";
import type { AeoPlatform, CitationResult } from "./types";

const RECOVERY_RETEST_HOURS = 24;
const RECOVERY_GIVE_UP_DAYS = 7;

export interface RunRecoveryConfirmationInput {
  practiceIdsOverride?: number[];
  /** Force the re-test to use the override path (skip real API calls). */
  rawResponseOverrides?: Partial<
    Record<AeoPlatform, Record<string, { text: string; citationUrls?: string[] }>>
  >;
  dryRun?: boolean;
}

export interface RunRecoveryConfirmationResult {
  candidatesConsidered: number;
  retests: number;
  recoveriesConfirmed: number;
  watchingStarted: number;
  perEntry: Array<{
    liveActivityId: string;
    practiceId: number;
    platform: AeoPlatform;
    query: string;
    outcome: "recovered" | "still_not_cited" | "watching_started" | "skipped";
    reason?: string;
  }>;
}

export async function runRecoveryConfirmation(
  input: RunRecoveryConfirmationInput = {},
): Promise<RunRecoveryConfirmationResult> {
  const since = new Date(Date.now() - RECOVERY_GIVE_UP_DAYS * 24 * 3600 * 1000);
  const out: RunRecoveryConfirmationResult = {
    candidatesConsidered: 0,
    retests: 0,
    recoveriesConfirmed: 0,
    watchingStarted: 0,
    perEntry: [],
  };

  // Load candidates: regeneration_published entries from AEO_recovery mode
  // since the lookback window. We join on the linked signal_event so we
  // know which (query, platform) to re-test.
  const rows = await db("live_activity_entries as la")
    .leftJoin("signal_events as se", "se.id", "la.linked_signal_event_id")
    .where("la.entry_type", "regeneration_published")
    .andWhere("la.created_at", ">=", since)
    .andWhereRaw("(la.entry_data ->> 'mode') = 'AEO_recovery'")
    .select(
      "la.id as la_id",
      "la.practice_id as practice_id",
      "la.created_at as published_at",
      "la.entry_data as la_entry_data",
      "se.signal_data as signal_data",
    );

  out.candidatesConsidered = rows.length;
  if (rows.length === 0) return out;

  const practicesById = new Map<number, AeoMonitorPractice>();
  const allPractices = await loadAeoActivePractices(input.practiceIdsOverride);
  for (const p of allPractices) practicesById.set(p.id, p);

  for (const r of rows as Array<{
    la_id: string;
    practice_id: number;
    published_at: Date;
    la_entry_data: unknown;
    signal_data: unknown;
  }>) {
    const practice = practicesById.get(r.practice_id);
    if (!practice) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform: "google_ai_overviews",
        query: "(unknown)",
        outcome: "skipped",
        reason: "practice not found in active list",
      });
      continue;
    }

    const sigData =
      typeof r.signal_data === "string"
        ? safeJsonParse(r.signal_data)
        : (r.signal_data as Record<string, unknown> | null);
    const platform = (sigData?.platform as AeoPlatform | undefined) || "google_ai_overviews";
    const query = (sigData?.query as string | undefined) || "";
    if (!query) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query: "(missing)",
        outcome: "skipped",
        reason: "linked signal_data has no query",
      });
      continue;
    }

    const ageHours = (Date.now() - new Date(r.published_at).getTime()) / 3600 / 1000;
    if (ageHours < RECOVERY_RETEST_HOURS) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "skipped",
        reason: `published ${ageHours.toFixed(1)}h ago, awaiting ${RECOVERY_RETEST_HOURS}h soak`,
      });
      continue;
    }

    // Already wrote a citation_recovered or watching_started for this candidate?
    const alreadyResolved = await db("live_activity_entries")
      .where("practice_id", r.practice_id)
      .whereIn("entry_type", ["citation_recovered", "watching_started"])
      .andWhere("created_at", ">=", new Date(r.published_at))
      .andWhereRaw("(entry_data ->> 'source_la_id') = ?", [r.la_id])
      .first();
    if (alreadyResolved) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "skipped",
        reason: "already resolved",
      });
      continue;
    }

    // Re-test the citation.
    const adapter = getAdapter(platform);
    if (!adapter) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "skipped",
        reason: "no adapter registered for platform",
      });
      continue;
    }

    const override = input.rawResponseOverrides?.[platform]?.[query];
    let result: CitationResult;
    try {
      result = await adapter.checkCitation({ query, practice, rawResponseOverride: override });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "skipped",
        reason: `adapter failed: ${message}`,
      });
      continue;
    }
    out.retests += 1;

    if (input.dryRun) {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: result.cited ? "recovered" : "still_not_cited",
        reason: "dry run",
      });
      continue;
    }

    const prior = await getLatestCitation(r.practice_id, query, platform);
    const priorCompetitor = prior?.competitor_cited ?? null;
    await recordCitation({
      practice_id: r.practice_id,
      query,
      platform,
      result,
    });

    if (result.cited) {
      const rendered = await renderEntry({
        entryType: "citation_recovered",
        practiceName: practice.name,
        data: {
          kind: "citation_recovered",
          query,
          platform: adapter.label,
          priorCompetitor: priorCompetitor || undefined,
        },
      });
      const liveId = await writeLiveActivityEntry({
        practice_id: r.practice_id,
        entry_type: "citation_recovered",
        entry_data: {
          query,
          platform,
          source_la_id: r.la_id,
          prior_competitor: priorCompetitor,
        },
        doctor_facing_text: rendered.text,
        linked_signal_event_id: null,
        linked_state_transition_id: null,
      });
      out.recoveriesConfirmed += 1;
      out.perEntry.push({
        liveActivityId: liveId,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "recovered",
      });
    } else if (ageHours >= RECOVERY_GIVE_UP_DAYS * 24) {
      const rendered = await renderEntry({
        entryType: "watching_started",
        practiceName: practice.name,
        data: {
          kind: "watching_started",
          what: `${adapter.label} citation for "${query}"`,
          why: `the regeneration shipped ${RECOVERY_GIVE_UP_DAYS} days ago and the citation has not yet recovered`,
        },
      });
      const liveId = await writeLiveActivityEntry({
        practice_id: r.practice_id,
        entry_type: "watching_started",
        entry_data: {
          query,
          platform,
          source_la_id: r.la_id,
          phase: "post_recovery_watch",
        },
        doctor_facing_text: rendered.text,
        linked_signal_event_id: null,
        linked_state_transition_id: null,
      });
      out.watchingStarted += 1;
      out.perEntry.push({
        liveActivityId: liveId,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "watching_started",
      });
    } else {
      out.perEntry.push({
        liveActivityId: r.la_id,
        practiceId: r.practice_id,
        platform,
        query,
        outcome: "still_not_cited",
        reason: `re-test attempt at ${ageHours.toFixed(1)}h; will retry until day ${RECOVERY_GIVE_UP_DAYS}`,
      });
    }
  }

  return out;
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
