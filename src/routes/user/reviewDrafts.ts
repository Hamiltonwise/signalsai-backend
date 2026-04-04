/**
 * User-Facing Review Drafts API (WO-49)
 *
 * GET  /api/user/review-drafts      -- list review notifications with AI drafts
 * PATCH /api/user/review-drafts/:id -- approve, edit, skip, or dismiss a draft
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { approveAndPostReview } from "../../services/gbpReviewReply";

const reviewDraftRoutes = express.Router();

// ─── GET /api/user/review-drafts ──────────────────────────────────

reviewDraftRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, reviews: [] });

      const hasTable = await db.schema.hasTable("review_notifications");
      if (!hasTable) return res.json({ success: true, reviews: [] });

      const reviews = await db("review_notifications")
        .where({ organization_id: orgId })
        .whereIn("status", ["new", "responded"])
        .orderBy("created_at", "desc")
        .limit(20)
        .select(
          "id",
          "reviewer_name",
          "star_rating",
          "review_text",
          "ai_response",
          "status",
          "review_published_at",
          "created_at"
        );

      return res.json({ success: true, reviews });
    } catch (error: any) {
      console.error("[ReviewDrafts] Error:", error.message);
      return res.json({ success: true, reviews: [] });
    }
  }
);

// ─── PATCH /api/user/review-drafts/:id ────────────────────────────

reviewDraftRoutes.patch(
  "/:id",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      const { id } = req.params;
      const { action, editedResponse } = req.body;

      if (!orgId) return res.status(400).json({ success: false });

      const review = await db("review_notifications")
        .where({ id, organization_id: orgId })
        .first();

      if (!review) return res.status(404).json({ success: false, error: "Review not found" });

      if (action === "approve") {
        const replyText = editedResponse || review.ai_response;
        const result = await approveAndPostReview(orgId, Number(id), replyText);

        if (result.posted) {
          return res.json({ success: true, message: "Response posted to Google.", posted: true });
        }
        return res.json({
          success: true,
          message: result.error || "Response approved.",
          posted: false,
        });
      }

      if (action === "skip" || action === "dismiss") {
        await db("review_notifications").where({ id }).update({
          status: "dismissed",
          updated_at: new Date(),
        });
        return res.json({ success: true, message: "Review dismissed." });
      }

      if (action === "edit") {
        await db("review_notifications").where({ id }).update({
          ai_response: editedResponse,
          updated_at: new Date(),
        });
        return res.json({ success: true, message: "Draft updated." });
      }

      return res.status(400).json({ success: false, error: "Invalid action" });
    } catch (error: any) {
      console.error("[ReviewDrafts] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to update" });
    }
  }
);

export default reviewDraftRoutes;
