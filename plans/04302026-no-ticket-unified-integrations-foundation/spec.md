# Unified Integrations — Foundation (Plan 1 of 3)

## Why
All third-party integrations (HubSpot, Rybbit, Clarity, GSC) need to live in a single `website_integrations` table with proper credential encryption, per-project linking, and unified sync logging. Today Clarity credentials are hardcoded in source, Rybbit lives in `header_footer_code` + a column on `projects`, and GSC doesn't exist. This plan lays the schema foundation and migrates existing data so Plans 2 and 3 can build on clean infrastructure.

## What
- Extend `website_integrations` to support all four platforms and three integration types
- Create `integration_harvest_logs` for data-pull job auditing
- Create `website_builder.clarity_data`, `website_builder.rybbit_data`, `website_builder.gsc_data` tables
- Migrate existing `public.clarity_data_store` data into the new table
- Migrate existing Rybbit `header_footer_code` entries into `website_integrations` rows
- Migrate Clarity credentials from `domainMappings.ts` into encrypted `website_integrations` rows

## Context

**Relevant files:**
- `src/database/migrations/20260425100000_create_website_integrations.ts` — current schema (HubSpot-only, `encrypted_credentials NOT NULL`)
- `src/database/migrations/20260425100002_create_crm_sync_logs.ts` — analog for the new harvest logs table
- `src/models/website-builder/WebsiteIntegrationModel.ts` — model needs type awareness
- `src/models/ClarityDataModel.ts` — current Clarity model targeting `public.clarity_data_store`
- `src/utils/core/domainMappings.ts` — hardcoded Clarity `projectId` + `apiToken` per domain (8 entries)
- `src/controllers/admin-websites/feature-services/service.rybbit.ts` — current Rybbit provisioning writes to `header_footer_code`
- `src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts` — existing `rybbit_site_id` column on projects
- `src/utils/encryption.ts` — AES-256-GCM encrypt/decrypt (reuse for Clarity token migration)

**Patterns to follow:**
- `crm_sync_logs` migration structure for `integration_harvest_logs`
- `website_integrations` migration structure for ALTER migration
- `ClarityDataModel.ts` upsert pattern for new data models

**Reference file:** `src/database/migrations/20260425100002_create_crm_sync_logs.ts` — closest analog for new logging table

## Constraints

**Must:**
- All new tables in `website_builder` schema
- `integration_harvest_logs` must use `ON DELETE SET NULL` on integration FK (survive deletion like `crm_sync_logs`)
- Data migration must map domains to `project_id` via `projects.custom_domain`
- Clarity API tokens must be encrypted with AES-256-GCM before insert
- New data tables use JSONB (not JSON) for the data column
- Unique constraints on `(project_id, report_date)` for all data tables
- `encrypted_credentials` becomes nullable (Rybbit uses global env vars, GSC uses `google_connections`)

**Must not:**
- Do not drop `public.clarity_data_store` — leave it for manual cleanup after verification
- Do not drop `rybbit_site_id` from projects — keep as a fast lookup; deprecate later
- Do not drop `header_footer_code` Rybbit entries — mark disabled, remove in Plan 2 after renderer reads integrations
- Do not modify existing HubSpot integration behavior
- Do not touch `google_connections` table (GSC OAuth changes are Plan 2)

**Out of scope:**
- Adapter code, cron processors, renderer changes (Plan 2)
- UI components (Plan 3)
- Removing `domainMappings.ts` Clarity entries from source (Plan 2 — after verifying DB credentials work)

## Risk

**Level:** 2 — Concern

**Risks identified:**
- Domain → project_id mapping may not resolve for all 8 domains → **Mitigation:** migration logs unmapped domains, creates rows only for matched projects, reports misses
- Making `encrypted_credentials` nullable may break model code that assumes non-null → **Mitigation:** audit all consumers in T1, update model type to `string | null`
- Clarity `clarity_data_store` has duplicate rows (Artful has 2 per date) → **Mitigation:** new table has UNIQUE constraint; migration uses `DISTINCT ON` to deduplicate
- 7 of 8 Clarity domains stopped ingesting 2026-03-09 → **Mitigation:** integration rows for those domains get `status = 'broken'` with `last_error` noting data staleness

**Blast radius:**
- `WebsiteIntegrationModel.ts` — used by `WebsiteIntegrationsController`, `crmPush.processor`, `crmMappingValidation.processor`, `formSubmissionController`
- `ClarityDataModel.ts` — used by `ClarityController`, `service.clarity-data`, `service.clarity-metrics`
- `domainMappings.ts` — used by `ClarityController`, `service.clarity-domain-mapping`, `businessMetrics.ts`, `vocabularyAutoMapper.ts`, agent orchestrator, checkup routes

## Tasks

### T1: Extend `website_integrations` schema
**Do:**
- Add `type TEXT NOT NULL DEFAULT 'crm_push'` with CHECK `('crm_push', 'script_injection', 'data_harvest', 'hybrid')`
- Expand `platform` CHECK to include `('hubspot', 'rybbit', 'clarity', 'gsc')`
- Make `encrypted_credentials` nullable (`ALTER COLUMN encrypted_credentials DROP NOT NULL`)
- Add `connected_by TEXT` with CHECK `('user', 'admin', 'system')` — nullable, defaults null for existing rows
- Update `WebsiteIntegrationModel.ts` — add `type` and `connected_by` to interface, SAFE_COLUMNS
**Files:** `src/database/migrations/20260430200000_extend_website_integrations.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`
**Depends on:** none
**Verify:** `npx knex migrate:latest` succeeds; existing HubSpot rows unaffected (type defaults to `crm_push`)

