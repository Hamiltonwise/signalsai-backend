import type { Knex } from "knex";

/**
 * Morning Briefings table -- stores daily assembled intelligence summaries.
 * One row per day, queried by GET /api/admin/morning-briefing/latest.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("morning_briefings", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.date("briefing_date").notNullable();
    table.jsonb("summary").defaultTo("{}");
    table.integer("new_signups").defaultTo(0);
    table.integer("competitor_moves").defaultTo(0);
    table.integer("reviews_received").defaultTo(0);
    table.integer("client_health_green").defaultTo(0);
    table.integer("client_health_amber").defaultTo(0);
    table.integer("client_health_red").defaultTo(0);
    table.integer("milestones").defaultTo(0);
    table.text("top_event").nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_morning_briefings_date ON morning_briefings(briefing_date)",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("morning_briefings");
}
