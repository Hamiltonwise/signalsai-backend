import type { Knex } from "knex";

/**
 * Card 7 — Live Activity Per-Query Receipts (May 4 2026).
 *
 * Adds three nullable enrichment columns to live_activity_entries so each
 * signal-triggered entry can carry a structured demonstration receipt
 * alongside the narrative text:
 *
 *   patient_question      TEXT     — the underlying GSC / AEO query
 *   visibility_snapshot   JSONB    — Google rank + per-platform citation status at signal time
 *   action_taken          TEXT     — plain-English description of what Alloro did
 *
 * Anchor entries from Card 6 leave all three NULL; the renderer falls
 * through to narrative-only when patient_question is NULL.
 *
 * Card 7 also scope-extends signal_events with action_log JSONB so the
 * regeneration pipeline (Phase 2) can persist the action chain at the
 * moment the action runs. The narrator composes action_taken from this.
 */
export async function up(knex: Knex): Promise<void> {
  // Live Activity columns
  const lae = await knex.schema.hasTable("live_activity_entries");
  if (!lae) {
    throw new Error(
      "[Card 7] live_activity_entries missing. Run 20260502000003 first.",
    );
  }
  for (const col of [
    { name: "patient_question", type: "text" },
    { name: "visibility_snapshot", type: "jsonb" },
    { name: "action_taken", type: "text" },
  ] as const) {
    const has = await knex.schema.hasColumn("live_activity_entries", col.name);
    if (!has) {
      await knex.raw(
        `ALTER TABLE live_activity_entries ADD COLUMN ${col.name} ${col.type.toUpperCase()}`,
      );
    }
  }

  // signal_events.action_log
  const se = await knex.schema.hasTable("signal_events");
  if (!se) {
    throw new Error(
      "[Card 7] signal_events missing. Run 20260502000001 first.",
    );
  }
  const hasActionLog = await knex.schema.hasColumn("signal_events", "action_log");
  if (!hasActionLog) {
    await knex.raw(`ALTER TABLE signal_events ADD COLUMN action_log JSONB`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ["action_taken", "visibility_snapshot", "patient_question"]) {
    const has = await knex.schema.hasColumn("live_activity_entries", col);
    if (has) {
      await knex.raw(`ALTER TABLE live_activity_entries DROP COLUMN ${col}`);
    }
  }
  const hasActionLog = await knex.schema.hasColumn("signal_events", "action_log");
  if (hasActionLog) {
    await knex.raw(`ALTER TABLE signal_events DROP COLUMN action_log`);
  }
}
