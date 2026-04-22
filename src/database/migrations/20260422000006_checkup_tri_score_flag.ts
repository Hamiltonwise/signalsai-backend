import type { Knex } from "knex";

/**
 * Checkup Tri-Score feature flag. Default false.
 * When enabled, the Checkup tool outputs the Recognition Tri-Score
 * as its primary section alongside the existing Clarity Score.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("feature_flags")
    .where({ flag_name: "checkup_tri_score_enabled" })
    .first();
  if (!exists) {
    await knex("feature_flags").insert({
      flag_name: "checkup_tri_score_enabled",
      is_enabled: false,
      enabled_for_orgs: "[]",
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .where({ flag_name: "checkup_tri_score_enabled" })
    .del();
}
