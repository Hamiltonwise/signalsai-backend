/**
 * Agent Coordinator -- Cross-agent communication hub for personal team agents.
 *
 * When Corey's agent detects a revenue risk, it tells Jo's agent to check client health.
 * When Jo's agent finds a client issue, it tells Dave's agent to verify no technical cause.
 * All cross-agent communication logged to behavioral_events with event_type "personal_agent.handoff".
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { AgentHandoff, PersonalBrief, TeamRole } from "./types";
import { generateDailyBrief as coreyBrief } from "./coreyAgent";
import { generateDailyBrief as joBrief } from "./joAgent";
import { generateDailyBrief as daveBrief } from "./daveAgent";

/**
 * Log a handoff between personal agents to behavioral_events.
 */
async function logHandoff(handoff: AgentHandoff): Promise<void> {
  await BehavioralEventModel.create({
    event_type: "personal_agent.handoff",
    properties: {
      source_agent: handoff.sourceAgent,
      target_agent: handoff.targetAgent,
      context: handoff.context,
      requested_action: handoff.requestedAction,
      timestamp: handoff.timestamp.toISOString(),
    },
  });
}

/**
 * After generating Corey's brief, check for revenue risks and hand off to Jo.
 */
async function processCoreyHandoffs(brief: PersonalBrief): Promise<void> {
  // If Corey's brief has at-risk clients, tell Jo to check client health
  const riskSection = brief.sections.find((s) =>
    s.title.toLowerCase().includes("at risk"),
  );

  if (riskSection && riskSection.items.length > 0) {
    await logHandoff({
      sourceAgent: "corey",
      targetAgent: "jo",
      context: `Revenue risk detected: ${riskSection.items.length} client(s) at risk of churn`,
      requestedAction: "Review client health for at-risk accounts and initiate outreach if needed",
      timestamp: new Date(),
    });
  }
}

/**
 * After generating Jo's brief, check for client issues and hand off to Dave.
 */
async function processJoHandoffs(brief: PersonalBrief): Promise<void> {
  // If Jo has red/amber clients, tell Dave to verify no technical cause
  const healthSection = brief.sections.find((s) =>
    s.title.toLowerCase().includes("client health"),
  );

  if (healthSection) {
    const hasIssues = healthSection.items.some(
      (item) => item.includes("[RED]") || item.includes("[AMBER]"),
    );

    if (hasIssues) {
      await logHandoff({
        sourceAgent: "jo",
        targetAgent: "dave",
        context: "Client health issues detected, may have technical cause",
        requestedAction: "Check system logs and error rates for affected orgs to rule out platform issues",
        timestamp: new Date(),
      });
    }
  }

  // If there are CS alerts, escalate to Dave for technical review
  const csSection = brief.sections.find((s) =>
    s.title.toLowerCase().includes("cs alert"),
  );

  if (csSection && csSection.items.length > 0) {
    await logHandoff({
      sourceAgent: "jo",
      targetAgent: "dave",
      context: `${csSection.items.length} CS alert(s) in last 24h`,
      requestedAction: "Verify no backend errors or outages causing client-facing issues",
      timestamp: new Date(),
    });
  }
}

/**
 * After generating Dave's brief, check for system issues and hand off to Corey.
 */
async function processDaveHandoffs(brief: PersonalBrief): Promise<void> {
  // If system health is degraded, notify Corey
  if (brief.urgentCount > 0) {
    await logHandoff({
      sourceAgent: "dave",
      targetAgent: "corey",
      context: `System health degraded: ${brief.urgentCount} issue(s) detected`,
      requestedAction: "Awareness only. Dave is handling technical resolution.",
      timestamp: new Date(),
    });
  }
}

/**
 * Get the brief for a specific team role.
 * Also processes cross-agent handoffs after brief generation.
 */
export async function getBriefForRole(role: TeamRole, userId: number): Promise<PersonalBrief> {
  switch (role) {
    case "visionary": {
      const brief = await coreyBrief(userId);
      await processCoreyHandoffs(brief);
      return brief;
    }
    case "integrator": {
      const brief = await joBrief(userId);
      await processJoHandoffs(brief);
      return brief;
    }
    case "build": {
      const brief = await daveBrief(userId);
      await processDaveHandoffs(brief);
      return brief;
    }
    default: {
      // Fallback to visionary brief for unknown roles
      return coreyBrief(userId);
    }
  }
}

/**
 * Get recent handoffs between agents.
 */
export async function getRecentHandoffs(limit: number = 20): Promise<AgentHandoff[]> {
  try {
    const events = await db("behavioral_events")
      .where("event_type", "personal_agent.handoff")
      .orderBy("created_at", "desc")
      .limit(limit)
      .select("properties", "created_at");

    return events.map((e: { properties: string | Record<string, unknown>; created_at: string }) => {
      const props = typeof e.properties === "string" ? JSON.parse(e.properties) : e.properties;
      return {
        sourceAgent: props.source_agent as string,
        targetAgent: props.target_agent as string,
        context: props.context as string,
        requestedAction: props.requested_action as string,
        timestamp: new Date(e.created_at),
      };
    });
  } catch {
    return [];
  }
}
