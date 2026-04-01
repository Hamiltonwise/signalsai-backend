import type { Knex } from "knex";

/**
 * Email Events table -- stores Mailgun webhook events
 * for deliverability monitoring and engagement analytics.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("email_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("org_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table.string("email_type", 50).notNullable(); // monday_brief, trial_day1, welcome, etc.
    table.string("recipient_email", 255).notNullable();
    table.string("event_type", 30).notNullable(); // delivered, opened, clicked, bounced, complained, unsubscribed
    table.timestamp("timestamp", { useTz: true }).notNullable();
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for common queries
  await knex.raw("CREATE INDEX idx_email_events_org_id ON email_events(org_id)");
  await knex.raw("CREATE INDEX idx_email_events_type ON email_events(event_type)");
  await knex.raw("CREATE INDEX idx_email_events_email_type ON email_events(email_type)");
  await knex.raw("CREATE INDEX idx_email_events_timestamp ON email_events(timestamp)");
  await knex.raw("CREATE INDEX idx_email_events_recipient ON email_events(recipient_email)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_events");
}
