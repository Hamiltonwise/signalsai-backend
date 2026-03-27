# Admin-Granted DFY + Lockout

**Date:** 02/26/2026
**Ticket:** no-ticket
**Tier:** Structural Feature

---

## Problem Statement

When admins promote an org to DFY without Stripe billing (admin-granted), or existing orgs continue without payment data, the system needs to:

1. Recognize the "admin-granted" state (DFY tier, no Stripe subscription)
2. Show a billing CTA on the user's profile so they know to add payment
3. Give admins visibility into which orgs are paying vs. not paying
4. Let admins lock out orgs that don't add billing — full app lock where the user only sees the profile/billing page

Existing orgs (grandfathered) are in this same state — DFY or DWY with no Stripe data. They keep access but see the billing CTA. Lockout is a manual admin action, not automatic.

---

## Context Summary

### Existing Infrastructure
- **Subscription fields on org:** `subscription_tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id` — all exist
- **Sidebar:** `Sidebar.tsx` — already conditionally renders items based on `subscriptionTier`, `onboardingCompleted`, `userRole`. Has `NavItem` component with `isLocked` prop (lock icon, disabled click, reduced opacity).
- **App layout:** `PageWrapper.tsx` wraps all protected routes with sidebar + content area
- **Auth context:** `AuthContext` provides `onboardingCompleted`, `userProfile`, `hasGoogleConnection` to all components
- **Route guards:** `ProtectedRoute` (JWT), `DFYRoute` (tier check) — existing patterns
- **Profile/Settings page:** `/settings` route — two tabs (Integrations, Users & Roles). No billing section yet.
- **Admin org detail:** `OrganizationDetail.tsx` — shows tier, users, connections, website. Has tier change buttons.
- **Admin org list:** `OrganizationManagement.tsx` — lists orgs with tier badges, user counts, connection status.

### States to Handle

| State | Tier | `stripe_customer_id` | `subscription_status` | Behavior |
|---|---|---|---|---|
| **Paid DWY** | DWY | Set | active | Full DWY access |
| **Paid DFY** | DFY | Set | active | Full DFY access |
| **Admin-granted DFY** | DFY | null | active | Full DFY access + billing CTA |
| **Admin-granted DWY** | DWY | null | active | Full DWY access + billing CTA |
| **Locked out** | any | null | inactive | Profile/billing page ONLY |

### Key Distinction
- `subscription_status = 'active'` + `stripe_customer_id = null` → admin-granted, show billing CTA
- `subscription_status = 'inactive'` + `stripe_customer_id = null` → **locked out** by admin
- `subscription_status = 'active'` + `stripe_customer_id` set → paid, normal access

---

## Existing Patterns to Follow

1. **NavItem lock pattern:** Sidebar already has `isLocked` prop — disabled, lock icon, reduced opacity
2. **Auth context pattern:** Centralized state in `AuthContext` — add billing state here
3. **Route guard pattern:** `ProtectedRoute`, `DFYRoute` — add `BillingGate` following same approach
4. **Admin badge pattern:** `OrganizationManagement.tsx` already shows tier badges — extend with billing status badge
5. **API status endpoint pattern:** `GET /api/billing/status` from Ticket A returns subscription state

---

## Proposed Approach

### 1. Backend — Billing Status Enrichment

**Ticket A** already creates `GET /api/billing/status` which returns:
```typescript
{
  tier: 'DFY',
  subscriptionStatus: 'active',
  hasStripeSubscription: false,
  isAdminGranted: true, // derived: tier set but no stripe_customer_id
  // ... period end, plan details when available
}
```

No additional backend endpoint needed for the user-facing CTA.

**For admin org list enrichment, modify:** `GET /api/admin/organizations` response to include billing status per org.

