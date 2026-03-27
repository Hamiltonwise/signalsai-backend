# Plan 06 — Frontend: Location Context & Data Fetching

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Structural Feature
**Depends on:** Plans 01-05 (backend fully migrated)

---

## Problem Statement

The frontend currently scopes data using three patterns:
1. `organizationId` from `AuthContext.userProfile.organizationId`
2. `selectedDomain` from `AuthContext.selectedDomain` (a `DomainMapping` object with domain, gbp_accountId, gbp_locationId)
3. `googleAccountId` query param (actually sends organizationId — misleading name)

There is no concept of "locations" in the frontend. Users cannot switch between locations, and data is always fetched for a single domain.

This plan introduces a `LocationContext`, a location switcher, and updates all data-fetching to use `organizationId` + `locationId`.

---

## Context Summary

### Current Frontend Data Flow

```
AuthContext provides:
  - userProfile.organizationId
  - selectedDomain: { domain, displayName, gbp_accountId, gbp_locationId }
  - domains[]: array of DomainMapping

API calls use:
  - agents.getLatestAgentData(organizationId) → GET /agents/latest/{organizationId}
  - tasks.fetchClientTasks(organizationId) → GET /tasks?googleAccountId={organizationId}
  - notifications.fetchNotifications(organizationId) → GET /notifications?googleAccountId={organizationId}
  - pms.fetchPmsKeyData(domain) → GET /pms/keyData?domain={domain}
  - gbp.getKeyData(accountId, locationId) → POST /gbp/getKeyData
  - clarity.getKeyData(domain) → POST /clarity/getKeyData
```

### Target Frontend Data Flow

```
AuthContext provides:
  - userProfile.organizationId
  - locations[]: array of Location objects from API

LocationContext provides:
  - selectedLocation: Location | null
  - setSelectedLocation(location): void
  - locations[]: all accessible locations for this user

API calls use:
  - agents.getLatestAgentData(organizationId, locationId)
  - tasks.fetchClientTasks(organizationId, locationId)
  - notifications.fetchNotifications(organizationId, locationId)
  - pms.fetchPmsKeyData(organizationId, locationId)
  - gbp.getKeyData(locationId) → backend resolves GBP credentials
```

---

## Existing Patterns to Follow

- Contexts defined in `contexts/` with separate type file and provider component
- Hooks in `hooks/` that wrap `useContext()` with error handling
- `getPriorityItem()` for sessionStorage/localStorage resolution
- API modules in `api/` with typed functions

---

## Proposed Approach

### Step 1: Add Locations API Module

**New file:** `src/api/locations.ts`

```typescript
interface Location {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  gbp_property?: {
    external_id: string;
    account_id: string;
    display_name: string;
  } | null;
}

async function getLocations(): Promise<Location[]>
// GET /api/locations
// Backend returns all locations accessible to the current user (filtered by RBAC + user_locations)
```

### Step 2: Create LocationContext

**New file:** `src/contexts/locationContext.ts` (types + hook)

```typescript
interface LocationContextType {
  locations: Location[];
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location) => void;
  isLoading: boolean;
}
```

**New file:** `src/contexts/LocationProvider.tsx` (provider component)

```typescript
export function LocationProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userProfile?.organizationId) {
      loadLocations();
    }
  }, [userProfile?.organizationId]);

  async function loadLocations() {
    const locs = await locationsApi.getLocations();
    setLocations(locs);

    // Restore previously selected location from localStorage
    const savedLocationId = localStorage.getItem("selectedLocationId");
    const saved = locs.find(l => l.id === Number(savedLocationId));
    // Default to primary location
    setSelectedLocation(saved || locs.find(l => l.is_primary) || locs[0] || null);
    setIsLoading(false);
  }

  function handleSetSelectedLocation(location: Location) {
    setSelectedLocation(location);
    localStorage.setItem("selectedLocationId", String(location.id));
  }

  // ... provider JSX
}
```

