# Billing Details & Cancellation Tracking

## Why
Users and admins have zero visibility into payment history, payment method, active coupons, or cancellation state. The only way to see this is Stripe dashboard or Customer Portal. Additionally, cancellation-at-period-end isn't tracked — cancelled users appear fully active until their period ends and they get abruptly locked out.

## What
Add billing detail endpoints (invoices, payment method, subscription metadata), fix the cancellation state gap in webhooks, and surface this data in both the user BillingTab and admin OrgSubscriptionSection.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Stripe integration, webhook handlers, getSubscriptionStatus
- `signalsai-backend/src/controllers/billing/BillingController.ts` — HTTP layer for billing endpoints
- `signalsai-backend/src/routes/billing.ts` — route definitions
- `signalsai/src/api/billing.ts` — frontend API client
- `signalsai/src/components/settings/BillingTab.tsx` — user-facing billing UI
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — admin billing panel
- `signalsai/src/api/admin-organizations.ts` — admin API client
- `signalsai-backend/src/routes/admin/organizations.ts` — admin routes
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — admin controller

**Patterns to follow:**
- BillingService functions return typed objects, BillingController handles HTTP
- Frontend API uses `apiGet`/`apiPost` helpers with typed return interfaces
- Admin endpoints use `superAdminMiddleware`

**Key decisions already made:**
- Single Stripe product model (Alloro Intelligence)
- `subscription_status` enum: `active | inactive | trial | cancelled`
- Stripe Customer Portal already accessible via "Manage Subscription" button

## Constraints

**Must:**
- All Stripe API calls happen server-side only (never expose Stripe keys to frontend)
- New endpoints follow existing auth/RBAC patterns
- Handle orgs without Stripe gracefully (admin-granted users have no invoices)
- Track `cancel_at_period_end` so pending cancellation shows in UI before period ends

**Must not:**
- No new dependencies
- Don't modify webhook signature verification
- Don't change existing subscription status enum in DB (use Stripe data for nuance)
- Don't touch onboarding payment flow

**Out of scope:**
- Invoice PDF download (Stripe hosted invoice URLs suffice)
- Subscription plan change/upgrade flow
- Payment retry UI
- Billing email notifications

## Risk

**Level:** 2

**Risks identified:**
- `handleSubscriptionUpdated` currently maps non-active → `"inactive"` (lockout). Changing this could break lockout if not careful → **Mitigation:** Only add `cancel_at_period_end` awareness; keep the active/inactive mapping for actual status changes. Read the field from subscription object, don't change status mapping.
- Stripe API calls on every page load add latency → **Mitigation:** Keep calls minimal (1 list call for invoices, 1 retrieve for payment method). No caching needed at current scale.
- Admin billing endpoint exposes Stripe data to admin panel → **Mitigation:** Endpoint already behind `superAdminMiddleware`. Only return display-safe fields (last4, brand — never full card numbers).

## Tasks

### T1: Enhance BillingService — billing details + cancellation tracking
**Do:**
- Add `getBillingDetails(orgId)` function that returns:
  - `paymentMethod`: `{ brand, last4, expMonth, expYear }` or null (from Stripe customer's default payment method)
  - `invoices`: array of `{ id, date, amount, currency, status, coupon, hostedInvoiceUrl }` (last 12 from `stripe.invoices.list`)
  - `discount`: `{ couponName, percentOff, amountOff }` or null (from subscription's active discount)
  - `cancelAtPeriodEnd`: boolean (from subscription object)
  - `canceledAt`: ISO string or null
- Update `getSubscriptionStatus` to include `cancelAtPeriodEnd` boolean from Stripe subscription
- Fix `handleSubscriptionUpdated`: when `subscription.cancel_at_period_end === true` and `subscription.status === "active"`, keep status as `"active"` but store nothing extra (the `cancelAtPeriodEnd` is read live from Stripe in `getSubscriptionStatus`)

**Files:** `BillingService.ts`
**Verify:** Unit test the new function with mock Stripe responses

### T2: Add billing details endpoint + admin endpoint
**Do:**
- BillingController: add `getDetails(req, res)` — calls `getBillingDetails(orgId)`, returns JSON
- BillingController: add `getAdminDetails(req, res)` — takes `orgId` from params, calls same function
- billing routes: `GET /api/billing/details` (auth + RBAC)
- admin org routes: `GET /api/admin/organizations/:id/billing` (auth + superAdmin)

**Files:** `BillingController.ts`, `billing.ts` (routes), `organizations.ts` (admin routes), `AdminOrganizationsController.ts`
**Verify:** `curl` both endpoints, verify response shape

### T3: Frontend API client updates
**Do:**
- `billing.ts`: add `BillingDetails` interface + `getBillingDetails()` function → `GET /billing/details`
- `billing.ts`: update `BillingStatus` interface to include `cancelAtPeriodEnd: boolean`
- `admin-organizations.ts`: add `adminGetBillingDetails(orgId)` → `GET /admin/organizations/{orgId}/billing`

**Files:** `signalsai/src/api/billing.ts`, `signalsai/src/api/admin-organizations.ts`
**Verify:** TypeScript compiles

### T4: BillingTab — show payment details + cancellation state
**Do:**
- Fetch `getBillingDetails()` alongside existing `getBillingStatus()`
- **Subscribed card (hasStripe):** Below features grid, add:
  - Payment method row: card icon + "Visa ending in 4242" (or whatever brand/last4)
  - Next billing date (already exists) + active coupon if present
  - If `cancelAtPeriodEnd`: show amber banner "Your subscription will end on {date}. You can resume anytime." with a "Resume Subscription" link → opens Customer Portal
- **Payment history section:** Below plan card, add collapsible/visible invoice table:
  - Columns: Date, Amount, Status (paid/failed/pending), Coupon, Link (invoice URL)
  - Show last 12 invoices
  - Empty state: "No invoices yet"
- **Cancelled state:** When `subscriptionStatus === "cancelled"` and `!hasStripe`: show distinct card (not the subscribe CTA) — "Your subscription has been cancelled. Subscribe again to restore access."

**Files:** `BillingTab.tsx`
**Verify:** Visual inspection in all 3 states (active, cancelling, cancelled)

### T5: Admin OrgSubscriptionSection — show Stripe details
**Do:**
- Fetch `adminGetBillingDetails(orgId)` when org has `stripe_customer_id`
- Below existing billing status row, add:
  - Payment method: "Visa •••• 4242" or "No payment method"
  - Active coupon: "DAVEISTESTING (100% off)" or none
  - Subscription started: date from `subscription_started_at`
  - Cancel state: "Cancelling at period end ({date})" in amber, or "Cancelled on {date}" in red
- Add collapsible invoice history table (same data as user-facing, admin context)
- Handle `subscription_status === "cancelled"` badge display

**Files:** `OrgSubscriptionSection.tsx`
**Verify:** Visual inspection with org that has Stripe sub

## Done
- [ ] `GET /api/billing/details` returns payment method, invoices, discount, cancel state
- [ ] `GET /api/admin/organizations/:id/billing` returns same for admin
- [ ] `getSubscriptionStatus` includes `cancelAtPeriodEnd`
- [ ] BillingTab shows payment method and active coupon for subscribers
- [ ] BillingTab shows invoice history table
- [ ] BillingTab shows "cancelling at period end" banner when applicable
- [ ] BillingTab shows distinct cancelled state (not the subscribe CTA)
- [ ] Admin panel shows payment method, coupon, cancel state, invoices
- [ ] Admin panel shows "Cancelled" badge for cancelled orgs
- [ ] `npx tsc --noEmit` passes (both frontend and backend)
