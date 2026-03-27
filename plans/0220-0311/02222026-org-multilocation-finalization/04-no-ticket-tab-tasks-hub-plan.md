# Plan 04 — Tab: Tasks Hub

## Problem Statement

Tasks Hub tab needs to show tasks filtered by org + location. The backend `TaskModel.listAdmin()` already supports `location_id` in its filter type, but `TaskFilteringService.parseAdminFilters()` does NOT parse `location_id` from query params.

## Context Summary

- `GET /api/tasks/admin/all` accepts `organization_id` but not `location_id`.
- `TaskAdminFilters` type in `TaskModel.ts` includes `location_id?: number`.
- `TaskModel.listAdmin()` applies `WHERE location_id = ?` if the filter has it.
- Gap: `TaskFilteringService.parseAdminFilters()` does not read `query.location_id`.
- Frontend `FetchActionItemsRequest` in `types/tasks.ts` also missing `location_id`.

## Existing Patterns to Follow

- `ActionItemsHub.tsx` — data display patterns, status badges, approval toggles.
- `fetchAllTasks` from `api/tasks.ts` — reuse directly.
- `TaskFilteringService.parseAdminFilters()` — existing filter parsing to extend.

## Proposed Approach

### Backend — `TaskFilteringService.ts`

Add `location_id` parsing to `parseAdminFilters()`:
```typescript
if (query.location_id) {
  filters.location_id = parseInt(query.location_id, 10);
}
```

### Frontend — `signalsai/src/types/tasks.ts`

Add `location_id?: number` to `FetchActionItemsRequest`.

### Frontend — Create `signalsai/src/components/Admin/OrgTasksTab.tsx`

- Props: `organizationId: number, locationId: number | null`
- Uses `fetchAllTasks({ organization_id, location_id })` from `api/tasks.ts`
- Filters within tab: status, category, is_approved, agent_type
- Pagination, empty state
- Re-fetches when `locationId` prop changes

### Wire into `OrganizationDetail.tsx`

Tab `tasks` renders `<OrgTasksTab organizationId={orgId} locationId={selectedLocation?.id ?? null} />`

## Risk Analysis

- **Level 1:** Backend filter addition is purely additive — existing callers not passing `location_id` are unaffected.

## Definition of Done

- Tasks tab renders filtered by org + location
- `location_id` filter param accepted by `GET /api/tasks/admin/all`
- Pagination and status filters work
- Empty state when no tasks
