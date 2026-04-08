# Dynamic Post Block Pagination

## Why
Post blocks currently render all matching posts in a single server-side pass with a hard `limit`. DentalEMR has 83 articles — showing all at once is a bad UX. There's no way to paginate, load more, or scroll through posts. This blocks any site with a non-trivial number of posts from having a usable articles/blog page.

## What
Add dynamic client-side pagination to the `{{ post_block }}` shortcode with three modes:
1. **Load More** (default) — "Load More" button appends next batch
2. **Numbered** — Page 1, 2, 3... with Next/Prev, URL persistence (`?page=2`)
3. **Infinite Scroll** — Auto-loads next batch when user scrolls near bottom

The shortcode gets new attributes. The site renderer injects a small client-side JS snippet. A new public API endpoint serves paginated post data.

## Context

**Relevant files:**

*Site Renderer (~/Desktop/website-builder-rebuild):*
- `src/services/postblock.service.ts` — Fetches posts, resolves `{{ post_block }}` shortcodes. Currently renders all posts server-side in one pass. **This is the main file to modify.**
- `src/utils/shortcodes.ts` — Parses shortcode attributes, renders `{{post.*}}` tokens into HTML template
- `src/routes/site.ts` — Main site routing. Calls `resolvePostBlocks()` during page assembly. Also handles single post pages at `/{type-slug}/{post-slug}`.

