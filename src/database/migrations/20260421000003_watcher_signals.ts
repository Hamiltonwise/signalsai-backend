import type { Knex } from "knex";

/**
 * Card 5 (Manifest v2): watcher_signals table.
 *
 * Archive of every signal detected by the Watcher Agent. Used for:
 *   1. Audit (what was detected, when, severity)
 *   2. Shadow mode analysis (compare live vs shadow signal volume)
 *   3. Pattern dedup (avoid re-emitting the same milestone)
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("watcher_signals");
  if (exists) return;

  await knex.schema.createTable("watcher_signals", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.string("signal_type", 50).notNullable();
    t.string("severity", 20).notNullable(); // 'info' | 'warning' | 'critical'
    t.string("title", 200).notNullable();
    t.text("detail").nullable();
    t.jsonb("data_json").nullable();
    t.string("scan_type", 20).notNullable(); // 'hourly' | 'daily'
    t.string("mode", 20).notNullable(); // 'live' | 'shadow'
    t.timestamp("detected_at", { useTz: true }).notNullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_watcher_signals_org_id ON watcher_signals(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_watcher_signals_signal_type ON watcher_signals(signal_type)"
  );
  await knex.raw(
    "CREATE INDEX idx_watcher_signals_severity ON watcher_signals(severity)"
  );
  await knex.raw(
    "CREATE INDEX idx_watcher_signals_detected_at ON watcher_signals(detected_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_watcher_signals_org_id");
  await knex.raw("DROP INDEX IF EXISTS idx_watcher_signals_signal_type");
  await knex.raw("DROP INDEX IF EXISTS idx_watcher_signals_severity");
  await knex.raw("DROP INDEX IF EXISTS idx_watcher_signals_detected_at");
  await knex.schema.dropTableIfExists("watcher_signals");
}
