-- Unified Integrations Foundation — PostgreSQL execution script
-- Run in order: T1 → T2 → T3 → T4 → T5

-- =============================================================================
-- T1: Extend website_integrations
-- =============================================================================

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

-- =============================================================================
-- T2: Create integration_harvest_logs
-- =============================================================================

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
  'Audit trail of all data harvest (pull) attempts. Mirrors crm_sync_logs pattern but for inbound data. integration_id uses ON DELETE SET NULL so logs survive integration deletion. platform is denormalized at write time.';

-- =============================================================================
-- T3: Create analytics data tables
-- =============================================================================

CREATE TABLE website_builder.clarity_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clarity_data_unique_project_date
    UNIQUE (project_id, report_date)
);

CREATE INDEX idx_clarity_data_project_date
  ON website_builder.clarity_data(project_id, report_date DESC);

CREATE TABLE website_builder.rybbit_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rybbit_data_unique_project_date
    UNIQUE (project_id, report_date)
);

CREATE INDEX idx_rybbit_data_project_date
  ON website_builder.rybbit_data(project_id, report_date DESC);

CREATE TABLE website_builder.gsc_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gsc_data_unique_project_date
    UNIQUE (project_id, report_date)
);

CREATE INDEX idx_gsc_data_project_date
  ON website_builder.gsc_data(project_id, report_date DESC);

-- =============================================================================
-- T4: Migrate Clarity data (domain → project_id mapping)
-- TODO: fill during execution — requires encrypt() and domain→project lookup
-- =============================================================================

-- T5: Migrate Rybbit data (header_footer_code → website_integrations)
-- TODO: fill during execution — requires parsing script tags and creating integration rows
