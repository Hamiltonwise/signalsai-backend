# Dynamic Menus System

## Problem Statement

Websites currently have navigation baked into the header HTML as static links. There is no way to manage menus through a UI — users must edit raw HTML in the layout editor to change navigation. We need a structured menu system with a management UI, nested items for dropdowns, and runtime rendering via shortcodes.

## Context Summary

- Header/footer are raw HTML strings on `projects` table, rendered via `renderPage()` (wrapper `{{slot}}` replacement)
- Shortcode pattern exists: `{{ post_block ... }}` parsed at runtime in website-builder-rebuild
- Preview placeholders already exist in `prepareHtmlForPreview()` for shortcodes
- Backend follows: migration → model (extends BaseModel) → feature-service → controller → routes
- Frontend follows: API module → tab component → WebsiteDetail tab registration
- Menus are scoped to **projects** (not templates) — each website manages its own

## Existing Patterns to Follow

- **Migration**: `signalsai-backend/src/database/migrations/` — `YYYYMMDD######_description.ts`, `website_builder.` schema
- **Model**: `signalsai-backend/src/models/website-builder/PostTypeModel.ts` — extends BaseModel, tableName, jsonFields, custom finders
- **Service**: `signalsai-backend/src/controllers/admin-websites/feature-services/service.post-manager.ts` — direct Knex queries, cache invalidation, slugify
- **Controller**: `AdminWebsitesController.ts` — thin handlers that delegate to service, return `{ success, data }`
- **Routes**: `signalsai-backend/src/routes/admin/websites.ts` — literal paths before parameterized
- **Frontend API**: `signalsai/src/api/posts.ts` — fetch wrappers with error handling
- **Frontend tab**: `PostsTab.tsx` — sidebar + main content layout
- **Shortcode**: `website-builder-rebuild/src/utils/shortcodes.ts` — regex parse, attribute extraction
- **Runtime resolution**: `website-builder-rebuild/src/services/postblock.service.ts` — parse → fetch → render → replace

## Proposed Approach

### 1. Database Migration

**File:** `signalsai-backend/src/database/migrations/20260305300000_create_menus.ts`

Two tables in `website_builder` schema:

**`menus`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK → projects | NOT NULL |
| name | VARCHAR(255) | Display name (e.g. "Primary Navigation") |
| slug | VARCHAR(255) | Used in shortcode: `{{ menu id='primary' }}` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

- Unique constraint: `(project_id, slug)`

**`menu_items`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| menu_id | UUID FK → menus | ON DELETE CASCADE |
| parent_id | UUID FK → menu_items | NULLABLE, ON DELETE CASCADE |
| label | VARCHAR(255) | Display text |
| url | TEXT | Href value |
| target | VARCHAR(20) | `_self` (default) or `_blank` |
| order_index | INTEGER | Sort position within parent |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

- Index on `(menu_id, parent_id, order_index)`

### 2. Backend Model

**File:** `signalsai-backend/src/models/website-builder/MenuModel.ts`

- `MenuModel` extends BaseModel — CRUD for menus table
- `MenuItemModel` extends BaseModel — CRUD for menu_items table
- Custom finders: `findByProjectId(projectId)`, `findByProjectAndSlug(projectId, slug)`, `findItemsByMenuId(menuId)` (ordered by order_index)

### 3. Backend Service

