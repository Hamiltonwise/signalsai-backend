# PMS Upload Multi-Location Fix

## Why
PMS file uploads via `PMSUploadModal` always attribute data to the primary location, even when the user has selected a different location in the sidebar. The sidebar location context is already threaded correctly through manual entry and wizard modals — this modal is the only one that drops it. Additionally, `resolveLocationId()` returns `null` if no primary location exists, which would silently cause org-wide aggregation for any downstream consumer.

## What
1. Thread `locationId` through `PMSUploadModal` so file uploads respect the sidebar's selected location.
2. Add a first-location fallback to `resolveLocationId()` so it never returns `null` for orgs that have locations.

## Context

**Relevant files:**
- `frontend/src/components/PMS/PMSUploadModal.tsx` — file upload modal, missing `locationId` prop
- `frontend/src/pages/Dashboard.tsx` — renders `PMSUploadModal` at line 498 without `locationId`
- `src/utils/locationResolver.ts` — `resolveLocationId()`, no fallback when primary is missing
- `src/models/LocationModel.ts` — `findByOrganizationId()` at line 35, orders by `is_primary DESC` (first result is primary or first alphabetical)

**Patterns to follow:**
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — sibling modal that correctly accepts and forwards `locationId`
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — parent that passes `locationId` to manual entry and wizard modals

**Reference file:** `PMSManualEntryModal.tsx` — identical prop pattern for `locationId`

## Constraints

**Must:**
- Match the existing `locationId?: number | null` prop convention used by sibling modals
- Forward `locationId` through both the file upload API call and the inner `PMSManualEntryModal` render
- `resolveLocationId()` fallback must use `findByOrganizationId()` which already sorts by `is_primary DESC`

**Must not:**
- Add a location selector UI to the modal (sidebar already handles this)
- Change `PMSManualEntryModal` (already correct)
- Modify any backend API endpoints (they already accept `locationId`)

**Out of scope:**
- Form submissions location scoping (org-wide by design)
- Admin page PMS flows

## Risk

**Level:** 1

**Risks identified:**
- None material. Identical pattern exists in two sibling modals.

**Blast radius:** `PMSUploadModal` is rendered from `Dashboard.tsx` only. `resolveLocationId()` is called from orchestrator, PMS upload service, agents controller — the fallback only adds coverage where `null` was returned before.

## Tasks

### T1: Thread `locationId` through PMSUploadModal
**Do:**
- Add `locationId?: number | null` to `PMSUploadModalProps` interface (line 16)
- Destructure `locationId` in component params (line 25)
- Pass `locationId` to `uploadPMSData()` call (line 100)
- Pass `locationId` to inner `<PMSManualEntryModal>` render (line 177)

**Files:** `frontend/src/components/PMS/PMSUploadModal.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Pass `locationId` from Dashboard to PMSUploadModal
**Do:**
- Add `locationId={locationId}` prop to `<PMSUploadModal>` at line 498

**Files:** `frontend/src/pages/Dashboard.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add first-location fallback to resolveLocationId
**Do:**
- After the primary location check fails, query `LocationModel.findByOrganizationId(organizationId)` and return the first result's `id` if any exist
- Adjust the warning log to distinguish "no primary, using first" from "no locations at all"

**Files:** `src/utils/locationResolver.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] File upload path sends `locationId` in the API request body
- [ ] Switching to manual entry from upload modal preserves `locationId`
- [ ] `resolveLocationId()` returns a location ID for any org that has at least one location
