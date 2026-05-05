# Traditional Website Editor Controls

## Why
The current website editor leans too heavily on AI for small deterministic changes like text, images, links, and font size. These edits should be fast, visible, reversible, and safe without giving users the ability to restructure or damage the page.

## What
Add traditional direct-edit controls to the admin page editor and DFY user-facing editor for selected page elements: inline text replacement, image replacement from media/upload, bounded Tailwind font-size stepping, link target replacement, and existing hide/show behavior. The editor must update the underlying section code/state immediately while preserving the page structure.

## Context

**Relevant files:**
- `frontend/src/pages/admin/PageEditor.tsx` - admin editor, draft creation, iframe preview, AI edit flow, section extraction, autosave.
- `frontend/src/pages/DFYWebsite.tsx` - user-facing DFY editor, preview assembly, AI edit flow, undo/redo, dirty state, save and publish.
- `frontend/src/hooks/useIframeSelector.ts` - shared iframe element selection and quick-action overlay.
- `frontend/src/components/PageEditor/EditorSidebar.tsx` - selected-element controls that currently turn text/link/media edits into AI prompts.
- `frontend/src/components/PageEditor/MediaBrowser.tsx` - shared media picker currently hardcoded to admin media endpoints.
- `src/routes/user/website.ts` - authenticated DFY website routes.
- `src/controllers/user-website/UserWebsiteController.ts` - user website controller for edit/save/preview operations.
- `src/controllers/user-website/user-website-services/userWebsite.service.ts` - DFY ownership, tier, read-only, and save/edit service logic.
- `src/routes/admin/media.ts` and `src/controllers/admin-media/AdminMediaController.ts` - existing admin media upload/list behavior to reuse carefully.

**Patterns to follow:**
- Frontend state changes should follow the existing DOM replace/extract/rebuild flow used by `PageEditor.tsx` and `DFYWebsite.tsx`.
- User-facing website operations must stay behind `authenticateToken`, `rbacMiddleware`, `requireRole("admin", "manager")`, organization ownership checks, DFY tier checks, and read-only checks.
- Shared editor UI should remain shared, but endpoint selection and mutation behavior must be explicit instead of hardcoded to admin paths.

**Key decisions already made:**
- Direct controls are deterministic operations, not AI prompt wrappers.
- Page structure editing is out of scope: no section add, remove, reorder, nesting, raw HTML editing, or arbitrary class editing from these controls.
- Font-size changes are allowlisted Tailwind text-size class steps with responsive safety limits.

## Constraints

**Must:**
- Mutate only the selected element and only through allowlisted operations: text content, anchor href, image src/alt, visibility class, and font-size class.
- Preserve `data-alloro-section`, `alloro-tpl-*` markers, shortcodes, and surrounding HTML structure.
- Keep admin behavior draft/autosave based.
- Keep user behavior dirty-state based until Save & Publish.
- Add user-safe media list/upload endpoints or an equivalent authenticated adapter for DFY editing.
- Make direct edits update preview and section code/state immediately.
- Keep undo/redo behavior intact for user-facing edits and preserve existing admin undo behavior where available.

**Must not:**
- Use AI for direct text, link, media, visibility, or font-size controls.
- Continue relying on `/api/admin/websites/:projectId/media` from the user-facing editor.
- Allow arbitrary HTML, arbitrary Tailwind classes, custom CSS, script URLs, or structural page changes.
- Modify header/footer/layout editing in this pass.
- Introduce new frontend or backend dependencies.
- Refactor unrelated editor, media, or auth code.

**Out of scope:**
- A full visual page builder.
- Header/footer direct editing.
- Section add/remove/reorder controls.
- Raw code editing improvements.
- AI prompt editing changes.
- Full hardening of every admin website/media route.
- Posts, menus, SEO, analytics, and form editing.

## Risk

**Level:** 3

