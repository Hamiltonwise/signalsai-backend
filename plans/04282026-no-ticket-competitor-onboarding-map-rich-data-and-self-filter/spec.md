# Competitor Onboarding — Map on Stage 2, Richer Rows, Robust Self-Filter

## Why
First-pass UX feedback on Practice Ranking v2 onboarding (spec `04282026-no-ticket-practice-ranking-v2-user-curated-competitors/`) surfaced three real issues:
1. **No map on the curate page.** Stage 2 currently has zero map UI. Users curating their list have no spatial anchor — they're judging "is this competitor real?" with only an address string.
2. **Practice's own listing leaks into its own competitor list.** The current `getClientPhotosViaPlaces` name-search filter silently fails (catch swallows the error → no filter), and when it succeeds the catch path still continues without filtering. Bowdoin Pediatric Dentistry, the test case, currently sees itself in its own list.
3. **Competitor rows are too sparse to make confident keep/remove decisions.** Today: name, primary type, ⭐, review count, address. Missing: distance, phone, website — all of which are already in the Places payload and dropped on the floor.

## What
- Persist the practice's own Google Places identifiers (`client_place_id`, `client_lat`, `client_lng`) on `locations` so the self-filter is deterministic and reusable.
- Make the self-filter robust: cached value first, prior `practice_rankings.search_results` second, runtime `getClientPhotosViaPlaces` third — and when ALL three fail, surface a UI hint instead of silently letting the practice slip into its own list.
- Capture `phone` + `website` from existing Places payloads into `location_competitors`. No new API calls.
- Add a real map to Stage 2 (curating) with the practice as a distinct "YOU" pin and competitors as numbered pins. Reuse the Stage 1 embed pattern.
- Show distance (Haversine, computed client-side from existing lat/lng), phone, and website on each competitor row.

Done when: a fresh onboarding flow does NOT include the practice in its own list, Stage 2 shows a map plus richer rows, and `npx tsc --noEmit` is clean.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts:170-305` — `runDiscoveryForLocation`; current self-filter logic at `:222-264`. Catch block at `:238-242` silently swallows lookup failures.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts:316-399` — `addCustomCompetitor`; reads `getPlaceDetails` payload; currently captures rating/reviewCount/lat/lng but skips phone/website.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts:200-228` — `placesToCompetitors` already includes `website` and `phone` on the discovered shape; just not threaded through `addCompetitor`.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:329-363` — pipeline writes `isClient: true` into `search_results` JSONB on every successful run. This is the cached source of truth we'll read from.
- `src/models/LocationCompetitorModel.ts:8-38` — `ILocationCompetitor` and `AddCompetitorInput`; both need `phone`/`website` fields.
- `src/models/LocationModel.ts` — needs `client_place_id`, `client_lat`, `client_lng` typed fields.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — `getLocationCompetitors` handler returns response shape; needs additive `practiceLocation` + `selfFilterStatus` fields.
- `frontend/src/api/practiceRanking.ts:9-39` — `CuratedCompetitor` and `GetLocationCompetitorsResponse` types; need additive fields.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx:337-516` — `DiscoveringStage` map iframe + pin overlay. Pattern to extract for Stage 2.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx:518-737` — `CuratingStage`; row shape lives at `:633-702`.

**Patterns to follow:**
- Knex `.ts` migrations matching `20260428000002_add_rating_reviews_to_location_competitors.ts` (additive nullable columns, no constraints).
- Model class with static methods — `LocationCompetitorModel.ts`.
- Frontend types co-located with API module — `frontend/src/api/practiceRanking.ts`.
- Component file structure for `competitor-onboarding/` page — single page file with sub-stage components defined inline (matches existing `LocationCompetitorOnboarding.tsx`).

**Reference file (analog):** `src/database/migrations/20260428000002_add_rating_reviews_to_location_competitors.ts` — closest analog for the new column-add migrations. Match its docstring + alterTable shape exactly.

## Constraints

