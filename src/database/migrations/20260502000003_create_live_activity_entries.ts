import type { Knex } from "knex";

/**
 * Live Activity Entries table.
 *
 * Doctor-facing feed of every change Alloro made or every signal Alloro
 * is watching. Phase 1 inserts entries from Signal Watcher and AEO
 * Monitor only. Phase 2+ adds regeneration_attempted/published/held.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("live_activity_entries");
  if (exists) return;

  await knex.schema.createTable("live_activity_entries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("practice_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.text("entry_type").notNullable();
    table.jsonb("entry_data").nullable();
    table.text("doctor_facing_text").notNullable();
    table.uuid("linked_signal_event_id").nullable();
    table.text("linked_state_transition_id").nullable();
    table.boolean("visible_to_doctor").notNullable().defaultTo(true);
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(
    `CREATE INDEX idx_live_activity_practice_time
       ON live_activity_entries (practice_id, created_at DESC)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("live_activity_entries");
}
