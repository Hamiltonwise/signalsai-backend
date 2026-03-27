# Alloro Posts & Post Blocks

## Problem Statement

The website builder currently renders only static HTML baked at generation time by N8N. There is no way to create, manage, or render dynamic content (blog posts, reviews, testimonials, case studies, etc.) that lives independently of page HTML. Users need a WordPress-like post system where post data is decoupled from page layout, and reusable "post blocks" define how posts are rendered on any page via shortcodes.

## Context Summary

### Current Architecture
- **website-builder-rebuild**: Stateless Express HTML assembler. Only token: `{{slot}}` in wrapper. Zero runtime processing, zero caching, zero Redis.
- **alloro-app backend**: Templates = `wrapper` + `header` + `footer` + `template_pages[]` (each with `sections[]` JSONB). All dynamic content baked by N8N into static HTML at generation time.
- **Data flow**: Request → subdomain middleware → project lookup → page lookup → `assembleHtml()` → `renderPage()` → `{{slot}}` replacement → HFCM injection → form script injection → response.
- **Schema**: All website-builder tables in `website_builder` PostgreSQL schema. UUIDs for PKs. JSONB for flexible data. `created_at`/`updated_at` timestamps on every table.
- **S3**: `@aws-sdk/client-s3`, multer memory storage, Sharp for image processing (WebP conversion + thumbnails). Key pattern: `uploads/{projectId}/{uuid}-{filename}.webp`.
- **Redis**: Already in use for BullMQ workers via ioredis. Connection: `REDIS_HOST` + `REDIS_PORT` env vars.
- **Admin UI**: React + TypeScript, custom `DesignSystem` components (`TabBar`, `ActionButton`, `AdminPageHeader`, etc.), Monaco editor for HTML, framer-motion animations, raw `fetch` for admin API calls.

### Key Decisions (from context-building)
1. **Runtime resolution** of `{{ post_block }}` shortcodes in website-builder-rebuild
2. Post types defined per-template, posts created per-project
3. Full taxonomy system (categories + tags tables with junction tables)
4. Redis caching with invalidation keys shared between services
5. Post blocks queried via `template_id` FK at runtime (no denormalization)
6. `featured_image` as column on posts table (S3 URL), `attachments` as join table
7. Invalid shortcode syntax renders raw token visible to everyone

## Existing Patterns to Follow

- **Migration naming**: `YYYYMMDDHHMMSS_verb_noun_description.ts`, `website_builder` schema, `knex.raw()` for DDL
- **Model pattern**: `BaseModel` subclass with static methods, `tableName`, `jsonFields`
- **Service pattern**: Feature service functions returning `{ data, error? }` with structured error objects `{ status, code, message }`
- **Controller pattern**: Thin exports consuming service functions, mounted in route files
- **API pattern (frontend)**: Raw `fetch`, `const API_BASE = "/api/admin/..."`, typed interfaces co-located, throw on error
- **Page pattern**: `useState` for data/loading/error, `useCallback` load function, `useEffect` trigger, `window.dispatchEvent` for navigation loading indicator
- **Tab pattern**: `TabBar` with `activeTab` state, conditional rendering per tab
- **CRUD pattern**: List page with filter + cards + create button → Detail page with tabs + inline editing

## Proposed Approach

### Part 1 — Database Schema (8 new tables)

All tables in `website_builder` schema.

#### 1.1 `post_types`
```sql
CREATE TABLE website_builder.post_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, slug)
);
CREATE INDEX idx_post_types_template_id ON website_builder.post_types(template_id);
```

`schema` JSONB defines custom fields beyond the default post properties. For v1, we use the strict default schema only:
- `title` (string, required)
- `slug` (string, auto-generated)
- `content` (HTML text)
- `excerpt` (string)
- `featured_image` (S3 URL)
- `status` (draft/published)

Custom fields via `schema` JSONB is a future extension point — the column exists but is not used in v1.

