# Plan 07 — Settings Page: GBP Only

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 03 (schema), 04 (backend auth)
**Estimated files:** ~8 files

---

## Entry Conditions

- Plan 02 complete (GA4/GSC frontend components deleted)
- Plan 03 complete (google_connections table exists)
- Plan 04 complete (JWT auth, org-based middleware)
- Settings page compiles (may have empty sections from GA4/GSC removal)

---

## Problem Statement

Reconfigure the Settings page to show only GBP as a connectable integration. The "Connect Google Account" flow triggers OAuth for GBP scope only, creates/updates a `google_connections` record linked to the organization. Multiple users in the org see the same connection. Only admins can connect/disconnect.

---

## Step 1: Update PropertiesTab to GBP-only

**File:** `signalsai/src/components/settings/PropertiesTab.tsx`

After Plan 02, GA4/GSC sections should already be removed. Verify and ensure:

- Only GBP section remains
- "Connected Properties" header should say "Google Business Profile" or "Connected Integrations"
- GBP card shows: connected locations (multi-select), connection status, disconnect button (admin only)
- "Connect Google Business Profile" button for unconnected state

---

## Step 2: Update GBP connection flow in Settings

**Current flow:** Uses `x-google-account-id` to find google_account, then fetches available GBP locations.

**New flow:**
1. User (admin) clicks "Connect Google Business Profile"
2. Frontend calls backend to get OAuth URL (scopes: openid, email, profile, business.manage)
3. OAuth popup opens → user grants access
4. Callback creates/updates `google_connections` record with `organization_id`
5. Frontend refreshes properties view → shows connected GBP locations

**Backend endpoint for GBP OAuth:**
- Reuse existing `/api/auth/google` endpoint but:
  - Scopes are now only 4 (no GA4/GSC)
  - Callback creates `google_connections` record (not session)
  - Callback associates with organization (from JWT → rbac → organizationId)
  - Callback returns success to popup (frontend refreshes properties, no session change)

---

## Step 3: Update PropertySelectionModal for GBP

**File:** `signalsai/src/components/settings/PropertySelectionModal.tsx`

**Current:** Supports types "ga4" | "gsc" | "gbp".

**Simplify:** Only "gbp" type. Remove type switching logic. Always show multi-select interface.

---

## Step 4: Update disconnect flow

**File:** `signalsai/src/components/settings/PropertiesTab.tsx` (or wherever disconnect logic lives)

**Current:** Sends google_account_id to disconnect endpoint.

**New:**
- Frontend calls disconnect endpoint with organization context (from JWT)
- Backend removes `google_property_ids.gbp` from google_connections
- Optionally: clears tokens if no other properties remain
- RBAC check: only admin role can disconnect

---

## Step 5: Update backend settings routes

**File:** `signalsai-backend/src/routes/settings.ts`

**Ensure:**
- `GET /settings/properties` — returns GBP connection status for the organization
- `POST /settings/properties/update` — updates GBP selection
- `GET /settings/properties/available/gbp` — lists available GBP locations
- Remove: `GET /settings/properties/available/ga4`, `GET /settings/properties/available/gsc`

All routes use: `authenticateToken` → `rbacMiddleware` → (optional `tokenRefreshMiddleware` for GBP API calls)

---

## Step 6: Update backend SettingsController

**File:** `signalsai-backend/src/controllers/settings/SettingsController.ts`

**`getProperties()`:**
- Current: reads `google_accounts.google_property_ids` by googleAccountId
- New: reads `google_connections.google_property_ids` by organizationId
- Only returns GBP data (ga4/gsc fields removed)

**`updateProperties()`:**
- Only accepts type "gbp"
- Updates `google_connections.google_property_ids.gbp`
- Uses organizationId from rbac

**`getAvailableProperties()`:**
- Only accepts type "gbp"
- Uses org-based token refresh to fetch GBP locations
- Returns available locations

**`getScopes()`:**
- Returns only GBP-relevant scopes
- Uses org-based connection lookup

---

## Step 7: Update MissingScopeBanner

**File:** `signalsai/src/components/settings/MissingScopeBanner.tsx`

After Plan 02 cleanup, verify:
- Only checks for `business.manage` scope
- Reconnect link triggers GBP-only OAuth
- No references to GA4/GSC scopes

---

## Step 8: Ensure multi-user visibility

**Behavior:** When any user in the organization views Settings, they see the same GBP connection.

**Backend:** `getProperties()` looks up by `organizationId` (not userId). All org members see the same data.

**Frontend:** No user-specific filtering needed — the backend returns org-scoped data.

**Admin-only actions:**
- Connect GBP
- Disconnect GBP
- Change GBP location selection

Non-admin users see the connection but cannot modify it. Use `canManageConnections(req)` check in backend.

---

## Verification

1. Settings page shows GBP section only (no GA4/GSC)
2. Admin can connect GBP via OAuth popup
3. GBP locations appear after connection
4. Admin can select/deselect locations
5. Admin can disconnect GBP
6. Non-admin users see GBP connection but cannot modify
7. Multiple users in same org see same GBP connection

---

## Exit Conditions

- [ ] PropertiesTab shows GBP only
- [ ] GBP connection creates google_connections record linked to org
- [ ] PropertySelectionModal simplified to GBP-only
- [ ] Disconnect flow works with org-based lookup
- [ ] Backend settings endpoints use organizationId
- [ ] Multi-user org members share same GBP view
- [ ] Admin-only enforcement on connect/disconnect
- [ ] No GA4/GSC references remain in settings
