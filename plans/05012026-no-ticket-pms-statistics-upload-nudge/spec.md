# PMS Statistics — Replace Duplicate PMSCard with Upload Nudge

## Why
The `/pmsStatistics` page renders a standalone `<PMSCard />` that duplicates data already shown in the PMS Vitals section below. The intent was to replicate the dashboard's "Ready for the next focus?" nudge card — not the full PMSCard.

## What
Remove the duplicate PMSCard. Add an inline upload nudge (matching the dashboard's `PmsUploadNudge` design) that appears when PMS data is stale, with a CTA that scrolls to the ingestion hub.

## Context

**Relevant files:**
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — the pmsStatistics page component; line 1241 renders the duplicate `<PMSCard />`
- `frontend/src/components/dashboard/DashboardOverview.tsx` — contains `PmsUploadNudge` (lines 78-102), the design reference
- `frontend/src/utils/pmsFocusPeriod.ts` — `derivePmsFocusPeriod(months, currentDate)` returns `PmsFocusPeriod` with `isStale`, `nudgeTitle`, `nudgeBody`
- `frontend/src/components/dashboard/focus/PMSCard.tsx` — the component being removed from this page

**Patterns to follow:**
- `PmsUploadNudge` in `DashboardOverview.tsx` — exact styling and structure to replicate

**Reference file:** `frontend/src/components/dashboard/DashboardOverview.tsx` lines 78-102

## Constraints

**Must:**
- Match the dashboard nudge's visual design exactly (rounded card, orange label, serif title, muted body, orange CTA button)
- Use `derivePmsFocusPeriod` with existing `keyData.months` — no new API call
- CTA scrolls to ingestion hub via `scrollToIngestionHub` (not a link to `/pmsStatistics`)
- Only show when `!isLoading && !error && keyData && period.isStale`

**Must not:**
- Extract a shared component — single use, inline JSX
- Modify any other page or component
- Change the PmsDashboardSurface or its rendering conditions

**Out of scope:**
- Refactoring PmsUploadNudge into a shared component (future work if needed)
- Changing the dashboard's nudge behavior

## Risk

**Level:** 1

**Risks identified:**
- None meaningful. Removing one JSX line + adding a conditional card.

**Blast radius:** `/pmsStatistics` page only

## Tasks

### T1: Replace PMSCard with upload nudge
**Do:**
1. Remove the `<PMSCard />` import (line 41) and rendering (line 1241)
2. Import `derivePmsFocusPeriod` from `../../utils/pmsFocusPeriod`
3. Derive `period` from `keyData.months` using `useMemo`
4. Add nudge JSX in place of the PMSCard, shown when `period?.isStale`
5. CTA button calls `scrollToIngestionHub` on click

**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`, visual check on `/pmsStatistics`

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Duplicate PMSCard no longer renders on `/pmsStatistics`
- [ ] Upload nudge appears when PMS data is stale (matching dashboard design)
- [ ] CTA scrolls to ingestion hub
- [ ] No regressions on main dashboard's `PmsUploadNudge`
