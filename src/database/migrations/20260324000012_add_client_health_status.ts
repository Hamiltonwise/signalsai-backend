import type { Knex } from "knex";

/**
 * WO-T5: Add client_health_status column to organizations.
 * Tracks GREEN / AMBER / RED health classification for CS Pulse.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "client_health_status");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.string("client_health_status", 10).defaultTo("green");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("client_health_status");
  });
}
