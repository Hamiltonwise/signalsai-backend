import type { Knex } from "knex";

/**
 * WO-DENTALEMR-ATTRIBUTION: source_channel on organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "source_channel");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.string("source_channel", 100).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "source_channel");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("source_channel");
    });
  }
}
