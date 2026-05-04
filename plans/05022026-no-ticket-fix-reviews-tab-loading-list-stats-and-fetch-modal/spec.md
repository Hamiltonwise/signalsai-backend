# Fix Reviews Tab Loading, List, Stats, and Fetch Modal

## Why
The Reviews tab currently reports review totals while showing no rows, displays two competing loading indicators, renders a misleading rating distribution, and exposes the GBP location picker as an inline panel. Admins need a single coherent review management surface that makes destructive replace-fetch behavior explicit.

## What
Repair the Reviews tab so initial loading is unified, stats and list data come from the same review scope, errors are visible, rating distribution reflects real counts, and "Fetch via Google Maps" opens an animated modal that confirms selected locations before replacing reviews and fetching fresh data.

## Context

**Relevant files:**
- `frontend/src/components/Admin/ReviewsTab.tsx` — current 590-line Reviews tab with duplicated loading state, swallowed review-list errors, inline location picker, stat cards, filters, review row, and job banner.
- `frontend/src/api/reviewBlocks.ts` — review API client for sync, fetch, job polling, list, hide, and delete.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — passes `projectId`, `organizationId`, and `project_identity` into `ReviewsTab`.
- `src/controllers/admin-websites/AdminWebsitesController.ts` — project-scoped review endpoints currently mix orchestration and direct Knex queries.
- `src/routes/admin/websites.ts` — thin route registration for review stats/list/fetch/sync/job status/hide/delete.
- `src/models/website-builder/ReviewModel.ts` — model list/upsert/toggle methods; should own review query semantics.
- `src/workers/processors/reviewApifyFetch.processor.ts` — Apify fetch worker that currently upserts reviews but does not replace stale rows.
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — downstream shortcode rendering excludes hidden reviews and reads by location/place scope.
- `src/database/migrations/20260502200000_add_review_source_and_apify_support.ts` — adds `source`, `place_id`, and Apify dedupe support.
- `src/database/migrations/20260502200001_add_review_hidden_column.ts` — adds `hidden`; local missing migration can make list fail while stats still work.

**Patterns to follow:**
- Keep routes thin and DB access in models per `alloro-conventions`.
- Split `ReviewsTab.tsx`; one component per file and under the frontend size limits.
- Use Framer Motion for modal entrance/exit and existing custom confirm/modal patterns instead of `window.confirm`.
- Use skeleton-shaped loading for initial tab content, not duplicate spinners.

**Key decisions already made:**
- The fetch path remains project-scoped and uses selected GBP `place_id` values.
- The modal will explicitly warn that selected reviews are being replaced.
- Replacement should be per selected location and source-scoped to Google Maps/Apify fetch data unless execution discovers a stricter product requirement.

## Constraints

**Must:**
- Show one initial loading state for the Reviews tab.
- Surface review-list and stats API errors instead of treating failed list fetches as empty filters.
- Keep stats, distribution, and list counts aligned to the same visibility/source/location rules.
- Render rating distribution with real counts and a visually meaningful 1-5 scale.
- Move the GBP location selector into an animated, accessible modal.
- Require an explicit modal confirmation before triggering the replace-fetch flow.
- Preserve existing review hide/show and delete behavior.
- Keep shortcode rendering compatible with hidden reviews.
- Run migrations before assuming the review list can query `hidden`.

**Must not:**
- Do not silently delete OAuth-synced reviews from connected GBP locations as part of an Apify fetch.
- Do not clear rows before the replacement fetch succeeds for that location.
- Do not leave API calls directly embedded in a large component if execution touches that flow.
- Do not introduce new dependencies.
- Do not refactor unrelated admin website tabs or integration work.

**Out of scope:**
- Redesigning review blocks or shortcode templates.
- Scheduling automatic Apify replacement fetches.
- Reworking Google OAuth review sync beyond keeping list/stat scopes consistent.
- Deduplicating the same human review across OAuth and Apify sources globally.

## Risk

**Level:** 3

**Risks identified:**
- Replacing reviews is destructive and can erase visible review content if Apify fails → **Mitigation:** fetch first, then replace existing Apify rows for each successfully fetched location inside a transaction; keep old rows when a location fetch fails.
- Stats and list currently use similar but separate query logic → **Mitigation:** centralize project review scope, stats, list, and replacement deletion in `ReviewModel` or a small review service so UI cannot report totals from a different dataset than the list.
- Missing `hidden` migration can make list queries fail while stats still render → **Mitigation:** verify migrations and make frontend show endpoint errors; do not label failed loads as "No reviews match your filters."
- `ReviewsTab.tsx` is already over the frontend file-size limit → **Mitigation:** split modal, stats, filters, row, job banner, and small hook/query logic into focused files before adding behavior.
- Current controller has direct Knex review queries → **Mitigation:** move new review query/write semantics to the model/service layer and keep controller as orchestration only.

