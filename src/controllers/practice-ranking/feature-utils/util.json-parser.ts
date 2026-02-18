/**
 * Safe JSON Parser
 *
 * Utility for safely parsing JSON fields that may be stored as
 * strings or objects in the database (Postgres JSONB behavior).
 */

export function parseJsonField(field: any): any {
  if (!field) return null;
  return typeof field === "string" ? JSON.parse(field) : field;
}
