/**
 * Trigger Router (Continuous Answer Engine Loop, Phase 1).
 *
 * Polls signal_events every 5 minutes for processed=false rows. For each
 * event:
 *   1. Compute idempotency hash from (practice_id + signal_type + canonical
 *      signal_data). Skip if same hash was processed in the last 6 hours.
 *   2. Resolve the routing decision per signal_type per the architecture
 *      spec (Component 2).
 *   3. Phase 1 routing is non-destructive: log the decision to the
 *      State Transition Log via stateTransitions.transitionCard with
 *      Actor=BridgeTranslator. Phase 2+ wires the actual Research Agent
 *      / Copy Agent invocation.
 *   4. Mark the event processed=true with processed_at timestamp.
 *   5. Write a live_activity_entries row of type 'signal_received' so
 *      the doctor sees the signal in their feed (Phase 1 dashboard does
 *      not yet read this — Phase 4 wires the UI).
 *
 * The State Transition Log is the cross-database audit trail. Phase 1
 * writes per-event entries WITHOUT requiring a Sandbox Card Inbox row
 * (cards are a Phase 2+ concept for regenerated artifacts). The actual
 * Notion write is best-effort: a network failure logs and proceeds.
 */

import { createHash } from "crypto";
import { db } from "../../database/connection";
import { writeLiveActivityEntry } from "./liveActivity";
import { runRegeneration, modeForSignalType } from "./regenerationModes";
import { isEnabled } from "../featureFlags";
import { composePerQueryReceipt } from "./perQueryReceipts";
import type { Severity, SignalType, TriggerRouterRunResult } from "./types";

// ── Routing matrix (architecture spec AR-009, Component 2) ─────────

export interface RouteDecision {
  /** Phase-2 destination agent (logged to State Transition Log; not invoked in Phase 1). */
  routedTo:
    | "research_agent.regeneration"
    | "research_agent.competitive_recalibration"
    | "research_agent.aeo_recovery"
    | "copy_agent.testimonial_integration"
    | "gbp_agent.content_sync";
  reason: string;
}

export function decideRoute(signalType: SignalType): RouteDecision {
  switch (signalType) {
    case "gsc_rank_delta":
    case "gsc_new_query":
    case "gsc_impression_spike":
      return {
        routedTo: "research_agent.regeneration",
        reason:
          "GSC delta or new query — Phase 2 invokes Research Agent in regeneration mode to integrate query into research_brief.",
      };
    case "competitor_top10":
      return {
        routedTo: "research_agent.competitive_recalibration",
        reason:
          "Competitor moved into top 10 — Phase 2 invokes Research Agent to rebuild contrast_brief.",
      };
    case "aeo_citation_lost":
    case "aeo_citation_competitor":
    case "aeo_citation_new":
      return {
        routedTo: "research_agent.aeo_recovery",
        reason:
          "AEO citation change — Phase 2 invokes Research Agent in AEO_recovery mode to identify gap and propose FAQ + schema fix.",
      };
    case "gbp_review_new":
      return {
        routedTo: "copy_agent.testimonial_integration",
        reason:
          "New review — Phase 2 invokes Copy Agent in testimonial_integration mode to fit review into existing fear_category.",
      };
    case "gbp_rating_shift":
      return {
        routedTo: "gbp_agent.content_sync",
        reason:
          "GBP rating shift — Phase 2 invokes GBP Agent to sync content and surface the trend on the doctor's dashboard.",
      };
  }
}

// ── Idempotency ─────────────────────────────────────────────────────

export const IDEMPOTENCY_WINDOW_HOURS = 6;

/**
 * Canonicalize a signal_data object so that key order does not affect
 * the idempotency hash.
 */
