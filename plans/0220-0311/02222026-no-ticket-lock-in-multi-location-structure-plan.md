# Lock In Multi-Location Structure — Consolidated Plan

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Structural Feature (5 sub-plans)

---

## Problem Statement

The multi-location architecture (Plans 01–06) is structurally complete — migrations ran, `LocationProvider` wired, `locationId` threaded through data-fetching components. But the structure isn't locked in yet:

1. **No verification** that the app actually loads without runtime errors after all migrations + frontend changes
2. **No multi-location test data** — every org currently has exactly one location, so the LocationSwitcher never renders and filtering is untested
3. **GBPContext still uses `selectedDomain` from AuthContext** — not the new `selectedLocation.googleProperties` from LocationContext
4. **VitalSignsCards still domain-string-based** — depends on GBPContext, which still depends on AuthContext
5. **No way to delete an organization** — and current FK behavior would orphan records instead of cleaning them up

This plan covers all five items.

---

## Sub-Plan A: Smoke Test Verification

### Goal
Verify the app boots, authenticates, and renders the dashboard without runtime errors after the 6-migration + frontend changes.

### Approach
Manual verification checklist (not automated — this is a one-time sanity check):

1. **Backend start:** `npm run dev` in `signalsai-backend/` — confirm no startup errors, migrations already applied
2. **Frontend start:** `npm run dev` in `signalsai/` — confirm Vite compiles without TS errors
3. **Sign in:** Email/password login → JWT issued → redirected to dashboard
4. **Dashboard load:** Verify all 5 cards render (DashboardOverview, PMSVisualPillars, RankingsDashboard, TasksView, ReferralEngineDashboard)
5. **Browser console:** Check for React errors, failed API calls, missing props warnings
6. **Sidebar badges:** Verify task count and notification count load
7. **Notifications page:** Navigate, verify list renders
8. **LocationSwitcher:** Confirm it does NOT render (single-location org) — this is correct behavior

### Definition of Done
- App starts without errors
- Dashboard renders fully
- No console errors related to location/organization
- LocationSwitcher correctly hidden for single-location org

---

## Sub-Plan B: Multi-Location Test Data

### Goal
Insert a second location for a test organization to verify LocationSwitcher appears and data filters correctly.

### Approach

**Step 1 — Seed script (not a migration)**

Create a one-time SQL seed script (or Knex seed file) that:

1. Picks an existing test organization (by ID or domain)
2. Inserts a second `locations` row:
   ```
   organization_id: <test_org_id>
   name: "Second Office"
   domain: "second-office.example.com"
   is_primary: false
   ```
3. Optionally inserts a `google_properties` row linked to the new location (if GBP data exists)
4. Inserts `user_locations` rows so existing org users can access the new location

**Step 2 — Verification**

1. Sign in as a user in the test org
2. LocationSwitcher should now appear (2 locations > 1)
3. Switch locations — verify:
   - `selectedLocation` updates in LocationContext
   - Dashboard re-fetches with new `locationId` param
   - API calls include `locationId` query param
   - Task count / notification count update per location
4. Switch back to primary — verify data returns to original state

### Risk Analysis
- **Level 1 — Suggestion:** Use a seed file, not a migration, so it's not applied to production
- Test data should be clearly marked and easy to clean up

### Definition of Done
- Second location exists for test org
- LocationSwitcher renders and is functional
- Switching locations triggers data re-fetch with correct `locationId`
- No data leaks between locations

---

## Sub-Plan C: GBPContext Location Awareness

### Goal
Make `GBPProvider` derive GBP credentials (`accountId`, `locationId`) from `selectedLocation.googleProperties` (LocationContext) instead of `selectedDomain` (AuthContext).

### Context Summary

**Current flow:**
```
AuthContext.selectedDomain → { gbp_accountId, gbp_locationId }
  ↓
GBPProvider watches selectedDomain
  ↓
fetchGBPData(accountId, locationId)
  ↓
Backend: tokenRefreshMiddleware resolves OAuth token from google_connections
```

**Target flow:**
```
LocationContext.selectedLocation → googleProperties[type=gbp] → { account_id, external_id }
  ↓
GBPProvider watches selectedLocation
  ↓
fetchGBPData(accountId, locationId)
  ↓
Backend: same tokenRefreshMiddleware (unchanged)
```

