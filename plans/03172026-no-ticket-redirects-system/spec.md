# Redirects System

## Why
When migrating from old sites to Alloro, URL structures change. Without 301 redirects, all old indexed URLs return 404, killing SEO value. QA checklists always include redirect recommendations. Currently these are noted but can't be actioned — no redirect infrastructure exists. We need a full redirect system: storage, admin UI, renderer integration, and AI Command awareness.

## What
New `website_builder.redirects` table, admin UI tab on the single website page, renderer-level redirect resolution (before page lookup), and AI Command integration so redirect recommendations can be created/checked programmatically.

## Context

**Relevant files:**
- `website-builder-rebuild/src/routes/site.ts` — renderer request flow, `getPageToRender()` lookup, 404 fallback logic
- `signalsai-backend/src/routes/admin/websites.ts` — admin route registration
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — controller pattern
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — tab container, `VALID_TABS` array
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` — AI Command service

**Renderer routing (where redirects fit):**
```
Request → project lookup → [REDIRECT CHECK HERE] → getPageToRender() → assemble/render
```
Redirects should be checked after project resolution but before page lookup. If a redirect matches, issue 301/302 and stop — never render.

**Current 404 flow:**
- Page not found → try as single post (`/:type/:slug`) → try `/success` → fallback to home → 404 page

## Constraints

**Must:**
- Store redirects per project in DB (not config files)
- Support 301 (permanent) and 302 (temporary) redirect types
- Resolve redirects in the renderer before page lookup
- Provide CRUD admin UI as a new tab
- AI Command must be able to create redirects programmatically
- AI Command analysis must check existing redirects before recommending new ones
- Support wildcard path matching (e.g., `/blog/*` → `/`) for bulk old-URL handling
- Prevent redirect loops (from_path === to_path or circular chains)

**Must not:**
- Slow down page rendering for non-redirected URLs (indexed lookup, not full-table scan)
- Allow redirects that conflict with existing page paths (warn but don't block — user may want to redirect away from an existing page)
- Add new dependencies to the website-builder-rebuild

**Out of scope:**
- Redirect analytics (hit counts, last accessed)
- Regex-based redirects (simple path + wildcard only for v1)
- External URL redirects (to_path must be relative, same site)

## Risk

**Level:** 2

**Risks identified:**
- Wildcard matching order matters (`/blog/*` vs `/blog/specific-post`) → **Mitigation:** exact matches take priority over wildcards. Process exact first, wildcards second.
- Redirect loops could cause infinite redirects → **Mitigation:** validate on insert — check if to_path has its own redirect, limit chain depth to 1.
- Redis caching of redirects may serve stale data → **Mitigation:** 5-min TTL, cache invalidation on CRUD operations via `?nocache=1` or explicit flush.

## Tasks

### T1: Database migration
**Do:** Create `website_builder.redirects` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| project_id | uuid FK → projects | on delete cascade |
| from_path | text | e.g., `/about/`, `/blog/*` |
| to_path | text | e.g., `/about-us`, `/` |
| type | int | 301 or 302 |
| is_wildcard | boolean | default false, true if from_path contains `*` |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Unique constraint: `(project_id, from_path)` — one redirect per source path per project.
Index: `(project_id, from_path)` for fast lookup.
Index: `(project_id, is_wildcard)` for separating exact vs wildcard lookups.

**Files:** `signalsai-backend/src/database/migrations/20260317000002_create_redirects_table.ts`
**Verify:** Migration runs, table exists

### T2: Redirect service
**Do:** Create `signalsai-backend/src/controllers/admin-websites/feature-services/service.redirects.ts`:

- `listRedirects(projectId, filters?)` — list all, optionally filter by type
- `createRedirect(projectId, { from_path, to_path, type })` — validate no loop, auto-detect wildcard, normalize paths (ensure leading `/`, strip trailing `/` unless root)
- `updateRedirect(redirectId, { from_path?, to_path?, type? })` — same validation
- `deleteRedirect(redirectId)` — simple delete
- `bulkCreateRedirects(projectId, redirects[])` — for AI Command batch creation
- `getExistingRedirects(projectId)` — returns `Array<{ from_path, to_path }>` for AI context
- `resolveRedirect(projectId, path)` — lookup for renderer: try exact match first, then wildcard matches (longest prefix wins)

Loop detection: before insert, check if `to_path` already has a redirect entry as `from_path` for this project. If so, reject with error.

Wildcard resolution: strip `*` from `from_path`, check if request path starts with the prefix. Replace the matched prefix with `to_path`. E.g., `/blog/*` → `/` means `/blog/my-post` → `/`.

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.redirects.ts`
**Verify:** Service functions compile, loop detection works

### T3: Controller + routes
**Do:** Add admin endpoints:

```
GET    /:id/redirects              → listRedirects
POST   /:id/redirects              → createRedirect
POST   /:id/redirects/bulk         → bulkCreateRedirects
PATCH  /:id/redirects/:redirectId  → updateRedirect
DELETE /:id/redirects/:redirectId  → deleteRedirect
```

**Files:** `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts`, `signalsai-backend/src/routes/admin/websites.ts`
**Verify:** Routes registered, `npx tsc --noEmit` passes

### T4: Renderer integration
**Do:** In `website-builder-rebuild/src/routes/site.ts`, add redirect resolution after project lookup and before page rendering:

1. Import redirect resolver (direct DB query or Redis-cached)
2. After project is resolved, before `getPageToRender()`:
   ```typescript
   const redirect = await resolveRedirect(project.id, pagePath);
   if (redirect) {
     res.redirect(redirect.type, redirect.to_path);
     return;
   }
   ```
3. Cache resolved redirects per project in Redis: key `redir:{projectId}`, value JSON map of from→to, TTL 5 min.
4. On `?nocache=1`, flush redirect cache too.

**Important:** The website-builder-rebuild is a separate project. The redirect resolver needs its own DB query (it can't import from signalsai-backend). Create a minimal resolver function inline or in a utils file within website-builder-rebuild.

**Files:** `website-builder-rebuild/src/routes/site.ts`, `website-builder-rebuild/src/services/redirect.service.ts` (new)
**Verify:** Redirects resolve correctly, non-redirected URLs unaffected

### T5: Frontend — Redirects tab
**Do:** Create `RedirectsTab.tsx` component, add as new tab in `WebsiteDetail.tsx` (between "menus" and "ai-command"):

**UI:**
- Table view: From Path | To Path | Type (301/302) | Actions (edit/delete)
- Add form at top: from_path input, to_path input, type dropdown (301/302), add button
- Inline edit on click
- Delete with confirmation
- Import: paste CSV or JSON bulk input
- Show count badge on tab

**Files:** `signalsai/src/components/Admin/RedirectsTab.tsx`, `signalsai/src/pages/admin/WebsiteDetail.tsx`, `signalsai/src/api/websites.ts`
**Verify:** Tab renders, CRUD operations work

### T6: AI Command integration
**Do:** Extend AI Command to handle redirects:

**Analysis phase:**
- New recommendation type: `target_type: "create_redirect"`
- `target_meta: { from_path, to_path, type: 301 }`
- Before recommending, check existing redirects (pass to LLM as context)
- If redirect already exists for that from_path, skip

**Execution phase:**
- For `create_redirect` recommendations: call `createRedirect()` service
- Store created redirect ID in `execution_result`

**Frontend:**
- Group `create_redirect` recommendations under "Redirects" in the accordion
- Show with a link/arrow icon

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts` (prompt update), `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` (execution handler), `signalsai/src/components/Admin/AiCommandTab.tsx` (display)
**Verify:** AI recommends redirects, execution creates them in DB

### T7: Migration scripts
**Do:** Create SQL scripts for manual execution:

**Files:**
- `plans/03172026-no-ticket-redirects-system/migrations/pgsql.sql`
- `plans/03172026-no-ticket-redirects-system/migrations/mssql.sql`
- `plans/03172026-no-ticket-redirects-system/migrations/knexmigration.js`

**Verify:** SQL matches T1 schema

## Done
- [ ] `website_builder.redirects` table exists
- [ ] Admin CRUD endpoints work
- [ ] Redirects tab shows in website detail
- [ ] Renderer resolves redirects before page lookup (301/302)
- [ ] Wildcard redirects work (`/blog/*` → `/`)
- [ ] Exact matches take priority over wildcards
- [ ] Loop detection prevents circular redirects
- [ ] AI Command recommends redirects based on QA checklist
- [ ] AI Command checks existing redirects before recommending
- [ ] AI Command execution creates redirects
- [ ] `npx tsc --noEmit` passes (all projects)
- [ ] Manual: create redirect in admin, visit old URL, verify redirect fires
