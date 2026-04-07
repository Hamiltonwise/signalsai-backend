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

THEIR READINGS:
- Star Rating: ${starRating || "Not yet available"} stars
- Review Volume: ${reviewCount} reviews${topComp ? `. Top competitor: ${topComp.name} with ${topComp.reviewCount || "unknown"} reviews.` : ""}
- Profile Completeness: ${profileComplete}/5 fields${profileMissing.length > 0 ? `. Missing: ${profileMissing.join(", ")}` : ""}
- Specialty: ${specialty}${city ? ` in ${city}` : ""}
- ${competitorInfo || "Competitor data: connecting Google unlocks weekly tracking."}
- Review requests sent: ${totalReviewRequests}, converted: ${reviewConversions}

${referralInfo || "Referral data: activates when referral sources are uploaded via Settings > Integrations."}

Recent findings:
${findingSummaries.length > 0 ? findingSummaries.map(f => `- ${f}`).join("\n") : "- Alloro is building your competitive picture. First findings appear after your first weekly scan."}

WHAT EACH READING MEANS (reference when they ask):
- Star Rating: 68% of consumers require 4+ stars. 31% require 4.5+. Below 4.0 drops conversion steeply.
- Review Volume: Google uses review count as a top 3 local ranking factor. Businesses with 50+ reviews earn 4.6x more revenue. The gap vs your top competitor matters most.
- Profile Completeness: Complete Google profiles are 2.7x more likely to be considered reputable and 70% more likely to attract visits. Five fields: phone, hours, website, photos, description.
- Review Responses: Responding to reviews earns 35% more revenue. Google confirms it improves local ranking. Response signals the business is active.
- Your Market: The competitive landscape. Who you're compared against when someone searches your specialty in your city.

WHAT ALLORO DOES:
- Reads your Google Business Profile and compares you to competitors weekly
- Sends a Monday email with one finding and one action
- Builds a website from your reviews and business data
- Drafts responses to your Google reviews (approve with one tap to post)
- Tracks your competitive position over time

HOW ALLORO PAGES WORK:
- Home: "Am I okay?" Your readings with verify links + one action card
- Compare: "How do I compare?" Side-by-side with your top competitor
- Reviews: "What are people saying?" Your Google reviews with AI-drafted responses
- Presence: "What does my presence look like?" Your website + GBP completeness
- Settings: Connect Google, manage integrations, billing

RULES:
- Be specific. Name competitors. Cite their actual numbers. Never be vague.
- Never claim a ranking position number. Say "more visible" not "#3."
- Never fabricate dollar figures. Use real data only.
- Every reading links to where they can verify it on Google. Mention this when relevant.
- If asked about something not yet available: explain what connection or action would unlock it.
- Keep answers to 2-3 short paragraphs. Business owners are busy.
- You are their advisor. Every answer references their specific data.
- Do not make up data. If unavailable, say so and explain what would unlock it.`;
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
