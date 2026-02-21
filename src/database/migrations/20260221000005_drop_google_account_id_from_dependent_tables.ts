import { Knex } from "knex";

/**
 * Final cleanup: drop google_account_id from agent_results, tasks, practice_rankings.
 * Only safe after all code references have been updated to use organization_id.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_results", (table) => {
    table.dropColumn("google_account_id");
  });

  await knex.schema.alterTable("tasks", (table) => {
    table.dropColumn("google_account_id");
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("google_account_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  // Re-add columns (data will be lost - this is a one-way migration)
  await knex.schema.alterTable("agent_results", (table) => {
    table.integer("google_account_id").nullable();
  });

  await knex.schema.alterTable("tasks", (table) => {
    table.integer("google_account_id").nullable();
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.integer("google_account_id").nullable();
  });
}
