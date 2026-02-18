/**
 * Section Normalizer Utility
 *
 * Handles both format variations from N8N webhooks:
 * - Direct array: [{...}, {...}]
 * - Wrapped object: { sections: [{...}, {...}] }
 */

export function normalizeSections(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "sections" in (raw as Record<string, unknown>) &&
    Array.isArray((raw as Record<string, unknown>).sections)
  ) {
    return (raw as Record<string, unknown>).sections as any[];
  }
  return [];
}
