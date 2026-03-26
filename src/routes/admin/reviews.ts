/**
 * Review Notifications API — WO: Review Monitor
 *
 * POST /api/admin/reviews/poll           — trigger review polling for all practices
 * POST /api/admin/reviews/poll/:placeId  — poll single practice
 * GET  /api/admin/reviews                — list review notifications
 * PATCH /api/admin/reviews/:id           — update status (respond/dismiss)
 * POST /api/admin/reviews/:id/regenerate — regenerate AI response
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { pollAllPractices, pollPracticeReviews } from "../../services/reviewMonitor";

const reviewRoutes = express.Router();

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// ─── POST /poll — trigger full poll ─────────────────────────────────

reviewRoutes.post(
  "/poll",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      console.log("[Reviews] Manual poll triggered");
      const results = await pollAllPractices();
      const totalNew = results.reduce((s, r) => s + r.newReviews, 0);

      return res.json({
        success: true,
        practicesPolled: results.length,
        newReviews: totalNew,
        results,
      });
    } catch (error: any) {
      console.error("[Reviews] Poll error:", error.message);
      return res.status(500).json({ success: false, error: "Poll failed" });
    }
  },
);

// ─── POST /poll/:placeId — poll single practice ─────────────────────

reviewRoutes.post(
  "/poll/:placeId",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { placeId } = req.params;
      const { orgId, locationId, practiceName, specialty } = req.body;

      const result = await pollPracticeReviews(
        orgId || 0,
        locationId || null,
        placeId,
        practiceName || "Practice",
        specialty || "practice",
      );

      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Reviews] Single poll error:", error.message);
      return res.status(500).json({ success: false, error: "Poll failed" });
    }
  },
);

// ─── GET / — list review notifications ──────────────────────────────

reviewRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const {
        status,
        organization_id,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = db("review_notifications")
        .orderBy("created_at", "desc")
        .limit(Number(limit))
        .offset(Number(offset));

      if (status) query = query.where({ status });
      if (organization_id) query = query.where({ organization_id });

      const reviews = await query;

      const [{ count }] = await db("review_notifications")
        .where(status ? { status } : {})
        .where(organization_id ? { organization_id } : {})
        .count("id as count");

      return res.json({
        success: true,
        reviews,
        total: Number(count),
      });
    } catch (error: any) {
      console.error("[Reviews] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch reviews" });
    }
  },
);

// ─── PATCH /:id — update review status ──────────────────────────────

reviewRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, ai_response } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (status) updates.status = status;
      if (ai_response !== undefined) updates.ai_response = ai_response;

      await db("review_notifications").where({ id }).update(updates);

      const review = await db("review_notifications").where({ id }).first();
      return res.json({ success: true, review });
    } catch (error: any) {
      console.error("[Reviews] Update error:", error.message);
      return res.status(500).json({ success: false, error: "Update failed" });
    }
  },
);

// ─── POST /:id/regenerate — regenerate AI response ──────────────────

reviewRoutes.post(
  "/:id/regenerate",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      const review = await db("review_notifications").where({ id }).first();
      if (!review) {
        return res.status(404).json({ success: false, error: "Review not found" });
      }

      const org = await db("organizations").where({ id: review.organization_id }).first();
      const practiceName = org?.name || "Practice";

      const client = getAnthropic();
      const response = await client.messages.create({
        model: LLM_MODEL,
        max_tokens: 300,
        system: `You write professional, warm reply responses to Google reviews on behalf of dental and medical practices. Rules:
- Thank the reviewer by first name
- If positive (4-5 stars): express gratitude, mention something specific, invite them to share with friends
- If negative (1-2 stars): empathize, apologize, invite to contact office directly
- If neutral (3 stars): thank, acknowledge feedback, express commitment to improvement
- Keep under 80 words. Sound human, not corporate. No emojis.
- Sign off with the practice name`,
        messages: [
          {
            role: "user",
            content: `Practice: ${practiceName}
Reviewer: ${review.reviewer_name || "Anonymous"}
Rating: ${review.star_rating}/5 stars
Review: "${review.review_text || ""}"

Write a fresh reply (different from any previous version).`,
          },
        ],
      });

      const aiResponse =
        response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

      await db("review_notifications")
        .where({ id })
        .update({ ai_response: aiResponse, updated_at: new Date() });

      return res.json({ success: true, ai_response: aiResponse });
    } catch (error: any) {
      console.error("[Reviews] Regenerate error:", error.message);
      return res.status(500).json({ success: false, error: "Regeneration failed" });
    }
  },
);

export default reviewRoutes;
