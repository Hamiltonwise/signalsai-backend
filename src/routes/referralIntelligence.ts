/**
 * GP Referral Intelligence API
 *
 * GET /api/referral-intelligence
 *   Returns top referrers, drift alerts, and recommended action.
 *   Data source: existing PMS uploads (aggregated).
 *   Client-scoped: uses authenticated user's org.
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { aggregatePmsData } from "../utils/pms/pmsAggregator";

const referralIntelligenceRoutes = express.Router();

// Average procedure value for revenue estimation (configurable per specialty later)
const AVG_PROCEDURE_VALUE = 1500;
const DRIFT_THRESHOLD_DAYS = 60;
const MIN_REFERRALS_FOR_DRIFT = 3;

/**
 * Round to nearest $500 — never show false precision.
 */
function roundRevenue(amount: number): number {
  return Math.round(amount / 500) * 500;
}

/**
 * Parse YYYY-MM into a Date (1st of month).
 */
function monthToDate(ym: string): Date {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

// ─── Types ──────────────────────────────────────────────────────────

interface ReferrerRow {
  name: string;
  referrals: number;
  revenue: number;
  trend: "up" | "flat" | "down";
  recentReferrals: number;   // last 3 months
  priorReferrals: number;    // 3 months before that
}

interface DriftAlert {
  name: string;
  lastReferralMonth: string;
  daysSinceLastReferral: number;
  priorReferrals: number;     // how many they used to send
  annualValueAtRisk: number;  // estimated annual revenue at risk
}

interface RecommendedAction {
  gpName: string;
  referralsLastQuarter: number;
  daysSilent: number;
  estimatedAnnualValue: number;
  message: string;
}

// ─── GET /api/referral-intelligence ─────────────────────────────────

referralIntelligenceRoutes.get(
  "/",
  authenticateToken,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.user?.organization_id;
      if (!orgId) {
        return res.json({
          success: true,
          hasData: false,
          topReferrers: [],
          driftAlerts: [],
          recommendedAction: null,
        });
      }

      const locationId = req.query.location_id
        ? parseInt(String(req.query.location_id), 10)
        : undefined;

      const data = await aggregatePmsData(orgId, locationId);

      if (!data.months.length || !data.sources.length) {
        return res.json({
          success: true,
          hasData: false,
          topReferrers: [],
          driftAlerts: [],
          recommendedAction: null,
        });
      }

      // ── Build per-source monthly breakdown ──
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      // Build source → month → referrals map
      const sourceMonthMap = new Map<string, Map<string, { referrals: number; production: number }>>();

      for (const month of data.months) {
        for (const src of month.sources) {
          const name = src.name?.trim();
          if (!name) continue;

          if (!sourceMonthMap.has(name)) sourceMonthMap.set(name, new Map());
          const monthMap = sourceMonthMap.get(name)!;
          const existing = monthMap.get(month.month);
          if (existing) {
            existing.referrals += Number(src.referrals || 0);
            existing.production += Number(src.production || 0);
          } else {
            monthMap.set(month.month, {
              referrals: Number(src.referrals || 0),
              production: Number(src.production || 0),
            });
          }
        }
      }

      // ── Top Referrers with trend ──
      const topReferrers: ReferrerRow[] = [];

      for (const src of data.sources) {
        // Only include doctor referrers (skip self-referral sources)
        const name = src.name?.trim();
        if (!name) continue;

        const monthMap = sourceMonthMap.get(name);
        if (!monthMap) continue;

        let recentReferrals = 0;
        let priorReferrals = 0;

        for (const [ym, mdata] of monthMap) {
          const d = monthToDate(ym);
          if (d >= threeMonthsAgo) {
            recentReferrals += mdata.referrals;
          } else if (d >= sixMonthsAgo) {
            priorReferrals += mdata.referrals;
          }
        }

        const trend: "up" | "flat" | "down" =
          recentReferrals > priorReferrals * 1.2
            ? "up"
            : recentReferrals < priorReferrals * 0.8
              ? "down"
              : "flat";

        topReferrers.push({
          name,
          referrals: src.referrals,
          revenue: roundRevenue(src.referrals * AVG_PROCEDURE_VALUE),
          trend,
          recentReferrals,
          priorReferrals,
        });
      }

      // Sort by revenue descending
      topReferrers.sort((a, b) => b.revenue - a.revenue);

      // ── Drift Alerts ──
      const driftAlerts: DriftAlert[] = [];

      for (const [name, monthMap] of sourceMonthMap) {
        // Total referrals from this source
        let totalRefs = 0;
        let lastMonth = "";

        for (const [ym, mdata] of monthMap) {
          totalRefs += mdata.referrals;
          if (ym > lastMonth) lastMonth = ym;
        }

        // Must have sent at least MIN_REFERRALS_FOR_DRIFT referrals historically
        if (totalRefs < MIN_REFERRALS_FOR_DRIFT) continue;

        // Check if silent for DRIFT_THRESHOLD_DAYS
        if (!lastMonth) continue;
        const lastDate = monthToDate(lastMonth);
        // Use end of that month as last activity
        lastDate.setMonth(lastDate.getMonth() + 1);
        lastDate.setDate(0); // last day of the month

        const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86_400_000);

        if (daysSince >= DRIFT_THRESHOLD_DAYS) {
          // Estimate annual value: average referrals per month × 12 × procedure value
          const months = monthMap.size;
          const avgPerMonth = totalRefs / Math.max(months, 1);
          const annualValue = roundRevenue(avgPerMonth * 12 * AVG_PROCEDURE_VALUE);

          driftAlerts.push({
            name,
            lastReferralMonth: lastMonth,
            daysSinceLastReferral: daysSince,
            priorReferrals: totalRefs,
            annualValueAtRisk: annualValue,
          });
        }
      }

      // Sort by annual value at risk descending
      driftAlerts.sort((a, b) => b.annualValueAtRisk - a.annualValueAtRisk);

      // ── This Week's Move ──
      let recommendedAction: RecommendedAction | null = null;

      if (driftAlerts.length > 0) {
        const top = driftAlerts[0];
        recommendedAction = {
          gpName: top.name,
          referralsLastQuarter: top.priorReferrals,
          daysSilent: top.daysSinceLastReferral,
          estimatedAnnualValue: top.annualValueAtRisk,
          message: `Dr. ${top.name.replace(/^dr\.?\s*/i, "")} sent you ${top.priorReferrals} referral${top.priorReferrals !== 1 ? "s" : ""} previously. They haven't referred in ${top.daysSinceLastReferral} days. A thank-you call this week could recover an estimated $${top.annualValueAtRisk.toLocaleString()} in annual revenue.`,
        };
      }

      return res.json({
        success: true,
        hasData: true,
        topReferrers: topReferrers.slice(0, 20),
        driftAlerts: driftAlerts.slice(0, 10),
        recommendedAction,
      });
    } catch (error: any) {
      console.error("[ReferralIntelligence] Error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to compute referral intelligence.",
      });
    }
  },
);

export default referralIntelligenceRoutes;
