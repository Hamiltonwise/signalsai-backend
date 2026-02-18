/**
 * Column value JSON generation for Monday.com API.
 * Handles building column_values payloads for create and update mutations.
 */

/**
 * Create column values JSON for a new Monday.com item.
 */
export function createColumnValues(
  columnIds: Record<string, string>,
  values: {
    client: string;
    content: string;
    type: "ai" | "custom";
    status: "completed" | "in_progress" | "archived_by_client" | "on_hold";
  }
): string {
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
}

/**
 * Build column values object for update mutations.
 * Returns the raw object (caller is responsible for JSON.stringify).
 */
export function buildUpdateValues(
  columnIds: Record<string, string>,
  updates: {
    content?: string;
    type?: string;
    status?: string;
  }
): Record<string, any> {
  const columnValues: Record<string, any> = {};

  if (updates.content && columnIds.content) {
    columnValues[columnIds.content] = updates.content;
  }

  if (updates.type && columnIds.type) {
    columnValues[columnIds.type] = { label: updates.type };
  }

  if (updates.status && columnIds.status) {
    columnValues[columnIds.status] = { label: updates.status };
  }

  return columnValues;
}
