/**
 * Curate Page — photo_name column on location_competitors (Knex)
 *
 * Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
 * Reference analog: 20260428000003_add_self_filter_and_rich_competitor_fields.ts
 *
 * Adds: location_competitors.photo_name — Google Places photo resource name
 * (e.g. "places/ChIJ.../photos/AdDdOWp..."). Used by the curate UI to render
 * thumbnails via the authed photo proxy at /api/practice-ranking/photo.
 *
 * Final filename will follow project convention:
 *   src/database/migrations/20260428000004_add_photo_name_to_location_competitors.ts
 */

// TODO: fill during execution

exports.up = async function up(knex) {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.string("photo_name", 500).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("photo_name");
  });
};
