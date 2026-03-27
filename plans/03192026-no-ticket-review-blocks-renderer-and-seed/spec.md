# Review Blocks: Published Site Renderer, location='all', and Dental Template Seed

## Why
The review block shortcode resolver only exists in the editor preview (signalsai-backend). Published sites (website-builder-rebuild) don't resolve `{{ review_block }}` at all — they'd render as raw text. Also, `location='all'` is needed to pool reviews across multiple locations, and the dental template needs default review block templates seeded.

## What
Three deliverables:
1. `resolveReviewBlocks` in website-builder-rebuild so published sites render review cards
2. `location='all'` support in both resolvers (backend + website-builder-rebuild)
3. Seed the "Alloro Dental Template" with 3 default review block templates

Done when: a `{{ review_block id='review-grid' location='all' min_rating='4' limit='10' }}` shortcode renders on both the editor preview AND the published site.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — Editor preview resolver. Already has `resolveReviewBlocks()`. Needs `location='all'` added.
- `website-builder-rebuild/src/services/menu.service.ts` — Published site menu resolver. Pattern to follow for the new review service.
- `website-builder-rebuild/src/services/postblock.service.ts` — Published site post block resolver. Pattern to follow.
- `website-builder-rebuild/src/utils/shortcodes.ts` — Shortcode parsers. Needs `ReviewBlockShortcode` parser added.
- `website-builder-rebuild/src/routes/site.ts` — Published site route. Needs `resolveReviewBlocks` wired in.
- `website-builder-rebuild/src/lib/db.ts` — DB connection with `search_path = website_builder, public`.

**Patterns to follow:**
- `menu.service.ts`: Redis caching, `getDb()`/`getRedis()`, shortcode parsing via utils, tree building, template rendering with loop markers
- `postblock.service.ts`: post block rendering with `{{start_post_loop}}`/`{{end_post_loop}}`
- `shortcodes.ts`: regex-based parser functions (`parseShortcodes`, `parseMenuShortcodes`)

**Key decisions:**
- `location='all'` queries reviews across all org locations with `WHERE location_id IN (...)`
- Default location behavior remains `primary` when `location` attr is omitted
- Review block seed uses template name lookup, not hardcoded UUID
- Seed creates 3 blocks: grid, carousel, compact list

## Constraints

**Must:**
- Follow website-builder-rebuild patterns exactly (`getDb()`, `getRedis()`, no `website_builder.` schema prefix)
- Support same tokens as backend resolver: `{{review.stars}}`, `{{review.stars_html}}`, `{{review.reviewer_name}}`, `{{review.reviewer_photo}}`, `{{review.text}}`, `{{review.date}}`, `{{review.is_anonymous}}`, `{{review.has_reply}}`, `{{review.reply_text}}`, `{{review.reply_date}}`
- Redis cache rendered review blocks (2 min TTL, same as post blocks)
- Seed must be idempotent (skip if blocks with same slugs already exist)

**Must not:**
- No modifications to existing post block or menu shortcode code
- No frontend changes
- No new npm dependencies

**Out of scope:**
- Frontend Review Blocks tab
- Review sync trigger button
- Admin UI for managing review blocks

## Risk

**Level:** 2

**Risks identified:**
- Seed depends on "Alloro Dental Template" existing by name → **Mitigation:** Lookup by name, log warning and skip if not found
- `location='all'` with 100+ limit across many locations could return large result sets → **Mitigation:** SQL LIMIT is enforced server-side, query uses existing indexes on `(location_id, stars)` and `(location_id, review_created_at)`

## Tasks

### T1: Add `location='all'` to backend shortcode resolver

**Do:** In `resolveReviewBlocks()` in `shortcodeResolver.service.ts`, change the location resolution:
- If `location='all'`: use all location IDs from the org → `WHERE location_id IN (...)`
- If `location='primary'` or omitted: existing behavior (find primary or first)
- If specific name: existing behavior (match by name/domain)

**Files:** `signalsai-backend/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Verify:** `npx tsc --noEmit` passes

### T2: Add review block shortcode parser to website-builder-rebuild

**Do:** In `shortcodes.ts`, add:
- `ReviewBlockShortcode` interface
- `parseReviewBlockShortcodes()` function
- `hasReviewBlockShortcodes()` function
- `renderReviewBlockHtml()` function (token replacement + star SVG generation)

**Files:** `website-builder-rebuild/src/utils/shortcodes.ts`
**Verify:** `npx tsc --noEmit` passes

### T3: Create review block service for website-builder-rebuild

**Do:** Create `review.service.ts` following `menu.service.ts` pattern:
- `fetchReviewBlock(templateId, slug)` — Redis cached (2 min TTL)
- `fetchReviews(locationIds, filters)` — Redis cached (2 min TTL), supports `minRating`, `limit`, `offset`, `order`
- `resolveReviewBlocks(html, projectId, templateId)` — main resolver
  - Parse shortcodes
  - Resolve project → org → locations
  - Support `location='all'` (all org locations), `location='primary'`, or specific name
  - Fetch review block template + reviews
  - Render through loop markers with token replacement
- `generateStarsHtml(count)` — filled/empty star SVGs

**Files:** `website-builder-rebuild/src/services/review.service.ts`
**Verify:** `npx tsc --noEmit` passes

### T4: Wire review block resolver into published site route

**Do:** In `site.ts`:
- Import `resolveReviewBlocks` from review service
- Call it in `assembleHtml()` between post blocks and menus
- Call it in `assembleSinglePostHtml()` between post blocks and menus
- Add `rb:*` to the `?nocache=1` flush patterns

**Files:** `website-builder-rebuild/src/routes/site.ts`
**Verify:** `npx tsc --noEmit` passes

### T5: Seed dental template with default review blocks

**Do:** Create a Knex migration that:
1. Looks up template by `name = 'Alloro Dental Template'` in `website_builder.templates`
2. If found, inserts 3 review blocks (skip if slug already exists):

**Review Grid** (`review-grid`):
- Responsive 3-column card grid
- Photo, name, stars, text, date
- Tailwind classes, dark-mode ready

**Review Carousel** (`review-carousel`):
- Horizontal scroll container
- Single-row cards with snap scrolling
- Photo, name, stars, text

**Compact Review List** (`review-list-compact`):
- Minimal vertical list
- Stars + name + text excerpt on one line
- Good for sidebars/footers

Each block uses `{{start_review_loop}}`/`{{end_review_loop}}` and all available tokens.

**Files:** `signalsai-backend/src/database/migrations/20260319000001_seed_dental_review_blocks.ts`
**Verify:** Migration runs clean (up and down)

## Done
- [ ] `npx tsc --noEmit` passes in both signalsai-backend and website-builder-rebuild
- [ ] `{{ review_block }}` shortcodes render on published sites (website-builder-rebuild)
- [ ] `location='all'` pools reviews across all org locations in both resolvers
- [ ] Dental template has 3 seeded review blocks
- [ ] `?nocache=1` flushes review block cache
- [ ] No regressions in existing post block or menu shortcode resolution