export function canonicalizeSignalData(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (typeof data !== "object") return JSON.stringify(data);
  if (Array.isArray(data)) return `[${data.map(canonicalizeSignalData).join(",")}]`;
  const keys = Object.keys(data as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalizeSignalData((data as Record<string, unknown>)[k])}`,
  );
  return `{${parts.join(",")}}`;
}

export function computeSignalHash(
  practiceId: number,
  signalType: SignalType,
  signalData: unknown,
): string {
  const canonical = `${practiceId}|${signalType}|${canonicalizeSignalData(signalData)}`;
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Check whether the same idempotency hash has already been processed
 * within the last IDEMPOTENCY_WINDOW_HOURS. Returns true if the event is
 * a duplicate and should be skipped.
 *
 * Implementation: rather than maintaining a separate hash store, we
 * recompute hashes from recent processed rows. signal_events volume is
 * low enough in Phase 1 that this is acceptable. A signal_hash column
 * can be added later as an optimization.
 */
export async function isDuplicate(
  practiceId: number,
  signalType: SignalType,
  signalData: unknown,
  ignoreEventId?: string,
): Promise<boolean> {
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_HOURS * 3600 * 1000);
  const target = computeSignalHash(practiceId, signalType, signalData);

  const rows = await db("signal_events")
    .select("id", "signal_data")
    .where("practice_id", practiceId)
    .andWhere("signal_type", signalType)
    .andWhere("processed", true)
    .andWhere("processed_at", ">=", since);

  for (const r of rows as Array<{ id: string; signal_data: unknown }>) {
    if (ignoreEventId && r.id === ignoreEventId) continue;
    let parsed: unknown = r.signal_data;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // ignore parse failure; treat as non-match
      }
    }
    const otherHash = computeSignalHash(practiceId, signalType, parsed);
    if (otherHash === target) return true;
  }
  return false;
}

// ── State Transition Log writer (best-effort) ───────────────────────

/**
 * Write a row to the State Transition Log keyed on the signal event id.
 * Best-effort: failure logs and proceeds.
 *
 * Importing transitionCard at module top would couple this hot-path to
 * the Notion-stack. We require it lazily so unit tests do not load the
 * Notion writer (which would try to read NOTION_TOKEN at import time).
 */
async function logRoutedEventToStateTransition(input: {
  signalEventId: string;
  practiceId: number;
  signalType: SignalType;
  decision: RouteDecision;
  reason: string;
}): Promise<string | null> {
  if (process.env.ANSWER_ENGINE_DISABLE_NOTION === "true") return null;

  try {
    const mod = await import("../blackboard/stateTransitions");
    const cardId = `signal-${input.signalEventId}`;
    // Phase 1 does not have a card row for signal events. We use the
    // Initial fromStateOverride and target a synthetic toState that the
    // state machine accepts. The intent is auditability, not full card
    // lifecycle. Card row writers can backfill cards later if needed.
    const result = await mod.transitionCard({
      cardId,
      toState: "New",
      fromStateOverride: "Initial",
      actor: "BridgeTranslator",
      reason: `Routed signal_type=${input.signalType} for practice ${input.practiceId} -> ${input.decision.routedTo}. ${input.decision.reason}`,
      linkedArtifacts: [`signal_event:${input.signalEventId}`],
    });
    return result.transitionLogId || null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[TriggerRouter] State Transition Log write failed for signal ${input.signalEventId}: ${message}`,
    );
    return null;
  }
}

// ── Live activity writer (best-effort) ──────────────────────────────

