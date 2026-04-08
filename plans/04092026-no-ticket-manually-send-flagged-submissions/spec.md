# Manually Send Flagged Submissions + Multi-Select Bulk Actions

## Why
AI-flagged submissions are real leads getting silently dropped. Admins need to manually send them and manage submissions in bulk without one-at-a-time interactions.

## What
1. **Single send** — "Send" button on flagged submissions that fires the email webhook for that submission
2. **Multi-select** — checkboxes on each submission row (matches OrgTasksTab pattern)
3. **Floating action bar** — appears when items selected, with: bulk send (flagged only), bulk delete, bulk toggle read/unread

## Context

**Relevant files:**
- `src/controllers/websiteContact/formSubmissionController.ts` — inline email HTML builder + send logic (lines 435–513); needs extraction
- `src/controllers/websiteContact/websiteContact-services/emailWebhookService.ts` — `sendEmailWebhook()` sends to n8n webhook
- `src/controllers/admin-websites/AdminWebsitesController.ts` — existing `listFormSubmissions`, `getFormSubmission`, `deleteFormSubmission`, `toggleFormSubmissionRead` handlers (lines 1895–2027)
- `src/models/website-builder/FormSubmissionModel.ts` — `findById`, `deleteById`, `markAsRead/Unread` (singular only); needs bulk methods added
- `src/routes/admin/websites.ts` — existing form submission routes (lines 299–309); needs new routes
- `frontend/src/components/Admin/FormSubmissionsTab.tsx` — submission list + detail view, current actions: toggle read + delete
- `frontend/src/components/ui/DesignSystem.tsx` — `BulkActionBar` component (lines 619–739); already built, just needs to be used
- `frontend/src/api/websites.ts` — existing form submission API functions (lines 881–926)

**Patterns to follow:**
- Bulk actions pattern: `OrgTasksTab.tsx` — `selectedIds: Set<number>`, `BulkActionBar`, bulk loading state, toast feedback
- Service extraction pattern: `emailWebhookService.ts` — named export, single responsibility
- Controller handler pattern: `AdminWebsitesController.ts` existing form submission handlers

**Reference file:** `src/controllers/admin-websites/AdminWebsitesController.ts:1895` — closest analog for new handlers

## Constraints

**Must:**
- Extract email HTML builder into a shared service before wiring the resend endpoint
- Use existing `BulkActionBar` from DesignSystem — do not build a new one
- Bulk send only available when at least one selected item is flagged
- Bulk send fires the same email webhook path as original submission sends
- Handle empty `recipients_sent_to` gracefully (return 400 or skip with warning)
- Cap bulk operations at 50 items max

**Must not:**
- Modify the original submission flow in `formSubmissionController.ts` beyond importing the extracted builder
- Add user-facing (client) routes — admin only for this feature
- Re-flag or unflag submissions when manually sending
- Use `recipients_sent_to` from the current request — always use what's stored on the submission

**Out of scope:**
- Changing flag status after manual send
- User (client-facing) route equivalents
- Resending non-flagged submissions individually (multi bulk send shows for any selected item that is flagged)

## Risk

**Level:** 2

**Risks identified:**
- Extracting email builder from formSubmissionController is a moderate refactor → **Mitigation:** Keep the extraction minimal — move the HTML string construction only, not the surrounding logic. Verify existing submit flow still works after extraction.
- Bulk endpoints without a max cap could cause webhook spam → **Mitigation:** Cap at 50 items per bulk request; return 400 if exceeded.
- `recipients_sent_to` may be empty on old submissions (pre-feature) → **Mitigation:** Return 400 with a clear message: "No recipients on file for this submission."

**Blast radius:** 
- `formSubmissionController.ts` is in the hot path for every inbound form submission — the extraction must leave behavior identical
- `AdminWebsitesController.ts` — only adding new methods, no modifications to existing ones

## Tasks

### T1: Extract email body builder service
**Do:** Move the HTML email construction logic (lines 435–488 of `formSubmissionController.ts`) into a new file `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts`. Export a single function `buildEmailBody(formName: string, contents: FormContents): string`. Update `formSubmissionController.ts` to import and use it. No behavioral change.
**Files:** `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts` (NEW), `src/controllers/websiteContact/formSubmissionController.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` — zero new errors; existing submit flow unchanged

