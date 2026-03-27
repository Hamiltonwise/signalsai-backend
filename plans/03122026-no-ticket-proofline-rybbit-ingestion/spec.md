# Add Rybbit Website Analytics to Proofline Agent

## Why
Proofline currently only has GBP data (impressions, clicks, reviews). Adding Rybbit website analytics (sessions, pageviews, bounce rate) lets the agent correlate "GBP impressions up → did website traffic actually follow?" — giving the doctor a more complete daily picture.

## What
Create a shared Rybbit data fetcher utility. Wire it into `processDailyAgent()` to fetch yesterday + day-before overview data from Rybbit. Pass the website analytics data into the proofline payload alongside existing GBP data. If Rybbit data is unavailable (no `rybbit_site_id`, API failure), proofline runs with GBP-only data as before.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — `processDailyAgent()`, has `organizationId` at line 72
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — `buildProoflinePayload()`, needs new `websiteAnalytics` param
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts` — existing Rybbit provisioning service
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — prompt already expects "Website analytics data" as input

**Patterns to follow:**
- Non-blocking optional data: same pattern as PMS data in `processMonthlyAgents()` (try/catch, log warning, continue with null)
- Rybbit API: `GET /api/sites/:siteId/overview?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&time_zone=America/New_York`, Bearer token auth

**Key decisions:**
- Shared utility goes in a new file `service.rybbit-data.ts` (separate from provisioning in `service.rybbit.ts`)
- Rybbit data is optional — null means "no website analytics available"
- Overview endpoint only for daily (lean) — sessions, pageviews, users, bounce_rate, pages_per_session, session_duration
- Lookup: `organization_id` → `website_builder.projects.rybbit_site_id`

## Constraints

**Must:**
- Never block proofline if Rybbit fails — try/catch, log, return null
- Skip gracefully if no `rybbit_site_id` exists for the org
- Reusable utility — monthly agent integration will call the same function with different dates

**Must not:**
- Don't modify the Proofline.md prompt (it already handles website analytics input)
- Don't add new npm dependencies (use native `fetch`)
- Don't change `processDailyAgent()` function signature

**Out of scope:**
- Monthly agent Rybbit integration (next plan)
- Rybbit `metric` endpoint breakdowns (not needed for daily)
- Frontend changes

## Risk

**Level:** 1

**Risks identified:**
- None significant. Optional data enrichment with graceful fallback.

## Tasks

### T1: Create shared Rybbit data fetcher utility
**Do:** Create `service.rybbit-data.ts` in `signalsai-backend/src/utils/rybbit/` with:
- `getRybbitSiteId(organizationId: number): Promise<string | null>` — queries `website_builder.projects` for `rybbit_site_id` where `organization_id` matches
- `fetchRybbitOverview(siteId: string, startDate: string, endDate: string): Promise<any | null>` — calls Rybbit overview API, returns parsed response or null on failure
- `fetchRybbitDailyComparison(organizationId: number, yesterday: string, dayBefore: string): Promise<{ yesterday: any; dayBefore: any } | null>` — convenience wrapper that looks up siteId, fetches both days, returns structured comparison or null

All functions: try/catch, log errors with `[Rybbit]` prefix, never throw.
**Files:** `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts`
**Verify:** `npx tsc --noEmit`

### T2: Add website analytics to proofline payload
**Do:** In `service.agent-input-builder.ts`:
- Add optional `websiteAnalytics` param to `buildProoflinePayload()`
- If provided, add a `website_analytics` section to `additional_data` alongside `visibility`, `engagement`, `reviews`
- Structure: `{ yesterday: { sessions, pageviews, users, bounce_rate, pages_per_session, session_duration }, dayBefore: { ... } }`
**Files:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts`
**Verify:** `npx tsc --noEmit`

### T3: Wire Rybbit fetch into processDailyAgent
**Do:** In `service.agent-orchestrator.ts`, after GBP data fetch (around line 122) and before payload build (line 126):
1. Import `fetchRybbitDailyComparison` from the new utility
2. Call it with `organizationId`, `dates.yesterday`, `dates.dayBeforeYesterday`
3. Pass the result into `buildProoflinePayload()` as `websiteAnalytics`
4. Log whether Rybbit data was available or skipped
**Files:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Rybbit data fetcher is reusable (will be called by monthly agents next)
- [ ] Proofline payload includes `website_analytics` when `rybbit_site_id` exists
- [ ] Proofline still works when no `rybbit_site_id` exists (GBP-only fallback)
- [ ] Rybbit API failure does not break proofline execution