#### 1.2 `post_categories`
```sql
CREATE TABLE website_builder.post_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES website_builder.post_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_type_id, slug)
);
CREATE INDEX idx_post_categories_post_type_id ON website_builder.post_categories(post_type_id);
CREATE INDEX idx_post_categories_parent_id ON website_builder.post_categories(parent_id);
```

`parent_id` enables hierarchical categories (like WordPress). Nullable for top-level categories.

#### 1.3 `post_tags`
```sql
CREATE TABLE website_builder.post_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_type_id, slug)
);
CREATE INDEX idx_post_tags_post_type_id ON website_builder.post_tags(post_type_id);
```

#### 1.4 `posts`
```sql
CREATE TABLE website_builder.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  excerpt VARCHAR(1000),
  featured_image TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, post_type_id, slug)
);
CREATE INDEX idx_posts_project_id ON website_builder.posts(project_id);
CREATE INDEX idx_posts_post_type_id ON website_builder.posts(post_type_id);
CREATE INDEX idx_posts_status ON website_builder.posts(status);
CREATE INDEX idx_posts_project_type_status ON website_builder.posts(project_id, post_type_id, status);
```

#### 1.5 `post_category_assignments`
```sql
CREATE TABLE website_builder.post_category_assignments (
  post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES website_builder.post_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);
CREATE INDEX idx_post_cat_assign_category ON website_builder.post_category_assignments(category_id);
```

#### 1.6 `post_tag_assignments`
```sql
CREATE TABLE website_builder.post_tag_assignments (
  post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES website_builder.post_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX idx_post_tag_assign_tag ON website_builder.post_tag_assignments(tag_id);
```

#### 1.7 `post_attachments`
```sql
CREATE TABLE website_builder.post_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES website_builder.posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_post_attachments_post_id ON website_builder.post_attachments(post_id);
```

#### 1.8 `post_blocks`
```sql
CREATE TABLE website_builder.post_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
  post_type_id UUID NOT NULL REFERENCES website_builder.post_types(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  sections JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, slug)
);
CREATE INDEX idx_post_blocks_template_id ON website_builder.post_blocks(template_id);
CREATE INDEX idx_post_blocks_post_type_id ON website_builder.post_blocks(post_type_id);
```

`sections` JSONB follows the same `{ name: string, content: string }[]` pattern as template pages. The `content` contains HTML with `{{post.title}}`, `{{post.content}}`, etc. tokens that get replaced with actual post data at render time.

`post_type_id` links the block to a specific post type so we know what data schema to expect.

---

### Part 2 — Post Data Token System

Post block HTML uses `{{post.<field>}}` tokens for data interpolation. These are processed at render time inside website-builder-rebuild.

#### 2.1 Strict Token Schema (v1)

| Token | Type | Description |
|---|---|---|
| `{{post.title}}` | string | Post title |
| `{{post.slug}}` | string | Post slug |
| `{{post.content}}` | HTML | Post content (raw HTML) |
| `{{post.excerpt}}` | string | Post excerpt (plain text) |
| `{{post.featured_image}}` | URL | S3 URL of featured image |
| `{{post.categories}}` | string | Comma-separated category names |
| `{{post.tags}}` | string | Comma-separated tag names |
| `{{post.created_at}}` | string | Formatted date (e.g., "March 5, 2026") |
| `{{post.updated_at}}` | string | Formatted date |
| `{{post.published_at}}` | string | Formatted date |

#### 2.2 Processing Order (Critical)

