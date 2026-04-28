import { Knex } from "knex";

/**
 * Practice Ranking v2 — Self-filter cache + rich competitor fields
 *
 * Spec: plans/04282026-no-ticket-competitor-onboarding-map-rich-data-and-self-filter/spec.md
 *
 * 1. Adds `client_place_id`, `client_lat`, `client_lng` to `locations` so the
 *    curate flow can deterministically filter the practice out of its own
 *    competitor list without re-running the (sometimes-failing) name lookup.
 * 2. Adds `phone` and `website` to `location_competitors`. These fields are
 *    already in the Places API payloads we fetch — we just persist them now
 *    so the curate UI can show them.
 *
 * Reference analog: 20260428000002_add_rating_reviews_to_location_competitors.ts
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("locations", (table) => {
    table.string("client_place_id", 255).nullable();
    table.decimal("client_lat", 10, 7).nullable();
    table.decimal("client_lng", 10, 7).nullable();
  });

  await knex.schema.alterTable("location_competitors", (table) => {
    table.string("phone", 50).nullable();
    table.text("website").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("website");
    table.dropColumn("phone");
  });

  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("client_lng");
    table.dropColumn("client_lat");
    table.dropColumn("client_place_id");
  });
}
