/**
 * Focus Keywords -- customer-managed keyword targets.
 *
 * Customers can add keywords they want to track beyond the auto-generated
 * defaults. The system suggests keywords intelligently. Tracked weekly
 * alongside auto-generated keywords in the Monday keyword check.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("focus_keywords", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.string("keyword", 300).notNullable();
    t.string("source", 50).notNullable().defaultTo("custom");
    // source: "auto" (system-generated), "custom" (customer-added), "suggested" (AI-suggested, customer-approved)
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("latest_position").nullable();
    t.integer("previous_position").nullable();
    t.integer("position_delta").nullable();
    t.string("tracked_url", 500).nullable();
    t.timestamp("last_checked_at").nullable();
    t.timestamps(true, true);
  });

  await knex.raw(
    "CREATE INDEX idx_focus_keywords_org ON focus_keywords(organization_id)"
  );
  await knex.raw(
    "CREATE UNIQUE INDEX idx_focus_keywords_unique ON focus_keywords(organization_id, keyword) WHERE is_active = true"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("focus_keywords");
}
