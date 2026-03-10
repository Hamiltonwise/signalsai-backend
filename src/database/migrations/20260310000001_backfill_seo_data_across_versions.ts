/**
 * Backfill seo_data across all page versions.
 *
 * For each (project_id, path) group, find the best seo_data
 * (prefer published, then highest version with data) and copy it
 * to all sibling versions that have null seo_data.
 *
 * Additive only — never overwrites existing seo_data.
 */

import type { Knex } from "knex";

const PAGES_TABLE = "website_builder.pages";

export async function up(knex: Knex): Promise<void> {
  // Get all distinct (project_id, path) groups that have at least one
  // version with seo_data and at least one version without
  const groups = await knex(PAGES_TABLE)
    .select("project_id", "path")
    .groupBy("project_id", "path")
    .havingRaw("COUNT(*) FILTER (WHERE seo_data IS NOT NULL) > 0")
    .havingRaw("COUNT(*) FILTER (WHERE seo_data IS NULL) > 0");

  console.log(
    `[Backfill SEO] Found ${groups.length} page group(s) with seo_data gaps`
  );

  let totalUpdated = 0;

  for (const group of groups) {
    // Find the best seo_data source: prefer published, then highest version
    const source = await knex(PAGES_TABLE)
      .where({
        project_id: group.project_id,
        path: group.path,
      })
      .whereNotNull("seo_data")
      .orderByRaw(
        `CASE WHEN status = 'published' THEN 0 WHEN status = 'draft' THEN 1 ELSE 2 END ASC`
      )
      .orderBy("version", "desc")
      .first();

    if (!source || !source.seo_data) continue;

    // Serialize seo_data — pg driver returns JSONB as object, we need string for the update
    const seoDataStr =
      typeof source.seo_data === "string"
        ? source.seo_data
        : JSON.stringify(source.seo_data);

    // Update all sibling versions that have null seo_data
    const updated = await knex(PAGES_TABLE)
      .where({
        project_id: group.project_id,
        path: group.path,
      })
      .whereNull("seo_data")
      .update({ seo_data: seoDataStr });

    totalUpdated += updated;
  }

  console.log(
    `[Backfill SEO] Updated ${totalUpdated} page version(s) with seo_data`
  );
}

export async function down(knex: Knex): Promise<void> {
  // No-op: we cannot determine which rows were originally null
  // since we only wrote to null rows. Data is additive and harmless.
  console.log("[Backfill SEO] Down migration is a no-op (additive data only)");
}
