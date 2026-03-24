import type { Knex } from "knex";

/**
 * Add partner_role to organizations for role-based partner portal routing.
 * Values: 'cmo' | 'sales' | 'owner' | null
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.string("partner_role", 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("partner_role");
  });
}