*Alloro Admin Backend (~/Desktop/alloro):*
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — Editor-side shortcode resolver (mirror of site renderer's). Wraps output in marker divs for editor save/restore. Needs parallel changes.

**Patterns to follow:**
- Shortcode attribute parsing already exists in `shortcodes.ts` — new attrs follow the same `key='value'` pattern
- Redis caching pattern in `postblock.service.ts` (2-5 min TTL) — paginated queries should follow the same pattern
- The site renderer is a plain Express app serving HTML — injected JS must be vanilla (no React, no build step)

**Reference file:** `postblock.service.ts` — the post block resolution service is the closest analog for structure

## Constraints

**Must:**
- Default behavior unchanged — existing shortcodes without `paginate` attr render exactly as today (no breaking change)
- Pagination JS must be vanilla — no framework dependencies, no build step
- Numbered pagination must persist to URL via `?page=N` query param so links are shareable/bookmarkable
- Public API must be read-only and scoped to published posts only
- First page is always server-rendered (SSR) for SEO — subsequent pages load via client-side fetch
- The load-more / pagination controls must be unstyled by default (just functional HTML) but overridable via CSS classes
- Must work with all existing shortcode filters (cats, tags, ids, exc_ids, order, order_by)

**Must not:**
- No new npm dependencies in site renderer
- No changes to the database schema
- Don't touch single post page rendering (`assembleSinglePostHtml`)
- Don't modify admin frontend React components (editor UI changes are out of scope)

**Out of scope:**
- Admin UI for configuring pagination mode (users set it via shortcode attributes for now)
- Category/tag filtering UI on the frontend
- Search within posts
- Editor preview of paginated post blocks (editor will continue to show first page only)

## Risk

**Level:** 2

**Risks identified:**
- **Public API exposure** → **Mitigation:** Read-only, published posts only, rate-limited, no sensitive data. Scope by project hostname/domain (not raw project ID).
- **SEO impact of client-side pagination** → **Mitigation:** First page is always SSR. Numbered mode uses `?page=N` which search engines can follow. Load-more and infinite scroll are progressive enhancement.
- **Redis cache coherence** — paginated queries create more cache keys → **Mitigation:** Same TTL pattern (2 min), same invalidation. Cache key includes page number.
- **Breaking existing sites** → **Mitigation:** `paginate` defaults to `'none'` (current behavior). No change unless attribute is explicitly set.

**Blast radius:**
- `postblock.service.ts` (site renderer) — all sites using `{{ post_block }}`
- `shortcodes.ts` (site renderer) — attribute parsing used by all shortcode types
- `shortcodeResolver.service.ts` (Alloro admin) — editor preview for all sites

**Pushback:**
- None. This is a natural evolution of the post block system. The current "render everything" approach doesn't scale.

## Tasks

### T1: Public Posts API Endpoint (Site Renderer)
**Do:**
- Add `GET /api/posts/:projectHostname/:postTypeSlug` to the site renderer
- Accepts query params: `page` (default 1), `per_page` (default from shortcode, max 50), `cats`, `tags`, `ids`, `exc_ids`, `order`, `order_by`
- Resolves project by hostname or custom domain (reuse existing `getProjectByHostname` / `getProjectByCustomDomain`)
- Returns JSON: `{ posts: PostRow[], total: number, page: number, per_page: number, total_pages: number }`
- Each post includes rendered HTML fragment (using the post block template) so the client just appends HTML
- Redis cached (same 2-min TTL pattern)
- Rate limit: 30 req/min per IP (simple in-memory or Redis counter)
**Files:** `site-renderer/src/routes/api.ts` (new), `site-renderer/src/routes/site.ts` (register route)
**Depends on:** none
**Verify:** `curl localhost:7777/api/posts/{hostname}/articles?page=1&per_page=6` returns JSON with posts

### T2: Extend Shortcode Attributes
**Do:**
- Add new attributes to the shortcode parser in `shortcodes.ts`:
  - `paginate` — `'none'` (default) | `'load-more'` | `'numbered'` | `'infinite'`
  - `per_page` — posts per page (default: value of `limit`, or 9)
- Update `PostBlockShortcode` interface in both site renderer and Alloro admin
- The `limit` attribute continues to work for non-paginated blocks. When `paginate` is set, `per_page` controls page size and `limit` becomes the total cap (0 = unlimited)
**Files:** `site-renderer/src/utils/shortcodes.ts`, `alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Depends on:** none
**Verify:** `{{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' }}` parses correctly

### T3: Server-Side First Page + Pagination Shell
**Do:**
- Modify `resolvePostBlocks()` in `postblock.service.ts` to:
  - When `paginate !== 'none'`: render only first `per_page` posts (SSR for SEO)
  - Fetch total count alongside first page (`COUNT(*) OVER()` or separate count query)
  - Wrap the rendered post grid in a container div with data attributes:
    ```html
    <div data-alloro-paginated="true"
         data-paginate-mode="load-more|numbered|infinite"
         data-post-type="articles"
         data-per-page="9"
         data-total-posts="83"
         data-total-pages="10"
         data-current-page="1"
         data-filters="cats=...,tags=...,order=desc,order_by=published_at"
         data-block-template="BASE64_ENCODED_TEMPLATE"
         data-api-base="/api/posts/{hostname}/articles">
      <!-- SSR rendered first page posts here -->
    </div>
    ```
  - After the container, inject the pagination controls HTML (unstyled):
    - Load More: `<button data-alloro-load-more>Load More</button>`
    - Numbered: `<nav data-alloro-pagination>` with page links
    - Infinite: no visible control (JS handles scroll detection)
  - Inject the pagination JS snippet (once per page, not per block) before `</body>`
**Files:** `site-renderer/src/services/postblock.service.ts`
**Depends on:** T1, T2
**Verify:** View source of articles page shows SSR posts wrapped in data-attributed container + pagination controls

### T4: Client-Side Pagination JS
**Do:**
- Create a self-contained vanilla JS snippet (~100-150 lines) that:
  - Auto-discovers all `[data-alloro-paginated]` containers on the page
  - For each container, reads its data attributes
  - **Load More mode:**
    - On button click: fetch next page from API, append post HTML to grid, update button state
    - Hide button when all pages loaded
  - **Numbered mode:**
    - Render page numbers (1, 2, 3... with ellipsis for large sets) + Prev/Next
    - On click: fetch page, replace grid content, update URL to `?page=N` via `history.pushState`
    - On initial load: read `?page=N` from URL, fetch that page if > 1
    - Respect back/forward via `popstate` event
  - **Infinite Scroll mode:**
    - Use `IntersectionObserver` on a sentinel div after the grid
    - When sentinel enters viewport: fetch next page, append
    - Stop when all pages loaded
  - Shows a simple loading spinner during fetch (CSS-only, inline)
  - Handles errors gracefully (shows "Failed to load" message, retry button)
- The JS renders post HTML client-side using the template from `data-block-template` and the JSON response from T1. Alternative: API returns pre-rendered HTML fragments (simpler, avoids client-side template rendering).
**Files:** `site-renderer/src/utils/pagination-client.ts` (new, outputs a string of `<script>` tag)
**Depends on:** T1, T3
**Verify:** All three modes work on a test page with 83 articles

### T5: Mirror Shortcode Attribute Changes in Alloro Admin
**Do:**
- Update `shortcodeResolver.service.ts` in Alloro admin to recognize `paginate` and `per_page` attributes
- In editor preview: ignore pagination (always render first page, same as current behavior)
- Ensure the new attributes survive the save/restore cycle (shortcode → rendered → shortcode round-trip)
**Files:** `alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Depends on:** T2
**Verify:** Add `paginate='load-more'` to a shortcode in the editor, save, reload — attribute persists

### T6: Public Reviews API Endpoint (Site Renderer)
**Do:**
- Add `GET /api/reviews/:projectHostname` to the site renderer API routes (same file as T1)
- Accepts query params: `page` (default 1), `per_page` (default from shortcode, max 50), `location` (`'all'` | `'primary'` | location name/domain), `min_rating` (default 1), `order` (default `'desc'`)
- Resolves project by hostname → organization → locations (reuse existing pattern from `review.service.ts`)
- Returns JSON: `{ reviews: ReviewRow[], total: number, page: number, per_page: number, total_pages: number }`
- Each review includes rendered HTML fragment (using the review block template) for client-side append
- Redis cached (same 2-min TTL pattern)
**Files:** `site-renderer/src/routes/api.ts` (extend from T1)
**Depends on:** T1
**Verify:** `curl localhost:7777/api/reviews/{hostname}?page=1&per_page=6&min_rating=4` returns JSON with reviews

### T7: Extend Review Block Shortcode Attributes
**Do:**
- Add `paginate` and `per_page` attributes to `ReviewBlockShortcode` interface in `shortcodes.ts`
- Update `parseReviewBlockShortcodes()` to extract these new attributes
- Same semantics as post blocks: `paginate='none'` (default) | `'load-more'` | `'numbered'` | `'infinite'`
- Mirror in Alloro admin's `shortcodeResolver.service.ts` (editor ignores pagination, same as T5)
**Files:** `site-renderer/src/utils/shortcodes.ts`, `alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Depends on:** T2
**Verify:** `{{ review_block id='reviews-grid' paginate='load-more' per_page='6' }}` parses correctly

### T8: Server-Side First Page + Pagination Shell for Reviews
**Do:**
- Modify `resolveReviewBlocks()` in `review.service.ts` to:
  - When `paginate !== 'none'`: render only first `per_page` reviews (SSR)
  - Fetch total count alongside first page
  - Wrap rendered reviews in a container div with data attributes (same pattern as T3):
    ```html
    <div data-alloro-paginated="true"
         data-paginate-type="review"
         data-paginate-mode="load-more|numbered|infinite"
         data-per-page="6"
         data-total-items="150"
         data-total-pages="25"
         data-current-page="1"
         data-filters="location=all,min_rating=4,order=desc"
         data-block-template="BASE64_ENCODED_TEMPLATE"
         data-api-base="/api/reviews/{hostname}">
      <!-- SSR rendered first page reviews here -->
    </div>
    ```
  - Inject pagination controls (same HTML patterns as T3 — the client JS from T4 handles both types via `data-paginate-type`)
- The client-side JS from T4 already auto-discovers all `[data-alloro-paginated]` containers, so it works for both posts and reviews without additional JS — just uses `data-paginate-type` to hit the correct API endpoint
**Files:** `site-renderer/src/services/review.service.ts`
**Depends on:** T4, T6, T7
**Verify:** Review block with `paginate='load-more'` renders first page SSR with load more button, clicking loads next batch

## Done
- [ ] `{{ post_block }}` without `paginate` renders exactly as before (no regression)
- [ ] `{{ review_block }}` without `paginate` renders exactly as before (no regression)
- [ ] Load More mode: works for both posts and reviews
- [ ] Numbered mode: page links work, URL updates to `?page=N`, back/forward work, direct URL `?page=3` loads page 3
- [ ] Infinite Scroll mode: posts/reviews auto-load on scroll, stop at end
- [ ] First page is SSR for both post blocks and review blocks (view source shows HTML)
- [ ] Public posts API and reviews API return correct paginated data, read-only, published only
- [ ] Editor preview shows first page without pagination controls for both types
- [ ] All existing filters work with pagination (cats/tags/order for posts, location/min_rating/order for reviews)
- [ ] No new npm dependencies
- [ ] No database schema changes
