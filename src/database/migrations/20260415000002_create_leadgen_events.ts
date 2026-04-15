import type { Knex } from "knex";

/**
 * Creates the `leadgen_events` table — append-only event log for each
 * `leadgen_sessions` row. Every stage transition, email submit, and
 * abandonment beacon is one row here.
 *
 * `event_name` is validated against a server-side enum in the controller
 * (see `LeadgenEventModel.LeadgenEventName`).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("leadgen_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("session_id").notNullable();
    table.string("event_name", 48).notNullable();
    table.jsonb("event_data").nullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign("session_id")
      .references("leadgen_sessions.id")
      .onDelete("CASCADE");

    table.index("session_id", "idx_leadgen_events_session_id");
    table.index(
      ["session_id", "created_at"],
      "idx_leadgen_events_session_id_created"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("leadgen_events");
}