**Must:**
- Reuse existing Places payload fields. No new API calls beyond what's already wired.
- Self-filter resolution order is non-negotiable: `locations.client_place_id` → latest `practice_rankings.search_results.isClient` → `getClientPhotosViaPlaces` runtime call. Stop at the first hit.
- When the self-filter resolves, persist the resolved placeId + lat/lng on `locations` so we never re-resolve.
- When ALL three fallbacks fail, the GET `/competitors` response MUST include `selfFilterStatus: 'unresolved'` so the UI can warn the user. No silent continuation.
- Distance calculation lives on the frontend (Haversine, miles). Backend exposes practice lat/lng; frontend does the math.
- Stage 2 map must include a visually distinct "YOU" marker for the practice. Practices won't trust competitor accuracy if they can't see themselves on the map.
- Phone/website columns are NULLABLE — Places doesn't always return them.

**Must not:**
- Add new API dependencies (no Maps JS API key, no Photo API).
- Change response shape in a breaking way — all new fields are additive.
- Backfill phone/website for existing rows (forward-fill only on next discovery/add).
- Touch the ranking pipeline's `search_results` write logic — read-only consumer.
- Modify v1-legacy practice_rankings rows or any cron behavior.
- Change the Stage 1 (DiscoveringStage) UX — this spec only adds a map to Stage 2, not redesigning Stage 1.

**Out of scope:**
- Photo thumbnails (extra Places Photo API cost — declined in `-a` exchange).
- "Open now" / hours UI (stale fast, not decision-relevant).
- Distance UI on Stage 1 (reveal animation already crowded).
- Backfilling phone/website on rows added before this change.
- Admin curate UI changes.
- Any change to ranking pipeline scoring or competitor source resolver.

## Risk

**Level:** 2 — additive schema changes plus a fallback chain replacing a silent failure path. Contained to the curate flow and the page that consumes it. No load-bearing pipeline edits.

**Risks identified:**
- **R1. `search_results` JSONB shape varies across historical rows.** Older v1 rows may not have `isClient` populated. → **Mitigation:** filter on `competitor_source` IN ('curated', 'discovered_v2_pending') and `search_status='ok'` AND `whereNotNull('search_results')`; query the latest matching row only. Tolerate JSON parse failure with try/catch; fall through to runtime lookup.
- **R2. The cached `client_place_id` could be stale** if the practice rebrands and gets a new Google Places listing. → **Mitigation:** acceptable risk. The ranking pipeline runs every 1st/15th UTC and writes a fresh `isClient` placeId into `search_results` each run. We can add a refresh-on-mismatch later if it becomes a problem; for now, cache wins on cost and reliability.
- **R3. UI hint copy must not alarm the user.** "We couldn't auto-detect your practice" sounds like a system error. → **Mitigation:** copy reads as a soft prompt: "If your practice appears below, remove it — we couldn't auto-exclude it from this market." Inline next to the list, not a modal.
- **R4. Stage 2 map iframe rate limiting.** Same keyless `pb` URL pattern as Stage 1, which has been working. → **Mitigation:** reuse the exact same URL build; if Stage 1 works, Stage 2 will too. The Stage 1 map's reliability is a separate, pre-existing question we are not attempting to fix here.
- **R5. Locations without resolved practice lat/lng.** If the cache is empty AND the runtime lookup fails AND there's no prior ranking row, we have no practice marker for Stage 2. → **Mitigation:** map degrades gracefully — render with competitor pins only, no "YOU" pin, no error. Distance values become null on the row (hide distance chip when null).
- **R6. Phone/website privacy.** No PII concern — these are public Google Places fields displayed on the listing's own GBP profile. No mitigation needed.

**Blast radius:**
- `locations` table — wide consumer base (`LocationModel.findById` callers throughout the app). Adding nullable columns is safe; verified by reviewing `findByLocationId` and `findById` usages.
- `location_competitors` table — only the curate flow reads/writes; ranking pipeline reads via `LocationCompetitorModel.findActiveByLocationId`. Adding nullable columns safe.
- `practice_rankings.search_results` — read-only consumer. We're not modifying writes.
- `getLocationCompetitors` API response — used by `LocationCompetitorOnboarding.tsx` only. Additive fields safe.
- `LocationCompetitorOnboarding.tsx` — single page, no other consumers.

**Pushback (resolved during Phase 2):**
- I initially suggested using GBP `external_id` as the self-filter key. Wrong — different ID space (`accounts/X/locations/Y` vs Places `ChIJ...`). Replaced with cache + `search_results` + runtime fallback chain.

## Tasks

