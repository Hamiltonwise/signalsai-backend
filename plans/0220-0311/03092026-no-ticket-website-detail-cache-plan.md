# WebsiteDetail TanStack Query Cache

## Problem Statement

`/admin/websites/:uuid` loads fresh on every visit. Navigating away and back shows a full loading spinner even though the data hasn't changed.

## Context Summary

- `WebsiteDetail.tsx` calls `fetchWebsiteDetail(id)` on mount → `useState` for website/loading/error
- 4 places set website data: initial load, status polling, page-gen polling, domain modal callback
- 7 places call `loadWebsite()` after mutations (link org, delete page, etc.)
- Polling uses `setWebsite(response.data)` directly — must update query cache instead
- QUERY_KEY `adminWebsiteDetail(uuid)` already exists from the batch 2 migration

## Existing Patterns to Follow

- Same `initialData + initialDataUpdatedAt` pattern as all other admin query hooks
- Invalidation hooks for mutation callsites
- Polling updates via `queryClient.setQueryData()` (new pattern for this component)

## Proposed Approach

1. Add `useAdminWebsiteDetail(uuid)` hook to `useAdminQueries.ts`
2. In WebsiteDetail: replace `useState` for website/loading/error with query hook
3. Replace `loadWebsite()` with `invalidateWebsite()`
4. Replace polling `setWebsite(response.data)` with `queryClient.setQueryData()`
5. Replace domain modal `setWebsite(res.data)` with `queryClient.setQueryData()`

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Polling writes to cache directly | Level 1 | `queryClient.setQueryData` is the standard TQ pattern for optimistic/direct updates |
| Editor state depends on `website` | Level 1 | `website` is still read from TQ data — same object shape |

## Definition of Done

- [x] WebsiteDetail shows cached data instantly on revisit
- [x] Polling still works (updates query cache)
- [x] All mutations invalidate correctly
- [x] TypeScript + Vite build pass
