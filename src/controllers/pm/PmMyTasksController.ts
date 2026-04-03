import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";

function handleError(res: Response, error: unknown, operation: string): Response {
  console.error(`[PM-MY-TASKS] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

// GET /api/pm/tasks/mine
// Returns tasks assigned to current user from all active projects, excluding Backlog.
// Groups into { todo, in_progress, done }. Each task includes project_name,
// creator_name, assignee_name, and project_column_ids for that task's project.
export async function getMyTasks(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    // Fetch all active project column mappings (Backlog excluded)
    const columnRows = await db("pm_columns")
      .join("pm_projects", "pm_columns.project_id", "pm_projects.id")
      .where("pm_projects.status", "active")
      .select(
        "pm_columns.id",
        "pm_columns.name",
        "pm_columns.project_id"
      );

    // Build per-project column ID map { project_id → { todo_id, in_progress_id, done_id } }
    const projectColMap = new Map<
      string,
      { todo_id: string; in_progress_id: string; done_id: string }
    >();

    for (const col of columnRows) {
      const key = col.project_id;
      if (!projectColMap.has(key)) {
        projectColMap.set(key, { todo_id: "", in_progress_id: "", done_id: "" });
      }
      const entry = projectColMap.get(key)!;
      const nameLower = (col.name as string).toLowerCase().replace(/\s+/g, "_");
      if (nameLower === "to_do") entry.todo_id = col.id;
      else if (nameLower === "in_progress") entry.in_progress_id = col.id;
      else if (nameLower === "done") entry.done_id = col.id;
    }

    // Collect non-Backlog column IDs for all active projects
    const nonBacklogColIds = columnRows
      .filter((c: any) => (c.name as string).toLowerCase() !== "backlog")
      .map((c: any) => c.id);

    if (nonBacklogColIds.length === 0) {
      return res.json({ success: true, data: { todo: [], in_progress: [], done: [] } });
    }

    // Fetch tasks assigned to current user in non-backlog columns of active projects
    const tasks = await db("pm_tasks")
      .select(
        "pm_tasks.*",
        "pm_projects.name as project_name",
        "pm_columns.name as column_name",
        "creators.email as creator_email",
        "assignees.email as assignee_email"
      )
      .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
      .join("pm_columns", "pm_tasks.column_id", "pm_columns.id")
      .leftJoin("users as creators", "pm_tasks.created_by", "creators.id")
      .leftJoin("users as assignees", "pm_tasks.assigned_to", "assignees.id")
      .where("pm_tasks.assigned_to", userId)
      .where("pm_projects.status", "active")
      .whereIn("pm_tasks.column_id", nonBacklogColIds)
      .orderBy("pm_tasks.position", "asc");

    const todo: any[] = [];
    const in_progress: any[] = [];
    const done: any[] = [];

    for (const t of tasks) {
      const projectColIds = projectColMap.get(t.project_id) ?? {
        todo_id: "",
        in_progress_id: "",
        done_id: "",
      };

      const enriched = {
        ...t,
        creator_name: t.creator_email ? t.creator_email.split("@")[0] : null,
        assignee_name: t.assignee_email ? t.assignee_email.split("@")[0] : null,
        project_column_ids: projectColIds,
      };

      const colName = (t.column_name as string).toLowerCase().replace(/\s+/g, "_");
      if (colName === "to_do") todo.push(enriched);
      else if (colName === "in_progress") in_progress.push(enriched);
      else if (colName === "done") done.push(enriched);
    }

    return res.json({ success: true, data: { todo, in_progress, done } });
  } catch (error) {
    return handleError(res, error, "getMyTasks");
  }
}
