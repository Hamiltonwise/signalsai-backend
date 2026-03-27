# Plan 02 — Organization List Page Revamp

## Problem Statement

`OrganizationManagement.tsx` (884 lines) mixes list + accordion detail + modals + pilot launch into a single component. Need to convert to a clean navigation list where each row links to `/admin/organizations/:id`.

## Context Summary

- Current UX: accordion list — each org row expands inline to reveal users, connections, website, tier management, danger zone.
- Target UX: card/table list where each row navigates to a dedicated detail page.
- Admin routing lives in `Admin.tsx` → `AdminWithLayout` → `<Routes>`.
- Pattern to follow: `WebsitesList` → navigates to `WebsiteDetail`.

## Existing Patterns to Follow

- `WebsitesList.tsx` — navigation list pattern with `Link` to detail page.
- Framer Motion `staggerContainer` + `cardVariants` for list animation.
- `AdminPageHeader`, `Badge`, `EmptyState` from `components/ui/DesignSystem.tsx`.
- `api/admin-organizations.ts` (from Plan 01) for all data fetching.

## Proposed Approach

### Modify `signalsai/src/pages/admin/OrganizationManagement.tsx`

- Replace raw `fetch()` calls with `adminListOrganizations()` and `adminUpdateOrganizationName()`
- Remove accordion state: `expandedOrgId`, `orgDetails`, `loadingDetails`
- Remove tier/delete modals (move to detail page in Plan 03)
- Remove pilot session launch (moves to detail page)
- Each org row = `Link to={/admin/organizations/${org.id}}`
- Row shows: name (editable inline), tier badge, domain, user count, GBP status, chevron
- Inline name edit uses `stopPropagation()` to prevent navigation

### Modify `signalsai/src/pages/Admin.tsx`

- Add route: `<Route path="organizations/:id" element={<OrganizationDetail />} />`
- Import `OrganizationDetail` (created in Plan 03)

## Risk Analysis

- **Level 2:** Tier/delete actions temporarily inaccessible between Plan 02 and Plan 03 shipping. Plans 02 and 03 should be executed together.

## Definition of Done

- Org list is a navigation list, no accordion
- Each row navigates to `/admin/organizations/:id`
- Inline name editing works without triggering navigation
- No raw `fetch()` calls remain
