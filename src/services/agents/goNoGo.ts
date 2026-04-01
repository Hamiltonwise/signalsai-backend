/**
 * Go/No-Go Polling -- Agent Orchestration Infrastructure
 *
 * Before any delivery (Monday email, notification, alert) ships
 * to a client, the Go/No-Go poll runs. Each relevant agent votes
 * GO or NO_GO. One NO_GO holds the entire delivery.
 *
 * This is the last gate before a client sees anything.
 * Client safety gates all. No exceptions.
 */

import { db } from "../../database/connection";
import { checkSafety } from "./safetyAgent";
import { orchestratorCheck } from "./orchestrator";

// ── Types ───────────────────────────────────────────────────────────

export type DeliveryType = "monday_email" | "notification" | "alert";

export interface PollResult {
  agent: string;
  vote: "GO" | "NO_GO";
  reason?: string;
  timestamp: Date;
}

export interface GoNoGoResult {
  cleared: boolean;
  votes: PollResult[];
  heldBy?: string;
  heldReason?: string;
}

// ── Poll functions (one per voting agent) ───────────────────────────

/**
 * Intelligence Agent vote: are findings ready for this org?
 * Checks behavioral_events for recent intelligence findings (48h window).
 */
async function pollIntelligence(orgId: number): Promise<PollResult> {
  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  try {
    const findings = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "intelligence.finding" })
      .where("created_at", ">=", fortyEightHoursAgo)
      .count("id as count")
      .first();

    const count = Number(findings?.count ?? 0);

    if (count > 0) {
      return {
        agent: "intelligence_agent",
        vote: "GO",
        reason: `${count} finding(s) ready within 48h window.`,
        timestamp: new Date(),
      };
    }

    // No findings is not necessarily a blocker. The Monday email
    // can fall back to snapshot data. Vote GO with a note.
    return {
      agent: "intelligence_agent",
      vote: "GO",
      reason: "No recent findings, email will use snapshot fallback.",
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      agent: "intelligence_agent",
      vote: "NO_GO",
      reason: `Failed to check findings: ${message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Score Recalc vote: has the score been updated recently?
 * Checks organizations.score_updated_at within a 48h window.
 */
async function pollScoreRecalc(orgId: number): Promise<PollResult> {
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("score_updated_at", "current_clarity_score", "checkup_score")
      .first();

    if (!org) {
      return {
        agent: "score_recalc",
        vote: "NO_GO",
        reason: `Org ${orgId} not found.`,
        timestamp: new Date(),
      };
    }

    // If org has no score at all, that's fine for first-week emails
    if (!org.current_clarity_score && !org.checkup_score) {
      return {
        agent: "score_recalc",
        vote: "GO",
        reason: "No score computed yet (first-week org).",
        timestamp: new Date(),
      };
    }

    if (org.score_updated_at) {
      const updatedAt = new Date(org.score_updated_at);
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      if (updatedAt >= fortyEightHoursAgo) {
        return {
          agent: "score_recalc",
          vote: "GO",
          reason: `Score updated ${Math.round((Date.now() - updatedAt.getTime()) / 3600000)}h ago.`,
          timestamp: new Date(),
        };
      }

      return {
        agent: "score_recalc",
        vote: "GO",
        reason: "Score is stale (>48h) but a previous score exists. Email will note 'score updating'.",
        timestamp: new Date(),
      };
    }

    return {
      agent: "score_recalc",
      vote: "GO",
      reason: "No score_updated_at but score exists. Proceeding with existing score.",
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      agent: "score_recalc",
      vote: "NO_GO",
      reason: `Failed to check score: ${message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Safety Agent vote: is the content safe to send?
 * Runs PII/compliance check on assembled email content.
 */
async function pollSafety(
  orgId: number,
  content?: string,
): Promise<PollResult> {
  try {
    if (!content) {
      return {
        agent: "safety_agent",
        vote: "GO",
        reason: "No content provided for safety check (pre-assembly poll).",
        timestamp: new Date(),
      };
    }

    const result = await checkSafety({
      text: content,
      context: "client-facing",
      orgId,
    });

    if (result.safe) {
      return {
        agent: "safety_agent",
        vote: "GO",
        reason: "Content passed all safety checks.",
        timestamp: new Date(),
      };
    }

    return {
      agent: "safety_agent",
      vote: "NO_GO",
      reason: `Safety flags: ${result.flags.join("; ")}. Blast radius: ${result.blastRadius}.`,
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      agent: "safety_agent",
      vote: "NO_GO",
      reason: `Safety check failed: ${message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Orchestrator vote: is the rate limit OK?
 * Checks 3/day limit via the existing orchestrator.
 */
async function pollOrchestrator(orgId: number): Promise<PollResult> {
  try {
    const result = await orchestratorCheck({
      agentName: "monday_email",
      orgId,
      actionType: "email_queued",
    });

    if (result.allowed) {
      return {
        agent: "orchestrator",
        vote: "GO",
        reason: result.reason ?? "Rate limit OK.",
        timestamp: new Date(),
      };
    }

    return {
      agent: "orchestrator",
      vote: "NO_GO",
      reason: result.reason ?? "Rate limit exceeded.",
      timestamp: new Date(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      agent: "orchestrator",
      vote: "NO_GO",
      reason: `Orchestrator check failed: ${message}`,
      timestamp: new Date(),
    };
  }
}

// ── Delivery type -> voters mapping ─────────────────────────────────

type VoterFn = (orgId: number, content?: string) => Promise<PollResult>;

const DELIVERY_VOTERS: Record<DeliveryType, VoterFn[]> = {
  monday_email: [pollIntelligence, pollScoreRecalc, pollSafety, pollOrchestrator],
  notification: [pollSafety, pollOrchestrator],
  alert: [pollSafety],
};

// ── Main export ─────────────────────────────────────────────────────

/**
 * Poll all relevant agents for a delivery decision.
 *
 * All GO -> delivery proceeds.
 * One NO_GO -> delivery held, logged, Morning Briefing notified.
 *
 * @param orgId - The organization receiving the delivery
 * @param deliveryType - What kind of delivery this is
 * @param content - Optional: assembled content for safety checking
 */
export async function pollForDelivery(
  orgId: number,
  deliveryType: DeliveryType,
  content?: string,
): Promise<GoNoGoResult> {
  const voters = DELIVERY_VOTERS[deliveryType] ?? [pollSafety];
  const votes: PollResult[] = [];

  // Run all polls in parallel
  const results = await Promise.allSettled(
    voters.map((fn) => fn(orgId, content)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      votes.push(result.value);
    } else {
      // Promise rejection counts as NO_GO
      votes.push({
        agent: "unknown",
        vote: "NO_GO",
        reason: `Poll threw: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        timestamp: new Date(),
      });
    }
  }

  // Check for any NO_GO
  const noGoVote = votes.find((v) => v.vote === "NO_GO");

  if (noGoVote) {
    // Log the hold
    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "go_no_go.held",
        org_id: orgId,
        properties: JSON.stringify({
          delivery_type: deliveryType,
          held_by: noGoVote.agent,
          held_reason: noGoVote.reason,
          votes: votes.map((v) => ({
            agent: v.agent,
            vote: v.vote,
            reason: v.reason,
          })),
        }),
        created_at: new Date(),
      });
    } catch (logErr: unknown) {
      const message = logErr instanceof Error ? logErr.message : String(logErr);
      console.error(`[GoNoGo] Failed to log hold for org ${orgId}:`, message);
    }

    console.log(
      `[GoNoGo] HELD: ${deliveryType} for org ${orgId}. Held by ${noGoVote.agent}: ${noGoVote.reason}`,
    );

    return {
      cleared: false,
      votes,
      heldBy: noGoVote.agent,
      heldReason: noGoVote.reason,
    };
  }

  // All GO: log the clearance
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "go_no_go.cleared",
      org_id: orgId,
      properties: JSON.stringify({
        delivery_type: deliveryType,
        votes: votes.map((v) => ({
          agent: v.agent,
          vote: v.vote,
          reason: v.reason,
        })),
      }),
      created_at: new Date(),
    });
  } catch (logErr: unknown) {
    const message = logErr instanceof Error ? logErr.message : String(logErr);
    console.error(`[GoNoGo] Failed to log clearance for org ${orgId}:`, message);
  }

  console.log(
    `[GoNoGo] CLEARED: ${deliveryType} for org ${orgId}. ${votes.length}/${votes.length} GO.`,
  );

  return { cleared: true, votes };
}
