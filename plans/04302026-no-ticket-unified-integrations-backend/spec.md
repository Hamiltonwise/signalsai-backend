# Unified Integrations — Backend + Renderer (Plan 2 of 3)

## Why
With the schema in place (Plan 1), we need the runtime layer: adapters that talk to each platform's API, a daily cron that harvests data, the renderer reading integration rows for script injection, and GSC OAuth wiring. Today Clarity fetching is manual (`POST /clarity/fetch`), Rybbit data fetching is scattered across `service.rybbit-data.ts`, and the renderer only knows about `header_footer_code`.

## What
- Create `IDataHarvestAdapter` interface + adapters for Rybbit, Clarity, GSC
- Create daily BullMQ cron processor that harvests data for all active `data_harvest`/`hybrid` integrations
- Create backend endpoints for new platforms (CRUD, validate, sync logs, rerun failed)
- Update renderer to query `website_integrations` for script injection (Rybbit, Clarity)
- Wire GSC OAuth scope (`webmasters.readonly`) into existing Google OAuth flow
- Migrate existing Clarity + Rybbit services to use new integration rows instead of `domainMappings.ts` and `header_footer_code`

## Context

**Relevant files:**
- `src/services/integrations/types.ts` — existing `ICrmAdapter` interface (CRM-focused, not suitable for harvest)
- `src/services/integrations/index.ts` — adapter registry pattern (extend for harvest adapters)
- `src/services/integrations/hubspotAdapter.ts` — reference adapter implementation
- `src/workers/worker.ts` — 7 existing repeatable jobs, cron setup pattern (lines 127-495)
- `src/workers/queues.ts` — queue factory functions (`getMindsQueue`, `getCrmQueue`, etc.)
- `src/workers/processors/crmPush.processor.ts` — reference processor
- `src/controllers/clarity/feature-services/service.clarity-api.ts` — existing Clarity API caller
- `src/utils/rybbit/service.rybbit-data.ts` — existing Rybbit data fetcher (`fetchRybbitOverview`)
- `src/controllers/admin-websites/feature-services/service.rybbit.ts` — Rybbit provisioning (writes to `header_footer_code`)
- `src/controllers/auth/feature-services/ScopeManagementService.ts` — OAuth scope map (currently only `gbp`)
- `src/auth/oauth2Helper.ts` — `getValidOAuth2ClientByConnection()` for token refresh
- **Renderer:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` — `assembleHtml()` + `assembleArtifactHtml()` (lines 54-178)
- **Renderer:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/utils/renderer.ts` — `injectCodeSnippets()` (lines 116-171)

**Patterns to follow:**
- Adapter registry pattern from `src/services/integrations/index.ts`
- BullMQ repeatable job setup from `worker.ts` (e.g., `setupCrmMappingValidationSchedule`)
- Controller structure from `WebsiteIntegrationsController.ts`

**Reference file:** `src/workers/processors/crmPush.processor.ts` — closest analog for the harvest processor

## Constraints

**Must:**
- Rybbit adapter uses global env vars (`RYBBIT_API_URL`, `RYBBIT_API_KEY`) — no per-project credentials
- Rybbit validation: `GET /api/sites/{siteId}` with Bearer token
- Clarity adapter uses per-project encrypted API token from `website_integrations.encrypted_credentials`
- Clarity API limit: max 10 calls/project/day, 3-day lookback, 1000 rows — daily cron uses 1 call per project (no dimensions)
- GSC adapter uses OAuth tokens from `google_connections` table — `website_integrations.metadata.googleConnectionId` links them
- GSC scope: `https://www.googleapis.com/auth/webmasters.readonly`
- Daily cron runs at a quiet hour (e.g., `0 5 * * *` UTC) — after review sync (4 AM), before discovery (6 AM)
- Max 3 retries per failed harvest — tracked in `integration_harvest_logs.retry_count`
- Renderer must not break if `website_integrations` table is empty or query fails — graceful fallback to existing `header_footer_code`
- Renderer injects Rybbit at `head_end`, Clarity at `head_end` (both need early page load)

**Must not:**
- Do not remove existing `/clarity/*` routes yet — they still serve the dashboard until UI migration (Plan 3)
- Do not remove `service.rybbit-data.ts` yet — agent orchestrator depends on it until wired to new data tables
- Do not modify HubSpot adapter or CRM push processor
- Do not change Rybbit auto-provisioning on domain verification — update it to also create an integration row

**Out of scope:**
- Admin/user UI for new platforms (Plan 3)
- Data aggregation or dashboard views (future project)
- Removing legacy `domainMappings.ts` Clarity entries from source (after Plan 3 verifies everything works end-to-end)