async function writeSignalReceivedEntry(input: {
  signalEventId: string;
  practiceId: number;
  signalType: SignalType;
  signalData: Record<string, unknown>;
  severity: Severity;
  decision: RouteDecision;
}): Promise<string | null> {
  try {
    // Card 7 — read action_log + signal timestamp from the originating
    // signal_event row, then compose the per-query receipt fields.
    let actionLog: Record<string, unknown> | Array<Record<string, unknown>> | null =
      null;
    let signalTimestamp: Date | undefined;
    try {
      const sig = await db("signal_events")
        .where({ id: input.signalEventId })
        .first("action_log", "created_at");
      if (sig) {
        actionLog =
          typeof sig.action_log === "string"
            ? JSON.parse(sig.action_log)
            : (sig.action_log ?? null);
        if (sig.created_at)
          signalTimestamp = new Date(sig.created_at as string);
      }
    } catch {
      /* tolerate older rows without action_log */
    }

    const receipt = await composePerQueryReceipt({
      practiceId: input.practiceId,
      signalType: input.signalType,
      signalData: input.signalData,
      signalTimestamp,
      actionLog,
      routedTo: input.decision.routedTo,
    });

    const id = await writeLiveActivityEntry({
      practice_id: input.practiceId,
      entry_type: "signal_received",
      entry_data: {
        signal_type: input.signalType,
        signal_data: input.signalData,
        routed_to: input.decision.routedTo,
        severity: input.severity,
      },
      doctor_facing_text: composeDoctorFacingText(input),
      linked_signal_event_id: input.signalEventId,
      linked_state_transition_id: null,
      patient_question: receipt.patientQuestion,
      visibility_snapshot: receipt.visibilitySnapshot,
      action_taken: receipt.actionTaken,
    });
    return id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[TriggerRouter] live_activity_entries write failed for signal ${input.signalEventId}: ${message}`,
    );
    return null;
  }
}

/**
 * Phase 1 writes a deterministic doctor-facing sentence per signal type.
 * Phase 4 swaps this with the Haiku-generated voice-validated text.
 */
function composeDoctorFacingText(input: {
  signalType: SignalType;
  signalData: Record<string, unknown>;
}): string {
  const q = (input.signalData.query as string | undefined) ?? "";
  switch (input.signalType) {
    case "gsc_rank_delta": {
      const before = input.signalData.rankBefore as number | undefined;
      const after = input.signalData.rankAfter as number | undefined;
      const delta = input.signalData.rankDelta as number | undefined;
      const direction = (delta ?? 0) < 0 ? "moved up" : "dropped";
      return `Search rank for "${q}" ${direction} from ${before} to ${after}. Alloro is watching.`;
    }
    case "gsc_impression_spike": {
      const before = input.signalData.impressionsBefore as number | undefined;
      const after = input.signalData.impressionsAfter as number | undefined;
      const pct = input.signalData.impressionPct as number | undefined;
      const direction = (pct ?? 0) > 0 ? "spiked" : "dropped";
      return `Impressions for "${q}" ${direction} ${Math.abs(pct ?? 0).toFixed(0)}% (${before} to ${after}). Alloro is watching.`;
    }
    case "gsc_new_query": {
      const after = input.signalData.impressionsAfter as number | undefined;
      return `New patient search appeared: "${q}" with ${after} impressions this week. Alloro is watching for next week's response.`;
    }
    case "aeo_citation_lost":
      return `An AI engine stopped citing your practice for "${q}". Alloro is watching.`;
    case "aeo_citation_new":
      return `An AI engine started citing your practice for "${q}". Alloro is watching for sustained presence.`;
    case "aeo_citation_competitor":
      return `A competitor took the AI citation for "${q}". Alloro is watching.`;
    case "competitor_top10":
      return `A new competitor moved into the top 10 for a query you rank for. Alloro is watching.`;
    case "gbp_review_new":
      return `A new Google review came in. Alloro is watching for fit with your existing testimonial themes.`;
    case "gbp_rating_shift":
      return `Your Google rating shifted. Alloro is watching the trend.`;
  }
}

// ── Run entry point ─────────────────────────────────────────────────

