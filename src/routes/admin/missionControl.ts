/**
 * Agent Mission Control API
 *
 * GET /api/admin/mission-control -- real-time status of all 50 agents.
 * Queries behavioral_events + schedules + dream_team_nodes
 * to compute status, circuit state, weekly stats, and cost per agent.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { getWeeklyCosts, getMonthlyCosts, getCostTrend } from "../../services/costTracker";

const missionControlRoutes = express.Router();

// Agent tier classification (maps agent_key prefix to tier)
const AGENT_TIERS: Record<string, "fast" | "standard" | "judgment"> = {
  // Fast tier (haiku) -- high-volume, low-latency
  "cs_pulse": "fast",
  "review_monitor": "fast",
  "client_monitor": "fast",
  "aeo_monitor": "fast",
  "content_performance": "fast",
  "nothing_gets_lost": "fast",
  "feedback_loop": "fast",
  // Judgment tier (opus) -- complex reasoning
  "system_conductor": "judgment",
  "ceo_personal_agent": "judgment",
  "morning_briefing": "judgment",
  "dreamweaver": "judgment",
  "clo_agent": "judgment",
  "cfo_agent": "judgment",
};

// Sub-team groupings (from Flight Manual)
const AGENT_TEAMS: Record<string, string> = {
  // Monday Chain
  "morning_briefing": "Monday Chain",
  "ceo_personal_agent": "Monday Chain",
  "intelligence_agent": "Monday Chain",
  // Client Health
  "cs_pulse": "Client Health",
  "client_monitor": "Client Health",
  "churn_prediction": "Client Health",
  "feedback_loop": "Client Health",
  "milestone_detector": "Client Health",
  // Growth Engine
  "cmo_agent": "Growth Engine",
  "cro_agent": "Growth Engine",
  "conversion_optimizer": "Growth Engine",
  "content_performance": "Growth Engine",
  "aeo_monitor": "Growth Engine",
  "competitive_scout": "Growth Engine",
  // Intelligence
  "review_monitor": "Intelligence",
  "review_sentiment": "Intelligence",
  "rankings_intelligence": "Intelligence",
  "market_intelligence": "Intelligence",
  "technology_horizon": "Intelligence",
  // Operations
  "system_conductor": "Operations",
  "nothing_gets_lost": "Operations",
  "learning_agent": "Operations",
  "dreamweaver": "Operations",
  // Compliance
  "cfo_agent": "Compliance",
  "clo_agent": "Compliance",
};

interface AgentStatus {
  name: string;
  displayName: string;
  tier: "fast" | "standard" | "judgment";
  status: "nominal" | "degraded" | "failed" | "idle";
  lastRun: string | null;
  lastRunDuration?: number;
  lastResult: "success" | "failure" | "skipped" | null;
  nextScheduledRun: string | null;
  circuitState: "closed" | "open" | "half-open";
  weeklyRuns: number;
  weeklyFailures: number;
  tokensUsedThisWeek: number;
  costThisWeek: number;
  team: string;
}

missionControlRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Get all dream_team_nodes that are agents
      const agentNodes = await db("dream_team_nodes")
        .where("node_type", "agent")
        .where("is_active", true)
        .select("id", "role_title", "display_name", "agent_key", "health_status");

      // 2. Get all schedules (table is "schedules", not "schedules")
      const schedules = await db("schedules")
        .select("agent_key", "enabled", "last_run_at", "next_run_at");
      const scheduleMap = new Map(schedules.map((s: any) => [s.agent_key, s]));

      // 3. Get weekly behavioral events for agents
      const weeklyEvents = await db("behavioral_events")
        .where("created_at", ">=", oneWeekAgo)
        .whereRaw("event_type LIKE 'agent.%' OR event_type LIKE '%.run' OR event_type LIKE '%.completed' OR event_type LIKE '%.failed' OR event_type LIKE 'agent.cost'")
        .select("event_type", "properties", "created_at")
        .orderBy("created_at", "desc")
        .limit(5000);

      // 4. Build per-agent stats from events
      const agentEventStats = new Map<string, {
        lastRun: string | null;
        lastDuration: number | undefined;
        lastResult: "success" | "failure" | "skipped" | null;
        weeklyRuns: number;
        weeklyFailures: number;
        tokensUsed: number;
        cost: number;
        hasRetries: boolean;
      }>();

      for (const evt of weeklyEvents) {
        const props = typeof evt.properties === "string"
          ? JSON.parse(evt.properties)
          : evt.properties || {};

        const agentName = props.agent || props.agent_key || extractAgentFromEventType(evt.event_type);
        if (!agentName) continue;

        if (!agentEventStats.has(agentName)) {
          agentEventStats.set(agentName, {
            lastRun: null,
            lastDuration: undefined,
            lastResult: null,
            weeklyRuns: 0,
            weeklyFailures: 0,
            tokensUsed: 0,
            cost: 0,
            hasRetries: false,
          });
        }

        const stats = agentEventStats.get(agentName)!;

        if (evt.event_type === "agent.cost") {
          stats.tokensUsed += props.tokens || 0;
          stats.cost += props.cost || 0;
        } else if (evt.event_type.includes("failed") || evt.event_type.includes("error")) {
          stats.weeklyFailures++;
          stats.weeklyRuns++;
          if (!stats.lastRun || evt.created_at > stats.lastRun) {
            stats.lastRun = evt.created_at;
            stats.lastResult = "failure";
            stats.lastDuration = props.duration_ms;
          }
        } else if (evt.event_type.includes("completed") || evt.event_type.includes("success") || evt.event_type.includes(".run")) {
          stats.weeklyRuns++;
          if (props.retries && props.retries > 0) {
            stats.hasRetries = true;
          }
          if (!stats.lastRun || evt.created_at > stats.lastRun) {
            stats.lastRun = evt.created_at;
            stats.lastResult = "success";
            stats.lastDuration = props.duration_ms;
          }
        }
      }

      // 5. Also pull schedule runs for agents
      const recentRuns = await db("schedule_runs")
        .join("schedules", "schedule_runs.schedule_id", "schedules.id")
        .where("schedule_runs.started_at", ">=", oneWeekAgo)
        .select(
          "schedules.agent_key",
          "schedule_runs.status",
          "schedule_runs.started_at",
          "schedule_runs.duration_ms",
          "schedule_runs.error"
        )
        .orderBy("schedule_runs.started_at", "desc")
        .limit(2000);

      for (const run of recentRuns) {
        const agentName = run.agent_key;
        if (!agentEventStats.has(agentName)) {
          agentEventStats.set(agentName, {
            lastRun: null,
            lastDuration: undefined,
            lastResult: null,
            weeklyRuns: 0,
            weeklyFailures: 0,
            tokensUsed: 0,
            cost: 0,
            hasRetries: false,
          });
        }
        const stats = agentEventStats.get(agentName)!;
        stats.weeklyRuns++;
        if (run.status === "failed") stats.weeklyFailures++;

        if (!stats.lastRun || run.started_at > stats.lastRun) {
          stats.lastRun = run.started_at;
          stats.lastResult = run.status === "failed" ? "failure" : run.status === "completed" ? "success" : null;
          stats.lastDuration = run.duration_ms ?? undefined;
        }
      }

      // 6. Assemble the response
      const agents: AgentStatus[] = agentNodes.map((node: any) => {
        const key = node.agent_key || node.role_title?.toLowerCase().replace(/\s+/g, "_") || "";
        const schedule = scheduleMap.get(key);
        const stats = agentEventStats.get(key);

        // Determine status
        let status: AgentStatus["status"] = "idle";
        if (stats && stats.weeklyRuns > 0) {
          if (stats.weeklyFailures > 0 && stats.lastResult === "failure") {
            status = "failed";
          } else if (stats.hasRetries || stats.weeklyFailures > 0) {
            status = "degraded";
          } else {
            status = "nominal";
          }
        }

        // Circuit state
        let circuitState: AgentStatus["circuitState"] = "closed";
        if (stats && stats.weeklyFailures >= 3) {
          circuitState = "open";
        } else if (stats && stats.weeklyFailures >= 1 && stats.lastResult === "success") {
          circuitState = "half-open";
        }

        const tier = AGENT_TIERS[key] || "standard";
        const team = AGENT_TEAMS[key] || "General";

        return {
          name: key,
          displayName: node.display_name || node.role_title || key,
          tier,
          status,
          lastRun: stats?.lastRun || (schedule as any)?.last_run_at || null,
          lastRunDuration: stats?.lastDuration,
          lastResult: stats?.lastResult || null,
          nextScheduledRun: (schedule as any)?.next_run_at || null,
          circuitState,
          weeklyRuns: stats?.weeklyRuns || 0,
          weeklyFailures: stats?.weeklyFailures || 0,
          tokensUsedThisWeek: stats?.tokensUsed || 0,
          costThisWeek: stats?.cost || 0,
          team,
        };
      });

      // Group by team
      const byTeam: Record<string, AgentStatus[]> = {};
      for (const agent of agents) {
        if (!byTeam[agent.team]) byTeam[agent.team] = [];
        byTeam[agent.team].push(agent);
      }

      // Summary counts
      const summary = {
        total: agents.length,
        nominal: agents.filter((a) => a.status === "nominal").length,
        degraded: agents.filter((a) => a.status === "degraded").length,
        failed: agents.filter((a) => a.status === "failed").length,
        idle: agents.filter((a) => a.status === "idle").length,
        totalWeeklyCost: agents.reduce((sum, a) => sum + a.costThisWeek, 0),
        totalWeeklyTokens: agents.reduce((sum, a) => sum + a.tokensUsedThisWeek, 0),
      };

      return res.json({ success: true, agents, byTeam, summary });
    } catch (err: any) {
      console.error("Mission Control error:", err?.message, err?.stack?.split("\n").slice(0, 3).join(" | "));
      return res.status(500).json({ success: false, error: "Failed to load mission control", detail: err?.message });
    }
  }
);

// GET /costs -- AI cost tracking
missionControlRoutes.get(
  "/costs",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const period = (req.query.period as string) || "monthly";

      if (period === "weekly") {
        const costs = await getWeeklyCosts();
        return res.json({ success: true, period: "weekly", ...costs });
      }

      if (period === "trend") {
        const trend = await getCostTrend();
        return res.json({ success: true, period: "trend", ...trend });
      }

      const costs = await getMonthlyCosts();
      return res.json({ success: true, period: "monthly", ...costs });
    } catch (err) {
      console.error("Cost tracking error:", err);
      return res.status(500).json({ success: false, error: "Failed to load costs" });
    }
  }
);

function extractAgentFromEventType(eventType: string): string | null {
  // "agent.morning_briefing.completed" -> "morning_briefing"
  // "cs_pulse.run" -> "cs_pulse"
  const parts = eventType.split(".");
  if (parts[0] === "agent" && parts.length >= 2) return parts[1];
  if (parts.length >= 2 && parts[parts.length - 1] === "run") return parts.slice(0, -1).join(".");
  if (parts.length >= 2 && (parts[parts.length - 1] === "completed" || parts[parts.length - 1] === "failed")) {
    return parts.slice(0, -1).join(".");
  }
  return null;
}

export default missionControlRoutes;
