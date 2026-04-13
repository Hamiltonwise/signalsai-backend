/**
 * Messages API -- Internal team messaging.
 *
 * GET  /api/messages       - List messages for current user
 * POST /api/messages       - Send a new message
 * PATCH /api/messages/:id/read - Mark a message as read
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";
import type { Response } from "express";

const messagesRoutes = express.Router();

// All routes require authentication + RBAC
messagesRoutes.use(authenticateToken, rbacMiddleware);

/**
 * GET /api/messages
 * List messages for the current user: sent, received, or team-wide (recipient_id IS NULL).
 * Query params: org_context_id, limit, offset
 */
messagesRoutes.get("/", async (req: RBACRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const orgContextId = req.query.org_context_id
      ? Number(req.query.org_context_id)
      : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let query = db("messages")
      .where(function () {
        // Messages sent to this user, sent by this user, or team-wide
        this.where("sender_id", userId)
          .orWhere("recipient_id", userId)
          .orWhereNull("recipient_id");
      })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    if (orgContextId) {
      query = query.andWhere("org_context_id", orgContextId);
    }

    const messages = await query.select("messages.*");

    // Get unread count (messages TO this user or team-wide, not sent by this user, not yet read)
    const unreadResult = await db("messages")
      .where(function () {
        this.where("recipient_id", userId).orWhereNull("recipient_id");
      })
      .andWhere("sender_id", "!=", userId)
      .whereNull("read_at")
      .count("id as count")
      .first();

    const unreadCount = Number(unreadResult?.count ?? 0);

    return res.json({
      success: true,
      messages,
      unreadCount,
      currentUserId: userId,
    });
  } catch (err) {
    console.error("[Messages] GET error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch messages" });
  }
});

/**
 * POST /api/messages
 * Send a new message.
 * Body: { recipient_id?, org_context_id?, content, message_type? }
 */
messagesRoutes.post("/", async (req: RBACRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { recipient_id, org_context_id, content, message_type } = req.body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Message content is required" });
    }

    const validTypes = ["text", "note", "decision", "action_item"];
    const type = validTypes.includes(message_type) ? message_type : "text";

    const [message] = await db("messages")
      .insert({
        sender_id: userId,
        recipient_id: recipient_id || null,
        org_context_id: org_context_id || null,
        content: content.trim(),
        message_type: type,
      })
      .returning("*");

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("[Messages] POST error:", err);
    return res.status(500).json({ success: false, error: "Failed to send message" });
  }
});

/**
 * PATCH /api/messages/:id/read
 * Mark a message as read.
 */
messagesRoutes.patch("/:id/read", async (req: RBACRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const messageId = Number(req.params.id);
    if (!messageId) {
      return res.status(400).json({ success: false, error: "Invalid message ID" });
    }

    // Only mark as read if the user is a recipient (direct or team-wide)
    const updated = await db("messages")
      .where("id", messageId)
      .andWhere(function () {
        this.where("recipient_id", userId).orWhereNull("recipient_id");
      })
      .whereNull("read_at")
      .update({ read_at: db.fn.now() });

    return res.json({ success: true, updated: updated > 0 });
  } catch (err) {
    console.error("[Messages] PATCH read error:", err);
    return res.status(500).json({ success: false, error: "Failed to mark message as read" });
  }
});

export default messagesRoutes;
