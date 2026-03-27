# Competitor Discovery Overhaul — Places API + Algorithm Fix

## Why
Competitor discovery via Apify is slow (30-120s), expensive (2 actor runs), and inaccurate — it returns general dentists when searching for endodontists, and ranks the client #1 when clearly better-performing competitors exist. The search query is just the specialty word with no location context. Additionally, review velocity and GBP activity are scored for competitors despite having no reliable data source for those factors.

## What
1. Replace Apify competitor discovery with Google Places Text Search API (fast, accurate, location-aware)
2. Add strict category filtering to drop non-specialty results
3. Split ranking algorithm into 6-factor competitive scoring + 2-factor client-only insights
4. Move client photo count from Apify to Places API
5. Fix fallback specialty defaulting to "orthodontist"

## Context

**Relevant files:**
- `feature-services/service.apify.ts` — `discoverCompetitors()` (Apify), `getCompetitorDetails()` (Apify deep scrape), `enrichCompetitorReviewCounts()` (Places API)
- `feature-services/service.ranking-pipeline.ts` — Pipeline orchestrator, Steps 2-5
- `feature-services/service.ranking-algorithm.ts` — 8-factor scoring algorithm + weights
- `feature-services/service.identifier.ts` — Fallback defaults to "orthodontist"
- `feature-services/service.specialty-identifier.ts` — Same fallback issue
- `controllers/places/feature-services/GooglePlacesApiService.ts` — Existing Places API service (autocomplete + details)
- `controllers/places/feature-utils/fieldMasks.ts` — Existing field masks

**Patterns to follow:**
- `GooglePlacesApiService.ts` for Places API call patterns and auth headers
- Existing `GOOGLE_PLACES_API` env var already configured

**Key decisions:**
- Google Places Text Search for discovery (replaces `discoverCompetitors`)
- Keep Apify `getCompetitorDetails` for deep scrape (review text, dates, distribution)
- Strict category filtering: only keep businesses matching specialty categories
- 6-factor competitive rank (drop velocity + activity from comparison)
- Client still scored on all 8 factors, velocity + activity shown as client-only insights
- Client photo count via Places API `getPlaceDetails` (replaces 2 Apify runs)

## Constraints

**Must:**
- Preserve all existing interfaces (`PracticeData`, `RankingResult`, `RankingFactors`) — add fields, don't remove
- Preserve `llm_analysis` payload shape (Claude still receives all 8 factor scores)
- Preserve task creation flow unchanged
- Include market location in search query (e.g. "endodontist in Austin, TX")

**Must not:**
- Remove Apify entirely (still needed for deep scrape)
- Change the frontend contract
- Add new npm dependencies
- Modify DB schema

**Out of scope:**
- Frontend changes to show client-only insights differently
- Prompt tuning for the new factor structure
- Historical ranking data migration

## Risk

**Level:** 3 (Structural Risk)

**Risks identified:**
- Historical ranking scores will shift due to algorithm weight change → **Mitigation:** Scores are snapshots. After one run cycle, previous + current will both use new algorithm. LLM analysis regenerates each run.
- Strict filtering could produce thin competitor pools in small markets → **Mitigation:** Log pre/post filter counts. If filtered pool < 5, log warning but proceed. Consider fallback to "related dental" in future iteration.
- Google Places Text Search returns max 20 results per query → **Mitigation:** Current Apify limit is also 20. No regression.

## Tasks

### T1: Add Google Places Text Search to Places API service
**Do:** Add `textSearch(query, options)` method to `GooglePlacesApiService.ts`. Returns array of places with placeId, displayName, rating, userRatingCount, primaryType, types, formattedAddress, websiteUri, nationalPhoneNumber, regularOpeningHours, photos, location. Add corresponding field mask to `fieldMasks.ts`.
**Files:** `controllers/places/feature-services/GooglePlacesApiService.ts`, `controllers/places/feature-utils/fieldMasks.ts`
**Verify:** `npx tsc --noEmit`

