import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.website_integrations
      ADD COLUMN type TEXT NOT NULL DEFAULT 'crm_push',
      ADD COLUMN connected_by TEXT;

    ALTER TABLE website_builder.website_integrations
      ADD CONSTRAINT website_integrations_type_check
        CHECK (type IN ('crm_push', 'script_injection', 'data_harvest', 'hybrid'));

    ALTER TABLE website_builder.website_integrations
      ADD CONSTRAINT website_integrations_connected_by_check
        CHECK (connected_by IN ('user', 'admin', 'system'));

    ALTER TABLE website_builder.website_integrations
      DROP CONSTRAINT website_integrations_platform_check;

    ALTER TABLE website_builder.website_integrations
      ADD CONSTRAINT website_integrations_platform_check
        CHECK (platform IN ('hubspot', 'rybbit', 'clarity', 'gsc'));

    ALTER TABLE website_builder.website_integrations
      ALTER COLUMN encrypted_credentials DROP NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.website_integrations
      DROP CONSTRAINT IF EXISTS website_integrations_type_check;

    ALTER TABLE website_builder.website_integrations
      DROP CONSTRAINT IF EXISTS website_integrations_connected_by_check;

    ALTER TABLE website_builder.website_integrations
      DROP COLUMN IF EXISTS type,
      DROP COLUMN IF EXISTS connected_by;

    ALTER TABLE website_builder.website_integrations
      DROP CONSTRAINT IF EXISTS website_integrations_platform_check;

    ALTER TABLE website_builder.website_integrations
      ADD CONSTRAINT website_integrations_platform_check
        CHECK (platform IN ('hubspot'));

    ALTER TABLE website_builder.website_integrations
      ALTER COLUMN encrypted_credentials SET NOT NULL;
  `);
}
