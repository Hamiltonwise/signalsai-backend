# Location Isolation for Tasks & Notifications

## Problem Statement

Tasks and notifications are not properly scoped by `location_id` in several critical areas:

1. **Client API endpoints ignore `locationId` query param** — Both `GET /api/tasks` and `GET /api/notifications` read `req.locationId` from `LocationScopedRequest`, but neither route uses `locationScopeMiddleware`. The `rbacMiddleware` only sets `organizationId` and `userRole` — never `locationId` or `accessibleLocationIds`. Result: the frontend sends `?locationId=X` but the backend silently ignores it, returning all tasks/notifications for the org.

2. **Notification creation always defaults to primary location** — Both `createNotification()` helper and `NotificationService.createNotificationForOrganization()` call `resolveLocationId(organizationId)` without a `gbpLocationId`, so every notification gets tagged to the org's primary location regardless of context.

3. **Admin task creation ignores location** — `POST /api/tasks` auto-resolves to primary location. The request body doesn't accept `location_id`.

4. **No admin notification list endpoint** — Admins can create and delete notifications, but cannot list/view them per org. The org detail page has no notifications tab.

5. **No admin notifications tab in org detail** — No way to view or create notifications for a specific org+location from the admin panel.

## Context Summary

### Schema Status
- `tasks` table: has `organization_id` (nullable) + `location_id` (nullable) columns with indexes
- `notifications` table: has `organization_id` (nullable) + `location_id` (nullable) columns with composite index `idx_notifications_org_location`
- Both models have `findByOrganization()` methods that correctly filter by `location_id` when provided — the infrastructure is in place, the middleware wiring is missing

### Middleware Architecture
- `rbacMiddleware` — sets `req.organizationId`, `req.userRole`, `req.userId`
- `locationScopeMiddleware` — sets `req.locationId`, `req.accessibleLocationIds` (reads from query/params/body). Requires `rbacMiddleware` to run first.
- Task and notification routes only chain `authenticateToken` → `rbacMiddleware`. They do NOT chain `locationScopeMiddleware`.

### Existing Patterns
- Admin task endpoint (`GET /api/tasks/admin/all`) parses `location_id` from query params directly via `TaskFilteringService.parseAdminFilters()` — works correctly
- `OrgTasksTab` passes `location_id` to admin endpoint — works correctly
- `TasksView` passes `locationId` to client endpoint — sends it but backend ignores it
- `NotificationWidget` passes `locationId` to client endpoint — sends it but backend ignores it
- `Notifications.tsx` (full page) passes `locationId` — same issue

### Notification Creation Points (4 callers)
1. `TaskApprovalService.ts` — task approval → `createNotification(org_id, ...)` → primary only
2. `pms-approval.service.ts` — PMS approval → `createNotification(org_id, ...)` → primary only
3. `AgentsController.ts:467` — monthly agent completion → `createNotification(org_id, ...)` → primary only
4. `NotificationsController.ts` POST — admin endpoint → `NotificationService.createNotificationForOrganization()` → primary only

## Proposed Approach

### Unit 1 — Backend: Wire `locationScopeMiddleware` on Client Routes

**Problem:** Client task and notification endpoints ignore `locationId` because `locationScopeMiddleware` isn't chained.

**Fix:**

**`signalsai-backend/src/routes/tasks.ts`:**
- Import `locationScopeMiddleware` from `../../middleware/rbac`
- Add to `GET /api/tasks` route chain: `authenticateToken, rbacMiddleware, locationScopeMiddleware, TasksController.getTasksForClient`
- Add to `PATCH /api/tasks/:id/complete` route chain (same pattern)

**`signalsai-backend/src/routes/notifications.ts`:**
- Import `locationScopeMiddleware`
- Add to all 4 client routes: `GET /`, `PATCH /:id/read`, `PATCH /mark-all-read`, `DELETE /delete-all`

**No controller changes needed** — `getTasksForClient()` and `getNotifications()` already read `scopedReq.locationId` and `scopedReq.accessibleLocationIds`. The model queries already filter correctly. Only the middleware wiring is missing.

### Unit 2 — Backend: Location-Aware Notification Creation

**Problem:** All notification creation calls `resolveLocationId(organizationId)` without a location hint, always defaulting to primary.

**Approach:** Add optional `locationId` parameter to both notification creation functions so callers can pass it when they have the context.

**`signalsai-backend/src/utils/core/notificationHelper.ts`:**
- Add optional `locationId?: number | null` to the `options` parameter object
- When provided, use it directly instead of calling `resolveLocationId()`
- When not provided, fall back to `resolveLocationId(organizationId)` (existing behavior)

