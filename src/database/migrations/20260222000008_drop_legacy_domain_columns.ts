import type { Knex } from "knex";

/**
 * Drop legacy domain/domain_name columns from 5 tables.
 *
 * These TEXT columns stored the website domain string as a data-scoping key.
 * All CRUD operations now use organization_id (integer FK) instead.
 * The columns have been redundant since organization_id and location_id
 * were backfilled in migrations 20260222000005 and 20260222000006.
 */
export async function up(knex: Knex): Promise<void> {
  // agent_results.domain
  await knex.schema.alterTable("agent_results", (table) => {
    table.dropColumn("domain");
  });

  // practice_rankings.domain
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("domain");
  });

  // tasks.domain_name
  await knex.schema.alterTable("tasks", (table) => {
    table.dropColumn("domain_name");
  });

  // pms_jobs.domain
  await knex.schema.alterTable("pms_jobs", (table) => {
    table.dropColumn("domain");
  });

  // notifications.domain_name
  await knex.schema.alterTable("notifications", (table) => {
    table.dropColumn("domain_name");
  });
}

/**
 * Re-add columns as nullable TEXT.
 * Original data is not recoverable — this only restores the schema shape.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_results", (table) => {
    table.text("domain").nullable();
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.text("domain").nullable();
  });

  await knex.schema.alterTable("tasks", (table) => {
    table.text("domain_name").nullable();
  });

  await knex.schema.alterTable("pms_jobs", (table) => {
    table.text("domain").nullable();
  });

  await knex.schema.alterTable("notifications", (table) => {
    table.text("domain_name").nullable();
  });
}
