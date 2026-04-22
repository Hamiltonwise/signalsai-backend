/**
 * Manifest v2 Card 6 (Sales Agent Brick 1) — Candidate Flagger.
 *
 * Subscribes (via direct invocation from prospectScanner and from the
 * checkup completion hook) to:
 *   - PROSPECT_IDENTIFIED        (cold scan path)
 *   - PROSPECT_SCORE_CHANGED     (rescan delta path)
 *   - CHECKUP_SCAN_COMPLETED     (warm self-serve path)
 *
 * Applies flagging rules from ICP Definition v1:
 *   1. composite Tri-Score <= vertical threshold (or global default)
 *   2. at least one recent Watcher signal matching the vertical's
 *      triggerSignals[] (within last 7 days)
 *
 * When a prospect is flagged: status -> 'flagged', flagged_at = now,
 * emit PROSPECT_FLAGGED_FOR_OUTREACH. Card 7 (pitch composer) will
 * subscribe to that event when it lands.
 *
 * Self-serve override: when the source is checkup_self_serve, the prospect
 * is flagged regardless of Tri-Score threshold and regardless of Watcher
 * signal presence. Intent signal beats score threshold.
 *
 * Feature flag: candidate_flagger_enabled (default false, instance-scoped).
 * Shadow mode: evaluates rules but does NOT promote status or emit
 * downstream event.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { isEnabled } from "../featureFlags";
import { loadIcpConfig } from "./icpConfig";
import type { Vertical, VerticalRule, WatcherSignalPattern } from "./icpConfig";
import {
  PROSPECT_FLAGGED_FOR_OUTREACH,
  PROSPECT_IDENTIFIED,
  CHECKUP_SCAN_COMPLETED,
} from "../../constants/eventTypes";
import type { TriScoreSnapshot } from "./prospectScanner";

const RECENT_SIGNAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type FlaggingSource = "watcher_scan" | "checkup_self_serve" | "referral" | "manual";

export interface FlaggerInputIdentified {
  prospectId: string;
  url: string;
  vertical: Vertical;
  triScore: TriScoreSnapshot;
  source: FlaggingSource;
}

export interface FlaggerInputScoreChanged {
  prospectId: string;
  url: string;
  vertical: Vertical;
  triScore: TriScoreSnapshot;
}

export interface FlaggerInputCheckupCompleted {
  url: string;
  vertical?: Vertical;
  location?: string;
  triScore?: TriScoreSnapshot;
  missingExamples?: unknown[];
}

export type FlaggerOutcome =
  | { result: "flagged"; prospectId: string; reason: string; mode: "live" | "shadow" }
  | { result: "skipped"; prospectId?: string; reason: string; mode: "live" | "shadow" };

// ── Rule evaluation ──────────────────────────────────────────────────

function meetsScoreThreshold(
  triScore: TriScoreSnapshot,
  rule: VerticalRule | undefined,
  globalThreshold: number
): boolean {
  if (triScore.composite == null) return false;
  const threshold = rule?.recognitionScoreThreshold ?? globalThreshold;
  return triScore.composite <= threshold;
}

async function hasRecentTriggerSignal(
  url: string,
  triggerSignals: WatcherSignalPattern[]
): Promise<boolean> {
  if (triggerSignals.length === 0) return false;

  // Watcher signals are scoped to client orgs, not prospects. For Card 6's
  // first brick, we treat the *prospect's* score regression itself as the
  // trigger signal of record. The link-up to live watcher_signals will
  // happen when prospect orgs are mirrored into a watch list (Card 7+).
  // For now: if `recognition_score_regression` is in triggerSignals, that
  // is satisfied implicitly by the SCORE_CHANGED path (caller controls).
  // Other signals require an explicit watcher_signals entry tagged with
  // this prospect URL via the data_json.prospect_url field.
  try {
    const cutoff = new Date(Date.now() - RECENT_SIGNAL_WINDOW_MS);
    const hasTable = await db.schema.hasTable("watcher_signals");
    if (!hasTable) return false;

    const row = await db("watcher_signals")
      .whereIn("signal_type", triggerSignals)
      .where("detected_at", ">=", cutoff)
      .whereRaw("data_json::text LIKE ?", [`%${url}%`])
      .first("id");
    return !!row;
  } catch {
    return false;
  }
}

// ── Promotion ────────────────────────────────────────────────────────

async function promoteToFlagged(
  prospectId: string,
  reason: string
): Promise<void> {
  await db("prospects")
    .where({ id: prospectId })
    .whereIn("status", ["candidate", "flagged"])
    .update({
      status: "flagged",
      flagged_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

  await BehavioralEventModel.create({
    event_type: PROSPECT_FLAGGED_FOR_OUTREACH,
    properties: {
      prospect_id: prospectId,
      reason,
    },
  }).catch(() => {});
}

// ── Public handlers ──────────────────────────────────────────────────

export async function runFlaggerOnIdentified(
  input: FlaggerInputIdentified
): Promise<FlaggerOutcome> {
  const flagOn = await isEnabled("candidate_flagger_enabled");
  const mode: "live" | "shadow" = flagOn ? "live" : "shadow";

  const { config } = await loadIcpConfig();
  const rule = config.verticals.find((v) => v.vertical === input.vertical);

  // Self-serve override: intent beats score
  if (input.source === "checkup_self_serve") {
    if (mode === "live") {
      await promoteToFlagged(input.prospectId, "checkup_self_serve_intent");
    }
    return {
      result: "flagged",
      prospectId: input.prospectId,
      reason: "checkup_self_serve_intent",
      mode,
    };
  }

  if (!meetsScoreThreshold(input.triScore, rule, config.recognitionScoreThreshold)) {
    return {
      result: "skipped",
      prospectId: input.prospectId,
      reason: "score_above_threshold",
      mode,
    };
  }

  const triggerSignals = rule?.triggerSignals ?? [];
  const signalPresent = await hasRecentTriggerSignal(input.url, triggerSignals);
  if (!signalPresent) {
    return {
      result: "skipped",
      prospectId: input.prospectId,
      reason: "no_recent_trigger_signal",
      mode,
    };
  }

  if (mode === "live") {
    await promoteToFlagged(input.prospectId, "score_and_signal_match");
  }
  return {
    result: "flagged",
    prospectId: input.prospectId,
    reason: "score_and_signal_match",
    mode,
  };
}

export async function runFlaggerOnScoreChanged(
  input: FlaggerInputScoreChanged
): Promise<FlaggerOutcome> {
  const flagOn = await isEnabled("candidate_flagger_enabled");
  const mode: "live" | "shadow" = flagOn ? "live" : "shadow";

  const { config } = await loadIcpConfig();
  const rule = config.verticals.find((v) => v.vertical === input.vertical);

  if (!meetsScoreThreshold(input.triScore, rule, config.recognitionScoreThreshold)) {
    return {
      result: "skipped",
      prospectId: input.prospectId,
      reason: "score_above_threshold",
      mode,
    };
  }

  // Score-changed path: the regression IS the trigger if the rule includes
  // recognition_score_regression. Otherwise we still require an external
  // signal to be present.
  const treatRegressionAsSignal =
    rule?.triggerSignals.includes("recognition_score_regression") ?? false;
  if (!treatRegressionAsSignal) {
    const signalPresent = await hasRecentTriggerSignal(
      input.url,
      rule?.triggerSignals ?? []
    );
    if (!signalPresent) {
      return {
        result: "skipped",
        prospectId: input.prospectId,
        reason: "no_recent_trigger_signal",
        mode,
      };
    }
  }

  if (mode === "live") {
    await promoteToFlagged(input.prospectId, "score_change_threshold_match");
  }
  return {
    result: "flagged",
    prospectId: input.prospectId,
    reason: "score_change_threshold_match",
    mode,
  };
}

/**
 * Self-serve path: a checkup completion event arrived for a URL that
 * may or may not already be in `prospects`. If absent, insert as
 * source=checkup_self_serve. Then flag for priority outreach.
 */
