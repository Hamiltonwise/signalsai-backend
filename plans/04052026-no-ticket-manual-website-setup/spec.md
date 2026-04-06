# Manual Website Setup — Skip GBP, Create Pages from Template As-Is

## Why
New websites can only be set up via the GBP search flow, which forces AI generation for all pages at once. Users who already have their template data need a way to skip GBP and create individual pages directly from template sections without triggering the AI pipeline.

## What
Two-part change:
1. A "set up manually" path in the CREATED status screen that selects a template and transitions the website to LIVE — bypassing GBP entirely.
2. A "Use template as-is" toggle in `CreatePageModal` that seeds a page with the template page's existing sections instead of firing the AI generation pipeline.

## Context

**Relevant files:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` — Main dashboard. CREATED status section (lines 1562–1576) shows GBP search only. "Create Page" button on line 1836 gated to `(isLive || isInProgress) && website.template_id`.
- `frontend/src/components/Admin/CreatePageModal.tsx` — Page creation modal. Template mode `handleSubmitTemplate` (line 186) always calls `startPipeline`.
- `frontend/src/api/websites.ts` — `updateWebsite` (line 203) accepts `Partial<WebsiteProject>` including `status` and `template_id`. `createBlankPage` (line 498) hardcodes `sections: []`.

**Patterns to follow:**
- Existing template selector already in `WebsiteDetail.tsx` (inside the post-GBP confirmation card, lines 1416–1468) — reuse the same `templates` state and `handleTemplateChange` already loaded.
- `createBlankPage` calling pattern in `handleSubmitBlank` — extend the same function instead of introducing a new API function.

**Reference file:** `frontend/src/pages/admin/WebsiteDetail.tsx` lines 1562–1576 — the "not selected" GBP search section is where the manual setup block gets added below.

## Constraints

**Must:**
- Use the existing `templates` state (already fetched in CREATED status) for the manual template dropdown
- Call `updateWebsite(id, { template_id, status: 'LIVE' })` — single call, no new endpoints
- In CreatePageModal, use the `sections` already on the selected `TemplatePage` object (fetched on mount)
- "Use template as-is" must default to OFF so existing behavior is unchanged

**Must not:**
- Touch the existing GBP flow, `handleConfirmSelection`, or `createAllFromTemplate`
- Add new backend endpoints
- Modify the `startPipeline` path
- Refactor unrelated code in either file

**Out of scope:**
- Selecting colors/context when using "as-is" (sections are used verbatim)
- Any multi-page bulk creation in the manual path (handled one at a time via existing CreatePageModal)

## Risk

**Level:** 1

**Risks identified:**
- Setting `status: 'LIVE'` directly via `updateWebsite` with no pages → UI shows LIVE + 0 pages. This is acceptable and expected — the user will add pages next.
- Backend `updateProject` has no status validation (confirmed: generic update, deletes only `id` and `created_at`). Status transition is safe.

**Blast radius:** `WebsiteDetail.tsx` (self-contained page), `CreatePageModal.tsx` (used only from `WebsiteDetail.tsx`), `websites.ts` (`createBlankPage` — only called from `CreatePageModal.tsx`).

## Tasks

### T1: Add "Set up manually" section to the CREATED status screen
**Do:**
In `WebsiteDetail.tsx`, inside the `!selectedPlace && !isLoadingDetails` motion div (around line 1562), add below the GBP search input:
- A horizontal divider with "or" label
- A "Set up manually" subsection with:
  - Label: "Select a template to get started"
  - Template `<select>` — reuse `templates` state, `loadingTemplates`, `selectedTemplateId`, and `handleTemplateChange`
  - A "Skip to manual setup" button (disabled until a template is selected)
  - On click: `await updateWebsite(id, { template_id: selectedTemplateId, status: 'LIVE' } as any)` → `await loadWebsite()` → show success toast
  - Use a local `isSkipping` state for the button loading state

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`
**Depends on:** none
**Verify:** Manual — new website in CREATED status shows the divider + template picker + button. Selecting a template and clicking "Skip to manual setup" transitions to LIVE and the "Create Page" button appears.

### T2: Extend `createBlankPage` API to accept sections
**Do:**
In `frontend/src/api/websites.ts`, extend the `createBlankPage` function signature to accept optional `sections`:
```ts
data: { path: string; display_name?: string; sections?: Section[] }
```
Pass `sections: data.sections ?? []` in the fetch body instead of the hardcoded `[]`.
Import `Section` from `"./templates"` (already imported at top of file via `import type { Section } from "./templates"`).

**Files:** `frontend/src/api/websites.ts`
**Depends on:** none
**Verify:** TypeScript — `npx tsc --noEmit` passes.

### T3: Add "Use template as-is" toggle to CreatePageModal template mode
**Do:**
In `frontend/src/components/Admin/CreatePageModal.tsx`:
- Add state: `const [useAsIs, setUseAsIs] = useState(false)`
- In template mode JSX (after the template page selector, before the slug input), add a toggle row:
  - Label: "Use template sections as-is"
  - Description: "Skip AI generation — copies template sections directly to the page"
  - A checkbox/toggle that sets `useAsIs`
- When `useAsIs` is true: hide the Page Context, Brand Colors, and Overrides sections (not needed — sections are verbatim)
- Modify `handleSubmitTemplate`: when `useAsIs` is true, instead of `startPipeline`, call `createBlankPage(projectId, { path: slug, display_name: displayName.trim() || undefined, sections: templatePages.find(p => p.id === selectedPageId)?.sections ?? [] })`  then call `onSuccess()`
- Add `createBlankPage` to the import from `"../../api/websites"`
- Update `isTemplateDisabled`: when `useAsIs` is true, just requires `selectedPageId` and valid `slug` (no `templateId` required for pipeline, but `templateId` is still needed to load the pages list — no change here)

**Files:** `frontend/src/components/Admin/CreatePageModal.tsx`
**Depends on:** T2
**Verify:** Manual — in template mode, toggle "Use template as-is" ON. Page Context, Brand Colors, Overrides collapse. Submitting creates a page immediately (no queued status) with the template page's sections pre-loaded.

## Done
- [ ] CREATED status screen shows "set up manually" block with template picker below GBP search
- [ ] Clicking "Skip to manual setup" with a template selected transitions website to LIVE
- [ ] "Create Page" button appears after manual setup transition
- [ ] CreatePageModal template mode has "Use template as-is" toggle
- [ ] When toggled on: Page Context / Brand Colors / Overrides sections hidden
- [ ] When toggled on: submit creates page with template sections, no pipeline
- [ ] `npx tsc --noEmit` — zero new errors