### T1: Migration — `client_*` columns on `locations`, `phone`/`website` on `location_competitors`
**Do:**
- New migration `20260428000003_add_self_filter_and_rich_competitor_fields.ts`:
  - `ALTER TABLE locations ADD COLUMN client_place_id VARCHAR(255) NULL`
  - `ALTER TABLE locations ADD COLUMN client_lat NUMERIC(10,7) NULL`
  - `ALTER TABLE locations ADD COLUMN client_lng NUMERIC(10,7) NULL`
  - `ALTER TABLE location_competitors ADD COLUMN phone VARCHAR(50) NULL`
  - `ALTER TABLE location_competitors ADD COLUMN website TEXT NULL`
- Match docstring shape and migration style of `20260428000002_add_rating_reviews_to_location_competitors.ts`.
- Down: drop columns in reverse order.

**Files:** `src/database/migrations/20260428000003_add_self_filter_and_rich_competitor_fields.ts`, `plans/04282026-no-ticket-competitor-onboarding-map-rich-data-and-self-filter/migrations/{pgsql.sql, mssql.sql, knexmigration.js}`

**Depends on:** none

**Verify:** `npx knex migrate:latest` applies cleanly. `\d locations` shows new columns NULL. `\d location_competitors` shows `phone` + `website` NULL. `npx knex migrate:rollback` reverses cleanly.

### T2: Model + interface updates (LocationModel, LocationCompetitorModel)
**Do:**
- `LocationModel.ts`: add `client_place_id: string | null`, `client_lat: number | null`, `client_lng: number | null` to the location interface. Add a `setClientIdentifiers(locationId, { placeId, lat, lng })` static method that updates these three columns + `updated_at`.
- `LocationCompetitorModel.ts`: add `phone: string | null` and `website: string | null` to `ILocationCompetitor`. Add `phone?` and `website?` to `AddCompetitorInput`. Update `addCompetitor` to insert/revive these fields the same way it handles `address`/`primary_type` (use input value if provided, else preserve existing on revive, else null on new insert).

**Files:** `src/models/LocationModel.ts`, `src/models/LocationCompetitorModel.ts`

**Depends on:** T1

**Verify:** `npx tsc --noEmit` clean. Existing model callers compile unchanged.

### T3: Self-filter resolver + phone/website capture in onboarding service
**Do:**
- New helper in `service.location-competitor-onboarding.ts` (or split to `service.client-place-resolver.ts` if cleaner):
  - `resolveClientPlaceId(locationId, ctx): Promise<{ placeId: string | null, lat: number | null, lng: number | null, source: 'cache' | 'ranking_history' | 'places_lookup' | 'unresolved' }>`
  - Step A: read `locations.client_place_id` + lat + lng. If all three present, return source `'cache'`.
  - Step B: query latest `practice_rankings` row for this location with `search_status='ok' AND search_results IS NOT NULL` ordered by `created_at DESC`. Parse JSONB; find entry with `isClient: true`. If found, return its placeId + (the persisted `search_lat`/`search_lng` from the same row), source `'ranking_history'`. Persist via `LocationModel.setClientIdentifiers` before returning.
  - Step C: call existing `getClientPhotosViaPlaces`. If it returns placeId + coords, persist via `setClientIdentifiers`, return source `'places_lookup'`.
  - Step D: return `{ placeId: null, lat: null, lng: null, source: 'unresolved' }`. Log a warning. Do NOT throw.
- Update `runDiscoveryForLocation` (`:170-305`):
  - Replace the inline lookup at `:222-242` with `resolveClientPlaceId`.
  - When source is `'unresolved'`, log a warning AND surface this in the next `getLocationCompetitors` response by writing a transient flag — simplest: read the `locations.client_place_id` value at GET time; if NULL, the response carries `selfFilterStatus: 'unresolved'`.
  - Actually simpler: derive `selfFilterStatus` purely at GET time from whether `locations.client_place_id` is set. No transient state, no race condition. (Adopted — see T4.)
  - Capture `phone` + `website` from `discoverCompetitorsViaPlaces` results (already in `DiscoveredCompetitor` shape) and pass into `LocationCompetitorModel.addCompetitor`.
- Update `addCustomCompetitor` (`:316-399`):
  - Capture `placeDetails.nationalPhoneNumber` and `placeDetails.websiteUri` and pass into `addCompetitor`.

**Files:** `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`

**Depends on:** T2

