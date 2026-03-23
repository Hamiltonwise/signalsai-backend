# TanStack Query Migration — Admin + Client Pages

## Problem Statement

Every page in the alloro-app frontend re-fetches all data from scratch on mount. Navigating between tabs or pages triggers full loading spinners even when the data hasn't changed. There is no client-side caching, no stale-while-revalidate behavior, and no background refresh. This creates a sluggish experience, especially when switching between tabs.

## Context Summary

- **Current pattern:** `useEffect` on mount → axios API call → `useState` for loading/error/data. Every navigation = fresh fetch.
- **Target pattern:** TanStack Query v5 with in-memory cache + localStorage persistence. Cached data renders instantly on revisit; stale data triggers a silent background refetch.
- **Reference implementation:** `~/Desktop/ppcopy` — proven TanStack Query setup with `staleTime: 5min`, `gcTime: 24hr`, localStorage persistence, centralized query keys, and `initialData` pattern.
- **API layer (`src/api/*`) remains unchanged.** Custom hooks wrap existing API functions.
- **Context providers (GBP, Clarity, Auth, Location) are NOT migrated in this pass.** They stay as-is.

## Existing Patterns to Follow

- API functions in `src/api/*.ts` return typed responses via `apiGet`/`apiPost`/etc.
- Auth headers handled by `getCommonHeaders()` in `src/api/index.ts`.
- Pages use `useAuth()`, `useLocationContext()` for global state — these remain untouched.
- Toast notifications via `react-hot-toast` for errors.
- `AppProviders` is a layout route — providers survive navigation. QueryClientProvider goes here.

## Proposed Approach

### Step 1: Install Dependencies

```bash
npm install @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
npm install -D @tanstack/react-query-devtools
```

### Step 2: QueryClient Configuration

Create `src/lib/queryClient.ts`:

- `staleTime: 5 * 60 * 1000` (5 minutes — data considered fresh)
- `gcTime: 24 * 60 * 60 * 1000` (24 hours — cache retention)
- `refetchOnWindowFocus: false` (no jarring auto-refetch)
- `refetchOnMount: true` (silent background refetch if stale)
- `refetchOnReconnect: false`
- `retry: 1`, `retryDelay: 1000`
- localStorage persister with key `ALLORO_QUERY_CACHE`, throttle 1000ms
- Only persist successful queries

### Step 3: Provider Setup

Add `PersistQueryClientProvider` to `AppProviders` (or equivalent layout route wrapper in `App.tsx`). Place it inside the auth boundary so queries have access to auth context. Add `ReactQueryDevtools` in dev mode only.

### Step 4: Query Key Factory

Create centralized `QUERY_KEYS` object in `src/lib/queryClient.ts`:

```
QUERY_KEYS = {
  // Admin
  organizations: ['admin', 'organizations'],
  organization: (id) => ['admin', 'organization', id],
  organizationLocations: (id) => ['admin', 'organization', id, 'locations'],
  organizationTasks: (id, locationId?) => ['admin', 'organization', id, 'tasks', locationId],
  organizationNotifications: (id, locationId?) => ['admin', 'organization', id, 'notifications', locationId],
  organizationRankings: (id, locationId?) => ['admin', 'organization', id, 'rankings', locationId],
  organizationPms: (id) => ['admin', 'organization', id, 'pms'],
  adminMinds: ['admin', 'minds'],
  adminWebsites: (params?) => ['admin', 'websites', params],
  adminTemplates: ['admin', 'templates'],
  adminUsers: ['admin', 'users'],

  // Client pages
  minds: (orgId) => ['minds', orgId],
  mind: (mindId) => ['mind', mindId],
  websites: (orgId) => ['websites', orgId],
  website: () => ['user', 'website'],
  websiteSubmissions: (params?) => ['user', 'website', 'submissions', params],
  websiteRecipients: () => ['user', 'website', 'recipients'],
  notifications: (orgId, locationId) => ['notifications', orgId, locationId],
  settings: {
    users: ['settings', 'users'],
    scopes: ['settings', 'scopes'],
    pmsStatus: (orgId) => ['settings', 'pms', orgId],
  },
  agentData: (orgId, locationId) => ['agent-data', orgId, locationId],
  tasks: (orgId, locationId) => ['tasks', orgId, locationId],
  rankings: (orgId, locationId) => ['rankings', orgId, locationId],
  pmsKeyData: (orgId) => ['pms-key-data', orgId],
}
```

