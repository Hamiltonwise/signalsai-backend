-- Migration: Website Integrations (HubSpot Form-to-Contact Mapping v1)
-- Target: PostgreSQL (production DB engine for Alloro)
-- Schema: website_builder
-- Apply order: 1) website_integrations, 2) website_integration_form_mappings, 3) crm_sync_logs

-- =============================================================================
-- 1) website_integrations
-- One row per (project, vendor) connection. Stores encrypted credentials.
-- =============================================================================

CREATE TABLE website_builder.website_integrations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
    platform              TEXT NOT NULL,
    label                 TEXT NULL,
    encrypted_credentials TEXT NOT NULL,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'active',
    last_validated_at     TIMESTAMPTZ NULL,
    last_error            TEXT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT website_integrations_status_check
        CHECK (status IN ('active', 'revoked', 'broken')),
    CONSTRAINT website_integrations_platform_check
        CHECK (platform IN ('hubspot')),
    CONSTRAINT website_integrations_unique_project_platform
        UNIQUE (project_id, platform)
);

CREATE INDEX idx_website_integrations_project_id
    ON website_builder.website_integrations (project_id);

CREATE INDEX idx_website_integrations_platform
    ON website_builder.website_integrations (platform);

CREATE INDEX idx_website_integrations_status
    ON website_builder.website_integrations (status)
    WHERE status != 'active';

COMMENT ON TABLE website_builder.website_integrations IS
    'Per-project third-party CRM integrations. encrypted_credentials uses AES-256-GCM (src/utils/encryption.ts). metadata holds vendor-specific data (HubSpot: { portalId, accountName }). platform CHECK is widened in a follow-up migration when each new vendor lands.';

-- =============================================================================
-- 2) website_integration_form_mappings
-- Many-rows-per-integration. N website forms can map to 1 vendor form.
-- =============================================================================

CREATE TABLE website_builder.website_integration_form_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id      UUID NOT NULL REFERENCES website_builder.website_integrations(id) ON DELETE CASCADE,
    website_form_name   TEXT NOT NULL,
    vendor_form_id      TEXT NOT NULL,
    vendor_form_name    TEXT NULL,
    field_mapping       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              TEXT NOT NULL DEFAULT 'active',
    last_validated_at   TIMESTAMPTZ NULL,
    last_error          TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT integration_form_mappings_status_check
        CHECK (status IN ('active', 'broken')),
    CONSTRAINT integration_form_mappings_unique_integration_form
        UNIQUE (integration_id, website_form_name)
);

CREATE INDEX idx_integration_form_mappings_integration_id
    ON website_builder.website_integration_form_mappings (integration_id);

CREATE INDEX idx_integration_form_mappings_vendor_form
    ON website_builder.website_integration_form_mappings (integration_id, vendor_form_id);

CREATE INDEX idx_integration_form_mappings_status
    ON website_builder.website_integration_form_mappings (status)
    WHERE status = 'broken';

COMMENT ON TABLE website_builder.website_integration_form_mappings IS
    'Mapping rows: each row links one website form_name to one vendor form (HubSpot form GUID). field_mapping is { websiteFieldKey: vendorFieldName }. Multiple website forms may share a vendor_form_id within the same integration.';

-- =============================================================================
-- 3) crm_sync_logs
-- Audit trail of every CRM push attempt (success, skip, failure).
-- =============================================================================

CREATE TABLE website_builder.crm_sync_logs (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id         UUID NULL REFERENCES website_builder.website_integrations(id) ON DELETE SET NULL,
    mapping_id             UUID NULL REFERENCES website_builder.website_integration_form_mappings(id) ON DELETE SET NULL,
    submission_id          UUID NULL REFERENCES website_builder.form_submissions(id) ON DELETE SET NULL,
    -- Denormalized columns: preserved when the integration/mapping rows are deleted,
    -- so the audit trail remains useful for forensic queries.
    platform               TEXT NULL,
    vendor_form_id         TEXT NULL,
    outcome                TEXT NOT NULL,
    vendor_response_status INT NULL,
    vendor_response_body   TEXT NULL,
    error                  TEXT NULL,
    attempted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT crm_sync_logs_outcome_check
        CHECK (outcome IN ('success', 'skipped_flagged', 'failed', 'no_mapping'))
);

CREATE INDEX idx_crm_sync_logs_integration_attempted
    ON website_builder.crm_sync_logs (integration_id, attempted_at DESC);

CREATE INDEX idx_crm_sync_logs_submission
    ON website_builder.crm_sync_logs (submission_id);

CREATE INDEX idx_crm_sync_logs_outcome
    ON website_builder.crm_sync_logs (outcome, attempted_at DESC)
    WHERE outcome IN ('failed', 'skipped_flagged');

COMMENT ON TABLE website_builder.crm_sync_logs IS
    'Audit trail of all CRM push attempts. integration_id uses ON DELETE SET NULL (not CASCADE) so the audit trail outlives the integration row. platform and vendor_form_id are denormalized at write time for the same reason — when integration/mapping rows are deleted, these columns retain enough context to make the log row useful in support queries. We do NOT log a row when no integration exists at all (write-amplification avoidance); the lowest "intent" threshold for logging is "customer connected an integration."';

-- =============================================================================
-- Rollback (manual)
-- =============================================================================
-- DROP TABLE website_builder.crm_sync_logs;
-- DROP TABLE website_builder.website_integration_form_mappings;
-- DROP TABLE website_builder.website_integrations;