### T2: Backend — send-email + bulk endpoints
**Do:**
- `FormSubmissionModel.ts`: add `bulkDeleteByIds(ids: string[])`, `bulkMarkAsRead(ids: string[])`, `bulkMarkAsUnread(ids: string[])`
- `AdminWebsitesController.ts`: add four new handlers:
  - `sendFormSubmissionEmail` — fetches submission by ID, calls `buildEmailBody()`, calls `sendEmailWebhook()`. Returns 400 if no recipients. Returns 200 `{ success: true }`.
  - `bulkSendFormSubmissionsEmail` — accepts `{ submissionIds: string[] }`, cap 50, loops and sends only flagged ones, returns `{ sent: number, skipped: number }`
  - `bulkDeleteFormSubmissions` — accepts `{ submissionIds: string[] }`, cap 50, calls `bulkDeleteByIds`
  - `bulkToggleFormSubmissionsRead` — accepts `{ submissionIds: string[], is_read: boolean }`, cap 50, calls bulk model method
- `src/routes/admin/websites.ts`: add:
  - `POST /:id/form-submissions/:submissionId/send-email`
  - `POST /:id/form-submissions/bulk/send-email`
  - `DELETE /:id/form-submissions/bulk`
  - `PATCH /:id/form-submissions/bulk/read`
**Files:** `src/models/website-builder/FormSubmissionModel.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/routes/admin/websites.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` — zero errors

### T3: Frontend API functions
**Do:** Add to `frontend/src/api/websites.ts`:
- `sendFormSubmissionEmail(projectId, submissionId)` → `POST /:id/form-submissions/:submissionId/send-email`
- `bulkSendFormSubmissionsEmail(projectId, submissionIds: string[])` → `POST /:id/form-submissions/bulk/send-email`
- `bulkDeleteFormSubmissions(projectId, submissionIds: string[])` → `DELETE /:id/form-submissions/bulk`
- `bulkToggleFormSubmissionsRead(projectId, submissionIds: string[], is_read: boolean)` → `PATCH /:id/form-submissions/bulk/read`
**Files:** `frontend/src/api/websites.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit` — zero errors

### T4: Frontend — multi-select + floating action bar + send button
**Do:** Update `frontend/src/components/Admin/FormSubmissionsTab.tsx`:
- Add `selectedIds: Set<string>` state; `toggleSelect(id)` and `clearSelection()` helpers
- Add `bulkLoading: boolean` state
- Add `Circle`/`CheckCircle` checkboxes on each submission row (left side, same as OrgTasksTab pattern)
- Highlight selected rows (ring-2 ring-blue-100 border-blue-300)
- Import and render `BulkActionBar` from DesignSystem; appears when `selectedIds.size > 0`
- BulkActionBar actions:
  - **Send** (Mail icon) — only renders if any selected item has `is_flagged: true`; calls `bulkSendFormSubmissionsEmail`; shows toast `"Sent X submissions"`
  - **Mark Read/Unread** (Eye/EyeOff icon) — calls `bulkToggleFormSubmissionsRead`; based on whether any selected are unread
  - **Delete** (Trash icon) — calls `bulkDeleteFormSubmissions`; clears selection + refreshes list
- Add individual "Send" icon button in row actions for flagged submissions only (alongside existing read toggle + delete icons)
- Clear `selectedIds` on tab change and after any bulk action
**Files:** `frontend/src/components/Admin/FormSubmissionsTab.tsx`
**Depends on:** T3
**Verify:** Manual: select items → floating bar appears with correct actions; send flagged item → email fires; bulk delete → items removed; bulk toggle → read state flips

## Done
- [ ] `npx tsc --noEmit` — zero errors caused by this work
- [ ] Original form submission send flow unchanged (test form submit → email fires as before)
- [ ] Manual send on single flagged submission triggers email webhook
- [ ] Bulk send skips non-flagged, reports sent/skipped counts via toast
- [ ] Bulk delete removes submissions and refreshes list
- [ ] Bulk read toggle flips read state for all selected
- [ ] Floating bar disappears when selection cleared
- [ ] No regressions in existing form submission read/delete actions
