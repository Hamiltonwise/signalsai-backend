import type { Knex } from "knex";

/**
 * Creates the `leadgen_email_notifications` table — queue for the FAB
 * "Email me when ready" flow. The leadgen tool POSTs to
 * /api/leadgen/email-notify when a user submits their email via the
 * floating button; the audit worker drains this queue on completion (or
 * failure) and fires the existing n8n email-report webhook for each row.
 *
 * Idempotent on (session_id, audit_id) — re-submitting upserts the email,
 * never creates a duplicate row. A row already marked `sent` is left alone
 * by the upsert so the user doesn't get the same report twice.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("leadgen_email_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("session_id").notNullable();
    table.uuid("audit_id").notNullable();
    table.text("email").notNullable();
    table.string("status", 16).notNullable().defaultTo("pending");
    table.integer("attempt_count").notNullable().defaultTo(0);
    table.text("last_error").nullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp("sent_at", { useTz: true }).nullable();

    table
      .foreign("session_id")
      .references("leadgen_sessions.id")
      .onDelete("CASCADE");
    table
      .foreign("audit_id")
      .references("audit_processes.id")
      .onDelete("CASCADE");

    table.unique(
      ["session_id", "audit_id"],
      "uniq_leadgen_email_notif_session_audit"
    );
    table.index(
      ["audit_id", "status"],
      "idx_leadgen_email_notif_audit_status"
    );
    table.index(
      ["status", "created_at"],
      "idx_leadgen_email_notif_status_created"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("leadgen_email_notifications");
}
