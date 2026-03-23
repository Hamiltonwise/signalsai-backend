# Plan 05 — API Endpoints: Query by organization_id + location_id

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Structural Feature
**Depends on:** Plans 01-04 (schema, backfill, and agent code updated)

---

## Problem Statement

User-facing API endpoints currently resolve data using three inconsistent patterns:
1. `:googleAccountId` route param → lookup `google_connections` → extract `domain_name` (BROKEN — column dropped)
2. `?googleAccountId=X` query param (actually receives `organizationId` — misleading name)
3. `?domain=X` query param (raw domain string)

This plan migrates all endpoints to query by `organization_id` + `location_id`, updates RBAC middleware for location-aware scoping, and deprecates domain-based lookups.

---

## Context Summary

### Endpoints to Migrate

**Client-Facing (User Endpoints):**

| Endpoint | Current Scoping | File |
|----------|----------------|------|
| `GET /api/agents/latest/:googleAccountId` | Connection ID → domain → agent_results | AgentsController.ts:1538 |
| `GET /api/agents/getLatestReferralEngineOutput/:googleAccountId` | Connection ID → domain → agent_results | AgentsController.ts:1633 |
| `GET /api/tasks?googleAccountId=X` | Org ID (misleadingly named) → domain → tasks | TasksController.ts:48 |
| `PATCH /api/tasks/:id/complete` | Org ID → domain → task ownership | TasksController.ts:99 |
| `GET /api/notifications?googleAccountId=X` | Org ID → domain → notifications | NotificationsController.ts:56 |
| `PATCH /api/notifications/:id/read` | Org ID → domain → notification | NotificationsController.ts:100 |
| `PATCH /api/notifications/mark-all-read` | Org ID → domain → notifications | NotificationsController.ts:160 |
| `DELETE /api/notifications/delete-all` | Org ID → domain → notifications | NotificationsController.ts:203 |
| `GET /pms/keyData?domain=X` | Domain string → pms_jobs | PmsController.ts:150 |
| `POST /pms/upload` | Domain in body → pms_jobs | PmsController.ts:26 |
| `GET /pms/jobs?domain=X` | Domain string → pms_jobs | PmsController.ts (various) |

**Admin Endpoints (Already Mostly Correct):**

| Endpoint | Current Scoping | Status |
|----------|----------------|--------|
| `GET /api/admin/agent-outputs` | Filters by domain/status | OK — admin can see all, add location filter option |
| `GET /api/tasks/admin/all` | Filters by domain/status | OK — add location filter option |
| Admin websites | organization_id FK | OK — no change needed |

### Deprecated Methods to Remove

| Method | File | Replacement |
|--------|------|-------------|
| `GoogleConnectionModel.getDomainFromAccountId()` | GoogleConnectionModel.ts:162 | Use `req.organizationId` from RBAC middleware |
| `GoogleConnectionModel.findByDomain()` | GoogleConnectionModel.ts:176 | Lookup via `organizations.domain` or `locations.domain` |
| `GoogleConnectionModel.findOnboardedAccounts()` | GoogleConnectionModel.ts | Query `organizations` directly |

---

## Proposed Approach

### Step 1: Enhance RBAC Middleware for Location Scoping

**File:** `src/middleware/rbac.ts`

Add a new middleware `locationScopeMiddleware` that:
1. Reads `location_id` from query param, route param, or request body
2. If user is admin → allow any location within their org
3. If user is manager/viewer → check `user_locations` table
4. Attach `req.locationId` to request

```typescript
export interface LocationScopedRequest extends RBACRequest {
  locationId?: number | null;
  accessibleLocationIds?: number[];  // All locations this user can access
}

export const locationScopeMiddleware = async (
  req: LocationScopedRequest,
  res: Response,
  next: NextFunction
) => {
  const organizationId = req.organizationId;
  if (!organizationId) return next();

  // Get all locations for this org
  const orgLocations = await LocationModel.findByOrganizationId(organizationId);

  if (req.userRole === "admin") {
    // Admin gets all locations
    req.accessibleLocationIds = orgLocations.map(l => l.id);
  } else {
    // Manager/viewer: check user_locations
    const userLocations = await UserLocationModel.findByUserId(req.userId!);
    if (userLocations.length === 0) {
      // No explicit grants → all locations (default behavior)
      req.accessibleLocationIds = orgLocations.map(l => l.id);
    } else {
      req.accessibleLocationIds = userLocations.map(ul => ul.location_id);
    }
  }

  // If a specific location_id is requested, validate access
  const requestedLocationId = req.query.locationId || req.params.locationId || req.body?.locationId;
  if (requestedLocationId) {
    const locId = parseInt(requestedLocationId as string, 10);
    if (!req.accessibleLocationIds.includes(locId)) {
      return res.status(403).json({ error: "No access to this location" });
    }
    req.locationId = locId;
  }

  next();
};
```

