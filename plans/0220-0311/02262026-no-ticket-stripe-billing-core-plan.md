# Stripe Billing Core

**Date:** 02/26/2026
**Ticket:** no-ticket
**Tier:** Structural Feature
**Status:** EXECUTED

---

## Problem Statement

The app currently relies on manual admin promotion to assign subscription tiers (DWY/DFY). There is no payment infrastructure. Users cannot self-serve billing. The existing `stripe_customer_id` and `stripe_subscription_id` columns in the `organizations` table are unused stubs.

We need a complete Stripe billing integration that supports:
- Two monthly plans: DWY ($500/mo) and DFY ($2,000/mo)
- Stripe Checkout for payment collection
- Webhook-driven subscription lifecycle management
- A user-facing billing page in profile/settings
- Graceful handling of existing orgs that have no Stripe data

This is the foundation ticket. Onboarding (Ticket B), admin org creation (Ticket C), lockout (Ticket D), and sidebar (Ticket E) all depend on this.

---

## Context Summary

### Existing Infrastructure
- **DB columns ready:** `stripe_customer_id`, `stripe_subscription_id`, `subscription_tier`, `subscription_status`, `subscription_started_at`, `subscription_updated_at` all exist on `organizations` table
- **Tier management service:** `TierManagementService.updateTier()` handles DWY↔DFY transitions transactionally (auto-creates website project on upgrade, sets read-only on downgrade)
- **Auth pattern:** `authenticateToken` → `rbacMiddleware` → `requireRole()` chain
- **API pattern:** Frontend uses `apiGet`, `apiPost`, `apiPut`, `apiPatch` helpers with auto JWT injection
- **Route pattern:** Express Router mounted at `/api/{resource}` in `index.ts`
- **Webhook precedent:** Public routes exist for contact form webhooks (no auth, no signature verification)
- **Profile page:** Exists at `src/pages/Profile.tsx` — currently shows user info + edit form. No billing tab.
- **Settings page:** Exists at `src/pages/Settings.tsx` — has Integrations + Users & Roles tabs.

### Existing Orgs (Migration Concern)
- All current orgs have `stripe_customer_id = null` and `stripe_subscription_id = null`
- They must not break when billing goes live
- They are treated as admin-granted (grandfathered) — full access, billing CTA shown

---

## Existing Patterns to Follow

1. **Route registration:** Create `src/routes/billing.ts`, mount at `/api/billing` in `index.ts`
2. **Controller/service split:** Controller handles HTTP concerns, service handles business logic (see `AdminOrganizationsController.ts` → `TierManagementService.ts` pattern)
3. **Frontend API module:** Create `src/api/billing.ts` following the `apiGet`/`apiPost` pattern in `src/api/index.ts`
4. **Env vars:** Add to `signalsai-backend/.env` following existing key=value pattern
5. **Webhook route:** Public endpoint (no auth), but add Stripe signature verification (new pattern — existing webhooks lack this)
6. **Error handling:** Use the existing `handleError(res, error, context)` pattern in controllers

---

## Proposed Approach

### 1. Environment Configuration

**File:** `signalsai-backend/.env`

Add dual Stripe keys (sandbox active by default, production commented out):

```
# ─── Stripe Configuration ───
# Sandbox (default for development/testing)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx

# Production (uncomment and comment out sandbox when going live)
# STRIPE_SECRET_KEY=sk_live_xxxxx
# STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
# STRIPE_WEBHOOK_SECRET=whsec_live_xxxxx

# Stripe Price IDs (set per environment in Stripe dashboard)
STRIPE_DWY_PRICE_ID=price_xxxxx
STRIPE_DFY_PRICE_ID=price_xxxxx
```

**Frontend:** `signalsai/.env`

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
# VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
```

### 2. Stripe Configuration Module

**New file:** `signalsai-backend/src/config/stripe.ts`

- Initialize Stripe SDK with `STRIPE_SECRET_KEY` from env
- Export configured Stripe instance
- Export price ID constants from env
- Fail fast on missing env vars (no silent fallback)

### 3. Backend — Billing Service

**New file:** `signalsai-backend/src/controllers/billing/BillingService.ts`

Responsibilities:
- `createCheckoutSession(orgId, tier)` — Creates Stripe Checkout Session for DWY or DFY plan. Sets `metadata.organization_id` on the session for webhook correlation. Returns session URL.
- `createCustomerPortalSession(orgId)` — Creates Stripe Customer Portal session for managing existing subscription (update card, cancel, view invoices). Returns portal URL.
- `handleWebhookEvent(event)` — Processes Stripe webhook events:
  - `checkout.session.completed` → Extract org ID from metadata, create/update Stripe customer + subscription on org record, call `TierManagementService.updateTier()` to set correct tier
  - `invoice.payment_succeeded` → Update `subscription_status = 'active'`
  - `invoice.payment_failed` → Update `subscription_status = 'inactive'`
  - `customer.subscription.deleted` → Update `subscription_status = 'cancelled'`
  - `customer.subscription.updated` → Sync tier if plan changed
- `getSubscriptionStatus(orgId)` — Returns current billing state for the org: tier, status, whether Stripe is connected, current period end, plan details

### 4. Backend — Billing Controller

**New file:** `signalsai-backend/src/controllers/billing/BillingController.ts`

Endpoints:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/billing/checkout` | `authenticateToken` + `rbacMiddleware` + `requireRole("admin")` | Create Checkout Session, return URL |
| POST | `/api/billing/portal` | `authenticateToken` + `rbacMiddleware` + `requireRole("admin")` | Create Customer Portal session, return URL |
| GET | `/api/billing/status` | `authenticateToken` + `rbacMiddleware` | Get current subscription status for org |
| POST | `/api/billing/webhook` | **Public** (no auth) + **Stripe signature verification** | Handle Stripe webhook events |

