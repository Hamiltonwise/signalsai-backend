/**
 * Data Export Endpoints — WO-EXPORT-API
 *
 * GET /api/user/export/rankings   — last 12 snapshots as CSV
 * GET /api/user/export/referrals  — referral sources as CSV
 * GET /api/user/export/checkup    — original checkup data as JSON
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const exportRoutes = express.Router();

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function escapeCsv(val: string | null | undefined): string {
  if (!val) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── GET /export/rankings ───────────────────────────────────────────

exportRoutes.get(
  "/rankings",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .limit(12);

      const header = "week_start,position,keyword,bullet_1,bullet_2,bullet_3,dollar_figure";
      const rows = snapshots.map((s: any) => {
        const bullets = typeof s.bullets === "string" ? JSON.parse(s.bullets) : (s.bullets || []);
        return [
          s.week_start,
          s.position ?? "",
          escapeCsv(s.keyword),
          escapeCsv(bullets[0]),
          escapeCsv(bullets[1]),
          escapeCsv(bullets[2]),
          s.dollar_figure ?? "",
        ].join(",");
      });

      const csv = [header, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="alloro-rankings-${today()}.csv"`);
      return res.send(csv);
    } catch (error: any) {
      console.error("[Export] Rankings error:", error.message);
      return res.status(500).json({ success: false, error: "Export failed" });
    }
  },
);

// ─── GET /export/referrals ──────────────────────────────────────────

exportRoutes.get(
  "/referrals",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const hasTable = await db.schema.hasTable("referral_sources");
      if (!hasTable) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="alloro-referrals-${today()}.csv"`);
        return res.send("source_name,total_referrals,last_referral_date,estimated_annual_value\nNo referral data available");
      }

      const sources = await db("referral_sources")
        .where({ organization_id: orgId })
        .orderBy("referral_count", "desc");

      const header = "source_name,total_referrals,last_referral_date,estimated_annual_value";
      const rows = sources.map((s: any) => {
        const name = s.gp_name || s.name || "Unknown";
        const count = s.referral_count || 0;
        const lastDate = s.last_referral_date
          ? new Date(s.last_referral_date).toISOString().split("T")[0]
          : "";
        const avgPerMonth = s.monthly_average || (count / 12);
        const annualValue = Math.round(avgPerMonth * 12 * 1500 / 500) * 500;

        return [
          escapeCsv(name),
          count,
          lastDate,
          annualValue,
        ].join(",");
      });

      const csv = [header, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="alloro-referrals-${today()}.csv"`);
      return res.send(csv);
    } catch (error: any) {
      console.error("[Export] Referrals error:", error.message);
      return res.status(500).json({ success: false, error: "Export failed" });
    }
  },
);

// ─── GET /export/checkup ────────────────────────────────────────────

exportRoutes.get(
  "/checkup",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      // Get the most recent ranking as checkup data
      const ranking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      if (!ranking) {
        return res.json({
          success: true,
          checkup: null,
          message: "No checkup data available yet",
        });
      }

      const rawData = typeof ranking.raw_data === "string"
        ? JSON.parse(ranking.raw_data) : (ranking.raw_data || {});

      const competitors = (rawData.competitors || []).map((c: any) => ({
        name: c.name || c.displayName?.text,
        rating: c.rating || c.averageRating,
        reviewCount: c.reviewCount || c.totalReviews || c.userRatingCount,
      }));

      const checkup = {
        score: ranking.rank_score,
        position: ranking.rank_position,
        total_competitors: ranking.total_competitors,
        specialty: ranking.specialty,
        location: ranking.location,
        competitors,
        findings: typeof ranking.llm_analysis === "string"
          ? JSON.parse(ranking.llm_analysis) : (ranking.llm_analysis || {}),
        date_run: ranking.created_at,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="alloro-checkup-${today()}.json"`);
      return res.json({ success: true, checkup });
    } catch (error: any) {
      console.error("[Export] Checkup error:", error.message);
      return res.status(500).json({ success: false, error: "Export failed" });
    }
  },
);

// ─── GET /export/all — Full data export (GDPR Article 20 compliant) ──

exportRoutes.get(
  "/all",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      const userId = (req as any).userId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      // Gather everything the user provided or we generated for them
      const org = await db("organizations").where({ id: orgId }).first();
      const user = userId ? await db("users").where({ id: userId }).first("email", "first_name", "last_name", "created_at") : null;

      // Rankings history
      const rankings = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .limit(52)
        .then((rows: any[]) => rows.map((r: any) => ({
          week: r.week_start,
          position: r.position,
          keyword: r.keyword,
          bullets: typeof r.bullets === "string" ? JSON.parse(r.bullets) : r.bullets,
          dollar_figure: r.dollar_figure,
        })));

      // Referral data
      const hasReferrals = await db.schema.hasTable("referral_sources");
      const referrals = hasReferrals
        ? await db("referral_sources").where({ organization_id: orgId }).select("gp_name", "referral_count", "last_referral_date")
        : [];

      // Review requests
      const hasReviewRequests = await db.schema.hasTable("review_requests");
      const reviewRequests = hasReviewRequests
        ? await db("review_requests").where({ organization_id: orgId }).select("customer_name", "status", "created_at", "sent_at")
        : [];

      // Behavioral events (user activity)
      const hasBehavioral = await db.schema.hasTable("behavioral_events");
      const events = hasBehavioral
        ? await db("behavioral_events")
            .where({ organization_id: orgId })
            .orderBy("created_at", "desc")
            .limit(500)
            .select("event_type", "created_at", "properties")
        : [];

      // Checkup data
      let checkupData = null;
      if (org?.checkup_data) {
        try {
          checkupData = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
        } catch {}
      }

      // Research brief
      let researchBrief = null;
      if (org?.research_brief) {
        try {
          researchBrief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
        } catch {}
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        format_version: "1.0",
        account: {
          email: user?.email,
          name: user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : null,
          created_at: user?.created_at,
        },
        organization: {
          name: org?.name,
          jurisdiction: org?.operational_jurisdiction,
          subscription_status: org?.subscription_status,
          created_at: org?.created_at,
        },
        checkup: checkupData,
        research_brief: researchBrief,
        rankings,
        referral_sources: referrals,
        review_requests: reviewRequests.map((r: any) => ({
          customer_name: r.customer_name,
          status: r.status,
          created_at: r.created_at,
          sent_at: r.sent_at,
        })),
        activity_log: events.map((e: any) => ({
          type: e.event_type,
          date: e.created_at,
          details: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
        })),
      };

      // Log the export (audit trail)
      if (hasBehavioral) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "data.export_all",
          metadata: JSON.stringify({ format: "json", timestamp: new Date().toISOString() }),
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="alloro-data-export-${today()}.json"`);
      return res.json(exportData);
    } catch (error: any) {
      console.error("[Export] Full export error:", error.message);
      return res.status(500).json({ success: false, error: "Export failed" });
    }
  },
);

export default exportRoutes;
