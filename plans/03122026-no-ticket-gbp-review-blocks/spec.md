# GBP Review Blocks

## Why
Google Business Profile reviews are fetched live from the API today — too slow for public page rendering. We need a local review store with a sync mechanism and a shortcode-driven rendering system so users can design review card templates and embed dynamic review widgets on their websites.

## What
A `reviews` table synced from GBP, a `review_blocks` table for template-level rendering templates, a `{{ review_block }}` shortcode for page embedding, and a BullMQ worker for periodic sync. Done when: a review block shortcode on a published page renders review cards from locally stored data, including reviewer photos.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/gbp/gbp-services/review-handler.service.ts` — Current GBP review fetcher (live API, no storage). Maps `starRating`, `comment`, `reviewer.displayName`, `reviewer.isAnonymous`. Does NOT map `reviewer.profilePhotoUrl`.
- `signalsai-backend/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — Resolves `{{ post_block }}` and `{{ menu }}` shortcodes. New `{{ review_block }}` goes here.
- `signalsai-backend/src/models/website-builder/PostBlockModel.ts` — Model pattern to follow for `ReviewBlockModel`.
- `signalsai-backend/src/workers/worker.ts` — 6 existing BullMQ workers. New `review-sync` worker added here.
- `signalsai-backend/src/workers/queues.ts` — Queue factory (`getMindsQueue`).
- `signalsai-backend/src/models/GooglePropertyModel.ts` — Links `location_id` to GBP `external_id` + `account_id`.
- `signalsai-backend/src/models/LocationModel.ts` — Locations belong to `organization_id`.
- `signalsai-backend/src/models/website-builder/ProjectModel.ts` — Projects belong to `organization_id`.

**Patterns to follow:**
- Post block model/service pattern for review blocks (template-scoped, sections array)
- Shortcode pattern: regex parse → batch fetch blocks → fetch data → render with loop markers → wrap in marker div
- Worker pattern: BullMQ `Worker` class, `getMindsQueue()`, cron schedule, graceful shutdown

**Key decisions:**
- Path C (Hybrid): dedicated `reviews` table + `{{ review_block }}` shortcode
- Reviews stored per `location_id` (not per project — locations are the GBP anchor)
- Shortcode resolver joins `project → org → locations → reviews` at render time
- Reviewer photo URL stored as-is from Google API (refreshed on sync)
- Review blocks are template-scoped (same as post blocks)

## Constraints

**Must:**
- Follow existing model/service/shortcode patterns exactly
- Store `reviewer_photo_url` from `reviewer.profilePhotoUrl` in GBP response
- Use `review.name` (Google resource path) as unique key for upsert
- Sync worker must handle pagination (50/page) and rate limiting
- Shortcode must support: `id`, `location`, `min_rating`, `limit`, `offset`, `order`
- Review block templates must use `{{start_review_loop}}`/`{{end_review_loop}}` markers
- Redis cache on shortcode resolution (same TTL pattern as post blocks)

**Must not:**
- No new npm dependencies
- No modifications to existing post block or menu shortcode code
- No frontend admin UI in this spec
- No direct GBP API calls at page render time

**Out of scope:**
- Admin UI for review blocks / sync management
- Review reply/response functionality
- Sentiment analysis or AI-generated review summaries
- Multi-location aggregation (one location per shortcode invocation)
- Photo proxying/caching to S3 (v2 if Google URLs prove unreliable)

## Risk

**Level:** 2

**Risks identified:**
- Google reviewer photo URLs may expire over time → **Mitigation:** URLs refreshed on every sync. Shortcode template should use `onerror` fallback in `<img>` tags. Acceptable for v1.
- Project-to-location resolution adds joins at render time → **Mitigation:** Query is simple (project → org → locations), locations table is small, result is Redis-cached.
- Google review `name` format may vary → **Mitigation:** Store full `review.name` string as-is, no parsing needed for uniqueness.

## Tasks

### T1: Database — `reviews` and `review_blocks` tables

**Do:** Create migration for two new tables in `website_builder` schema.

`website_builder.reviews`:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| location_id | integer | FK → locations.id, NOT NULL |
| google_review_name | text | Unique — full Google resource path |
| stars | smallint | 1-5, NOT NULL |
| text | text | Nullable (some reviews have no text) |
| reviewer_name | text | Nullable |
| reviewer_photo_url | text | Nullable |
| is_anonymous | boolean | Default false |
| review_created_at | timestamptz | From Google `createTime` |
| has_reply | boolean | Default false |
| reply_text | text | Nullable |
| reply_date | timestamptz | Nullable |
| synced_at | timestamptz | Default now() |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

Indexes: `(location_id, stars)`, `(location_id, review_created_at DESC)`, unique on `google_review_name`.

`website_builder.review_blocks`:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| template_id | uuid | FK → website_builder.templates.id, NOT NULL |
| name | text | NOT NULL |
| slug | text | NOT NULL |
| description | text | Nullable |
| sections | jsonb | Array of { name, content } |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

Unique constraint: `(template_id, slug)`.

**Files:** `migrations/mssql.sql`, `migrations/pgsql.sql`, `migrations/knexmigration.js`
**Verify:** Migration runs clean against local PostgreSQL.

### T2: Models — `ReviewModel` and `ReviewBlockModel`

