# PMS Upload Modal Retirement & 12-Month Aggregator Cap

## Why
`PMSUploadModal` is dead code — `setShowPMSUpload(true)` is never called, so the modal can never open. The `PMSManualEntryModal` now handles file drag-and-drop with multi-file support, column mapping, and month-merge, making the upload modal redundant. Separately, `aggregatePmsData()` fetches ALL approved PMS jobs with no time window, meaning the RE agent payload grows unbounded as clients upload monthly over time. A 12-month sliding window keeps the analysis focused and prevents payload bloat.

## What
1. Remove `PMSUploadModal` from `Dashboard.tsx` (dead code cleanup).
2. Add deprecation comment to `PMSUploadModal.tsx`.
3. Add a 12-month sliding window to `aggregatePmsData()` so only the most recent 12 months of data are sent to agents.

## Context

**Relevant files:**
- `frontend/src/pages/Dashboard.tsx` — imports and renders `PMSUploadModal` (line 19, 127, 498-506)
- `frontend/src/components/PMS/PMSUploadModal.tsx` — the retired modal
- `src/utils/pms/pmsAggregator.ts` — `aggregatePmsData()` builds month map from all approved jobs, sorts at line 414, returns at line 589

**Patterns to follow:**
- `PMSManualEntryModal.tsx` — the replacement modal, already rendered by `PMSVisualPillars.tsx`

## Constraints

**Must:**
- Remove all three `PMSUploadModal` references from Dashboard (import, state, render)
- Preserve `PMSUploadModal.tsx` file with deprecation comment (git history)
- Apply 12-month cap AFTER month dedup and sorting (line 414-416 in aggregator), before source aggregation, so sources/trends/totals reflect only the capped window
- Cap by data month (the `month` key in monthly_rollup), not by job upload timestamp

**Must not:**
- Remove `PMSUploadModal.tsx` from disk (keep for git history, mark deprecated)
- Change `PMSManualEntryModal` or `PMSVisualPillars`
- Modify any API endpoints
- Change the `PmsJobModel` query — we still need all jobs fetched so dedup-by-timestamp works correctly; the cap applies after aggregation

**Out of scope:**
- Adding the `pmsProcessing` localStorage flag to `PMSManualEntryModal` (already uses `pms:job-uploaded` event which `PMSVisualPillars` listens to — sufficient)
- Network optimization (double-sending rows in preview + submit)

## Risk

**Level:** 1

**Risks identified:**
- None material. PMSUploadModal is already unreachable. The 12-month cap is additive — previously all months were included, now the window is bounded.

**Blast radius:**
- Dashboard.tsx — removing dead code, no behavioral change
- `aggregatePmsData()` — called by `service.agent-orchestrator.ts` (line 569). Downstream consumers (RE agent, Summary agent, dashboard metrics) receive fewer months if >12 exist. This is the desired behavior.

## Tasks

### T1: Remove PMSUploadModal from Dashboard.tsx
**Do:**
- Remove import of `PMSUploadModal` (line 19)
- Remove `showPMSUpload` state declaration (line 127)
- Remove `<PMSUploadModal>` render block (lines 498-506)
**Files:** `frontend/src/pages/Dashboard.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Deprecate PMSUploadModal.tsx
**Do:**
- Add deprecation comment at top of file: `@deprecated — Retired 2026-04-30. File upload functionality moved to PMSManualEntryModal which supports multi-file drag-and-drop with column mapping. This file is preserved for git history only.`
**Files:** `frontend/src/components/PMS/PMSUploadModal.tsx`
**Depends on:** none
**Verify:** Visual inspection

### T3: Add 12-month sliding window to aggregatePmsData
**Do:**
- After `months` array is sorted (line 414-416), slice to keep only the last 12 entries
- If months were dropped, add a data quality flag: `"Capped to most recent 12 months of data (N months total available)."`
- The `sources`, `totals`, `sourceTrends`, and `dedupCandidates` computations (lines 380-586) must operate on the capped array, not the full set
**Files:** `src/utils/pms/pmsAggregator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] `PMSUploadModal` no longer imported or rendered in Dashboard.tsx
- [ ] `PMSUploadModal.tsx` has deprecation comment
- [ ] `aggregatePmsData()` returns at most 12 months
- [ ] Sources, totals, and trends are computed from the capped month window only