1. Scan page HTML for `{{ post_block ... }}` shortcodes (page-level scan)
2. Parse shortcode attributes
3. Batch-fetch post blocks by slug from template (via project's `template_id`)
4. Batch-fetch posts by post type slug with filters (categories, tags, ids, exclusions)
5. For each shortcode:
   a. Get the post block's `sections` HTML
   b. Concatenate sections into a single HTML string
   c. For each matching post: clone the block HTML, replace `{{post.*}}` tokens with post data
   d. Concatenate all rendered iterations
   e. Replace the original `{{ post_block ... }}` shortcode with the rendered HTML
6. Continue with normal `renderPage()` flow (HFCM injection, form script, etc.)

This happens **after** `{{slot}}` replacement and section assembly, but **before** HFCM/form injection.

#### 2.3 Escaping

- `{{post.content}}` is injected as raw HTML (it's authored by admins, trusted)
- `{{post.title}}`, `{{post.excerpt}}`, and all other string tokens are HTML-escaped before injection
- If a post's content contains literal `{{post.` strings, they are NOT processed (post data tokens are only resolved inside post block section HTML, not inside post content values)

---

### Part 3 — Shortcode Parser (website-builder-rebuild)

#### 3.1 Shortcode Syntax (Final)

```
{{ post_block id='<post-block-slug>' items='<post-type-slug>' [tags='t1,t2'] [cats='c1,c2'] [ids='slug1,slug2'] [exc_ids='slug3'] [order='asc|desc'] [order_by='created_at|title|sort_order|published_at'] [limit='10'] [offset='0'] }}
```

Rules:
- Delimiter: `{{` and `}}` with optional whitespace inside
- Attribute values: single-quoted only
- No nesting
- No multiline (entire shortcode must be on one line or whitespace-collapsed)
- Unknown attributes are silently ignored

#### 3.2 Defaults

| Attribute | Default | Notes |
|---|---|---|
| `order` | `asc` | `asc` or `desc` |
| `order_by` | `created_at` | One of: `created_at`, `title`, `sort_order`, `published_at` |
| `limit` | `10` | Max posts to render. `0` = unlimited |
| `offset` | `0` | Skip N posts |

#### 3.3 Parser Implementation

New file: `website-builder-rebuild/src/utils/shortcodes.ts`

```typescript
interface PostBlockShortcode {
  raw: string;              // full matched string for replacement
  id: string;               // post block slug
  items: string;            // post type slug
  tags?: string[];
  cats?: string[];
  ids?: string[];
  exc_ids?: string[];
  order: 'asc' | 'desc';
  order_by: 'created_at' | 'title' | 'sort_order' | 'published_at';
  limit: number;
  offset: number;
}

function parseShortcodes(html: string): PostBlockShortcode[]
function renderPostBlock(blockHtml: string, post: PostData): string
function escapeHtml(str: string): string
```

Regex pattern: `/\{\{\s*post_block\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g`

Invalid syntax (malformed attributes, missing required `id` or `items`): leave the raw token in the HTML as-is.

---

### Part 4 — Redis Caching Layer (website-builder-rebuild)

#### 4.1 Add Redis to website-builder-rebuild

New dependency: `ioredis`

New file: `website-builder-rebuild/src/lib/redis.ts`

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

export default redis;
```

Same env vars as alloro-app backend — shared Redis instance.

#### 4.2 Cache Keys

| Key Pattern | Value | TTL |
|---|---|---|
| `pb:{template_id}:{block_slug}` | Post block data (JSON) | 5 min |
| `posts:{project_id}:{post_type_slug}:{hash}` | Query result (JSON) | 2 min |

`{hash}` is a deterministic hash of the filter params (tags, cats, ids, exc_ids, order, order_by, limit, offset) to differentiate cached query results.

#### 4.3 Cache Invalidation

alloro-app backend writes invalidation signals to Redis on post/post-block mutations:

```typescript
// On post create/update/delete:
await redis.del(`posts:${projectId}:*`);  // or use SCAN + DEL for pattern

// On post block create/update/delete:
await redis.del(`pb:${templateId}:${blockSlug}`);
```

Pattern-based deletion using `SCAN` to find matching keys, then `DEL` batch. No `KEYS` command (production-safe).

---

### Part 5 — Renderer Integration (website-builder-rebuild)

#### 5.1 Modified Render Pipeline

Current `renderPage()` flow:
1. Normalize sections
2. Filter hidden sections
3. Strip form artifacts + hidden elements
4. Assemble header + sections + footer
5. Replace `{{slot}}`
6. Inject HFCM
7. Inject form script

New flow (changes in **bold**):
1. Normalize sections
2. Filter hidden sections
3. Strip form artifacts + hidden elements
4. Assemble header + sections + footer
5. Replace `{{slot}}`
6. **Scan for `{{ post_block }}` shortcodes**
7. **If shortcodes found: batch-fetch post blocks + posts, render, replace**
8. Inject HFCM
9. Inject form script

#### 5.2 New Service File

`website-builder-rebuild/src/services/postblock.service.ts`

Functions:
- `resolvePostBlocks(html: string, templateId: string, projectId: string): Promise<string>` — orchestrates the full scan → fetch → render → replace cycle
- `fetchPostBlock(templateId: string, slug: string): Promise<PostBlock | null>` — DB query with Redis cache
- `fetchPosts(projectId: string, postTypeSlug: string, filters: PostFilters): Promise<Post[]>` — DB query with Redis cache
- `renderPostBlockHtml(blockSections: Section[], posts: Post[]): string` — iterates posts through block HTML

#### 5.3 DB Queries (New)

The renderer will need to query:
- `website_builder.post_blocks` (joined with `post_types` for slug resolution)
- `website_builder.posts` (with joins to categories/tags for filtering)

These are read-only queries. The renderer never writes.

---

### Part 6 — Backend API (alloro-app)

#### 6.1 New Service Files

All in `signalsai-backend/src/controllers/admin-websites/feature-services/`:

- `service.post-type-manager.ts` — CRUD for post types per template
- `service.post-manager.ts` — CRUD for posts per project (with taxonomy)
- `service.post-block-manager.ts` — CRUD for post blocks per template
- `service.post-taxonomy-manager.ts` — CRUD for categories and tags per post type

#### 6.2 New Model Files

All in `signalsai-backend/src/models/website-builder/`:

- `PostTypeModel.ts`
- `PostModel.ts`
- `PostCategoryModel.ts`
- `PostTagModel.ts`
- `PostBlockModel.ts`
- `PostAttachmentModel.ts`

#### 6.3 API Routes

Mounted under existing `/api/admin/websites` router.

**Post Types (per template):**
```
GET    /templates/:templateId/post-types
POST   /templates/:templateId/post-types
GET    /templates/:templateId/post-types/:postTypeId
PATCH  /templates/:templateId/post-types/:postTypeId
DELETE /templates/:templateId/post-types/:postTypeId
```

**Post Blocks (per template):**
```
GET    /templates/:templateId/post-blocks
POST   /templates/:templateId/post-blocks
GET    /templates/:templateId/post-blocks/:postBlockId
PATCH  /templates/:templateId/post-blocks/:postBlockId
DELETE /templates/:templateId/post-blocks/:postBlockId
```

**Taxonomy (per post type):**
```
GET    /post-types/:postTypeId/categories
POST   /post-types/:postTypeId/categories
PATCH  /post-types/:postTypeId/categories/:categoryId
DELETE /post-types/:postTypeId/categories/:categoryId

GET    /post-types/:postTypeId/tags
POST   /post-types/:postTypeId/tags
PATCH  /post-types/:postTypeId/tags/:tagId
DELETE /post-types/:postTypeId/tags/:tagId
```

**Posts (per project):**
```
GET    /projects/:projectId/posts
POST   /projects/:projectId/posts
GET    /projects/:projectId/posts/:postId
PATCH  /projects/:projectId/posts/:postId
DELETE /projects/:projectId/posts/:postId
POST   /projects/:projectId/posts/:postId/attachments    (multer upload)
DELETE /projects/:projectId/posts/:postId/attachments/:attachmentId
```

#### 6.4 Cache Invalidation Hooks

Every post/post-block mutation endpoint calls Redis invalidation after successful DB write:

```typescript
// In service.post-manager.ts
import { getRedisConnection } from '../../../workers/queues';

async function invalidatePostCache(projectId: string, postTypeSlug: string) {
  const redis = getRedisConnection();
  const pattern = `posts:${projectId}:${postTypeSlug}:*`;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}
```

---

### Part 7 — Frontend Admin UI (alloro-app)

#### 7.1 New Files

**Pages:**
- `signalsai/src/pages/Admin/PostTypesList.tsx` — list post types across templates (or per-template tab)
- `signalsai/src/pages/Admin/PostBlockEditor.tsx` — post block section editor (Monaco + iframe preview, like template page editor)

**Components:**
- `signalsai/src/components/Posts/PostsList.tsx` — list posts for a project, filterable by type/category/tag/status
- `signalsai/src/components/Posts/PostEditor.tsx` — create/edit a single post (title, slug, content, excerpt, featured image, categories, tags, attachments)
- `signalsai/src/components/Posts/TaxonomyManager.tsx` — manage categories and tags for a post type (inline CRUD)

**API:**
- `signalsai/src/api/posts.ts` — all post, post type, post block, taxonomy API functions

#### 7.2 Integration Points

**TemplateDetail.tsx** — Add a 5th tab: **"Post Blocks"**
- Lists post types for this template
- For each post type, lists post blocks
- Create/edit post blocks opens `PostBlockEditor` (Monaco + preview, same pattern as template pages tab)
- Post block preview renders with placeholder post data

**WebsiteDetail.tsx** — Add a new tab: **"Posts"**
- Lists posts for this project, grouped or filterable by post type
- Create/edit posts opens inline `PostEditor`
- Post type dropdown sourced from the project's template's post types

#### 7.3 Post Block Editor UX

The post block editor reuses the template page editing pattern:
1. Left panel: Monaco editor showing sections as JS array (same `serializeSectionsJs` / `parseSectionsJs`)
2. Right panel: iframe preview rendered via `renderPage()` with template wrapper/header/footer + post block sections
3. Preview uses **placeholder data** — a mock post object with sample values for all `{{post.*}}` tokens
4. The editor shows available tokens as a reference sidebar or tooltip

#### 7.4 Post Editor UX

Simple form-based editor (no Monaco, no iframe):
- Title input (auto-generates slug, editable)
- Rich text content area (could use Monaco with HTML mode, or a simple textarea for v1)
- Excerpt textarea
- Featured image upload (reuse existing media upload pattern — multer → Sharp → S3)
- Category multi-select (from post type's categories)
- Tag multi-select (with inline create)
- Attachments upload area (drag-and-drop, reuse media upload)
- Status toggle (draft/published)
- Save button

---

### Part 8 — Documentation Page

Create a user-facing documentation page at `/documentation/alloro-posts` explaining how to use the posts and post blocks feature.

The documentation page will be created as a standalone HTML page served by the alloro-app frontend, covering:

1. **What are Posts?** — Overview of the post system
2. **Post Types** — How post types work (defined per template)
3. **Creating Posts** — How to create and manage posts in a project
4. **Categories & Tags** — How taxonomy works
5. **Post Blocks** — What they are, how they're designed at the template level
6. **Shortcode Reference** — Complete syntax with all attributes, defaults, and examples
7. **Available Post Tokens** — Full list of `{{post.*}}` tokens for use in post block HTML
8. **Examples** — Common patterns (review carousel, blog listing, testimonial grid, single post detail)

This will be a React page in the frontend app at route `/documentation/alloro-posts`, styled consistently with the admin UI.

---

## Risk Analysis

| Risk | Level | Mitigation |
|---|---|---|
| Runtime DB queries add latency to every pageview | L3 | Redis cache (2-5 min TTL), batch queries, indexed columns |
| website-builder-rebuild gains new dependency (ioredis) | L2 | Same Redis instance as backend, minimal config |
| Shortcode regex parsing fragile with edge cases | L2 | Strict syntax rules, dedicated parser with tests, raw fallback on invalid |
| Post content with `{{` collisions | L2 | Token resolution only inside post block HTML, not inside post data values |
| Cache invalidation race conditions | L1 | Short TTL (2 min for posts) limits stale window; worst case is 2 min stale data |
| Post block design changes affect all projects | L2 | Intentional — blocks are template-level shared components. Document this behavior |
| Large post counts with no limit | L2 | Default `limit=10`, `0` for unlimited is explicit opt-in |
| S3 media orphaning on post delete | L1 | CASCADE deletes post_attachments rows; S3 cleanup can be async job (future) |

## Definition of Done

- [x] Migration file creates all 8 tables with correct schema, indexes, constraints
- [x] Post type CRUD endpoints functional (per template)
- [x] Post CRUD endpoints functional (per project) with featured_image as URL column
- [x] Category and tag CRUD endpoints functional (per post type)
- [x] Post block CRUD endpoints functional (per template)
- [x] Shortcode parser correctly extracts all attributes with defaults
- [x] Post block rendering iterates posts through block HTML with token replacement
- [x] Redis caching in website-builder-rebuild with TTL and invalidation
- [x] Cache invalidation triggers on all post/post-block mutations in alloro-app
- [x] TemplateDetail.tsx has "Post Blocks" tab with post type + post block management
- [x] WebsiteDetail.tsx has "Posts" tab with post CRUD
- [x] Post block editor has Monaco + iframe preview with placeholder data
- [x] Documentation page at `/admin/documentation/alloro-posts` with full reference
- [x] Invalid shortcodes render as raw text on live site
- [x] Missing post blocks or zero-result queries render empty (no error)
- [x] HTML escaping on all non-content post tokens

## Blast Radius Analysis

**Files modified:**
- `website-builder-rebuild/src/routes/site.ts` — added async resolvePostBlocks call in assembleHtml
- `website-builder-rebuild/src/index.ts` — Redis connection setup + graceful shutdown
- `website-builder-rebuild/package.json` — added ioredis dependency
- `signalsai-backend/src/routes/admin/websites.ts` — added 23 routes for post types, post blocks, taxonomy, posts
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — added 23 controller exports
- `signalsai/src/pages/Admin/TemplateDetail.tsx` — added "Post Blocks" tab with PostBlocksTab component
- `signalsai/src/pages/Admin/WebsiteDetail.tsx` — added "Posts" tab with PostsTab component
- `signalsai/src/pages/Admin.tsx` — added documentation route at /documentation/alloro-posts

**Files created:**
- 1 migration: `20260305000001_create_posts_system.ts`
- 6 models: PostTypeModel, PostCategoryModel, PostTagModel, PostModel, PostBlockModel, PostAttachmentModel
- 4 services: service.post-type-manager, service.post-taxonomy-manager, service.post-block-manager, service.post-manager
- 3 website-builder-rebuild: lib/redis.ts, utils/shortcodes.ts, services/postblock.service.ts
- 1 API layer: signalsai/src/api/posts.ts
- 2 frontend components: PostsTab.tsx, PostBlocksTab.tsx
- 1 documentation page: AlloroPostsDocs.tsx

**Services affected:**
- website-builder-rebuild (new Redis dependency, new render step)
- alloro-app backend (new routes, models, services, Redis invalidation)
- alloro-app frontend (new pages, components, API calls)

**No changes to:**
- N8N pipeline
- BullMQ workers
- Auth system
- Existing template/project/page functionality
- Form handling
- HFCM system

## Execution Order

1. Database migration (schema first, everything depends on it)
2. Backend models (data access layer)
3. Backend services + routes (API endpoints)
4. Shortcode parser + tests (website-builder-rebuild)
5. Redis setup (website-builder-rebuild)
6. Post block renderer service (website-builder-rebuild)
7. Renderer integration (wire into renderPage flow)
8. Frontend API layer
9. Frontend components (PostEditor, TaxonomyManager, PostsList)
10. TemplateDetail.tsx — Post Blocks tab
11. WebsiteDetail.tsx — Posts tab
12. Post block editor (Monaco + preview)
13. Documentation page
14. End-to-end testing
