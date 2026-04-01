/**
 * Admin Tasks API -- Jo's "My Flags" task board
 *
 * GET   /api/admin/tasks      -- list dream_team_tasks with filters
 * PATCH /api/admin/tasks/:id  -- update status or priority
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const adminTasksRoutes = express.Router();

// ---- GET / -- List tasks with optional filters --------------------------------

adminTasksRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { status, source_type, blast_radius } = req.query;

      let query = db("dream_team_tasks")
        .select(
          "id",
          "title",
          "description",
          "status",
          "priority",
          "source_type",
          "owner_name",
          "created_at"
        )
        .orderByRaw(
          `CASE priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END`
        )
        .orderBy("created_at", "desc");

      // Optional columns that may exist from concierge migration
      const hasTypeCol = await db.schema.hasColumn("dream_team_tasks", "task_type");
      if (hasTypeCol) {
        query = query.select("task_type", "blast_radius");
      }

      if (status && typeof status === "string") {
        query = query.where("status", status);
      }

      if (source_type && typeof source_type === "string") {
        query = query.where("source_type", source_type);
      }

      // Filter by blast_radius (requires column to exist)
      if (blast_radius && typeof blast_radius === "string" && hasTypeCol) {
        query = query.where("blast_radius", blast_radius);
      }

      const tasks = await query;

      return res.json({ success: true, tasks });
    } catch (err: any) {
      console.error("[AdminTasks] GET error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load tasks" });
    }
  }
);

// ---- PATCH /:id -- Update task status or priority -----------------------------

adminTasksRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, priority } = req.body;

      const allowedStatuses = ["open", "in_progress", "resolved", "approved", "rejected"];
      const allowedPriorities = ["low", "normal", "high", "urgent"];

      const updates: Record<string, unknown> = {
        updated_at: new Date(),
      };

      if (status) {
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`,
          });
        }
        updates.status = status;
      }

      if (priority) {
        if (!allowedPriorities.includes(priority)) {
          return res.status(400).json({
            success: false,
            error: `Invalid priority. Allowed: ${allowedPriorities.join(", ")}`,
          });
        }
        updates.priority = priority;
      }

      if (!status && !priority) {
        return res.status(400).json({
          success: false,
          error: "Provide status or priority to update.",
        });
      }

      const updated = await db("dream_team_tasks")
        .where({ id })
        .update(updates)
        .returning("*");

      if (!updated || updated.length === 0) {
        return res.status(404).json({ success: false, error: "Task not found" });
      }

      // Log approval/rejection to behavioral_events
      if (status === "approved" || status === "rejected") {
        try {
          await db("behavioral_events").insert({
            event_type: `task.${status}`,
            properties: JSON.stringify({
              task_id: id,
              task_title: updated[0].title,
              decided_by: req.user?.email || "admin",
            }),
            created_at: new Date(),
          });
        } catch {
          // Non-critical, don't fail the request
        }
      }

      return res.json({ success: true, task: updated[0] });
    } catch (err: any) {
      console.error("[AdminTasks] PATCH error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update task" });
    }
  }
);

export default adminTasksRoutes;
