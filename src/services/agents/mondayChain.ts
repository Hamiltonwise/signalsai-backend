/**
 * Monday Chain -- Phase 1 Orchestration
 *
 * Wires the full Monday delivery pipeline into a single
 * coordinated chain:
 *
 * 1. Score Recalc (with circuit breaker + abort handler)
 * 2. Read latest Competitive Scout data (already ran Tuesday)
 * 3. Intelligence Agent (with circuit breaker + abort handler)
 * 4. Go/No-Go poll
 * 5. If cleared: assemble and send Monday Email
 * 6. If held: log reason, create notification for Corey
 * 7. Return full trace for Morning Briefing
 *
 * This is the flight computer for Monday delivery.
 * Every step is guarded. Every failure has a fallback.
 * Every decision is logged.
 */

import { db } from "../../database/connection";
import { recalculateScore } from "../weeklyScoreRecalc";
import { runIntelligenceForOrg } from "./intelligenceAgent";
import { checkCircuit, recordSuccess, recordFailure } from "./circuitBreaker";
import { handleAgentFailure } from "./abortHandler";
import { pollForDelivery } from "./goNoGo";
import { sendMondayEmailForOrg } from "../../jobs/mondayEmail";

// ── Types ───────────────────────────────────────────────────────────

export interface MondayChainResult {
  success: boolean;
  emailSent: boolean;
  scoreUpdated: boolean;
  findingsGenerated: number;
  goNoGoResult: "cleared" | "held";
  aborts: string[];
  /** Full trace of each step for the Morning Briefing */
  trace: StepTrace[];
}

