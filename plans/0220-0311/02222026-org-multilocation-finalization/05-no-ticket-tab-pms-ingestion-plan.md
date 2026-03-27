# Plan 05 — Tab: PMS Ingestion

## Problem Statement

PMS tab needs to show job history and key metrics for the org. Existing endpoints already accept `organization_id` — no backend changes needed.

## Context Summary

- `GET /api/pms/jobs?organization_id=X` — paginated job list with filters.
- `GET /api/pms/keyData?organization_id=X` — aggregate metrics (months, sources, totals).
- `IPmsJob` has both `organization_id` and `location_id` fields.
- Existing `PMSAutomationCards.tsx` is a full standalone page with upload/retry controls.

## Existing Patterns to Follow

- `PMSAutomationCards.tsx` — job status display, badge patterns.
- `fetchPmsJobs` and `fetchPmsKeyData` from `api/pms.ts` — reuse directly.

## Proposed Approach

### Create `signalsai/src/components/Admin/OrgPmsTab.tsx`

- Props: `organizationId: number`
- Key metrics row from `fetchPmsKeyData(organizationId)`: total jobs, latest job date/status, months of data
- Paginated job list from `fetchPmsJobs({ organization_id })`: id, timestamp, status badge, approval status
- Read-only — no upload controls, no retry buttons (those belong on the dedicated PMS Automation page)
- Empty state

### Wire into `OrganizationDetail.tsx`

Tab `pms` renders `<OrgPmsTab organizationId={orgId} />`

## Risk Analysis

- **Level 1:** Read-only view, no mutations, no backend changes.

## Definition of Done

- PMS tab shows key metrics + paginated job list
- Pagination works, empty state works
- No mutation controls exposed
