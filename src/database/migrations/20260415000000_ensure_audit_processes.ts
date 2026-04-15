import type { Knex } from "knex";

/**
 * Ensures the audit_processes table exists with the strict schema expected by
 * the migrated leadgen audit pipeline. Idempotent — if the table already exists
 * (e.g. created externally by the prior n8n flow) this is a no-op.
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("audit_processes");
  if (exists) return;

  await knex.raw(`
    CREATE TABLE audit_processes (
      id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      domain                 VARCHAR(255) NOT NULL,
      practice_search_string TEXT         NOT NULL,
      status                 VARCHAR(32)  NOT NULL DEFAULT 'pending',
      realtime_status        INTEGER      NOT NULL DEFAULT 0,
      error_message          TEXT,
      step_screenshots       JSONB,
      step_website_analysis  JSONB,
      step_self_gbp          JSONB,
      step_competitors       JSONB,
      step_gbp_analysis      JSONB,
      created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_processes_status
      ON audit_processes (status);

    CREATE INDEX IF NOT EXISTS idx_audit_processes_domain
      ON audit_processes (domain);

    CREATE INDEX IF NOT EXISTS idx_audit_processes_realtime_status
      ON audit_processes (realtime_status);
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: the audit_processes table predates this migration in production.
  // Dropping it here would destroy data owned by the prior n8n pipeline.
}
