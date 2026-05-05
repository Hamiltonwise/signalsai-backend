import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE website_builder.integration_harvest_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID REFERENCES website_builder.website_integrations(id) ON DELETE SET NULL,
      platform TEXT,
      harvest_date DATE NOT NULL,
      outcome TEXT NOT NULL,
      rows_fetched INTEGER,
      error TEXT,
      error_details TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT integration_harvest_logs_outcome_check
        CHECK (outcome IN ('success', 'failed'))
    );

    CREATE INDEX idx_harvest_logs_integration_attempted
      ON website_builder.integration_harvest_logs(integration_id, attempted_at DESC);

    CREATE INDEX idx_harvest_logs_failed
      ON website_builder.integration_harvest_logs(outcome, attempted_at DESC)
      WHERE outcome = 'failed';

    COMMENT ON TABLE website_builder.integration_harvest_logs IS
      'Audit trail of all data harvest (pull) attempts. Mirrors crm_sync_logs pattern for inbound data. integration_id uses ON DELETE SET NULL so logs survive integration deletion. platform is denormalized at write time.';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.integration_harvest_logs CASCADE`);
}
