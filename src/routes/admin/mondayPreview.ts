/**
 * Monday Email Preview API (Admin Only)
 *
 * GET /api/admin/monday-preview
 *
 * Returns all active orgs with their Oz Moment data, readings,
 * and email status so Corey can review every Monday email before it sends.
 *
 * Response shape:
 * {
 *   previews: Array<{
 *     orgId: number;
 *     orgName: string;
 *     ownerName: string;
 *     ownerEmail: string;
 *     ozMoment: OzEngineResult | null;
 *     readings: Array<{ label, value, context, status }>;
 *     lastEmailSentAt: string | null;
 *     subscriptionStatus: string;
 *     held: boolean;
 *     holdReason: string | null;
 *   }>
 * }
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { getOzEngineResult, type OzEngineResult } from "../../services/ozEngine";
import { cleanCompetitorName } from "../../utils/textCleaning";

const mondayPreviewRoutes = express.Router();

interface ReadingPreview {
  label: string;
  value: string;
  context: string;
  status: "healthy" | "attention" | "critical";
}

interface EmailPreview {
  orgId: number;
  orgName: string;
  ownerName: string;
  ownerEmail: string;
  ozMoment: OzEngineResult | null;
  readings: ReadingPreview[];
  lastEmailSentAt: string | null;
  subscriptionStatus: string;
  held: boolean;
  holdReason: string | null;
}

mondayPreviewRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      // Admin check
      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        return res.status(403).json({ error: "Admin only" });
      }

      // Fetch all eligible orgs
      const orgs = await db("organizations")
        .where(function () {
          this.where({ subscription_status: "active" })
            .orWhereNotNull("checkup_score")
            .orWhere("onboarding_completed", true);
        })
        .select("id", "name", "subscription_status", "checkup_data", "created_at");

      const previews: EmailPreview[] = [];

      for (const org of orgs) {
        // Get owner info
        const orgUser = await db("organization_users")
          .where({ organization_id: org.id, role: "admin" })
          .first();

        let ownerName = org.name || "Unknown";
        let ownerEmail = "";

        if (orgUser) {
          const user = await db("users").where({ id: orgUser.user_id }).first();
          if (user) {
            ownerName = [user.first_name, user.last_name].filter(Boolean).join(" ") || org.name || "Unknown";
            ownerEmail = user.email || "";
          }
        }

        // Oz Engine
        let ozMoment: OzEngineResult | null = null;
        try {
          ozMoment = await getOzEngineResult(org.id);
        } catch { /* non-blocking */ }

        // Build readings from snapshot + checkup data
        const readings: ReadingPreview[] = [];

        const snapshot = await db("weekly_ranking_snapshots")
          .where({ org_id: org.id })
          .orderBy("week_start", "desc")
          .first();

        const clientReviews = snapshot?.client_review_count || 0;
        const compReviews = snapshot?.competitor_review_count || 0;
        const compName = cleanCompetitorName(snapshot?.competitor_name || "");

        if (clientReviews > 0) {
          const gap = compReviews - clientReviews;
          readings.push({
            label: "Reviews",
            value: `${clientReviews}`,
            context: gap > 0 && compName
              ? `${compName} has ${compReviews}. Gap: ${gap}.`
              : compName
                ? `Leading ${compName}.`
                : `${clientReviews} total.`,
            status: gap > 50 ? "attention" : "healthy",
          });
        }

        const cd = org.checkup_data
          ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
          : null;

        const city = cd?.market?.city || null;
        const totalComp = cd?.market?.totalCompetitors || null;
        if (city && totalComp) {
          readings.push({
            label: "Market",
            value: `${totalComp} competitors`,
            context: `In ${city}.`,
            status: "healthy",
          });
        }

        // Last email sent
        let lastEmailSentAt: string | null = null;
        try {
          const lastEvent = await db("behavioral_events")
            .where({ org_id: org.id, event_type: "monday_email.sent" })
            .orderBy("created_at", "desc")
            .first("created_at");
          lastEmailSentAt = lastEvent?.created_at?.toISOString?.() || lastEvent?.created_at || null;
        } catch { /* table may not exist */ }

        // Check for holds
        let held = false;
        let holdReason: string | null = null;
        try {
          const holdTask = await db("dream_team_tasks")
            .where({ org_id: org.id, status: "open" })
            .whereRaw("metadata::text LIKE '%monday_chain%'")
            .orderBy("created_at", "desc")
            .first();
          if (holdTask) {
            held = true;
            holdReason = holdTask.description || "Held by Go/No-Go";
          }
        } catch { /* table may not exist */ }

        previews.push({
          orgId: org.id,
          orgName: org.name || "Unknown",
          ownerName,
          ownerEmail,
          ozMoment,
          readings,
          lastEmailSentAt,
          subscriptionStatus: org.subscription_status || "unknown",
          held,
          holdReason,
        });
      }

      // Sort: held first, then by org name
      previews.sort((a, b) => {
        if (a.held && !b.held) return -1;
        if (!a.held && b.held) return 1;
        return (a.orgName || "").localeCompare(b.orgName || "");
      });

      return res.json({ previews, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      console.error("[MondayPreview] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

export default mondayPreviewRoutes;
