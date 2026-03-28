/**
 * Streaks API -- Growth streak, Action streak, Review streak
 *
 * GET /api/user/streaks
 * Returns the highest active streak for the org.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const streakRoutes = express.Router();

streakRoutes.get(
  "/streaks",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, streak: null });
      }

      // Growth Streak: consecutive weeks where rank_score held or improved
      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .whereNotNull("rank_score")
        .orderBy("week_start", "desc")
        .select("rank_score", "week_start", "client_review_count");

      let growthStreak = 0;
      for (let i = 0; i < snapshots.length - 1; i++) {
        const current = Number(snapshots[i].rank_score);
        const previous = Number(snapshots[i + 1].rank_score);
        if (current >= previous) {
          growthStreak++;
        } else {
          break;
        }
      }

      // Review Streak: consecutive weeks where review_count increased
      let reviewStreak = 0;
      for (let i = 0; i < snapshots.length - 1; i++) {
        const current = snapshots[i].client_review_count ?? 0;
        const previous = snapshots[i + 1].client_review_count ?? 0;
        if (current > previous) {
          reviewStreak++;
        } else {
          break;
        }
      }

      // Action Streak: consecutive weeks with one_action.completed events
      const actionEvents = await db("behavioral_events")
        .where({ organization_id: orgId, event_type: "one_action.completed" })
        .orderBy("created_at", "desc")
        .select("created_at");

      let actionStreak = 0;
      if (actionEvents.length > 0) {
        const now = new Date();
        let weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        for (let w = 0; w < 52; w++) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);
          const hasAction = actionEvents.some((e: { created_at: string }) => {
            const d = new Date(e.created_at);
            return d >= weekStart && d < weekEnd;
          });
          if (hasAction) {
            actionStreak++;
            weekStart = new Date(weekStart);
            weekStart.setDate(weekStart.getDate() - 7);
          } else {
            break;
          }
        }
      }

      // Return the highest streak
      const streaks = [
        { type: "growth" as const, count: growthStreak, label: "consecutive growth" },
        { type: "reviews" as const, count: reviewStreak, label: "adding reviews" },
        { type: "actions" as const, count: actionStreak, label: "acting on intelligence" },
      ].filter((s) => s.count >= 2);

      streaks.sort((a, b) => b.count - a.count);
      const best = streaks[0] || null;

      return res.json({
        success: true,
        streak: best ? { type: best.type, count: best.count, label: best.label } : null,
      });
    } catch (error: any) {
      console.error("[Streaks] Error:", error.message);
      return res.json({ success: true, streak: null });
    }
  },
);

export default streakRoutes;
