import type { Knex } from "knex";

/**
 * Card 5 Run 3 (Manifest v2): Feature flag for weekly digest.
 * Default false. Per-practice scope via enabled_for_orgs.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("feature_flags")
    .where({ flag_name: "weekly_digest_enabled" })
    .first();
  if (!exists) {
    await knex("feature_flags").insert({
      flag_name: "weekly_digest_enabled",
      is_enabled: false,
      enabled_for_orgs: "[]",
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .where({ flag_name: "weekly_digest_enabled" })
    .del();
}
