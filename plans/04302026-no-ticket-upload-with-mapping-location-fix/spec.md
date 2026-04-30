# uploadWithMapping Location Fix + Processing Card Scoping

## Why
The `uploadWithMapping` backend endpoint ignores `body.locationId` and always resolves to the primary location via `resolveLocationId(orgId)`. This caused job 140 (One Endodontics, Fredericksburg upload) to land on Falls Church. Additionally, the `pms:job-uploaded` custom event is org-scoped, so all location views react to it — causing a processing card flash/flicker on locations that have no PMS data.

## What
1. Fix `uploadWithMapping` endpoint to read `body.locationId` before falling back to `resolveLocationId()`.
2. Scope the `pms:job-uploaded` event by including `locationId` so only the relevant location's `PMSVisualPillars` reacts.
3. Reassign job 140 to the correct location (Fredericksburg, location_id=16) via a data fix.

## Context

**Relevant files:**
- `src/controllers/pms/PmsController.ts` — `uploadWithMapping()` at line 796, hardcodes `resolveLocationId(orgId)` at line 867
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — dispatches `pms:job-uploaded` event at line 870 without `locationId`
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — listens for `pms:job-uploaded` at line 281, sets `localProcessing = true` for any matching domain

**Patterns to follow:**
- `pms-upload.service.ts` `processFileUpload()` at line 111: `passedLocationId ?? await resolveLocationId(organizationId)` — same pattern to apply in `uploadWithMapping`
- `pms-upload.service.ts` `processManualEntry()` at line 34: same pattern

**Reference file:** `pms-upload.service.ts` — both `processManualEntry` and `processFileUpload` correctly use `passedLocationId ?? resolveLocationId()`

## Constraints

**Must:**
- Match the `passedLocationId ?? resolveLocationId()` pattern used by sibling upload paths
- Backward-compatible: if `locationId` is absent from event detail, PMSVisualPillars still reacts (fallback to current behavior)
- Data fix for job 140: update `location_id` from 14 to 16

**Must not:**
- Change the `aggregateKeyData` or `PmsJobModel` query methods (already correctly location-scoped)
- Modify `PMSUploadModal` (deprecated)
- Change the localStorage processing flag key (it's being phased out naturally as deprecated modals stop being used)

**Out of scope:**
- Processing card polling interval tuning
- localStorage flag deprecation (separate cleanup)

## Risk

**Level:** 1

**Risks identified:**
- None material. Identical pattern exists in sibling upload paths. Event scoping is additive with fallback.

**Blast radius:**
- `uploadWithMapping` — called from `PMSManualEntryModal` submit (mapping path). Only consumer.
- `pms:job-uploaded` event — dispatched by `PMSManualEntryModal` (line 870), `TemplateUploadModal`, `DirectUploadModal`. Listened by `PMSVisualPillars`.

## Tasks

### T1: Fix uploadWithMapping to read body.locationId
**Do:**
- At line 867 of `PmsController.ts`, replace `const locationId = await resolveLocationId(orgId)` with reading `body.locationId` first, falling back to `resolveLocationId(orgId)` if absent
- Parse as integer, validate is number
**Files:** `src/controllers/pms/PmsController.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Include locationId in pms:job-uploaded event
**Do:**
- In `PMSManualEntryModal.tsx`, add `locationId` to the event detail at line 872 (mapping path) and line 942 (legacy path)
- In `PMSVisualPillars.tsx` event handler at line 281, check `detail.locationId`: if present and doesn't match this component's `locationId` prop, skip setting `localProcessing = true` (still call `loadKeyData` for data freshness)
**Files:** `frontend/src/components/PMS/PMSManualEntryModal.tsx`, `frontend/src/components/PMS/PMSVisualPillars.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] `uploadWithMapping` reads `body.locationId` and falls back to `resolveLocationId()`
- [ ] `pms:job-uploaded` event includes `locationId` in detail
- [ ] `PMSVisualPillars` only shows processing card for matching location