**Provider placement:** Wrap inside `AuthProvider`, after auth loads:
```
SessionProvider > AuthProvider > LocationProvider > SetupProgressProvider > App
```

### Step 3: Create Location Switcher UI Component

**New file:** `src/components/LocationSwitcher/LocationSwitcher.tsx`

A dropdown/selector in the app header or sidebar that:
- Shows the currently selected location name
- Lists all accessible locations
- Allows switching between them
- Only visible when org has > 1 location

Design: Use existing Tailwind patterns (alloro-navy, alloro-bg). Simple dropdown with check icon for selected.

### Step 4: Update API Modules

**agents.ts:**
```typescript
// Before:
getLatestAgentData(organizationId)
// After:
getLatestAgentData(organizationId, locationId?)
// GET /agents/latest/{organizationId}?locationId={locationId}
```

**tasks.ts:**
```typescript
// Before:
fetchClientTasks(organizationId)
// After:
fetchClientTasks(organizationId, locationId?)
// GET /api/tasks?organizationId={organizationId}&locationId={locationId}
```

**notifications.ts:**
```typescript
// Before:
fetchNotifications(organizationId)
// After:
fetchNotifications(organizationId, locationId?)
// GET /api/notifications?organizationId={organizationId}&locationId={locationId}
```

**pms.ts:**
```typescript
// Before:
fetchPmsKeyData(domain?)
// After:
fetchPmsKeyData(organizationId, locationId?)
// GET /pms/keyData?organizationId={organizationId}&locationId={locationId}
```

**Parameter naming cleanup:**
- Replace all `googleAccountId` params with `organizationId`
- Add `locationId` as optional param to all data-fetching functions

### Step 5: Update Data-Fetching Hooks

**useAgentData.ts:**
```typescript
// Before:
function useAgentData(organizationId: number | null)
// After:
function useAgentData(organizationId: number | null, locationId: number | null)

// Refetch when locationId changes
useEffect(() => {
  if (organizationId && locationId) {
    fetchData();
  }
}, [organizationId, locationId]);
```

Similar updates for any hooks that fetch tasks, notifications, PMS data.

### Step 6: Update Dashboard and Pages

**Dashboard.tsx** — currently the main consumer of agent data, tasks, and PMS data:

```typescript
// Before:
const { data: agentData } = useAgentData(userProfile?.organizationId);

// After:
const { selectedLocation } = useLocation();
const { data: agentData } = useAgentData(
  userProfile?.organizationId,
  selectedLocation?.id
);
```

**GBP data fetching** — currently uses `selectedDomain.gbp_accountId` and `gbp_locationId`:

```typescript
// Before:
gbp.getKeyData(selectedDomain.gbp_accountId, selectedDomain.gbp_locationId)

// After:
// Backend resolves GBP credentials from location_id
gbp.getKeyData(selectedLocation.id)
// OR keep passing GBP IDs from the location object:
gbp.getKeyData(selectedLocation.gbp_property?.account_id, selectedLocation.gbp_property?.external_id)
```

### Step 7: Deprecate Domain-Based State

**AuthContext changes:**
- `domains[]` array → replaced by `locations[]` from LocationContext
- `selectedDomain` → replaced by `selectedLocation` from LocationContext
- `handleDomainChange()` → replaced by `setSelectedLocation()`
- Keep `selectedDomain` temporarily for backward compat, derive it from `selectedLocation`:

```typescript
// Backward compat: derive selectedDomain from selectedLocation
const selectedDomain = selectedLocation ? {
  domain: selectedLocation.domain || "",
  displayName: selectedLocation.name,
  gbp_accountId: selectedLocation.gbp_property?.account_id,
  gbp_locationId: selectedLocation.gbp_property?.external_id,
} : null;
```

This allows gradual migration of components that still reference `selectedDomain`.

### Step 8: Add Backend Location Endpoint

**New route:** `GET /api/locations`

**Controller:** Returns all locations for the current user's organization, filtered by `user_locations` for non-admin users.

