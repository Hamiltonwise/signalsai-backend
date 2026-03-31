/**
 * Fix healthScoreLabel across all vocabulary defaults.
 * The category is "Business Clarity." The score is "Business Clarity Score."
 * Not "Practice Health Score." Not "Business Health Score."
 * Alloro owns Business Clarity. Every vertical uses it.
 */
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("vocabulary_defaults");
  if (!hasTable) return;

  const rows = await knex("vocabulary_defaults").select("vertical", "config");

  for (const row of rows) {
    const config =
      typeof row.config === "string" ? JSON.parse(row.config) : row.config;

    if (config.healthScoreLabel && config.healthScoreLabel !== "Business Clarity Score") {
      config.healthScoreLabel = "Business Clarity Score";
      await knex("vocabulary_defaults")
        .where({ vertical: row.vertical })
        .update({ config: JSON.stringify(config) });
    }
  }
}

export async function down(knex: Knex): Promise<void> {}
