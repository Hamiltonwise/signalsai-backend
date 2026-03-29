/**
 * Milestone Cards -- Lemonis Protocol check-in moments
 *
 * GET /api/user/milestone-card
 * Returns the current active milestone card (Day 30, Day 60, Day 180) if applicable.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const milestoneCardRoutes = express.Router();

milestoneCardRoutes.get(
  "/milestone-card",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, card: null });

      const org = await db("organizations").where({ id: orgId }).first("created_at", "owner_profile");
      if (!org?.created_at) return res.json({ success: true, card: null });

      const createdAt = new Date(org.created_at);
      const daysActive = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);

      // Determine which milestone we're at (show for 7 days after the milestone)
      let milestone: number | null = null;
      if (daysActive >= 30 && daysActive <= 37) milestone = 30;
      else if (daysActive >= 60 && daysActive <= 67) milestone = 60;
      else if (daysActive >= 180 && daysActive <= 194) milestone = 180;

      if (!milestone) return res.json({ success: true, card: null });

      // Parse owner profile
      const profile = org.owner_profile
        ? (typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile)
        : null;

      // Get ranking data for the period
      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .limit(Math.ceil(milestone / 7) + 1)
        .select("position", "rank_score", "competitor_name", "client_review_count", "competitor_review_count", "week_start");

      const latest = snapshots[0];
      const earliest = snapshots[snapshots.length - 1];

      // Build the card
      const moved = latest?.position && earliest?.position
        ? `Moved from #${earliest.position} to #${latest.position} in your market`
        : latest?.rank_score
          ? `Your score reached ${Math.round(Number(latest.rank_score))}`
          : null;

      const gap = latest?.competitor_name && !moved
        ? `${latest.competitor_name} is being tracked`
        : latest?.competitor_name && latest?.competitor_review_count && latest?.client_review_count
          ? `${latest.competitor_name} has ${latest.competitor_review_count - latest.client_review_count} more reviews`
          : null;

      // Count actions taken
      const actionsCount = await db("behavioral_events")
        .where({ organization_id: orgId })
        .where("created_at", ">=", createdAt)
        .count("id as count")
        .first();

      // Check if the Sunday fear was resolved (first win exists)
      const orgFull = await db("organizations").where({ id: orgId }).first("first_win_attributed_at");
      const fearResolved = !!orgFull?.first_win_attributed_at;

      // Get win detail for the resolution callback
      let winDetail: string | null = null;
      if (fearResolved) {
        const winEvent = await db("behavioral_events")
          .where({ organization_id: orgId, event_type: "first_win.achieved" })
          .orderBy("created_at", "desc")
          .first("metadata");
        if (winEvent?.metadata) {
          const meta = typeof winEvent.metadata === "string" ? JSON.parse(winEvent.metadata) : winEvent.metadata;
          winDetail = meta?.detail || null;
        }
      }

      const card = {
        milestone,
        sunday_fear: profile?.sunday_fear || null,
        sunday_fear_resolved: fearResolved,
        sunday_fear_resolution: winDetail,
        vision_3yr: profile?.vision_3yr || null,
        moved,
        gap,
        actions_taken: Number(actionsCount?.count || 0),
      };

      return res.json({ success: true, card });
    } catch (error: any) {
      console.error("[MilestoneCard] Error:", error.message);
      return res.json({ success: true, card: null });
    }
  },
);

export default milestoneCardRoutes;