## Risk

**Level:** 2 — Concern

**Risks identified:**
- Renderer changes affect all live sites → **Mitigation:** feature-flag via env var (`INTEGRATIONS_SCRIPT_INJECTION=true`); renderer falls back to `header_footer_code` if flag is off or query fails
- Clarity 10-call/day limit could be exhausted by cron + manual validation → **Mitigation:** cron uses 1 call; validation uses 1 call; leaves 8 for reruns/testing
- GSC OAuth token stored in `google_connections` may not have `webmasters.readonly` scope → **Mitigation:** adapter checks granted scopes before fetching; returns clear error if missing
- Rybbit API is in beta (per their docs) → **Mitigation:** adapter wraps all calls in try/catch, logs errors, never blocks

**Blast radius:**
- Renderer `site.ts` — serves ALL live websites
- `worker.ts` — adding a new repeatable job schedule function
- `queues.ts` — adding a new queue factory
- `ScopeManagementService.ts` — used by OAuth reconnect flow
- `service.rybbit.ts` (provisioning) — called on domain verification

**Pushback:**
- The renderer lives in a separate repo (`website-builder-rebuild`). Changes there require separate deployment. Ensure renderer changes are backward-compatible — if deployed before the Alloro app migrations, the new query should return empty results (table doesn't exist yet), not crash.

## Tasks

### T1: Create `IDataHarvestAdapter` interface + adapter registry
**Do:**
- Define `IDataHarvestAdapter` in `src/services/integrations/harvest-types.ts`:
  - `validateConnection(integration: IWebsiteIntegration): Promise<ValidateHarvestResult>`
  - `fetchData(integration: IWebsiteIntegration, date: string): Promise<HarvestResult>`
- Define result types: `ValidateHarvestResult { ok, error?, errorMessage? }`, `HarvestResult { ok, data: unknown, rowCount: number, error? }`
- Create registry in `src/services/integrations/harvest-registry.ts` with `getHarvestAdapter(platform)`
**Files:** `src/services/integrations/harvest-types.ts`, `src/services/integrations/harvest-registry.ts`
**Depends on:** none
**Verify:** TypeScript compiles

### T2: Rybbit harvest adapter
**Do:**
- `src/services/integrations/rybbitHarvestAdapter.ts`
- `validateConnection`: `GET {RYBBIT_API_URL}/api/sites/{metadata.siteId}` with Bearer `RYBBIT_API_KEY`
- `fetchData`: `GET {RYBBIT_API_URL}/api/sites/{metadata.siteId}/overview?startDate={date}&endDate={date}&timezone=America/New_York` — returns sessions, pageviews, users, bounce_rate, pages_per_session, session_duration
- Register in harvest-registry
**Files:** `src/services/integrations/rybbitHarvestAdapter.ts`
**Depends on:** T1
**Verify:** adapter instantiates; TypeScript compiles

### T3: Clarity harvest adapter
**Do:**
- `src/services/integrations/clarityHarvestAdapter.ts`
- `validateConnection`: `GET clarity API` with Bearer token from `getDecryptedCredentials(integration.id)` — call with `numOfDays=1` and check for valid response
- `fetchData`: call `fetchClarityLiveInsights(metadata.projectId, 1)` using decrypted token — reuse existing `service.clarity-api.ts` logic
- Register in harvest-registry
**Files:** `src/services/integrations/clarityHarvestAdapter.ts`
**Depends on:** T1
**Verify:** adapter instantiates; TypeScript compiles

### T4: GSC harvest adapter + OAuth scope wiring
**Do:**
- `src/services/integrations/gscHarvestAdapter.ts`
- `validateConnection`: load `google_connections` row via `metadata.googleConnectionId`, get OAuth2 client via `getValidOAuth2ClientByConnection()`, call `searchconsole.sites.list()` and verify `metadata.siteUrl` exists
- `fetchData`: call `searchconsole.searchanalytics.query()` with `startDate=date`, `endDate=date`, dimensions `['query', 'page']`, return raw response
- Add `gsc: "https://www.googleapis.com/auth/webmasters.readonly"` to `ScopeManagementService.SCOPE_MAP`
- Add scope description to `scopeDefinitions.ts`
**Files:** `src/services/integrations/gscHarvestAdapter.ts`, `src/controllers/auth/feature-services/ScopeManagementService.ts`, `src/controllers/googleauth/utils/scopeDefinitions.ts`
**Depends on:** T1
**Verify:** TypeScript compiles; `GET /auth/google/scopes` returns GSC scope

### T5: Daily harvest cron processor
**Do:**
- Create `src/workers/processors/dataHarvest.processor.ts`
  - Queries `website_integrations WHERE type IN ('data_harvest', 'hybrid') AND status = 'active'`
  - For each: call `getHarvestAdapter(platform).fetchData(integration, yesterday)`
  - On success: upsert into appropriate data table (`ClarityDataModelV2`, `RybbitDataModel`, `GscDataModel`), log to `integration_harvest_logs` with outcome='success'
  - On failure: log to `integration_harvest_logs` with outcome='failed', error details
  - If `retry_count >= 3`: skip, do not auto-retry (manual rerun only)
- Create queue: add `getHarvestQueue(name)` to `src/workers/queues.ts` with prefix `{harvest}`
- Register worker + repeatable job in `worker.ts`: queue `harvest-daily`, cron `0 5 * * *` UTC
- Add rerun endpoint support: process single integration+date when job data contains `integrationId` + `harvestDate` (manual rerun path)
**Files:** `src/workers/processors/dataHarvest.processor.ts`, `src/workers/queues.ts`, `src/workers/worker.ts`
**Depends on:** T1, T2, T3, T4
**Verify:** worker starts without error; repeatable job is registered

### T6: Backend endpoints for harvest integrations
**Do:**
- Add to `WebsiteIntegrationsController.ts`:
  - `POST /:id/integrations/:integrationId/validate` — calls adapter `validateConnection()`, updates `last_validated_at`
  - `GET /:id/integrations/:integrationId/harvest-logs` — paginated harvest logs (30 days default)
  - `POST /:id/integrations/:integrationId/rerun` — accepts `{ harvestDate }`, checks `retry_count < 3`, enqueues harvest job
- Add routes to `src/routes/admin/websites.ts`
- Extend existing `POST /:id/integrations` (create) to accept new platforms with type-specific validation:
  - `rybbit`: validate siteId via adapter, no credentials needed
  - `clarity`: validate API token via adapter, encrypt credentials
  - `gsc`: validate googleConnectionId exists and has GSC scope
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`
**Depends on:** T1, T2, T3, T4, T5
**Verify:** endpoints respond correctly via curl/Postman

### T7: Renderer script injection from `website_integrations`
**Do:**
- In `website-builder-rebuild/src/routes/site.ts`:
  - Add query: `SELECT platform, metadata FROM website_builder.website_integrations WHERE project_id = ? AND status = 'active' AND type IN ('script_injection', 'hybrid')`
  - Build script tags per platform:
    - Rybbit: `<script src="{RYBBIT_API_URL}/api/script.js" async data-site-id="{metadata.siteId}"></script>`
    - Clarity: the full IIFE snippet with `metadata.projectId`
  - Inject at `head_end` position alongside existing `header_footer_code` snippets
  - Guard with env var `INTEGRATIONS_SCRIPT_INJECTION` — if unset or `false`, skip entirely
  - Graceful fallback: if query throws (e.g., table doesn't exist yet), log warning and continue with `header_footer_code` only
- Apply to both `assembleHtml()` and `assembleArtifactHtml()` code paths
**Files:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts`
**Depends on:** Plan 1 (schema must exist)
**Verify:** local renderer serves pages with integration scripts injected; no scripts when feature flag off

### T8: Update Rybbit provisioning to create integration row
**Do:**
- In `service.rybbit.ts` `provisionRybbitSite()`:
  - After creating Rybbit site and storing `rybbit_site_id`, also create a `website_integrations` row: `platform='rybbit'`, `type='hybrid'`, `metadata={ siteId }`, `connected_by='system'`
  - Keep writing `header_footer_code` snippet for backward compatibility until renderer reads integrations (controlled by feature flag)
  - Check for existing integration row before creating (idempotent)
**Files:** `src/controllers/admin-websites/feature-services/service.rybbit.ts`
**Depends on:** Plan 1 T1
**Verify:** provisioning a new domain creates both `header_footer_code` entry and `website_integrations` row

## Done
- [ ] `npx tsc --noEmit` — zero errors in both repos
- [ ] Daily harvest cron registered in `worker.ts` and fires on schedule
- [ ] Rybbit adapter validates connection against self-hosted instance
- [ ] Clarity adapter fetches data using encrypted credentials from DB (not `domainMappings.ts`)
- [ ] GSC scope appears in `GET /auth/google/scopes`
- [ ] Renderer injects Rybbit + Clarity scripts when feature flag is on
- [ ] Renderer still works normally when feature flag is off (backward compatible)
- [ ] Manual rerun of failed harvest works via API endpoint
- [ ] No regressions in HubSpot integration flow
- [ ] No regressions in existing `/clarity/*` endpoints