**Pushback:**
- Clearing all reviews before fetching is the wrong failure mode. Future-us will hate debugging "fetch failed and now the site has zero reviews." The replacement should be visible to the user as "replace reviews," but technically it should swap data only after a successful fetch for each selected location.
- "All reviews" is ambiguous. The safe contract is "all Google Maps fetched reviews for the selected locations." Deleting OAuth-synced GBP reviews from a separate connection path would introduce architectural drift and data loss risk.

## Tasks

### T1: Review Data Contract and Backend Scope
**Do:** Centralize project review scope resolution and stats/list queries so totals, distribution, hidden filtering, source handling, and place/location selection share one backend contract. Add replace-fetch semantics that remove stale Apify rows only after fresh reviews are successfully fetched for a selected location.
**Files:** `src/models/website-builder/ReviewModel.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/workers/processors/reviewApifyFetch.processor.ts`, `src/routes/admin/websites.ts`
**Verify:** `npx tsc --noEmit`; manual API check for stats/list agreement on the target project.

### T2: Reviews Tab State and Component Split
**Do:** Split the Reviews tab into focused components/hooks, remove duplicate initial loading indicators, expose stats/list errors, and ensure empty states distinguish "no reviews," "no visible reviews," "filters matched nothing," and "load failed."
**Files:** `frontend/src/components/Admin/ReviewsTab.tsx`, `frontend/src/components/Admin/reviews/*`, `frontend/src/api/reviewBlocks.ts`
**Verify:** `npm run lint`; `npx tsc --noEmit`; manual load of `/admin/websites/86abb2c6-7a8d-4b27-897e-90d0cfac4a65?tab=reviews`.

### T3: Rating Distribution UI
**Do:** Replace the collapsed percentage bars with a stable, count-based distribution component that shows 1-5 star rows/bars, counts, and percentages from the same stats payload used by the list.
**Files:** `frontend/src/components/Admin/reviews/ReviewStatsCards.tsx` or equivalent extracted stats component
**Verify:** Manual: 150 reviews at 5.0 renders a dominant 5-star bar and zero-count ratings do not look populated.

### T4: Animated Replace-Fetch Location Modal
**Do:** Replace the inline location picker with an accessible Framer Motion modal. Preselect current locations, show primary labels, explain that selected Google Maps fetched reviews will be replaced, disable submit with no selections, and start the replace-fetch job only after confirmation.
**Files:** `frontend/src/components/Admin/reviews/ReviewFetchLocationsModal.tsx`, `frontend/src/components/Admin/ReviewsTab.tsx`, `frontend/src/api/reviewBlocks.ts`
**Verify:** Manual: clicking "Fetch via Google Maps" opens animated modal; confirm queues job; cancel closes without side effects; job banner persists and refreshes stats/list on completion.

### T5: Verification and Browser QA
**Do:** Run migrations if needed, type-check, lint, and verify the target route in the in-app browser. Check initial loading, stats/list agreement, distribution rendering, filter behavior, modal animation, and replacement job status handling.
**Files:** no production file ownership; verification only
**Verify:** `npx knex migrate:latest`; `npx tsc --noEmit`; `npm run lint`; in-app browser QA on the target reviews URL.

## Done
- [x] `npx knex migrate:latest` confirms review migrations are applied.
- [x] `npx tsc --noEmit` passes or only reports documented unrelated pre-existing errors.
- [x] `npm run lint` passes or only reports documented unrelated pre-existing errors.
- [x] Manual: only one initial loading state appears on the Reviews tab.
- [x] Manual: review rows appear when stats report visible reviews.
- [x] Manual: failed review loads show an error, not "No reviews match your filters."
- [x] Manual: rating distribution matches total and average rating.
- [x] Manual: "Fetch via Google Maps" opens an animated modal, not an inline panel.
- [x] Manual: confirmed replace-fetch refreshes stats/list after job completion without launching a live Apify job.
- [x] Manual: canceling the modal does not queue a job or alter reviews.
- [x] Manual: hidden reviews remain excluded from shortcode rendering unless explicitly shown in admin.

## Verification Notes

- `npx tsc --noEmit` passed for the backend.
- `npm run db:migrate` ran successfully: batch 99 applied one migration.
- Targeted frontend lint passed for the Reviews tab files: `npx eslint src/components/Admin/ReviewsTab.tsx src/components/Admin/reviews/*.tsx src/hooks/queries/useAdminReviewQueries.ts src/api/reviewBlocks.ts src/lib/queryClient.ts`.
- Full frontend build remains blocked by unrelated existing errors in `IntegrationProviderList.tsx` and `OnboardingWizardContext.tsx`.
- Full frontend lint remains blocked by broad pre-existing lint debt outside this review scope.
- Browser fallback QA on the target route showed 150 visible review rows, zero lingering loading indicators, distribution `5:148, 4:1, 3:0, 2:0, 1:1`, and a modal with 3/3 locations preselected.
- Job completion refresh was verified by code path: completed job status updates the active job, calls `actions.invalidate()`, and invalidates both `adminWebsiteReviewStatsAll(projectId)` and `adminWebsiteReviewsAll(projectId)`. A live Apify job was not launched.
