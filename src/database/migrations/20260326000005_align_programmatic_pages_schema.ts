import type { Knex } from "knex";

/**
 * Originally: align programmatic_pages with model expectations.
 *
 * No-op: migration 20260326000001 already creates the table with all
 * required columns (content_sections, page_views, checkup_starts, lat,
 * lng, state, status, competitors_refreshed_at). This migration was
 * written before 000001 was updated and is now redundant.
 */
export async function up(_knex: Knex): Promise<void> {
  // All columns already exist in 20260326000001_create_programmatic_pages
}

export async function down(_knex: Knex): Promise<void> {
  // Nothing to revert
}