**Do:** Create two models following `PostBlockModel` pattern.

`ReviewModel`:
- `findByLocationId(locationId, filters?)` — supports `minRating`, `limit`, `offset`, `order`
- `upsertByGoogleName(data)` — insert or update on `google_review_name` conflict
- `findById(id)`
- `deleteByLocationId(locationId)`

`ReviewBlockModel`:
- `findByTemplateId(templateId)`
- `findByTemplateAndSlug(templateId, slug)`
- `findById(id)`
- `create(data)`
- `updateById(id, data)`
- `deleteById(id)`

**Files:** `signalsai-backend/src/models/website-builder/ReviewModel.ts`, `signalsai-backend/src/models/website-builder/ReviewBlockModel.ts`
**Verify:** TypeScript compiles clean.

### T3: Sync Service + Worker — `reviewSync.processor.ts`

**Do:** Create a BullMQ processor that:
1. Queries all `google_properties` where `type = 'gbp'` and `selected = true`
2. For each property, fetches ALL reviews from GBP API (no date filter — full sync)
3. Maps each review including `reviewer.profilePhotoUrl`
4. Upserts into `reviews` table via `ReviewModel.upsertByGoogleName()`
5. Rate limits: 5 locations/batch, 1s delay between batches

Register in `worker.ts` as `minds-review-sync` worker. Schedule daily at 4 AM UTC. Also support manual trigger via queue job.

Update `review-handler.service.ts` to also map `reviewer.profilePhotoUrl` in its response (for consistency, even though the existing live endpoint isn't changing).

**Files:**
- `signalsai-backend/src/workers/processors/reviewSync.processor.ts`
- `signalsai-backend/src/workers/worker.ts` (add worker + schedule)
- `signalsai-backend/src/controllers/gbp/gbp-services/review-handler.service.ts` (add photo mapping)

**Verify:** `npx tsc --noEmit` passes. Manual queue job trigger syncs reviews to DB.

### T4: Review Block CRUD Service + Routes

**Do:** Create `service.review-block-manager.ts` following `service.post-block-manager.ts` pattern. CRUD operations with slug auto-generation, validation.

API endpoints (nested under templates, same as post blocks):
```
GET    /templates/:templateId/review-blocks
POST   /templates/:templateId/review-blocks
GET    /templates/:templateId/review-blocks/:reviewBlockId
PATCH  /templates/:templateId/review-blocks/:reviewBlockId
DELETE /templates/:templateId/review-blocks/:reviewBlockId
```

Also add a manual sync trigger endpoint:
```
POST   /reviews/sync
```
(Enqueues a `review-sync` job. Org-scoped — syncs all locations for the authenticated user's org.)

**Files:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.review-block-manager.ts`
- `signalsai-backend/src/routes/admin/websites.ts` (add routes)

**Verify:** `npx tsc --noEmit` passes. cURL test: create review block, fetch it back.

### T5: Shortcode Resolver — `{{ review_block }}`

**Do:** Add `resolveReviewBlocks()` to `shortcodeResolver.service.ts`. Pattern:

Shortcode format:
```
{{ review_block id='testimonials' location='primary' min_rating='4' limit='6' order='desc' }}
```

Attributes:
- `id` — review block slug (required)
- `location` — location slug/identifier, or `'primary'` for the org's primary location (required)
- `min_rating` — minimum stars filter (default: 1)
- `limit` — max reviews (default: 10)
- `offset` — pagination offset (default: 0)
- `order` — `asc` or `desc` by `review_created_at` (default: desc)

Resolution:
1. Parse shortcode attributes
2. Fetch review block by `templateId` + slug
3. Resolve location: `project.organization_id → locations` (use primary if `location='primary'`, else match by location name/domain)
4. Query `reviews` table via `ReviewModel.findByLocationId()` with filters
5. Render template using loop markers and tokens:
   - `{{review.stars}}` — numeric 1-5
   - `{{review.stars_html}}` — pre-rendered star SVGs (filled/empty)
   - `{{review.text}}` — review text (escaped)
   - `{{review.reviewer_name}}` — name (escaped)
   - `{{review.reviewer_photo}}` — photo URL
   - `{{review.is_anonymous}}` — boolean
   - `{{review.date}}` — formatted date
   - `{{review.has_reply}}` — boolean
   - `{{review.reply_text}}` — reply text (escaped)
   - `{{review.reply_date}}` — formatted date
6. Wrap in marker div (same pattern as post blocks)
7. Cache resolved HTML in Redis: key `rb:{templateId}:{blockSlug}:{locationId}:{hash(filters)}`, TTL 2 min

Wire into `resolveShortcodes()` main entry point between post blocks and menus.

**Files:** `signalsai-backend/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Verify:** `npx tsc --noEmit` passes. Manual test: insert a review block shortcode into a page section, verify it renders review cards.

## Done
- [ ] `npx tsc --noEmit` passes with zero errors from new code
- [ ] Migration runs clean (up and down)
- [ ] Review sync worker fetches reviews from GBP and stores them locally (including `reviewer_photo_url`)
- [ ] Review block CRUD endpoints respond correctly
- [ ] `{{ review_block }}` shortcode renders review cards on a published page
- [ ] Redis caching works — second page load serves cached HTML
- [ ] No regressions in existing post block or menu shortcode resolution
