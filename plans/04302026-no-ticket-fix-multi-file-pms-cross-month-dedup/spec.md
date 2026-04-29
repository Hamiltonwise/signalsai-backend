# Fix Multi-File PMS Upload Cross-Month Dedup

## Why
When a user drops 3 CSV files (Jan, Feb, Mar) onto the PMS modal, production and referral counts are wrong. Mar shows $167,692 instead of $193,763 — 17 doctor referrals and ~$26K in production vanish. Single-file upload is accurate. Root cause: files are concatenated into one text blob, and the procedure log adapter deduplicates by `patient::practice` with no month boundary, so patients visiting the same doctor across months collapse into one referral.

## What
Two targeted fixes that eliminate cross-month dedup collisions in multi-file uploads. After this, uploading 3 files produces identical per-month results to uploading each file individually.

## Context

**Relevant files:**
- `src/utils/pms/adapters/procedureLogAdapter.ts` — dedup logic, line 158: `const groupKey = \`${patient}::${practiceClean}\``
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — multi-file drop handler, line 632: `texts.filter(Boolean).join("\n")`

**Patterns to follow:**
- `src/utils/pms/adapters/templateAdapter.ts` — already uses month-aware key: `const key = \`${month}::${sourceName}\`` (line 153)

## Constraints

**Must:**
- Preserve single-file dedup behavior (same patient, same doctor, same month = 1 referral)
- Not change the template adapter (already correct)

**Must not:**
- Change the submit path architecture (uploadWithMapping)
- Modify the legacy paste handler flow
- Add new dependencies

**Out of scope:**
- Refactoring the paste handler to process files fully independently (the backend fix makes concatenation safe)
- Consolidating the duplicated `parseDateToMonth` across adapters

## Risk

**Level:** 2

**Risks identified:**
- Dedup key change alters grouping for any multi-month dataset that reaches `applyProcedureLogMapping` → **Mitigation:** This is intentional and correct. The old behavior was a bug — patients returning to the same doctor in a different month ARE separate referral events. The template adapter already works this way.
- Embedded header rows from concatenated files create garbage entries in an "unknown" month → **Mitigation:** T2 strips headers from 2nd+ files, eliminating these rows entirely.

**Blast radius:**
- `applyProcedureLogMapping` is called by: `applyMapping` → `previewResetMapping` (preview endpoint), `uploadWithMapping` (submit endpoint), `processFileUpload` (direct CSV upload endpoint). All paths benefit from the fix.
- Frontend `handleDrop` only affects the PMSManualEntryModal. No other component uses this concatenation logic.

## Tasks

### T1: Add month to procedure log adapter dedup key
**Do:** Change the group key from `${patient}::${practiceClean}` to `${patient}::${month}::${practiceClean}`. Update the comment block (lines 122-127) to reflect the new per-month dedup boundary.
**Files:** `src/utils/pms/adapters/procedureLogAdapter.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Strip duplicate headers from concatenated multi-file drops
**Do:** In `handleDrop`, after reading all file texts in parallel, strip the first line (header) from every file after the first before joining. This prevents embedded headers from becoming garbage data rows.
**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero errors from these changes
- [ ] Manual: upload 3 Fredericksburg CSV files (Jan, Feb, Mar) → modal shows correct per-month totals (Jan: $151,988, Feb: $171,984, Mar: $193,763.01)
- [ ] Manual: upload single Mar file → same result as Mar tab in 3-file upload
- [ ] No regressions in single-file upload flow
