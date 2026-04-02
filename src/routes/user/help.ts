/**
 * Help Route -- The endpoint HelpButton talks to.
 *
 * POST /api/user/help
 *
 * When a customer taps HelpButton and types "I can't find my password"
 * or "the website editor is broken", this endpoint:
 * 1. Classifies the intent (bug, feature, concern, billing)
 * 2. Creates a dream_team_task with priority and blast radius
 * 3. Logs a behavioral_event so the Bug Triage Agent sees patterns
 * 4. Returns a human response
 *
 * This is the pipe that was missing. HelpButton existed. dream_team_tasks
 * existed. The Concierge classification existed. They just weren't connected.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";

const helpRoutes = express.Router();

// Reuse the same classification logic from Concierge (ceoChat.ts)
const RED_KEYWORDS = [
  "pricing", "billing", "delete", "cancel", "refund",
  "subscription", "charge", "payment",
];

const BUG_KEYWORDS = [
  "broken", "not working", "error", "wrong", "issue", "fix",
  "bug", "crash", "failing", "fails", "doesn't work", "won't load",
  "can't login", "can't log in", "password", "blank", "stuck",
  "won't save", "not loading", "disappeared", "missing",
];

const FEATURE_KEYWORDS = [
  "can you add", "wish", "would be nice", "how do i",
  "is there a way", "can i", "feature",
];

interface HelpClassification {
  type: "bug" | "feature" | "question" | "billing";
  priority: "normal" | "high" | "urgent";
  blastRadius: "green" | "yellow" | "red";
}

function classifyHelp(message: string): HelpClassification {
  const lower = message.toLowerCase();

  if (RED_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { type: "billing", priority: "urgent", blastRadius: "red" };
  }

  if (BUG_KEYWORDS.some((kw) => lower.includes(kw))) {
    const isAuth = lower.includes("login") || lower.includes("password") || lower.includes("auth");
    return {
      type: "bug",
      priority: isAuth ? "high" : "normal",
      blastRadius: isAuth ? "yellow" : "green",
    };
  }

  if (FEATURE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { type: "feature", priority: "normal", blastRadius: "green" };
  }

  return { type: "question", priority: "normal", blastRadius: "green" };
}

const RESPONSES: Record<string, string> = {
  bug: "Got it. This is flagged and someone will look into it.",
  feature: "Noted. Your feedback shapes what gets built next.",
  question: "Got it. Someone will take a look.",
  billing: "This is flagged as urgent. Someone will reach out shortly.",
};

helpRoutes.post(
  "/help",
  authenticateToken,
  async (req, res) => {
    try {
      const { message, context } = req.body;
      const user = (req as any).user;

      if (!message?.trim()) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const classification = classifyHelp(message.trim());
      const truncatedTitle = message.trim().length > 80
        ? message.trim().slice(0, 77) + "..."
        : message.trim();

      // 1. Create dream_team_task
      let taskCreated = false;
      try {
        const hasTable = await db.schema.hasTable("dream_team_tasks");
        if (hasTable) {
          const insertData: Record<string, unknown> = {
            owner_name: "Help",
            title: `[${classification.type}] ${truncatedTitle}`,
            description: [
              message.trim(),
              "",
              `Reporter: ${user?.email || "unknown"}`,
              `Page: ${context?.page || "unknown"}`,
              `Viewport: ${context?.viewport || "unknown"}`,
              `Time: ${context?.timestamp || new Date().toISOString()}`,
            ].join("\n"),
            status: "open",
            priority: classification.priority,
            source_type: "help_button",
          };

          // Include extended columns if they exist
          const hasTypeCol = await db.schema.hasColumn("dream_team_tasks", "task_type");
          if (hasTypeCol) {
            insertData.task_type = classification.type;
            insertData.blast_radius = classification.blastRadius;
          }

          await db("dream_team_tasks").insert(insertData);
          taskCreated = true;
        }
      } catch (err: any) {
        console.error("[Help] Task creation failed:", err.message);
      }

      // 2. Log behavioral_event (so Bug Triage Agent sees patterns)
      const orgId = user?.organizationId || null;
      await BehavioralEventModel.create({
        event_type: `help.${classification.type}`,
        org_id: orgId,
        properties: {
          message: message.trim(),
          page: context?.page,
          viewport: context?.viewport,
          reporter: user?.email,
          classification: classification.type,
          priority: classification.priority,
          blast_radius: classification.blastRadius,
          task_created: taskCreated,
        },
      });

      return res.json({
        success: true,
        message: RESPONSES[classification.type],
      });
    } catch (err: any) {
      console.error("[Help] Error:", err.message || err);
      return res.status(500).json({
        success: false,
        error: "Something went wrong. Your message was not lost.",
      });
    }
  }
);

/**
 * POST /api/user/help/signal
 *
 * Frustration detection fires here. Rage clicks, idle, navigation loops.
 * Logged to behavioral_events so Bug Triage Agent sees patterns.
 * No task created (these are signals, not reports).
 */
helpRoutes.post(
  "/help/signal",
  authenticateToken,
  async (req, res) => {
    try {
      const { type, page, detail } = req.body;
      const user = (req as any).user;

      if (!type || !page) {
        return res.status(400).json({ success: false });
      }

      await BehavioralEventModel.create({
        event_type: `frustration.${type}`,
        org_id: user?.organizationId || null,
        properties: {
          page,
          detail,
          user: user?.email,
          timestamp: new Date().toISOString(),
        },
      });

      return res.json({ success: true });
    } catch {
      return res.status(500).json({ success: false });
    }
  }
);

export default helpRoutes;
