/**
 * Event ordering helpers for the leadgen funnel.
 *
 * `STAGE_ORDER` (from `LeadgenSessionModel`) is the source of truth for
 * ordinal comparisons. The controller never downgrades a session's
 * `final_stage` — it only advances when a later-ordinal event arrives.
 *
 * `abandoned` sits at ordinal 99 on purpose: it's a terminal flag, not a
 * position, so if an `abandoned` beacon arrives AFTER the session already
 * reached `results_viewed`, the session-level `completed` flag is used to
 * short-circuit the abandonment (see `shouldSetAbandoned`).
 */

import { STAGE_ORDER, FinalStage } from "../../../models/LeadgenSessionModel";

/**
 * Returns true when `incoming` is later in the funnel than `current`.
 * Used to decide whether to update `leadgen_sessions.final_stage`.
 */
export function isLaterStage(
  incoming: FinalStage,
  current: FinalStage
): boolean {
  return STAGE_ORDER[incoming] > STAGE_ORDER[current];
}

/**
 * Abandonment is only recorded when the session has not already completed
 * (reached `results_viewed`). This guards against the common false-positive
 * where a user who finishes the audit navigates away and fires a beforeunload
 * beacon — that beacon should NOT flip them to abandoned.
 */
export function shouldSetAbandoned(
  incoming: FinalStage,
  sessionCompleted: boolean
): boolean {
  return incoming === "abandoned" && sessionCompleted === false;
}