### Existing Patterns to Follow
- LocationProvider already fetches locations with their `google_properties` array via `GET /api/locations?organizationId=X`
- Each `google_properties` row has: `type`, `account_id`, `external_id` (GBP location ID), `display_name`

### Proposed Approach

**Frontend changes only — no backend changes needed.**

1. **GBPProvider (`GBPContext.tsx`):**
   - Replace `const { selectedDomain } = useAuth();` with `const { selectedLocation } = useLocationContext();`
   - Derive GBP credentials from `selectedLocation.googleProperties`:
     ```typescript
     const gbpProperty = selectedLocation?.googleProperties?.find(p => p.type === "gbp");
     const gbpAccountId = gbpProperty?.account_id || "";
     const gbpLocationId = gbpProperty?.external_id || "";
     ```
   - Update `useEffect` dependency from `selectedDomain` to `selectedLocation`
   - Call `fetchGBPData(gbpAccountId, gbpLocationId)` when location changes

2. **Remove `selectedDomain` dependency from GBPProvider entirely**
   - GBPProvider should no longer import or use `useAuth()`
   - This breaks the AuthContext → GBPContext coupling

3. **VitalSignsCards manual fetch button:**
   - Currently calls `fetchGBPAIData(authDomain.gbp_accountId, authDomain.gbp_locationId)`
   - Update to derive from LocationContext instead:
     ```typescript
     const { selectedLocation } = useLocationContext();
     const gbpProp = selectedLocation?.googleProperties?.find(p => p.type === "gbp");
     fetchGBPAIData(gbpProp?.account_id, gbpProp?.external_id);
     ```

4. **ClarityProvider (`ClarityContext.tsx`):**
   - Similarly replace `selectedDomain.domain` with `selectedLocation?.domain`
   - Update `useEffect` dependency

### Prerequisite
- LocationProvider must include `googleProperties` in its fetch response (verify the backend `/api/locations` endpoint returns this)

### Risk Analysis
- **Level 2 — Concern:** If `googleProperties` is empty for a location (no GBP connected), GBPProvider must gracefully handle this (show "no data" state, not crash)
- **Level 1:** Provider ordering is already correct: `LocationProvider > GBPProvider > ClarityProvider`

### Architectural Decisions
- **Decision:** GBPProvider reads from LocationContext, not AuthContext
- **Tradeoff:** Tighter coupling to LocationContext, but that's the correct source of truth for multi-location
- **Decision:** ClarityProvider also switches to LocationContext at the same time
- **Reason:** Both providers serve the same purpose (fetch data for current location) — inconsistency would be confusing

### Security Considerations
- Backend `tokenRefreshMiddleware` still validates organization ownership of the OAuth token — no change needed
- Frontend passes `accountId`/`locationId` to backend, backend validates via RBAC

### Definition of Done
- GBPProvider derives credentials from `selectedLocation.googleProperties`
- GBPProvider no longer imports `useAuth()`
- ClarityProvider derives domain from `selectedLocation.domain`
- ClarityProvider no longer imports `useAuth()` for domain
- Switching locations triggers GBP + Clarity data re-fetch
- No GBP connection → graceful empty state (no crash)

---

## Sub-Plan D: VitalSignsCards Location Awareness

### Goal
Make VitalSignsCards fully location-aware by removing its `selectedDomain` string prop and relying entirely on context.

### Context Summary

**Current state:**
- VitalSignsCards receives `selectedDomain: string` prop (domain name)
- Internally uses `useGBP()` and `useClarity()` contexts for data
- Also calls `useAuth()` internally to get `authDomain.gbp_accountId` / `gbp_locationId` for manual fetch button
- The `selectedDomain` prop is primarily used for display/logging

**After Plan C:**
- GBPContext and ClarityContext will derive data from LocationContext
- VitalSignsCards shouldn't need AuthContext at all

### Proposed Approach

1. **Remove `selectedDomain` prop from VitalSignsCards:**
   - Remove from props interface
   - Replace any display usage with `selectedLocation?.name` from LocationContext

2. **Remove `useAuth()` usage inside VitalSignsCards:**
   - Manual fetch button should derive GBP credentials from LocationContext (same pattern as Plan C)
   - Or better: expose a `refetch()` method from GBPContext that re-fetches using its internally stored credentials

3. **Update all call sites:**
   - Dashboard.tsx passes `selectedDomain` to VitalSignsCards — remove this prop
   - Any other pages that render VitalSignsCards