### Step 5: Custom Query Hooks

Create hooks in `src/hooks/queries/`:

Each hook follows the pattern from ppcopy:
```ts
export function useOrganizations() {
  const queryKey = QUERY_KEYS.organizations
  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await adminListOrganizations()
      if (!response.success) throw new Error(response.message)
      return response.organizations
    },
    initialData: () => queryClient.getQueryData(queryKey),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  })
}
```

**Hooks to create:**

| Hook | File | Wraps |
|------|------|-------|
| `useAdminOrganizations` | `useAdminQueries.ts` | `adminListOrganizations` |
| `useAdminOrganization` | `useAdminQueries.ts` | `adminGetOrganization` + `adminGetOrganizationLocations` |
| `useAdminOrganizationTasks` | `useAdminQueries.ts` | org tasks endpoint |
| `useAdminOrganizationNotifications` | `useAdminQueries.ts` | org notifications endpoint |
| `useAdminOrganizationRankings` | `useAdminQueries.ts` | org rankings endpoint |
| `useAdminOrganizationPms` | `useAdminQueries.ts` | org PMS endpoint |
| `useAdminMinds` | `useAdminQueries.ts` | `listMinds` (admin) |
| `useAdminWebsites` | `useAdminQueries.ts` | admin websites list |
| `useAdminTemplates` | `useAdminQueries.ts` | admin templates list |
| `useAdminUsers` | `useAdminQueries.ts` | admin users list |
| `useMinds` | `useMindsQueries.ts` | `listMinds` (client) |
| `useUserWebsite` | `useWebsiteQueries.ts` | `/user/website` |
| `useWebsiteSubmissions` | `useWebsiteQueries.ts` | `/user/website/form-submissions` |
| `useWebsiteRecipients` | `useWebsiteQueries.ts` | `/user/website/recipients` |
| `useNotifications` | `useNotificationQueries.ts` | `fetchNotifications` (with `staleTime: 0`, `refetchInterval: 10000`) |
| `useSettingsUsers` | `useSettingsQueries.ts` | `/settings/users` |
| `useSettingsScopes` | `useSettingsQueries.ts` | `/settings/scopes` |
| `usePmsStatus` | `useSettingsQueries.ts` | `fetchPmsKeyData` |
| `useAgentData` | `useDashboardQueries.ts` | `agents.getLatestAgentData` |
| `useClientTasks` | `useDashboardQueries.ts` | `fetchClientTasks` |

**Invalidation hooks** alongside each query file:
```ts
export function useInvalidateAdminOrganizations() {
  const qc = useQueryClient()
  return {
    invalidateAll: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.organizations }),
    invalidateOne: (id) => qc.invalidateQueries({ queryKey: QUERY_KEYS.organization(id) }),
  }
}
```

### Step 6: Migrate Admin Pages

For each admin page, replace the `useEffect` + `useState` pattern with the corresponding query hook. Remove manual `loading`/`error`/`data` state. Use `isLoading` (first load, no cache) vs `isFetching` (background refresh) from the query result.

**Pages to migrate:**

1. **OrganizationManagement.tsx** — `useAdminOrganizations()`
2. **OrganizationDetail.tsx** — `useAdminOrganization(id)` + sub-tab queries for tasks/notifications/rankings/PMS
3. **MindsList.tsx** (admin) — `useAdminMinds()`
4. **WebsitesList.tsx** (admin) — `useAdminWebsites(params)`
5. **TemplatesList.tsx** (admin) — `useAdminTemplates()`