### T2: Create `integration_harvest_logs` table
**Do:**
- Create table with: `id UUID`, `integration_id UUID` (FK SET NULL), `platform TEXT` (denormalized), `harvest_date DATE`, `outcome TEXT CHECK ('success', 'failed')`, `rows_fetched INTEGER`, `error TEXT`, `error_details TEXT`, `retry_count INTEGER DEFAULT 0`, `attempted_at TIMESTAMPTZ DEFAULT NOW()`
- Indexes: `(integration_id, attempted_at DESC)`, `(outcome, attempted_at DESC) WHERE outcome = 'failed'`
- Create model `IntegrationHarvestLogModel.ts` with: `create()`, `findByIntegrationId(id, limit, offset)`, `findFailedByIntegrationId(id)`, `incrementRetry(id)`, `getSuccessRate(integrationId, days)`
**Files:** `src/database/migrations/20260430200001_create_integration_harvest_logs.ts`, `src/models/website-builder/IntegrationHarvestLogModel.ts`
**Depends on:** T1
**Verify:** migration runs clean; model CRUD works

### T3: Create data storage tables
**Do:**
- `website_builder.clarity_data`: `id UUID`, `project_id UUID FK CASCADE`, `report_date DATE`, `data JSONB`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `UNIQUE(project_id, report_date)`
- `website_builder.rybbit_data`: same shape
- `website_builder.gsc_data`: same shape
- Index on `(project_id, report_date DESC)` for each
- Create models: `ClarityDataModelV2.ts`, `RybbitDataModel.ts`, `GscDataModel.ts` — each with `upsert()`, `findByProjectAndDateRange()`
**Files:** `src/database/migrations/20260430200002_create_analytics_data_tables.ts`, `src/models/website-builder/ClarityDataModelV2.ts`, `src/models/website-builder/RybbitDataModel.ts`, `src/models/website-builder/GscDataModel.ts`
**Depends on:** none
**Verify:** migration runs clean; upsert idempotency confirmed

### T4: Data migration — Clarity
**Do:**
- Knex migration that:
  1. Queries all `domainMappings` entries that have `clarity_projectId` + `clarity_apiToken`
  2. For each, finds `project_id` via `SELECT id FROM website_builder.projects WHERE custom_domain = $domain`
  3. Creates `website_integrations` row: `platform='clarity'`, `type='hybrid'`, `encrypted_credentials=encrypt(apiToken)`, `metadata={ projectId, domain }`, `status='active'`, `connected_by='system'`
  4. Copies rows from `public.clarity_data_store WHERE domain = $domain` → `website_builder.clarity_data` using `DISTINCT ON (domain, report_date)` to deduplicate, mapping domain → project_id
  5. Logs results: matched/unmatched domains, rows copied, duplicates skipped
- Migration reads `domainMappings.ts` entries directly (hardcoded in migration since this is a one-time operation)
**Files:** `src/database/migrations/20260430200003_migrate_clarity_to_integrations.ts`
**Depends on:** T1, T3
**Verify:** `SELECT COUNT(*) FROM website_builder.clarity_data` matches `public.clarity_data_store` (minus duplicates); integration rows have encrypted credentials

### T5: Data migration — Rybbit
**Do:**
- Knex migration that:
  1. Queries `website_builder.header_footer_code WHERE name = 'Rybbit Analytics'`
  2. For each, extracts `project_id` (already on the row) and `data-site-id` from the code HTML
  3. Creates `website_integrations` row: `platform='rybbit'`, `type='hybrid'`, `encrypted_credentials=NULL` (global API key via env), `metadata={ siteId, rybbitApiUrl: process.env.RYBBIT_API_URL }`, `status='active'`, `connected_by='system'`
  4. Sets `header_footer_code.is_enabled = false` on the old snippet (don't delete — Plan 2 renderer will take over)
  5. Logs: projects migrated, site IDs extracted
- Parse site ID from script tag using regex: `data-site-id="(\d+)"`
**Files:** `src/database/migrations/20260430200004_migrate_rybbit_to_integrations.ts`
**Depends on:** T1
**Verify:** `SELECT COUNT(*) FROM website_builder.website_integrations WHERE platform = 'rybbit'` matches count of Rybbit snippets; old snippets are disabled

## Done
- [ ] `npx knex migrate:latest` — all 5 migrations run without error
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Existing HubSpot integrations unaffected (type defaults to `crm_push`, encrypted_credentials still non-null for those rows)
- [ ] `website_builder.clarity_data` row count matches `public.clarity_data_store` minus duplicates
- [ ] `website_builder.website_integrations` has rows for all migrated Rybbit + Clarity projects
- [ ] Clarity credentials are encrypted (not plaintext) in `website_integrations.encrypted_credentials`
- [ ] No regressions in existing Clarity endpoints (`/clarity/fetch`, `/clarity/getKeyData`)