**Modify:** `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — `listOrganizations()`

Add to each org in the list response:
```typescript
{
  // ...existing fields
  stripe_customer_id: org.stripe_customer_id, // null or string
  subscription_status: org.subscription_status,
  billingStatus: org.stripe_customer_id ? 'active' : 'no_billing'
}
```

### 2. Backend — Admin Lockout Endpoint

**New endpoint:** `PATCH /api/admin/organizations/:id/lockout`

**Modify:** `signalsai-backend/src/routes/admin/organizations.ts`

Add route: `authenticateToken` + `superAdminMiddleware` → `lockoutOrganization`

**Modify:** `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts`

**New function:** `lockoutOrganization(req, res)`

Logic:
1. Validate org exists
2. Validate org has no Stripe subscription (`stripe_customer_id === null`) — cannot lock out paying customers
3. Set `subscription_status = 'inactive'`
4. Return success

**Unlock endpoint:** `PATCH /api/admin/organizations/:id/unlock`

Logic:
1. Set `subscription_status = 'active'`
2. Return success

This is intentionally simple — a flag flip. The lockout behavior is enforced on the frontend and validated on every API call.

### 3. Backend — Lockout Enforcement Middleware

**New file:** `signalsai-backend/src/middleware/billingGate.ts`

**Middleware:** `billingGateMiddleware`

Applied to all user-facing routes (not admin routes, not billing routes, not auth routes).

Logic:
1. Get user's organization from `req.organizationId`
2. If no org → pass through (pre-onboarding state)
3. Fetch org's `subscription_status`
4. If `subscription_status === 'inactive'` → return 402 with `{ errorCode: 'ACCOUNT_LOCKED', message: 'Your account is locked. Please add billing information to continue.' }`
5. If `subscription_status === 'active'` → pass through

**Exempt routes (must NOT have this middleware):**
- `/api/auth/*` — login/register
- `/api/billing/*` — must be accessible to add payment
- `/api/admin/*` — admin panel
- `/api/onboarding/*` — onboarding flow
- `/api/profile/get` — need to load profile page
- `/api/profile/update` — need to update profile

**Mount strategy:** Apply `billingGateMiddleware` after `rbacMiddleware` on protected route groups. Or mount it globally with an exemption list.

### 4. Frontend — Auth Context Enrichment

**Modify:** `signalsai/src/hooks/useAuth.ts` (or `AuthContext`)

Add to auth state:
```typescript
billingStatus: {
  hasStripeSubscription: boolean;
  isAdminGranted: boolean;
  isLockedOut: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'cancelled';
} | null
```

On auth initialization (after login / on app load):
- Call `GET /api/billing/status`
- Store result in context
- Make available to all components

### 5. Frontend — Lockout App Shell

**Modify:** `signalsai/src/components/PageWrapper.tsx` (or the routing layer in `App.tsx`)

When `billingStatus.isLockedOut === true`:
- Render a **locked layout** instead of the normal PageWrapper
- Locked layout shows:
  - Stripped sidebar: only Profile/Settings item (no other nav items)
  - Content area: redirect all routes to `/settings` (billing section)
  - Top banner (persistent): "Your account is locked. Add a payment method to restore access."

**Implementation options:**

**Option A (Route-level):** In `App.tsx`, check `billingStatus.isLockedOut`. If true, render a `LockedLayout` component that only routes to `/settings`. All other routes redirect to `/settings`.

**Option B (Sidebar-level):** In `Sidebar.tsx`, when locked out, hide all items except Settings. In `PageWrapper.tsx`, show a persistent banner. Route guards redirect all non-settings routes.

**Recommendation:** Option A — cleaner separation. The locked state is a fundamentally different app experience, not just a sidebar tweak.

### 6. Frontend — Billing CTA in Profile/Settings

**Modify:** `signalsai/src/pages/Settings.tsx` (or Profile page)

**This builds on the billing section from Ticket A.** Ticket A adds the billing UI. This ticket adds the admin-granted variant.

When `billingStatus.isAdminGranted === true` (DFY/DWY without Stripe):

Show an alert banner at the top of the billing section:
```
⚠️ Your account was set up by an administrator.
Add a payment method to secure uninterrupted access.
[Add Payment Method] → Stripe Checkout
```

When `billingStatus.isLockedOut === true`:

Show a more urgent banner:
```
🔒 Your account is locked.
Please add a payment method to restore full access to the application.
[Add Payment Method] → Stripe Checkout
```

The "Add Payment Method" button calls `POST /api/billing/checkout` (from Ticket A) with the org's current tier → Stripe Checkout → on success, webhook sets `stripe_customer_id` and confirms `subscription_status = 'active'` → lockout cleared.

### 7. Frontend — Auto-Unlock After Payment

When a locked-out user adds billing via Stripe Checkout:
1. Stripe webhook fires → sets `stripe_customer_id`, `subscription_status = 'active'`
2. User returns to success URL → app re-fetches `GET /api/billing/status`
3. `isLockedOut` flips to `false`
4. Normal app shell renders
5. Full access restored

No admin intervention needed to unlock after payment.

### 8. Admin UI — Billing Status Column in Org List

**Modify:** `signalsai/src/pages/admin/OrganizationManagement.tsx`

Add a "Billing" column to the org list table:

| Status | Badge | Meaning |
|---|---|---|
| ✅ Active | Green badge | Stripe subscription active |
| ⚠️ No Billing | Yellow/amber badge | No Stripe customer ID (admin-granted) |
| 🔒 Locked | Red badge | `subscription_status = 'inactive'` |

### 9. Admin UI — Lockout Button in Org Detail

**Modify:** `signalsai/src/pages/admin/OrganizationDetail.tsx`

In the subscription tier section, add a lockout control:

**When org has no Stripe subscription (`billingStatus: 'no_billing'`):**
- Show: "Lockout" button (red/destructive style)
- Confirmation modal: "This will lock the user out of the app until they add billing. Continue?"
- On confirm: `PATCH /api/admin/organizations/:id/lockout`
- Badge updates to "Locked"

**When org is locked out:**
- Show: "Unlock" button (green/restore style)
- On confirm: `PATCH /api/admin/organizations/:id/unlock`
- Badge updates to "No Billing" (admin-granted state restored)

**When org has active Stripe subscription:**
- No lockout button shown — can't lock out paying customers

### 10. Admin API Module Update

**Modify:** `signalsai/src/api/admin-organizations.ts`

Add:
```typescript
export async function adminLockoutOrganization(orgId: number): Promise<{ success: boolean }>
export async function adminUnlockOrganization(orgId: number): Promise<{ success: boolean }>
```

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Locking out a paying customer | Level 3 | Backend validates: cannot lockout if `stripe_customer_id` is set. Hard guard. |
| Billing middleware on wrong routes | Level 2 | Explicit exemption list for auth, billing, admin, onboarding, profile routes. Test each exempt path. |
| Locked user can't reach billing page | Level 2 | Billing and profile endpoints explicitly exempt from `billingGateMiddleware`. Frontend locked layout routes to Settings/Billing. |
| Existing orgs suddenly locked on deploy | Level 1 | No. `subscription_status` defaults to `'active'`. Lockout requires explicit admin action (`PATCH /lockout`). Deploy is safe. |
| Race condition: user pays while admin locks | Level 1 | Webhook sets `subscription_status = 'active'` and `stripe_customer_id`. Lockout endpoint validates no Stripe customer. If payment and lockout happen near-simultaneously, payment wins (Stripe is source of truth for paid users). |

---

## Definition of Done

- [x] Admin org list shows billing status per org (✅ Active / ⚠️ No Billing / 🔒 Locked)
- [x] Admin org detail has Lockout button (only for orgs without Stripe subscription)
- [x] Admin org detail has Unlock button (only for locked orgs)
- [x] `PATCH /api/admin/organizations/:id/lockout` endpoint — sets `subscription_status = 'inactive'`
- [x] `PATCH /api/admin/organizations/:id/unlock` endpoint — sets `subscription_status = 'active'`
- [x] Lockout endpoint rejects if org has active Stripe subscription
- [x] `billingGateMiddleware` returns 402 for locked orgs on non-exempt routes
- [x] Auth context includes `billingStatus` with `isLockedOut`, `isAdminGranted`, `hasStripeSubscription`
- [x] Locked-out users see stripped sidebar (profile/billing only) + persistent banner
- [x] All non-billing routes redirect to settings when locked out
- [x] Billing CTA shown on profile for admin-granted orgs (no Stripe): "Add a payment method" (via BillingTab from Plan A)
- [x] Urgent billing CTA shown for locked-out orgs: "Your account is locked" (via BillingTab from Plan A)
- [x] Payment from locked state → Stripe Checkout → webhook restores access → auto-unlock
- [x] Existing orgs unaffected on deploy (all have `subscription_status = 'active'`)

---

## Security Considerations

- Lockout is enforced on both frontend (UI lock) and backend (`billingGateMiddleware` returns 402). Backend is the real gate — frontend is UX.
- Only super admins can lock/unlock orgs (middleware enforced)
- Cannot lock out paying customers (backend validation)
- Billing endpoints are exempt from lockout gate — locked users must be able to add payment

---

## Dependency Impact

- **Depends on Ticket A:** `GET /api/billing/status`, `POST /api/billing/checkout`, billing UI in profile
- **Depends on Ticket C:** Admin org creation (admin-granted orgs are the primary use case)
- **Modifies existing files:** `AdminOrganizationsController.ts`, `admin/organizations.ts` routes, `OrganizationManagement.tsx`, `OrganizationDetail.tsx`, `PageWrapper.tsx` or `App.tsx`, `AuthContext`, `Settings.tsx`
- **New files:** `billingGateMiddleware.ts`, possibly `LockedLayout.tsx`
- **No new migrations** — uses existing `subscription_status` field

---

## Revision Log

### R1 — 02/27/2026 — Single Product Pivot (DWY removed)

**Summary:** DWY tier eliminated. "Upgrade to DFY" / "Downgrade to DWY" buttons in admin replaced with "Create Project" button that initializes a website project for the org.

**Reason:** Single product model. Tier change is no longer meaningful. Admin still needs a way to manually kick off website creation.

**Changes to this plan:**
- `OrganizationDetail.tsx` — remove tier change buttons + tier confirm modal. Replace with "Create Project" button that creates a website project for the org. Button only shown when org has no website project. On success, reload org data.
- `AdminOrganizationsController.ts` — add `createProject` handler that extracts project creation logic from `TierManagementService.handleDfyUpgrade()`. Creates project with hostname, attaches to org.
- `routes/admin/organizations.ts` — add `POST /:id/create-project` route.
- `admin-organizations.ts` (frontend API) — add `adminCreateProject()` function.
- `AdminOrgCreationService.ts` — default new orgs to `subscription_tier: "DFY"`.
- Tier badges in org list/detail simplified — no more DWY/DFY distinction shown (or just always show "DFY").

**Updated Definition of Done:**
- [x] All original items still complete
- [ ] "Upgrade to DFY" / "Downgrade to DWY" buttons removed from admin org detail
- [ ] "Create Project" button added — creates website project for org
- [ ] `POST /api/admin/organizations/:id/create-project` endpoint
- [ ] New orgs default to `subscription_tier: "DFY"`
- [ ] Admin org list tier badge simplified
