import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE website_builder.crm_sync_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID REFERENCES website_builder.website_integrations(id) ON DELETE SET NULL,
      mapping_id UUID REFERENCES website_builder.website_integration_form_mappings(id) ON DELETE SET NULL,
      submission_id UUID REFERENCES website_builder.form_submissions(id) ON DELETE SET NULL,
      platform TEXT,
      vendor_form_id TEXT,
      outcome TEXT NOT NULL,
      vendor_response_status INTEGER,
      vendor_response_body TEXT,
      error TEXT,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT crm_sync_logs_outcome_check
        CHECK (outcome IN ('success', 'skipped_flagged', 'failed', 'no_mapping'))
    );

    CREATE INDEX idx_crm_sync_logs_integration_attempted
      ON website_builder.crm_sync_logs(integration_id, attempted_at DESC);

    CREATE INDEX idx_crm_sync_logs_submission
      ON website_builder.crm_sync_logs(submission_id);

    CREATE INDEX idx_crm_sync_logs_outcome
      ON website_builder.crm_sync_logs(outcome, attempted_at DESC)
      WHERE outcome IN ('failed', 'skipped_flagged');

    COMMENT ON TABLE website_builder.crm_sync_logs IS
      'Audit trail of all CRM push attempts. integration_id uses ON DELETE SET NULL (not CASCADE) so the audit trail outlives the integration row. platform and vendor_form_id are denormalized at write time so log rows remain useful after integration/mapping deletion. No row is written when no integration exists at all (write-amplification avoidance).';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.crm_sync_logs CASCADE`);
}
