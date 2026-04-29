# PMS Modal: Multi-Month Merge Instead of Replace

## Why
When a user drops/pastes a second CSV into the PMS modal, `handleParsedPaste` calls `setMonths(parsedMonths)` which wipes all previously loaded data. If the user had January data and drops February, January is lost. The user expects additive behavior: new months append, existing months prompt before replacing.

## What
Replace the single-line `setMonths(parsedMonths)` wipe with a merge-or-confirm flow:
1. Parse the incoming CSV (existing flow, no change).
2. After mapping is finalized, classify each incoming month as **new** (not in current state) or **conflict** (already has data).
3. If all months are new → merge silently (append to existing `months` state).
4. If any months conflict → show a confirmation dialog listing affected months before replacing those specific buckets.
5. Months NOT in the incoming data are never touched.

Frontend-only change. No backend, no API, no database changes.

## Context

**Relevant files:**
- `frontend/src/components/PMS/PMSManualEntryModal.tsx:279-304` — `handleParsedPaste`: the callback invoked after parse completes. Line 282 `setMonths(parsedMonths)` is the wipe. Line 299 triggers `runMappingPreview` (column mapping happens AFTER this point, and can change which month rows belong to).
- `frontend/src/components/PMS/PMSManualEntryModal.tsx:346-388` — `runMappingPreview`: after mapping resolves, `parsedPreview` updates and an effect (lines 423-442) rebuilds `months` from the mapping result. This is the SECOND point where months get set — the merge logic must live here too (or downstream of it).
- `frontend/src/components/PMS/PMSManualEntryModal.tsx:423-442` — effect that converts `parsedPreview` into `MonthBucket[]` and calls `setMonths`. This is the final "commit to UI" for mapping-inferred CSVs.
- `frontend/src/components/PMS/PasteConfirmDialog.tsx` — currently shows parse confirmation + progress. Needs a post-parse "month conflict" view.
- `frontend/src/components/PMS/usePasteHandler.ts:68-91` — `rowsToBuckets`: groups `SanitizationRow[]` by `.month` into `MonthBucket[]`. Already produces per-month buckets — no change needed.

**Patterns to follow:**
- `PasteConfirmDialog` already has a two-phase UI (parsing → sanitizing progress). The month-conflict view is a third phase that shows after both complete.
- `MonthBucket` type already has `.month: string` (YYYY-MM format) as the key for grouping. Merge logic keys on this.

**Reference file:** `PasteConfirmDialog.tsx` for the dialog chrome; `handleParsedPaste` for the callback signature.

## Constraints

**Must:**
- Preserve existing "clear all" functionality — user can still manually clear via the existing clear button.
- Preserve the column-mapping flow — merge/confirm must happen AFTER mapping finalizes, since mapping can change month assignments.
- Preserve the manual-entry flow — manually added months are never auto-replaced; they're treated the same as parsed months in the conflict check.
- Show per-month granularity in the conflict dialog: "February 2026 will be replaced. March 2026 is new." — not a blanket yes/no.
- Include a warning about manual edits: "This will replace your current February data, including any manual edits."

**Must not:**
- Touch backend (no API changes, no new endpoints).
- Change the submit path (both `uploadWithMapping` and `submitManualPMSData` receive the same `MonthBucket[]` shape as today).
- Auto-merge rows within a month (if user drops a second January CSV, it replaces January entirely, not appends source rows).
- Silently drop data — every replacement must be user-confirmed.

**Out of scope:**
- Row-level dedup within a month (source name matching across two drops for the same month).
- Undo/revert after confirming a replacement.
- Backend-side multi-job merging (each submit is still one `pms_jobs` row).

## Risk

**Level:** 1

**Risks identified:**
- **Column-mapping timing.** Initial parse produces preliminary month assignments. If the user then changes the date-column mapping in the drawer, month assignments change. The merge/confirm must fire on the FINAL month assignment, not the preliminary one. **Mitigation:** T2 explicitly places the merge logic in the `parsedPreview` effect (lines 423-442), which fires after mapping resolves — not in `handleParsedPaste` (which fires before mapping).
- **State complexity.** `months` state now has three sources: manual entry, initial parse, and mapping-override. Merge logic must treat all existing months the same regardless of origin. **Mitigation:** Merge keys on `month.month` string only — doesn't care how the bucket was created.