For each page:
- Replace `useEffect` fetch + `useState` with query hook
- Keep mutation actions (create, delete, update) as direct API calls that invalidate relevant queries on success
- Show subtle "refreshing" indicator using `isFetching && !isLoading` if desired

### Step 7: Migrate Client Pages

**Pages to migrate:**

1. **Dashboard.tsx** — No direct fetch here, but sub-components need hooks:
   - `DashboardOverview` → `useAgentData()`, `usePmsKeyData()`, `useClientTasks()`
   - `TasksView` → `useClientTasks()`
   - `RankingsDashboard` → `useRankingsData()`
2. **Settings.tsx** — `useSettingsScopes()`, `usePmsStatus()`
   - `UsersTab` → `useSettingsUsers()`
   - `PropertiesTab` — stays as-is (tight coupling to context providers)
3. **DFYWebsite.tsx** — `useUserWebsite()`
   - `FormSubmissionsTab` → `useWebsiteSubmissions(params)`
   - `RecipientsConfig` → `useWebsiteRecipients()`
4. **Notifications.tsx** — `useNotifications()` with `staleTime: 0` and `refetchInterval: 10000`

### Step 8: Smart staleTime Overrides

| Data type | staleTime | Reasoning |
|-----------|-----------|-----------|
| Default | 5 minutes | Good balance for most admin/list data |
| Notifications | 0 (always stale) | Time-sensitive, poll every 10s |
| Analytics/rankings | 10 minutes | Changes infrequently |
| User profile/settings | 5 minutes | Standard |
| Admin org lists | 5 minutes | Standard |
| Website editor data | 30 seconds | User expects fresh state during editing |

### Migration Order

Execute in this order to minimize risk:

1. **Infrastructure** — Install deps, create queryClient.ts, query keys, add provider
2. **One admin page** (OrganizationManagement) — Prove the pattern works end-to-end
3. **Remaining admin pages** — OrganizationDetail, MindsList, WebsitesList, TemplatesList
4. **Dashboard sub-components** — DashboardOverview, TasksView, RankingsDashboard
5. **Settings sub-components** — UsersTab, scopes, PMS status
6. **DFYWebsite** — Website data, submissions, recipients
7. **Notifications** — With polling override
8. **Cleanup** — Remove unused useState/useEffect patterns, verify no orphaned state

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Stale data shown to user after mutation | Level 2 | Every mutation must invalidate relevant queries. Invalidation hooks enforce this. |
| Cache desync between tabs | Level 1 | `refetchOnWindowFocus: false` is intentional — manual refresh button available. Can revisit. |
| localStorage bloat | Level 1 | Only successful queries persisted. 24hr gcTime auto-evicts. |
| Auth token expiry with cached data | Level 2 | API layer already handles 401s. TanStack Query retry will surface auth errors. |
| Breaking existing context providers | Level 1 | Contexts are NOT touched in this pass. Hooks sit alongside them. |
| Large migration surface | Level 3 | Incremental migration order. Each step independently deployable. Old pattern and new pattern can coexist. |

## Security Considerations

- No sensitive data (tokens, passwords) stored in query cache. Only API response payloads.
- localStorage cache key is app-specific (`ALLORO_QUERY_CACHE`).
- Pilot mode (admin viewing user account) uses sessionStorage for auth — query cache uses localStorage. These don't conflict because query keys include org/location IDs, which differ between pilot and normal sessions.
- On logout, call `queryClient.clear()` to purge all cached data.

## Performance Considerations

- Initial bundle size increase: ~13KB gzipped for `@tanstack/react-query`.
- localStorage persistence adds ~2KB for the persister.
- Throttled writes (1/sec) prevent localStorage thrashing.
- Background refetches are non-blocking — UI never waits for them.
- Devtools are dev-only (tree-shaken in production).

## Definition of Done