### T2: Create competitor discovery service using Places API
**Do:** Create `service.places-competitor-discovery.ts` in `feature-services/`. This service:
1. Exports `discoverCompetitorsViaPlaces(specialty, marketLocation, limit)` — builds query like `"endodontist in Austin, TX"`, calls Text Search, returns `CompetitorSearchResult[]` in the same shape as the Apify version
2. Exports `filterBySpecialty(competitors, specialty)` — strict filter: only keep businesses whose `primaryType` matches the specialty's category list from `SPECIALTY_CATEGORIES` in the algorithm. Log pre/post filter counts, warn if < 5 remain.
3. Exports `getClientPhotosViaPlaces(practiceName, marketLocation)` — Text Search to find client Place ID, then `getPlaceDetails` for photos count. Replaces the 2 Apify runs in the pipeline.
**Files:** `feature-services/service.places-competitor-discovery.ts`
**Verify:** `npx tsc --noEmit`

### T3: Restructure ranking algorithm — 6-factor competitive + 2-factor client-only
**Do:** In `service.ranking-algorithm.ts`:
1. Add `COMPETITIVE_FACTOR_WEIGHTS` (6 factors, re-normalized to sum to 1.0): categoryMatch 30%, reviewCount 24%, starRating 18%, keywordName 12%, napConsistency 10%, sentiment 6%
2. Keep existing `FACTOR_WEIGHTS` for client-only full scoring (all 8 factors)
3. Add `calculateCompetitiveScore(practice, specialty, keywords)` — scores on 6 factors only, used for rank position
4. Modify `rankPractices()` to accept a `mode` parameter: `"competitive"` (6-factor, for rank position) or `"full"` (8-factor, for client insights). Default to `"competitive"`.
5. Keep `calculateRankingScore()` unchanged — still returns all 8 factors for the LLM payload
**Files:** `feature-services/service.ranking-algorithm.ts`
**Verify:** `npx tsc --noEmit`

### T4: Rewire pipeline to use Places API discovery + new algorithm
**Do:** In `service.ranking-pipeline.ts`:
1. **Step 2:** Replace `discoverCompetitors()` (Apify) with `discoverCompetitorsViaPlaces()`. Add `filterBySpecialty()` call after discovery. Keep competitor caching logic.
2. **Step 3:** Keep Apify `getCompetitorDetails()` deep scrape — but now it receives pre-filtered Place IDs from Step 2.
3. **Step 5 (client photos):** Replace the 2 Apify runs (search + detail) with `getClientPhotosViaPlaces()`.
4. **Step 5 (scoring):** Use `rankPractices(..., "competitive")` for rank position. Keep `calculateRankingScore()` for the full 8-factor client breakdown sent to Claude.
5. Remove `discoverCompetitors` import from this file (no longer used here).
**Files:** `feature-services/service.ranking-pipeline.ts`
**Verify:** `npx tsc --noEmit`

### T5: Fix fallback specialty + include location in search
**Do:**
1. In `service.identifier.ts:74` — change fallback from `"orthodontist"` to derive from GBP primary category (e.g. "Endodontist" → "endodontist"). Fall back to `"dentist"` (not "orthodontist") if category can't be parsed.
2. In `service.specialty-identifier.ts:148` — same fix.
3. In `service.ranking-algorithm.ts` — add `"dentist"` to `SPECIALTY_ALIASES` mapping and ensure general dental categories are handled.
**Files:** `feature-services/service.identifier.ts`, `feature-services/service.specialty-identifier.ts`, `feature-services/service.ranking-algorithm.ts`
**Verify:** `npx tsc --noEmit`

## Done
- [x] `npx tsc --noEmit` passes with zero errors
- [x] Competitor discovery uses Google Places Text Search, not Apify
- [x] Search query includes market location (e.g. "endodontist in Austin, TX")
- [x] Competitors are filtered by specialty category match before deep scrape
- [x] Rank position uses 6-factor competitive scoring (no velocity/activity)
- [x] Client still scored on all 8 factors, all 8 sent to Claude in payload
- [x] Client photo count uses Places API, not Apify
- [x] Fallback specialty is derived from GBP category, not hardcoded "orthodontist"
- [x] Apify `getCompetitorDetails` still used for deep scrape only
- [x] No frontend contract changes
