# Practice Ranking v2 — User-Curated Competitor Lists

## Why
Today competitors are auto-discovered every run via Google Places Text Search with no persistence. Clients complain that real competitors are missing, listed competitors are far away or unwanted, and results drift run-to-run because Step 0 re-queries fresh each time. The `competitor_cache` module was bypassed by the location-bias rewrite and is dead code (`service.ranking-pipeline.ts:421` comment confirms). Practice Health scoring is built on a moving foundation the user has zero control over.

## What
A v2 flow where each location owns a user-curated competitor list (max 10) that drives Practice Health scoring. A 3-stage location-onboarding UI walks the user through discovering, curating, and running their first analysis. Search Position remains pure-Google top-20 for "real" rank context. The bi-weekly cron (1st & 15th UTC) only runs against locations that have finalized their list. Done when:
- Every onboarded location can curate its competitor list and run rankings against it.
- Existing v1 rankings remain visible and labeled.
- Bi-weekly cron is calendar-aligned and skips un-finalized locations.
- Dead `competitor_cache` table dropped.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:230-450` — Step 0 discovery + competitor list source (load-bearing; pipeline branch lives here)
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — `discoverCompetitorsViaPlaces()` and `getClientPhotosViaPlaces()`
- `src/controllers/practice-ranking/feature-services/service.competitor-cache.ts` — TO BE DROPPED (dead code)
- `src/controllers/practice-ranking/PracticeRankingController.ts` — existing controller; new client-facing endpoints append here
- `src/controllers/practice-ranking/feature-services/service.ranking-executor.ts:setupRankingBatches` — scheduler-side batch creation; gets the finalized-only filter
- `src/routes/practiceRanking.ts` — existing route file; new endpoints registered here
- `src/routes/places.ts` + `src/controllers/places/PlacesController.ts` — existing public Places autocomplete/details
- `src/middleware/publicRateLimiter.ts` — existing `express-rate-limit` patterns (analog for new Places limiters)
- `src/database/migrations/20260315000001_create_schedules_tables.ts` — schedules schema; existing `agent_key="ranking"` row gets updated in the migration
- `src/models/PracticeRankingModel.ts` — existing ranking model (analog for new model)
- `src/workers/processors/scheduler.processor.ts:15-25` — cron parser already supports cron + tz
- `frontend/src/components/dashboard/RankingsDashboard.tsx:197-213, 826, 898+` — client dashboard with `searchPosition` + `practiceHealth` already wired
- `~/Desktop/alloro-leadgen-tool/src/components/stages/CompetitorMapStage.tsx` — REFERENCE for animated mini-map (port pattern, not code)

**Patterns to follow:**
- Named function exports for controllers (no classes) — `PracticeRankingController.ts`
- Feature-services pattern: `src/controllers/{feature}/feature-services/service.{name}.ts`
- Knex migrations as `.ts` — `20260315000001_create_schedules_tables.ts`
- Models as classes with static methods — `PracticeRankingModel.ts`
- `status_detail` JSON pattern for in-progress UX (already used by ranking pipeline)
- `express-rate-limit` per-route limiters — `src/middleware/publicRateLimiter.ts`

**Reference file:** `src/models/PracticeRankingModel.ts` — closest analog for `LocationCompetitorModel.ts`. Match its structure, naming, and Knex query style.

## Constraints

**Must:**
- Reuse the existing `agent_key="ranking"` schedule row (do not create a new one)
- Use IANA timezone `UTC` for the cron (per user — "let's use UTC instead")
- Keep all v1 historical `practice_rankings` rows intact; tag new rows with `competitor_source`
- Reuse `/api/places/autocomplete` + `/api/places/:placeId` for the curate add-flow (Option C — light rate-limit middleware on the existing public routes)
- Pipeline branches at a single decision point: if location is `finalized` → curated list; else → discovery
- Search Position scoring stays pure-Google top-20 regardless of curation status
- Cap curated list at 10 entries server-side
- Soft delete on competitor remove (preserve `removed_at` for audit & re-add)
- Field naming `location_competitor_onboarding_*` to disambiguate from existing org-level onboarding
- Single-click "Run my first ranking" finalizes AND triggers (idempotent on rapid double-click)

**Must not:**
- Touch email infrastructure — emails sent manually by user
- Add reminder/nudge automation
- Create a new cron entry (only update the existing `agent_key="ranking"` row)
- Enforce a minimum competitor count (allow lists 0–10)
- Repurpose the dead `competitor_cache` table — drop it cleanly
- Modify v1 historical ranking rows
- Break the leadgen-tool's existing use of `/api/places/autocomplete` — rate-limit must be permissive enough for normal use

**Out of scope:**
- Admin-side curate UI (admin read-only view OK; admin curate is future work)
- Re-discovery UX ("suggest competitors I might have missed")
- Per-competitor scoring weight overrides
- Geographic radius slider on curate page
- Email templates / send infrastructure
- Reminder emails

## Risk

**Level:** 3 — pipeline branching + Search Position split touches load-bearing code in `service.ranking-pipeline.ts` Step 0 (recently shipped, migration `20260412000001`), and a wrong branch leaks user-curated context into Search Position math.

**Risks identified:**
- **R1. Pipeline divergence in Step 0** → Mitigation: introduce `resolveCompetitorsForRanking()` resolver with two impls (curated, discovered). Single decision point at top of Step 1. Downstream Apify scrape + scoring code unchanged.
- **R2. Search Position cross-contamination** → Mitigation: Step 0 sub-steps 1-5 (Places top-20 → `search_position` fields) UNCHANGED. The resolver only swaps the input to Step 5+ (Practice Health competitor enrichment + ranking math).
- **R3. Doubled Places API cost for finalized locations** → Mitigation: accept the 2x cost (one Places top-20 call for Search Position, one batched `getPlaceDetails` for the curated list). Places API charges are minor vs Apify; documented tradeoff.
- **R4. Deploying mid-batch** → Mitigation: pipeline branch checks at runtime per row; in-flight v1 batches naturally complete on the discovery path.
- **R5. User clicks "Run my first ranking" twice** → Mitigation: API checks for in-flight `practice_rankings` row for this location with `created_at > now()-5min`; returns existing `batchId` idempotently.
- **R6. Re-add of a soft-deleted competitor** → Mitigation: revive existing row (clear `removed_at`, update `added_at`, flip `source` if user-added). Documented in model.
- **R7. Cron runs against `pending`/`curating` locations** → Mitigation: `setupRankingBatches` filters on `location_competitor_onboarding_status='finalized'`. Banner CTA on dashboard nudges user.
- **R8. Stale onboarding pre-scrape data** → Mitigation: `runDiscoveryForLocation()` re-runs discovery if status is still `pending`/`curating` and last `added_at` for `source='initial_scrape'` is >7 days old.
- **R9. Rate-limit too tight breaks leadgen-tool** → Mitigation: limiter set generously (e.g. 60 req/min/IP) and scoped per-route; QA against leadgen flow before merge.

**Blast radius:**
- `service.ranking-pipeline.ts` — used by both manual trigger and scheduled executor (every ranking run touches this)
- `service.ranking-executor.ts:setupRankingBatches` — cron entry point; filter change affects all scheduled runs
- `RankingsDashboard.tsx` — client-facing dashboard (banner addition + curate page link)
- `routes/places.ts` — public endpoints, also used by leadgen-tool (rate-limit must not break leadgen)
- `schedules` row update — affects the bi-weekly cadence for ALL onboarded organizations simultaneously

**Pushback:** none beyond what was discussed in `-b`. All decisions confirmed.

## Tasks

### T1: DB migration — drop dead cache table, add curated-competitor schema, update schedule row
**Do:**
- `DROP TABLE competitor_cache`
- Create `location_competitors`:
  - `id` PK
  - `location_id` FK → `locations(id)` ON DELETE CASCADE, NOT NULL
  - `place_id` VARCHAR(255) NOT NULL
  - `name`, `address`, `primary_type` VARCHAR
  - `lat` NUMERIC, `lng` NUMERIC
  - `source` VARCHAR(20) NOT NULL — `'initial_scrape' | 'user_added'`
  - `added_at` TIMESTAMPTZ NOT NULL DEFAULT now()
  - `added_by_user_id` INTEGER FK → `users(id)` NULLABLE (null for `initial_scrape`)
  - `removed_at` TIMESTAMPTZ NULLABLE
  - `created_at`, `updated_at` TIMESTAMPTZ
  - UNIQUE PARTIAL INDEX on `(location_id, place_id) WHERE removed_at IS NULL`
  - INDEX on `location_id`
- Add columns to `locations`:
  - `location_competitor_onboarding_status` VARCHAR(20) NOT NULL DEFAULT `'pending'` — values: `'pending' | 'curating' | 'finalized'`
  - `location_competitor_onboarding_finalized_at` TIMESTAMPTZ NULLABLE
- Add column to `practice_rankings`:
  - `competitor_source` VARCHAR(30) NULLABLE — values: `'curated' | 'discovered_v2_pending' | 'discovered_v1_legacy'`
  - Backfill: existing rows → `'discovered_v1_legacy'`
- UPDATE `schedules` row WHERE `agent_key='ranking'`:
  - `schedule_type='cron'`, `cron_expression='0 0 1,15 * *'`, `interval_days=NULL`, `timezone='UTC'`
  - Recompute `next_run_at` via `cron-parser`

**Files:** `src/database/migrations/20260428000001_practice_ranking_v2_curated_competitors.ts`, `plans/.../migrations/{pgsql.sql, mssql.sql, knexmigration.js}`
**Depends on:** none
**Verify:** `npx knex migrate:latest` succeeds; `\dt location_competitors` shows table; `SELECT cron_expression, timezone, next_run_at FROM schedules WHERE agent_key='ranking'` returns the new values; `SELECT COUNT(*) FROM practice_rankings WHERE competitor_source='discovered_v1_legacy'` matches pre-migration row count.

### T2: New model — `LocationCompetitorModel`
**Do:**
Class with static methods (match `PracticeRankingModel.ts` style):
- `findActiveByLocationId(locationId): Promise<LocationCompetitor[]>` — `WHERE removed_at IS NULL`
- `findIncludingRemoved(locationId): Promise<LocationCompetitor[]>`
- `addCompetitor(locationId, placeData, source, userId?): Promise<LocationCompetitor>` — handles re-add of soft-deleted row by clearing `removed_at`
- `removeCompetitor(locationId, placeId): Promise<void>` — soft delete
- `countActive(locationId): Promise<number>`
- `getOnboardingStatus(locationId): Promise<{status, finalizedAt}>` — reads from `locations` table
- `setOnboardingStatus(locationId, status, finalizedAt?): Promise<void>`

**Files:** `src/models/LocationCompetitorModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` clean.

### T3: Backend — competitor list endpoints + Places rate-limit middleware
**Do:**
- New feature-service `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`:
  - `runDiscoveryForLocation(locationId)` — looks up the location's GBP, calls `discoverCompetitorsViaPlaces` with location bias, populates `location_competitors` with `source='initial_scrape'`. Sets onboarding status to `'curating'`. Idempotent: if active rows already exist and last initial_scrape `added_at < 7d`, skip.
  - `addCustomCompetitor(locationId, placeId, userId)` — fetch via `getPlaceDetails`, enforce 10-row cap, insert (or revive) with `source='user_added'`.
  - `removeCompetitorFromList(locationId, placeId)` — soft delete via model.
  - `finalizeAndTriggerRun(locationId)` — flips status to `'finalized'`, idempotency check (existing in-flight ranking <5min returns its `batchId`), creates `practice_rankings` row, kicks off `processLocationRanking` async.
- New endpoints in `PracticeRankingController.ts` (named exports):
  - `GET /api/practice-ranking/locations/:locationId/competitors` → `{ status, finalizedAt, competitors[], count }`
  - `POST /api/practice-ranking/locations/:locationId/competitors/discover`
  - `POST /api/practice-ranking/locations/:locationId/competitors` (body: `{ placeId }`)
  - `DELETE /api/practice-ranking/locations/:locationId/competitors/:placeId`
  - `POST /api/practice-ranking/locations/:locationId/competitors/finalize-and-run`
- Routes registered in `src/routes/practiceRanking.ts` (preserve existing routes; new ones added below the existing block).
- New rate limiters in `src/middleware/publicRateLimiter.ts` matching existing pattern:
  - `placesAutocompleteLimiter` — 60 req/min/IP
  - `placesDetailsLimiter` — 60 req/min/IP
  - `placesSearchLimiter` — 30 req/min/IP
- Apply limiters in `src/routes/places.ts`.

**Files:** new `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, new `src/controllers/practice-ranking/feature-utils/util.competitor-validator.ts` (placeId/cap validation), modified `src/controllers/practice-ranking/PracticeRankingController.ts`, modified `src/routes/practiceRanking.ts`, modified `src/middleware/publicRateLimiter.ts`, modified `src/routes/places.ts`
**Depends on:** T2
**Verify:** cURL each new endpoint against a seeded test location; rate-limit triggers at threshold; `npx tsc --noEmit` clean; leadgen-tool `GBPSearchSelect` autocomplete still works under normal usage.

