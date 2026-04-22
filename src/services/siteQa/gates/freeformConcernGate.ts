/**
 * Freeform Concern Gate.
 *
 * Runtime gate that calls the Standard Rubric in 'runtime' mode. This is the
 * final pass for any agent output that has cleared deterministic gates —
 * siteQa for PatientPath copy, narratorService for owner-facing events, and
 * the Card 4 Reveal email/postcard composers.
 *
 * Behavioral contract:
 *   1. Score content against The Standard.
 *   2. If composite >= threshold (default 80): pass. Retry count = 0.
 *   3. If composite < threshold: surface failing dimensions to the caller so
 *      it can rebuild with the repair instructions injected into its system
 *      prompt. Up to MAX_RETRIES attempts.
 *   4. After MAX_RETRIES exhausted: escalate as a dream_team_task of type
 *      freeform_concern_gate_failed and return blocked=true.
 *
 * Feature flag: freeform_concern_gate_enabled. Default false.
 * Enforcement order: when the flag is off, the gate runs in shadow — it scores
 * the output and archives the score to behavioral_events, but never blocks.
 * This lets us watch the signal before turning it into a hard block.
 */

import { score } from "../../rubric/standardRubric";
import type { RepairInstruction, ScoreResult } from "../../rubric/types";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { db } from "../../../database/connection";
import { isFreeformConcernGateEnabled } from "../../rubric/gateFlag";

export const FREEFORM_CONCERN_GATE_MAX_RETRIES = 3;
export const FREEFORM_CONCERN_GATE_THRESHOLD = 80;

export interface FreeformConcernGateInput {
  content: string;
  orgId?: number;
  surface: "siteQa" | "narrator" | "revealEmail" | "revealLob";
  attempt?: number;
  metadata?: {
    practice?: string;
    specialty?: string;
    location?: string;
    url?: string;
    patientReviewText?: string[];
  };
}

export interface FreeformConcernGateResult {
  /** true when the content cleared the threshold. */
  passed: boolean;
  /** true when the gate blocked the output (flag on + below threshold + attempts exhausted). */
  blocked: boolean;
  /** true when the gate ran in shadow (flag off). */
  shadow: boolean;
  /** raw rubric score. */
  score: ScoreResult;
  /** repair instructions the caller can inject into a retry prompt. */
  repairInstructions: RepairInstruction[];
  /** Dimensions that scored below 50% of their max — the highest-leverage fixes. */
  failingDimensions: Array<{ key: string; score: number; max: number; reasoning: string }>;
  /** When retries exhaust, caller should create a dream_team_task; payload included here. */
  escalation?: {
    taskType: "freeform_concern_gate_failed";
    title: string;
    description: string;
  };
}

/**
 * Run the freeform concern gate. Feature flag consults organizations
 * table per the existing pattern; a missing orgId (e.g. in tests) falls back
 * to env var FREEFORM_CONCERN_GATE_ENABLED.
 *
 * When the flag is off AND FREEFORM_CONCERN_GATE_SHADOW_OBSERVE is not set,
 * the gate short-circuits without calling the judge. This keeps the default
 * cost at zero (no Anthropic call on every output), while still allowing
 * opt-in shadow observability for rollout decisions.
 */