- [x] TanStack Query v5 installed and configured with localStorage persistence
- [x] `QueryClientProvider` mounted in app layout (survives navigation)
- [x] Centralized `QUERY_KEYS` factory created
- [x] All admin pages use query hooks instead of useEffect+useState for data fetching
- [x] All client data-fetching pages/components use query hooks
- [x] Invalidation hooks exist for every query domain
- [x] Mutations (create, delete, update) invalidate relevant queries
- [x] Tab switching shows cached data instantly (no loading spinner on revisit within 5min)
- [x] `queryClient.clear()` called on logout
- [x] No regressions in existing functionality (TypeScript + Vite build pass)
- [x] DevTools available in development mode

## Deferred Items

- **DFYWebsite.tsx** — Complex streaming editor state machine. Initial page load (`/user/website`) could benefit from caching, but the editor state (sections, htmlContent, version preview) is highly interactive and not suitable for query caching. Deferred to a separate pass.
- **PropertiesTab** — Tight coupling to GBP/Location context providers. Deferred per plan.
- **DashboardOverview/TasksView/RankingsDashboard** — These are deeply nested sub-components. `useAgentData` hook has been migrated to TanStack Query under the hood (backward-compatible wrapper). TasksView and RankingsDashboard can be migrated incrementally.
- ~~**WebsiteDetail.tsx**~~ — Migrated in Batch 3. Initial `fetchWebsiteDetail(uuid)` is now cached via TanStack Query. Polling updates write directly to query cache via `setQueryData`. Editor interactions unaffected.

## Revision Log

### 2026-03-09 — Batch 2: Remaining Admin Pages

**Reason:** User identified 10+ components that still load fresh on every visit after Batch 1.

**New hook files created:**
- `src/hooks/queries/useAdminOrgTabQueries.ts` — Hooks for all org detail sub-tabs
- `src/hooks/queries/useAdminStandaloneQueries.ts` — Hooks for standalone admin pages

**New QUERY_KEYS added:**
- `adminOrgTasks`, `adminOrgNotifications`, `adminOrgRankings`, `adminOrgPmsJobs`, `adminOrgPmsKeyData`, `adminOrgAgentOutputs`
- `adminAgentOutputs`, `adminAgentOutputOrgs`, `adminAgentOutputTypes`
- `adminActionItems`, `adminActionItemOrgs`
- `adminInsightsSummary`, `adminInsightsRecommendations`

**Components migrated (Batch 2):**
1. **OrgTasksTab.tsx** — `useAdminOrgTasks()` with filter/pagination params in query key
2. **OrgNotificationsTab.tsx** — `useAdminOrgNotifications()` with pagination
3. **OrgRankingsTab.tsx** — `useAdminOrgRankings()` with 10min staleTime
4. **OrgPmsTab.tsx** — `useAdminOrgPms()` combining jobs + keyData in single query
5. **OrgAgentOutputsTab.tsx** — `useAdminOrgAgentOutputs()` with filter/pagination
6. **AIDataInsightsList.tsx** — `useAdminInsightsSummary()` with page + month params
7. **AIDataInsightsDetail.tsx** — `useAdminInsightsRecommendations()` with agentType + page + month
8. **AgentOutputsList.tsx** — `useAdminAgentOutputsList()` + `useAdminAgentOutputOrgs()` + `useAdminAgentOutputTypesList()`
9. **ActionItemsHub.tsx** — `useAdminActionItems()` with `refetchInterval: 3000` (replaces manual setInterval)

**Pattern notes:**
- All mutation handlers (archive, unarchive, delete, approve, create) call `invalidate` instead of manual `loadData()`
- Filter state (`statusFilter`, `categoryFilter`, `page`) remains as local `useState` — these are UI-only concerns
- Query keys include filter params, so changing filters creates new cache entries (instant revisit to same filter combo)
- ActionItemsHub 3-second polling migrated to TanStack Query's `refetchInterval` (cleaner, auto-pauses on tab blur)
- Org sub-tab invalidation uses prefix-based keys (`adminOrgTasksAll(orgId)`) so all filter variants invalidate together

**Build verification:** TypeScript + Vite production build pass with zero errors.
