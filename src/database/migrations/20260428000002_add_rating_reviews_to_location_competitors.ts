import { Knex } from "knex";

/**
 * Practice Ranking v2 — Add rating + review_count to location_competitors
 *
 * Surfaces Google Places signal (⭐ rating, review count) on the curate UI so
 * users can make informed remove/keep decisions on each competitor row.
 *
 * Spec revision: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.decimal("rating", 3, 2).nullable();
    table.integer("review_count").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("review_count");
    table.dropColumn("rating");
  });
}
