# Review Blocks Frontend UI

## Why
Backend endpoints for review block CRUD and sync exist but there's no admin UI to manage them.

## What
A "Review Blocks" tab in the template detail page with full CRUD, Monaco editor, live preview with sample review data, and a sync button.

## Tasks

### T1: API module
**Do:** `src/api/reviewBlocks.ts` — CRUD + sync trigger
**Verify:** `npx tsc --noEmit`

### T2: ReviewBlocksTab component
**Do:** `src/components/Admin/ReviewBlocksTab.tsx` — mirrors MenuTemplatesTab pattern. List view with sync button, editor view with Monaco + device preview, token reference bar, sample review data for preview.
**Verify:** `npx tsc --noEmit`

### T3: Wire into TemplateDetail
**Do:** Import ReviewBlocksTab, add Star icon, add tab entry + tab content between Menu Templates and Settings.
**Verify:** `npx tsc --noEmit`

## Done
- [x] `npx tsc --noEmit` passes
- [x] Review Blocks tab appears in template detail page
- [x] CRUD operations wired to backend endpoints
- [x] Sync Reviews button triggers `POST /reviews/sync`
- [x] Monaco editor with live preview using sample review data
