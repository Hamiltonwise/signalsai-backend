import type { Knex } from "knex";

/**
 * Card 5 (Manifest v2): Feature flags for Data Gap Resolver and Watcher Agent.
 *
 * Both default to false (shadow mode). Enable per-org or globally when ready.
 */
export async function up(knex: Knex): Promise<void> {
  const flags = [
    { flag_name: "data_gap_resolver_enabled", is_enabled: false, enabled_for_orgs: "[]" },
    { flag_name: "watcher_agent_enabled", is_enabled: false, enabled_for_orgs: "[]" },
  ];

  for (const flag of flags) {
    const exists = await knex("feature_flags")
      .where({ flag_name: flag.flag_name })
      .first();
    if (!exists) {
      await knex("feature_flags").insert(flag);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .whereIn("flag_name", [
      "data_gap_resolver_enabled",
      "watcher_agent_enabled",
    ])
    .del();
}
