import type { Request, Response } from "express";
import type {
  CreateTaskRequest,
  FetchTasksRequest,
  UpdateTaskRequest,
  ArchiveTaskRequest,
} from "./feature-utils/monday.types";
import { handleError } from "./feature-utils/util.error-handler";
import {
  createTask,
  fetchTasks,
  archiveTask,
  updateTask,
  getTaskComments,
  addTaskComment,
  listBoards,
} from "./feature-services/service.task-operations";

// ======= CREATE TASK =======

export async function handleCreateTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const {
      domain,
      content,
      type = "custom",
    }: CreateTaskRequest = req.body || {};

    if (!domain || !content) {
      return res.status(400).json({
        error: "Missing required fields: domain, content",
      });
    }

    if (!["ai", "custom"].includes(type)) {
      return res.status(400).json({
        error: "Type must be 'ai' or 'custom'",
      });
    }

    const { task, boardId } = await createTask(domain, content, type);

    return res.json({
      success: true,
      taskId: task.id,
      boardId,
      task,
      message: "Task created successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Create Task");
  }
}

// ======= FETCH TASKS =======

export async function handleFetchTasks(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { domain, status, limit = 50 }: FetchTasksRequest = req.body || {};

    if (!domain) {
      return res.status(400).json({ error: "Missing required field: domain" });
    }

    const { tasks, totalCount } = await fetchTasks(domain, status, limit);

    return res.json({
      success: true,
      domain,
      tasks,
      totalCount,
      filters: { status },
    });
  } catch (error: any) {
    return handleError(res, error, "Fetch Tasks");
  }
}

// ======= ARCHIVE TASK =======

export async function handleArchiveTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskId, domain }: ArchiveTaskRequest = req.body || {};

    if (!taskId || !domain) {
      return res.status(400).json({
        error: "Missing required fields: taskId, domain",
      });
    }

    await archiveTask(taskId, domain);

    return res.json({
      success: true,
      taskId,
      domain,
      updatedStatus: "archived_by_client",
      message: "Task archived successfully",
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: "Task not found" });
    }
    if (error.statusCode === 403) {
      return res.status(403).json({
        error: "Task does not belong to the specified domain",
      });
    }
    return handleError(res, error, "Archive Task");
  }
}

// ======= UPDATE TASK =======

export async function handleUpdateTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskId, updates }: UpdateTaskRequest = req.body || {};

    if (!taskId || !updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Missing required fields: taskId, updates",
      });
    }

    if (updates.type && !["ai", "custom"].includes(updates.type)) {
      return res.status(400).json({
        error: "Type must be 'ai' or 'custom'",
      });
    }

    if (updates.status) {
      const validStatuses = [
        "completed",
        "in_progress",
        "archived_by_client",
        "on_hold",
      ];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({
          error: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }
    }

    const { task } = await updateTask(taskId, updates);

    return res.json({
      success: true,
      taskId,
      task,
      appliedUpdates: updates,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    return handleError(res, error, "Update Task");
  }
}

// ======= GET TASK COMMENTS =======

export async function handleGetTaskComments(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskId } = req.body || {};

    if (!taskId) {
      return res.status(400).json({ error: "Missing required field: taskId" });
    }

    // Validate taskId format to prevent invalid requests
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      return res.status(400).json({ error: "Invalid taskId format" });
    }

    const { comments } = await getTaskComments(taskId);

    return res.json({
      success: true,
      taskId,
      comments,
      totalComments: comments.length,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: "Task not found" });
    }
    return handleError(res, error, "Get Task Comments");
  }
}

// ======= ADD TASK COMMENT =======

export async function handleAddTaskComment(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskId, comment, domain } = req.body || {};

    if (!taskId || !comment || !domain) {
      return res.status(400).json({
        error: "Missing required fields: taskId, comment, domain",
      });
    }

    const { comment: newComment, clientDisplayName } = await addTaskComment(
      taskId,
      comment,
      domain
    );

    return res.json({
      success: true,
      taskId,
      domain,
      clientDisplayName,
      comment: newComment,
      originalComment: comment,
      message: "Comment added successfully with client branding",
    });
  } catch (error: any) {
    return handleError(res, error, "Add Task Comment");
  }
}

// ======= DIAGNOSTIC: LIST BOARDS =======

export async function handleDiagBoards(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { boards, configuredBoardId } = await listBoards();

    return res.json({
      success: true,
      boards,
      configuredBoardId,
    });
  } catch (error: any) {
    return handleError(res, error, "List Boards");
  }
}
