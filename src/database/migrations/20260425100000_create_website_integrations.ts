import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE website_builder.website_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      label TEXT,
      encrypted_credentials TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'active',
      last_validated_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT website_integrations_status_check
        CHECK (status IN ('active', 'revoked', 'broken')),
      CONSTRAINT website_integrations_platform_check
        CHECK (platform IN ('hubspot')),
      CONSTRAINT website_integrations_unique_project_platform
        UNIQUE (project_id, platform)
    );

    CREATE INDEX idx_website_integrations_project_id
      ON website_builder.website_integrations(project_id);

    CREATE INDEX idx_website_integrations_platform
      ON website_builder.website_integrations(platform);

    CREATE INDEX idx_website_integrations_status
      ON website_builder.website_integrations(status)
      WHERE status != 'active';

    COMMENT ON TABLE website_builder.website_integrations IS
      'Per-project third-party CRM integrations. encrypted_credentials uses AES-256-GCM (src/utils/encryption.ts). metadata holds vendor-specific data (HubSpot: { portalId, accountName }). platform CHECK is widened in a follow-up migration when each new vendor lands.';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.website_integrations CASCADE`);
}
