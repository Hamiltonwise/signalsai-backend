import type { Knex } from "knex";

/**
 * WO-PERFORMANCE-BENCHMARKS: System config table for performance baselines
 * and other key-value system state.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("system_config");
  if (!exists) {
    await knex.schema.createTable("system_config", (t) => {
      t.string("key", 200).primary();
      t.jsonb("value").nullable();
      t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("system_config");
}
