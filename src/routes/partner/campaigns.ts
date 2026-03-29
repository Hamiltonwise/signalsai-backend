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
        senderSpecialty: "Business Clarity Partner",
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

// Export campaign results as CSV
campaignRoutes.get(
  "/export",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      // Accept results as base64-encoded JSON in query param (client-side data)
      const encoded = req.query.data as string;
      if (!encoded) {
        return res.status(400).json({ success: false, error: "No data to export" });
      }

      let results: Array<{
        name: string;
        city?: string;
        state?: string;
        score?: number | null;
        rank?: number | null;
        topCompetitor?: string | null;
        reviewGap?: number | null;
        specificFinding?: string | null;
      }>;

      try {
        results = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
        if (!Array.isArray(results)) throw new Error("Not an array");
      } catch {
        return res.status(400).json({ success: false, error: "Invalid data format" });
      }

      // Build CSV
      const headers = ["Business Name", "City", "State", "Score", "Rank", "Top Competitor", "Review Gap", "Key Finding"];
      const rows = results.map((r) => [
        csvEscape(r.name || ""),
        csvEscape(r.city || ""),
        csvEscape(r.state || ""),
        r.score != null ? String(r.score) : "",
        r.rank != null ? String(r.rank) : "",
        csvEscape(r.topCompetitor || ""),
        r.reviewGap != null ? String(r.reviewGap) : "",
        csvEscape(r.specificFinding || ""),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="campaign-results-${Date.now()}.csv"`);
      return res.send(csv);
    } catch (error: any) {
      console.error("[Campaigns] Export error:", error.message);
      return res.status(500).json({ success: false, error: "Export failed" });
    }
  },
);

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default campaignRoutes;