### T4: Pipeline branching — competitor source resolver in Step 0/1
**Do:**
- New `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts`:
  - `resolveCompetitorsForRanking(locationId, discoveredCompetitors): Promise<{ source: 'curated' | 'discovered_v2_pending', competitors: DiscoveredCompetitor[] }>`
  - If `getOnboardingStatus(locationId).status === 'finalized'` → load `LocationCompetitorModel.findActiveByLocationId`, batch-fetch fresh `getPlaceDetails`, return curated set with `source='curated'`.
  - Else → return `discoveredCompetitors` unchanged with `source='discovered_v2_pending'`.
- In `service.ranking-pipeline.ts` after Step 0 sub-step 5 (search_position persisted), before Step 1: call resolver. Use returned set for everything from Step 1 onward (Apify scrape, ranking math, LLM). Step 0 sub-steps 1-5 untouched.
- Persist `competitor_source` on `practice_rankings` row.

**Files:** new `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts`, modified `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, modified `src/models/PracticeRankingModel.ts` (add `competitor_source` to insert/update interfaces if typed)
**Depends on:** T2
**Verify:** Run a single-location ranking for a `finalized` location vs a `pending` location. `competitor_source` reflects the source. `search_position` and `search_results` populated identically in both cases.

### T5: Scheduler filter — skip un-finalized locations
**Do:**
- In `service.ranking-executor.ts:setupRankingBatches()`, after locating each location and its GBP property: read `location_competitor_onboarding_status` from `locations`. Skip and log if not `'finalized'`. Continue to next location.

**Files:** modified `src/controllers/agents/feature-services/service.ranking-executor.ts`
**Depends on:** T1
**Verify:** Manually fire the scheduler agent (admin endpoint) with one `finalized` and one `pending` location. Logs show `pending` skipped; `finalized` processed.

### T6: Frontend — 3-stage onboarding page
**Do:**
- New page route + component: `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` (route `/dashboard/competitors/:locationId/onboarding`)
- Stage 1 — "Discovering competitors near you": animated mini-map (port pattern from `~/Desktop/alloro-leadgen-tool/src/components/stages/CompetitorMapStage.tsx` — bounding box, framer-motion staggered pin reveal). POST `/competitors/discover` on mount, poll `GET /competitors` until `status='curating'`.
- Stage 2 — "Your competitor list": list of active competitors with Remove button (DELETE), search bar (autocomplete via `/api/places/autocomplete`), Add button (POST). Counter shows `N/10`. Disable Add at cap. Allow zero-list state.
- Stage 3 — "Run your first ranking": single button → `POST /finalize-and-run` → redirect to dashboard with returned `batchId` for status polling.
- Frontend API additions in `frontend/src/api/practiceRanking.ts`: `getLocationCompetitors`, `runCompetitorDiscovery`, `addLocationCompetitor`, `removeLocationCompetitor`, `finalizeAndRun`.

**Files:** new `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`, new `frontend/src/components/CompetitorOnboarding/CompetitorMapMini.tsx`, new `frontend/src/components/CompetitorOnboarding/CompetitorList.tsx`, new `frontend/src/components/CompetitorOnboarding/AddCompetitorSearch.tsx`, modified `frontend/src/api/practiceRanking.ts`
**Depends on:** T3
**Verify:** Manual: walk through 3-stage flow end-to-end on a test location. Map animates. List enforces 10-cap server-side (UI disables at 10). Soft-delete-then-re-add restores entry. Single-click finalize reaches dashboard and shows in-flight batch.

### T7: Frontend — Dashboard banner + v1 legacy tag
**Do:**
- Modify `RankingsDashboard.tsx` to read `location_competitor_onboarding_status` (add to existing `/latest` response payload from controller).
- If status is `'pending'` or `'curating'` → render banner component with copy: "Set up your competitor list to keep your rankings accurate" + CTA → `/dashboard/competitors/:locationId/onboarding`.
- If latest ranking row has `competitor_source='discovered_v1_legacy'` → render small subtle tag near the rank score: "v1 — auto-discovered".

**Files:** modified `src/controllers/practice-ranking/PracticeRankingController.ts` (extend `/latest` response with onboarding status), modified `frontend/src/components/dashboard/RankingsDashboard.tsx`, new `frontend/src/components/dashboard/CompetitorOnboardingBanner.tsx`
**Depends on:** T3
**Verify:** Manual: login as a client with a `pending` location → banner appears, click → lands on onboarding page. For a `finalized` location → no banner. For a v1-legacy ranking row → tag visible.

### T8: Cron migration verification
**Do:**
- T1 migration already updates the `schedules` row. This task is verification only.

**Files:** none (verification)
**Depends on:** T1
**Verify:** `/admin/schedules` shows Practice Ranking row with "Cron: 0 0 1,15 * * (UTC)". `SELECT next_run_at FROM schedules WHERE agent_key='ranking'` returns the next 1st or 15th at midnight UTC. Manual fire of agent still works.

## Done
- [ ] `npx knex migrate:latest` applied; `competitor_cache` dropped; `location_competitors` created; `locations` and `practice_rankings` columns added; `schedules` row updated.
- [ ] `npx tsc --noEmit` — zero errors caused by these changes.
- [ ] All five new client endpoints respond correctly; rate-limit triggers at threshold without breaking leadgen-tool autocomplete.
- [ ] Manual: 3-stage onboarding flow walked end-to-end on a test location → list curates correctly, finalize-and-run produces a `practice_rankings` row with `competitor_source='curated'`.
- [ ] Manual: scheduler agent fired with one `finalized` and one `pending` location → only `finalized` is processed; logs show explicit skip with reason for the others.
- [ ] Manual: dashboard for a `pending` location shows banner; for a `finalized` location renders normally; for a v1-legacy row shows the tag.
- [ ] Existing admin trigger flow (`POST /api/practice-ranking/trigger`) still works for any location regardless of onboarding status (admin override behavior preserved).
- [ ] Search Position values on a finalized location match what the same location would produce on the discovery path (split is clean — no cross-contamination).
- [ ] No regressions in `RankingsDashboard.tsx` rendering for existing finalized clients.
- [ ] Lint passes.
