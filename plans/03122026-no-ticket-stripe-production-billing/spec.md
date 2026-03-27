# Stripe Production Billing — Org Type Pricing + Dynamic Quantity

## Why
Billing is wired up but stuck on test keys with a single hardcoded $2,000 price and `quantity: 1`. Need to support per-location/per-team pricing driven by organization type (`health` vs `saas`), dynamic location-based quantity, and a persistent subscribe banner for unpaid users — before flipping to live Stripe keys.

## What
- Checkout resolves price by org type: `health` = $2,000/location/mo, `saas` = $3,500/team/mo
- Checkout quantity = org's location count (from `locations` table)
- Admin can label orgs with a type via the org detail page (immutable once set)
- Non-subscribed users see a persistent banner directing them to Settings > Billing
- ENV structured for test/prod comment-swap with renamed price vars

## Context

**Relevant files:**
- `signalsai-backend/src/config/stripe.ts` — Stripe SDK init, price ID resolution
- `signalsai-backend/src/controllers/billing/BillingService.ts` — checkout session creation, webhooks
- `signalsai-backend/src/controllers/billing/BillingController.ts` — HTTP handlers for billing
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — admin org management
- `signalsai-backend/src/routes/admin/organizations.ts` — admin org routes
- `signalsai-backend/src/models/OrganizationModel.ts` — org model + IOrganization interface
- `signalsai-backend/.env` — Stripe keys + price IDs
- `signalsai/src/api/billing.ts` — frontend billing API client
- `signalsai/src/api/admin-organizations.ts` — admin API client + types
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — admin org subscription UI
- `signalsai/src/components/PageWrapper.tsx` — main layout shell (has lockout banner pattern)

**Patterns to follow:**
- Existing lockout banner in `PageWrapper.tsx` (amber/red styling, top of main content)
- Existing admin endpoints: PATCH + `apiPatch` pattern
- Existing enum column pattern: `subscription_tier` enum in migration
- `.env` comment-swap toggle blocks

**Key decisions already made:**
- `organization_type`: `health` (default) or `saas`
- Price resolution: org type → env var (`STRIPE_HEALTH_PRICE_ID` or `STRIPE_SAAS_PRICE_ID`)
- Quantity: `COUNT(*) FROM locations WHERE organization_id = ?`, minimum 1
- Org type is admin-set, immutable once saved, null treated as `health`
- New onboards always `health` — no selection during signup
- Frontend checkout code unchanged — backend derives price + quantity from org record

## Constraints

**Must:**
- Follow existing migration naming convention (`YYYYMMDD######_description.ts`)
- Follow existing admin endpoint pattern (PATCH + rbac + requireRole)
- Banner must not show for locked-out users (lockout banner handles that)
- Banner must not show for users with active Stripe subscriptions
- Org type dropdown must be disabled/locked once a value is saved

