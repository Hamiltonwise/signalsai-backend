# Practice Health + Search Position Split

## Why

The `/rankings` dashboard currently shows a single number computed from a proprietary 8-factor score, and labels it as the practice's "rank." That number systematically contradicts Google's actual search results — a client who Googles themselves sees one order; our dashboard shows another. This erodes trust in the product and buries the diagnostic value the 8-factor algorithm actually produces.

We're splitting one number into two: **Search Position** (where the practice actually appears in Google for their specialty query) and **Practice Health** (the existing 8-factor score, reframed as a diagnostic, not a rank). Both are computed in the same pipeline run, displayed side-by-side on the client dashboard, and together they tell a coherent story: *"you're #3 on Google, your Practice Health is 72/100, here are the three things holding you back."*

## What

A reshape of the practice ranking feature that:

1. Adds a Google Places `searchText` call (with location bias to the practice's own coordinates) as a new **Step 0** of the ranking pipeline — this fetches the authoritative competitor set and the client's own position in Google's ordering
2. Persists that competitor set, query, vantage point, and client position on the `practice_rankings` row (new columns)
3. Uses this **same competitor set** as the input to the existing 8-factor scoring algorithm (Option A from -b discussion — consistency over trend stability)
4. Surfaces both numbers to the client `/rankings` page via the existing `/api/practice-ranking/latest` endpoint
5. Reshapes the client `RankingsDashboard.tsx` into three sections: **Search Position** (Google's top-5), **Practice Health** (0–100 score + trend), and **What's Holding You Back** (top-3 summary with link to `/to-do-list`)
6. Feeds the new Search Position context into the LLM gap analysis payload so recommendations can reference Google position explicitly
7. Leaves the admin `PracticeRanking.tsx` debug view unchanged — the detailed diagnostic data stays available for internal debugging

**Done when:** A fresh scheduled ranking run writes `search_position`, `search_query`, `search_lat`, `search_lng`, and `search_results` to the `practice_rankings` row; the client `/rankings` page renders the new three-section layout with real data; the admin view still renders; TypeScript build passes; the 8-factor algorithm output is unchanged for any given competitor set.

## Context

**Relevant files:**

Backend — pipeline:
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — the core per-location pipeline. Step 0 is added at the top; Step 2 (competitor discovery) switches from `discoverCompetitorsViaPlaces` to reuse the Step 0 result; persistence section gets new columns
- `src/controllers/practice-ranking/feature-services/service.ranking-computation.ts` — batch wrapper; no logic changes, just passes through new fields
- `src/controllers/practice-ranking/feature-services/service.ranking-executor.ts` — scheduled-run entrypoint; no logic changes
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` — gap-analysis LLM call; payload gets new `search_position` block
- `src/controllers/practice-ranking/feature-services/service.competitor-cache.ts` — cache key needs to change from `(specialty + location)` to `(query + lat + lng + radius)`. Alternative: skip the cache entirely for the new flow and leave the existing cache module untouched for any legacy callers. See Risk.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — already has `locationBias` support; no changes needed beyond call-site updates
- `src/controllers/places/feature-services/GooglePlacesApiService.ts` — `textSearch()` already supports `locationBias`; no changes

Backend — persistence + API:
- `src/database/migrations/` — new migration file adding columns to `practice_rankings`
- `src/models/PracticeRankingModel.ts` — new TypeScript interface fields
- `src/controllers/practice-ranking/PracticeRankingController.ts` — `getLatestRankings` already returns ranking rows; formatter change will flow through automatically
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — `formatLatestRanking` adds new fields to the response

Frontend — client dashboard:
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — the big reshape (1448 lines currently; we're replacing the "Nearby Practices" section, adding Practice Health framing)
- `frontend/src/contexts/locationContext.ts` + `LocationProvider.tsx` + `LocationSwitcher.tsx` — already handle multi-location selection; no changes needed, just verify the reshape respects `locationId`
- `frontend/src/hooks/queries/` — wherever the rankings query hook lives (to be identified during execution; likely `useRankingsQueries` or similar)

Frontend — admin (verify only, no changes):
- `frontend/src/pages/admin/PracticeRanking.tsx` — debug view; should continue to render all existing fields against the (unchanged) diagnostic data
- `frontend/src/components/Admin/OrgRankingsTab.tsx` — org-level admin rankings view; should continue to work against existing `rank_score` / `rank_position`

**Patterns to follow:**

- Backend controller/service split follows the existing `practice-ranking/` folder structure — thin controller, feature-services, feature-utils. Don't introduce new folders.
- Migrations follow existing pattern in `src/database/migrations/` with `up` and `down` functions using Knex schema builder. See `20260129000002_add_location_params_to_practice_rankings.ts` as the closest analog — it's a previous "add columns to practice_rankings" migration in this same feature area.
- LLM payload shape mirrors the existing `RankingLlmPayload` interface in `service.ranking-llm.ts` — we're adding a nested block under `additional_data`, not restructuring.
- Frontend hooks use TanStack Query with per-organization + per-location cache keys (matches existing `useAdminOrgTabQueries.ts` pattern).
- Status-detail progress tracking follows the existing `StatusDetail` shape in `service.ranking-pipeline.ts` — new Step 0 gets a `currentStep` identifier and appears in the `stepsCompleted` progression.

**Reference file:** `src/database/migrations/20260129000002_add_location_params_to_practice_rankings.ts` — closest existing analog for the migration structure. `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:236-349` — the existing "fetch GBP data" + "discover competitors" block that Step 0 will be inserted above.

## Constraints

**Must:**

- Preserve the existing 8-factor algorithm output (`service.ranking-algorithm.ts`) unchanged — same inputs, same outputs. The reshape changes *what goes into* the algorithm (the competitor set) and *how we display it*, never the math itself.
- Preserve backward compatibility on the admin debug view — `rank_score`, `rank_position`, `ranking_factors`, `raw_data` continue to be written and read as they are today.
- Keep the client page respecting `locationId` — the existing `LocationProvider` + `locationId` prop flow must still drive which location's ranking data loads.
- Use Google Places API `searchText` with `locationBias.circle` — not SerpAPI, not a new vendor. The `textSearch()` helper already exists and is already used elsewhere in the pipeline.
- Trust Google's ordering verbatim in the Search Position display — do NOT post-filter through `filterBySpecialty` for the display. (Practice Health scoring continues to use the same unfiltered Google set — Option A from -b discussion.)
- Filter the client out of the competitor list by exact `placeId` match, not fuzzy name match.
- Store the `search_query`, `search_lat`, `search_lng` on every ranking row so trend comparisons can validate they're comparing like-for-like (reject comparisons across different queries or vantage points).
- Keep the scheduled run on the existing 15-day `interval_days` cadence. No new schedule entries.
- Keep the task creation pipeline (`archiveAndCreateTasks` + `saveLlmAnalysis`) unchanged structurally — it still produces `RANKING` agent_type tasks tied by `metadata.practice_ranking_id`.
- LLM output JSON schema stays the same. The payload gets a new input block, the response shape does not change.

**Must not:**

- Don't introduce new npm dependencies. Places API is already in use; no SerpAPI / DataForSEO / Outscraper.
- Don't drop or alter the existing `rank_position` / `rank_score` columns. Add new columns alongside them.
- Don't change the `agent_key` in the `schedules` table or split the scheduler. Single `ranking` handler, single pipeline, single run.
- Don't touch the Apify website audit step (Step 4). Out of scope for this spec.
- Don't refactor `filterBySpecialty`, `discoverCompetitorsWithFallback`, or the broadening logic. They stay as-is even though we're not using them on the new path.
- Don't rewrite the 1448-line `RankingsDashboard.tsx` in place — replace the "Nearby Practices" section and add new sections; keep the rest of the component (header, vital signs, layout scaffolding) untouched unless directly needed.
- Don't commit the admin dev-trigger behind a production-visible UI. It's internal-only — accessible via the existing admin routes, not surfaced to clients.

**Out of scope:**

- SerpAPI / DataForSEO integration (future Option 2 if organic SERP matters)
- Grid-scan vantage point (future Option 3 / premium feature)
- Per-location configurable query format (default hardcoded to `"{specialty} in {city}, {state}"`)
- Splitting Search Position to a faster cadence than Practice Health
- Migrating off Apify for the website audit step
- Backfilling historical `search_position` data (impossible — Google doesn't keep historical SERP snapshots)
- Admin dashboard reshape — `PracticeRanking.tsx` stays as the detailed diagnostic view
- Rename of `rank_position` / `rank_score` columns (UI labels change, DB columns stay)

## Risk

**Level:** 3 — Structural Risk

**Risks identified:**

1. **Competitor set churn breaks trend comparisons.** With Option A, the Practice Health score is computed against whoever Google returns for the query on that run. If Google's top-20 shifts meaningfully between runs (competitor opens/closes, review count changes, Google algorithm tweak), the score moves even when the client's own data didn't change. → **Mitigation:** persist the full top-20 list in `search_results` jsonb so we can retroactively recompute trend deltas against a stable rolling set if noise becomes a UX problem. For v1, accept the noise and monitor. Document the tradeoff in the dashboard ("Practice Health compares against your current top competitors, which may shift over time").

2. **Competitor cache becomes wrong.** Today `competitor_cache` is keyed on `(specialty + marketLocation)` and shared across practices in the same market. With location-biased search, two practices in the same market get different competitor sets because they're standing at different GPS points. Reading from the existing cache on the new path would return the wrong data. → **Mitigation:** the new pipeline path bypasses `competitor_cache` entirely. The cache module stays in place for any existing callers (retry endpoints use the same pipeline, but will also go through Step 0 now). Consider deleting the cache module in a follow-up if nothing reads it after this ships.

3. **Client's own `placeId` / lat-lng not always available.** Step 0 needs the client's lat/lng to bias the Places API search correctly. Two possible sources: (a) GBP profile data (`latlng` field on the GBP location resource), (b) Places text search by practice name + city (the existing `getClientPhotosViaPlaces` path). GBP is more authoritative when available. → **Mitigation:** Step 0 tries GBP profile first, falls back to `getClientPhotosViaPlaces`-style name lookup. If both fail, skip the location-biased search and fall back to text search without bias (current behavior) — log a warning and mark `search_position = null`, `search_lat = null`. This is the same "not ranked" state the UI already needs to handle for top-20 misses, so no additional frontend work.

4. **`/api/practice-ranking/latest` response shape change breaks existing frontend consumers.** The dashboard shows this data today. Adding fields is additive and non-breaking, but if the existing frontend code destructures and ignores unknown fields it's fine; if it strictly types the response it will need the type updated. → **Mitigation:** use SDK/interface additions (`?` optional), not required fields. Existing consumers that don't read the new fields won't notice.

5. **Scheduled run pays one extra Places API call per location per run.** At current volume (estimate ~200 locations × 1 call × once per 15 days) this is ~400 calls/month at ~$0.032/call = ~$13/month. Negligible. If volume grows to 10,000 locations, this becomes ~$320/month — still small but worth noting. → **Mitigation:** no action needed. Document cost in the post-execution summary.

6. **LLM payload grows.** The new `search_position` + top-5 Google list in `additional_data` adds ~500-1000 tokens to the input. The existing payload is already large; adding this is not catastrophic. → **Mitigation:** no action needed. Monitor LLM cost after ship.

**Blast radius:** `practice_rankings` table is read by:
- `PracticeRankingController.ts` (all 12 endpoints)
- `frontend/src/components/dashboard/RankingsDashboard.tsx`
- `frontend/src/components/dashboard/DashboardOverview.tsx`
- `frontend/src/pages/admin/PracticeRanking.tsx`
- `frontend/src/components/Admin/OrgRankingsTab.tsx`
- `src/controllers/agents/feature-services/service.ranking-executor.ts`
- `src/controllers/practice-ranking/feature-services/service.ranking-computation.ts`
- The Tasks system (`tasks.metadata.practice_ranking_id`)

All of these read existing columns. None of them require changes to read the new columns (additive). The only consumer that NEEDS changes is `RankingsDashboard.tsx` (the reshape target). The formatter change in `util.ranking-formatter.ts` makes new data available to all consumers automatically — they just ignore it until they need it.

**Pushback (if any):**

- **The "trust Google, no post-filter" decision is confirmed with the user but I want to flag again:** if Google surfaces a general dentist at #3 for "orthodontist in Winter Garden, FL," they will appear in the Practice Health scoring competitor set. Their review counts and rating will influence the benchmarks the gap analysis LLM sees. This is intentional per the -b discussion — it reflects real market signal — but if it causes weird LLM recommendations like "get more reviews to compete with Smile Design Family Dentistry" for an ortho-only practice, we may need to revisit. Log the top-5 competitor types in Step 0 so we can audit this post-ship.

- **The cache re-key vs cache bypass decision:** bypassing is simpler for v1 and avoids stale-cache risk; re-keying preserves cost savings on retry. Going with bypass in v1 — cache becomes dead code for the new path, remains live for any legacy callers during the transition. If volume grows, re-key in v2.

- **Adding `search_query`, `search_lat`, `search_lng` as separate columns vs a single jsonb** — separate columns let us query/filter on them (e.g. "show all rankings that used this query") and use them as indexes if needed. Going with separate columns.

## Tasks

### T1: Database migration — add Search Position columns to `practice_rankings`

**Do:**
- Create new Knex migration `src/database/migrations/20260412000001_add_search_position_to_practice_rankings.ts`
- `up()` — add columns:
  - `search_position` — `integer().nullable()` — client's 1-indexed position in Google results for this query, or null if client not in top 20 / Step 0 couldn't run
  - `search_query` — `text().nullable()` — the exact query string used (e.g. `"orthodontist in Winter Garden, FL"`)
  - `search_lat` — `decimal(10, 7).nullable()` — vantage-point latitude
  - `search_lng` — `decimal(10, 7).nullable()` — vantage-point longitude
  - `search_radius_meters` — `integer().nullable()` — bias radius used
  - `search_results` — `jsonb().nullable()` — full top-20 list: `[{placeId, name, position, rating, reviewCount, primaryType, types}]`
  - `search_checked_at` — `timestamp({useTz: true}).nullable()` — when the Places API call returned
  - `search_status` — `string(32).nullable()` — enum-like text column with CHECK constraint; values: `ok | not_in_top_20 | bias_unavailable | api_error`. Nullable so historical rows stay clean. Added per Revision 1, Gap C.
- `down()` — drop the columns in reverse order
- Generate matching `plans/04122026-.../migrations/mssql.sql`, `pgsql.sql`, and `knexmigration.js` scaffolds with the same schema

**Files:** `src/database/migrations/20260412000001_add_search_position_to_practice_rankings.ts`, `plans/04122026-no-ticket-practice-health-search-position-split/migrations/*.sql`, `plans/.../migrations/knexmigration.js`

**Depends on:** none

**Verify:** `npx knex migrate:latest` runs without error in a scratch DB; `npx knex migrate:rollback` reverts cleanly; `npx tsc --noEmit` passes; the CHECK constraint on `search_status` rejects invalid values (manual `INSERT` test).

---

### T2: Pipeline Step 0 — client lookup + location-biased competitor fetch

**Do:**
- In `service.ranking-pipeline.ts`, add a new Step 0 block before the existing Step 1 (fetch GBP data)
- Sub-steps of Step 0:
  1. Resolve client vantage point:
     - Try GBP profile data for `latlng` / `latLng` / `metadata.placeInfo.latlng` — whichever field the existing GBP fetch returns. Check `src/utils/dataAggregation/dataAggregator.ts` for the shape.
     - Fall back to a Places `textSearch` with `"{practiceName} {marketLocation}"` (reuse `getClientPhotosViaPlaces` and extend it to return `{placeId, photosCount, lat, lng}` — the underlying response already has `place.location.latitude/longitude`)
     - If both fail, set `search_status = 'bias_unavailable'`, log warning, set `search_lat/lng/position = null`, skip the location-biased search, and let the rest of the pipeline use unbiased Places search (existing behavior). **Do not fail the run** — the rest of the pipeline still produces Practice Health data.
  2. Build the search query: `"{specialty} in {marketLocation}"` (default template; hardcoded for v1)
  3. Call `discoverCompetitorsViaPlaces(specialty, marketLocation, 20, { lat, lng, radiusMeters: 40234 })` — the existing function already supports `locationBias`. Wrap the call in try/catch: on failure, set `search_status = 'api_error'`, log the error, and continue the pipeline with an empty competitor set from Step 0 (downstream will need to handle an empty list — use the old unbiased discovery as a fallback so Practice Health scoring still has data).
  4. Find the client in the returned list by exact `placeId` match (from sub-step 1):
     - Found → `search_position = index + 1`, `search_status = 'ok'`
     - Not found → `search_position = null`, `search_status = 'not_in_top_20'`
  5. Capture `search_results` jsonb payload: map each returned place to `{placeId, name, position, rating, reviewCount, primaryType, types, isClient}` — include the `isClient` flag based on placeId match so the frontend doesn't have to re-derive it
  6. Update `status_detail` with new step `fetching_search_position` (progress: 5%, inserted before `fetching_client_gbp`)
  7. Persist Step 0 fields to the row immediately (early `.update()`) — so `search_*` columns are queryable even if a later step fails and the run never reaches the final persistence call
- Extend the canonical `stepsCompleted` array in `updateStatus()` to include `fetching_search_position` as the first step after `queued`
- Reuse the Step 0 competitor list as the input to Step 2 (discovery) — eliminate the current `discoverCompetitorsViaPlaces` + cache lookup flow for this pipeline path. Leave Step 2's Apify-fallback reshape logic intact so the downstream `competitorDetails` shape stays the same.
- Filter the client out of the competitor list by exact `placeId` match (new). Delete the fuzzy name-matching filter.
- Skip `enrichCompetitorReviewCounts` — the Places `textSearch` response already includes `userRatingCount` natively. (Verify during implementation that the shape mapping in `placesToCompetitors` populates `reviewsCount` correctly. If not, keep the enrichment call.)

**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` (possibly — extend `getClientPhotosViaPlaces` return shape)

**Depends on:** T1 (new columns must exist before write)

**Verify:** Manual — trigger a ranking run via `POST /api/practice-rankings/trigger` against a known test account; confirm Step 0 logs appear in backend output; confirm the resulting `practice_rankings` row has `search_position`, `search_query`, `search_lat`, `search_lng`, `search_results` populated; confirm `rank_score` and `rank_position` are still populated by the existing scoring path.

---

### T3: Persistence — write Search Position fields to `practice_rankings`

**Do:**
- At the existing DB write points in `processLocationRanking` (the `.update()` calls at lines ~715 and wherever the final completion update lives), add the new fields to the update payload:
  - `search_position`, `search_query`, `search_lat`, `search_lng`, `search_radius_meters`, `search_results: JSON.stringify(...)`, `search_checked_at: new Date()`
- These fields are only written once per run (in Step 0's persistence), not on every step update. Step 0 does an early `.update()` to write them as soon as the Places call returns, so they're queryable even if the pipeline fails at a later step.
- Update the TypeScript interface in `src/models/PracticeRankingModel.ts` if a typed interface exists for `practice_rankings` rows (add the new fields as optional).
- Update `processBatch` in `service.ranking-computation.ts` and `processRankingWork` in `service.ranking-executor.ts` only if they reference specific ranking fields in their upfront inserts — otherwise no changes.

**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/models/PracticeRankingModel.ts`

**Depends on:** T1, T2

**Verify:** `npx tsc --noEmit` passes; test run via trigger shows populated columns in DB via `psql` or a `SELECT` through the existing admin query tool.

---

### T4: LLM payload — add Search Position context to gap analysis

**Do:**
- In `service.ranking-llm.ts`, extend the `RankingLlmPayload` interface `additional_data` block with a new optional field:
  ```ts
  search_position?: {
    query: string
    position: number | null
    not_in_top_20: boolean
    top_5: Array<{ rank: number; name: string; reviewCount: number; rating: number; isClient: boolean }>
  }
  ```
- In `processLocationRanking` (`service.ranking-pipeline.ts`), build this block from the Step 0 data and include it in the `llmPayload.additional_data` passed to `runRankingAnalysis`
- Update the system prompt in `service.ranking-llm.ts` to reference Search Position: add one bullet under "Your Analysis Must Include" — *"Acknowledge the client's current Google position and factor it into the recommendations. If they're ranking above their Practice Health would predict, protect what's working. If below, prioritize actions that influence Google's ranking signals (reviews, recency, completeness)."*
- Do NOT change the output JSON schema — response shape stays identical

**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`

**Depends on:** T2

**Verify:** Manual — trigger a run, inspect backend logs for the Claude call's input token count (should be ~500-1000 higher than before); inspect the resulting `llm_analysis.render_text` in the DB and confirm it references the client's Google position.

---

### T5: Response formatter — expose Search Position fields via `/api/practice-ranking/latest`

**Do:**
- In `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`, update `formatLatestRanking(ranking, previous)` to include new fields in the returned object:
  - `searchPosition: number | null`
  - `searchQuery: string | null`
  - `searchStatus: 'ok' | 'not_in_top_20' | 'bias_unavailable' | 'api_error' | null` *(Revision 1, Gap C)*
  - `searchResults: Array<{placeId, name, position, rating, reviewCount, primaryType, isClient}> | null`
  - `searchLat: number | null` *(Revision 1, Gap A — needed for frontend stability check)*
  - `searchLng: number | null` *(Revision 1, Gap A)*
  - `searchCheckedAt: string | null`
  - `practiceHealth: number | null` — alias for `rankScore`, provided under the new name so the frontend reads it by the new label
  - `practiceHealthRank: number | null` — alias for `rankPosition`
  - `previousSearchPosition: number | null` — pulled from `previous?.search_position` for the delta arrow
  - `previousSearchQuery: string | null` *(Revision 1, Gap A)*
  - `previousSearchLat: number | null` *(Revision 1, Gap A)*
  - `previousSearchLng: number | null` *(Revision 1, Gap A)*
- The existing `rankScore` / `rankPosition` fields stay in the response for backward compatibility with the admin view and any other consumer
- No controller changes needed — `getLatestRankings` already calls the formatter
- Update the TypeScript response type if one is exported for the frontend to consume

**Files:** `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`

**Depends on:** T3

**Verify:** `curl "http://localhost:PORT/api/practice-ranking/latest?googleAccountId=X&locationId=Y"` returns the new fields; existing fields still present; `npx tsc --noEmit` passes.

---

### T6: Frontend reshape — `/rankings` page with three-section layout

**Do:**
- In `frontend/src/components/dashboard/RankingsDashboard.tsx`, replace the existing "Nearby Practices" section with three new sections:

  **Section 1 — Search Position (top, prominent):**
  - Render state depends on `searchStatus` *(Revision 1, Gap C)*:
    - `ok` → big-number `"#{searchPosition}"`, label `"for {searchQuery}"`, "Last checked: {relativeTime(searchCheckedAt)}" subtitle
    - `not_in_top_20` → `"Not ranked in top 20"` with subtitle `"for {searchQuery}"` and copy `"Your Practice Health below shows what's keeping you out of the top 20 and how to break in."`
    - `bias_unavailable` → `"Couldn't locate your practice on Google"` with subtitle `"Check your Google Business Profile is connected and has a valid address."` — include a link to settings
    - `api_error` → `"Google search temporarily unavailable"` with subtitle `"We'll try again on your next refresh."` — non-alarming, implies transient
    - `null` (pre-Revision-1 historical rows) → treat as `ok` if `searchPosition` is a number, else as `not_in_top_20` — backwards-compatible default
  - List of top-5 from `searchResults`, with the client row highlighted via the `isClient` flag (not name match)
  - Each row: rank badge, practice name, review count, `YOU` badge for the client's row
  - **Growth arrow stability check** *(Revision 1, Gap A)*:
    - Only render a growth arrow (`+N` / `-N` / `=`) if ALL of the following are true:
      - `previousSearchPosition` is not null
      - `previousSearchQuery === searchQuery` (exact match, case-sensitive)
      - Haversine distance between `(previousSearchLat, previousSearchLng)` and `(searchLat, searchLng)` is under **500 meters**
    - If any condition fails, render a **`NEW`** badge with tooltip `"Measurement updated — tracking restarted"`
    - If `previousSearchPosition` is null entirely, render **`NEW`** badge with tooltip `"First measurement — tracking starts now"`
    - Implement the haversine calculation inline in the dashboard component; no new utility module for one call
  - Section title: `"Top Orthodontists in {city}, {state}"` (or whatever the specialty + market resolves to — use `searchQuery` text or split from `ranking.location`)

  **Section 2 — Practice Health:**
  - Big-number display: `"{practiceHealth}/100"`
  - Label: `"Practice Health"`
  - Sub-label comparing to market: `"Stronger than {percentile}% of {specialty}s in your market"` (compute percentile from benchmarks if available; if not, omit this line)
  - Small trend chart reading from historical `rank_score` values (reuse existing trend data path — this is the same data the old "rank" trend was reading)
  - **Ship-date marker** *(Revision 1, Gap B)*:
    - Historical `rank_score` data points from before this spec ships were computed against a different competitor set and are not directly comparable to post-ship values
    - Add a hardcoded `PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT` constant at the top of the component file (ISO date string, set to the day execution lands in production — filled at execution time, not now)
    - Render data points older than this constant with a **dashed** line segment; post-ship with a **solid** line
    - Add a vertical axis marker at the methodology-change date with a small tooltip icon: `"Scoring methodology updated. Older data reflects the previous competitor set and may show a discontinuity."`
    - If no historical data pre-dates the constant, skip the marker entirely (clean slate for new practices)
  - Link: `"See what's driving your score →"` scrolls to Section 3

  **Section 3 — What's Holding You Back:**
  - Top 3 gap items from the LLM analysis (`llm_analysis.gaps` or `llm_analysis.top_recommendations` — whichever is the existing data source)
  - Each item: title, short description, impact badge (high/medium/low)
  - Footer link: `"See full improvement plan →"` → navigates to `/to-do-list`

- Keep the rest of the dashboard (header, page wrapper, location selector via `LocationProvider`, other sections) untouched
- Handle the three loading/empty/error states for each section independently — Search Position might load while Practice Health is still computing, etc. Use the existing query hook pattern.
- Respect `locationId` from the component props — the existing query already passes it to the backend, just make sure the new rendering uses whichever location the user has active in the `LocationSwitcher`

**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, possibly new sub-components like `frontend/src/components/dashboard/rankings/SearchPositionCard.tsx`, `PracticeHealthCard.tsx`, `HoldingYouBackCard.tsx` if the main file gets too large. Use a sub-folder if creating sub-components.

**Depends on:** T5

**Verify:** Manual browser test — `npm run dev`, log in as a test user with a completed ranking run, navigate to `/rankings`, confirm all three sections render correctly; switch locations via `LocationSwitcher` and confirm the data refreshes; test the "Not ranked in top 20" state by manually setting `search_position = null` on a test row; test the "NEW" badge state by deleting historical rows for a test location; `npx tsc --noEmit` passes.

---

### T7: Admin view smoke test (verify only — no code changes)

**Do:**
- Open `frontend/src/pages/admin/PracticeRanking.tsx` in the browser after T1-T6 are applied
- Confirm the existing admin view still renders all the same fields it used to: `rank_score`, `rank_position`, `ranking_factors`, `raw_data`, batch status, LLM analysis
- Confirm the admin view is unaffected by the new columns (they're additive)
- If any admin code reads `rank_score` or `rank_position` and renders them with a label like "Rank", consider a minor label update to "Health Score" / "Health Rank" for internal consistency — BUT only if it's a one-line change. Otherwise leave as-is and note it in a follow-up.

**Files:** `frontend/src/pages/admin/PracticeRanking.tsx` (read-only verify), `frontend/src/components/Admin/OrgRankingsTab.tsx` (read-only verify)

**Depends on:** T6

**Verify:** Manual — visit `/admin/practice-ranking`, trigger a run, verify all existing admin debug fields still display; visit `/admin/org/{id}` rankings tab and confirm it still shows the ranking history.

## Done

- [ ] `npx tsc --noEmit` — zero errors from this spec's changes
- [ ] `npm run lint` (if configured) — no new warnings from this spec's changes
- [ ] `npx knex migrate:latest` applies the new migration cleanly; `rollback` reverts cleanly
- [ ] A fresh ranking run via `POST /api/practice-rankings/trigger` writes all seven new columns to the `practice_rankings` row
- [ ] The resulting row still has `rank_score`, `rank_position`, `ranking_factors`, `raw_data` populated (backward compatibility)
- [ ] Client `/rankings` page renders Section 1 (Search Position) with Google's actual top-5 for the test practice
- [ ] Client `/rankings` page renders Section 2 (Practice Health) with the existing 0-100 score
- [ ] Client `/rankings` page renders Section 3 (Holding You Back) with top-3 gaps and a working link to `/to-do-list`
- [ ] `LocationSwitcher` on the client side correctly loads different location data when switched
- [ ] Admin `/admin/practice-ranking` still renders all existing diagnostic fields
- [ ] LLM `llm_analysis.render_text` in the DB references the client's Google position (confirms T4 worked)
- [ ] Manual test: a practice whose `placeId` isn't in Google's top-20 renders "Not ranked in top 20" cleanly (`search_status = 'not_in_top_20'`)
- [ ] Manual test: a practice with no prior `search_position` history shows the `NEW` badge instead of a growth arrow
- [ ] Manual test: simulate `bias_unavailable` by forcing Step 0's vantage-point lookup to fail — verify the "Couldn't locate your practice" copy renders *(Revision 1, Gap C)*
- [ ] Manual test: simulate `api_error` by throwing inside `discoverCompetitorsViaPlaces` — verify the "temporarily unavailable" copy renders and the rest of the pipeline still completes *(Revision 1, Gap C)*
- [ ] Manual test: run ranking twice for the same location, verify the growth arrow renders on the second run (same query + same vantage) *(Revision 1, Gap A)*
- [ ] Manual test: manually edit `previous.search_query` in the DB to a different value, verify the frontend falls back to the `NEW` badge with "Measurement updated" tooltip *(Revision 1, Gap A)*
- [ ] Manual test: manually edit `previous.search_lat` to drift >500m, verify same fallback *(Revision 1, Gap A)*
- [ ] Manual test: confirm Practice Health trend chart renders the dashed-line segment for pre-ship dates and the vertical marker at the methodology-change date *(Revision 1, Gap B)*
- [ ] No regressions in `DashboardOverview.tsx`, `OrgRankingsTab.tsx`, or any other consumer of `practice_rankings`

## Revision Log

### Rev 1 — 2026-04-12

**Change:** Three gaps surfaced during `--continue` review of rerun behavior. All three folded into the existing tasks rather than spawned as new tasks, because each one is a small vertical slice that cuts across the same layers (DB + pipeline + formatter + frontend) and forking them would make dependency management worse, not better.

**Reason:** Questions raised about what happens when the ranking agent runs a second time for the same practice. The spec as originally written didn't cleanly handle three scenarios:
- **Gap A** — If the Identifier Agent produces a different `specialty` or `marketLocation` on a rerun (GBP profile changed, non-deterministic edge case, or practice moved), the growth arrow would silently compare two different queries / vantage points, misleading the client.
- **Gap B** — Historical `rank_score` values in `practice_rankings` were computed against the old competitor discovery path. Post-ship, `rank_score` is computed against Google's location-biased top-20 — a different competitor set. Without a visible marker, the Practice Health trend chart would connect two numbers that measure different things.
- **Gap C** — Step 0 can fail in three distinct ways (client not in top 20, couldn't determine vantage point, Places API error). The original spec collapsed all three into `search_position = null`, losing information the client needs.

**Decisions:**
- **Gap A** — Frontend growth arrow only renders if `previousSearchQuery === currentSearchQuery` AND haversine distance between `(prevLat, prevLng)` and `(currLat, currLng)` is under 500 meters. Otherwise: `NEW` badge with "Measurement updated" tooltip.
- **Gap B** — Hardcoded `PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT` constant (filled at execution time, not now) drives a dashed vs solid line split on the Practice Health trend chart, plus a vertical axis marker with tooltip explaining the discontinuity.
- **Gap C** — New `search_status` text column on `practice_rankings` with CHECK constraint values `ok | not_in_top_20 | bias_unavailable | api_error`. Pipeline Step 0 sets the right value per outcome. Frontend renders different copy per state.

**Updated tasks:**
- **T1** — Added `search_status` column to the migration (new column, CHECK constraint, nullable for historical row compatibility).
- **T2** — Step 0 sub-steps rewritten to set `search_status` explicitly at each branch (`ok`, `not_in_top_20`, `bias_unavailable`, `api_error`). Added sub-step 7 for early persistence so Step 0 data survives later-step failures. Added `isClient` flag to `search_results` entries.
- **T5** — Formatter exposes `searchStatus`, `searchLat`, `searchLng`, `previousSearchQuery`, `previousSearchLat`, `previousSearchLng` so the frontend has everything it needs for the stability check.
- **T6** — Section 1 (Search Position) branches on `searchStatus` for render state. Section 1 growth arrow has stability check gating. Section 2 (Practice Health) has dashed-line pre-ship segment + methodology-change marker.

**Updated Done criteria:**
- Five new manual test items added to the Done checklist covering: `bias_unavailable` render, `api_error` render, stability-check positive case, stability-check query-drift case, stability-check lat/lng-drift case, Practice Health trend marker rendering.

**Not folded in (flagged during `--continue` but decided against revising):**
- **Gap D** — Task volatility on rerun. Existing `archiveAndCreateTasks` behavior; not worsened meaningfully by this spec. Follow-up candidate: teach archival to preserve in-progress tasks.
- **Gap E** — Concurrent rerun race conditions (retry + scheduled run colliding on the same row). Existing behavior; out of scope here. Follow-up candidate: row-level locking on `practice_rankings.id` during writes.
- **Retry destructive-overwrite semantics** on `/retry/:id` — retries overwrite Step 0 fields with fresh data on the same row. Intentional: retries happen because the first run produced bad data. Documented behavior, no spec change.
