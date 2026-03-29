/**
 * Orchestrator Agent -- Execution Service
 *
 * Prevents agent pile-ups by coordinating actions across all agents.
 * Every agent calls orchestratorCheck() before taking an action.
 *
 * Five rules, checked in order:
 * 1. Rate limit: max 3 agent actions per org per 24h
 * 2. Dedup: same agent + org + actionType in last 24h = block
 * 3. Monday independence: on Mondays, only monday_email acts
 * 4. Task dedup: open dream_team_task with same title = block
 * 5. Cool-down: notification in last 4 hours = suggest delay
 *
 * All decisions log to behavioral_events.
 * No client communication. No data mutations except logging.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

export interface OrchestratorInput {
  agentName: string;
  orgId: number;
  actionType: string;
  /** Optional: used for task dedup (Rule 4) */
  taskTitle?: string;
}

export interface OrchestratorResult {
  allowed: boolean;
  reason?: string;
  /** Suggested delay in milliseconds when cool-down applies */
  suggestedDelayMs?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function logDecision(
  orgId: number,
  agentName: string,
  rule: string,
  allowed: boolean,
  reason: string,
): Promise<void> {
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "orchestrator.decision",
      org_id: orgId,
      properties: JSON.stringify({
        agent_name: agentName,
        rule,
        allowed,
        reason,
      }),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Orchestrator] Failed to log decision for org ${orgId}:`,
        message,
      );
    });
}

// ── Rule 1: Rate limit ─────────────────────────────────────────────

async function checkRateLimit(orgId: number): Promise<OrchestratorResult | null> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const result = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("event_type", "agent.action")
    .where("created_at", ">=", twentyFourHoursAgo)
    .count("id as count")
    .first();

  const count = Number(result?.count ?? 0);

  if (count >= 3) {
    return {
      allowed: false,
      reason: `Rate limit: ${count} agent actions on org ${orgId} in last 24h. Max is 3.`,
    };
  }

  return null;
}

// ── Rule 2: Dedup ───────────────────────────────────────────────────

async function checkDedup(
  agentName: string,
  orgId: number,
  actionType: string,
): Promise<OrchestratorResult | null> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const duplicate = await db("behavioral_events")
    .where({ org_id: orgId, event_type: "agent.action" })
    .where("created_at", ">=", twentyFourHoursAgo)
    .whereRaw("properties->>'agent_name' = ?", [agentName])
    .whereRaw("properties->>'action_type' = ?", [actionType])
    .first();

  if (duplicate) {
    return {
      allowed: false,
      reason: `Duplicate: ${agentName} already performed "${actionType}" on org ${orgId} in last 24h.`,
    };
  }

  return null;
}

// ── Rule 3: Monday independence ─────────────────────────────────────

function checkMondayRule(agentName: string): OrchestratorResult | null {
  const today = new Date();
  const isMonday = today.getDay() === 1;

  if (isMonday && agentName !== "monday_email") {
    return {
      allowed: false,
      reason: `Monday independence: only monday_email agent acts on Mondays. Agent "${agentName}" queued.`,
    };
  }

  return null;
}

// ── Rule 4: Task dedup ──────────────────────────────────────────────

async function checkTaskDedup(
  taskTitle?: string,
): Promise<OrchestratorResult | null> {
  if (!taskTitle) return null;

  const existingTask = await db("dream_team_tasks")
    .where({ status: "open" })
    .where("title", taskTitle)
    .first();

  if (existingTask) {
    return {
      allowed: false,
      reason: `Task dedup: an open dream_team_task with title "${taskTitle}" already exists.`,
    };
  }

  return null;
}

// ── Rule 5: Cool-down ───────────────────────────────────────────────

async function checkCoolDown(
  orgId: number,
): Promise<OrchestratorResult | null> {
  const fourHoursAgo = new Date();
  fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

  const recentNotification = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("event_type", "agent.action")
    .where("created_at", ">=", fourHoursAgo)
    .whereRaw(
      "properties->>'action_type' IN ('notification', 'email_queued', 'slack_post')",
    )
    .orderBy("created_at", "desc")
    .first();

  if (recentNotification) {
    const sentAt = new Date(recentNotification.created_at);
    const coolDownEnd = new Date(sentAt.getTime() + 4 * 60 * 60 * 1000);
    const delayMs = coolDownEnd.getTime() - Date.now();

    if (delayMs > 0) {
      return {
        allowed: true,
        reason: `Cool-down: org ${orgId} received a notification ${Math.round((Date.now() - sentAt.getTime()) / 60000)} minutes ago. Suggest delaying ${Math.round(delayMs / 60000)} minutes.`,
        suggestedDelayMs: delayMs,
      };
    }
  }

  return null;
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * Check whether an agent action is allowed to proceed.
 * Returns { allowed: true } if all rules pass.
 * Returns { allowed: false, reason } if blocked.
 * Returns { allowed: true, reason, suggestedDelayMs } if cool-down applies.
 */
export async function orchestratorCheck(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { agentName, orgId, actionType, taskTitle } = input;

  // Rule 1: Rate limit
  const rateResult = await checkRateLimit(orgId);
  if (rateResult) {
    await logDecision(orgId, agentName, "rate_limit", false, rateResult.reason!);
    console.log(`[Orchestrator] BLOCKED: ${agentName} on org ${orgId}: ${rateResult.reason}`);
    return rateResult;
  }

  // Rule 2: Dedup
  const dedupResult = await checkDedup(agentName, orgId, actionType);
  if (dedupResult) {
    await logDecision(orgId, agentName, "dedup", false, dedupResult.reason!);
    console.log(`[Orchestrator] BLOCKED: ${agentName} on org ${orgId}: ${dedupResult.reason}`);
    return dedupResult;
  }

  // Rule 3: Monday independence
  const mondayResult = checkMondayRule(agentName);
  if (mondayResult) {
    await logDecision(orgId, agentName, "monday_independence", false, mondayResult.reason!);
    console.log(`[Orchestrator] BLOCKED: ${agentName} on org ${orgId}: ${mondayResult.reason}`);
    return mondayResult;
  }

  // Rule 4: Task dedup
  const taskResult = await checkTaskDedup(taskTitle);
  if (taskResult) {
    await logDecision(orgId, agentName, "task_dedup", false, taskResult.reason!);
    console.log(`[Orchestrator] BLOCKED: ${agentName} on org ${orgId}: ${taskResult.reason}`);
    return taskResult;
  }

  // Rule 5: Cool-down (allowed but with suggested delay)
  const coolResult = await checkCoolDown(orgId);
  if (coolResult) {
    await logDecision(orgId, agentName, "cool_down", true, coolResult.reason!);
    console.log(`[Orchestrator] DELAY SUGGESTED: ${agentName} on org ${orgId}: ${coolResult.reason}`);
    return coolResult;
  }

  // All rules passed
  await logDecision(orgId, agentName, "all_rules", true, "All checks passed");
  console.log(`[Orchestrator] ALLOWED: ${agentName} on org ${orgId}, action "${actionType}"`);

  return { allowed: true };
}
