import type { FileValue, FormContents, FormSection } from "../models/website-builder/FormSubmissionModel";

/**
 * Flatten a form submission's `contents` JSONB into a single key→value map.
 *
 * The contents column has two real shapes in the wild:
 *   1. Legacy flat:  Record<string, string | FileValue>
 *   2. Sectioned:    FormSection[] = [{ title, fields: [[key, value], ...] }]
 *
 * Used by the form-detection feature service (to derive field shape for the
 * Integrations UI) and by the CRM-push processor (to apply field mappings).
 */
export function flattenSubmissionContents(
  contents: FormContents | unknown,
): Record<string, string | FileValue> {
  // Sectioned shape — array of sections, each with [key, value] pairs.
  if (Array.isArray(contents)) {
    const out: Record<string, string | FileValue> = {};
    for (const section of contents as FormSection[]) {
      if (!section || !Array.isArray(section.fields)) continue;
      for (const pair of section.fields) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const [key, value] = pair;
        if (typeof key !== "string" || value == null) continue;
        out[key] = value;
      }
    }
    return out;
  }

  // Legacy flat shape — already Record<string, string | FileValue>.
  if (contents && typeof contents === "object") {
    return contents as Record<string, string | FileValue>;
  }

  return {};
}

/**
 * Convert a flattened contents map into plain string values suitable for CRM
 * submission. FileValue entries are pushed as their .url field; null/undefined
 * entries are dropped.
 */
export function stringifyFlattenedContents(
  flat: Record<string, string | FileValue>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = value;
    } else if (typeof value === "object" && "url" in value && typeof value.url === "string") {
      out[key] = value.url;
    }
  }
  return out;
}
