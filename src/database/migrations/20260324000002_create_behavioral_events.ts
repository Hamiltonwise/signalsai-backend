import type { Knex } from "knex";

/**
 * WO8 / SCHEMA-001: Behavioral Events Table
 *
 * Foundation for self-improving system intelligence.
 * Tracks behavioral signals across the checkup flow.
 * No PII. No patient data.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("behavioral_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("event_type", 100).notNullable();
    table
      .integer("org_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table.string("session_id", 100).nullable();
    table.jsonb("properties").defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for common query patterns
  await knex.raw(
    "CREATE INDEX idx_behavioral_events_org_id ON behavioral_events(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_behavioral_events_event_type ON behavioral_events(event_type)"
  );
  await knex.raw(
    "CREATE INDEX idx_behavioral_events_created_at ON behavioral_events(created_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("behavioral_events");
}
