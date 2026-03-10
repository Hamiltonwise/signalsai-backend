import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_results", (table) => {
    table.string("run_id", 36).nullable();
  });

  // Unique partial index for fast polling lookups
  await knex.raw(`
    CREATE UNIQUE INDEX idx_agent_results_run_id
    ON agent_results(run_id)
    WHERE run_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_agent_results_run_id");
  await knex.schema.alterTable("agent_results", (table) => {
    table.dropColumn("run_id");
  });
}
