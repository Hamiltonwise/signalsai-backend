import type { Knex } from "knex";

/**
 * WO-53: Owner Archetype Detection (Lemonis Protocol)
 */
export async function up(knex: Knex): Promise<void> {
  const hasArchetype = await knex.schema.hasColumn("organizations", "owner_archetype");
  if (!hasArchetype) {
    await knex.schema.alterTable("organizations", (table) => {
      table.string("owner_archetype", 20).nullable();
      table.decimal("archetype_confidence", 3, 2).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("owner_archetype");
    table.dropColumn("archetype_confidence");
  });
}
