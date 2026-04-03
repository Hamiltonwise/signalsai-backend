/**
 * Dashboard Context API -- WO-CHECKUP-SESSION-KEY
 *
 * GET /api/user/dashboard-context
 *
 * On first load after account creation: if the org has checkup data
 * stored from the Checkup gate, returns it so the frontend can
 * pre-populate the position card before the first ranking snapshot runs.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { detectPreset } from "../../services/vocabularyAutoMapper";
import { trackUserActivity } from "../../services/userActivityTracker";

const dashboardContextRoutes = express.Router();

/**
 * GET /api/user/dashboard-context
 *
 * Returns checkup_context if session_checkup_key is set and checkup_data exists.
 * This gives new accounts immediate dashboard content from their Checkup results.
 */
dashboardContextRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const org = await db("organizations")
        .where({ id: orgId })
        .select(
          "checkup_score",
          "checkup_data",
          "top_competitor_name",
          "session_checkup_key",
          "first_login_at",
          "name",
          "research_brief",
          "patientpath_status",
          "week1_win_headline",
          "week1_win_detail",
          "week1_win_type",
          "week1_win_shown_at",
          "created_at",
          "trial_end_at",
          "trial_status",
          "stripe_customer_id",
          "current_clarity_score",
          "previous_clarity_score",
          "score_history",
          "score_updated_at",
        )
        .first();

      if (!org) return res.status(404).json({ success: false, error: "Org not found" });

      // Update last_activity_at on every dashboard load (debounced: skip if updated within 5 min)
      try {
        await db("organizations")
          .where({ id: orgId })
          .where(function () {
            this.whereNull("last_activity_at")
              .orWhere("last_activity_at", "<", new Date(Date.now() - 5 * 60 * 1000));
          })
          .update({ last_activity_at: new Date() });
      } catch { /* non-blocking */ }

      // Record dashboard view event (debounced by trackUserActivity, max once per 5 min)
      trackUserActivity(orgId, "dashboard.viewed").catch(() => {});

      // Only include checkup context if data exists
      let checkupContext = null;
      if (org.session_checkup_key && org.checkup_data) {
        const data = typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;

        checkupContext = {
          score: org.checkup_score,
          data,
          top_competitor_name: org.top_competitor_name,
          session_key: org.session_checkup_key,
        };
      }

      // Research brief for PatientPath reveal (WO-43)
      let researchFindings: string[] | null = null;
      if (org.research_brief && org.patientpath_status) {
        try {
          const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
          const findings = brief?.findings || brief?.key_findings || [];
          if (Array.isArray(findings) && findings.length > 0) {
            researchFindings = findings.slice(0, 3).map((f: any) => typeof f === "string" ? f : f.text || f.detail || f.finding || String(f));
          }
        } catch { /* ignore parse errors */ }
      }

      // Week 1 Win card (WO-48): show for 7 days after generation
      let week1Win = null;
      if (org.week1_win_headline && org.week1_win_shown_at) {
        const shownAt = new Date(org.week1_win_shown_at);
        const daysSinceShown = (Date.now() - shownAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceShown <= 7) {
          week1Win = {
            headline: org.week1_win_headline,
            detail: org.week1_win_detail,
            type: org.week1_win_type,
          };
        }
      }

      // Detect intelligence mode from vocabulary config or GBP category
      let intelligenceMode: string = "direct_acquisition";
      const vocabRow = await db("vocabulary_configs")
        .where({ organization_id: orgId })
        .select("vertical")
        .first()
        .catch(() => null);
      if (vocabRow?.vertical) {
        const preset = detectPreset(vocabRow.vertical);
        intelligenceMode = preset.intelligenceMode;
      } else if (org.checkup_data) {
        // Fallback: detect from checkup category
        const cData = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
        if (cData?.place?.category) {
          const preset = detectPreset(cData.place.category, cData.place?.types);
          intelligenceMode = preset.intelligenceMode;
        }
      }

      // Check if referral source data exists for this org
      let hasReferralData = false;
      const hasReferralSourcesTable = await db.schema.hasTable("referral_sources").catch(() => false);
      if (hasReferralSourcesTable) {
        const refCount = await db("referral_sources")
          .where({ organization_id: orgId })
          .count("id as cnt")
          .first()
          .catch(() => null);
        hasReferralData = Number(refCount?.cnt || 0) > 0;
      }

      // Referral stats for the "Split the Check" card
      let referralStats = null;
      const orgForRef = await db("organizations")
        .where({ id: orgId })
        .select("referral_code")
        .first()
        .catch(() => null);
      if (orgForRef?.referral_code) {
        const referredOrgs = await db("organizations")
          .where({ referred_by_org_id: orgId })
          .whereNotNull("stripe_customer_id")
          .count("id as cnt")
          .first()
          .catch(() => null);
        const converted = Number(referredOrgs?.cnt || 0);
        referralStats = {
          referral_code: orgForRef.referral_code,
          referrals_converted: converted,
          months_earned: converted, // 1 month per conversion
        };
      }

      // GBP connection check -- server-side truth for dashboard (#9 fix)
      const googleConn = await db("google_connections")
        .where({ organization_id: orgId })
        .first()
        .catch(() => null);
      const hasGoogleConnection = !!googleConn;

      // Parse score_history from JSONB
      let scoreHistory = null;
      if (org.score_history) {
        try {
          scoreHistory = typeof org.score_history === "string"
            ? JSON.parse(org.score_history)
            : org.score_history;
        } catch { /* ignore parse errors */ }
      }

      return res.json({
        success: true,
        checkup_context: checkupContext,
        research_findings: researchFindings,
        patientpath_status: org.patientpath_status || null,
        has_ranking_snapshot: false,
        week1_win: week1Win,
        org_created_at: org.created_at || null,
        has_referral_data: hasReferralData,
        intelligence_mode: intelligenceMode,
        referral_stats: referralStats,
        current_clarity_score: org.current_clarity_score ?? null,
        previous_clarity_score: org.previous_clarity_score ?? null,
        score_history: scoreHistory,
        score_updated_at: org.score_updated_at ?? null,
        has_google_connection: hasGoogleConnection,
        trial: org.trial_end_at ? {
          ends_at: org.trial_end_at,
          status: org.trial_status || "active",
          days_remaining: Math.max(0, Math.ceil((new Date(org.trial_end_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
          is_subscribed: !!org.stripe_customer_id,
        } : null,
      });
    } catch (error: any) {
      console.error("[DashboardContext] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load dashboard context" });
    }
  },
);

export default dashboardContextRoutes;