```typescript
// Response shape:
{
  success: true,
  locations: [
    {
      id: 1,
      organization_id: 5,
      name: "Downtown Office",
      domain: "example.com",
      is_primary: true,
      gbp_property: {
        external_id: "locations/123",
        account_id: "accounts/456",
        display_name: "Example Dental - Downtown"
      }
    },
    // ...
  ]
}
```

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Separate `LocationContext` (not merged into AuthContext) | Separation of concerns | Auth handles authentication/identity. Location handles data scoping. Different lifecycle. |
| Location persisted in localStorage | Survives page refresh | User shouldn't have to re-select location every time they refresh. |
| Derive `selectedDomain` from `selectedLocation` | Backward compat | Avoid big-bang migration of all components. Gradual transition. |
| Location switcher only shown with > 1 location | UX simplicity | Single-location orgs shouldn't see unnecessary UI chrome. |
| Backend resolves GBP credentials from location_id | Reduce frontend responsibility | Frontend just says "I want data for location X." Backend figures out OAuth/GBP details. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Changing data-fetching dependencies causes re-render storms | Level 2 | Use stable references (useMemo, useCallback). LocationContext changes infrequently. |
| Location switcher adds cognitive load for single-location users | Level 1 | Hidden when only 1 location exists. |
| `selectedDomain` backward compat breaks subtly | Level 2 | Derived from selectedLocation. Test all pages that use selectedDomain. |
| Loading order: LocationProvider depends on AuthProvider being loaded | Level 1 | LocationProvider placed inside AuthProvider. Only loads after auth resolves. |

---

## Failure Mode Analysis

- **No locations returned:** Show "no locations" state. Shouldn't happen — Plan 01 ensures every org has at least one location.
- **Selected location deleted by admin:** Location no longer in list. Fall back to primary. localStorage cleared.
- **Location context not ready when Dashboard renders:** `isLoading` gate prevents data fetch until location is selected.

---

## Security Considerations

- Location access enforced on backend (Plan 05 RBAC). Frontend filtering is UX convenience, not security.
- Never trust frontend `locationId` — backend always validates against `user_locations`.

---

## Test Strategy

1. **LocationProvider:** Loads locations on mount. Persists selection. Falls back to primary.
2. **Location switcher:** Shows all accessible locations. Selection changes data fetching.
3. **Single location org:** Switcher hidden. Data fetched for the only location.
4. **Multi-location org:** Switching locations refreshes all dashboard data.
5. **Backward compat:** Components using `selectedDomain` still work during transition.
6. **Page refresh:** Selected location restored from localStorage.

---

## Blast Radius Analysis

- **New files:** ~4 (locations API, LocationContext, LocationProvider, LocationSwitcher)
- **Modified files:** ~8-10
  - `src/api/agents.ts`, `tasks.ts`, `notifications.ts`, `pms.ts` (add locationId param)
  - `src/hooks/useAgentData.ts` (add locationId dependency)
  - `src/contexts/AuthContext.tsx` (derive selectedDomain from selectedLocation)
  - `src/pages/Dashboard.tsx` (use LocationContext)
  - `src/App.tsx` (add LocationProvider to tree)
  - Various pages that use selectedDomain
- **Existing behavior:** Preserved via backward compat derivation of `selectedDomain`

---

## Definition of Done

- [ ] `GET /api/locations` endpoint returns user's accessible locations
- [ ] `LocationContext` and `LocationProvider` created
- [ ] `useLocation()` hook available
- [ ] Location switcher component visible when org has > 1 location
- [ ] Selected location persisted in localStorage
- [ ] All API modules accept optional `locationId` parameter
- [ ] All data-fetching hooks re-fetch when location changes
- [ ] Dashboard renders data for selected location
- [ ] `selectedDomain` derived from `selectedLocation` for backward compat
- [ ] Single-location orgs work seamlessly (no visible change)
- [ ] `googleAccountId` param name replaced with `organizationId` in API calls