### 5. Backend — Billing Routes

**New file:** `signalsai-backend/src/routes/billing.ts`

- Standard Express Router
- Webhook route uses `express.raw({ type: 'application/json' })` middleware (Stripe requires raw body for signature verification)
- All other routes use standard JSON parsing

**Mount in:** `signalsai-backend/src/index.ts` as `app.use("/api/billing", billingRoutes)`

**Important:** The webhook route MUST be registered before any `express.json()` body parser that would consume the raw body. This may require mounting it separately or using a route-specific raw body parser.

### 6. Backend — Stripe Webhook Signature Verification

**In webhook handler:**

```
stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
```

- Reject any event that fails signature verification with 400
- Log rejected attempts
- Return 200 to Stripe on success (even if processing fails — use try/catch and log errors)

This is a NEW pattern in the codebase. Existing webhooks (contact forms) do not verify signatures.

### 7. Frontend — Billing API Module

**New file:** `signalsai/src/api/billing.ts`

Functions:
- `createCheckoutSession(tier: 'DWY' | 'DFY')` → POST `/api/billing/checkout` → Returns `{ url: string }`
- `createPortalSession()` → POST `/api/billing/portal` → Returns `{ url: string }`
- `getBillingStatus()` → GET `/api/billing/status` → Returns subscription info

### 8. Frontend — Billing Page in Profile

**Modify:** `signalsai/src/pages/Profile.tsx` OR create new `signalsai/src/pages/Billing.tsx`

**Decision:** Add a "Billing" section to the Profile page (keeping it in one place since this is where users will be redirected for billing CTAs).

**Content:**
- **Current Plan card:** Shows DWY or DFY with price, billing cycle, next billing date
- **If Stripe connected:** "Manage Subscription" button → opens Stripe Customer Portal
- **If no Stripe (admin-granted):** Alert banner: "Your account was set up by an administrator. Add a payment method to continue uninterrupted access." + "Add Payment Method" button → Stripe Checkout
- **Plan comparison:** Side-by-side DWY ($500/mo) vs DFY ($2,000/mo) with feature lists
- **If DWY:** "Upgrade to DFY" button → Stripe Checkout for DFY plan

### 9. Frontend — Stripe Publishable Key

The frontend needs the publishable key for Stripe.js / redirecting to Checkout. Two options:

**Option A (Recommended):** Backend returns the Checkout Session URL. Frontend just does `window.location.href = url`. No Stripe.js needed on frontend for Checkout Sessions.

**Option B:** Use `@stripe/stripe-js` on frontend for embedded checkout. More complex, not needed for MVP.

**Going with Option A.** No Stripe SDK on frontend. Backend creates session, frontend redirects.

### 10. Checkout Flow (Data Flow)

```
User clicks "Subscribe" or "Upgrade"
  → Frontend: POST /api/billing/checkout { tier: "DFY" }
  → Backend: Creates Stripe Checkout Session with:
      - price: STRIPE_DFY_PRICE_ID
      - metadata: { organization_id: orgId }
      - success_url: {app_url}/billing?success=true
      - cancel_url: {app_url}/billing?cancelled=true
  → Backend returns: { url: "https://checkout.stripe.com/..." }
  → Frontend: window.location.href = url
  → User completes payment on Stripe's hosted page
  → Stripe redirects to success_url
  → Meanwhile, Stripe fires webhook: checkout.session.completed
  → Backend webhook handler:
      1. Extracts organization_id from metadata
      2. Saves stripe_customer_id and stripe_subscription_id to org
      3. Calls TierManagementService.updateTier(orgId, tier, trx)
      4. Updates subscription_status = 'active'
  → User lands on success page, sees updated billing status
```

### 11. Handling Existing Orgs (Graceful Null-Stripe)

- `getBillingStatus()` returns a clear state when `stripe_customer_id = null`:
  ```
  {
    tier: "DFY",
    hasStripeSubscription: false,
    isAdminGranted: true,
    message: "Add a payment method to secure your account"
  }
  ```
