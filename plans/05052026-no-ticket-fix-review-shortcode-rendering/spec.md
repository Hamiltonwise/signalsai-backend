# Fix Review Shortcode Rendering

## Why
Caswell Orthodontics has visible reviews in the admin Reviews tab, but homepage `{{ review_block ... }}` rendering can return no reviews because shortcode rendering and admin review scoping are not using the same project review scope.

## What
Review shortcodes render the same visible project-scoped reviews that the Reviews tab can see, including Apify/place-backed reviews. The DFY website preview also triggers shortcode resolution for `review_block`.

## Context

**Relevant files:**
- `src/models/website-builder/ProjectReviewModel.ts` — central project review scope used by the admin Reviews tab.
- `src/models/website-builder/ReviewModel.ts` — review list queries and filters.
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — expands `{{ review_block ... }}` into rendered HTML.
- `frontend/src/pages/DFYWebsite.tsx` — client preview decides whether to call `/user/website/resolve-preview`.

**Patterns to follow:**
- Keep database access in website-builder models instead of adding more one-off Knex logic to the resolver.
- Preserve existing shortcode syntax and review block templates.
- Keep frontend change minimal; this is a preview trigger fix, not a UI redesign.

**Key decisions already made:**
- Use option 1: align shortcode rendering with the same project review scope as the Reviews tab.
- No schema changes.
- Treat current uncommitted resolver edits as existing workspace state; execution must reconcile them without reverting unrelated user work.

## Constraints

**Must:**
- Include `location_id OR place_id` review matching.
- Normalize project place IDs from `selected_place_ids`, `selected_place_id`, and `primary_place_id`.
- Keep hidden reviews excluded from rendered shortcode output.
- Preserve `min_rating`, `limit`, `offset`, and `order` shortcode behavior.
- Add `review_block` to the DFY preview resolution guard.

**Must not:**
- Add a new dependency.
- Change review block template markup.
- Change admin Reviews tab behavior except through shared model logic that preserves its current results.
- Refactor unrelated shortcode types.

**Out of scope:**
- Designing per-GBP-location shortcode selection UI.
- Changing seeded review block templates.
- Publishing/deploying Caswell pages.

## Risk

**Level:** 2

**Risks identified:**
- Shortcode review scope has already drifted from admin review scope. → **Mitigation:** route rendering through `ProjectReviewModel` / `ReviewModel` instead of duplicating resolver-local Knex queries.
- `location='primary'` is semantically ambiguous for Apify reviews when a project has multiple selected GBP place IDs but only one local `locations` row. → **Mitigation:** for this fix, use the project selected review scope to match the Reviews tab; later add explicit place/location shortcode semantics if product wants primary-only display.
- Current workspace has uncommitted edits in `shortcodeResolver.service.ts`. → **Mitigation:** execution must inspect the diff first and apply only the planned reconciliation, not overwrite unrelated user changes.

**Pushback:**
- Leaving the resolver as the owner of review query logic will keep causing this. Future-us will hate this because admin stats, admin lists, and public shortcode rendering will disagree again. The resolver should render templates; models should own review scope and review querying.

## Tasks

### T1: Centralize Review Listing For Shortcodes
**Do:** Extend model-level review listing so shortcode rendering can request visible scoped reviews with `minRating`, `limit`, `offset`, and `order`. Ensure project scope includes `primary_place_id` along with existing selected place fields.
**Files:** `src/models/website-builder/ProjectReviewModel.ts`, `src/models/website-builder/ReviewModel.ts`
**Verify:** Targeted DB/manual check: Caswell project scope includes three selected place IDs and returns visible reviews for `min_rating='4'`.

### T2: Update Review Shortcode Resolver
**Do:** Replace resolver-local review scope/query logic with model-backed project scope listing. Preserve rendering, block lookup, shortcode parsing, and empty fallback behavior.
**Files:** `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Verify:** Manual/targeted resolver check: published Caswell homepage shortcode `{{ review_block id='review-carousel' location='primary' min_rating='4' limit='20' }}` renders review cards instead of an empty block.

### T3: Trigger Preview Resolution For Review Blocks
**Do:** Add `review_block` to the DFY preview guard so `/user/website/resolve-preview` runs for review-only shortcode pages/sections.
**Files:** `frontend/src/pages/DFYWebsite.tsx`
**Verify:** Manual preview check: DFY website preview enters resolving state and replaces review shortcode output for a page containing only `review_block`.

## Done
- [x] `npx tsc --noEmit` passes or only reports pre-existing unrelated errors.
- [x] Project lint command runs if configured; failures are fixed if caused by this change.
- [x] Caswell homepage review shortcode renders visible reviews from selected project review scope.
- [x] DFY preview resolves pages containing `review_block`.
- [x] Admin Reviews tab totals/list remain consistent with project review scope.

## Verification Notes

- `npx tsc --noEmit` passed at the backend repo root.
- Targeted model check for Caswell returned location `[22]`, three selected place IDs, and 20 visible `min_rating=4` reviews.
- Targeted resolver check for Caswell expanded the `review-carousel` shortcode with rendered review-card output and no remaining `{{review.reviewer_name}}` token.
- `npm run lint` in `frontend/` ran but failed on pre-existing unrelated lint debt, including broad `no-explicit-any`, unused variables, and Fast Refresh violations across many files.
- `npm run build` in `frontend/` ran but failed on unrelated dirty/pre-existing errors in `src/components/Admin/integrations/IntegrationProviderList.tsx` and `src/contexts/OnboardingWizardContext.tsx`.
- `git diff --check` passed for the files touched by this work.