**Risks identified:**
- The user-facing editor currently reaches toward admin media behavior through shared components. That is a security boundary problem, not a UI inconvenience. **Mitigation:** add authenticated user media routes scoped through the user's organization/project and point DFY media controls there.
- Admin website/media routes appear broader and less guarded than user-facing DFY routes. This is structural risk. **Mitigation:** do not deepen the dependency from user surfaces to admin routes; schedule separate admin route hardening if production exposure is confirmed.
- Direct DOM mutation can silently corrupt saved section HTML if each surface implements its own string manipulation. **Mitigation:** use a shared direct-edit utility that operates on parsed DOM elements and returns updated sections through the existing extraction path.
- Font-size controls can break responsive layouts if they strip breakpoint classes or add unbounded sizes. **Mitigation:** allow only known Tailwind text-size classes, clamp by element category, and preserve unrelated responsive classes.

**Pushback:**
- Do not make this a "mini Webflow." That is how future-us gets a fragile, half-owned page builder. The safe version is a narrow property editor for selected elements, with strict operation allowlists and no structural controls.
- The media endpoint issue should not be hand-waved. If the user editor can upload/list media through admin routes, that belongs in a separate security cleanup or must be fixed as part of this feature before shipping.

## Tasks

### T1: Direct Edit Mutation Utility
**Do:** Create a shared frontend utility for selected-element mutations: text replacement, link href replacement with URL validation, image src/alt replacement, visibility toggle, and bounded Tailwind font-size stepping. Preserve markers and avoid structural edits.
**Files:** `frontend/src/utils/directElementEditor.ts`, `frontend/src/hooks/useIframeSelector.ts`
**Verify:** `cd frontend && npx tsc --noEmit`; manual check that selected text, link, image, hide, and font-size actions only affect the selected element.

### T2: Shared Traditional Editor Controls
**Do:** Update `EditorSidebar` and `MediaBrowser` so traditional controls call direct edit callbacks instead of sending AI prompts. Add media upload support to the picker and make media endpoints configurable by editor surface.
**Files:** `frontend/src/components/PageEditor/EditorSidebar.tsx`, `frontend/src/components/PageEditor/MediaBrowser.tsx`
**Verify:** `cd frontend && npx tsc --noEmit`; manual check that text/link/image/font-size controls show immediate visual changes without chat/AI activity.

### T3: Admin Page Editor Integration
**Do:** Wire direct edit callbacks into admin `PageEditor.tsx`, push undo state where appropriate, extract updated sections from the iframe, rebuild preview HTML, and keep draft autosave/code view synchronized. Fix the existing text-up/text-down persistence gap.
**Files:** `frontend/src/pages/admin/PageEditor.tsx`
**Verify:** `cd frontend && npx tsc --noEmit`; manual check that admin direct edits persist to the draft and remain after reload.

### T4: DFY User Editor Integration
**Do:** Wire the same direct edit operations into `DFYWebsite.tsx` while preserving dirty state, undo/redo, version preview restrictions, shortcode restoration, and Save & Publish behavior.
**Files:** `frontend/src/pages/DFYWebsite.tsx`
**Verify:** `cd frontend && npx tsc --noEmit`; manual check that user direct edits show immediately, can be undone, and persist only after Save & Publish.

### T5: User-Safe Media Endpoints
**Do:** Add authenticated DFY media list/upload endpoints or service methods under `/api/user/website`, scoped to the user's organization/project and respecting DFY tier/read-only rules. Reuse existing media services/models where practical without exposing admin routes to users.
**Files:** `src/routes/user/website.ts`, `src/controllers/user-website/UserWebsiteController.ts`, `src/controllers/user-website/user-website-services/userWebsite.service.ts`
**Verify:** backend typecheck command; manual check that DFY media list/upload uses `/api/user/website/*` and rejects unauthorized project access.

## Done
- [ ] `cd frontend && npx tsc --noEmit` passes or only reports unrelated pre-existing errors.
- [ ] Backend typecheck command passes or only reports unrelated pre-existing errors.
- [ ] Project lint/test commands run if configured.
- [ ] Manual: admin text, link, media, hide, and font-size edits update preview, section code/state, and draft persistence without AI.
- [ ] Manual: user text, link, media, hide, and font-size edits update preview immediately, support undo/redo, and persist through Save & Publish without AI.
- [ ] Manual: user media list/upload does not call admin media endpoints.
- [ ] Manual: direct controls cannot add, remove, reorder, or nest sections and cannot edit arbitrary classes or raw HTML.
- [ ] Manual: shortcodes and `alloro-tpl-*` markers are preserved after direct edits.
