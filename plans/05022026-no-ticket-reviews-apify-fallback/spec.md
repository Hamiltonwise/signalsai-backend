# Reviews Tab — Apify Fallback + GBP Connection Detection

## Why
The Reviews tab's "Sync Reviews from GBP" button requires a full Google OAuth connection (org → google_connections → google_properties with selected=true). Most projects have `selected_place_ids` from onboarding but NO Google connection, making the sync button silently useless. Users need a way to pull reviews without OAuth — and the UI should clearly communicate what's available.

## What
Two-button Reviews tab:
1. **Sync Reviews** — existing OAuth-based sync via GBP API. Disabled with tooltip when no Google connection detected.
2. **Manual Fetch** — new Apify-based one-shot scrape. Uses project's `selected_place_ids` directly. Available whenever place IDs exist, regardless of Google connection.

Both write to the same `website_builder.reviews` table → same downstream rendering via review blocks and shortcodes.

## Context

**Relevant files:**
- `frontend/src/components/Admin/ReviewsTab.tsx` — the Reviews tab UI (stats + sync button)
- `frontend/src/api/reviewBlocks.ts` — API client (has `triggerReviewSync`)
- `src/controllers/admin-websites/AdminWebsitesController.ts:3873-3957` — `triggerReviewSync` + `getReviewStats` endpoints
- `src/workers/processors/reviewSync.processor.ts` — existing OAuth-based sync worker
- `src/controllers/audit/audit-services/service.audit-apify.ts:247-270` — `scrapeOneByPlaceId` pattern (reference for Apify invocation)
- `src/models/website-builder/ReviewModel.ts` — Review model with `upsertByGoogleName`
- `src/routes/admin/websites.ts:481-485` — review route definitions

**Patterns to follow:**
- Apify invocation: `service.audit-apify.ts` — `runActorAndFetch()` with `compass~crawler-google-places` actor, `startUrls` by placeId, `maxReviews` param
- BullMQ job pattern: `reviewSync.processor.ts` — processor receives job data, loops through places, upserts reviews
- Source column pattern: `20260428000005_add_search_position_source.ts` — adding a source discriminator column with CHECK constraint

**Reference file:** `src/workers/processors/reviewSync.processor.ts` — closest analog for review sync flow

## Constraints

**Must:**
- Apify reviews write to the same `website_builder.reviews` table (same downstream rendering)
- `google_review_name` unique constraint must be respected — Apify reviews need a synthetic stable key (e.g. `apify:{placeId}:{reviewerName}:{publishedAtDate}` hash)
- Manual Fetch button disabled when project has no `selected_place_ids`
- Sync Reviews button disabled with explanatory tooltip when no Google connection
- Both buttons show feedback (job queued message, error states)
- Stats endpoint returns connection status so frontend can determine button states without extra API calls

**Must not:**
- Don't touch review blocks, shortcode resolver, or rendering pipeline — they already consume from `website_builder.reviews` agnostically
- Don't modify the existing OAuth sync processor — it stays as-is
- Don't add new npm dependencies
- Don't change the daily cron schedule

**Out of scope:**
- Automatic Apify scheduling (cron) — manual only for now
- Review deduplication across sources (OAuth review overwrites Apify review for same Google review if both exist — acceptable)
- Multi-location picker UI in the Manual Fetch flow — uses all `selected_place_ids`

## Risk

**Level:** 2

**Risks identified:**
- `google_review_name` NOT NULL + UNIQUE constraint → Apify reviews lack this field → **Mitigation:** add `source` column (`oauth` | `apify`), make `google_review_name` nullable, use a deterministic synthetic key for Apify reviews (hash of placeId + reviewer + date), add a new unique index on `(source, google_review_name)` to replace the existing one
- Apify cost per run (~$0.01-0.05 per place) → **Mitigation:** manual-only trigger, no cron. UI shows place count so admin knows the scope before clicking.
- Apify reviews don't include owner reply data → **Mitigation:** `has_reply` defaults to false, `reply_text`/`reply_date` stay null. Acceptable for static display.
- `location_id` FK on reviews table — Apify path doesn't go through `locations` table → **Mitigation:** resolve place_id → location via `google_properties.external_id` or insert project-level reviews with a nullable `location_id` approach. Simpler: the stats endpoint already resolves org → locations, we can match place_ids to locations via identity data, or fall back to the primary location.

**Blast radius:**
- `website_builder.reviews` table — migration adds column, modifies constraint
- `ReviewModel.ts` — upsert method needs source-aware logic
- `getReviewStats` �� returns additional `hasGbpConnection` flag
- `ReviewsTab.tsx` — UI changes (two buttons, connection-aware states)
- Existing OAuth sync: unaffected (writes `source='oauth'`)
- Shortcode resolver: unaffected (reads reviews agnostically)
- Review blocks: unaffected

**Pushback:**
- The `location_id` FK is the trickiest part. Apify scrapes by `place_id` but `website_builder.reviews` requires `location_id`. Two options: (A) make `location_id` nullable and add `place_id` column for Apify reviews, or (B) resolve place_id → location_id via `google_properties` or identity data before insert. Option A is cleaner and avoids coupling to the org/location resolution chain. Recommend A.

## Tasks

### T1: Migration — add `source` column and relax `google_review_name`
**Do:**
- Add `source VARCHAR(16) NOT NULL DEFAULT 'oauth'` with CHECK constraint (`oauth`, `apify`)
- Add `place_id TEXT` nullable column (for Apify reviews that may not have a location_id)
- Make `location_id` nullable (Apify reviews keyed by place_id, not location)
- Drop existing unique index on `google_review_name`
- Make `google_review_name` nullable
- Add new unique index: `UNIQUE(source, google_review_name) WHERE google_review_name IS NOT NULL`
- Add unique index for Apify dedup: `UNIQUE(source, place_id, reviewer_name, review_created_at) WHERE source = 'apify'`
- Backfill: all existing rows get `source = 'oauth'` (already the default)
**Files:** `src/database/migrations/20260502200000_add_review_source_and_apify_support.ts`
**Depends on:** none
**Verify:** `npx knex migrate:latest` succeeds, rollback works