### Step 2: Migrate Agent Data Endpoints

**`GET /api/agents/latest/:organizationId`** (rename param)

Before:
```typescript
const { googleAccountId } = req.params;
const account = await db("google_connections").where("id", accountId).first();
const domain = account.domain_name;
// Query agent_results by domain
```

After:
```typescript
// organizationId comes from RBAC middleware (req.organizationId)
// locationId comes from query param or defaults to all accessible locations
const { locationId } = req.query;

const query = AgentResultModel.table()
  .where("organization_id", req.organizationId);

if (locationId) {
  query.where("location_id", parseInt(locationId as string));
}

// Get latest per agent_type
```

**`GET /api/agents/getLatestReferralEngineOutput/:organizationId`** — same pattern.

### Step 3: Migrate Task Endpoints

**`GET /api/tasks`** (client)

Before:
```typescript
const googleAccountId = req.query.googleAccountId;
const domain = await GoogleConnectionModel.getDomainFromAccountId(Number(googleAccountId));
const tasks = await TaskModel.findByDomainApproved(domain);
```

After:
```typescript
// organizationId from RBAC middleware
// locationId from query param (optional)
const tasks = await TaskModel.findByOrganizationApproved(
  req.organizationId,
  req.locationId || null,
  req.accessibleLocationIds
);
```

**Add to TaskModel:**
```typescript
static async findByOrganizationApproved(
  organizationId: number,
  locationId: number | null,
  accessibleLocationIds: number[]
): Promise<ITask[]> {
  const query = this.table()
    .where("organization_id", organizationId)
    .where("is_approved", true)
    .whereNot("status", "archived")
    .orderBy("created_at", "desc");

  if (locationId) {
    query.where("location_id", locationId);
  } else {
    query.whereIn("location_id", accessibleLocationIds);
  }

  return query;
}
```

**`PATCH /api/tasks/:id/complete`** — verify task belongs to user's org + accessible locations.

### Step 4: Migrate Notification Endpoints

Same pattern as tasks:
- Replace `domain`-based queries with `organization_id` + `location_id`
- Add `findByOrganization()` to NotificationModel
- Filter by `accessibleLocationIds` for non-admin users

### Step 5: Migrate PMS Endpoints

**`POST /pms/upload`** — domain in body

Before:
```typescript
const { domain } = req.body;
// Creates pms_job with just domain
```

After:
```typescript
const { domain, locationId } = req.body;
// OR resolve locationId from domain:
const resolvedLocationId = locationId || await resolveLocationId(req.organizationId, null);
// Creates pms_job with org_id + location_id
```

**`GET /pms/keyData`** — add `locationId` query param option alongside existing `domain` param.

**`GET /pms/jobs`** — add `organizationId` + `locationId` filtering for client requests. Admin requests keep existing filters.

### Step 6: Rename/Deprecate URL Parameters

**Phase 1 (this plan):** Accept BOTH old and new param names:
```typescript
// Accept both for backward compat
const organizationId = req.query.organizationId || req.query.googleAccountId;
```

**Phase 2 (future):** Remove old param names from frontend, then remove backend support.

### Step 7: Update Admin Task/Notification Create Endpoints

Admin `createTask` and `createNotification` currently resolve org_id from domain via `GoogleConnectionModel.findByDomain()`.

**Change:** Accept `organization_id` and `location_id` directly in request body. Resolve domain from `locations.domain` if needed for backward compat.

### Step 8: Clean Up Deprecated Model Methods

