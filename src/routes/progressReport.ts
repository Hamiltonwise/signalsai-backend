/**
 * Progress Report API
 *
 * GET /api/progress-report — 365-day progress report for the logged-in user's org.
 * Aggregates tasks, ranking history, behavioral events, and agent outputs.
 */

import express from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { rbacMiddleware, RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const progressReportRoutes = express.Router();

progressReportRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, data: null, message: "No organization" });
      }

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // ─── Year in Review stats ─────────────────────────────────

      // Tasks completed this year
      const tasksCompleted = await db("tasks")
        .where({ organization_id: orgId, status: "complete" })
        .where("completed_at", ">=", oneYearAgo)
        .count("* as count")
        .first();
      const taskCount = parseInt((tasksCompleted as any)?.count || "0", 10);

      // Ranking movement: earliest vs latest ranking this year
      const earliestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .where("created_at", ">=", oneYearAgo)
        .orderBy("created_at", "asc")
        .first();
      const latestRanking = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      const startPosition = earliestRanking?.rank_position ?? null;
      const currentPosition = latestRanking?.rank_position ?? null;
      const startScore = earliestRanking?.rank_score ? Number(earliestRanking.rank_score) : null;
      const currentScore = latestRanking?.rank_score ? Number(latestRanking.rank_score) : null;
      const positionDelta = startPosition && currentPosition ? startPosition - currentPosition : null;

      // Reviews gained (from behavioral_events)
      const reviewEvents = await db("behavioral_events")
        .where("event_type", "checkup.scan_completed")
        .where("created_at", ">=", oneYearAgo)
        .whereRaw("properties->>'practice_name' IS NOT NULL")
        .orderBy("created_at", "desc")
        .limit(10);

      // Estimate review growth from ranking raw data if available
      const startReviews = earliestRanking?.raw_data?.client_gbp?.totalReviewCount
        ?? (typeof earliestRanking?.raw_data === "string" ? tryParse(earliestRanking.raw_data)?.client_gbp?.totalReviewCount : null)
        ?? null;
      const currentReviews = latestRanking?.raw_data?.client_gbp?.totalReviewCount
        ?? (typeof latestRanking?.raw_data === "string" ? tryParse(latestRanking.raw_data)?.client_gbp?.totalReviewCount : null)
        ?? null;
      const reviewsGained = startReviews && currentReviews ? currentReviews - startReviews : null;

      // Agent outputs this year
      const agentOutputCount = await db("agent_results")
        .where({ organization_id: orgId })
        .whereNot("status", "archived")
        .where("created_at", ">=", oneYearAgo)
        .count("* as count")
        .first();
      const totalAgentOutputs = parseInt((agentOutputCount as any)?.count || "0", 10);

      // Revenue impact estimate (from task impacts + findings)
      const estimatedRevenueImpact = (reviewsGained || 0) * 45 * 12 + (positionDelta && positionDelta > 0 ? positionDelta * 1800 : 0);

      // ─── Goal Progress ────────────────────────────────────────

      // Check if org has goals set (stored in organizations.setup_progress or a dedicated field)
      const org = await db("organizations").where({ id: orgId }).first();
      const setupProgress = typeof org?.setup_progress === "string"
        ? tryParse(org.setup_progress)
        : org?.setup_progress;
      const goals = (setupProgress as any)?.goals || null;

      // ─── This Year's Moves — top 3 completed tasks with outcomes ─

      const topMoves = await db("tasks")
        .where({ organization_id: orgId, status: "complete" })
        .where("completed_at", ">=", oneYearAgo)
        .orderBy("completed_at", "desc")
        .limit(20)
        .select("title", "description", "completed_at", "metadata", "agent_type");

      // Build top moves with outcomes
      const movesWithOutcomes = topMoves.slice(0, 3).map((task: any) => {
        const meta = typeof task.metadata === "string" ? tryParse(task.metadata) : task.metadata;
        return {
          title: task.title,
          completedAt: task.completed_at,
          outcome: (meta as any)?.outcome || generateOutcome(task, positionDelta, reviewsGained),
        };
      });

      // ─── Next 90 Days — three specific actions ────────────────

      const next90Days = generateNext90Days(
        currentPosition,
        currentScore,
        currentReviews,
        latestRanking,
        goals,
      );

      return res.json({
        success: true,
        data: {
          yearInReview: {
            tasksCompleted: taskCount,
            agentOutputs: totalAgentOutputs,
            startPosition,
            currentPosition,
            positionDelta,
            startScore,
            currentScore,
            reviewsGained,
            estimatedRevenueImpact,
            periodStart: oneYearAgo.toISOString(),
            periodEnd: new Date().toISOString(),
          },
          goals,
          topMoves: movesWithOutcomes,
          next90Days,
        },
      });
    } catch (error: any) {
      console.error("[ProgressReport] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate report" });
    }
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────

