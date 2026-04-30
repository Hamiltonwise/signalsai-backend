# Location-Scoped Data Fetches

## Why
Multiple data fetches fire before `locationId` is available from the sidebar location context. When `locationId` is null, queries return org-wide data — causing the processing card to show on all locations, and the main dashboard PMS card to flash org-wide totals before the correct location-filtered data arrives.

## What
Guard all location-sensitive data fetches on `locationId` being non-null so they don't fire with org-wide scope during the initial load race.

## Context

**Relevant files:**
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — `checkForActiveAutomation` (line 465), `loadAutomationStatus` (line 518), `checkForNewAutomation` polling (line 675) all call `fetchActiveAutomationJobs(orgId, locationId)` where `locationId` can be null
- `frontend/src/hooks/queries/useDashboardMetrics.ts` — `enabled: !!orgId` (line 18), doesn't gate on `locationId`
- `frontend/src/components/dashboard/focus/PMSCard.tsx` — `usePmsKeyData` (line 63), `enabled: !!orgId`, doesn't gate on `locationId`

## Constraints

**Must:**
- Guard automation fetches in PMSVisualPillars on `locationId` being available (skip when null, still set `automationChecked = true` to not block spinner)
- Guard `useDashboardMetrics` and `usePmsKeyData` on `locationId` being non-null
- Wizard mode must still work (wizard bypasses location context)

**Must not:**
- Change backend endpoints (they correctly accept and filter by location_id)
- Break single-location orgs (locationId is always available quickly for these)

## Tasks

### T1: Guard automation fetches on locationId in PMSVisualPillars
**Do:**
- `checkForActiveAutomation` (line 465): add `!locationId` guard alongside `!organizationId`, set `automationChecked = true` and return
- `loadAutomationStatus` (line 518): add `!locationId` guard alongside `!organizationId`
- `checkForNewAutomation` polling effect (line 670): add `!locationId` to the early-return guard
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Guard dashboard hooks on locationId
**Do:**
- `useDashboardMetrics`: change `enabled: !!orgId` to `enabled: !!orgId && locationId != null`
- `usePmsKeyData` in PMSCard.tsx: change `enabled: !!orgId` to `enabled: !!orgId && locationId != null`
**Files:** `frontend/src/hooks/queries/useDashboardMetrics.ts`, `frontend/src/components/dashboard/focus/PMSCard.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] Automation polling doesn't fire until locationId is available
- [ ] Dashboard PMS card doesn't flash org-wide data before locationId loads
- [ ] Processing card only shows on the location where the upload happened
