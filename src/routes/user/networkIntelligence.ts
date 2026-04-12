/**
 * Network Intelligence API
 *
 * GET /api/user/network-intelligence
 *
 * Surfaces buried intelligence that no individual business owner could find alone.
 * Aggregates: collective heuristics, seasonal alerts, market patterns,
 * and review theme hero quotes.
 *
 * Each section degrades gracefully: if the data doesn't exist yet,
 * the field is null and the frontend handles absence.
 *
 * This is the "how did they know that?" endpoint for the Home page
 * intelligence section and the Reviews/Compare deep dives.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { getUpcomingSeasonalAlert } from "../../services/seasonalCalendar";
import { getToneProfileFromString } from "../../services/toneEvolution";

const router = express.Router();

router.get(
  "/network-intelligence",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(401).json({ success: false, error: "Auth required" });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org) {
        return res.json({ success: true, data: null });
      }

      const checkup = org.checkup_data
        ? (typeof org.checkup_data === "string" ? tryParse(org.checkup_data) : org.checkup_data)
        : null;

      const specialty = checkup?.market?.specialty || org.vertical || null;

      // ── 1. Collective Heuristics (network-level insights) ──
      let networkInsights: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("knowledge_heuristics");
        if (hasTable) {
          networkInsights = await db("knowledge_heuristics")
            .where(function () {
              this.where("applicable_to", "all");
              if (specialty) {
                this.orWhere("applicable_to", specialty);
              }
            })
            .where("confidence", ">=", 0.5)
            .orderBy("confidence", "desc")
            .limit(3);
        }
      } catch { /* table may not exist */ }

      // ── 2. Seasonal Alert (proactive intelligence) ──
      let seasonalAlert: any = null;
      if (specialty) {
        try {
          seasonalAlert = getUpcomingSeasonalAlert(specialty);
        } catch { /* non-blocking */ }
      }

      // ── 3. Review Theme Hero Quote (from checkup) ──
      let heroQuote: { quote: string; reviewerName: string } | null = null;
      try {
        const themes = checkup?.reviewThemes;
        if (themes?.heroQuote) {
          heroQuote = {
            quote: themes.heroQuote,
            reviewerName: themes.heroReviewerName || "A patient",
          };
        }
      } catch { /* non-blocking */ }

      // ── 4. Tone Profile (Guidara principle) ──
      let toneProfile: any = null;
      try {
        if (org.created_at) {
          toneProfile = getToneProfileFromString(org.created_at);
        }
      } catch { /* non-blocking */ }

      // ── 5. GP Drift Alerts (for referral-based practices) ──
      let driftAlerts: any[] = [];
      try {
        const hasRS = await db.schema.hasTable("referral_sources");
        if (hasRS) {
          const sources = await db("referral_sources")
            .where({ organization_id: orgId })
            .whereNull("surprise_catch_dismissed_at")
            .orderByRaw("COALESCE(prior_3_month_avg, monthly_average, 0) DESC")
            .limit(5);

          for (const src of sources) {
            const prior = src.prior_3_month_avg ?? src.monthly_average ?? 0;
            const recent = src.recent_referral_count ?? src.referral_count_last_30d ?? 0;
            const lastDate = src.last_referral_date || src.updated_at;
            const daysSilent = lastDate
              ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
              : 0;

            if (prior >= 2 && recent === 0 && daysSilent >= 30) {
              driftAlerts.push({
                type: "gone_dark",
                gpName: src.gp_name || src.name || "A referring provider",
                gpPractice: src.practice_name || null,
                priorMonthlyAvg: Math.round(prior),
                daysSilent,
                estimatedAnnualRisk: Math.round(prior * 12 * (checkup?.avgCaseValue || 500)),
              });
            } else if (prior >= 3 && recent > 0 && recent < prior * 0.7) {
              driftAlerts.push({
                type: "drift",
                gpName: src.gp_name || src.name || "A referring provider",
                gpPractice: src.practice_name || null,
                priorMonthlyAvg: Math.round(prior),
                currentMonthly: recent,
                declinePercent: Math.round((1 - recent / prior) * 100),
              });
            }
          }
        }
      } catch { /* non-blocking */ }

      // ── 6. Referral Top Performers ──
      let topReferrers: any[] = [];
      try {
        const hasRS = await db.schema.hasTable("referral_sources");
        if (hasRS) {
          topReferrers = await db("referral_sources")
            .where({ organization_id: orgId })
            .where(function () {
              this.where("referral_count_last_30d", ">", 0)
                .orWhere("recent_referral_count", ">", 0);
            })
            .orderByRaw("COALESCE(referral_count_last_30d, recent_referral_count, 0) DESC")
            .limit(5)
            .select(
              "gp_name as name",
              "practice_name as practice",
              db.raw("COALESCE(referral_count_last_30d, recent_referral_count, 0) as referrals_last_30d"),
              db.raw("COALESCE(prior_3_month_avg, monthly_average, 0) as monthly_avg"),
            );
        }
      } catch { /* non-blocking */ }

      // ── 7. Market Intelligence (cross-client patterns) ──
      let marketPatterns: any[] = [];
      try {
        const hasTable = await db.schema.hasTable("knowledge_heuristics");
        if (hasTable) {
          // Market patterns from collective intelligence with "growth" or "positioning" category
          marketPatterns = await db("knowledge_heuristics")
            .whereIn("category", ["growth", "positioning", "engagement"])
            .where("confidence", ">=", 0.4)
            .orderBy("updated_at", "desc")
            .limit(2);
        }
      } catch { /* non-blocking */ }

      return res.json({
        success: true,
        data: {
          networkInsights: networkInsights.length > 0 ? networkInsights : null,
          seasonalAlert,
          heroQuote,
          toneProfile,
          driftAlerts: driftAlerts.length > 0 ? driftAlerts : null,
          topReferrers: topReferrers.length > 0 ? topReferrers : null,
          marketPatterns: marketPatterns.length > 0 ? marketPatterns : null,
        },
      });
    } catch (error: any) {
      console.error("[network-intelligence]", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to load intelligence data",
      });
    }
  },
);

function tryParse(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}

export default router;
