# Live Google Rank — Swap Source from Places API to Apify Maps

## Why

The "Live Google Rank" number on the Rankings dashboard does not match what a real searcher sees on Google. For example, Artful Orthodontics is shown as #19 in Alloro, but is #3 in the Google Maps "Places" panel and ~#6 in the organic web SERP for the query "orthodontist in Winter Garden, FL". The surface a real user sees in Google Maps is what the dashboard claims to measure, so the metric is misleading.

Root cause: the rank is computed from `places.googleapis.com/v1/places:searchText` (`service.ranking-pipeline.ts:253–334` → `service.places-competitor-discovery.ts:textSearch`), biased to the **client's** lat/lng with a 25-mile radius. That is a different ranking algorithm and a different vantage point from the public Maps panel — it pulls in keyword-matching businesses (e.g. "Winter Garden Smiles") that don't appear on Maps for the same query, and it ranks them by Places API relevance (not by what a searcher in the area actually sees).

## What

Replace the `searchPosition` calculation in the practice-ranking pipeline with a call to the existing Apify Google Maps scraper (`compass~crawler-google-places`, already used by `discoverCompetitors` at `service.apify.ts:185`). The position in Apify's returned ordered array IS the Maps panel position for that query in that city — the surface the user perceives.

Done = a fresh ranking run for a Winter Garden orthodontist returns the same top-of-list practices Google's Maps panel shows for that query (Sakowitz Smiles #1, Bright Now! #2, Artful #3, etc.) instead of the current Places API result.

**Out of scope (do not touch in this plan):**
- Competitor *discovery* for Practice Health scoring — still uses Places API. The two concerns are independent. v2 curation already bypasses discovery for finalized locations.
- A SerpAPI/DataForSEO integration for organic SERP rank — separate metric, separate plan if desired later.
- Backfilling historical `search_position` values — accept one cycle of trend jitter at cutover.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:240–380` — orchestrates the search-position lookup. Sub-step 2 calls `discoverCompetitorsViaPlaces`; sub-step 3 finds client by placeId; result writes to `practice_rankings.search_position`.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts:247–320` — current Places API-backed `discoverCompetitorsViaPlaces` and its inner `textSearch` call. Stays in place for competitor discovery; only the *position lookup* call inside the pipeline gets swapped.
- `src/controllers/practice-ranking/feature-services/service.apify.ts:185–286` — existing `discoverCompetitors` against `compass~crawler-google-places` with `searchStringsArray` + `maxCrawledPlacesPerSearch` + city/state/county/postalCode location params. Returns ordered placeIds. **This is the analog to mirror.**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` (around `searchStatus` enum + `search_position` write) — owns the schema for `searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error"`. Reuse identical states.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — `SearchPositionSection` (~line 898+) renders the rank number, "LIVE GOOGLE SEARCH POSITION" subtitle, and "for {specialty} in {marketLocation}" line. Subtitle/label tweak lives here.

**Patterns to follow:**
- Apify wrapper functions live in `service.apify.ts` and follow the pattern: build input payload with optional location params → POST `/runs` → `waitForActorRun(runId)` → `fetchDatasetItems(datasetId)` → transform. Mirror the existing `discoverCompetitors` shape.
- Pipeline integration: keep the `searchStatus` discriminated union, log via the closure `log(...)` parameter, write through `updateStatus(rankingId, "processing", "fetching_search_position", ...)` for progress.
- Error handling: if Apify fails, fall back to `searchStatus = "api_error"` and let Practice Health continue with cached/discovered competitors. Do **not** block the rest of the run.

**Reference file:** `src/controllers/practice-ranking/feature-services/service.apify.ts:185–286` (`discoverCompetitors`). New function will be a near-clone with a tighter purpose: return ordered placeIds for the searchPosition lookup, then drop everything else.

## Constraints