**`signalsai-backend/src/controllers/notifications/feature-services/NotificationService.ts`:**
- Add optional `location_id?: number` to the `data` parameter
- When provided, use it directly instead of calling `resolveLocationId()`

**Update callers that have location context:**

| Caller | File | Has location? | Fix |
|---|---|---|---|
| `TaskApprovalService` | `TaskApprovalService.ts` | YES — the task being approved has `location_id` | Pass `task.location_id` |
| PMS approval | `pms-approval.service.ts` | YES — the PMS job has `location_id` | Pass `job.location_id` |
| Monthly agents | `AgentsController.ts:467` | YES — `locationId` variable in scope | Pass `locationId` |
| Admin endpoint | `NotificationsController.ts` POST | NO — needs to accept in request body | Accept `location_id` in body |

### Unit 3 — Backend: Admin Task Creation Accepts `location_id`

**Problem:** `POST /api/tasks` auto-resolves to primary location. No way to assign a task to a specific location.

**`signalsai-backend/src/controllers/tasks/TasksController.ts` → `createTask()`:**
- Add `location_id` to the destructured request body fields
- When provided, use it directly (validate it belongs to the org)
- When not provided, fall back to `resolveLocationId(resolvedOrgId)` (existing behavior)

### Unit 4 — Backend: Admin Notification List Endpoint

**Problem:** No admin endpoint to list notifications per org+location.

**`signalsai-backend/src/routes/notifications.ts`:**
- Add `GET /api/notifications/admin/list` (before param routes to avoid conflict)

**`signalsai-backend/src/controllers/notifications/NotificationsController.ts`:**
- Add `getAdminNotifications()` method
- Accept query params: `organization_id` (required), `location_id` (optional), `limit`, `offset`
- Query `notifications` table with org + location filters, ordered by `created_at DESC`
- LEFT JOIN `locations` for `location_name`

**`signalsai-backend/src/models/NotificationModel.ts`:**
- Add `listAdmin(filters, pagination)` method following `TaskModel.listAdmin()` pattern

### Unit 5 — Frontend: Admin Org Detail Notifications Tab

**Create `signalsai/src/components/Admin/OrgNotificationsTab.tsx`:**
- Follows same pattern as `OrgTasksTab`
- Props: `organizationId: number`, `locationId: number | null`
- Fetches from `GET /api/notifications/admin/list?organization_id=X&location_id=Y`
- Shows notification list with type badges, read status, timestamps
- "Create Notification" button → inline form or modal with title, message, type fields
- Uses `POST /api/notifications` with `organization_id` + `location_id` from props

**`signalsai/src/api/notifications.ts`:**
- Add `fetchAdminNotifications(filters)` function
- Add `createAdminNotification(data)` function (wraps existing `POST /api/notifications`)

**`signalsai/src/pages/admin/OrganizationDetail.tsx`:**
- Add `"notifications"` to `TAB_KEYS`
- Add to `TAB_CONFIG`: `{ label: "Notifications", icon: <Bell className="h-4 w-4" /> }`
- Import and render `OrgNotificationsTab` component

### Unit 6 — Backend: Admin Notification Create Accepts `location_id`

**`signalsai-backend/src/controllers/notifications/NotificationsController.ts` → `createNotification()`:**
- Accept `location_id` in request body
- Pass to `NotificationService.createNotificationForOrganization()` (from Unit 2 changes)
- Validate the location belongs to the specified organization

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|-----------|
| Adding `locationScopeMiddleware` breaks existing behavior | Level 1 | The middleware is additive — adds `locationId`/`accessibleLocationIds` to req. Controllers already handle the case where these are null/undefined. No existing behavior changes. |
| Notification creation callers need audit | Level 2 | All 4 callers identified and documented. Each has location context available. |
| Admin notification list performance | Level 1 | Composite index `idx_notifications_org_location` already exists. Query scoped by org + location. |
| Missing `locationScopeMiddleware` on other routes | Level 2 | Only task and notification routes identified as affected. Other routes either don't need location scoping or use admin endpoints with direct query param parsing. |

## Definition of Done

- `GET /api/tasks` filters by `locationId` when sent as query param (client endpoint)
- `GET /api/notifications` filters by `locationId` when sent as query param (client endpoint)
- User dashboard Tasks tab shows only tasks for the selected location
- User dashboard Notification widget shows only notifications for the selected location
- Notification creation passes `location_id` from context when available
- `POST /api/tasks` accepts optional `location_id` in request body
- Admin org detail page has "Notifications" tab with list + create functionality
- `POST /api/notifications` accepts optional `location_id` in request body
- Admin notifications tab creates notifications scoped to the selected location
- `npx tsc --noEmit` clean in both frontend and backend
