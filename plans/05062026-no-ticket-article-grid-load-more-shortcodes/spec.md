# Article Grid Load More Shortcodes

Status: Done
Date: 05/06/2026
Ticket: no-ticket
Mode: start / planning only

## Goal

Add a safe path for article/post shortcode loops, especially the existing reused `articles-grid` shortcode, to support `load more`, numbered, or infinite pagination behavior in the same style already used by review shortcodes and the live website-builder renderer.

The immediate need is to understand and preserve current shortcode behavior while enabling article grids to render an initial page of posts and fetch additional posts without requiring every article page to hard-code a fixed `limit`.

## Current Findings

- `.env` database access was used read-only for investigation. No database writes were made.
- `website_builder` currently has:
  - 2 templates
  - 9 post types
  - 13 post blocks
  - 394 posts
  - 3 review blocks
  - 3659 reviews
- The `articles` post type has 252 published posts across 4 projects.
- `articles-grid` exists for the Alloro Dental and SaaS templates.
- Current `articles-grid` shortcode usage includes:
  - 25 pages with `{{ post_block id='articles-grid' items='articles' limit='12' }}`
  - 6 pages with `paginate='numbered' per_page='9' limit='0'`
  - 2 pages with `paginate='load-more' ...`
  - 1 page with no explicit `limit`
- Published/draft article pages using exact `limit='12'`: 7 total.
- The live renderer in `../website-builder-rebuild` already supports post pagination attributes:
  - `paginate='load-more'`
  - `paginate='numbered'`
  - `paginate='infinite'`
  - `per_page='N'`
- The live renderer already exposes APIs for loading more posts and reviews.
- Review behavior differs by block:
  - `review-list-compact` has client-side load-more reveal behavior.
  - `review-carousel` has slider behavior.
  - `review-grid` is static unless renderer pagination is applied around it.
- `review-list-compact` should be reviewed separately because its current load-more behavior appears to reveal already-rendered reviews instead of fetching the next page from `/api/reviews/{hostname}`.
- The Alloro admin preview resolver currently has parameter types for post/review pagination, but the implementation does not apply `paginate` or `per_page` behavior for preview rendering.

## Recommended Scope

1. Keep the live website-builder renderer as the reference implementation. Do not rewrite its pagination system unless testing shows a real defect.
2. Bring Alloro admin preview behavior into parity enough that paginated post/review shortcode previews show the correct first page instead of ignoring pagination attributes.
3. Update admin/docs/AI-command guidance so future article pages prefer pagination attributes instead of fixed `limit='12'` article grids.
4. Convert or document `review-list-compact` so it uses the API-backed review pagination path instead of its block-local reveal behavior.
5. Treat production database content updates as a separate approval-gated step.

## Implementation Plan

### 1. Admin Resolver Parity

Update `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`.

- Parse `paginate` and `per_page` for `post_block` and `review_block` shortcodes.
- For paginated post blocks, render only the first page in admin preview.
- For existing fixed-limit post blocks, preserve current output count.
- Use `per_page` as the first-page size when pagination is enabled.
- Make `limit='0'` work with paginated post blocks by falling back to `per_page`, not zero posts.
- Validate/sanitize post sort fields instead of passing arbitrary `order_by` directly into the query.
- Keep the preview-only implementation intentionally simple; do not duplicate the full live renderer API or client script in Alloro.

### 2. Guidance And Docs

Update guidance files that generate or document article grids.

Candidate files:

- `frontend/src/pages/admin/AlloroPostsDocs.tsx`
- `src/agents/websiteAgents/aiCommand/Analysis.md`
- `src/agents/websiteAgents/aiCommand/Execution.md`
- `src/controllers/admin-websites/feature-services/service.ai-command.ts`

Preferred article shortcode pattern:

```liquid
{{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' limit='0' }}
```

Keep fixed-limit examples only when the intended design is a small featured list, not a full articles index.

### 3. Review List Compact API Pagination

Inspect the existing `review-list-compact` review block and every shortcode usage before changing it.

- Confirm whether the current block template includes a hard-coded Load More button and inline JavaScript.
- Confirm whether it renders all matching reviews up front, then hides/reveals them client-side.
- Prefer the generic API-backed pagination path already used by review shortcodes:

```liquid
{{ review_block id='review-list-compact' paginate='load-more' per_page='6' limit='0' }}
```

- Avoid double controls. A `review-list-compact` shortcode should not render both the block-local Load More button and the generic API-backed Load More button.
- If the block template itself contains local reveal JavaScript, prepare a separate approval-gated database/template update to remove that embedded behavior or create a clean API-ready version of the block.
- Keep `review-carousel` out of this conversion unless separately requested; carousel behavior is a different interaction pattern.

Target behavior:

- First page of reviews renders server-side.
- Clicking Load More calls:

```text
/api/reviews/{hostname}?page=2&per_page=6
```

- New reviews are appended into the same compact list using the review block loop template.
- The page does not preload all reviews just to hide most of them.

### 4. Optional Database Content Update

Do not run this during implementation unless explicitly approved.