### T2: Backend — Apify review fetch endpoint + processor
**Do:**
- Add `POST /:id/reviews/fetch` route in `src/routes/admin/websites.ts`
- Add `triggerApifyReviewFetch` handler in `AdminWebsitesController.ts`:
  - Read `selected_place_ids` from project
  - Validate at least one place_id exists
  - Queue a BullMQ job on `review-sync` queue with `{ mode: 'apify', placeIds: [...], projectId }`
- Add Apify review processing in a new file `src/workers/processors/reviewApifyFetch.processor.ts`:
  - For each place_id: call Apify `compass~crawler-google-places` with `startUrls` by place_id, `maxReviews: 50`, `scrapePlaceDetailPage: true`
  - Map each Apify review item to `website_builder.reviews` row:
    - `source = 'apify'`
    - `place_id` = the Google place_id
    - `location_id` = resolve via org locations if possible, else null
    - `google_review_name` = null (Apify doesn't provide this)
    - `stars` = item.stars (numeric)
    - `text` = item.text
    - `reviewer_name` = item.name
    - `reviewer_photo_url` = item.reviewerPhotoUrl
    - `is_anonymous` = !item.name
    - `review_created_at` = new Date(item.publishedAtDate)
    - `has_reply` = !!item.responseFromOwnerText
    - `reply_text` = item.responseFromOwnerText || null
    - `reply_date` = item.responseFromOwnerDate ? new Date(...) : null
  - Upsert using the Apify composite unique index
- Register the worker in `src/workers/worker.ts` (reuse `review-sync` queue, dispatch by job name)
- Augment `getReviewStats` to return `hasGbpConnection: boolean` and `hasPlaceIds: boolean`:
  - `hasGbpConnection`: check `google_properties` joined to `google_connections` for the org, where `type='gbp'` and `selected=true`
  - `hasPlaceIds`: check `selected_place_ids` on the project is non-empty
**Files:** `src/routes/admin/websites.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/workers/processors/reviewApifyFetch.processor.ts`, `src/workers/worker.ts`
**Depends on:** T1
**Verify:** `curl -X POST /api/admin/websites/:id/reviews/fetch` queues job; stats endpoint returns `hasGbpConnection`/`hasPlaceIds`

### T3: Update ReviewModel for source-aware upserts
**Do:**
- Add `source` and `place_id` to `IReview` interface
- Add `upsertApifyReview` static method that inserts with `ON CONFLICT (source, place_id, reviewer_name, review_created_at) WHERE source = 'apify'` merge logic
- Keep existing `upsertByGoogleName` unchanged (OAuth path)
**Files:** `src/models/website-builder/ReviewModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T4: Frontend — two-button UI with connection detection
**Do:**
- Update `ReviewsTab.tsx`:
  - Stats endpoint now returns `hasGbpConnection` and `hasPlaceIds` — consume these
  - "Sync Reviews" button: enabled only when `hasGbpConnection` is true. When disabled, show tooltip: "Requires Google Business Profile connection"
  - "Manual Fetch" button: enabled when `hasPlaceIds` is true. Calls new `POST /:id/reviews/fetch` endpoint. Label: "Fetch via Google Maps" (less technical than "Apify"). When disabled, show tooltip: "No GBP locations selected for this project"
  - Both buttons show job queued feedback, same pattern as existing sync
  - When both are available, both show side by side (Sync as primary, Manual Fetch as secondary/outline variant)
- Add `triggerApifyReviewFetch` to `frontend/src/api/reviewBlocks.ts`
- Update `ReviewStats` interface to include `hasGbpConnection` and `hasPlaceIds`
**Files:** `frontend/src/components/Admin/ReviewsTab.tsx`, `frontend/src/api/reviewBlocks.ts`
**Depends on:** T2
**Verify:** Manual — visit Reviews tab, verify button states for projects with/without GBP connection

## Revision Log

### Rev 1 — 2026-05-02
**Change:** Reviews tab expanded from stats-only to full review management UI
**Reason:** User needs manual control — location picker, review list with search/filter, hide/show toggle, delete

**New scope:**
- Migration: `hidden` boolean column on reviews
- Backend: `GET /:id/reviews` (list with search/filter), `PATCH /:id/reviews/:reviewId` (toggle hidden), `DELETE /:id/reviews/:reviewId`
- Backend: `POST /:id/reviews/fetch` now accepts `{ placeIds }` body for manual location selection
- Backend: `GET /:id/reviews/jobs/:jobId/status` for job polling
- Frontend: location picker from `project_identity.locations[]`, review list with search by name/comment, filter by star, show/hide toggle, delete
- Frontend: localStorage-persisted job progress that survives page refresh
- Shortcode resolver: skip `hidden` reviews

## Done
- [ ] `npx knex migrate:latest` — both migrations apply cleanly
- [ ] `npx tsc --noEmit` — zero errors (backend + frontend)
- [ ] Manual: Reviews tab shows location picker when clicking "Fetch via Google Maps"
- [ ] Manual: After fetch, review list appears with all reviews
- [ ] Manual: Search by name and comment works
- [ ] Manual: Star filter works
- [ ] Manual: Hide/show toggle works, hidden reviews excluded from shortcode rendering
- [ ] Manual: Delete review works with confirm dialog
- [ ] Manual: Job progress banner persists across page refresh
- [ ] Existing OAuth sync still works (no regression)
