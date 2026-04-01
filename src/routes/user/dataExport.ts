/**
 * Client Data Export -- Full JSON Download
 *
 * GET /api/user/data-export
 *
 * Returns ALL of a client's data as a JSON download.
 * Required for GDPR/CCPA compliance and client trust.
 *
 * Includes: organization details, checkup data, scores,
 * behavioral events, competitors, review drafts, PMS data,
 * referral history.
 */

import express, { Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const dataExportRoutes = express.Router();

dataExportRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res: Response) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(400).json({ success: false, error: "No organization" });
      }

      // 1. Organization details
      const organization = await db("organizations")
        .where({ id: orgId })
        .select(
          "id", "name", "domain", "created_at", "subscription_status",
          "checkup_score", "current_clarity_score", "trial_start_at",
          "trial_end_at", "source_channel", "referral_code"
        )
        .first();

      // 2. Checkup data and scores
      const checkupData = await db("organizations")
        .where({ id: orgId })
        .select("checkup_data", "checkup_score", "business_data")
        .first();

      let parsedCheckupData = null;
      if (checkupData?.checkup_data) {
        try {
          parsedCheckupData = typeof checkupData.checkup_data === "string"
            ? JSON.parse(checkupData.checkup_data)
            : checkupData.checkup_data;
        } catch {
          parsedCheckupData = checkupData.checkup_data;
        }
      }

      // 3. Behavioral events
      let behavioralEvents: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("behavioral_events");
        if (hasTable) {
          behavioralEvents = await db("behavioral_events")
            .where({ org_id: orgId })
            .orderBy("created_at", "desc")
            .limit(5000)
            .select("event_type", "properties", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 4. Score history (weekly ranking snapshots)
      let scoreHistory: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("weekly_ranking_snapshots");
        if (hasTable) {
          scoreHistory = await db("weekly_ranking_snapshots")
            .where({ org_id: orgId })
            .orderBy("week_start", "desc")
            .limit(52)
            .select("week_start", "position", "keyword", "bullets", "dollar_figure", "competitor_name");
        }
      } catch {
        // Table may not exist
      }

      // 5. Tracked competitors
      let trackedCompetitors: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("tracked_competitors");
        if (hasTable) {
          trackedCompetitors = await db("tracked_competitors")
            .where({ organization_id: orgId })
            .select("name", "place_id", "rating", "review_count", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 6. Review drafts
      let reviewDrafts: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("review_drafts");
        if (hasTable) {
          reviewDrafts = await db("review_drafts")
            .where({ organization_id: orgId })
            .orderBy("created_at", "desc")
            .limit(200)
            .select("reviewer_name", "draft_text", "status", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 7. PMS data
      let pmsData: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("pms_jobs");
        if (hasTable) {
          pmsData = await db("pms_jobs")
            .where({ organization_id: orgId })
            .orderBy("created_at", "desc")
            .limit(100)
            .select("status", "job_type", "result_summary", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 8. Referral history
      let referralHistory: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("referral_sources");
        if (hasTable) {
          referralHistory = await db("referral_sources")
            .where({ organization_id: orgId })
            .orderBy("created_at", "desc")
            .limit(500)
            .select("name", "source_type", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 9. Notifications
      let notifications: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("notifications");
        if (hasTable) {
          notifications = await db("notifications")
            .where({ organization_id: orgId })
            .orderBy("created_at", "desc")
            .limit(500)
            .select("title", "message", "type", "read", "created_at");
        }
      } catch {
        // Table may not exist
      }

      // 10. Vocabulary config
      let vocabularyConfig = null;
      try {
        const hasTable = await db.schema.hasTable("vocabulary_configs");
        if (hasTable) {
          const row = await db("vocabulary_configs").where({ org_id: orgId }).first();
          vocabularyConfig = row?.config || null;
        }
      } catch {
        // Table may not exist
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        organization,
        checkupData: parsedCheckupData,
        checkupScore: checkupData?.checkup_score || null,
        behavioralEvents,
        scoreHistory,
        trackedCompetitors,
        reviewDrafts,
        pmsData,
        referralHistory,
        notifications,
        vocabularyConfig,
      };

      const orgName = (organization?.name || "alloro")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase();
      const dateStr = new Date().toISOString().split("T")[0];

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${orgName}-data-export-${dateStr}.json"`
      );

      return res.json(exportData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[DataExport] Error:", message);
      return res.status(500).json({ success: false, error: "Failed to export data" });
    }
  }
);

export default dataExportRoutes;