4. **Simplify context usage:**
   - VitalSignsCards only needs: `useGBP()`, `useClarity()`, optionally `useLocationContext()` for display name
   - No more `useAuth()` inside this component

### Depends On
- **Plan C must be completed first** — GBPContext must already be location-aware

### Risk Analysis
- **Level 1 — Suggestion:** Low risk, mostly prop removal and simplification
- Ensure the manual "fetch AI data" button still works after removing AuthContext dependency

### Definition of Done
- VitalSignsCards no longer accepts `selectedDomain` prop
- VitalSignsCards no longer imports `useAuth()`
- Manual fetch button works via LocationContext or GBPContext refetch
- All call sites updated

---

## Sub-Plan E: Delete Organization (Cascade)

### Goal
Admin-only endpoint and UI to permanently delete an organization and ALL related data.

### Context Summary

**Current FK behavior (what happens if you just `DELETE FROM organizations WHERE id = X`):**

| Table | FK Column | ON DELETE | Effect |
|-------|-----------|-----------|--------|
| `locations` | `organization_id` | **CASCADE** | Deleted automatically |
| `google_properties` | `location_id` | **CASCADE** | Deleted (via locations cascade) |
| `user_locations` | `location_id` | **CASCADE** | Deleted (via locations cascade) |
| `organization_users` | `organization_id` | No explicit cascade | **ORPHANED** |
| `google_connections` | `organization_id` | NOT NULL, no cascade | **FK VIOLATION / BLOCKED** |
| `invitations` | `organization_id` | No explicit cascade | **ORPHANED** |
| `agent_results` | `organization_id` | SET NULL | **ORPHANED** (org_id nulled) |
| `tasks` | `organization_id` | SET NULL | **ORPHANED** (org_id nulled) |
| `practice_rankings` | `organization_id` | NOT NULL | **FK VIOLATION / BLOCKED** |
| `pms_jobs` | `organization_id` | SET NULL | **ORPHANED** (org_id nulled) |
| `notifications` | `organization_id` | SET NULL | **ORPHANED** (org_id nulled) |
| `website_builder.projects` | `organization_id` | SET NULL | **ORPHANED** |
| `website_builder.user_edits` | `organization_id` | CASCADE | Deleted automatically |

**Problem:** A naive `DELETE` would either fail (FK violations on `google_connections`, `practice_rankings`) or orphan records (SET NULL on data tables).

### Proposed Approach

**Two-part implementation: Migration + API endpoint + Frontend UI**

#### Part 1 — Migration: Fix FK Cascade Behavior

Create a new migration that alters foreign key constraints to enable clean cascade deletion:

**Tables that need CASCADE added:**
- `organization_users.organization_id` → CASCADE
- `google_connections.organization_id` → CASCADE
- `invitations.organization_id` → CASCADE (or SET NULL, then clean up)

**Tables where data should be HARD DELETED (change SET NULL → CASCADE):**
- `agent_results.organization_id` → CASCADE
- `agent_results.location_id` → CASCADE
- `tasks.organization_id` → CASCADE
- `tasks.location_id` → CASCADE
- `practice_rankings.organization_id` → CASCADE
- `practice_rankings.location_id` → CASCADE
- `pms_jobs.organization_id` → CASCADE
- `pms_jobs.location_id` → CASCADE
- `notifications.organization_id` → CASCADE
- `notifications.location_id` → CASCADE
- `website_builder.projects.organization_id` → CASCADE

**agent_recommendations** — cascade via `agent_results`:
- `agent_recommendations.agent_result_id` → check if CASCADE exists; add if not

**Legacy domain-based tables (no FK):**
- `audit_processes` — delete by domain match (application-level cleanup)
- `clarity_data_store` — delete by domain match (application-level cleanup)
- `knowledgebase_embeddings` — evaluate if org-scoped; if not, skip

#### Part 2 — Backend API Endpoint

**Route:** `DELETE /api/organizations/:organizationId`

**Middleware:** `authenticateToken`, `rbacMiddleware`

**Authorization:** Admin role only (`req.userRole === 'admin'`)

**Logic:**
1. Validate requesting user is admin of the target organization
2. **Prevent self-deletion footgun:** Require confirmation parameter (e.g., `?confirm=true` or request body `{ confirmDelete: true }`)
3. Begin transaction:
   a. Delete domain-based records (no FK): `audit_processes`, `clarity_data_store` WHERE domain matches org domain
   b. Revoke Google OAuth tokens (call Google revoke endpoint for each `google_connections` row)
   c. Delete the organization row — CASCADE handles everything else
   d. Remove orphaned users (users who are no longer in ANY organization after this deletion)
