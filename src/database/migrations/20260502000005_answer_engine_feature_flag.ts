import type { Knex } from "knex";

/**
 * Answer Engine feature flag (Continuous Answer Engine Loop, Phase 4).
 *
 * Inserts a per-org feature flag row that gates the doctor-facing
 * Answer Engine module. Globally off by default; enabled for the five
 * paying-client orgs available in `organizations`:
 *   - Garrison Orthodontics   (id 5)
 *   - Artful Orthodontics     (id 8)
 *   - Caswell Orthodontics    (id 25)
 *   - One Endodontics         (id 39)
 *   - One Endodontics Falls Church (id 47)
 *
 * Coastal Endodontic Studio (named in the spec rollout list) is not yet
 * in the organizations table; once Corey adds it, append its org id to
 * `enabled_for_orgs`. AAE Primed Buyers (Freer, Olson) get appended on
 * conversion.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("feature_flags")
    .where({ flag_name: "answer_engine" })
    .first();
  if (exists) return;

  await knex("feature_flags").insert({
    flag_name: "answer_engine",
    is_enabled: false,
    enabled_for_orgs: JSON.stringify([5, 8, 25, 39, 47]),
    description:
      "Continuous Answer Engine Loop doctor-facing UI. Phase 4 rollout to paying clients. Coastal/Freer/Olson appended on entry into organizations or on conversion.",
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags").where({ flag_name: "answer_engine" }).delete();
}
