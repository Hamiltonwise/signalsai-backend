import type { Knex } from "knex";

/**
 * WO-DENTALEMR-REPORT + WO-PREDICTION-CALIBRATION
 *
 * 1. source_channel on organizations (tracks acquisition channel: 'dentalemr', 'organic', etc.)
 * 2. prediction_accuracy on organizations (calibration score)
 * 3. prediction_outcomes table (if not exists)
 */
export async function up(knex: Knex): Promise<void> {
  // source_channel for partner attribution
  const hasSourceChannel = await knex.schema.hasColumn("organizations", "source_channel");
  if (!hasSourceChannel) {
    await knex.schema.alterTable("organizations", (table) => {
      table.string("source_channel", 50).nullable();
    });
  }

  // prediction_accuracy for calibration display
  const hasPredictionAccuracy = await knex.schema.hasColumn("organizations", "prediction_accuracy");
  if (!hasPredictionAccuracy) {
    await knex.schema.alterTable("organizations", (table) => {
      table.decimal("prediction_accuracy", 5, 4).nullable();
    });
  }

  // prediction_outcomes table
  const hasTable = await knex.schema.hasTable("prediction_outcomes");
  if (!hasTable) {
    await knex.schema.createTable("prediction_outcomes", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table
        .integer("org_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      table.string("prediction_type", 100).notNullable(); // 'ranking_change', 'review_growth', 'gp_drift'
      table.text("prediction_text").notNullable(); // what was predicted
      table.text("outcome_text").nullable(); // what actually happened
      table.boolean("was_correct").nullable(); // null = unverified
      table.date("predicted_for_week").notNullable(); // the week this prediction was about
      table.timestamp("predicted_at", { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp("verified_at", { useTz: true }).nullable();
      table.jsonb("metadata").defaultTo("{}");
    });

    await knex.raw("CREATE INDEX idx_prediction_outcomes_org ON prediction_outcomes(org_id)");
    await knex.raw("CREATE INDEX idx_prediction_outcomes_week ON prediction_outcomes(predicted_for_week)");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("prediction_outcomes");

  const hasPredictionAccuracy = await knex.schema.hasColumn("organizations", "prediction_accuracy");
  if (hasPredictionAccuracy) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("prediction_accuracy");
    });
  }

  const hasSourceChannel = await knex.schema.hasColumn("organizations", "source_channel");
  if (hasSourceChannel) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("source_channel");
    });
  }
}
