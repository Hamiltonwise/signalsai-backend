import express from "express";
import axios from "axios";
import type {
  MondayTask,
  CreateTaskRequest,
  FetchTasksRequest,
  UpdateTaskRequest,
  ArchiveTaskRequest,
  MondayComment,
} from "../types/global";
import { domainMappings } from "../utils/domainMappings";

const mondayRoutes = express.Router();

// ======= CONFIG =======
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN!;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID!;
const MONDAY_API_URL = "https://api.monday.com/v2";

// ======= HELPERS =======

/**
 * Execute GraphQL query/mutation against Monday.com API
 */
const executeMondayGraphQL = async (query: string, variables?: any) => {
  if (!MONDAY_API_TOKEN) {
    throw new Error("MONDAY_API_TOKEN is not configured");
  }

  const response = await axios.post(
    MONDAY_API_URL,
    {
      query,
      variables,
    },
    {
      headers: {
        Authorization: `Bearer ${MONDAY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (response.data.errors) {
    throw new Error(
      `Monday.com API Error: ${JSON.stringify(response.data.errors)}`
    );
  }

  return response.data.data;
};

/**
 * Reusable error handler
 */
const handleError = (res: express.Response, error: any, operation: string) => {
  console.error(
    `Monday.com ${operation} Error:`,
    error?.response?.data || error?.message || error
  );
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
};

/**
 * Get client display name from domain
 */
const getClientDisplayName = (domain: string): string => {
  const mapping = domainMappings.find(
    (mapping) => mapping.domain.toLowerCase() === domain.toLowerCase()
  );
  return mapping?.displayName || domain;
};

/**
 * Format comment with client branding
 */
const formatClientComment = (
  clientDisplayName: string,
  comment: string
): string => {
  return `🏢 **${clientDisplayName}**\n${comment}`;
};

/**
 * Get board columns and their IDs
 */
const getBoardColumns = async () => {
  const query = `
    query GetBoardColumns($boardId: ID!) {
      boards(ids: [$boardId]) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const variables = { boardId: MONDAY_BOARD_ID };
  const data = await executeMondayGraphQL(query, variables);

  return data.boards[0]?.columns || [];
};

/**
 * Find column IDs by title
 */
const findColumnIds = async () => {
  const columns = await getBoardColumns();

  const columnMap: Record<string, string> = {};
  columns.forEach((col: any) => {
    const title = col.title.toLowerCase();
    if (title.includes("client")) columnMap.client = col.id;
    if (title.includes("content")) columnMap.content = col.id;
    if (title.includes("type")) columnMap.type = col.id;
    if (title.includes("status")) columnMap.status = col.id;
  });

  return columnMap;
};

/**
 * Create column values JSON for Monday.com
 */
const createColumnValues = (
  columnIds: Record<string, string>,
  values: {
    client: string;
    content: string;
    type: "ai" | "custom";
    status: "completed" | "in_progress" | "archived_by_client" | "on_hold";
  }
) => {
  const columnValues: Record<string, any> = {};

  if (columnIds.client) {
    columnValues[columnIds.client] = values.client;
  }

  if (columnIds.content) {
    columnValues[columnIds.content] = values.content;
  }

  if (columnIds.type) {
    columnValues[columnIds.type] = { label: values.type };
  }

  if (columnIds.status) {
    columnValues[columnIds.status] = { label: values.status };
  }

  return JSON.stringify(columnValues);
};

/**
 * Parse task data from Monday.com response
 */
const parseTaskData = (
  item: any,
  columnIds: Record<string, string>
): MondayTask => {
  const getColumnValue = (columnId: string, defaultValue: string = "") => {
    const column = item.column_values?.find((col: any) => col.id === columnId);
    return column?.text || column?.value || defaultValue;
  };

  return {
    id: item.id,
    name: item.name,
    client: getColumnValue(columnIds.client, ""),
    content: getColumnValue(columnIds.content, ""),
    type: getColumnValue(columnIds.type, "custom") as "ai" | "custom",
    status: getColumnValue(columnIds.status, "in_progress") as
      | "completed"
      | "in_progress"
      | "archived_by_client"
      | "on_hold",
    created_at: item.created_at,
    updated_at: item.updated_at,
    group: item.group
      ? {
          id: item.group.id,
          title: item.group.title,
        }
      : undefined,
    board: {
      id: MONDAY_BOARD_ID,
    },
  };
};

// ======= ROUTES =======

/**
 * POST /monday/createTask
 * Body: { domain: string, content: string, type: 'ai' | 'custom' }
 */
mondayRoutes.post("/createTask", async (req, res) => {
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

    const columnIds = await findColumnIds();

    // Create task with initial status of 'in_progress'
    const columnValues = createColumnValues(columnIds, {
      client: domain,
      content,
      type,
      status: "in_progress",
    });

    const mutation = `
      mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
          created_at
          updated_at
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const variables = {
      boardId: MONDAY_BOARD_ID,
      itemName: `Task for ${domain}`,
      columnValues,
    };

    const data = await executeMondayGraphQL(mutation, variables);
    const createdItem = data.create_item;

    const task = parseTaskData(createdItem, columnIds);

    return res.json({
      success: true,
      taskId: task.id,
      boardId: MONDAY_BOARD_ID,
      task,
      message: "Task created successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Create Task");
  }
});

/**
 * POST /monday/fetchTasks
 * Body: { domain: string, status?: string, limit?: number }
 */
mondayRoutes.post("/fetchTasks", async (req, res) => {
  try {
    const { domain, status, limit = 50 }: FetchTasksRequest = req.body || {};

    if (!domain) {
      return res.status(400).json({ error: "Missing required field: domain" });
    }

    const columnIds = await findColumnIds();

    const query = `
      query GetBoardItems($boardId: ID!, $limit: Int!) {
        boards(ids: [$boardId]) {
          items_page(limit: $limit) {
            items {
              id
              name
              created_at
              updated_at
              column_values {
                id
                text
                value
              }
              group {
                id
                title
              }
            }
          }
        }
      }
    `;

    const variables = {
      boardId: MONDAY_BOARD_ID,
      limit,
    };

    const data = await executeMondayGraphQL(query, variables);
    const items = data.boards[0]?.items_page?.items || [];

    // Parse and filter tasks by domain
    const allTasks = items.map((item: any) => parseTaskData(item, columnIds));
    let filteredTasks = allTasks.filter(
      (task: MondayTask) => task.client.toLowerCase() === domain.toLowerCase()
    );

    // Additional status filtering if requested
    if (status) {
      filteredTasks = filteredTasks.filter(
        (task: MondayTask) => task.status === status
      );
    }

    return res.json({
      success: true,
      domain,
      tasks: filteredTasks,
      totalCount: filteredTasks.length,
      filters: { status },
    });
  } catch (error: any) {
    return handleError(res, error, "Fetch Tasks");
  }
});

/**
 * POST /monday/archiveTask
 * Body: { taskId: string, domain: string }
 */
mondayRoutes.post("/archiveTask", async (req, res) => {
  try {
    const { taskId, domain }: ArchiveTaskRequest = req.body || {};

    if (!taskId || !domain) {
      return res.status(400).json({
        error: "Missing required fields: taskId, domain",
      });
    }

    const columnIds = await findColumnIds();

    // First verify the task belongs to the domain
    const getItemQuery = `
      query GetItem($itemId: ID!) {
        items(ids: [$itemId]) {
          id
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const itemData = await executeMondayGraphQL(getItemQuery, {
      itemId: taskId,
    });
    const item = itemData.items?.[0];

    if (!item) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = parseTaskData(item, columnIds);
    if (task.client.toLowerCase() !== domain.toLowerCase()) {
      return res.status(403).json({
        error: "Task does not belong to the specified domain",
      });
    }

    // Update task status to archived_by_client
    const columnValues = JSON.stringify({
      [columnIds.status]: { label: "archived_by_client" },
    });

    const mutation = `
      mutation ChangeColumnValue($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          item_id: $itemId
          board_id: $boardId
          column_values: $columnValues
        ) {
          id
          updated_at
        }
      }
    `;

    const variables = {
      itemId: taskId,
      boardId: MONDAY_BOARD_ID,
      columnValues,
    };

    await executeMondayGraphQL(mutation, variables);

    return res.json({
      success: true,
      taskId,
      domain,
      updatedStatus: "archived_by_client",
      message: "Task archived successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Archive Task");
  }
});

/**
 * POST /monday/updateTask
 * Body: { taskId: string, updates: { content?: string, type?: string, status?: string } }
 */
mondayRoutes.post("/updateTask", async (req, res) => {
  try {
    const { taskId, updates }: UpdateTaskRequest = req.body || {};

    if (!taskId || !updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Missing required fields: taskId, updates",
      });
    }

    const columnIds = await findColumnIds();

    // Build column values for update
    const columnValues: Record<string, any> = {};

    if (updates.content && columnIds.content) {
      columnValues[columnIds.content] = updates.content;
    }

    if (updates.type && columnIds.type) {
      if (!["ai", "custom"].includes(updates.type)) {
        return res.status(400).json({
          error: "Type must be 'ai' or 'custom'",
        });
      }
      columnValues[columnIds.type] = { label: updates.type };
    }

    if (updates.status && columnIds.status) {
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
      columnValues[columnIds.status] = { label: updates.status };
    }

    if (Object.keys(columnValues).length === 0) {
      return res.status(400).json({
        error: "No valid updates provided",
      });
    }

    const mutation = `
      mutation ChangeColumnValue($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          item_id: $itemId
          board_id: $boardId
          column_values: $columnValues
        ) {
          id
          updated_at
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const variables = {
      itemId: taskId,
      boardId: MONDAY_BOARD_ID,
      columnValues: JSON.stringify(columnValues),
    };

    const data = await executeMondayGraphQL(mutation, variables);
    const updatedItem = data.change_multiple_column_values;

    const task = parseTaskData(updatedItem, columnIds);

    return res.json({
      success: true,
      taskId,
      task,
      appliedUpdates: updates,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Update Task");
  }
});

/**
 * POST /monday/getTaskComments
 * Body: { taskId: string }
 */
mondayRoutes.post("/getTaskComments", async (req, res) => {
  try {
    const { taskId } = req.body || {};

    if (!taskId) {
      return res.status(400).json({ error: "Missing required field: taskId" });
    }

    // Validate taskId format to prevent invalid requests
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      return res.status(400).json({ error: "Invalid taskId format" });
    }

    // Monday.com GraphQL query to get task updates (limit to prevent excessive data)
    const query = `
      query GetItemUpdates($itemId: ID!) {
        items(ids: [$itemId]) {
          id
          updates(limit: 50) {
            id
            body
            created_at
            creator {
              id
              name
            }
          }
        }
      }
    `;

    const data = await executeMondayGraphQL(query, {
      itemId: taskId.toString().trim(),
    });
    const item = data.items?.[0];

    if (!item) {
      return res.status(404).json({ error: "Task not found" });
    }

    const comments: MondayComment[] =
      item.updates?.map((update: any) => ({
        id: update.id,
        body: update.body || "",
        created_at: update.created_at,
        creator: {
          id: update.creator?.id || "",
          name: update.creator?.name || "Unknown",
        },
      })) || [];

    // Sort comments by creation date (newest first)
    comments.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return res.json({
      success: true,
      taskId,
      comments,
      totalComments: comments.length,
    });
  } catch (error: any) {
    return handleError(res, error, "Get Task Comments");
  }
});

/**
 * POST /monday/addTaskComment
 * Body: { taskId: string, comment: string }
 */
mondayRoutes.post("/addTaskComment", async (req, res) => {
  try {
    const { taskId, comment, domain } = req.body || {};

    if (!taskId || !comment || !domain) {
      return res.status(400).json({
        error: "Missing required fields: taskId, comment, domain",
      });
    }

    // Get client display name and format comment with branding
    const clientDisplayName = getClientDisplayName(domain);
    const formattedComment = formatClientComment(clientDisplayName, comment);

    // Monday.com GraphQL mutation to add comment
    const mutation = `
      mutation CreateUpdate($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
          body
          created_at
          creator {
            id
            name
          }
        }
      }
    `;

    const variables = {
      itemId: taskId,
      body: formattedComment,
    };

    const data = await executeMondayGraphQL(mutation, variables);
    const createdUpdate = data.create_update;

    const newComment: MondayComment = {
      id: createdUpdate.id,
      body: createdUpdate.body,
      created_at: createdUpdate.created_at,
      creator: {
        id: createdUpdate.creator?.id || "signals",
        name: createdUpdate.creator?.name || clientDisplayName,
      },
    };

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
});

/**
 * GET /monday/diag/boards
 * Diagnostic endpoint to list all available boards
 */
mondayRoutes.get("/diag/boards", async (req, res) => {
  try {
    // Monday.com GraphQL query to list boards

    const query = `
      query GetBoards {
        boards {
          id
          name
          description
          state
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const data = await executeMondayGraphQL(query);

    return res.json({
      success: true,
      boards: data.boards || [],
      configuredBoardId: MONDAY_BOARD_ID,
    });
  } catch (error: any) {
    return handleError(res, error, "List Boards");
  }
});

export default mondayRoutes;
