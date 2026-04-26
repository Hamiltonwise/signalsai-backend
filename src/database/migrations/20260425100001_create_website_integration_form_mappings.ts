import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE website_builder.website_integration_form_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID NOT NULL REFERENCES website_builder.website_integrations(id) ON DELETE CASCADE,
      website_form_name TEXT NOT NULL,
      vendor_form_id TEXT NOT NULL,
      vendor_form_name TEXT,
      field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'active',
      last_validated_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT integration_form_mappings_status_check
        CHECK (status IN ('active', 'broken')),
      CONSTRAINT integration_form_mappings_unique_integration_form
        UNIQUE (integration_id, website_form_name)
    );

    CREATE INDEX idx_integration_form_mappings_integration_id
      ON website_builder.website_integration_form_mappings(integration_id);

    CREATE INDEX idx_integration_form_mappings_vendor_form
      ON website_builder.website_integration_form_mappings(integration_id, vendor_form_id);

    CREATE INDEX idx_integration_form_mappings_status
      ON website_builder.website_integration_form_mappings(status)
      WHERE status = 'broken';

    COMMENT ON TABLE website_builder.website_integration_form_mappings IS
      'Mapping rows: each row links one website form_name to one vendor form (HubSpot form GUID). field_mapping is { websiteFieldKey: vendorFieldName }. Multiple website forms may share a vendor_form_id within the same integration (N->1 fan-in).';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.website_integration_form_mappings CASCADE`);
}