**Must:**
- Reuse the existing `compass~crawler-google-places` Apify actor — no new actor, no new vendor.
- Reuse the existing `searchStatus` enum values (`"ok" | "not_in_top_20" | "bias_unavailable" | "api_error"`).
- Reuse the existing `practice_rankings.search_position` column. No migration if avoidable.
- Match client by exact `placeId`, identical to current Sub-step 3 logic.
- Keep competitor discovery (`discoverCompetitorsViaPlaces`) untouched for Practice Health scoring.

**Must not:**
- Touch the Practice Health KPI math, `rankScore` calculation, or LLM prompt inputs.
- Add a new external dependency. Apify is already in the lockfile.
- Modify v2 onboarding / curation flows.
- Backfill historical `search_position` values — out of scope.

**Out of scope:**
- Organic web SERP rank tracking (SerpAPI/DataForSEO).
- Multi-vantage rank tracking (e.g. running the Apify scrape from N positions in the city).
- Caching layer to avoid running Apify on every cycle.
- Frontend chart that reflects "source-changed-at" cutover marker — defer until users actually complain about the trend break.

## Risk

**Level:** 2 (Concern)

**Risks identified:**
- **Latency / cost:** Apify Maps run adds 30–60s per ranking cycle and a small per-run cost. → **Mitigation:** ranking runs are scheduled, not user-triggered, so latency is not user-visible. Apify is already used twice per run for `discoverCompetitors` and `getCompetitorDetails`, so this is one additional run per cycle, not a new vendor relationship.
- **Trend jitter at cutover:** historical `search_position` values were computed against Places API; new values will be against Apify Maps. The two are not directly comparable. → **Mitigation:** add a `search_position_source` column (or write into `extra_metadata` JSON) so the frontend can suppress the trend arrow on the first post-cutover datapoint, mirroring how the Practice Health methodology cutover is handled (`PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT` constant in `RankingsDashboard.tsx`).
- **Apify failures / quota exhaustion:** if the actor fails, `searchPosition` will be null. → **Mitigation:** preserve existing `searchStatus = "api_error"` fallback path. Practice Health continues to score regardless.
- **Label drift:** "Live Google Rank" / "LIVE GOOGLE SEARCH POSITION" is still ambiguous between Maps panel and web SERP. → **Mitigation:** tighten the subcaption to "GOOGLE MAPS POSITION" and the helper sentence to clarify it measures the Places panel.

**Blast radius:**
- `service.ranking-pipeline.ts` — single function, contained.
- `service.apify.ts` — adds one new exported function, no signature changes to existing exports.
- `RankingsDashboard.tsx` — one subcaption + one InfoHint copy change; no logic.
- DB migration (if adopted) — additive column with default null, zero risk to existing rows.
- Consumers of `practice_rankings.search_position`: Summary v2 prompt input builder reads it as a number; an additive column does not change that contract.

