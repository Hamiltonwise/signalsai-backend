# Allow Manager Role to Rename a Location

## Why
Managers need to correct/maintain location display names (e.g. fix `Woodbridge???`) without escalating to an org admin. Rename is lightweight metadata — it should not require full `canManageConnections` admin privilege.

## What
- Managers (role = `manager`) can rename a location from Settings → Properties.
- Managers still cannot: change GBP, set primary, delete, add locations, change domain.
- Viewers remain fully read-only.

## Context

**Relevant files:**
- `src/routes/locations.ts:260` — `PUT /api/locations/:id` currently gated by `requireRole("admin")`. Accepts `{ name, domain, is_primary }` in one handler.
- `src/middleware/rbac.ts:7` — `UserRole = "admin" | "manager" | "viewer"`; `requireRole` helper.
- `frontend/src/components/settings/PropertiesTab.tsx:56` — `canManageConnections = userRole === "admin"` gates the inline name-edit UI as well as GBP change, set primary, delete.
- `frontend/src/api/locations.ts:94` — `updateLocation()` client, sends the PUT.

**Pattern to follow:** existing `requireRole(...)` multi-role gates in `src/routes/settings.ts`.

## Constraints

**Must:**
- Managers may update only the `name` field via `PUT /api/locations/:id`.
- Field-level guard inside the handler rejects manager attempts at `domain` or `is_primary`.
- Frontend introduces a distinct `canRenameLocation` flag; do not reuse `canManageConnections` for this.

**Must not:**
- Grant managers any other `canManageConnections` capability (GBP, delete, add, set primary).
- Widen route permissions without a server-side field guard (defense in depth — client is not authoritative).
- Refactor unrelated role logic.

**Out of scope:**
- Changing role-resolution strategy (multi-org highest-privilege behavior in `rbacMiddleware`).
- Redesigning the hover-only pencil affordance (separate UX concern).
- Viewer permissions.

## Risk

**Level:** 2

**Risks identified:**
- Privilege creep via the shared endpoint → **Mitigation:** server-side field-level guard (`is_primary`/`domain` require admin).
- Stale frontend role cache (user promoted mid-session) → **Accepted:** existing behavior, requires re-login; out of scope.

**Blast radius:** `PUT /api/locations/:id` has one frontend consumer (`frontend/src/api/locations.ts:94`). Callers in `PropertiesTab.tsx` (set primary and rename) are already UI-gated by role and will not change behavior for admins.

## Tasks

### T1: Backend — allow manager, guard non-name fields
**Do:**
- In `src/routes/locations.ts`, change `requireRole("admin")` on `PUT /:id` to `requireRole("admin", "manager")`.
- Inside the handler, if `req.userRole !== "admin"` and `(domain !== undefined || is_primary !== undefined)`, return `403 { error: "Only admins can modify domain or primary location" }`.
**Files:** `src/routes/locations.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual: manager PUT with `{ name }` → 200, manager PUT with `{ is_primary: true }` → 403.

### T2: Frontend — expose rename to manager
**Do:**
- In `frontend/src/components/settings/PropertiesTab.tsx`, add `const canRenameLocation = userRole === "admin" || userRole === "manager";`
- Swap `canManageConnections` → `canRenameLocation` on the two call sites that gate the name edit UI only (`startNameEdit` click handler and the hover `Pencil` icon).
- Leave `canManageConnections` gating `Change GBP`, `Set Primary`, `Delete`, `Add Location`.
**Files:** `frontend/src/components/settings/PropertiesTab.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; manual: log in as manager, hover a location name → pencil visible, click → inline edit works, save persists.

## Done
- [ ] `npx tsc --noEmit` — zero errors from these changes
- [ ] Backend: manager can PUT `{ name }`; manager is 403'd for `{ is_primary }` or `{ domain }`
- [ ] Frontend: manager sees pencil and can inline-edit location name
- [ ] Admin behavior unchanged (GBP, primary, delete, add still work)
- [ ] Viewer still sees no edit affordance
