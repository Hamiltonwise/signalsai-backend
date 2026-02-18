import type { MondayTask } from "./monday.types";

const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID!;

/**
 * Parse task data from Monday.com API response into MondayTask format.
 */
export function parseTaskData(
  item: any,
  columnIds: Record<string, string>
): MondayTask {
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
}
