# Plan B: Single Post Templates + {{post.url}} + Renderer Routing

**Depends on:** Plan A (Custom Fields) — custom field tokens must work before single templates use them.

## Problem Statement

There's no way to view a single post as its own page. Post blocks render lists, but clicking a post should navigate to a detail page (e.g., `/services/dental-implants`). Each post type needs a "single post template" that defines the layout for individual post pages. The renderer needs new routing logic to handle `/{post-type-slug}/{post-slug}` URLs.

## Context Summary

- Renderer uses exact path matching: `getPageToRender(projectId, pagePath)`
- Fallback chain: published page → draft page → /success hardcoded → home page → 404
- Post blocks now support `{{post.*}}` tokens and loop markers
- `post_types` table has no `single_template` column yet
- Post type creation is a simple name input — no wizard flow
- User decided: pages win on collision (`/services` = page, `/services/slug` = post)
- User decided: single template = content area only (rendered inside wrapper/header/footer)
- User decided: creating a post type requires creating a single template as the next step

## Existing Patterns to Follow

- Pages stored as `sections` JSONB array of `{ name, content }`
- `renderPage()` assembles wrapper + header + sections + footer
- `resolvePostBlocks()` runs after page assembly
- Section editor pattern: Monaco editor with JS array syntax

## Proposed Approach

### 1. Database Migration

Add `single_template` JSONB column to `post_types` table:

```sql
ALTER TABLE website_builder.post_types
  ADD COLUMN single_template JSONB NOT NULL DEFAULT '[]';
```

Stores sections array identical to page sections: `[{ name: string, content: string }]`

### 2. Backend Changes

**PostTypeModel:**
- Add `single_template` to `IPostType` interface
- Add `"single_template"` to `jsonFields` array

**service.post-type-manager.ts:**
- Update `createPostType` to accept optional `single_template`
- Update `updatePostType` to accept `single_template`
- No special validation needed — same format as page sections

### 3. {{post.url}} Token

**shortcodes.ts:**
- Add `{{post.url}}` to `renderPostBlockHtml`
- Value: `/${postTypeSlug}/${postSlug}` — the relative URL for the single post page

**postblock.service.ts:**
- Pass `post_type_slug` and `post.slug` to the render function
- Construct URL: `/${shortcode.items}/${post.slug}`
- Add to the post data object passed to `renderPostBlockHtml`

### 4. Renderer Routing (website-builder-rebuild)

**routes/site.ts — modified fallback logic:**

Current flow:
```
path → getPageToRender() → page found? → assembleHtml
                         → no page? → fallback chain → 404
```

New flow:
```
path → getPageToRender() → page found? → assembleHtml
                         → no page?
                           → tryPostRoute(projectId, templateId, path)
                             → split path: /{segment1}/{segment2}
                             → lookup post_type by slug = segment1 AND template_id
                             → lookup post by slug = segment2 AND project_id AND post_type_id AND status = 'published'
                             → found? → assembleSinglePostHtml(project, postType, post)
                             → not found? → continue to existing fallback chain
```

**New function: `assembleSinglePostHtml(project, postType, post)`**
- Fetch template wrapper/header/footer (same as page assembly)
- Get single_template sections from postType
- Replace `{{post.*}}` tokens in each section's content (including `{{post.custom.*}}`)
- Call `renderPage(wrapper, header, footer, resolvedSections, snippets, ...)`
- Run `resolvePostBlocks()` on result (single post pages may contain post blocks too)
- Return assembled HTML

**New service function: `getPostByTypeAndSlug(projectId, templateId, typeSlug, postSlug)`**
- Query `post_types` by slug + template_id
- Query `posts` by slug + project_id + post_type_id + status='published'
- Return `{ postType, post }` or null
- Enrich post with categories, tags, custom_fields
- Redis cache with 2 min TTL (same as post queries)

### 5. Frontend API Changes

**posts.ts:**
- Add `single_template` to `PostType` interface
- Add `single_template` to `createPostType` and `updatePostType` payloads

### 6. UI: Post Type Creation Wizard (PostBlocksTab)

Replace the simple name input with a 2-step creation flow:

**Step 1: Create Post Type**
- Name input (existing)
- On submit → creates post type via API → advances to step 2

**Step 2: Single Post Template Editor**
- Full section editor (Monaco, same as page editor)
- Default template: basic single post layout with `{{post.title}}`, `{{post.content}}`, etc.
- Token reference bar visible
- Save button → calls `updatePostType` with `single_template`
- "Skip (use default)" option for quick setup

**Edit later:**
- Each post type row shows an "Edit Template" button
- Opens the same editor pre-filled with current single_template sections

### 7. Preview in Editor

- Same iframe preview pattern as post blocks
- Uses wrapper/header/footer from template
- Renders single_template sections with placeholder post data
- Scale 0.45 matching other editors

### 8. Documentation Update

- Add "Single Post Pages" section explaining URL pattern
- Add `{{post.url}}` to token reference
- Explain that pages take priority over post type URLs
- Add example: clicking a card in a post block grid navigates to the single post page

## Risk Analysis

- **Level 3**: Renderer routing change. The fallback must only trigger for exactly 2-segment paths where segment1 matches a post type. Must not intercept:
  - Existing pages (page lookup happens first — safe)
  - `/success` route (hardcoded check happens first — safe)
  - Root `/` (only 1 segment — won't match)
  - Paths with 3+ segments (won't match 2-segment pattern)
- **Level 2**: Single template creation is required but user might close browser mid-wizard. Post type exists with empty single_template. Mitigation: empty single_template renders a sensible default ("Post title + content" layout).
- **Level 1**: New JSONB column, low migration risk.

## Mitigation for Routing Risk

The post type route check is:
1. Path must have exactly 2 segments: `/segment1/segment2`
2. `segment1` must match an existing post type slug for this project's template
3. `segment2` must match an existing published post slug for this project

If any check fails, fall through to existing fallback chain. This is a narrow match — false positives are extremely unlikely.

## Definition of Done

- [x] Migration adds `single_template` JSONB to post_types
- [x] `{{post.url}}` token works in post blocks (outputs `/{type}/{slug}`)
- [x] Renderer resolves `/{type-slug}/{post-slug}` URLs to single post pages
- [x] Single post pages render inside wrapper/header/footer
- [x] "Edit Template" button on existing post types (purple FileCode icon)
- [x] Single template editor with Monaco + preview
- [x] Empty single_template falls back to default layout
- [x] Post blocks with `{{post.url}}` link correctly to single pages
- [x] Existing pages still take priority over post type URLs
- [x] Documentation updated

## Execution Order

1. Migration (add single_template column)
2. Backend model + service updates
3. {{post.url}} token in shortcodes + renderer
4. New renderer routing logic + assembleSinglePostHtml
5. New service: getPostByTypeAndSlug
6. Frontend API updates
7. Post type creation wizard UI
8. Single template editor + preview
9. Documentation
