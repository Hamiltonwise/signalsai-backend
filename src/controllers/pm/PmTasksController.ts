import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmTaskModel } from "../../models/PmTaskModel";
import { PmColumnModel } from "../../models/PmColumnModel";
import { db } from "../../database/connection";
import { logPmActivity } from "./pmActivityLogger";

function handleError(res: Response, error: unknown, operation: string): Response {
  console.error(`[PM-TASKS] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

// POST /api/pm/projects/:id/tasks
export async function createTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const projectId = req.params.id;
    const { title, description, priority, deadline, column_id, assigned_to, source } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Task title is required" });
    }

    if (!column_id) {
      return res.status(400).json({ success: false, error: "column_id is required" });
    }

    // Verify column belongs to this project
    const column = await PmColumnModel.findById(column_id);
    if (!column || column.project_id !== projectId) {
      return res.status(400).json({ success: false, error: "Invalid column for this project" });
    }

    const task = await db.transaction(async (trx) => {
      // Shift existing tasks down to make room at position 0
      await trx("pm_tasks")
        .where({ column_id })
        .increment("position", 1);

      // Backlog column auto-clears priority
      const effectivePriority = column.name === "Backlog" ? null : (priority || "P4");

      const created = await PmTaskModel.create(
        {
          project_id: projectId,
          column_id,
          title: title.trim(),
          description: description || null,
          priority: effectivePriority,
          deadline: deadline || (["P1", "P2"].includes(effectivePriority || "") ? new Date().toISOString() : null),
          position: 0,
          assigned_to: assigned_to || null,
          created_by: req.user!.userId,
          source: source || "manual",
        },
        trx
      );

      await logPmActivity(
        {
          project_id: projectId,
          task_id: created.id,
          user_id: req.user!.userId,
          action: "task_created",
          metadata: { column_name: column.name, source: source || "manual" },
        },
        trx
      );

      return created;
    });

    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    return handleError(res, error, "createTask");
  }
}

// PUT /api/pm/tasks/:id
export async function updateTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmTaskModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const { title, description, priority, deadline } = req.body;
    const updates: Record<string, unknown> = {};
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (title !== undefined) {
      updates.title = title.trim();
      changes.title = { old: existing.title, new: title.trim() };
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (priority !== undefined) {
      updates.priority = priority;
      changes.priority = { old: existing.priority, new: priority };
      // Auto-set deadline to today if P1/P2 and no deadline set yet
      if (["P1", "P2"].includes(priority) && !existing.deadline && deadline === undefined) {
        updates.deadline = new Date().toISOString();
        changes.deadline = { old: existing.deadline, new: updates.deadline };
      }
    }
    if (deadline !== undefined) {
      updates.deadline = deadline;
      changes.deadline = { old: existing.deadline, new: deadline };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    await PmTaskModel.updateById(id, updates);

    await logPmActivity({
      project_id: existing.project_id,
      task_id: id,
      user_id: req.user!.userId,
      action: "task_updated",
      metadata: changes,
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "updateTask");
  }
}

// PUT /api/pm/tasks/:id/move
export async function moveTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const { column_id: targetColumnId, position: targetPosition } = req.body;

    if (!targetColumnId || targetPosition === undefined) {
      return res.status(400).json({
        success: false,
        error: "column_id and position are required",
      });
    }

    const existing = await PmTaskModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const sourceColumnId = existing.column_id;

    // Get column names for logging
    const [sourceCol, targetCol] = await Promise.all([
      PmColumnModel.findById(sourceColumnId),
      PmColumnModel.findById(targetColumnId),
    ]);

    await db.transaction(async (trx) => {
      // Remove from source: shift tasks above the removed position down
      await trx("pm_tasks")
        .where({ column_id: sourceColumnId })
        .where("position", ">", existing.position)
        .decrement("position", 1);

      // Insert into target: shift tasks at or above target position up
      await trx("pm_tasks")
        .where({ column_id: targetColumnId })
        .where("position", ">=", targetPosition)
        .increment("position", 1);

      // Update the task itself
      const updates: Record<string, unknown> = {
        column_id: targetColumnId,
        position: targetPosition,
      };

      // Handle completion tracking
      if (targetCol?.name === "Done" && !existing.completed_at) {
        updates.completed_at = new Date();
      } else if (sourceCol?.name === "Done" && targetCol?.name !== "Done") {
        updates.completed_at = null;
      }

      // Backlog priority behavior
      if (targetCol?.name === "Backlog") {
        updates.priority = null;
      } else if (sourceCol?.name === "Backlog" && targetCol?.name !== "Backlog" && !existing.priority) {
        updates.priority = "P4";
      }

      await PmTaskModel.updateById(id, updates, trx);

      await logPmActivity(
        {
          project_id: existing.project_id,
          task_id: id,
          user_id: req.user!.userId,
          action: sourceColumnId === targetColumnId ? "task_reordered" : "task_moved",
          metadata: {
            from_column: sourceCol?.name,
            to_column: targetCol?.name,
            from_position: existing.position,
            to_position: targetPosition,
          },
        },
        trx
      );

      // If moved to Done, also log completion
      if (targetCol?.name === "Done" && !existing.completed_at) {
        await logPmActivity(
          {
            project_id: existing.project_id,
            task_id: id,
            user_id: req.user!.userId,
            action: "task_completed",
          },
          trx
        );
      }
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "moveTask");
  }
}

// PUT /api/pm/tasks/:id/assign
export async function assignTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    const existing = await PmTaskModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    await PmTaskModel.updateById(id, { assigned_to: assigned_to || null });

    await logPmActivity({
      project_id: existing.project_id,
      task_id: id,
      user_id: req.user!.userId,
      action: "task_assigned",
      metadata: {
        old_assignee: existing.assigned_to,
        new_assignee: assigned_to || null,
      },
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "assignTask");
  }
}

// DELETE /api/pm/tasks/:id
export async function deleteTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmTaskModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Log before delete
    await logPmActivity({
      project_id: existing.project_id,
      task_id: id,
      user_id: req.user!.userId,
      action: "task_deleted",
      metadata: { title: existing.title, column_id: existing.column_id },
    });

    await db.transaction(async (trx) => {
      await PmTaskModel.deleteById(id, trx);

      // Recompute positions in the source column
      await trx("pm_tasks")
        .where({ column_id: existing.column_id })
        .where("position", ">", existing.position)
        .decrement("position", 1);
    });

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteTask");
  }
}
