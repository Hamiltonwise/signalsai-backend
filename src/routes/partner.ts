/**
 * Partner Portal API
 *
 * GET /api/partner/portfolio — practices referred by this partner
 * GET /api/partner/performance — referral code performance stats
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const partnerRoutes = express.Router();

let llmClient: Anthropic | null = null;
function getLLM(): Anthropic {
  if (!llmClient) llmClient = new Anthropic();
  return llmClient;
}

const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Try again later." },
});

/**
 * Middleware: verify the user's org has partner_type set
 */
async function requirePartner(req: RBACRequest, res: express.Response, next: express.NextFunction) {
  if (!req.organizationId) {
    return res.status(403).json({ success: false, error: "No organization" });
  }
  const org = await db("organizations").where({ id: req.organizationId }).first();
  if (!org?.partner_type) {
    return res.status(403).json({ success: false, error: "Not a partner account" });
  }
  (req as any).partnerOrg = org;
  next();
}

/**
 * GET /api/partner/portfolio
 *
 * Returns all practices referred by this partner via referral_code.
 */
partnerRoutes.get(
  "/portfolio",
  authenticateToken,
  rbacMiddleware,
  requirePartner,
  async (req: RBACRequest, res) => {
    try {
      const partnerOrg = (req as any).partnerOrg;

      // Find all orgs referred by this partner
      const referredOrgs = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id })
        .select(
          "id", "name", "domain", "organization_type", "subscription_status",
          "subscription_tier", "created_at",
        );

      // Enrich each with latest ranking data
      const portfolio = await Promise.all(
        referredOrgs.map(async (org: any) => {
          const latestRanking = await db("practice_rankings")
            .where({ organization_id: org.id, status: "completed" })
            .orderBy("created_at", "desc")
            .first();

          const previousRanking = await db("practice_rankings")
            .where({ organization_id: org.id, status: "completed" })
            .orderBy("created_at", "desc")
            .offset(1)
            .first();

          // Get primary location for city/specialty
          const primaryLoc = await db("locations")
            .where({ organization_id: org.id, is_primary: true })
            .first();

          return {
            id: org.id,
            name: org.name,
            city: primaryLoc?.city || primaryLoc?.name || null,
            specialty: primaryLoc?.specialty || org.organization_type || null,
            score: latestRanking?.rank_score ? Number(latestRanking.rank_score) : null,
            previousScore: previousRanking?.rank_score ? Number(previousRanking.rank_score) : null,
            rankPosition: latestRanking?.rank_position || null,
            subscriptionStatus: org.subscription_status,
            subscriptionTier: org.subscription_tier,
            createdAt: org.created_at,
            hasWebsite: false, // TODO: check website_projects
          };
        }),
      );

      // Aggregate stats
      const totalMRR = referredOrgs.filter(
        (o: any) => o.subscription_status === "active",
      ).length * 150; // estimate

      const avgScore = portfolio.filter((p) => p.score).length > 0
        ? Math.round(
            portfolio.filter((p) => p.score).reduce((s, p) => s + (p.score || 0), 0) /
            portfolio.filter((p) => p.score).length,
          )
        : null;

      return res.json({
        success: true,
        portfolio,
        stats: {
          totalReferred: portfolio.length,
          totalMRR,
          avgScore,
          referralCode: partnerOrg.referral_code,
        },
      });
    } catch (error: any) {
      console.error("[Partner] Portfolio error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load portfolio" });
    }
  },
);

/**
 * GET /api/partner/performance
 *
 * Referral code performance: scans, conversions, MRR.
 */
partnerRoutes.get(
  "/performance",
  authenticateToken,
  rbacMiddleware,
  requirePartner,
  async (req: RBACRequest, res) => {
    try {
      const partnerOrg = (req as any).partnerOrg;
      const code = partnerOrg.referral_code;

      // Count checkup scans with this ref code
      const scanCount = await db("behavioral_events")
        .where("event_type", "checkup.started")
        .whereRaw("properties->>'ref_code' = ?", [code])
        .count("* as count")
        .first();

      // Count email captures with this ref code
      const captureCount = await db("behavioral_events")
        .where("event_type", "checkup.email_captured")
        .whereRaw("properties->>'ref_code' = ?", [code])
        .count("* as count")
        .first();

      // Count orgs that were referred
      const conversionCount = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id })
        .count("* as count")
        .first();

      // Active subscriptions from referred orgs
      const activeCount = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id, subscription_status: "active" })
        .count("* as count")
        .first();

      return res.json({
        success: true,
        performance: {
          referralCode: code,
          totalScans: parseInt((scanCount as any)?.count || "0", 10),
          emailsCaptured: parseInt((captureCount as any)?.count || "0", 10),
          accountsCreated: parseInt((conversionCount as any)?.count || "0", 10),
          activeSubscriptions: parseInt((activeCount as any)?.count || "0", 10),
          estimatedMRR: parseInt((activeCount as any)?.count || "0", 10) * 150,
        },
      });
    } catch (error: any) {
      console.error("[Partner] Performance error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load performance" });
    }
  },
);

/**
 * POST /api/partner/write
 *
 * Email writing assistant — generates 2 follow-up email options via Claude.
 * Body: { situation: string, tone: "professional" | "friendly" | "urgent" }
 */
partnerRoutes.post(
  "/write",
  authenticateToken,
  rbacMiddleware,
  writeLimiter,
  async (req: RBACRequest, res) => {
    try {
      if (!req.organizationId) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      const { situation, tone = "professional" } = req.body;

      if (!situation || typeof situation !== "string" || situation.trim().length === 0) {
        return res.status(400).json({ success: false, error: "Situation is required" });
      }
      if (situation.trim().length > 1000) {
        return res.status(400).json({ success: false, error: "Too long (max 1000 characters)" });
      }

      const toneInstruction =
        tone === "urgent"
          ? "Write with urgency — time-sensitive, action needed soon."
          : tone === "friendly"
            ? "Write casually and warmly — like texting a colleague you respect."
            : "Write professionally — polished but approachable.";

      const systemPrompt = `You write emails for a partner marketing director whose audience is dental practice owners and endodontists. Her tone is warm, direct, and professional — never pushy. She is building trust, not closing sales. Alloro is a business intelligence platform that shows practices their competitive position and automatically builds their online presence.

Rules:
- Write emails that feel personal and specific, never like a template
- Always under 150 words per email
- Always include a clear single call to action
- Never use exclamation marks excessively
- Subject lines should be conversational, not salesy
- Sign off with first name only

Respond with EXACTLY 2 email options as a JSON array:
[{"subject":"...","body":"..."},{"subject":"...","body":"..."}]
Return only the JSON array. No markdown, no explanation.`;

      const anthropic = getLLM();
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Tone: ${toneInstruction}\n\nSituation: ${situation.trim()}` },
        ],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";

      let emails: { subject: string; body: string }[] = [];
      try {
        const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        emails = JSON.parse(cleaned);
        if (!Array.isArray(emails) || emails.length === 0) throw new Error("Bad format");
        emails = emails.slice(0, 2).map((e) => ({
          subject: String(e.subject || "Follow-up"),
          body: String(e.body || ""),
        }));
      } catch {
        console.error("[Partner] Parse fail:", text.slice(0, 200));
        return res.status(500).json({ success: false, error: "Failed to generate. Try again." });
      }

      console.log(`[Partner] Generated ${emails.length} emails for org ${req.organizationId}`);
      return res.json({ success: true, emails });
    } catch (error: any) {
      console.error("[Partner] Write error:", error.message);
      return res.status(500).json({ success: false, error: "Something went wrong." });
    }
  },
);

export default partnerRoutes;