export interface RunTriggerRouterInput {
  /** Limit per run (avoid runaway batches). Default 100. */
  maxBatch?: number;
  /** Skip the Notion State Transition Log write (test mode). */
  skipNotionWrite?: boolean;
  /** Skip the live_activity_entries write (test mode). */
  skipLiveActivityWrite?: boolean;
  /**
   * Phase 2: when true, invoke the regeneration pipeline (Research +
   * Copy + Reviewer Claude) for each routed event. Default false in
   * Phase 1 callers; the cron worker reads the
   * `answer_engine_regeneration` feature flag to decide. Setting this
   * explicitly bypasses the flag for tests.
   */
  invokeRegeneration?: boolean;
}

export async function runTriggerRouter(
  input: RunTriggerRouterInput = {},
): Promise<TriggerRouterRunResult> {
  const max = input.maxBatch ?? 100;
  const events = await db("signal_events")
    .select(
      "id",
      "practice_id",
      "signal_type",
      "signal_data",
      "severity",
      "recommended_action",
    )
    .where("processed", false)
    .orderBy("created_at", "asc")
    .limit(max);

  const out: TriggerRouterRunResult = {
    eventsConsidered: events.length,
    eventsRouted: 0,
    eventsSkippedIdempotent: 0,
    eventsFailed: 0,
  };

  for (const e of events as Array<{
    id: string;
    practice_id: number;
    signal_type: SignalType;
    signal_data: unknown;
    severity: Severity;
    recommended_action: string | null;
  }>) {
    try {
      let parsed: Record<string, unknown> = {};
      if (typeof e.signal_data === "string") {
        try {
          parsed = JSON.parse(e.signal_data) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      } else if (e.signal_data && typeof e.signal_data === "object") {
        parsed = e.signal_data as Record<string, unknown>;
      }

      const dup = await isDuplicate(e.practice_id, e.signal_type, parsed, e.id);
      if (dup) {
        // Mark processed so we don't re-evaluate next tick.
        await db("signal_events")
          .where({ id: e.id })
          .update({ processed: true, processed_at: new Date() });
        out.eventsSkippedIdempotent += 1;
        continue;
      }

      const decision = decideRoute(e.signal_type);

      if (!input.skipNotionWrite) {
        await logRoutedEventToStateTransition({
          signalEventId: e.id,
          practiceId: e.practice_id,
          signalType: e.signal_type,
          decision,
          reason: e.recommended_action ?? decision.reason,
        });
      }

      if (!input.skipLiveActivityWrite) {
        await writeSignalReceivedEntry({
          signalEventId: e.id,
          practiceId: e.practice_id,
          signalType: e.signal_type,
          signalData: parsed,
          severity: e.severity,
          decision,
        });
      }

      // Phase 2: run regeneration pipeline if enabled. The flag check is
      // per-practice so we can roll out gradually. The explicit
      // `invokeRegeneration` flag bypasses the flag check for tests.
      const shouldRegenerate =
        input.invokeRegeneration === true ||
        (input.invokeRegeneration !== false &&
          modeForSignalType(e.signal_type) !== null &&
          (await isEnabled("answer_engine_regeneration", e.practice_id)));

      if (shouldRegenerate) {
        try {
          const regen = await runRegeneration({
            signalEventId: e.id,
            practiceId: e.practice_id,
            signalType: e.signal_type,
            signalData: parsed,
          });
          console.log(
            `[TriggerRouter] regeneration ${regen.mode} for practice ${e.practice_id}: ${regen.verdict} (${regen.liveActivityEntryIds.length} entries)`,
          );
        } catch (regenErr: unknown) {
          const message =
            regenErr instanceof Error ? regenErr.message : String(regenErr);
          console.error(
            `[TriggerRouter] regeneration failed for signal_event ${e.id}: ${message}`,
          );
          // Failure does not abort the routing; the signal_received entry
          // still landed and the signal is marked processed below.
        }
      }

      await db("signal_events")
        .where({ id: e.id })
        .update({ processed: true, processed_at: new Date() });
      out.eventsRouted += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[TriggerRouter] failed to route signal_event ${e.id}: ${message}`,
      );
      out.eventsFailed += 1;
    }
  }

  return out;
}
