/**
 * Migration: Add clarity score tracking columns to organizations
 *
 * Enables weekly score recalculation and history tracking.
 * - current_clarity_score: latest calculated score
 * - previous_clarity_score: score before latest recalc
 * - score_updated_at: when score was last recalculated
 * - score_history: JSONB array of {score, date} for sparkline chart
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.integer("current_clarity_score").nullable();
    table.integer("previous_clarity_score").nullable();
    table.timestamp("score_updated_at", { useTz: true }).nullable();
    table.jsonb("score_history").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("current_clarity_score");
    table.dropColumn("previous_clarity_score");
    table.dropColumn("score_updated_at");
    table.dropColumn("score_history");
  });
}
