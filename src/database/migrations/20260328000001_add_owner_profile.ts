import type { Knex } from "knex";

/**
 * WO-50: Owner Profile -- The Five Onboarding Questions (Lemonis Protocol)
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "owner_profile");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.jsonb("owner_profile").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "owner_profile");
  if (hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("owner_profile");
    });
  }
}