**Verify:** Manual: run discovery on a fresh location with no prior rankings → confirm `client_place_id` populated post-run; log shows source `'places_lookup'` (or `'unresolved'` if name match fails). Run again → log shows `'cache'`. On a location with prior rankings, drop `client_place_id` and re-run → log shows `'ranking_history'`. New competitor rows have `phone`/`website` populated where Google has them.

### T4: Backend — extend `getLocationCompetitors` response with practice location + self-filter status
**Do:**
- In `PracticeRankingController.ts` `getLocationCompetitors` handler:
  - Read `locations.client_place_id`, `client_lat`, `client_lng` for this location.
  - Add to response: `practiceLocation: { placeId, lat, lng } | null` (null if all three are null).
  - Add to response: `selfFilterStatus: 'resolved' | 'unresolved'` (resolved iff `client_place_id` is set).
  - Existing fields untouched.
- Update each competitor in the `competitors` array to include `phone: string | null` and `website: string | null` fields from the row.

**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`

**Depends on:** T3

**Verify:** `curl /api/practice-ranking/locations/:id/competitors` on a fresh location → response includes `practiceLocation` (null or populated) and `selfFilterStatus`. Each competitor includes `phone`/`website` (null for rows added pre-T1).

### T5: Frontend — types, distance util, Stage 2 map, richer rows, self-filter hint
**Do:**
- `frontend/src/api/practiceRanking.ts`:
  - Extend `CuratedCompetitor` with `phone: string | null`, `website: string | null`.
  - Extend `GetLocationCompetitorsResponse` with `practiceLocation: { placeId: string; lat: number; lng: number } | null` and `selfFilterStatus: 'resolved' | 'unresolved'`.
- New util `frontend/src/pages/competitor-onboarding/util.distance.ts` — pure function `haversineMiles(a, b): number`. ~15 lines.
- `LocationCompetitorOnboarding.tsx`:
  - Hold `practiceLocation` and `selfFilterStatus` in component state alongside `competitors`.
  - Extract the existing Stage 1 map iframe + pin overlay logic into a local `<CompetitorMap>` component that takes `{ competitors, practiceLocation?, height }`. Render practice marker (if provided) with a distinct visual: larger ring, navy color, "YOU" label. Numbered pins for competitors as today.
  - Stage 2 (`CuratingStage`): render `<CompetitorMap height={320} />` above the list, below the section header.
  - Stage 2 row: add distance chip ("2.1 mi") computed via Haversine when both `practiceLocation` and competitor lat/lng are present. Add phone (tel: link) and website (truncated domain, opens new tab) inline with rating/reviews/address. Keep the existing visual hierarchy — these are tertiary signals, not headlines.
  - When `selfFilterStatus === 'unresolved'`, render an inline notice above the list: "We couldn't automatically detect your practice in this market. If your own listing appears below, remove it manually." Subtle background, not red.

**Files:** modified `frontend/src/api/practiceRanking.ts`, new `frontend/src/pages/competitor-onboarding/util.distance.ts`, modified `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`

**Depends on:** T4

**Verify:** Manual: Stage 2 shows a map with navy "YOU" pin + numbered competitor pins. Distance values appear and are reasonable for the market. Phone numbers are clickable; website opens new tab. Drop `client_place_id` on the test location → reload page → "couldn't auto-detect" notice appears. Re-run discovery → notice disappears after page reload.

## Done
- [ ] `npx knex migrate:latest` applies migration 20260428000003 cleanly; rollback reverses cleanly.
- [ ] `npx tsc --noEmit` — zero errors caused by these changes.
- [ ] Manual: fresh onboarding on Bowdoin Pediatric Dentistry (the reported failure case) does NOT include the practice's own listing in the curated set.
- [ ] Manual: `locations.client_place_id`, `client_lat`, `client_lng` populated after first discovery run.
- [ ] Manual: second discovery on the same location reads from cache (log shows source `'cache'`).
- [ ] Manual: Stage 2 renders the map with a distinct "YOU" pin for the practice and numbered competitor pins.
- [ ] Manual: Stage 2 rows show distance, phone (when available), and website (when available).
- [ ] Manual: when self-filter is unresolved, the inline notice appears.
- [ ] Manual: existing finalized locations and v1-legacy ranking rows render unchanged.
- [ ] Lint passes.
