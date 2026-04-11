import { Knex } from "knex";

/**
 * Add Search Position columns to practice_rankings.
 *
 * Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
 *
 * Splits the existing single-rank concept into two:
 *   - Search Position (where the practice ranks in Google Places for their query)
 *   - Practice Health (the existing 8-factor diagnostic, reframed in the UI)
 *
 * The new columns capture the Google query, vantage point, full top-20 list,
 * and an enum-like status describing how Step 0 of the pipeline resolved.
 *
 * Reference analog: 20260129000002_add_location_params_to_practice_rankings.ts
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.integer("search_position").nullable();
    table.text("search_query").nullable();
    table.decimal("search_lat", 10, 7).nullable();
    table.decimal("search_lng", 10, 7).nullable();
    table.integer("search_radius_meters").nullable();
    table.jsonb("search_results").nullable();
    table.timestamp("search_checked_at", { useTz: true }).nullable();
    table.string("search_status", 32).nullable();
  });

  // Enum-like CHECK constraint on search_status (Revision 1, Gap C).
  // Nullable to keep historical rows clean — only post-ship rows have a value.
  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_search_status_check
        CHECK (search_status IS NULL OR search_status IN (
          'ok',
          'not_in_top_20',
          'bias_unavailable',
          'api_error'
        ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_search_status_check
  `);

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("search_status");
    table.dropColumn("search_checked_at");
    table.dropColumn("search_results");
    table.dropColumn("search_radius_meters");
    table.dropColumn("search_lng");
    table.dropColumn("search_lat");
    table.dropColumn("search_query");
    table.dropColumn("search_position");
  });
}
