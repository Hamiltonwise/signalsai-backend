/**
 * Enhanced Progress Report API -- client-facing annual view
 *
 * GET /api/user/progress-report
 *   Returns: year_summary, milestones, trajectory_statements
 *   All data scoped to the authenticated user's organization.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const userProgressRoutes = express.Router();

function tryParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

userProgressRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, data: null });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      const startDate = org?.created_at ? new Date(org.created_at) : new Date();
      const daysActive = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86_400_000));

      // --- Ranking history: earliest vs latest ---
      const earliestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "asc")
        .first();
      const latestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      const startPosition = earliestRanking?.rank_position ?? null;
      const currentPosition = latestRanking?.rank_position ?? null;
      const positionDelta = startPosition && currentPosition ? startPosition - currentPosition : null;

      // Reviews from ranking raw_data
      const getReviews = (ranking: any): number | null => {
        if (!ranking?.raw_data) return null;
        const data = typeof ranking.raw_data === "string" ? tryParse(ranking.raw_data) : ranking.raw_data;
        return data?.client_gbp?.totalReviewCount ?? null;
      };
      const startReviews = getReviews(earliestRanking);
      const currentReviews = getReviews(latestRanking);
      const reviewsGained = startReviews != null && currentReviews != null ? currentReviews - startReviews : null;

      // Top competitor from latest ranking
      const topCompetitorName = (() => {
        if (!latestRanking?.raw_data) return null;
        const data = typeof latestRanking.raw_data === "string" ? tryParse(latestRanking.raw_data) : latestRanking.raw_data;
        const comps = data?.competitors || data?.competitor_rankings;
        if (Array.isArray(comps) && comps.length > 0) {
          return comps[0]?.name || comps[0]?.business_name || null;
        }
        return null;
      })();
      const topCompetitorReviews = (() => {
        if (!latestRanking?.raw_data) return null;
        const data = typeof latestRanking.raw_data === "string" ? tryParse(latestRanking.raw_data) : latestRanking.raw_data;
        const comps = data?.competitors || data?.competitor_rankings;
        if (Array.isArray(comps) && comps.length > 0) {
          return comps[0]?.reviewCount || comps[0]?.review_count || null;
        }
        return null;
      })();

      // --- GP retention (referral sources active first 30d vs last 30d) ---
      // Uses behavioral_events or referral data if available
      const thirtyDaysAfterStart = new Date(startDate.getTime() + 30 * 86_400_000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

      const earlyGPs = await db("behavioral_events")
        .where({ event_type: "referral.received" })
        .whereRaw("(properties->>'organization_id')::int = ?", [orgId])
        .where("created_at", ">=", startDate)
        .where("created_at", "<=", thirtyDaysAfterStart)
        .select(db.raw("DISTINCT properties->>'referrer_name' as gp_name"));

      const recentGPs = await db("behavioral_events")
        .where({ event_type: "referral.received" })
        .whereRaw("(properties->>'organization_id')::int = ?", [orgId])
        .where("created_at", ">=", thirtyDaysAgo)
        .select(db.raw("DISTINCT properties->>'referrer_name' as gp_name"));

      const earlySet = new Set((earlyGPs as any[]).map((r) => r.gp_name).filter(Boolean));
      const recentSet = new Set((recentGPs as any[]).map((r) => r.gp_name).filter(Boolean));
      const gpsRetained = [...earlySet].filter((gp) => recentSet.has(gp)).length;
      const gpsLost = [...earlySet].filter((gp) => !recentSet.has(gp)).length;

      // --- Milestones ---
      const milestones = await db("milestone_notifications")
        .where({ organization_id: orgId })
        .orderBy("created_at", "desc")
        .limit(20)
        .select("id", "milestone_type", "headline", "detail", "competitor_name", "old_value", "new_value", "created_at");

      // --- Trajectory statements (velocity-based, not AI) ---
      const trajectoryStatements: string[] = [];

      // Weekly review velocity
      const weeksActive = Math.max(1, Math.floor(daysActive / 7));
      const weeklyReviewVelocity = reviewsGained != null ? reviewsGained / weeksActive : 0;

      if (weeklyReviewVelocity > 0 && topCompetitorReviews && currentReviews && topCompetitorReviews > currentReviews) {
        const gap = topCompetitorReviews - currentReviews;
        const weeksToPass = Math.ceil(gap / weeklyReviewVelocity);
        const passDate = new Date(Date.now() + weeksToPass * 7 * 86_400_000);
        const dateStr = passDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
        trajectoryStatements.push(
          `At current pace: you pass ${topCompetitorName || "the #1 competitor"} in reviews by ${dateStr}.`
        );
      }

      // Position trajectory
      if (positionDelta && positionDelta > 0 && daysActive > 30) {
        const positionsPerMonth = positionDelta / (daysActive / 30);
        if (currentPosition && currentPosition > 1) {
          const monthsToFirst = Math.ceil((currentPosition - 1) / positionsPerMonth);
          trajectoryStatements.push(
            `At current pace: you reach #1 in your market in ${monthsToFirst} month${monthsToFirst !== 1 ? "s" : ""}.`
          );
        }
      }

      // Review milestone
      if (weeklyReviewVelocity > 0 && currentReviews) {
        const nextMilestone = Math.ceil(currentReviews / 50) * 50;
        const reviewsNeeded = nextMilestone - currentReviews;
        const weeksToMilestone = Math.ceil(reviewsNeeded / weeklyReviewVelocity);
        const milestoneDate = new Date(Date.now() + weeksToMilestone * 7 * 86_400_000);
        const dateStr = milestoneDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
        trajectoryStatements.push(
          `At current pace: you hit ${nextMilestone} total reviews by ${dateStr}.`
        );
      }

      // Fallback if no trajectory data
      if (trajectoryStatements.length === 0) {
        trajectoryStatements.push(
          "At current pace: your first trajectory projection appears after 30 days of data."
        );
      }

      // Competitor moves caught (from behavioral events)
      const competitorMoves = await db("behavioral_events")
        .where({ organization_id: orgId })
        .where("event_type", "like", "competitor.%")
        .count("id as count")
        .first();

      // First win
      const firstWinDate = org?.first_win_attributed_at || null;
      const practiceName = org?.name || "Your business";

      return res.json({
        success: true,
        data: {
          year_summary: {
            start_date: startDate.toISOString(),
            days_active: daysActive,
            practice_name: practiceName,
            first_win_date: firstWinDate,
            competitor_moves_caught: Number(competitorMoves?.count || 0),
            positions_gained: positionDelta,
            start_position: startPosition,
            current_position: currentPosition,
            reviews_gained: reviewsGained,
            current_reviews: currentReviews,
            gps_retained: gpsRetained,
            gps_lost: gpsLost,
          },
          milestones: milestones.map((m: any) => ({
            id: m.id,
            type: m.milestone_type,
            headline: m.headline,
            detail: m.detail,
            competitor: m.competitor_name,
            date: m.created_at,
          })),
          trajectory_statements: trajectoryStatements.slice(0, 3),
        },
      });
    } catch (error: any) {
      console.error("[UserProgress] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate report" });
    }
  },
);

export default userProgressRoutes;

// T2 registers this route.
