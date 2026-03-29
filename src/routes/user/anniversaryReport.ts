/**
 * Anniversary Report (U-NEW-5)
 *
 * GET /api/user/anniversary-report
 * Returns a structured report of the org's journey on Alloro:
 * months active, starting vs current rank, reviews gained,
 * milestones achieved, estimated revenue protected, top 3 moments.
 *
 * Suitable for a shareable/printable page on the frontend.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const anniversaryReportRoutes = express.Router();

anniversaryReportRoutes.get(
  "/anniversary-report",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, data: null, message: "No organization" });
      }

      // Get org creation date
      const org = await db("organizations").where({ id: orgId }).first();
      if (!org) {
        return res.json({ success: true, data: null, message: "Organization not found" });
      }

      const createdAt = new Date(org.created_at);
      const now = new Date();
      const monthsActive = Math.max(
        1,
        Math.round((now.getTime() - createdAt.getTime()) / (30.44 * 86_400_000)),
      );
      const daysActive = Math.round((now.getTime() - createdAt.getTime()) / 86_400_000);

      // If account is too new, return early indicator
      if (daysActive < 90) {
        return res.json({
          success: true,
          data: {
            tooEarly: true,
            daysActive,
            daysUntilReport: 90 - daysActive,
            monthsActive,
            createdAt: createdAt.toISOString(),
          },
        });
      }

      // ---- Ranking movement ----
      const earliestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .where("created_at", ">=", createdAt)
        .orderBy("created_at", "asc")
        .first();

      const latestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      const startPosition = earliestRanking?.rank_position ?? null;
      const currentPosition = latestRanking?.rank_position ?? null;
      const positionDelta =
        startPosition && currentPosition ? startPosition - currentPosition : null;

      // ---- Also check weekly snapshots for rank data ----
      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "asc");

      let snapshotStartPos = startPosition;
      let snapshotCurrentPos = currentPosition;
      if (snapshots.length >= 2) {
        snapshotStartPos = snapshotStartPos ?? snapshots[0].position;
        snapshotCurrentPos = snapshotCurrentPos ?? snapshots[snapshots.length - 1].position;
      }

      const effectiveStartPos = snapshotStartPos ?? startPosition;
      const effectiveCurrentPos = snapshotCurrentPos ?? currentPosition;
      const effectiveDelta =
        effectiveStartPos && effectiveCurrentPos
          ? effectiveStartPos - effectiveCurrentPos
          : positionDelta;

      // ---- Reviews gained ----
      const baselineReviews = org.checkup_review_count_at_creation ?? null;
      const latestReviewCount =
        snapshots.length > 0
          ? snapshots[snapshots.length - 1].client_review_count
          : null;

      // Also try from rankings raw data
      let rankingReviewCount: number | null = null;
      if (latestRanking?.raw_data) {
        const raw =
          typeof latestRanking.raw_data === "string"
            ? safeParse(latestRanking.raw_data)
            : latestRanking.raw_data;
        rankingReviewCount = raw?.client_gbp?.totalReviewCount ?? null;
      }

      const currentReviews = latestReviewCount ?? rankingReviewCount ?? null;
      const reviewsGained =
        baselineReviews != null && currentReviews != null
          ? currentReviews - baselineReviews
          : null;

      // ---- Milestones achieved ----
      let milestones: { title: string; achieved_at: string }[] = [];
      const hasMilestoneTable = await db.schema.hasTable("milestone_notifications");
      if (hasMilestoneTable) {
        milestones = await db("milestone_notifications")
          .where({ org_id: orgId })
          .orderBy("created_at", "asc")
          .select("title", "created_at as achieved_at")
          .limit(50);
      }

      // ---- Estimated revenue protected ----
      // avgCaseValue from checkup data or org config
      let avgCaseValue = 200; // universal fallback
      if (org.checkup_data) {
        const checkupData =
          typeof org.checkup_data === "string"
            ? safeParse(org.checkup_data)
            : org.checkup_data;
        if (checkupData?.avgCaseValue) {
          avgCaseValue = checkupData.avgCaseValue;
        }
      }

      // Review-driven growth estimate:
      // Each review ~ 0.03 conversion rate * avgCaseValue * 12 months
      const reviewRevenueProtected =
        reviewsGained && reviewsGained > 0
          ? Math.round(reviewsGained * 0.03 * avgCaseValue * 12)
          : 0;

      // Position improvement estimate:
      // Each position gained ~ 1800/yr in visibility value
      const positionRevenueProtected =
        effectiveDelta && effectiveDelta > 0
          ? Math.round(effectiveDelta * 1800)
          : 0;

      const totalRevenueProtected = reviewRevenueProtected + positionRevenueProtected;

      // ---- Top 3 moments ----
      const topMoments: { title: string; date: string; detail: string }[] = [];

      // Moment: First ranking
      if (earliestRanking) {
        topMoments.push({
          title: "First competitive analysis",
          date: new Date(earliestRanking.created_at).toISOString(),
          detail: `Ranked #${earliestRanking.rank_position || "?"} in your market`,
        });
      }

      // Moment: Biggest rank jump (from snapshots)
      if (snapshots.length >= 2) {
        let biggestJump = 0;
        let jumpWeek = "";
        for (let i = 1; i < snapshots.length; i++) {
          const prev = snapshots[i - 1].position;
          const curr = snapshots[i].position;
          if (prev && curr && prev - curr > biggestJump) {
            biggestJump = prev - curr;
            jumpWeek = snapshots[i].week_start;
          }
        }
        if (biggestJump > 0) {
          topMoments.push({
            title: "Biggest ranking jump",
            date: new Date(jumpWeek).toISOString(),
            detail: `Moved up ${biggestJump} position${biggestJump > 1 ? "s" : ""} in one week`,
          });
        }
      }

      // Moment: First milestone
      if (milestones.length > 0) {
        topMoments.push({
          title: milestones[0].title,
          date: new Date(milestones[0].achieved_at).toISOString(),
          detail: "Your first milestone on Alloro",
        });
      }

      // Moment: Review growth milestone (if > 10 reviews gained)
      if (reviewsGained && reviewsGained >= 10) {
        topMoments.push({
          title: `${reviewsGained} new reviews`,
          date: now.toISOString(),
          detail: `Your review count grew from ${baselineReviews} to ${currentReviews}`,
        });
      }

      // Sort by date and take top 3
      topMoments.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const top3 = topMoments.slice(0, 3);

      return res.json({
        success: true,
        data: {
          tooEarly: false,
          orgName: org.name || "Your Business",
          createdAt: createdAt.toISOString(),
          monthsActive,
          daysActive,
          ranking: {
            startPosition: effectiveStartPos,
            currentPosition: effectiveCurrentPos,
            positionDelta: effectiveDelta,
          },
          reviews: {
            baseline: baselineReviews,
            current: currentReviews,
            gained: reviewsGained,
          },
          milestones: milestones.map((m) => ({
            title: m.title,
            achievedAt: m.achieved_at,
          })),
          milestonesCount: milestones.length,
          revenueProtected: {
            fromReviews: reviewRevenueProtected,
            fromPosition: positionRevenueProtected,
            total: totalRevenueProtected,
          },
          topMoments: top3,
          snapshotCount: snapshots.length,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[AnniversaryReport] Error:", message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to generate anniversary report" });
    }
  },
);

function safeParse(str: string): Record<string, any> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export default anniversaryReportRoutes;
