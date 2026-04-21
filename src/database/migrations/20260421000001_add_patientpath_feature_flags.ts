import type { Knex } from "knex";

/**
 * WO Site QA: per-organization feature flags for the Site QA Agent and for
 * the PatientPath build pipeline. Both default to false so rollout is opt-in
 * and the hook runs in shadow mode until the flag is flipped.
 */
export async function up(knex: Knex): Promise<void> {
  const hasQa = await knex.schema.hasColumn("organizations", "patientpath_qa_enabled");
  if (!hasQa) {
    await knex.schema.alterTable("organizations", (t) => {
      t.boolean("patientpath_qa_enabled").notNullable().defaultTo(false);
    });
  }

  const hasBuild = await knex.schema.hasColumn("organizations", "patientpath_build_enabled");
  if (!hasBuild) {
    await knex.schema.alterTable("organizations", (t) => {
      t.boolean("patientpath_build_enabled").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasQa = await knex.schema.hasColumn("organizations", "patientpath_qa_enabled");
  if (hasQa) {
    await knex.schema.alterTable("organizations", (t) => t.dropColumn("patientpath_qa_enabled"));
  }
  const hasBuild = await knex.schema.hasColumn("organizations", "patientpath_build_enabled");
  if (hasBuild) {
    await knex.schema.alterTable("organizations", (t) => t.dropColumn("patientpath_build_enabled"));
  }
}
