import type { Knex } from "knex";

/**
 * Manifest v2 Card 6 (Sales Agent Brick 1): per-instance feature flags.
 *
 * Both default false (opt-in rollout). Per-instance scope (we want one
 * scanner running, not per-practice), so they live in feature_flags with
 * is_enabled=false and an empty enabled_for_orgs array. Flip is_enabled
 * globally to activate.
 *
 *   prospect_scanner_enabled  -- gates the daily prospect discovery worker
 *   candidate_flagger_enabled -- gates the candidate -> flagged promotion
 */
export async function up(knex: Knex): Promise<void> {
  const flags = ["prospect_scanner_enabled", "candidate_flagger_enabled"];
  for (const flag_name of flags) {
    const exists = await knex("feature_flags").where({ flag_name }).first();
    if (!exists) {
      await knex("feature_flags").insert({
        flag_name,
        is_enabled: false,
        enabled_for_orgs: "[]",
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .whereIn("flag_name", ["prospect_scanner_enabled", "candidate_flagger_enabled"])
    .del();
}
