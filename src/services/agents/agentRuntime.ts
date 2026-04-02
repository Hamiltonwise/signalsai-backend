/**
 * Agent Runtime -- Shared Memory Protocol
 *
 * Every agent calls prepareAgentContext() before acting,
 * recordAgentAction() after acting, and closeLoop() when
 * the outcome is known. This implements the 6-step Shared
 * Memory Protocol from the AI Org Operating Manual.
 *
 * Steps:
 * 1. Load recent behavioral_events for the org (48h window)
 * 2. Load relevant heuristics from the Knowledge Bridge
 * 3. Check for conflicting agent actions (same org + topic, last 24h)
 * 4. Call orchestratorCheck() for rate limits and dedup
 * 5. Return assembled RuntimeContext
 * 6. After action: record, gate, and close the loop
 */

import { db } from "../../database/connection";
import { getRelevantHeuristics } from "../knowledgeBridge";
import { orchestratorCheck } from "./orchestrator";
import { conductorGate } from "./systemConductor";

// ── Types ───────────────────────────────────────────────────────────

export interface AgentContext {
  agentName: string;
  orgId?: number;
  topic?: string;
}

export interface RuntimeContext {
  /** behavioral_events from last 48h for this org */
  recentEvents: any[];
  /** Relevant Knowledge Lattice / Sentiment Lattice entries */
  heuristics: string[];
  /** Whether another agent acted on this org + topic in last 24h */
  conflictCheck: {
    hasConflict: boolean;
    conflictingAgent?: string;
  };
  /** Orchestrator approval result */
  orchestratorApproval: {
    allowed: boolean;
    reason?: string;
    suggestedDelayMs?: number;
  };
}

// ── Step 1-4: Prepare Context ───────────────────────────────────────

/**
 * Assemble the full runtime context for an agent before it acts.
 * Call this at the start of every agent run.
 */
export async function prepareAgentContext(
  ctx: AgentContext,
): Promise<RuntimeContext> {
  const { agentName, orgId, topic } = ctx;

  // Step 1: Query recent behavioral_events (48h window)
  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  let recentEvents: any[] = [];
  try {
    const query = db("behavioral_events")
      .where("created_at", ">=", fortyEightHoursAgo)
      .orderBy("created_at", "desc")
      .limit(200);

    if (orgId) {
      query.where({ org_id: orgId });
    }

    recentEvents = await query;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentRuntime] Failed to load recent events for ${agentName}:`,
      message,
    );
  }

  // Step 2: Load relevant heuristics from Knowledge Bridge
  let heuristics: string[] = [];
  try {
    const heuristicRows = await getRelevantHeuristics(agentName, topic);
    heuristics = heuristicRows.map(
      (h) =>
        `[${h.leaderName}] ${h.corePrinciple} => ${h.agentHeuristic} (Avoid: ${h.antiPattern})`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentRuntime] Failed to load heuristics for ${agentName}:`,
      message,
    );
  }

  // Step 3: Check for conflicting agent actions (same org + topic, last 24h)
  let conflictCheck: RuntimeContext["conflictCheck"] = { hasConflict: false };
  if (orgId) {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const conflictQuery = db("behavioral_events")
        .where({ org_id: orgId, event_type: "agent.action" })
        .where("created_at", ">=", twentyFourHoursAgo)
        .whereRaw("properties->>'agent_name' != ?", [agentName]);

      if (topic) {
        conflictQuery.whereRaw("properties->>'topic' = ?", [topic]);
      }

      const conflictingEvent = await conflictQuery
        .orderBy("created_at", "desc")
        .first();

      if (conflictingEvent) {
        let props: Record<string, unknown> = {};
        try {
          props =
            typeof conflictingEvent.properties === "string"
              ? JSON.parse(conflictingEvent.properties)
              : conflictingEvent.properties ?? {};
        } catch {
          // Ignore parse errors
        }

        conflictCheck = {
          hasConflict: true,
          conflictingAgent: String(props.agent_name || "unknown"),
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[AgentRuntime] Failed conflict check for ${agentName}:`,
        message,
      );
    }
  }

  // Step 4: Orchestrator check (rate limit, dedup, Monday rule, etc.)
  let orchestratorApproval: RuntimeContext["orchestratorApproval"] = {
    allowed: true,
  };
  if (orgId) {
    try {
      const orchResult = await orchestratorCheck({
        agentName,
        orgId,
        actionType: topic || "general",
      });
      orchestratorApproval = {
        allowed: orchResult.allowed,
        reason: orchResult.reason,
        suggestedDelayMs: orchResult.suggestedDelayMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[AgentRuntime] Orchestrator check failed for ${agentName}:`,
        message,
      );
      // Default to allowed on orchestrator failure to avoid blocking all agents
      orchestratorApproval = {
        allowed: true,
        reason: `Orchestrator check failed: ${message}. Defaulting to allowed.`,
      };
    }
  }

  console.log(
    `[AgentRuntime] Context prepared for ${agentName}` +
      (orgId ? ` (org ${orgId})` : "") +
      `: ${recentEvents.length} events, ${heuristics.length} heuristics` +
      (conflictCheck.hasConflict
        ? `, conflict with ${conflictCheck.conflictingAgent}`
        : "") +
      `, orchestrator: ${orchestratorApproval.allowed ? "allowed" : "blocked"}`,
  );

  return {
    recentEvents,
    heuristics,
    conflictCheck,
    orchestratorApproval,
  };
}

