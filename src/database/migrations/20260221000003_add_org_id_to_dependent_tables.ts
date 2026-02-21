import { Knex } from "knex";

/**
 * Add organization_id to agent_results, tasks, and practice_rankings.
 * Backfill from google_accounts via google_account_id → organization_id lookup.
 */
export async function up(knex: Knex): Promise<void> {
  // Add columns
  await knex.schema.alterTable("agent_results", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations");
  });

  await knex.schema.alterTable("tasks", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations");
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations");
  });

  // Backfill from google_accounts
  await knex.raw(`
    UPDATE agent_results ar
    SET organization_id = ga.organization_id
    FROM google_accounts ga
    WHERE ar.google_account_id = ga.id
  `);

  await knex.raw(`
    UPDATE tasks t
    SET organization_id = ga.organization_id
    FROM google_accounts ga
    WHERE t.google_account_id = ga.id
  `);

  await knex.raw(`
    UPDATE practice_rankings pr
    SET organization_id = ga.organization_id
    FROM google_accounts ga
    WHERE pr.google_account_id = ga.id
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_results", (table) => {
    table.dropColumn("organization_id");
  });
  await knex.schema.alterTable("tasks", (table) => {
    table.dropColumn("organization_id");
  });
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("organization_id");
  });
}
