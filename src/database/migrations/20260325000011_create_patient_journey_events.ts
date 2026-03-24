import type { Knex } from "knex";

/**
 * WO-PATIENT-JOURNEY-TRACKING
 *
 * Patient journey event log -- anonymous session tracking (no PHI).
 * Feeds 365-day progress report, Purpose Agent, Founder Mode Ledger.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("patient_journey_events");
  if (!exists) {
    await knex.schema.createTable("patient_journey_events", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table
        .integer("org_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      table.string("event_type", 100).notNullable();
      table.string("source", 50).defaultTo("direct");
      table.string("session_id", 100).nullable();
      table.timestamp("occurred_at", { useTz: true }).defaultTo(knex.fn.now());
      table.jsonb("metadata").defaultTo("{}");
    });

    await knex.raw("CREATE INDEX idx_patient_journey_org ON patient_journey_events(org_id)");
    await knex.raw("CREATE INDEX idx_patient_journey_type ON patient_journey_events(event_type)");
    await knex.raw("CREATE INDEX idx_patient_journey_occurred ON patient_journey_events(occurred_at)");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("patient_journey_events");
}
