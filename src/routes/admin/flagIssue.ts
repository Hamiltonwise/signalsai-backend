/**
 * Flag Issue Route
 *
 * POST /api/admin/flag-issue
 * Creates a dream_team_task for bug/issue reports from the admin UI.
 * Replaces verbal bug reports.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const flagIssueRoutes = express.Router();

flagIssueRoutes.post(
  "/flag-issue",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { description } = req.body;

      if (!description?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Description is required" });
      }

      const title = description.trim().length > 80
        ? description.trim().slice(0, 77) + "..."
        : description.trim();

      const [task] = await db("dream_team_tasks")
        .insert({
          title: `[Bug Flag] ${title}`,
          owner_name: "Corey",
          description: description.trim(),
          priority: "normal",
          status: "open",
          source_type: "manual",
        })
        .returning("*");

      return res.json({ success: true, task });
    } catch (err) {
      console.error("[FlagIssue] Error creating task:", err);
      return res
        .status(500)
        .json({ success: false, error: "Failed to create issue" });
    }
  }
);

export default flagIssueRoutes;
