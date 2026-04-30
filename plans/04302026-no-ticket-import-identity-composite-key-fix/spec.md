# Import from Identity — Composite Key Fix

## Why
Multiple doctors/services can share the same `source_url` (e.g., all listed on a single `/our-team` page). The modal uses `source_url` as the checkbox key, so entries sharing a URL all toggle together — check one, all check; count says 1; uncheck one, all uncheck. The backend also creates only one post per URL, ignoring additional entries.

## What
Each identity entry gets a unique composite key (`source_url#name-slug`) throughout the pipeline — frontend selection, API transport, backend dedup, and post storage. Multiple doctors sharing a URL each become a separate draft post. Done when: opening the import modal for a project with multiple doctors on one URL shows independent checkboxes, and importing 3 checked entries creates 3 separate posts.

## Context

**Relevant files:**
- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` — modal with checkbox selection, key generation, entry dispatch
- `frontend/src/api/websites.ts` — `startPostImport` API call, `entries: string[]` type
- `frontend/src/components/Admin/PostsTab.tsx` — builds `existingSourceUrls` Set passed to modal
- `src/controllers/admin-websites/AdminWebsitesController.ts` — `startPostImport` handler, validation
- `src/controllers/admin-websites/feature-services/service.post-importer.ts` — `importFromIdentity` + `importDoctorOrServiceEntry`, dedup, scraping, post creation
- `src/workers/processors/postImporter.processor.ts` — BullMQ processor, `entries: string[]` in job data type

**Patterns to follow:**
- Existing importer entry iteration pattern (sequential for-of loop with `onEntry` callback)
- Existing `slugify` in the importer service

## Constraints

**Must:**
- Backward-compatible: bare-string entries (locations, legacy calls) still work
- Scrape each URL only once when multiple entries share it (cache within import run)
- Composite `source_url` stored in posts uses `#` separator: `url#name-slug`
- No new dependencies

**Must not:**
- Change location import behavior (still keyed on `place_id`)
- Add a migration (composite key stored in existing `source_url` column)
- Break the existing partial unique index `idx_posts_project_type_source`

**Out of scope:**
- Retroactively updating existing posts' `source_url` to composite format
- Handling backward compat for "already imported" detection on pre-existing posts (accepted — they'll show as fresh, admin can re-import which creates new composite-keyed posts)

## Risk

**Level:** 2

**Risks identified:**
- Existing posts with bare `source_url` won't match composite keys in `alreadyImported` check → **Mitigation:** Accepted trade-off; documented in out-of-scope. Pre-existing posts remain untouched.
- Unique index collision if two entries have same URL AND same slugified name → **Mitigation:** Extremely unlikely (identity resync deduplicates by name). Race condition handler already catches `23505` errors.

**Blast radius:** Import modal, post import API endpoint, post importer service. No other consumers of `source_url` are affected (it's only used for dedup in the import flow).

## Tasks

### T1: Backend — accept composite entries and cache scrapes
**Do:**
- In `service.post-importer.ts`: update `ImportFromIdentityArgs.entries` type to `Array<string | { source_url: string; name: string }>`
- Add normalizer: string entries pass through as-is; object entries extract `source_url` and `name`
- In `importFromIdentity`: build a URL→scraped-result cache map. Before calling `importDoctorOrServiceEntry`, check cache for the URL. After scraping, store result in cache.
- In `importDoctorOrServiceEntry`: accept optional `entryName` param. When present: look up identity entry by name (not URL), build composite `source_url` as `url#slugify(name)` for dedup + storage, use `name` as post title
- Update dedup check and post insert to use composite `source_url`
- Update race-condition handler (23505 catch) to use composite key
- Return composite key in `ImportEntryResult.key`
**Files:** `src/controllers/admin-websites/feature-services/service.post-importer.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Backend — update processor and controller types
**Do:**
- In `postImporter.processor.ts`: update `PostImportJobData.entries` type to `Array<string | { source_url: string; name: string }>`
- In `AdminWebsitesController.ts`: update `startPostImport` validation to accept both string and object entries
**Files:** `src/workers/processors/postImporter.processor.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Frontend — fix modal keys and send composite entries
**Do:**
- In `ImportFromIdentityModal.tsx`: add a simple `slugify` helper (match backend's logic)
- Change key generation for doctor/service entries: `key = source_url + '#' + slugify(name)`
- When dispatching to `startPostImport`: send `{ source_url, name }` objects for doctor/service entries (resolve from `allEntries` by key), keep bare strings for locations
- Update `alreadyImported` check: match composite key against `existingSourceUrls`, with fallback check against bare `source_url`
- In `websites.ts`: update `startPostImport` entries type to `Array<string | { source_url: string; name: string }>`
**Files:** `frontend/src/components/Admin/ImportFromIdentityModal.tsx`, `frontend/src/api/websites.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`, manual: open import modal for project with shared-URL doctors, verify independent checkbox behavior

### T4: Frontend — update PostsTab existingSourceUrls
**Do:**
- In `PostsTab.tsx`: no changes needed. `existingSourceUrls` already reads `post.source_url` directly, which will contain composite keys for newly imported posts. Backward compat gap (pre-existing bare URLs not matching) is accepted per out-of-scope.
**Files:** none
**Depends on:** none
**Verify:** read-only verification — no code change

## Done
- [ ] `npx tsc --noEmit` — zero errors from these changes
- [ ] Manual: import modal shows independent checkboxes for doctors sharing a URL
- [ ] Manual: selecting 3 doctors from same URL shows "3 new" in footer, imports create 3 separate draft posts
- [ ] Manual: location import still works unchanged
- [ ] No regressions in existing single-URL-per-doctor imports