**Must not:**
- Change the onboarding flow (always health, always DFY)
- Add new npm dependencies
- Modify webhook handlers (they don't care about org type)
- Touch DWY tier logic

**Out of scope:**
- Stripe Dashboard product/price creation (manual)
- Coupon creation for legacy clients (Stripe Dashboard)
- Onboarding UI changes
- Live key values (user fills in manually)

## Risk

**Level:** 2

**Risks identified:**
- ENV rename (`DFY_PRICE_ID` → `HEALTH_PRICE_ID`) breaks billing if .env not updated → **Mitigation:** rename in .env in same task, single atomic change
- Org with 0 locations hits checkout → **Mitigation:** floor quantity at 1
- Admin sets wrong org type, it's immutable → **Mitigation:** low-frequency action, DB fix possible, acceptable tradeoff

## Tasks

### T1: DB migration + model update
**Do:**
- Create migration: add `organization_type` column to `organizations` table (varchar, nullable, default `null` — null means `health`)
- Update `IOrganization` interface to include `organization_type: 'health' | 'sass' | null`
- Update `AdminOrganization` and `AdminOrganizationDetail` frontend types to include `organization_type`

**Files:**
- `signalsai-backend/src/database/migrations/XXXXXXXX_add_organization_type.ts` (new)
- `signalsai-backend/src/models/OrganizationModel.ts`
- `signalsai/src/api/admin-organizations.ts`

**Verify:** `npx knex migrate:latest` succeeds, TS compiles

### T2: Stripe config + billing service + ENV
**Do:**
- Rename `STRIPE_DFY_PRICE_ID` → `STRIPE_HEALTH_PRICE_ID` in `.env` (both sandbox and production blocks)
- Add `STRIPE_SAAS_PRICE_ID` to `.env` (sandbox + production placeholder)
- Update `stripe.ts`: remove old `getPriceId(tier)`, add `getPriceIdByOrgType(orgType: 'health' | 'sass' | null): string` — null resolves to health
- Update `BillingService.createCheckoutSession`:
  - Look up org's `organization_type` from DB
  - Count org's locations: `SELECT COUNT(*) FROM locations WHERE organization_id = ?`
  - Set `price` = `getPriceIdByOrgType(org.organization_type)`
  - Set `quantity` = `Math.max(locationCount, 1)`
  - Store `organization_type` in checkout session metadata
- Remove unused `STRIPE_DWY_PRICE_ID` references from `stripe.ts`

**Files:**
- `signalsai-backend/.env`
- `signalsai-backend/src/config/stripe.ts`
- `signalsai-backend/src/controllers/billing/BillingService.ts`

**Verify:** TS compiles, checkout session creation still works with test keys

### T3: Admin org type endpoint + UI
**Do:**
- Backend: Add `PATCH /api/admin/organizations/:id/type` endpoint
  - Accepts `{ type: 'health' | 'sass' }`
  - Validates: must be valid enum value
  - Validates: if org already has a non-null `organization_type`, reject with 409 ("Organization type is already set and cannot be changed")
  - Updates `organization_type` column
- Add route to `admin/organizations.ts`
- Frontend API: Add `adminUpdateOrganizationType(orgId, type)` function
- Frontend UI: Add org type dropdown to `OrgSubscriptionSection`
  - Shows current type (or "Health (default)" if null)
  - Select with options: Health, SaaS
  - Disabled if `organization_type` is already non-null
  - On change: confirm dialog → API call → refresh
  - Visual: sits in the billing status row next to tier badge

**Files:**
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts`
- `signalsai-backend/src/routes/admin/organizations.ts`
- `signalsai/src/api/admin-organizations.ts`
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx`

**Verify:** Admin can set org type for an org with null type, gets rejected on second attempt. TS compiles.

### T4: Persistent non-subscriber banner
**Do:**
- Add amber banner in `PageWrapper.tsx` main content area, after lockout banner
- Condition: `billingStatus?.isAdminGranted === true` (active status, no Stripe subscription)
- Do NOT show if `isLockedOut` (lockout banner handles that)
- Message: "You haven't subscribed to Alloro yet. Head to Settings > Billing to get started."
- CTA button: navigates to `/settings` (billing tab)
- Style: match existing lockout banner pattern (amber variant instead of red)

**Files:**
- `signalsai/src/components/PageWrapper.tsx`

**Verify:** Manual — admin-granted user sees banner, paying user does not, locked-out user sees lockout banner instead

## Done
- [ ] `npx tsc --noEmit` passes (both frontend and backend)
- [ ] Migration runs clean on dev database
- [ ] Checkout session uses correct price ID based on org type
- [ ] Checkout quantity matches org's location count
- [ ] Admin can set org type once, cannot change after
- [ ] Non-subscriber banner visible for admin-granted users
- [ ] Lockout banner still works, takes priority over subscribe banner
- [ ] `.env` has clean comment-swap blocks for test/prod Stripe keys
