import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE minds.platform_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      credential_type TEXT NOT NULL DEFAULT 'api_key',
      encrypted_credentials TEXT NOT NULL,
      label TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_platform_credentials_mind_id
      ON minds.platform_credentials(mind_id);

    CREATE INDEX idx_platform_credentials_platform
      ON minds.platform_credentials(mind_id, platform);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS minds.platform_credentials CASCADE`);
}