// ── Step 5: Record Agent Action ─────────────────────────────────────

/**
 * Record an agent action to behavioral_events. Call after the agent
 * has produced output. If the action is external-facing, runs it
 * through the System Conductor gate.
 */
export async function recordAgentAction(
  ctx: AgentContext,
  action: {
    type: string;
    headline: string;
    detail?: string;
    humanNeed?: string;
    economicConsequence?: string;
  },
): Promise<void> {
  const { agentName, orgId } = ctx;

  // Write to behavioral_events
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "agent.action",
      org_id: orgId || null,
      properties: JSON.stringify({
        agent_name: agentName,
        action_type: action.type,
        topic: ctx.topic || null,
        headline: action.headline,
        detail: action.detail || null,
        human_need: action.humanNeed || null,
        economic_consequence: action.economicConsequence || null,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentRuntime] Failed to record action for ${agentName}:`,
      message,
    );
  }

  // Write to agent_results so the Dream Team dashboard shows real health
  // Every agent using the runtime gets dashboard visibility for free
  try {
    const hasTable = await db.schema.hasTable("agent_results");
    if (hasTable) {
      await db("agent_results").insert({
        agent_type: agentName,
        org_id: orgId || null,
        status: "success",
        agent_output: JSON.stringify({
          headline: action.headline,
          type: action.type,
          detail: action.detail || null,
        }),
        created_at: new Date(),
      });
    }
  } catch (err: unknown) {
    // Non-critical: dashboard visibility is a nice-to-have, not a blocker
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentRuntime] Failed to write agent_results for ${agentName}:`,
      message,
    );
  }

  // Run through System Conductor if external-facing and has an org
  const externalTypes = [
    "notification",
    "email_queued",
    "slack_post",
    "dashboard_card",
  ];
  if (orgId && externalTypes.includes(action.type)) {
    try {
      const gateResult = await conductorGate({
        agentName,
        orgId,
        outputType: mapActionType(action.type),
        headline: action.headline,
        body: action.detail || "",
        humanNeed: action.humanNeed,
        economicConsequence: action.economicConsequence,
      });

      if (!gateResult.cleared) {
        console.warn(
          `[AgentRuntime] Conductor HELD ${agentName} action for org ${orgId}: ${gateResult.reason}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[AgentRuntime] Conductor gate failed for ${agentName}:`,
        message,
      );
    }
  }

  console.log(
    `[AgentRuntime] Recorded action: ${agentName} -> ${action.type}` +
      (orgId ? ` (org ${orgId})` : "") +
      `: ${action.headline}`,
  );
}

// ── Step 6: Close the Loop ──────────────────────────────────────────

/**
 * Close the feedback loop for an agent action. Records expected vs
 * actual outcome. Flags failed loops for Learning Agent review.
 */
export async function closeLoop(
  ctx: AgentContext,
  outcome: {
    expected: string;
    actual: string;
    success: boolean;
    learning?: string;
  },
): Promise<void> {
  const { agentName, orgId } = ctx;

  // Write loop.closed event
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "loop.closed",
      org_id: orgId || null,
      properties: JSON.stringify({
        agent_name: agentName,
        topic: ctx.topic || null,
        expected: outcome.expected,
        actual: outcome.actual,
        success: outcome.success,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentRuntime] Failed to write loop.closed for ${agentName}:`,
      message,
    );
  }

  // If failed, flag for Learning Agent review
  if (!outcome.success) {
    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "learning.review_needed",
        org_id: orgId || null,
        properties: JSON.stringify({
          agent_name: agentName,
          topic: ctx.topic || null,
          expected: outcome.expected,
          actual: outcome.actual,
          reason: "Loop closed with success=false",
        }),
        created_at: new Date(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[AgentRuntime] Failed to flag learning review for ${agentName}:`,
        message,
      );
    }
  }

  // If learning is provided, write a learning.suggested event
  if (outcome.learning) {
    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "learning.suggested",
        org_id: orgId || null,
        properties: JSON.stringify({
          agent_name: agentName,
          topic: ctx.topic || null,
          learning: outcome.learning,
          from_outcome: {
            expected: outcome.expected,
            actual: outcome.actual,
            success: outcome.success,
          },
        }),
        created_at: new Date(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[AgentRuntime] Failed to write learning suggestion for ${agentName}:`,
        message,
      );
    }
  }

  console.log(
    `[AgentRuntime] Loop closed: ${agentName}` +
      (orgId ? ` (org ${orgId})` : "") +
      ` -> ${outcome.success ? "SUCCESS" : "FAILED"}` +
      (outcome.learning ? ` [learning: ${outcome.learning}]` : ""),
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapActionType(
  type: string,
): "notification" | "email" | "task" | "dashboard_card" | "slack" {
  switch (type) {
    case "notification":
      return "notification";
    case "email_queued":
      return "email";
    case "slack_post":
      return "slack";
    case "dashboard_card":
      return "dashboard_card";
    default:
      return "notification";
  }
}
