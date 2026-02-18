import type { MondayTask, MondayComment } from "../feature-utils/monday.types";
import { executeMondayGraphQL } from "./service.monday-api";
import { findColumnIds } from "./service.board-columns";
import { parseTaskData } from "../feature-utils/util.task-parser";
import { createColumnValues, buildUpdateValues } from "../feature-utils/util.column-values";
import {
  getClientDisplayName,
  formatClientComment,
} from "../feature-utils/util.client-branding";

const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID!;

// ======= CREATE TASK =======

export async function createTask(
  domain: string,
  content: string,
  type: "ai" | "custom"
): Promise<{ task: MondayTask; boardId: string }> {
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

  return { task, boardId: MONDAY_BOARD_ID };
}

// ======= FETCH TASKS =======

export async function fetchTasks(
  domain: string,
  status?: string,
  limit: number = 50
): Promise<{ tasks: MondayTask[]; totalCount: number }> {
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

  return { tasks: filteredTasks, totalCount: filteredTasks.length };
}

// ======= ARCHIVE TASK =======

export async function archiveTask(
  taskId: string,
  domain: string
): Promise<void> {
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
    const error: any = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  const task = parseTaskData(item, columnIds);
  if (task.client.toLowerCase() !== domain.toLowerCase()) {
    const error: any = new Error(
      "Task does not belong to the specified domain"
    );
    error.statusCode = 403;
    throw error;
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
}

// ======= UPDATE TASK =======

export async function updateTask(
  taskId: string,
  updates: { content?: string; type?: string; status?: string }
): Promise<{ task: MondayTask }> {
  const columnIds = await findColumnIds();

  // Build column values for update
  const columnValues = buildUpdateValues(columnIds, updates);

  if (Object.keys(columnValues).length === 0) {
    const error: any = new Error("No valid updates provided");
    error.statusCode = 400;
    throw error;
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

  return { task };
}

// ======= GET TASK COMMENTS =======

export async function getTaskComments(
  taskId: string
): Promise<{ comments: MondayComment[] }> {
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
    const error: any = new Error("Task not found");
    error.statusCode = 404;
    throw error;
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

  return { comments };
}

// ======= ADD TASK COMMENT =======

export async function addTaskComment(
  taskId: string,
  comment: string,
  domain: string
): Promise<{ comment: MondayComment; clientDisplayName: string }> {
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

  return { comment: newComment, clientDisplayName };
}

// ======= DIAGNOSTIC: LIST BOARDS =======

export async function listBoards(): Promise<{
  boards: any[];
  configuredBoardId: string;
}> {
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

  return {
    boards: data.boards || [],
    configuredBoardId: MONDAY_BOARD_ID,
  };
}
