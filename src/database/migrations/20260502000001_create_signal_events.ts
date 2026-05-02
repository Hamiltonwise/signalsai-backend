import type { Knex } from "knex";

/**
 * Signal Events table.
 *
 * Continuous Answer Engine Loop, Phase 1 (architecture spec AR-009).
 * Signal Watcher emits one row here whenever a GSC threshold is crossed
 * or AEO Monitor detects a citation delta. Trigger Router consumes
 * `processed=false` rows every 5 minutes and routes them to downstream
 * agents (Phase 2+).
 *
 * Deviation from spec: practice_id is INTEGER (matching organizations.id
 * which is int4), not UUID. The spec text said UUID but organizations.id
 * is integer in the production schema.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("signal_events");
  if (exists) return;

  await knex.schema.createTable("signal_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("practice_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.text("signal_type").notNullable();
    table.jsonb("signal_data").notNullable();
    table.text("severity").notNullable().defaultTo("info");
    table.text("recommended_action").nullable();
    table.boolean("processed").notNullable().defaultTo(false);
    table.timestamp("processed_at", { useTz: true }).nullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Partial index for the trigger router's hot-path query.
  await knex.raw(
    `CREATE INDEX idx_signal_events_unprocessed
       ON signal_events (processed, created_at)
       WHERE processed = false`,
  );

  // Non-partial index for idempotency-window lookups by practice/type.
  await knex.raw(
    `CREATE INDEX idx_signal_events_practice_type_time
       ON signal_events (practice_id, signal_type, created_at DESC)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("signal_events");
}
