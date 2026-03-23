# Fix 9 TypeScript Errors

## Problem Statement
`tsc` reports 9 errors across 5 files — unused imports/destructured vars, a type mismatch on `onClick`, and a `null` vs `undefined` type gap.

## Context Summary
All errors are in the frontend (`signalsai/src`). No architectural issues — just cleanup.

## Existing Patterns to Follow
- Unused imports/vars get removed
- `onClick` handlers wrap the call: `onClick={() => fn()}`

## Proposed Approach

1. **DashboardOverview.tsx:811** — `onClick={refetch}` type mismatch. Wrap: `onClick={() => refetch()}`
2. **MindsList.tsx:19** — Remove unused `type Mind` import
3. **OrganizationDetail.tsx:88** — Remove unused `error: orgError` destructure
4. **OrganizationManagement.tsx:41** — Remove unused `isFetching` destructure
5. **TemplatesList.tsx:20** — Remove unused `Template` type import
6. **TemplatesList.tsx:49** — Remove unused `isFetching` and `refetch: refetchTemplates` destructures
7. **Settings.tsx:54** — `orgId` is `number | null | undefined`, but `usePmsStatus` wants `number | undefined`. Fix: `usePmsStatus(orgId ?? undefined)`
8. **Settings.tsx:58** — `pmsData?.data?.months?.length` possibly undefined. Fix: add nullish coalesce `(pmsData?.data?.months?.length ?? 0) > 0`

## Risk Analysis
Level 1 — All trivial fixes. No behavioral changes.

## Definition of Done
`tsc --noEmit` passes with 0 errors for these 9 issues.