**File:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.menu-manager.ts`

Functions:
- `listMenus(projectId)` — returns menus with item counts
- `getMenu(projectId, menuId)` — returns menu + nested items tree
- `createMenu(projectId, { name, slug? })` — auto-slugify name if no slug
- `updateMenu(projectId, menuId, { name?, slug? })` — update menu metadata
- `deleteMenu(projectId, menuId)` — cascade deletes items
- `getMenuItems(menuId)` — flat list ordered by parent_id, order_index
- `createMenuItem(menuId, { label, url, target?, parent_id?, order_index? })` — add item, auto-assign order_index at end
- `updateMenuItem(menuId, itemId, { label?, url?, target?, parent_id?, order_index? })` — update item
- `deleteMenuItem(menuId, itemId)` — delete item (cascade removes children)
- `reorderItems(menuId, items: { id, parent_id, order_index }[])` — bulk reorder/reparent
- Cache invalidation: clear `menu:{projectId}:*` keys on any mutation

### 4. Backend Controller + Routes

**Controller additions to `AdminWebsitesController.ts`:**
- `listMenus`, `createMenu`, `getMenu`, `updateMenu`, `deleteMenu`
- `listMenuItems`, `createMenuItem`, `updateMenuItem`, `deleteMenuItem`, `reorderMenuItems`

**Routes in `websites.ts`:**
```
GET    /:id/menus                          → listMenus
POST   /:id/menus                          → createMenu
GET    /:id/menus/:menuId                  → getMenu
PATCH  /:id/menus/:menuId                  → updateMenu
DELETE /:id/menus/:menuId                  → deleteMenu
GET    /:id/menus/:menuId/items            → listMenuItems
POST   /:id/menus/:menuId/items            → createMenuItem
PATCH  /:id/menus/:menuId/items/:itemId    → updateMenuItem
DELETE /:id/menus/:menuId/items/:itemId    → deleteMenuItem
PATCH  /:id/menus/:menuId/items/reorder    → reorderMenuItems
```

### 5. Frontend API

**File:** `signalsai/src/api/menus.ts`

Interfaces: `Menu`, `MenuItem`, `MenuWithItems`
Functions: `fetchMenus`, `createMenu`, `fetchMenu`, `updateMenu`, `deleteMenu`, `createMenuItem`, `updateMenuItem`, `deleteMenuItem`, `reorderMenuItems`

### 6. Frontend MenusTab Component

**File:** `signalsai/src/components/Admin/MenusTab.tsx`

**Layout:** Same 30/70 sidebar pattern as PostsTab.

**Sidebar:**
- List of menus for this project (name, slug, item count)
- Active menu highlighted with orange left border
- "New Menu" button in footer

**Main content (when menu selected):**
- Menu name/slug editor at top
- Nested item list — indented items for children (one level)
- Each item row: label, url, target, edit/delete buttons, drag handle (or up/down arrows for reorder)
- "Add Item" form at bottom (label, url, target, parent selector)
- Inline edit mode for existing items

**Main content (no menu selected):**
- Empty state: "Create your first menu"

### 7. WebsiteDetail Tab Registration

**File:** `signalsai/src/pages/admin/WebsiteDetail.tsx`

- Add `"menus"` to `detailTab` union type
- Add to tab array (after "posts")
- Render `<MenusTab projectId={id!} />` when active

### 8. Shortcode: `{{ menu id='primary' }}`

**Syntax:** `{{ menu id='slug' }}`

**Runtime resolution in website-builder-rebuild:**

**File:** `website-builder-rebuild/src/utils/shortcodes.ts`
- Add `parseMenuShortcodes(html)` — regex: `/\{\{\s*menu\s+id='([^']+)'\s*\}\}/g`
- Returns `MenuShortcode[]` with `{ raw, id }`

**File:** `website-builder-rebuild/src/services/menu.service.ts`
- `resolveMenus(html, projectId)` — parse shortcodes → fetch menus + items from DB → render HTML → replace
- Menu HTML output: `<nav data-menu="slug"><ul>` with nested `<li><a>` and child `<ul>` for dropdowns
- Redis cache: `menu:{projectId}:{slug}` with 5-min TTL
- Called from `routes/site.ts` after `resolvePostBlocks()`

**Editor preview placeholder:**
- Already handled by `prepareHtmlForPreview()` — extend the regex to also match `{{ menu ... }}` shortcodes with the same gray box treatment

### 9. Preview Placeholder

**File:** `signalsai/src/hooks/useIframeSelector.ts`

Extend `prepareHtmlForPreview()` to also replace `{{ menu id='...' }}` with styled placeholder div (same pattern as post_block).

## Risk Analysis

**Level 2 — Structural Feature (moderate, well-bounded)**
- New tables, new API surface, new UI component — but follows existing patterns exactly
- No modifications to existing behavior (additive only)
- Shortcode resolution is appended to existing pipeline (after post_block)
- One level of nesting keeps complexity low

## Definition of Done

- [x] Migration creates `menus` and `menu_items` tables
- [x] Backend CRUD: menus + items + reorder endpoint
- [x] Frontend API module with all endpoints
- [x] MenusTab component with sidebar layout
- [x] Menu creation/editing (name, slug)
- [x] Item creation/editing (label, url, target, parent)
- [x] Item reordering (order_index)
- [x] Nested display (parent → children indented)
- [x] "Menus" tab in WebsiteDetail
- [x] `{{ menu id='slug' }}` shortcode parsed and resolved at runtime
- [x] Menu renders as `<nav><ul><li>` with nested `<ul>` for dropdowns
- [x] Redis caching for menu resolution
- [x] Preview placeholder for menu shortcodes in editor
- [x] Build passes clean (frontend + backend + website-builder-rebuild)

## Execution Order

1. Migration
2. Model (MenuModel, MenuItemModel)
3. Service (service.menu-manager.ts)
4. Controller handlers + routes
5. Frontend API (menus.ts)
6. MenusTab component
7. WebsiteDetail tab registration
8. Shortcode parser + runtime resolver (website-builder-rebuild)
9. Preview placeholder extension
10. Build check
