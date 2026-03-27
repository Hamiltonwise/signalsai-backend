# Automate Rybbit Site Provisioning on Domain Verification

## Why
Every time a client site goes live with a custom domain, you manually create a Rybbit site, copy the tracking script, and paste it into header code. This is tedious and error-prone. Automating it removes a manual step from the go-live flow and ensures every verified site gets analytics tracking from day one.

## What
When `verifyDomain` succeeds for a project, automatically: (1) create a Rybbit site via API, (2) store the returned `siteId` on the project, (3) inject the Rybbit tracking script as a `header_footer_code` snippet at `head_end`. The site starts collecting analytics immediately with zero manual work.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — `verifyDomain()` function, hook point at line 175
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.hfcm-manager.ts` — `createProjectSnippet()` for injecting script tags
- `signalsai-backend/src/controllers/admin-websites/feature-utils/util.html-sanitizer.ts` — already allows `<script>` with `src`, `async`, `data-*`
- `signalsai-backend/.env` — needs Rybbit env vars appended

**Patterns to follow:**
- Service functions return `Result<T>` pattern (see `service.custom-domain.ts`)
- Console logging with `[Module Name]` prefix
- Non-blocking side effects (fire-and-forget with error logging)

**Key decisions already made:**
- Single Rybbit org: `CFgeNJ1i0Arnxo3UnZpcjduT7rnNudBs`
- Self-hosted at `analytics.getalloro.com`
- Script injection via `header_footer_code` at `head_end`
- Store `rybbit_site_id` on `projects` table for future API calls (proofline/summary)

## Constraints

**Must:**
- Non-blocking: Rybbit API failure must NOT block domain verification
- Idempotent: Skip Rybbit setup if `rybbit_site_id` already exists on the project
- Use existing `createProjectSnippet()` for script injection
- Append env vars to `.env` (not overwrite)

**Must not:**
- No new npm dependencies (use native `fetch` or existing `axios`)
- Don't modify the `verifyDomain` return type or existing behavior
- Don't touch frontend
- Don't add Rybbit site deletion on disconnect (future scope)

**Out of scope:**
- Proofline/Summary agent Rybbit data integration
- Frontend UI for Rybbit site management
- Rybbit cleanup on domain disconnect

## Risk

**Level:** 2

**Risks identified:**
- Rybbit API timeout/failure during verify flow → **Mitigation:** try/catch, log error, proceed. Domain verification is the primary operation; Rybbit is a side effect.
- Duplicate sites if re-run without idempotency → **Mitigation:** Check `rybbit_site_id` column before calling API. If already set, skip.
- Duplicate `header_footer_code` snippet on re-run → **Mitigation:** Check for existing snippet named "Rybbit Analytics" on the project before creating.

## Tasks

### T1: Migration — add `rybbit_site_id` to projects table
**Do:** Create a Knex migration adding `rybbit_site_id VARCHAR(50) NULL` to `website_builder.projects`.
**Files:** `signalsai-backend/src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts`
**Verify:** `npx knex migrate:latest` runs without error

### T2: Rybbit service — create site + inject tracking script
**Do:** Create `service.rybbit.ts` in the custom-domain feature-services folder with:
- `provisionRybbitSite(projectId, domain)` — calls `POST /api/organizations/:orgId/sites` with `{ domain, name: domain }`, stores returned `siteId` on the project's `rybbit_site_id` column, then calls `createProjectSnippet()` to inject the tracking script at `head_end`. Full try/catch — logs errors but never throws.
**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts`
**Verify:** Manual: call with a test domain, confirm Rybbit site created + snippet inserted

### T3: Hook into verifyDomain — call provisioning after successful verification
**Do:** In `service.custom-domain.ts`, after `refreshCustomDomainCache()` (line 175), add a non-blocking call to `provisionRybbitSite(projectId, project.custom_domain)`. Use fire-and-forget pattern (no `await` — or `await` inside try/catch so it doesn't block the return).
**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts`
**Verify:** `npx tsc --noEmit` passes. Manual: verify domain → confirm Rybbit site appears in dashboard + snippet in DB.

### T4: Append Rybbit env vars to .env
**Do:** Append `RYBBIT_API_KEY`, `RYBBIT_API_URL`, `RYBBIT_ORG_ID` to the `.env` file under a new `# ─── Rybbit Analytics ───` section.
**Files:** `signalsai-backend/.env`
**Verify:** `grep RYBBIT .env` returns all three vars

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Migration runs clean
- [ ] Domain verification still works as before (no regression)
- [ ] Rybbit site is created in dashboard after domain verification
- [ ] Tracking script appears in `header_footer_code` for the project
- [ ] `rybbit_site_id` is populated on the project row
- [ ] Rybbit API failure does not break domain verification