export async function runFreeformConcernGate(
  input: FreeformConcernGateInput
): Promise<FreeformConcernGateResult> {
  const enabled = await isFreeformConcernGateEnabled(input.orgId);
  const shadowObserve =
    process.env.FREEFORM_CONCERN_GATE_SHADOW_OBSERVE === "true" ||
    process.env.FREEFORM_CONCERN_GATE_SHADOW_OBSERVE === "1";
  const attempt = input.attempt ?? 1;

  if (!enabled && !shadowObserve) {
    return buildSkippedResult(input, attempt);
  }

  const result = await score(input.content, {
    mode: "runtime",
    metadata: input.metadata,
  });

  const passed = result.composite >= FREEFORM_CONCERN_GATE_THRESHOLD;
  const failingDimensions = Object.entries(result.dimensions)
    .filter(([, d]) => d.verdict === "scored" || d.verdict === "fail_gate")
    .filter(([, d]) => d.max > 0 && d.score < d.max * 0.5)
    .map(([key, d]) => ({
      key,
      score: d.score,
      max: d.max,
      reasoning: d.reasoning,
    }))
    .sort((a, b) => (a.score / a.max) - (b.score / b.max));

  const shadow = !enabled;
  const attemptsExhausted = attempt >= FREEFORM_CONCERN_GATE_MAX_RETRIES;
  const blocked = !shadow && !passed && attemptsExhausted;

  // Archive every run to behavioral_events so we can watch the signal in
  // shadow mode before flipping the flag on.
  await BehavioralEventModel.create({
    event_type: passed
      ? "freeform_concern_gate.passed"
      : blocked
      ? "freeform_concern_gate.blocked"
      : "freeform_concern_gate.retry",
    org_id: input.orgId ?? null,
    properties: {
      surface: input.surface,
      mode: shadow ? "shadow" : "live",
      composite: result.composite,
      attempt,
      threshold: FREEFORM_CONCERN_GATE_THRESHOLD,
      rubric_version_id: result.rubric_version_id,
      failing_dimensions: failingDimensions.map((d) => d.key),
    },
  }).catch(() => {});

  let escalation: FreeformConcernGateResult["escalation"];
  if (blocked) {
    escalation = {
      taskType: "freeform_concern_gate_failed",
      title: `Freeform Concern Gate blocked ${input.surface} (composite ${result.composite} after ${attempt} attempts)`,
      description:
        `Surface: ${input.surface}\n` +
        `Org: ${input.orgId ?? "unknown"}\n` +
        `Composite: ${result.composite} / threshold ${FREEFORM_CONCERN_GATE_THRESHOLD}\n` +
        `Rubric version: ${result.rubric_version_id}\n\n` +
        `Failing dimensions:\n${failingDimensions
          .map((d) => `- ${d.key} (${d.score}/${d.max}): ${d.reasoning}`)
          .join("\n")}\n\n` +
        `Repair instructions:\n${result.repair_instructions
          .map((r) => `- ${r.dimension}: ${r.instruction}`)
          .join("\n")}\n\n` +
        `Raw content (truncated):\n${input.content.slice(0, 1200)}`,
    };
    await createDreamTeamTask(escalation).catch(() => {});
  }

  return {
    passed,
    blocked,
    shadow,
    score: result,
    repairInstructions: result.repair_instructions,
    failingDimensions,
    escalation,
  };
}

function buildSkippedResult(
  _input: FreeformConcernGateInput,
  _attempt: number
): FreeformConcernGateResult {
  // Skipped: flag off and no SHADOW_OBSERVE. Return "passed=true, shadow=true"
  // so the caller treats this as a no-op that lets content through.
  return {
    passed: true,
    blocked: false,
    shadow: true,
    score: {
      composite: 0,
      dimensions: {},
      repair_instructions: [],
      rubric_version_id: "skipped-flag-off",
      mode: "runtime",
      judge_model: "skipped",
      loaded_from: "fallback",
      scored_at: new Date().toISOString(),
    },
    repairInstructions: [],
    failingDimensions: [],
  };
}

async function createDreamTeamTask(
  escalation: NonNullable<FreeformConcernGateResult["escalation"]>
): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      owner_name: "freeform_concern_gate",
      title: escalation.title,
      description: escalation.description,
      status: "open",
      priority: "high",
      source_type: escalation.taskType,
    });
  } catch {
    // dream_team_tasks columns vary across sandbox/prod; soft-fail.
  }
}

/**
 * Convenience wrapper for callers that want a single "gate-and-retry"
 * interaction. Caller provides a regenerate() function that rebuilds the
 * content given repair instructions, and the gate will loop until pass or
 * until MAX_RETRIES is exhausted. Only active when the flag is on —
 * shadow mode returns after one call with the same semantics.
 */
export async function runFreeformConcernGateWithRetry(
  initial: FreeformConcernGateInput,
  regenerate: (repair: RepairInstruction[]) => Promise<string>
): Promise<FreeformConcernGateResult> {
  let attempt = 0;
  let input: FreeformConcernGateInput = { ...initial, attempt: 1 };
  let result = await runFreeformConcernGate(input);
  if (result.shadow || result.passed) return result;

  while (attempt < FREEFORM_CONCERN_GATE_MAX_RETRIES - 1 && !result.passed) {
    attempt += 1;
    const nextContent = await regenerate(result.repairInstructions);
    input = { ...initial, content: nextContent, attempt: attempt + 1 };
    result = await runFreeformConcernGate(input);
    if (result.passed) return result;
  }
  return result;
}
