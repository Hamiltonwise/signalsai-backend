import { executeMondayGraphQL } from "./service.monday-api";

const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID!;

/**
 * Get board columns and their IDs from Monday.com
 */
export async function getBoardColumns(): Promise<any[]> {
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
}

/**
 * Find column IDs by title keywords.
 * Returns a map of logical names (client, content, type, status) to column IDs.
 */
export async function findColumnIds(): Promise<Record<string, string>> {
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
}
