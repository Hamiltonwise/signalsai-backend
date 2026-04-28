/**
 * Practice Ranking v2 — Self-filter cache + rich competitor fields (Knex)
 *
 * Spec: plans/04282026-no-ticket-competitor-onboarding-map-rich-data-and-self-filter/spec.md
 * Reference analog: 20260428000002_add_rating_reviews_to_location_competitors.ts
 *
 * Adds:
 *   1. locations.client_place_id, client_lat, client_lng — cached identifiers
 *      for the practice itself, used to filter the practice out of its own
 *      curated competitor list.
 *   2. location_competitors.phone, location_competitors.website — captured
 *      from existing Places API payloads to enrich the curate-page rows.
 *
 * Final filename will follow project convention:
 *   src/database/migrations/20260428000003_add_self_filter_and_rich_competitor_fields.ts
 */

// TODO: fill during execution

exports.up = async function up(knex) {
  await knex.schema.alterTable("locations", (table) => {
    table.string("client_place_id", 255).nullable();
    table.decimal("client_lat", 10, 7).nullable();
    table.decimal("client_lng", 10, 7).nullable();
  });

  await knex.schema.alterTable("location_competitors", (table) => {
    table.string("phone", 50).nullable();
    table.text("website").nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("website");
    table.dropColumn("phone");
  });

  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("client_lng");
    table.dropColumn("client_lat");
    table.dropColumn("client_place_id");
  });
};
