/**
 * Form Detection Service
 *
 * Derives the website-side form catalog directly from existing
 * `form_submissions` rows. There is no separate "forms" table in this schema
 * — form names and field shapes are observed retroactively from what visitors
 * have actually submitted.
 *
 * Used by the Integrations UI so customers can see which forms exist on their
 * site (and what fields each one collects) BEFORE creating a HubSpot mapping.
 */

import { db } from "../../../database/connection";
import { flattenSubmissionContents } from "../../../utils/formContentsFlattener";
import type { FormContents } from "../../../models/website-builder/FormSubmissionModel";

const FORM_SUBMISSIONS_TABLE = "website_builder.form_submissions";

const NEWSLETTER_FORM_NAME = "Newsletter Signup";

export interface DetectedForm {
  form_name: string;
  submission_count: number;
  last_seen: Date;
}

export interface FieldShapeEntry {
  key: string;
  occurrence_count: number;
  sample_value: string | null;
}

/**
 * List distinct form names for a project, with submission counts and last-seen
 * timestamps. Newsletter signups are excluded — they're a separate flow with
 * double-opt-in and are explicitly out of scope for HubSpot mapping in v1.
 */
export async function listDetectedForms(projectId: string): Promise<DetectedForm[]> {
  const rawRows = await db(FORM_SUBMISSIONS_TABLE)
    .select("form_name")
    .count("* as submission_count")
    .max("submitted_at as last_seen")
    .where({ project_id: projectId })
    .whereNot("form_name", NEWSLETTER_FORM_NAME)
    .groupBy("form_name")
    .orderBy("last_seen", "desc");

  const rows = rawRows as unknown as Array<{
    form_name: string;
    submission_count: string | number;
    last_seen: Date;
  }>;

  return rows.map((r) => ({
    form_name: r.form_name,
    submission_count:
      typeof r.submission_count === "number"
        ? r.submission_count
        : parseInt(String(r.submission_count), 10) || 0,
    last_seen: r.last_seen,
  }));
}

/**
 * Derive the union of field keys observed across the most recent submissions
 * for a given form. Handles both legacy flat and sectioned `FormContents`
 * shapes via flattenSubmissionContents.
 *
 * Returns each key with its occurrence count and a sample (most recent
 * non-null) value, so the UI can display the user a preview of what the
 * field actually contains before they map it.
 */
export async function getFormFieldShape(
  projectId: string,
  formName: string,
  sampleSize = 20,
): Promise<FieldShapeEntry[]> {
  const rows: Array<{ contents: FormContents }> = await db(FORM_SUBMISSIONS_TABLE)
    .select("contents")
    .where({ project_id: projectId, form_name: formName })
    .orderBy("submitted_at", "desc")
    .limit(sampleSize);

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();

  for (const row of rows) {
    const flat = flattenSubmissionContents(row.contents);
    for (const [key, value] of Object.entries(flat)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!samples.has(key)) {
        if (typeof value === "string" && value.length > 0) {
          samples.set(key, value.length > 200 ? value.slice(0, 200) + "…" : value);
        } else if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
          samples.set(key, `[file: ${value.name}]`);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([key, occurrence_count]) => ({
      key,
      occurrence_count,
      sample_value: samples.get(key) ?? null,
    }))
    .sort((a, b) => b.occurrence_count - a.occurrence_count);
}
