# Blank Page Creation

## Why
Currently all page creation goes through `CreatePageModal` → `startPipeline` → N8N webhook → AI agent generation. There's no way to create a simple blank page with just a URL. Sometimes you need an empty page to build from scratch without waiting for the pipeline.

## What
Add a "Blank Page" option to the page creation flow. User provides only a path (and optional display name). Creates a page row directly via the existing `POST /:id/pages` endpoint — no template, no pipeline, no N8N. Page lands in the editor immediately with empty sections, ready to edit.

## Context

**Relevant files:**
- `frontend/src/components/Admin/CreatePageModal.tsx` — current pipeline-only creation modal
- `frontend/src/pages/admin/WebsiteDetail.tsx:251,1846,2439-2454` — modal trigger + integration
- `frontend/src/api/websites.ts` — API layer (missing `createPage` function)
- `src/controllers/admin-websites/feature-services/service.page-editor.ts:41-95` — `createPage()` already exists, requires `sections`
- `src/controllers/admin-websites/AdminWebsitesController.ts:1021-1045` — controller handler
- `src/routes/admin/websites.ts:421` — `POST /:id/pages` route already wired

**Patterns to follow:**
- `CreatePageModal.tsx` for modal styling and path validation pattern
- `service.page-editor.ts` `createPage()` for page insert pattern

**Key decisions:**
- Reuse existing `POST /:id/pages` endpoint — just allow empty sections `[]`
- Add a new frontend API function `createBlankPage()`
- Keep CreatePageModal for template-based creation; add a separate simpler modal or a toggle within CreatePageModal for blank page mode

## Constraints

**Must:**
- Set `generation_status` to `"ready"` so the page doesn't show as "generating"
- Set `status` to `"draft"`
- Validate path uniqueness (no duplicate active pages for same path)
- Navigate to page editor after creation
- Work even when project has no template assigned

**Must not:**
- Trigger N8N pipeline or any webhook
- Require template selection
- Break existing template-based page creation flow

**Out of scope:**
- Page duplication / clone feature
- Pre-built section library (pick sections to start with)
- Bulk blank page creation

## Risk

**Level:** 1

**Risks identified:**
- Blank pages with no sections won't render anything in preview → **Mitigation:** This is expected; user will add content via the sections editor. Empty state is fine.

## Tasks

### T1: Backend — allow empty sections in createPage
**Do:**
- In `service.page-editor.ts:createPage()`, change sections validation to allow empty array `[]`
- Accept optional `display_name` parameter
- Set `generation_status: "ready"` when creating (so it doesn't appear stuck)
**Files:** `src/controllers/admin-websites/feature-services/service.page-editor.ts`
**Verify:** `npx tsc --noEmit`; manual: POST to endpoint with `{ path: "/test", sections: [] }` returns 201

### T2: Frontend — add createBlankPage API function
**Do:**
- Add `createBlankPage(projectId, data: { path: string; displayName?: string })` to `frontend/src/api/websites.ts`
- Calls `POST /api/admin/websites/${projectId}/pages` with `{ path, sections: [], display_name: displayName }`
- Returns created page data
**Files:** `frontend/src/api/websites.ts`
**Verify:** `npx tsc --noEmit`

### T3: Frontend — add blank page option to CreatePageModal
**Do:**
- Add a mode toggle at the top of CreatePageModal: "From Template" (default) | "Blank Page"
- In "Blank Page" mode: show only path input + optional display name input + create button
- Hide template dropdown, page context, business data, colors — none of that applies
- On submit: call `createBlankPage()`, then call `onCreated(pageId)` same as pipeline flow
- Reuse existing path validation logic (lines 92-116 of CreatePageModal)
**Files:** `frontend/src/components/Admin/CreatePageModal.tsx`
**Verify:** Manual: open modal, switch to Blank Page, enter path, submit → page created, navigates to editor

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Backend accepts `{ path: "/test", sections: [] }` and creates page with `generation_status: "ready"`
- [ ] Frontend modal has "From Template" / "Blank Page" toggle
- [ ] Blank page creation works end-to-end: modal → API → page row → navigate to editor
- [ ] Existing template-based creation flow unchanged