**Pushback (if any):**
- One reasonable alternative is to **keep Places API and rename** the metric to "Places API position" or similar. Rejected: the user's expectation is "the rank I see when I Google myself", which is the Maps panel. A relabel is honest but doesn't solve the underlying expectation gap.
- Another alternative is to add SerpAPI for organic web SERP rank (a third surface, ~#6 for Artful per Image 5). Rejected for *this* plan: separate metric, separate cost, separate vendor onboarding. Worth a future plan if the team wants it.

## Tasks

### T1: Add `getSearchPositionViaApifyMaps` to `service.apify.ts`
**Do:** Add a new exported async function that takes `(searchQuery: string, clientPlaceId: string, locationParams?: { city?, state?, county?, postalCode? })` and returns `{ position: number | null; status: "ok" | "not_in_top_20" | "api_error"; resultCount: number; orderedPlaceIds: string[] }`. Mirror the existing `discoverCompetitors` actor invocation (`POST /acts/compass~crawler-google-places/runs` with `searchStringsArray: [searchQuery]`, `maxCrawledPlacesPerSearch: 20`, plus optional location params). After `fetchDatasetItems`, find clientPlaceId in the returned ordered array; return `position = index + 1` or `null` if not found. On any thrown error, return `status: "api_error"` (do not throw). Log with the same `log(...)` helper used by the file.
**Files:** `src/controllers/practice-ranking/feature-services/service.apify.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` passes; the new function is exported and referenced.

### T2: Swap searchPosition calculation in the ranking pipeline
**Do:** In `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:240–380` (the "fetching_search_position" sub-step), keep Sub-step 1 (resolve client placeId via `getClientPhotosViaPlaces`) intact — we still need `clientPlaceId` and `clientPhotosCountFromStep0`. Replace Sub-step 2 + Sub-step 3 (the Places-API-backed `discoverCompetitorsViaPlaces` call + index lookup) with a single `getSearchPositionViaApifyMaps(searchQuery, clientPlaceId, locationParams)` call. Map the returned `status` directly into the existing `searchStatus` variable. Keep Sub-step 1's photos-count logic unchanged. Continue to call `discoverCompetitorsViaPlaces` separately for **competitor discovery** (Practice Health scoring) — that path stays exactly as it is. Update the log lines to say "via Apify Maps" instead of "via Places". Persist `search_position`, `search_query`, `search_status` exactly as before.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` passes; manual trace of the function shows competitor discovery is preserved and only position lookup changed.

### T3: Add `search_position_source` column for trend honesty
**Do:** New Knex migration `YYYYMMDDHHMMSS_add_search_position_source.ts` that adds a nullable `search_position_source` text column to `practice_rankings`. Default to null. Pipeline writes `"apify_maps"` when the new path runs successfully; Places-API legacy rows stay null. Update `PracticeRankingModel.ts` to expose the column. Add a `LIVE_GOOGLE_RANK_SOURCE_CHANGED_AT` constant to `RankingsDashboard.tsx` mirroring the `PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT` pattern, and suppress the rank trend arrow when `previousAnalysis.observedAt` is before that cutoff (analogous to the existing `getScoreTrend` guard for Practice Health).
**Files:** `src/database/migrations/YYYYMMDDHHMMSS_add_search_position_source.ts` (new), `src/models/PracticeRankingModel.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` (write), `frontend/src/components/dashboard/RankingsDashboard.tsx` (consume)
**Depends on:** T2
**Verify:** Migration runs cleanly on dev DB. `tsc --noEmit` clean both backend and frontend. Trend arrow disappears for the next ranking after cutover; reappears once two post-cutover rows exist.

### T4: Tighten the frontend label to reflect what's actually measured
**Do:** In `frontend/src/components/dashboard/RankingsDashboard.tsx`, update the `Live Google Rank` `InfoHint` content to state "Your position in Google's Maps Places panel for your specialty + city — the list a real searcher sees when they Google your specialty in your area. Refreshed on each ranking run." Update the `SearchPositionSection` subtitle from `LIVE GOOGLE SEARCH POSITION` to `GOOGLE MAPS POSITION`. Keep the eyebrow title `Live Google Rank` (user-facing brand consistency).
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T2
**Verify:** Manual: rendered page shows new subtitle and new tooltip text; eyebrow still reads "Live Google Rank".

### T5: Smoke run + sanity check
**Do:** Trigger one ranking cycle for a Winter Garden orthodontist test location (the same location that produced the #19 Places API result). Compare the new `search_position` against the live Maps panel for the same query. They should match within ±1 position (Maps panel can shift slightly between requests). Note any discrepancies in a brief comment on the spec's Revision Log.
**Files:** none (manual)
**Depends on:** T2, T3, T4
**Verify:** Manual: rank reported by Alloro for the test location matches the live Maps panel position for the same query within ±1.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend + frontend)
- [ ] `npm run build` (frontend) — clean
- [ ] Migration `add_search_position_source` runs on dev DB and rollback succeeds
- [ ] One smoke ranking cycle on a Winter Garden test location returns a position within ±1 of the live Maps panel
- [ ] Trend arrow on Live Google Rank is suppressed for the first post-cutover row
- [ ] Frontend subtitle reads "GOOGLE MAPS POSITION" and tooltip references the Maps Places panel explicitly
- [ ] Competitor discovery for Practice Health scoring is unchanged (verified by reading `service.ranking-pipeline.ts` post-edit)
