import { Knex } from "knex";

/**
 * Curate Page — `photo_name` on `location_competitors`
 *
 * Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
 *
 * Stores the Google Places photo resource name (e.g.
 * "places/ChIJ.../photos/AdDdOWp...") for each curated competitor. Used by
 * the curate UI to render thumbnails via the authed photo proxy at
 * /api/practice-ranking/photo.
 *
 * Reference analog: 20260428000003_add_self_filter_and_rich_competitor_fields.ts
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.string("photo_name", 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("photo_name");
  });
}
