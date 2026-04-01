import type { Knex } from "knex";

/**
 * Feedback Loop: email_outcomes table
 *
 * Tracks the recommended action from each Monday email,
 * then measures whether the metric improved a week later.
 * This is the Karpathy Loop applied to business intelligence:
 * recommend, measure, learn, improve.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("email_outcomes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.timestamp("email_sent_at", { useTz: true }).notNullable();
    table.string("action_type", 50).notNullable(); // review_response, referral_outreach, competitor_monitor, gbp_optimize
    table.text("recommended_action").notNullable();
    table.string("metric_name", 100).notNullable();
    table.decimal("metric_baseline", 14, 4).notNullable();
    table.decimal("metric_current", 14, 4).nullable();
    table.timestamp("outcome_measured_at", { useTz: true }).nullable();
    table.decimal("improvement_pct", 10, 4).nullable();
    table.boolean("action_taken").defaultTo(false);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for weekly outcome measurement queries
  await knex.raw(
    "CREATE INDEX idx_email_outcomes_org_id ON email_outcomes(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_email_outcomes_action_type ON email_outcomes(action_type)"
  );
  await knex.raw(
    "CREATE INDEX idx_email_outcomes_unmeasured ON email_outcomes(outcome_measured_at) WHERE outcome_measured_at IS NULL"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_outcomes");
}