After all endpoints are migrated:
- Mark `GoogleConnectionModel.getDomainFromAccountId()` as `@deprecated` with clear comment
- Mark `GoogleConnectionModel.findByDomain()` as `@deprecated`
- Do NOT delete yet — other code paths may still reference them during transition

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Location-aware RBAC as middleware | Centralized `locationScopeMiddleware` | Avoid scattering location checks across every controller. |
| `accessibleLocationIds` array on request | Pre-computed in middleware | Avoids repeated DB queries in each handler. |
| Accept both old and new param names | Backward compat phase | Frontend migration happens in Plan 06. Can't break it. |
| Don't delete deprecated methods yet | Gradual migration | Some agent-triggering code (PMS automation) still uses `findByDomain()`. Cleaned up as those paths are migrated. |
| Admin endpoints get location filter option (not requirement) | Additive | Admin should be able to filter by location, but also see all data. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Frontend sends old param names | Level 2 | Backward compat: accept both `organizationId` and `googleAccountId`. |
| Location middleware adds latency | Level 1 | 1-2 queries per request. Cacheable if needed. |
| Agent data endpoints changing param from `:googleAccountId` to `:organizationId` | Level 3 | Frontend currently sends org_id as `googleAccountId`. Accept both during transition. |
| PMS endpoints still need domain for n8n webhook | Level 2 | Keep domain in request body. Resolve org_id + location_id additionally. |
| Breaking admin bulk operations | Level 1 | Admin endpoints are additive (add location filter). No breaking changes. |

---

## Failure Mode Analysis

- **Missing locationId:** All queries work with just `organizationId`. Location is an additional filter, not required.
- **User has no locations:** Middleware grants access to all org locations (default behavior).
- **Location deleted after data created:** `ON DELETE SET NULL` from Plan 02 means data survives. Queries handle NULL location_id gracefully.

---

## Security Considerations

- **Location authorization:** Non-admin users can only access data for their assigned locations. Enforced at middleware level.
- **Organization isolation:** All queries include `organization_id` from RBAC middleware (from JWT), not from user input. Users cannot access other orgs' data.
- **Admin bypass:** Admin users see all locations within their org. Cross-org access still blocked by RBAC.

---

## Performance Considerations

- Composite indexes from Plan 03 (`organization_id, location_id`) ensure efficient queries.
- `accessibleLocationIds` computed once per request, not per-query.
- `WHERE location_id IN (...)` with index is efficient for small location counts (< 100).

---

## Test Strategy

1. **RBAC middleware:** Admin sees all locations. Manager sees only assigned. Viewer sees only assigned.
2. **Agent data:** Fetch latest agent results by org_id + location_id. Verify correct data returned.
3. **Tasks:** Client sees only approved tasks for their accessible locations.
4. **Notifications:** Client sees only notifications for their accessible locations.
5. **PMS:** Upload creates job with correct org_id + location_id. KeyData returns location-filtered data.
6. **Backward compat:** Old param names (`googleAccountId`) still work during transition.
7. **Cross-org isolation:** User from org A cannot access org B's data.

---

## Blast Radius Analysis

- **Files modified:** ~10-12 backend files
  - `src/middleware/rbac.ts` (enhanced)
  - `src/controllers/agents/AgentsController.ts` (client endpoints)
  - `src/controllers/tasks/TasksController.ts`
  - `src/controllers/notifications/NotificationsController.ts`
  - `src/controllers/notifications/feature-services/NotificationService.ts`
  - `src/controllers/pms/PmsController.ts`
  - `src/controllers/pms/pms-services/pms-data.service.ts`
  - `src/models/TaskModel.ts` (add org+location query methods)
  - `src/models/NotificationModel.ts` (add org+location query methods)
  - `src/models/PmsJobModel.ts` (add org+location query methods)
  - `src/models/AgentResultModel.ts` (add org+location query methods)
- **Route changes:** Param name changes (accept both old and new)
- **Frontend impact:** Must update in Plan 06 to send new params

---

## Definition of Done

- [ ] `locationScopeMiddleware` created and applied to client routes
- [ ] Agent data endpoints query by org_id + location_id (not domain)
- [ ] Task endpoints query by org_id + location_id (not domain)
- [ ] Notification endpoints query by org_id + location_id (not domain)
- [ ] PMS endpoints accept and use org_id + location_id
- [ ] Admin endpoints accept optional location_id filter
- [ ] Deprecated methods marked but not deleted
- [ ] All models have org+location query methods
- [ ] Backward compat: old param names still work
- [ ] Non-admin users scoped to their assigned locations
- [ ] No cross-org data leakage
