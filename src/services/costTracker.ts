/**
 * Cost Tracking Service
 *
 * Tracks actual API costs per agent per run.
 * Stores in behavioral_events with event_type 'agent.cost'.
 * Provides weekly and monthly aggregation.
 */

import { db } from "../database/connection";

// Model pricing (per-token costs)
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number; estimatePerRun: number }> = {
  haiku: { inputPerM: 0.80, outputPerM: 4.00, estimatePerRun: 0.001 },
  sonnet: { inputPerM: 3.00, outputPerM: 15.00, estimatePerRun: 0.01 },
  opus: { inputPerM: 15.00, outputPerM: 75.00, estimatePerRun: 0.05 },
};

// Map model tier strings to canonical names
function normalizeTier(modelTier: string): string {
  const lower = modelTier.toLowerCase();
  if (lower.includes("haiku")) return "haiku";
  if (lower.includes("opus")) return "opus";
  return "sonnet"; // default to sonnet
}

// Estimate cost from tokens and tier
function estimateCost(tokensUsed: number, modelTier: string): number {
  const tier = normalizeTier(modelTier);
  const pricing = MODEL_PRICING[tier] || MODEL_PRICING.sonnet;

  if (tokensUsed > 0) {
    // Assume roughly 60% input, 40% output token split
    const inputTokens = tokensUsed * 0.6;
    const outputTokens = tokensUsed * 0.4;
    return (inputTokens / 1_000_000) * pricing.inputPerM + (outputTokens / 1_000_000) * pricing.outputPerM;
  }

  // If no token count, use the per-run estimate
  return pricing.estimatePerRun;
}

/**
 * Record a cost event for an agent run.
 */
export async function recordAgentCost(
  agentName: string,
  orgId: number | null,
  tokensUsed: number,
  modelTier: string
): Promise<void> {
  const cost = estimateCost(tokensUsed, modelTier);
  const tier = normalizeTier(modelTier);

  await db("behavioral_events").insert({
    event_type: "agent.cost",
    org_id: orgId,
    session_id: null,
    properties: JSON.stringify({
      agent: agentName,
      tokens: tokensUsed,
      tier,
      cost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal precision
      recorded_at: new Date().toISOString(),
    }),
  });
}

interface CostBreakdown {
  byAgent: Record<string, number>;
  byTier: Record<string, number>;
  total: number;
  perClient: number;
}

async function getCosts(since: string): Promise<CostBreakdown> {
  const rows = await db("behavioral_events")
    .where("event_type", "agent.cost")
    .where("created_at", ">=", since)
    .select("properties");

  const byAgent: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    const props = typeof row.properties === "string"
      ? JSON.parse(row.properties)
      : row.properties || {};

    const agent = props.agent || "unknown";
    const tier = props.tier || "sonnet";
    const cost = props.cost || 0;

    byAgent[agent] = (byAgent[agent] || 0) + cost;
    byTier[tier] = (byTier[tier] || 0) + cost;
    total += cost;
  }

  // Get active org count for per-client calculation
  const orgCount = await db("organizations")
    .whereNot("name", "like", "%test%")
    .whereNot("name", "like", "%demo%")
    .count("id as count")
    .first();
  const activeClients = Math.max(1, parseInt(String(orgCount?.count || 1), 10));

  return {
    byAgent,
    byTier,
    total: Math.round(total * 100) / 100,
    perClient: Math.round((total / activeClients) * 100) / 100,
  };
}

/**
 * Get weekly cost breakdown.
 */
export async function getWeeklyCosts(): Promise<CostBreakdown> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return getCosts(oneWeekAgo);
}

/**
 * Get monthly cost breakdown.
 */
export async function getMonthlyCosts(): Promise<CostBreakdown> {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return getCosts(oneMonthAgo);
}

/**
 * Get cost trend (this month vs last month).
 */
export async function getCostTrend(): Promise<{
  thisMonth: CostBreakdown;
  lastMonth: CostBreakdown;
  changePercent: number;
}> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const thisMonth = await getCosts(thisMonthStart);

  // Custom query for last month (bounded range)
  const lastMonthRows = await db("behavioral_events")
    .where("event_type", "agent.cost")
    .where("created_at", ">=", lastMonthStart)
    .where("created_at", "<=", lastMonthEnd)
    .select("properties");

  const lastByAgent: Record<string, number> = {};
  const lastByTier: Record<string, number> = {};
  let lastTotal = 0;

  for (const row of lastMonthRows) {
    const props = typeof row.properties === "string"
      ? JSON.parse(row.properties)
      : row.properties || {};
    const agent = props.agent || "unknown";
    const tier = props.tier || "sonnet";
    const cost = props.cost || 0;
    lastByAgent[agent] = (lastByAgent[agent] || 0) + cost;
    lastByTier[tier] = (lastByTier[tier] || 0) + cost;
    lastTotal += cost;
  }

  const orgCount = await db("organizations")
    .whereNot("name", "like", "%test%")
    .whereNot("name", "like", "%demo%")
    .count("id as count")
    .first();
  const activeClients = Math.max(1, parseInt(String(orgCount?.count || 1), 10));

  const lastMonth: CostBreakdown = {
    byAgent: lastByAgent,
    byTier: lastByTier,
    total: Math.round(lastTotal * 100) / 100,
    perClient: Math.round((lastTotal / activeClients) * 100) / 100,
  };

  const changePercent = lastMonth.total > 0
    ? Math.round(((thisMonth.total - lastMonth.total) / lastMonth.total) * 100)
    : 0;

  return { thisMonth, lastMonth, changePercent };
}
