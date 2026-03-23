# Menu Auto-Select & Add Post

**Ticket:** --no-ticket
**Date:** 03/05/2026

## Problem Statement

1. When opening the Menus tab, no menu is selected — the user sees an empty state even when menus exist. The first menu should be auto-selected.
2. There's no way to add posts as menu items. Users must manually type the post title and URL. An "Add Post" button should let users pick from existing posts and auto-populate label + URL.

## Context Summary

- `MenusTab` receives `projectId` only, rendered in `WebsiteDetail.tsx`
- `fetchPosts(projectId)` returns all posts for a project with `title`, `slug`, `post_type_id`
- `fetchPostTypes(templateId)` returns post types with `slug` — needed to build URL `/{postType.slug}/{post.slug}`
- `WebsiteDetail` has `website.template_id` available — needs to be passed to `MenusTab`
- Pages have `path` but no `title` — not useful for "Add Post" (the user specifically asked for posts)

## Existing Patterns to Follow

- `PostsTab` already receives `templateId` as a prop
- `AnimatedSelect` used for dropdowns throughout the codebase

## Proposed Approach

### 1. Auto-select first menu

In `MenusTab`, after `loadMenus` completes and `menus.length > 0` with no `selectedMenuId`, auto-set `selectedMenuId` to `menus[0].id`.

### 2. Pass templateId to MenusTab

- Update `MenusTabProps` to include `templateId?: string | null`
- Update `WebsiteDetail.tsx` to pass `templateId={website.template_id}`

### 3. Add Post picker

- Add an "Add Post" button next to "Add Item" in the footer
- Clicking opens a post picker modal/dropdown that:
  - Fetches posts via `fetchPosts(projectId, { status: "published" })`
  - Fetches post types via `fetchPostTypes(templateId)` to get type slugs
  - Shows a list of posts grouped or with type label
  - On select, creates a menu item with `label = post.title`, `url = /{postType.slug}/{post.slug}`

### File Changes

| File | Change |
|------|--------|
| `signalsai/src/components/Admin/MenusTab.tsx` | Auto-select first menu, add "Add Post" button + picker |
| `signalsai/src/pages/admin/WebsiteDetail.tsx` | Pass `templateId` to MenusTab |

## Risk Analysis

**Level 1 — Low risk.** UI-only changes. Existing APIs used. No backend changes.

## Definition of Done

- [x] First menu auto-selected on tab open
- [x] "Add Post" button visible in menu detail footer
- [x] Post picker shows published posts with their type
- [x] Selecting a post creates a menu item with correct label and URL
- [x] Build passes clean
