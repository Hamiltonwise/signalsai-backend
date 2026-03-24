/**
 * CS Agent — Claude-powered account-aware chat for doctors.
 *
 * POST /api/cs-agent/chat
 * Takes the doctor's message + account context, returns Claude's response.
 * System prompt injected with full practice data.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { db } from "../database/connection";

const csAgentRoutes = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60, // 60 messages per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many messages. Please try again later." },
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Build the system prompt with full account context.
 */
async function buildSystemPrompt(orgId: number, locationId?: number): Promise<string> {
  // Fetch practice data
  const org = await db("organizations")
    .where({ id: orgId })
    .select("name", "domain", "subscription_tier", "referral_code")
    .first();

  const practiceName = org?.name || "your practice";

  // Latest ranking
  let rankingQuery = db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();
  if (locationId) rankingQuery = rankingQuery.where("location_id", locationId);
  const ranking = await rankingQuery;

  // Latest agent outputs (proofline)
  const latestOutputs = await db("agent_outputs")
    .where({ organization_id: orgId, status: "success" })
    .orderBy("created_at", "desc")
    .limit(3)
    .select("agent_type", "agent_output", "created_at");

  // Parse findings from outputs
  const findingSummaries: string[] = [];
  for (const output of latestOutputs) {
    try {
      const data = typeof output.agent_output === "string"
        ? JSON.parse(output.agent_output)
        : output.agent_output;
      const summary = data?.summary || data?.client_summary || data?.one_line_summary;
      if (summary) findingSummaries.push(`[${output.agent_type}] ${summary}`);
    } catch { /* skip unparseable */ }
  }

  // Competitor info from ranking raw_data
  let competitorInfo = "";
  let scoreInfo = "";
  let rankInfo = "";
  if (ranking) {
    scoreInfo = `Score: ${ranking.rank_score}/100.`;
    rankInfo = `Ranked #${ranking.rank_position} of ${ranking.total_competitors} in the market.`;

    try {
      const rawData = typeof ranking.raw_data === "string"
        ? JSON.parse(ranking.raw_data)
        : ranking.raw_data;
      const competitors = rawData?.competitors || [];
      if (competitors.length > 0) {
        const top3 = competitors.slice(0, 3).map(
          (c: any) => `${c.name} (${c.totalReviews || c.reviewsCount || "?"} reviews, ${c.averageRating || c.totalScore || "?"}★)`
        );
        competitorInfo = `Top competitors: ${top3.join(", ")}.`;
      }
      const clientGbp = rawData?.client_gbp;
      if (clientGbp) {
        scoreInfo += ` ${clientGbp.totalReviewCount || 0} reviews, ${clientGbp.averageRating || "N/A"}★ rating.`;
      }
    } catch { /* skip */ }

    // LLM analysis
    try {
      const llm = typeof ranking.llm_analysis === "string"
        ? JSON.parse(ranking.llm_analysis)
        : ranking.llm_analysis;
      if (llm?.client_summary) {
        findingSummaries.unshift(`[ranking analysis] ${llm.client_summary}`);
      }
    } catch { /* skip */ }
  }

  // Review request stats
  const reviewStats = await db("review_requests")
    .where({ organization_id: orgId })
    .select("status")
    .count("id as count")
    .groupBy("status")
    .catch(() => []);

  const reviewCounts: Record<string, number> = {};
  for (const r of reviewStats as any[]) {
    reviewCounts[r.status] = Number(r.count);
  }
  const totalReviewRequests = Object.values(reviewCounts).reduce((s, n) => s + n, 0);
  const reviewConversions = reviewCounts.converted || 0;

  const specialty = ranking?.specialty || "practice";
  const city = ranking?.search_city || ranking?.location || "";

  return `You are the Alloro intelligence assistant for ${practiceName}.

You have access to their current data:
- ${scoreInfo || "No score data yet."}
- ${rankInfo || "No ranking data yet."}
- Specialty: ${specialty}${city ? ` in ${city}` : ""}
- ${competitorInfo || "No competitor data available yet."}
- Review requests: ${totalReviewRequests} sent, ${reviewConversions} converted to reviews.
- Subscription: ${org?.subscription_tier || "Not set"}
- Referral code: ${org?.referral_code || "None"}

Recent agent findings:
${findingSummaries.length > 0 ? findingSummaries.map(f => `- ${f}`).join("\n") : "- No agent findings yet. Agents will run on their next scheduled cycle."}

Rules:
- Be specific. Name competitors. Cite numbers. Never be vague.
- If asked about something Alloro doesn't track yet: explain what data upload or connection would unlock it, and link to /settings/integrations.
- If asked about score: explain each sub-score (Local Visibility /40, Online Presence /40, Review Health /20) and what moves each one.
- If asked about reviews: tell them exactly how many more they need to pass the next competitor and recommend sending review requests.
- Keep answers concise — 2-3 paragraphs max. Doctors are busy.
- You are not a generic AI. You are their account intelligence. Every answer should reference their specific data.
- Do not hallucinate data. If a number isn't available, say "I don't have that data yet" and explain what would unlock it.`;
}

/**
 * POST /api/cs-agent/chat
 *
 * Body: { message, history: [{role, content}] }
 * Returns: { success, response }
 */
csAgentRoutes.post("/chat", chatLimiter, async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({ success: false, error: "Message too long (max 2000 characters)" });
    }

    const locationId = req.body.locationId || null;
    const systemPrompt = await buildSystemPrompt(orgId, locationId);

    // Build conversation — last 10 messages max for context window efficiency
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    const recentHistory = (history as any[]).slice(-10);
    for (const h of recentHistory) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: "user", content: message.trim() });

    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const assistantMessage =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "I wasn't able to generate a response. Please try again.";

    return res.json({
      success: true,
      response: assistantMessage,
    });
  } catch (error: any) {
    console.error("[CSAgent] Chat error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Something went wrong. Please try again.",
    });
  }
});

export default csAgentRoutes;
