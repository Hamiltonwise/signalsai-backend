/**
 * Adds `postable` boolean to review_notifications.
 *
 * true = review_google_id is in MyBusiness format, can post reply via API
 * false = review_google_id is in Places API format, view-only
 *
 * Existing rows default to false (safe: won't try to post with wrong ID format).
 */
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("review_notifications", (table) => {
    table.boolean("postable").defaultTo(false).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("review_notifications", (table) => {
    table.dropColumn("postable");
  });
}