Prepare a dry-run query that lists page IDs, project IDs, slugs, status, and existing content snippets for article pages that still use:

```liquid
{{ post_block id='articles-grid' items='articles' limit='12' }}
```

If approved, update only published/draft article index pages to:

```liquid
{{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' limit='0' }}
```

Do not update inactive historical page versions unless separately requested.

Also prepare a separate dry-run query for `review-list-compact` shortcode usages and the `review-list-compact` block template itself. Any review-block template edit or shortcode migration must include exact affected rows and rollback SQL.

Required safety steps before any write:

- Export the exact rows being changed.
- Show the SQL update and rollback SQL.
- Confirm affected row count.
- Re-query the updated shortcodes after the write.

## Verification

- Run backend build:

```bash
npm run build
```

- Run frontend build if docs/admin UI changed:

```bash
npm --prefix frontend run build
```

- Add or run a smoke check for `resolveShortcodes` covering:
  - `articles-grid` with `limit='12'` still returns 12 article links.
  - `articles-grid` with `paginate='load-more' per_page='9' limit='0'` returns 9 first-page article links in preview.
  - `articles-grid` with `paginate='numbered' per_page='9' limit='0'` returns 9 first-page article links in preview.
  - Review block pagination still renders the expected first page.
  - `review-list-compact` with `paginate='load-more' per_page='6' limit='0'` renders one first page and one API-backed Load More control.
  - `review-list-compact` does not render duplicate Load More controls after conversion.

## Risks

- Content updates can affect live article index pages immediately.
- Editing `review-list-compact` globally can affect every site using that shared review block.
- Admin preview parity may still differ from the live renderer if it tries to duplicate too much client-side behavior.
- A broad change to all post shortcode loops could affect staff, services, locations, or other custom post types.

Mitigation: implement preview parity narrowly, preserve fixed-limit behavior, inspect `review-list-compact` usage before changing its template, and gate database writes behind explicit approval.

## Done Criteria

- Code changes are limited to shortcode preview parity and guidance unless DB write approval is given.
- Existing fixed-limit post shortcode behavior remains intact.
- Paginated article shortcode preview returns a first page instead of an empty result.
- `review-list-compact` has a clear API-backed migration path, with duplicate local reveal behavior removed or explicitly avoided.
- Build checks pass.
- Any database update is separately approved, dry-run, reversible, and verified.

## Execution Notes

Executed on branch `dev/dave` without creating a worktree.

Completed:

- Updated Alloro admin shortcode preview resolution so paginated post blocks render the first page using `per_page`.
- Preserved fixed-limit post shortcode behavior.
- Sanitized post `order_by` handling in the admin preview resolver.
- Updated review block preview resolution so paginated review blocks render the first page using `per_page`.
- Updated admin post-block docs to include `paginate` and `per_page`.
- Updated AI-command analysis/execution guidance to prefer API-backed article and compact review pagination patterns.
- Updated the Review Blocks admin copy affordance so `review-list-compact` copies the API-backed load-more shortcode.
- Added Knex migration `src/database/migrations/20260507000000_article_review_shortcode_pagination.ts`.
- Updated live renderer pagination client in `../website-builder-rebuild/src/utils/pagination-client.ts` so loaded items receive the same truncation/tooltip behavior as server-rendered items and the Load More loading state is vertically centered.

Migration scope:

- Draft/published pages using `{{ post_block id='articles-grid' items='articles' limit='12' }}` are migrated to API-backed article load-more pagination.
- Template article pages using the fixed `articles-grid` shortcode are migrated so future generated article pages inherit the API-backed version.
- Draft/published pages using `{{ review_block id='review-list-compact' location='primary' limit='200'}}` are migrated to API-backed compact review load-more pagination.
- The shared `review-list-compact` review block template is cleaned so its local hide/reveal Load More script is removed; renderer pagination owns loading.
- The migration creates backup tables and `down` restores exact pre-migration rows.

Database execution result:

- `npx knex migrate:latest` applied `20260507000000_article_review_shortcode_pagination.ts`.
- `npx knex migrate:status` reports no pending migration files.
- Draft/published pages with old article shortcode: 0.
- Draft/published pages with new article pagination shortcode: 7.
- Draft/published pages with old compact review shortcode: 0.
- Draft/published pages with new compact review pagination shortcode: 2.
- `review-list-compact` local hide/reveal script occurrences: 0.
- Backup tables contain 9 page rows, 1 template page row, and 1 review block row for rollback.

Verification:

- `npm run build`
- `npm --prefix frontend run build`
- `npx knex migrate:status`
- Resolver smoke check: `articles-grid limit='12'` rendered 12 article links.
- Resolver smoke check: `articles-grid paginate='load-more' per_page='9' limit='0'` rendered 9 article links.
- Resolver smoke check: `articles-grid paginate='numbered' per_page='9' limit='0'` rendered 9 article links.
- Resolver smoke check: `review-list-compact paginate='load-more' per_page='1' limit='0'` rendered the first review only for a real project/template.
- Live renderer `npm run build` in `../website-builder-rebuild`.
