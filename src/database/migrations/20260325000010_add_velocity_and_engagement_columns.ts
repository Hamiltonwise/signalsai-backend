import type { Knex } from "knex";

/**
 * WO-REVIEW-VELOCITY + WO-BEHAVIORAL-INTELLIGENCE
 *
 * Velocity columns: review_velocity_per_week, competitor_review_velocity_per_week
 * Engagement columns: engagement_score, engagement_score_updated_at
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    // Review velocity
    table.decimal("review_velocity_per_week", 8, 2).defaultTo(0);
    table.decimal("competitor_review_velocity_per_week", 8, 2).defaultTo(0);

    // Behavioral engagement
    table.integer("engagement_score").defaultTo(0);
    table.timestamp("engagement_score_updated_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("engagement_score_updated_at");
    table.dropColumn("engagement_score");
    table.dropColumn("competitor_review_velocity_per_week");
    table.dropColumn("review_velocity_per_week");
  });
}
