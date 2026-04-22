import type { Knex } from "knex";

/**
 * Card 5 (Manifest v2): data_gap_results table.
 *
 * Archive of every Data Gap Resolver run. Used for:
 *   1. Idempotency (idempotency_key unique; second trigger is no-op)
 *   2. Audit (which fields resolved, from which sources, confidence)
 *   3. Shadow mode analysis (compare live vs shadow resolution rates)
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("data_gap_results");
  if (exists) return;

  await knex.schema.createTable("data_gap_results", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.string("idempotency_key", 200).notNullable();
    t.integer("fields_checked").notNullable().defaultTo(0);
    t.integer("fields_resolved").notNullable().defaultTo(0);
    t.integer("fields_missing").notNullable().defaultTo(0);
    t.jsonb("provenance_json").nullable();
    t.string("mode", 20).notNullable(); // 'live' | 'shadow'
    t.integer("duration_ms").nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE UNIQUE INDEX idx_data_gap_results_idempotency ON data_gap_results(idempotency_key)"
  );
  await knex.raw(
    "CREATE INDEX idx_data_gap_results_org_id ON data_gap_results(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_data_gap_results_created_at ON data_gap_results(created_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_data_gap_results_idempotency");
  await knex.raw("DROP INDEX IF EXISTS idx_data_gap_results_org_id");
  await knex.raw("DROP INDEX IF EXISTS idx_data_gap_results_created_at");
  await knex.schema.dropTableIfExists("data_gap_results");
}