function generateOutcome(
  task: any,
  positionDelta: number | null,
  reviewsGained: number | null,
): string {
  const title = (task.title || "").toLowerCase();

  if (/review/i.test(title)) {
    if (reviewsGained && reviewsGained > 0) {
      return `Contributed to ${reviewsGained} new reviews this year`;
    }
    return "Improved review velocity and local search presence";
  }
  if (/photo/i.test(title)) {
    return "GBP photos increase click-through rate by up to 35%";
  }
  if (/rank|position/i.test(title)) {
    if (positionDelta && positionDelta > 0) {
      return `Part of a ${positionDelta}-position improvement this year`;
    }
    return "Contributed to ranking analysis and competitive intelligence";
  }
  if (/website|site/i.test(title)) {
    return "Established online presence through PatientPath";
  }
  return "Completed as part of your market improvement strategy";
}

function generateNext90Days(
  currentPosition: number | null,
  currentScore: number | null,
  currentReviews: number | null,
  latestRanking: any,
  goals: any,
): Array<{ title: string; why: string; impact: string }> {
  const actions: Array<{ title: string; why: string; impact: string; priority: number }> = [];

  // Always recommend reviews if not #1
  if (currentPosition && currentPosition > 1) {
    actions.push({
      title: "Collect 12 new Google reviews (1/week for 12 weeks)",
      why: "Review count is the single largest factor in local search ranking. Consistency signals to Google that your business is active.",
      impact: "Projected to move up 1-2 positions",
      priority: 1,
    });
  }

  // GBP optimization
  if (currentScore && currentScore < 70) {
    actions.push({
      title: "Complete your Google Business Profile — photos, hours, services, description",
      why: "Incomplete profiles rank 23% lower in local search. This is the fastest fix with the most immediate impact.",
      impact: "5-15 point score improvement",
      priority: 2,
    });
  }

  // Review response
  actions.push({
    title: "Respond to every Google review within 24 hours for the next 90 days",
    why: "Google tracks response rate as a ranking signal. Businesses that respond to reviews rank higher and convert more searches into inquiries.",
    impact: "Improved rating trajectory and customer trust",
    priority: 3,
  });

  // Referral program
  if (currentPosition && currentPosition <= 3) {
    actions.push({
      title: "Launch a referral program with 3 referring providers",
      why: "You're already in the top 3 for search. The next growth lever is direct referral relationships.",
      impact: "2-5 new customers per referring source per month",
      priority: 4,
    });
  }

  // Goal-specific action
  if (goals?.sellBy) {
    actions.push({
      title: "Document all systems and SOPs for business valuation",
      why: `With a target exit of ${goals.sellBy}, buyers evaluate systematized businesses at 2-3x higher multiples.`,
      impact: "Directly increases business valuation",
      priority: 5,
    });
  }

  return actions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(({ title, why, impact }) => ({ title, why, impact }));
}

function tryParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

export default progressReportRoutes;
