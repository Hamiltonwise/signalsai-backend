# Fix Stale Draft + Website Renderer Status Gate

**Date:** 02/25/2026
**Ticket:** no-ticket
**Tier:** Minor Change (two targeted bug fixes)

---

## Problem Statement

Two related bugs in the website builder page lifecycle:

### Bug 1: Stale Draft in Editor
When a user edits a page and publishes it, opening the editor again returns a stale draft with old content instead of creating a fresh draft from the updated published page.

**Root cause:** `createDraft()` in `service.page-editor.ts` is idempotent — it finds an existing draft row for that `project_id + path` and returns it immediately, without checking whether the published version has been updated since that draft was created.

### Bug 2: "Almost There" on Existing Projects
When a user creates a new page on a project that already has published pages, the N8N pipeline resets the project status to an intermediate state. The website renderer gates on `project.status === 'HTML_GENERATED' || 'READY'`, so the entire site (including the working homepage) shows "Almost There" while the new page generates.

**Root cause:** The renderer at `site.ts:81` only checks project status. It has no fallback for projects that have published pages but are temporarily in an intermediate pipeline status.

---

## Context Summary

### Bug 1 Files
- **Backend:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts`
  - `createDraft()` (lines 353–429) — the idempotent draft creation function
  - Uses `updated_at` timestamps on both draft and published rows

### Bug 2 Files
- **Website Renderer:** `~/Desktop/website-builder-rebuild/src/routes/site.ts`
  - `siteRoute()` (lines 67–106) — the main route handler
  - Status gate at line 81
- **Page Service:** `~/Desktop/website-builder-rebuild/src/services/page.service.ts`
  - `getPageToRender()`, `getPublishedPage()`, `getDraftPage()`

### Existing Patterns
- Page status lifecycle: `draft` → `published` → `inactive`
- Project status lifecycle: `CREATED` → `GBP_SELECTED` → ... → `HTML_GENERATED` → `READY`
- `publishPage()` marks old published as `inactive`, promotes draft to `published`
- `createDraft()` copies only `project_id`, `path`, `version`, `status`, `sections` — not `edit_chat_history`

---

## Proposed Approach

### Bug 1 Fix: Refresh Stale Draft

In `createDraft()`, when an existing draft is found, compare `updated_at` timestamps:
- If the published source page's `updated_at` is **newer** than the existing draft's `created_at`, the draft is stale
- Update the draft's `sections` with the published page's sections (re-copy)
- Reset `edit_chat_history` to `'{}'` (fresh editing session)
- Update `updated_at` on the draft
- Return the refreshed draft

**Why `created_at` on draft vs `updated_at` on published:** The draft's `created_at` represents when it was copied from the published version. If the published page was updated after that point (via a different draft being published), the current draft is stale.

**Change location:** `service.page-editor.ts` lines 398–402 — the `if (existingDraft)` block.

### Bug 2 Fix: Published Pages Override Status Gate

In `siteRoute()`, before returning the "not ready" page, check if the project has any published pages. If it does, skip the status gate and proceed to normal page rendering.

**Implementation:**
1. Add a `hasPublishedPages()` function to `page.service.ts` — a lightweight `SELECT 1` query checking for any published page rows for the project
2. In `siteRoute()` at line 81, when project status is not ready, call `hasPublishedPages()`. If true, proceed to page rendering. If false, show the status page as before.

This means:
- Brand new projects with no published pages → still show status messages during generation
- Existing projects with published pages that are generating a new page → render normally

---

## Architectural Decisions

### Why refresh the draft instead of deleting + recreating?
Preserves the draft's UUID. If any frontend state or URL references the draft ID, it won't break. Simpler than delete + insert with potential FK issues.

### Why check published pages in the renderer instead of preventing N8N from resetting status?
N8N is external and not in this codebase. Changing it requires a separate workflow update. The renderer fix is self-contained, resilient, and correct regardless of what N8N does. Even if N8N is later fixed, this check is still valid defensive logic.

### Why `SELECT 1 ... LIMIT 1` for hasPublishedPages?
Minimal query cost. We don't need to fetch page data — just existence. This adds negligible latency to the status check path.

---

## Risk Analysis

**Escalation: Level 1 — Suggestion** (both fixes)

- Both are low blast radius, targeted bug fixes
- No schema changes
- No migration required
- No new dependencies
- No auth boundary changes

**Bug 1 risk:** Draft sections get overwritten when stale. This is the correct behavior — the stale content is wrong. Chat history resets, which is expected (fresh editing session on updated content).

**Bug 2 risk:** A project in a genuinely broken state (e.g., `CREATED` with a somehow-published page) would bypass the status gate. This is acceptable — rendering a published page is always better than showing "Almost There."

---

## Definition of Done

- [ ] `createDraft()` detects stale drafts and refreshes sections from the published source
- [ ] Website renderer serves published pages even when project status is intermediate
- [ ] Existing behavior preserved: new projects with no pages still show status messages
- [ ] No regressions in draft creation, publishing, or page editing flows