export async function runFlaggerOnCheckupCompleted(
  input: FlaggerInputCheckupCompleted
): Promise<FlaggerOutcome> {
  const flagOn = await isEnabled("candidate_flagger_enabled");
  const mode: "live" | "shadow" = flagOn ? "live" : "shadow";

  const { config } = await loadIcpConfig();

  // Vertical inference: if not provided, default to the first ICP vertical
  // (caller should pass it; this is a soft fallback so the bus message
  // isn't dropped on missing metadata).
  const vertical: Vertical =
    input.vertical ?? (config.verticals[0]?.vertical as Vertical);

  let prospectId: string;
  const existing = await db("prospects").where({ url: input.url }).first("id", "status");
  if (existing) {
    prospectId = existing.id;
  } else {
    if (mode === "live") {
      const triScoreJson = input.triScore
        ? JSON.stringify(input.triScore)
        : null;
      const [row] = await db("prospects")
        .insert({
          url: input.url,
          vertical,
          location: input.location ?? null,
          status: "candidate",
          recognition_tri_score: triScoreJson,
          missing_examples: JSON.stringify(input.missingExamples ?? []),
          identified_at: new Date(),
          last_scanned_at: new Date(),
          source: "checkup_self_serve",
        })
        .returning(["id"]);
      prospectId = row.id;

      await BehavioralEventModel.create({
        event_type: PROSPECT_IDENTIFIED,
        properties: {
          prospect_id: prospectId,
          url: input.url,
          vertical,
          location: input.location,
          tri_score: input.triScore ?? null,
          source: "checkup_self_serve",
        },
      }).catch(() => {});
    } else {
      // Shadow: synth a placeholder id so the outcome is reportable
      prospectId = `shadow-${input.url}`;
    }
  }

  if (mode === "live") {
    await promoteToFlagged(prospectId, "checkup_self_serve_intent");
  }
  return {
    result: "flagged",
    prospectId,
    reason: "checkup_self_serve_intent",
    mode,
  };
}

// ── Re-export for clarity ────────────────────────────────────────────

export const _eventNames = {
  PROSPECT_IDENTIFIED,
  CHECKUP_SCAN_COMPLETED,
  PROSPECT_FLAGGED_FOR_OUTREACH,
};
