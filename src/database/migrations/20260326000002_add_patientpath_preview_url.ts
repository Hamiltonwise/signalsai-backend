import type { Knex } from "knex";

/**
 * WO-19: Add patientpath_preview_url to organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "patientpath_preview_url");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.string("patientpath_preview_url", 500).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "patientpath_preview_url");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("patientpath_preview_url");
    });
  }
}
