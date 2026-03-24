/**
 * Migration: Add competitor_review_count_last_tuesday to organizations
 * Used by the competitive monitoring cron for week-over-week comparison.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "competitor_review_count_last_tuesday");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.integer("competitor_review_count_last_tuesday");
    });
  }
  console.log("[Migration] competitor_review_count_last_tuesday added");
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "competitor_review_count_last_tuesday");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("competitor_review_count_last_tuesday");
    });
  }
}
