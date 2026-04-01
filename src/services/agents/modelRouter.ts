/**
 * Model Router -- Agent Orchestration Infrastructure
 *
 * Determines which Claude model each agent should use based on its
 * role in the system. Three tiers:
 *
 * - Fast (Haiku): aggregation, data pulls, routine checks
 * - Standard (Sonnet): analysis, reasoning, drafting
 * - Judgment (Opus): gates, legal, financial, conflict resolution
 *
 * Also manages token budgets per tier so agents stay within cost
 * and latency bounds.
 *
 * Global model default lives in CLAUDE.md. This file maps agent
 * names to tiers and tiers to model IDs.
 */

// ── Types ───────────────────────────────────────────────────────────

export type ModelTier = "fast" | "standard" | "judgment";

export interface TokenBudget {
  /** Maximum tokens the agent may consume in a single run */
  budget: number;
  /** Token count at which the agent should wrap up (85% of budget) */
  pauseAt: number;
  /** Token count at which the agent is force-stopped (100% of budget) */
  killAt: number;
}

// ── Model ID mapping ───────────────────────────────────────────────

const MODEL_IDS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  judgment: "claude-opus-4-6",
};

// ── Token budgets per tier ─────────────────────────────────────────

const TIER_BUDGETS: Record<ModelTier, number> = {
  fast: 15_000,
  standard: 50_000,
  judgment: 30_000,
};

const PAUSE_RATIO = 0.85;

// ── Agent -> Tier mapping ──────────────────────────────────────────

const AGENT_MODEL_MAP: Record<string, ModelTier> = {
  // Tier 1: Fast (haiku) -- aggregation, data pulls, routine checks
  morningBriefing: "fast",
  contentPerformance: "fast",
  aeoMonitor: "fast",
  nothingGetsLost: "fast",
  bugTriage: "fast",
  marketSignalScout: "fast",
  technologyHorizon: "fast",
  weeklyDigest: "fast",

  // Tier 2: Standard (sonnet) -- analysis, reasoning, drafting
  intelligenceAgent: "standard",
  cmoAgent: "standard",
  competitiveScout: "standard",
  csAgent: "standard",
  conversionOptimizer: "standard",
  learningAgent: "standard",
  dreamweaver: "standard",
  clientMonitor: "standard",

  // Tier 3: Judgment (opus) -- gates, legal, financial, conflicts
  systemConductor: "judgment",
  cfoAgent: "judgment",
  cloAgent: "judgment",
  safetyAgent: "judgment",
  icpSimulation: "judgment",
};

// ── Exports ────────────────────────────────────────────────────────

/**
 * Get the Claude model ID for a given agent.
 * Unknown agents default to the standard tier (sonnet).
 */
export function getModelForAgent(agentName: string): string {
  const tier = AGENT_MODEL_MAP[agentName] ?? "standard";
  return MODEL_IDS[tier];
}

/**
 * Get the tier classification for a given agent.
 * Unknown agents default to "standard".
 */
export function getTierForAgent(agentName: string): ModelTier {
  return AGENT_MODEL_MAP[agentName] ?? "standard";
}

/**
 * Get the token budget for a given agent based on its tier.
 *
 * - budget: total tokens allowed per run
 * - pauseAt: 85% threshold, agent should start wrapping up
 * - killAt: 100% threshold, agent is force-stopped
 */
export function getTokenBudget(agentName: string): TokenBudget {
  const tier = AGENT_MODEL_MAP[agentName] ?? "standard";
  const budget = TIER_BUDGETS[tier];

  return {
    budget,
    pauseAt: Math.floor(budget * PAUSE_RATIO),
    killAt: budget,
  };
}

/**
 * List all registered agents and their tier assignments.
 * Useful for admin dashboards and debugging.
 */
export function listAgentTiers(): Array<{
  agent: string;
  tier: ModelTier;
  model: string;
  budget: number;
}> {
  return Object.entries(AGENT_MODEL_MAP).map(([agent, tier]) => ({
    agent,
    tier,
    model: MODEL_IDS[tier],
    budget: TIER_BUDGETS[tier],
  }));
}