interface StepTrace {
  step: string;
  status: "success" | "fallback" | "skip" | "escalate" | "error";
  durationMs: number;
  detail: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function elapsed(start: number): number {
  return Date.now() - start;
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * Run the full Monday delivery chain for a single org.
 *
 * Each step is wrapped in circuit breaker checks and abort handlers.
 * The chain continues through failures using fallback data.
 * Only a Go/No-Go hold or a System Conductor escalation stops delivery.
 */
export async function runMondayChain(orgId: number): Promise<MondayChainResult> {
  const trace: StepTrace[] = [];
  const aborts: string[] = [];
  let scoreUpdated = false;
  let findingsGenerated = 0;
  let emailSent = false;
  let goNoGoResult: "cleared" | "held" = "held";

  console.log(`[MondayChain] Starting chain for org ${orgId}`);

  // ── Step 1: Score Recalc ──────────────────────────────────────────

  const step1Start = Date.now();
  const scoreCircuit = checkCircuit("score_recalc");

  if (!scoreCircuit.allowed) {
    trace.push({
      step: "score_recalc",
      status: "skip",
      durationMs: elapsed(step1Start),
      detail: `Circuit breaker blocked: ${scoreCircuit.reason}`,
    });
    aborts.push(`score_recalc: circuit open`);
  } else {
    try {
      const result = await recalculateScore(orgId);
      if (result) {
        recordSuccess("score_recalc");
        scoreUpdated = true;
        trace.push({
          step: "score_recalc",
          status: "success",
          durationMs: elapsed(step1Start),
          detail: `Score: ${result.previousScore} -> ${result.newScore} (delta: ${result.delta > 0 ? "+" : ""}${result.delta})`,
        });
      } else {
        recordSuccess("score_recalc");
        trace.push({
          step: "score_recalc",
          status: "success",
          durationMs: elapsed(step1Start),
          detail: "No score data to recalculate (new org or missing checkup data).",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      recordFailure("score_recalc", message);

      const abort = await handleAgentFailure("score_recalc", orgId, message);
      aborts.push(abort.message);

      trace.push({
        step: "score_recalc",
        status: abort.action === "fallback" ? "fallback" : "error",
        durationMs: elapsed(step1Start),
        detail: abort.message,
      });
    }
  }

  // ── Step 2: Read Competitive Scout data ───────────────────────────
  // The Competitive Scout runs on Wednesday. By Monday we just read
  // the latest behavioral_events for competitor movements.

  const step2Start = Date.now();
  let competitorMovements: number = 0;

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const movements = await db("behavioral_events")
      .where({ org_id: orgId })
      .where("event_type", "like", "competitor.%")
      .where("created_at", ">=", sevenDaysAgo)
      .count("id as count")
      .first();

    competitorMovements = Number(movements?.count ?? 0);

    trace.push({
      step: "competitive_scout_read",
      status: "success",
      durationMs: elapsed(step2Start),
      detail: `${competitorMovements} competitor movement(s) in last 7 days.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    const abort = await handleAgentFailure("competitive_scout", orgId, message);
    aborts.push(abort.message);

    trace.push({
      step: "competitive_scout_read",
      status: "skip",
      durationMs: elapsed(step2Start),
      detail: abort.message,
    });
  }

  // ── Step 3: Intelligence Agent ────────────────────────────────────

  const step3Start = Date.now();
  const intelCircuit = checkCircuit("intelligence_agent");

  if (!intelCircuit.allowed) {
    trace.push({
      step: "intelligence_agent",
      status: "skip",
      durationMs: elapsed(step3Start),
      detail: `Circuit breaker blocked: ${intelCircuit.reason}`,
    });
    aborts.push(`intelligence_agent: circuit open`);
  } else {
    try {
      const result = await runIntelligenceForOrg(orgId);
      if (result) {
        recordSuccess("intelligence_agent");
        findingsGenerated = result.findings.length;
        trace.push({
          step: "intelligence_agent",
          status: "success",
          durationMs: elapsed(step3Start),
          detail: `Generated ${result.findings.length} finding(s) for ${result.orgName}.`,
        });
      } else {
        recordSuccess("intelligence_agent");
        trace.push({
          step: "intelligence_agent",
          status: "success",
          durationMs: elapsed(step3Start),
          detail: "Intelligence agent returned null (blocked by orchestrator or no data).",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      recordFailure("intelligence_agent", message);

      const abort = await handleAgentFailure("intelligence_agent", orgId, message);
      aborts.push(abort.message);

      trace.push({
        step: "intelligence_agent",
        status: abort.action === "fallback" ? "fallback" : "error",
        durationMs: elapsed(step3Start),
        detail: abort.message,
      });
    }
  }

  // ── Step 4: Go/No-Go Poll ────────────────────────────────────────

  const step4Start = Date.now();
  let pollCleared = false;

  try {
    const poll = await pollForDelivery(orgId, "monday_email");
    pollCleared = poll.cleared;
    goNoGoResult = poll.cleared ? "cleared" : "held";

    const votesSummary = poll.votes
      .map((v) => `${v.agent}: ${v.vote}`)
      .join(", ");

    trace.push({
      step: "go_no_go",
      status: poll.cleared ? "success" : "skip",
      durationMs: elapsed(step4Start),
      detail: poll.cleared
        ? `All voters GO. Votes: ${votesSummary}`
        : `HELD by ${poll.heldBy}: ${poll.heldReason}. Votes: ${votesSummary}`,
    });

    if (!poll.cleared) {
      aborts.push(`go_no_go: held by ${poll.heldBy}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    goNoGoResult = "held";

    trace.push({
      step: "go_no_go",
      status: "error",
      durationMs: elapsed(step4Start),
      detail: `Go/No-Go poll threw: ${message}. Defaulting to HELD.`,
    });
    aborts.push(`go_no_go: error (${message})`);
  }

  // ── Step 5: Send Monday Email (or hold) ───────────────────────────

  const step5Start = Date.now();

  if (pollCleared) {
    try {
      const sent = await sendMondayEmailForOrg(orgId);
      emailSent = sent;

      if (sent) {
        trace.push({
          step: "monday_email",
          status: "success",
          durationMs: elapsed(step5Start),
          detail: "Email sent successfully.",
        });
      } else {
        trace.push({
          step: "monday_email",
          status: "skip",
          durationMs: elapsed(step5Start),
          detail: "Email service returned false (org may not be eligible or email failed).",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      const abort = await handleAgentFailure("monday_email", orgId, message);
      aborts.push(abort.message);

      trace.push({
        step: "monday_email",
        status: "error",
        durationMs: elapsed(step5Start),
        detail: abort.message,
      });
    }
  } else {
    // Held: create notification for Corey
    try {
      await db("dream_team_tasks").insert({
        title: `Monday email held for org ${orgId}`,
        description:
          `The Go/No-Go poll held the Monday email for org ${orgId}. ` +
          `Aborts: ${aborts.join("; ")}`,
        assigned_to: "corey",
        status: "open",
        priority: "low",
        org_id: orgId,
        metadata: JSON.stringify({
          source: "monday_chain",
          go_no_go_result: "held",
          aborts,
          timestamp: new Date().toISOString(),
        }),
        created_at: new Date(),
        updated_at: new Date(),
      });
    } catch {
      // Best effort notification
    }

    trace.push({
      step: "monday_email",
      status: "skip",
      durationMs: elapsed(step5Start),
      detail: `Email held. Go/No-Go result: ${goNoGoResult}. Notification created for Corey.`,
    });
  }

  // ── Step 6: Log full trace ────────────────────────────────────────

  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "monday_chain.complete",
      org_id: orgId,
      properties: JSON.stringify({
        success: emailSent,
        email_sent: emailSent,
        score_updated: scoreUpdated,
        findings_generated: findingsGenerated,
        go_no_go_result: goNoGoResult,
        competitor_movements: competitorMovements,
        aborts,
        trace: trace.map((t) => ({
          step: t.step,
          status: t.status,
          duration_ms: t.durationMs,
          detail: t.detail,
        })),
      }),
      created_at: new Date(),
    });
  } catch (logErr: unknown) {
    const message = logErr instanceof Error ? logErr.message : String(logErr);
    console.error(`[MondayChain] Failed to log chain trace for org ${orgId}:`, message);
  }

  console.log(
    `[MondayChain] Complete for org ${orgId}: email=${emailSent}, score=${scoreUpdated}, findings=${findingsGenerated}, goNoGo=${goNoGoResult}, aborts=${aborts.length}`,
  );

  return {
    success: emailSent,
    emailSent,
    scoreUpdated,
    findingsGenerated,
    goNoGoResult,
    aborts,
    trace,
  };
}