- No crashes anywhere when Stripe fields are null
- The billing page renders the "admin-granted" CTA variant
- Admin org list (Ticket D) will consume this same status endpoint

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Webhook signature bypass | Level 2 | Stripe signature verification on every webhook event. Reject unsigned/invalid. |
| Raw body parsing conflict | Level 2 | Mount webhook route with `express.raw()` before `express.json()` middleware, or use route-specific parser. Test this carefully. |
| Checkout session / webhook race condition | Level 1 | User may hit success_url before webhook fires. Billing page should poll or check status on load, not assume webhook has processed. |
| Existing orgs with null Stripe fields | Level 1 | Every code path that reads Stripe fields must handle null gracefully. No `.toString()` on null, no assumptions. |
| Stripe test vs live key mismatch | Level 1 | Env vars clearly labeled. Price IDs are per-environment. Document in .env comments. |

---

## Definition of Done

- [ ] Stripe SDK installed and configured in backend (`stripe` npm package)
- [ ] .env has dual Stripe key entries (sandbox active, production commented out) in both backend and frontend
- [ ] `POST /api/billing/checkout` creates Stripe Checkout Session and returns URL
- [ ] `POST /api/billing/portal` creates Stripe Customer Portal session and returns URL
- [ ] `GET /api/billing/status` returns current subscription state for the org
- [ ] `POST /api/billing/webhook` receives and verifies Stripe webhook events
- [ ] Webhook handles: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- [ ] On successful checkout: `stripe_customer_id`, `stripe_subscription_id` saved to org, tier updated via `TierManagementService.updateTier()`
- [ ] Frontend billing API module created (`src/api/billing.ts`)
- [ ] Profile page has billing section showing current plan, billing CTA for admin-granted users, upgrade option for DWY users, manage subscription for paid users
- [ ] Existing orgs with null Stripe fields render correctly (no crashes, show admin-granted CTA)
- [ ] Stripe test mode works end-to-end with test card numbers
- [ ] Webhook signature verification rejects unsigned events

---

## Security Considerations

- **Webhook verification:** Every inbound Stripe webhook MUST be verified via `stripe.webhooks.constructEvent()`. No exceptions.
- **Checkout session creation:** Only org admins can create checkout sessions (enforced via `requireRole("admin")`).
- **Stripe keys:** Never exposed to frontend. Backend creates sessions, frontend only gets the redirect URL.
- **Price IDs:** Stored in env, not hardcoded. Prevents accidental test/live price mismatch.
- **Customer Portal:** Stripe's hosted portal handles PCI-sensitive card management. We never touch card data.

---

## Performance Considerations

- **Webhook processing:** Stripe retries failed webhooks. Handler must be idempotent — processing the same event twice should not create duplicate side effects.
- **Checkout session creation:** One API call to Stripe (~200-500ms). Acceptable latency for a button click.
- **Billing status endpoint:** Reads from our DB, not Stripe API. Fast. Stripe data synced via webhooks.

---

## Dependency Impact

- **New npm package:** `stripe` (backend only)
- **No frontend Stripe SDK** — using redirect-based Checkout (no `@stripe/stripe-js` needed)
- **Existing service reused:** `TierManagementService.updateTier()` — no changes needed, webhook calls it as-is
- **Existing migration reused:** Stripe columns already exist on `organizations` table — no new migration needed

---

## Alternatives Considered

1. **Embedded Stripe Checkout (Stripe Elements):** More control over UI but requires `@stripe/stripe-js` + `@stripe/react-stripe-js` on frontend, PCI compliance considerations. Overkill for MVP. Rejected.
2. **Manual payment tracking (no Stripe):** Admin marks payments manually. Doesn't scale, error-prone. Rejected.
3. **Separate billing microservice:** Overengineered for current scale. Billing logic lives in the monolith. Can extract later if needed. Rejected.

---

## Rollback Plan

- Remove Stripe env vars → billing endpoints return 503
- Billing page falls back to "Contact admin" messaging
- Existing admin promotion flow continues to work independently
- No data migration to roll back (columns already exist)

---

## Revision Log

### R1 — 02/27/2026 — Single Product Pivot (DWY removed)

**Summary:** The two-tier model (DWY $500/mo + DFY $2,000/mo) is replaced by a single product. All users get the full experience (dashboard + websites). DWY tier is eliminated.

**Reason:** Business simplification. One product, one price. Two tiers added complexity with minimal benefit.

**Changes to this plan:**
- `BillingService.createCheckoutSession()` — always uses DFY price ID regardless of `tier` param. The `tier` parameter stays for backward compat but price selection is fixed.
- `STRIPE_DWY_PRICE_ID` env var becomes unused (not removed, just ignored)
- `BillingTab` plan comparison (DWY vs DFY side-by-side) is no longer needed — single plan display
- "Upgrade to DFY" button in BillingTab becomes irrelevant (everyone is already DFY)

**Updated Definition of Done:**
- [x] All original items still complete
- [ ] `BillingService` always uses DFY price (ignores DWY price ID)
- [ ] BillingTab simplified to single-product view
