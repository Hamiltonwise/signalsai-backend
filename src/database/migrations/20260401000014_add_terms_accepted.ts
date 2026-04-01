/**
 * Migration: Add terms_accepted_at to organizations
 *
 * Records when the user agreed to Terms of Service during
 * checkup account creation. Required for legal compliance.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "terms_accepted_at");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.timestamp("terms_accepted_at").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "terms_accepted_at");
  if (hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("terms_accepted_at");
    });
  }
}
