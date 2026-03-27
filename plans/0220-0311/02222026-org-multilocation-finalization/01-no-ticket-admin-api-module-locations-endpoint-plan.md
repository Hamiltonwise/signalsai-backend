# Plan 01 — Admin Organizations API Module + Admin Locations Endpoint

## Problem Statement

`OrganizationManagement.tsx` uses raw `fetch()` with `localStorage.getItem("auth_token")` — 5+ inline fetch sites. This bypasses the `api/index.ts` pattern (`apiGet`/`apiPatch`/`apiDelete` with `getPriorityItem`). Also, no admin endpoint exists to get locations for an arbitrary org (existing `GET /api/locations` is RBAC-scoped to the logged-in user).

## Context Summary

- Frontend API pattern: `api/index.ts` exposes `apiGet`, `apiPost`, `apiPatch`, `apiDelete` — all call `getCommonHeaders()` which uses `getPriorityItem("auth_token")`. Already pilot-mode-aware.
- All other admin API modules (`api/tasks.ts`, `api/pms.ts`, `api/agentOutputs.ts`) follow this pattern.
- `OrganizationManagement.tsx` is the only admin page using raw `fetch()`.
- Backend admin org endpoints live in `routes/admin/organizations.ts` with `authenticateToken` + `superAdminMiddleware`.
- `LocationModel.findByOrganizationId(orgId)` and `GooglePropertyModel.findByLocationId(locationId)` already exist.

## Existing Patterns to Follow

- `api/locations.ts` — typed interfaces, `apiGet` wrapper, exported typed functions.
- `routes/admin/organizations.ts` + `AdminOrganizationsController.ts` — route → controller → model pattern.
- `routes/locations.ts` lines 36-44 — Promise.all over locations to fetch properties for each.

## Proposed Approach

### Frontend — Create `signalsai/src/api/admin-organizations.ts`

Typed functions using `apiGet`/`apiPatch`/`apiDelete` from `api/index.ts`:

- `adminListOrganizations()` → `GET /api/admin/organizations`
- `adminGetOrganization(id)` → `GET /api/admin/organizations/:id`
- `adminUpdateOrganizationName(id, name)` → `PATCH /api/admin/organizations/:id`
- `adminUpdateOrganizationTier(id, tier)` → `PATCH /api/admin/organizations/:id/tier`
- `adminDeleteOrganization(id)` → `DELETE /api/admin/organizations/:id`
- `adminGetOrganizationLocations(orgId)` → `GET /api/admin/organizations/:id/locations` (new)
- `adminStartPilotSession(userId)` → `POST /api/admin/pilot/:userId`

### Backend — Add `GET /api/admin/organizations/:id/locations`

- Register in `routes/admin/organizations.ts` BEFORE `/:id` route (route ordering critical)
- Add `getOrgLocations` handler to `AdminOrganizationsController.ts`
- Uses `LocationModel.findByOrganizationId(orgId)` + `GooglePropertyModel.findByLocationId()` per location
- Returns `{ success, locations: [{ ...location, googleProperties[] }], total }`
- Guarded by `authenticateToken` + `superAdminMiddleware`

## Risk Analysis

- **Route ordering (Level 2):** `/:id/locations` must be registered before `/:id`. If misordered, Express matches "locations" as `:id` → NaN → 400.
- **N+1 on googleProperties (Level 1):** Uses `Promise.all` — acceptable for small location counts (1-5 per org).

## Definition of Done

- `signalsai/src/api/admin-organizations.ts` exists with all 7 typed functions
- `GET /api/admin/organizations/:id/locations` returns locations with embedded googleProperties
- Route ordering verified — existing org endpoints unchanged
