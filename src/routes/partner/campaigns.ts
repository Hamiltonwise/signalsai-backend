/**
 * Partner Campaign Intelligence -- WO-55
 *
 * POST /api/partner/campaigns/run           -- batch analyze practices
 * POST /api/partner/campaigns/generate-email -- generate outreach email
 * GET  /api/partner/campaigns/export         -- CSV export
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { generateOutreach, type OutreachContext } from "../../services/outreachEngine";

const campaignRoutes = express.Router();

// Run batch analysis
campaignRoutes.post(
  "/run",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { practices } = req.body;
      if (!Array.isArray(practices) || practices.length === 0) {
        return res.status(400).json({ success: false, error: "practices array required" });
      }
      if (practices.length > 50) {
        return res.status(400).json({ success: false, error: "Maximum 50 businesses per campaign" });
      }

      // Get sender info
      const org = await db("organizations").where({ id: orgId }).first("name", "owner_profile");
      const senderName = org?.name || "Alloro Partner";

      // For each practice, run a lightweight checkup-style analysis
      // In production this would call the full checkup pipeline
      // For now, return structured results that the frontend can use
      const results = practices.map((p: { name: string; city: string; state: string }, i: number) => ({
        id: `campaign-${i}`,
        name: p.name,
        city: p.city,
        state: p.state,
        status: "pending" as const,
        score: null as number | null,
        rank: null as number | null,
        topCompetitor: null as string | null,
        reviewGap: null as number | null,
        specificFinding: null as string | null,
        emailGenerated: false,
      }));

      return res.json({ success: true, results, total: results.length });
    } catch (error: any) {
      console.error("[Campaigns] Run error:", error.message);
      return res.status(500).json({ success: false, error: "Campaign failed" });
    }
  },
);

// Generate outreach email for a specific practice
campaignRoutes.post(
  "/generate-email",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { targetName, targetCity, score, rank, totalInMarket, topCompetitor, reviewGap, specificFinding } = req.body;

      const org = await db("organizations").where({ id: orgId }).first("name");
      const senderName = org?.name || "Alloro Partner";

      const dataPoints: string[] = [];
      if (rank) dataPoints.push(`Ranked #${rank}${totalInMarket ? ` of ${totalInMarket}` : ""} in market`);
      if (topCompetitor) dataPoints.push(`Top competitor: ${topCompetitor}`);
      if (reviewGap) dataPoints.push(`${reviewGap} reviews behind the leader`);
      if (score) dataPoints.push(`Business score: ${score}/100`);
      if (specificFinding) dataPoints.push(specificFinding);

      const ctx: OutreachContext = {
        purpose: "cold_outreach",
        recipientName: targetName || "Doctor",
        recipientRole: "Business Owner",
        businessName: senderName,
        senderName,
        senderSpecialty: "Business Intelligence Partner",
        dataPoints,
        city: targetCity || undefined,
        existingRelationship: false,
      };

      const result = await generateOutreach(ctx);

      return res.json({ success: true, email: result });
    } catch (error: any) {
      console.error("[Campaigns] Email error:", error.message);
      return res.status(500).json({ success: false, error: "Email generation failed" });
    }
  },
);

export default campaignRoutes;
