/**
 * CEO Intelligence Chat -- "The Conversation"
 *
 * POST /api/admin/ceo-chat
 *
 * Claude-powered chat with full organizational context.
 * Reads: organizations, agent_results, schedules, behavioral_events,
 * dream_team_nodes, morning_briefings, revenue data.
 *
 * This is the Limitless pill for the CEO.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const ceoChatRoutes = express.Router();

async function buildSystemContext(): Promise<string> {
  try {
    // Gather organizational intelligence in parallel
    const [orgs, recentOutputs, schedules, healthData, dreamTeam] =
      await Promise.all([
        db("organizations")
          .select("id", "name", "subscription_tier", "subscription_status", "created_at")
          .orderBy("created_at", "desc")
          .limit(30),
        db("agent_results")
          .select("agent_type", "organization_id", "status", "created_at")
          .orderBy("created_at", "desc")
          .limit(20),
        db("schedules")
          .select("agent_key", "display_name", "enabled", "last_run_at", "next_run_at")
          .where("enabled", true),
        db("organizations")
          .whereIn("subscription_status", ["active", "trial"])
          .select("id", "name", "subscription_status", "subscription_tier")
          .catch(() => []),
        db("dream_team_nodes")
          .select("role_title", "agent_key", "health_status", "department", "is_active")
          .orderBy("sort_order")
          .catch(() => []),
      ]);

    // Calculate revenue
    const tierPricing: Record<string, number> = { DWY: 997, DFY: 2497 };
    const activeOrgs = orgs.filter(
      (o: any) => o.subscription_status === "active" || o.subscription_tier
    );
    const mrr = activeOrgs.reduce(
      (sum: number, o: any) => sum + (tierPricing[o.subscription_tier || "DWY"] ?? 0),
      0
    );

    // Agent health summary
    const greenAgents = dreamTeam.filter((n: any) => n.health_status === "green").length;
    const redAgents = dreamTeam.filter((n: any) => n.health_status === "red").length;
    const grayAgents = dreamTeam.filter((n: any) => n.health_status === "gray").length;

    return `You are the CEO Intelligence Agent for Alloro, a universal business intelligence platform.
You have full context on the organization. Answer questions with specificity, using real data.
Follow the Alloro Recipe: one finding, one dollar figure, one action. Be direct. No hedging.

CURRENT STATE (live data):
- MRR: $${mrr.toLocaleString()} from ${activeOrgs.length} active accounts
- Total organizations: ${orgs.length}
- Active clients: ${healthData.length}
- Dream Team: ${greenAgents} green, ${redAgents} red, ${grayAgents} not configured
- Scheduled agents: ${schedules.map((s: any) => `${s.display_name || s.agent_key} (last: ${s.last_run_at ? new Date(s.last_run_at).toLocaleDateString() : "never"})`).join(", ")}
- Recent agent outputs: ${recentOutputs.length} in last batch, types: ${[...new Set(recentOutputs.map((o: any) => o.agent_type))].join(", ")}

KEY CLIENTS:
${activeOrgs.slice(0, 10).map((o: any) => `- ${o.name} (${o.subscription_tier || "no tier"}, since ${new Date(o.created_at).toLocaleDateString()})`).join("\n")}

ALLORO MISSION: Give every business owner the life they set out to build.
CATEGORY: Business Clarity. The enemy is opacity.
NORTH STARS: 1) Undeniable value ("how did they know that?") 2) Fastest bootstrapped unicorn (3 people + Claude)

FRAMEWORKS YOU KNOW:
- Hormozi Value Equation: Value = (Dream Outcome x Likelihood) / (Time Delay x Effort)
- Lemonis Protocol: People, Process, Product
- Guidara Unreasonable Hospitality: one-size-fits-one, 95/5 rule
- Clear Atomic Habits: cue, craving, response, reward
- Peloton retention: streaks, leaderboard, community, 96% retention

RULES:
- Never use em-dashes. Use commas or periods.
- Never use "practice" or "patient" in universal contexts. Use "business" and "customer."
- Be specific. Name the client, name the number, name the action.
- Actions compound. Suggestions decay. Prefer recommending actions the system can take autonomously.
- If you don't know something, say so. Never hallucinate data.`;
  } catch (err: any) {
    return `You are the CEO Intelligence Agent for Alloro. Data context failed to load: ${err.message}. Answer based on general Alloro knowledge.`;
  }
}

ceoChatRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const { message, history = [] } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: "Intelligence engine not configured. Set ANTHROPIC_API_KEY.",
        });
      }

      const anthropic = new Anthropic({ apiKey });
      const systemPrompt = await buildSystemContext();

      const messages = [
        ...history.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ];

      const response = await anthropic.messages.create({
        model: process.env.CEO_CHAT_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return res.json({ success: true, response: text });
    } catch (err: any) {
      console.error("[CEOChat] Error:", err.message);
      return res.status(500).json({
        success: false,
        error: "Intelligence engine error. Try again.",
      });
    }
  }
);

export default ceoChatRoutes;