4. Commit transaction
5. Return `204 No Content`

**Edge cases:**
- User deleting their own org's last org → invalidate their JWT / force logout
- Users who belong to multiple orgs → only remove from this org, don't delete the user
- Users who belong ONLY to this org → delete the user entirely (or keep as orphan? — decision needed)

#### Part 3 — Frontend UI

**Location:** Settings page or Organization Settings section

**UI:**
1. "Delete Organization" button (red, bottom of settings page)
2. Confirmation modal:
   - Warning text: "This will permanently delete your organization and ALL associated data including locations, tasks, rankings, notifications, and connected Google accounts."
   - Require typing organization name to confirm (GitHub-style)
   - "Delete" button (red) + "Cancel" button
3. On confirm:
   - Call `DELETE /api/organizations/:organizationId` with `{ confirmDelete: true }`
   - On success: Clear session, redirect to login page
   - On error: Show error toast

### Risk Analysis

- **Level 4 — Major Impact:** This is a destructive, irreversible operation that deletes ALL organization data
- **Mitigation:** Double confirmation (modal + type-to-confirm), admin-only authorization
- **Recommendation:** Consider adding a soft-delete column (`deleted_at`) first, with hard delete after 30 days. However, the user explicitly requested hard delete ("delete ALL"), so this is listed as an alternative, not a requirement.

### Security Considerations
- Only org admins can delete
- JWT must belong to a user in the target organization
- Cannot delete another organization (RBAC enforces org scope)
- OAuth tokens revoked on delete (prevents orphaned Google access)

### Failure Mode Analysis
- **Partial failure during cascade:** Transaction wraps everything — rollback on any failure
- **Google token revocation fails:** Log warning but don't block deletion (tokens expire naturally)
- **User logged in during deletion:** Frontend should handle 401/403 gracefully after org disappears

### Blast Radius Analysis
- **Database:** All rows linked to the organization are permanently deleted
- **Google:** OAuth tokens revoked, no more API access
- **Users:** Users exclusive to this org lose access entirely
- **Website builder:** Projects and pages for this org are deleted

### Migration Strategy
- Migration to fix FK cascades can be run independently (no data loss)
- API endpoint deployed after migration
- Frontend UI deployed after API endpoint

### Rollback Plan
- Migration is reversible (change CASCADE back to SET NULL)
- API endpoint can be disabled by removing route
- **Data is NOT recoverable after deletion** — this is by design per user request

### Alternatives Considered
1. **Soft delete:** Add `deleted_at` timestamp, filter in queries, hard delete after retention period
   - Pro: Recoverable. Con: Requires filtering everywhere, complex.
   - **Not chosen:** User explicitly wants hard delete.
2. **Application-level cascade (no FK changes):** Delete each table manually in the endpoint
   - Pro: No migration needed. Con: Fragile, easy to miss tables, no DB-level guarantee.
   - **Not chosen:** FK CASCADE is more reliable and self-documenting.

### Definition of Done
- Migration: All FKs updated to CASCADE on organization/location delete
- Backend: `DELETE /api/organizations/:organizationId` endpoint (admin-only, transactional)
- Frontend: Delete button + confirmation modal in settings
- Legacy tables cleaned up by application logic in the endpoint
- Google OAuth tokens revoked on delete
- Users exclusive to deleted org are handled (deleted or orphaned — per decision)
- Redirect to login after successful deletion

---

## Execution Order

```
A (Smoke Test) → B (Multi-Location Test) → C (GBPContext) → D (VitalSignsCards) → E (Delete Org)
```

- A and B are verification/testing — do first to confirm current state is solid
- C before D (VitalSignsCards depends on GBPContext being location-aware)
- E is independent but saved for last due to migration + high blast radius

---

## Overall Definition of Done

- [ ] App boots and renders without errors (Plan A)
- [ ] Multi-location switching works end-to-end (Plan B)
- [ ] GBPContext derives from LocationContext (Plan C)
- [ ] ClarityContext derives from LocationContext (Plan C)
- [ ] VitalSignsCards is fully context-driven, no domain prop (Plan D)
- [ ] Organization can be deleted with full cascade (Plan E)
- [ ] No orphaned records after org deletion
