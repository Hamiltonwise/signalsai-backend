import type { Knex } from "knex";

/**
 * Adds `retry_count` to `audit_processes`.
 *
 * Used by the public retry endpoint (POST /api/audit/:auditId/retry) to cap
 * user-initiated retries at 3 per audit. Admin rerun
 * (POST /api/admin/leadgen-submissions/:id/rerun) bypasses the cap and does
 * NOT increment this counter — the admin path is an out-of-band manual
 * override.
 *
 * Default 0 so existing rows back-fill safely. No index needed; the column is
 * read as part of per-row UPDATE with WHERE id=..., not scanned.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("audit_processes", (table) => {
    table.integer("retry_count").notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("audit_processes", (table) => {
    table.dropColumn("retry_count");
  });
}
