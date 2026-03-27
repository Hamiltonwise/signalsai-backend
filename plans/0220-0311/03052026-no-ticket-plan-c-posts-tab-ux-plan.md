# Plan C: Posts Tab UX + Documentation Polish

**Depends on:** Plan A (Custom Fields) + Plan B (Single Post Templates)

## Problem Statement

The Posts tab in WebsiteDetail currently shows a flat list of all posts with a type filter dropdown. With custom fields, single templates, and `{{post.url}}`, the documentation needs a full refresh. The Posts tab should feel more intuitive with post types as clear sections.

## Context Summary

- PostsTab.tsx has a `filterType` dropdown and `filterStatus` dropdown
- Post types are inherited from the template — already works
- Custom fields (Plan A) add dynamic form fields
- Single templates (Plan B) add per-type detail pages
- Documentation page exists at `/admin/documentation/alloro-posts`

## Proposed Approach

### 1. Posts Tab: Type-Based Sections

Instead of a single list with a filter dropdown, show post types as **tab pills** within the Posts tab:

```
[All] [Services] [Blog Posts] [Reviews]
```

- "All" shows every post (current behavior)
- Clicking a type filters to only that type
- The "New Post" button auto-selects the active type
- If only 1 post type exists, skip the type tabs

This is a UI-only change to PostsTab.tsx — no backend changes.

### 2. Post Type Info Cards

When a specific type is selected, show a small info card:
- Post type name and slug
- Number of posts (published / draft)
- Custom fields count
- "View Single Template" link (opens in PostBlocksTab)

### 3. Documentation Refresh

Rewrite AlloroPostsDocs.tsx to cover the full feature set:

**Sections:**
1. Overview (updated)
2. Post Types (updated — mention custom fields and single templates)
3. Custom Fields (new — types, how to define, how to use tokens)
4. Categories & Tags (existing)
5. Post Blocks (updated — loop markers, all tokens)
6. Available Tokens (updated — add `{{post.url}}`, `{{post.custom.*}}`)
7. Loop Markers (existing)
8. Single Post Pages (new — URL pattern, how routing works, how to create template)
9. Shortcode Syntax (updated)
10. Examples (updated — include `{{post.url}}` in card example, custom field examples)
11. Workflow (updated — full flow from type creation to live page)
12. Caching (existing)

### 4. Memory File Update

Update `post-blocks.md` memory file with:
- Custom field tokens
- `{{post.url}}` token
- Single post template information
- Updated layout examples with links

## Risk Analysis

- **Level 1**: UI-only changes to PostsTab, documentation rewrite. Zero backend risk.

## Definition of Done

- [x] Posts tab shows type pills for filtering
- [x] Post type info card when type selected
- [x] Documentation page fully updated with all features
- [x] Memory file updated
- [x] Build passes clean

## Execution Order

1. PostsTab type pills UI
2. Post type info cards
3. Documentation page rewrite
4. Memory file update
