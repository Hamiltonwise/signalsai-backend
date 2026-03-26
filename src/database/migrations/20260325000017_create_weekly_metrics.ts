import type { Knex } from "knex";

/**
 * WO-ANALYTICS-PIPELINE
 *
 * Weekly metrics aggregation table.
 * Feeds: Revenue Dashboard, Weekly Digest Agent, Founder Mode, confidence scores.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("weekly_metrics");
  if (!exists) {
    await knex.schema.createTable("weekly_metrics", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.date("week_start").notNullable().unique();
      table.integer("new_signups").defaultTo(0);
      table.integer("active_accounts").defaultTo(0);
      table.integer("trial_conversions").defaultTo(0);
      table.integer("churns").defaultTo(0);
      table.integer("first_wins").defaultTo(0);
      table.decimal("ttfv_yes_rate", 5, 2).defaultTo(0);
      table.decimal("avg_engagement_score", 5, 2).defaultTo(0);
      table.string("top_event_type", 100).nullable();
      table.integer("top_performing_org_id").unsigned().nullable();
      table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw("CREATE INDEX idx_weekly_metrics_week ON weekly_metrics(week_start)");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("weekly_metrics");
}
