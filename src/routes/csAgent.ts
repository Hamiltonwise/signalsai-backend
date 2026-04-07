/**
 * CS Agent — Claude-powered account-aware chat for business owners.
 *
 * POST /api/cs-agent/chat
 * Takes the user's message + account context, returns Claude's response.
 * System prompt injected with full business data.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { db } from "../database/connection";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

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
  const ranking = await rankingQuery.catch(() => null);

  // Latest agent outputs (proofline)
  const latestOutputs = await db("agent_outputs")
    .where({ organization_id: orgId, status: "success" })
    .orderBy("created_at", "desc")
    .limit(3)
    .select("agent_type", "agent_output", "created_at")
    .catch(() => []);

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
  if (ranking) {

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
        // review/rating data used in system prompt readings section below
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

  // Referral source data (top referring GPs)
  let referralInfo = "";
  const hasReferralSourcesTable = await db.schema.hasTable("referral_sources").catch(() => false);
  if (hasReferralSourcesTable) {
    const topReferrers = await db("referral_sources")
      .where({ organization_id: orgId })
      .orderBy("referral_count", "desc")
      .limit(5)
      .select("provider_name", "practice_name", "referral_count")
      .catch(() => []);

    if (topReferrers.length > 0) {
      const lines = topReferrers.map(
        (r: any) => `${r.provider_name}${r.practice_name ? ` (${r.practice_name})` : ""}: ${r.referral_count} referrals`
      );
      referralInfo = `Top referring providers:\n${lines.map((l: string) => `- ${l}`).join("\n")}`;
    }
  }

  const specialty = ranking?.specialty || "business";
  const city = ranking?.search_city || ranking?.location || "";
  const rankPosition = ranking?.rank_position || ranking?.rankPosition || null;
  const totalTracked = ranking?.total_competitors || ranking?.totalCompetitors || null;

  // Fetch checkup data for readings
  const orgFull = await db("organizations").where({ id: orgId }).first();
  let checkupData: any = null;
  if (orgFull?.checkup_data) {
    try {
      checkupData = typeof orgFull.checkup_data === "string"
        ? JSON.parse(orgFull.checkup_data)
        : orgFull.checkup_data;
    } catch { /* skip */ }
  }

  const place = checkupData?.place || {};
  const reviewCount = place.reviewCount || checkupData?.reviewCount || 0;
  const starRating = place.rating || 0;
  const topComp = checkupData?.topCompetitor;
  const profileFields = [
    place.hasPhone || place.nationalPhoneNumber ? "Phone" : null,
    place.hasHours || place.regularOpeningHours ? "Hours" : null,
    place.hasWebsite || place.websiteUri ? "Website" : null,
    (place.photosCount || place.photos?.length || 0) > 0 ? "Photos" : null,
    place.hasEditorialSummary || place.editorialSummary ? "Description" : null,
  ];
  const profileComplete = profileFields.filter(Boolean).length;
  const profileMissing = ["Phone", "Hours", "Website", "Photos", "Description"]
    .filter(f => !profileFields.includes(f));

  return `You are the Alloro advisor for ${practiceName}. You are warm, specific, and honest. You speak like a trusted mentor, not a help desk.

MARKET NEUTRALITY RULE: Report market data only. Never declare which competitor is the primary threat or frame the analysis as "you vs [specific competitor]." Present the market as a whole. The business owner knows their competitive relationships. Alloro does not. Competitor names can appear in data (review counts, positions) but never in recommendations or framing.

THEIR READINGS:
- Market Position: ${rankPosition && totalTracked && city ? `#${rankPosition} of ${totalTracked} practices tracked in ${city}` : city ? `Tracked in ${city}` : "Market data loading"}
- Star Rating: ${starRating || "Not yet available"} stars
- Review Volume: ${reviewCount} reviews
- Market: ${totalTracked ? `${totalTracked} practices tracked` : "Building competitive picture"}${competitorInfo ? `. ${competitorInfo}` : ""}
- Profile Completeness: ${profileComplete}/5 fields${profileMissing.length > 0 ? `. Missing: ${profileMissing.join(", ")}` : ""}
- Specialty: ${specialty}${city ? ` in ${city}` : ""}
- Review requests sent: ${totalReviewRequests}, converted: ${reviewConversions}

${referralInfo || "Referral data: activates when Alloro connects referral sources for this account."}

Recent findings:
${findingSummaries.length > 0 ? findingSummaries.map(f => `- ${f}`).join("\n") : "- Alloro is building your competitive picture. First findings appear after your first weekly scan."}

WHAT EACH READING MEANS (reference when they ask):
- Star Rating: 68% of consumers require 4+ stars. 31% require 4.5+. Below 4.0 drops conversion steeply.
- Review Volume: Google uses review count as a top 3 local ranking factor. Businesses with 50+ reviews earn 4.6x more revenue.
- Profile Completeness: Complete Google profiles are 2.7x more likely to be considered reputable and 70% more likely to attract visits. Five fields: phone, hours, website, photos, description.
- Review Responses: Responding to reviews earns 35% more revenue. Google confirms it improves local ranking. Response signals the business is active.
- Market Position: Where they appear relative to all tracked practices in their city. Alloro measures this weekly from a fixed point so trends are consistent.

WHAT ALLORO DOES:
- Reads your Google Business Profile and tracks your market weekly
- Sends a Monday email with one finding and one action
- Builds a website from your reviews and business data
- Drafts responses to your Google reviews (approve with one tap to post)
- Tracks your competitive position over time

HOW ALLORO PAGES WORK:
- Home: "Am I okay?" Your readings with verify links + one action card
- Get Found: "How does my market look?" Market landscape and review data
- Reviews: "What are people saying?" Your Google reviews with AI-drafted responses
- Your Website: "What does my presence look like?" Your website + search performance
- Settings: Account and billing

RULES:
- You have the doctor's real market position data. Use it. Never say you cannot tell them their ranking. State it directly: they are ranked X of Y practices tracked in their city.
- Never frame analysis as "you vs [competitor]" or name a specific competitor as the primary threat. Report market data: there are X practices in the market, the largest has Y reviews, you have Z. The doctor defines their own competitive priorities. Alloro does not.
- Never direct the doctor to configure settings, navigate to integrations, or set anything up themselves. If a capability is not active, state what Alloro will do, not what the doctor needs to do. Your role is to surface intelligence, not create tasks.
- Never fabricate dollar figures. Use real data only.
- Every reading links to where they can verify it on Google. Mention this when relevant.
- Keep answers to 2-3 short paragraphs. Business owners are busy.
- You are their advisor. Every answer references their specific data.
- Do not make up data. If unavailable, say so and explain what Alloro is doing to get it.`;
}

/**
 * POST /api/cs-agent/chat
 *
 * Body: { message, history: [{role, content}] }
 * Returns: { success, response }
 */
csAgentRoutes.post("/chat", authenticateToken, rbacMiddleware, chatLimiter, async (req: any, res) => {
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

    const model = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model,
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