**Blast radius:**
- `handleParsedPaste` callback shape may change (needs to pass incoming months to a staging area instead of directly to `setMonths`). Only called from `usePasteHandler` → contained.
- `PasteConfirmDialog` gets a new view state — existing "parsing" and "sanitizing" states untouched.

## Tasks

### T1: Add month-merge logic to PMSManualEntryModal
**Do:** Replace `setMonths(parsedMonths)` in `handleParsedPaste` (line 282) with a staging step:
1. Store incoming `parsedMonths` in a new state variable (e.g., `pendingMonths: MonthBucket[] | null`).
2. Compare `pendingMonths` against current `months` by `.month` key.
3. Classify each incoming month: `{ month: string, status: "new" | "conflict", existingRowCount?: number }`.
4. If zero conflicts → merge immediately: `setMonths(prev => [...prev.filter(m => !incomingMonthKeys.has(m.month)), ...parsedMonths])`.
5. If any conflicts → set `showMonthConflictDialog: true` to trigger the confirm UI (T2).
6. On confirm → apply the merge (same as step 4). On cancel → discard `pendingMonths`.

Apply the same logic in the `parsedPreview` effect (lines 423-442) for mapping-inferred CSVs — this is where months get finalized after column mapping.

**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. Drop a January CSV → months state has January. Drop a February CSV → months state has January + February (no wipe). Drop another January CSV → conflict triggers (tested in T2).

### T2: Extend PasteConfirmDialog with month-conflict view
**Do:** Add a new view state to `PasteConfirmDialog` that renders after parse + sanitize complete, when `pendingMonths` has conflicts. The view shows:
- List of incoming months, each with an icon:
  - ✅ "March 2026 — new" (green, will be added)
  - ⚠️ "February 2026 — will replace existing data (N rows, including any manual edits)" (amber)
- "Confirm & Merge" button (calls `onConfirmMerge`)
- "Cancel" button (discards pending months)
- If ALL months are new, this view is skipped entirely (merge happens silently in T1).

Props to add: `conflictMonths: Array<{ month: string, status: "new" | "conflict", existingRowCount?: number }>`, `onConfirmMerge: () => void`, `onCancelMerge: () => void`.

**Files:** `frontend/src/components/PMS/PasteConfirmDialog.tsx`
**Depends on:** T1 (provides the conflict data)
**Verify:** `npx tsc --noEmit` zero errors. Drop a CSV targeting an existing month → dialog shows the month with ⚠️ indicator and row count. Confirm → data replaces. Cancel → previous data preserved.

### T3: Handle mapping-change month reassignment
**Do:** In the `parsedPreview` effect (lines 423-442), when the user edits column mapping and months change, re-run the merge classification from T1 against the updated months. If the mapping change causes NEW conflicts (e.g., user switches date column and data moves from March to February which already has data), show the conflict dialog again.

**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`
**Depends on:** T1, T2
**Verify:** Drop a multi-month CSV. In the mapping drawer, change the date column mapping so rows shift to a different month that already has data. Confirm the conflict dialog appears with the updated month assignments.

## Done
- [ ] `npx tsc --noEmit` zero errors (frontend)
- [ ] Manual test: drop January CSV → drop February CSV → both months visible in tabs. No data lost.
- [ ] Manual test: drop January CSV → drop another January CSV → conflict dialog shows "January 2026 — will replace existing data." Confirm → new data replaces. Cancel → old data preserved.
- [ ] Manual test: drop multi-month CSV (Feb + Mar + Apr) when Feb already has data → dialog shows Feb as ⚠️ conflict, Mar + Apr as ✅ new. Confirm → all three months in tabs, Feb replaced.
- [ ] Manual test: after mapping change in drawer that shifts months → conflict detection re-runs correctly.
- [ ] Existing "clear all" functionality still works.
- [ ] Submit path unchanged — final `MonthBucket[]` shape identical to pre-change.
