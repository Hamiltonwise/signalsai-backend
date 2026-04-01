/**
 * Agent Registry
 *
 * Code-defined map of agent_key → handler.
 * The scheduler worker looks up handlers here.
 * The admin API exposes available keys for the "create schedule" dropdown.
 */

import { executeProoflineAgent } from "../controllers/agents/feature-services/service.proofline-executor";
import { executeRankingAgent } from "../controllers/agents/feature-services/service.ranking-executor";
import { generateAllSnapshots } from "./rankingsIntelligence";
import { sendAllMondayEmails } from "../jobs/mondayEmail";
import { runDreamweaver } from "./agents/dreamweaver";
import { measurePendingOutcomes, aggregateHeuristicStats } from "./feedbackLoop";

export interface AgentHandler {
  displayName: string;
  description: string;
  handler: () => Promise<{ summary: Record<string, unknown> }>;
}

const registry: Record<string, AgentHandler> = {
  proofline: {
    displayName: "Proofline Agent",
    description: "Daily proofline analysis — generates Win/Risk data points from GBP and website analytics for all onboarded locations.",
    handler: async () => {
      const result = await executeProoflineAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  ranking: {
    displayName: "Practice Ranking",
    description: "Competitive ranking analysis — discovers competitors, scores, and generates LLM analysis for all onboarded locations.",
    handler: async () => {
      const result = await executeRankingAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
  },
  rankings_intelligence: {
    displayName: "Rankings Intelligence",
    description: "Weekly snapshot — queries current ranking for each org, generates 3 plain-English bullets, stores to weekly_ranking_snapshots. Runs Sunday 11PM UTC.",
    handler: async () => {
      const result = await generateAllSnapshots();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  monday_email: {
    displayName: "Monday Email",
    description: "Weekly intelligence brief to each practice owner. Reads from weekly_ranking_snapshots, sends via n8n webhook. Monday 2PM UTC (7AM PT).",
    handler: async () => {
      const result = await sendAllMondayEmails();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  dreamweaver: {
    displayName: "Dreamweaver",
    description: "Hospitality moments agent. Scans behavioral_events for personalized gestures (milestones, 5-star reviews, competitor wins, welcome back, 90-day mark, referral conversions). Daily 2:15PM UTC (7:15AM PT), after Client Monitor.",
    handler: async () => {
      const result = await runDreamweaver();
      return { summary: result as unknown as Record<string, unknown> };
    },
  },
  feedback_loop: {
    displayName: "Feedback Loop",
    description: "Self-improving heuristics engine. Measures Monday email outcomes after 7 days, aggregates which action types drive the most improvement. Tuesday 3PM UTC (8AM PT), 24h after Monday email.",
    handler: async () => {
      const outcomes = await measurePendingOutcomes();
      const stats = await aggregateHeuristicStats();
      return {
        summary: {
          measured: outcomes.measured,
          errors: outcomes.errors,
          heuristic_stats: stats,
        } as unknown as Record<string, unknown>,
      };
    },
  },
};

export function getAgentHandler(agentKey: string): AgentHandler | undefined {
  return registry[agentKey];
}

export function getRegisteredAgents(): Array<{ key: string; displayName: string; description: string }> {
  return Object.entries(registry).map(([key, { displayName, description }]) => ({
    key,
    displayName,
    description,
  }));
}
