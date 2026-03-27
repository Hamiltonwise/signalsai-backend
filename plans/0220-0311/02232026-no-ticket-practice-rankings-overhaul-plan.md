# Practice Rankings Overhaul Plan

## Problem Statement

The practice rankings feature needs updates to align with the new location-as-source-of-truth architecture and improve the admin/user experience:

1. **Admin dashboard list** shows generic batch labels — needs org name + location subtext
2. **No month grouping** — batches are a flat list instead of grouped by month (cards)
3. **User dashboard** shows a location selection grid when multiple locations exist — should show only the active location's ranking (controlled by sidebar switcher)
4. **Admin single org detail page** has no practice ranking tab
5. **Agent tabs** in org detail page have no icons

## Context Summary

### Schema Status (Clean)
- `google_account_id` column: **DROPPED** (migration `20260221000005`)
- `domain` column: **DROPPED** (migration `20260222000008`)
- `organization_id` + `location_id`: proper FKs with indexes
- No stale references remain in active code

### Existing Patterns
- Org detail page tabs: `OrgTasksTab`, `OrgPmsTab`, `OrgAgentOutputsTab` — all accept `organizationId` + `locationId` props
- Backend `/list` returns flat array; frontend groups by `batch_id`
- Backend `/latest` returns all locations for latest batch; frontend renders location selection UI
- `RankingsDashboard` already accepts `locationId` prop and passes it to API

## Proposed Approach

### Unit 1 — Backend: Enhance `/list` and `/latest` Endpoints

**`GET /list` changes:**
- JOIN `organizations` and `locations` tables to include `organization_name` and `location_name` in response
- Accept optional `location_id` query param for filtering

**`GET /latest` changes:**
- Accept optional `locationId` query param
- When provided, filter all queries (latest batch lookup, batch rankings, previous analysis) by `location_id`

**Files modified:**
- `signalsai-backend/src/controllers/practice-ranking/PracticeRankingController.ts`

### Unit 2 — Frontend Admin: Org Name + Location Subtext + Month Grouping

**`PracticeRanking.tsx` changes:**
- Add `organization_name`, `location_name`, `location_id` to `RankingJob` interface
- Add `organization_name` to `BatchGroup` interface
- Add `MonthGroup` interface for month-level grouping
- Compute `monthGroups` from `groupedBatches` using `useMemo`
- Render month cards containing batches, replacing the flat list
- Batch headers show `organization_name` (from JOIN) instead of `getOrgName()` lookup
- Batch subtext shows week label + date + location names

**Files modified:**
- `signalsai/src/pages/admin/PracticeRanking.tsx`

### Unit 3 — Frontend User Dashboard: Single Location Only

**`RankingsDashboard.tsx` changes:**
- Remove `selectedLocationId` state
- Remove location selection grid (the large card-based selector for multi-location)
- Use `rankings[0]` directly as `selectedRanking` (backend filters by `locationId`)
- Update header to show location name instead of "X Locations"
- Remove unused imports (`Building2`, `CheckCircle2`)

**Files modified:**
- `signalsai/src/components/dashboard/RankingsDashboard.tsx`

### Unit 4 — Admin Org Detail: Practice Ranking Tab

**Create `OrgRankingsTab.tsx`:**
- Follows same pattern as `OrgPmsTab` / `OrgAgentOutputsTab`
- Accepts `organizationId` + `locationId` props
- Fetches from `/api/admin/practice-ranking/list?organization_id=X&location_id=Y`
- Shows key metrics (total rankings, completed, avg score)
- Lists batches with expandable job rows
- Expanded view shows score grid, ranking factors, top competitors, LLM summary

**Modify `OrganizationDetail.tsx`:**
- Add "Rankings" to `TAB_KEYS` and `TAB_LABELS`
- Import and render `OrgRankingsTab` component
- Add icons to all tab buttons

**Files created:**
- `signalsai/src/components/Admin/OrgRankingsTab.tsx`

**Files modified:**
- `signalsai/src/pages/admin/OrganizationDetail.tsx`

### Unit 5 — Icons on Agent Tabs

Add lucide-react icons to each tab button in `OrganizationDetail.tsx`:
- Tasks Hub → `CheckSquare`
- PMS Ingestion → `Database`
- Rankings → `Trophy`
- Proofline → `MessageSquare`
- Summary → `FileText`
- Opportunity → `TrendingUp`
- CRO → `Target`
- Referral Engine → `Share2`

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|-----------|
| `/list` JOIN performance | Level 1 | LEFT JOIN on indexed FKs, existing row counts are small |
| Removing location selector breaks wizard demo | Level 2 | Demo data still works — wizard creates a single demo ranking |
| `organization_name` NULL for old records | Level 1 | LEFT JOIN returns NULL gracefully, fallback to `getOrgName()` |

## Definition of Done

- Backend `/list` returns `organization_name` and `location_name`; accepts `location_id` filter
- Backend `/latest` respects `locationId` query param
- Admin rankings page shows org name + location subtext per batch, grouped by month cards
- User dashboard shows only active location's ranking (no location selection grid)
- Admin org detail page has "Rankings" tab with expandable batch/job list
- All agent tabs in org detail have icons
- `npx tsc --noEmit` clean in both frontend and backend
