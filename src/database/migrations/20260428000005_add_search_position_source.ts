import { Knex } from "knex";

/**
 * Add `search_position_source` column to practice_rankings.
 *
 * Spec: plans/04282026-no-ticket-live-google-rank-apify-maps-swap/spec.md (T3)
 *
 * Tracks which surface produced the persisted `search_position`:
 *   - `apify_maps` : Apify Google Maps actor (matches the Maps panel ordering
 *                    a real searcher in the area sees)
 *   - `places_text`: Google Places API `searchText` (the legacy source, kept
 *                    as a soft fallback when Apify fails)
 *   - NULL         : pre-cutover row (before this swap shipped)
 *
 * The frontend uses this column to suppress the rank trend arrow across the
 * cutover, mirroring the Practice Health methodology pattern.
 *
 * Reference analog: 20260412000001_add_search_position_to_practice_rankings.ts
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.string("search_position_source", 32).nullable();
  });

  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_search_position_source_check
        CHECK (search_position_source IS NULL OR search_position_source IN (
          'apify_maps',
          'places_text'
        ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_search_position_source_check
  `);

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("search_position_source");
  });
}
