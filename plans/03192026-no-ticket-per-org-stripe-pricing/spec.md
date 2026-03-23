# Per-Org Stripe Pricing for Legacy Clients

## Why
Legacy clients have negotiated custom pricing. The current model resolves price by org type (health/saas) via env vars, which doesn't support per-org overrides. Moving forward, new clients always pay $2,000/location via the default `STRIPE_HEALTH_PRICE_ID`. Only existing clients need custom price IDs.

## What
Add a `stripe_price_id` column to `organizations`. When creating a checkout session, use the org's custom price if set, otherwise fall back to `STRIPE_HEALTH_PRICE_ID`. Remove the `getPriceIdByOrgType` function and `STRIPE_SAAS_PRICE_ID` env var. Remove hardcoded price display from BillingTab. Seed the 4 legacy orgs with their custom price IDs.

## Context

**Relevant files:**
- `signalsai-backend/src/config/stripe.ts` — Stripe SDK init + `getPriceIdByOrgType` (deleting function)
- `signalsai-backend/src/controllers/billing/BillingService.ts` — checkout session creation + quantity sync emails
- `signalsai-backend/src/models/OrganizationModel.ts` — org model type
- `signalsai/src/components/settings/BillingTab.tsx` — hardcoded `$2,000` price display

**Patterns to follow:**
- Existing migration pattern in `signalsai-backend/src/database/migrations/`

**Key decisions already made:**
- `organization_type` column stays for categorization, just decoupled from pricing
- `STRIPE_SAAS_PRICE_ID` already removed from `.env`
- New clients always get `STRIPE_HEALTH_PRICE_ID` (the $2,000/location default)

## Constraints

**Must:**
- Preserve existing Stripe webhook handlers (they don't touch price IDs — no changes needed)
- Keep `organization_type` field and admin UI for it
- Keep `syncSubscriptionQuantity` working (it reads price from Stripe, not env — safe)

**Must not:**
- Modify onboarding flow (`Step3_PlanChooser.tsx` keeps its $2,000 display — accurate for new clients)
- Add new dependencies

**Out of scope:**
- Admin UI to edit per-org price IDs (direct DB or future admin feature)
- Changing the onboarding pricing display

## Risk

**Level:** 2

**Risks identified:**
- Legacy orgs with no Stripe subscription yet could go through checkout and get the wrong price if migration hasn't run → **Mitigation:** migration seeds price IDs before any checkout can happen
- `syncSubscriptionQuantity` email label uses `organization_type` for "team" vs "location" wording → **Mitigation:** hardcode "location" since all real clients are health-type practices

## Tasks

### T1: Migration — add `stripe_price_id` column and seed legacy orgs
**Do:**
- Add nullable `stripe_price_id` varchar column to `organizations`
- Seed the 4 legacy orgs with their custom price IDs:
  - DentalEMR (6) → `price_1TCeKxDlp4RQpOXNnR7lkOy7`
  - Artful Orthodontics (8) → `price_1TCe5ZDlp4RQpOXN5FXiRWnF`
  - Caswell Orthodontics (25) → `price_1TCe5HDlp4RQpOXNMHWWf4UB`
  - One Endodontics (39) → `price_1TCe5ZDlp4RQpOXN5FXiRWnF`
- Garrison (5) and McPherson (21) stay null (use default)
**Files:** `signalsai-backend/src/database/migrations/`
**Verify:** `npx knex migrate:latest` succeeds

### T2: Remove `getPriceIdByOrgType`, simplify price resolution
**Do:**
- Delete `getPriceIdByOrgType` from `stripe.ts`
- Remove `STRIPE_SAAS_PRICE_ID` constant from `stripe.ts`
- Add `getDefaultPriceId()` that returns `STRIPE_HEALTH_PRICE_ID` (with null check)
- In `BillingService.createCheckoutSession`: query org's `stripe_price_id`, fall back to `getDefaultPriceId()` if null
- Remove `organization_type` from checkout metadata (line 138)
- Hardcode "location"/"locations" in `syncSubscriptionQuantity` email (remove org_type conditional)
**Files:** `signalsai-backend/src/config/stripe.ts`, `signalsai-backend/src/controllers/billing/BillingService.ts`
**Verify:** `npx tsc --noEmit`

### T3: Update OrganizationModel type
**Do:**
- Add `stripe_price_id: string | null` to `IOrganization` interface
**Files:** `signalsai-backend/src/models/OrganizationModel.ts`
**Verify:** `npx tsc --noEmit`

### T4: Remove hardcoded price from BillingTab
**Do:**
- Remove `price` and `period` from the `PLAN` constant
- Remove the price display block in the orange header (lines 297-305 showing `{PLAN.price}` and `{PLAN.period}`)
**Files:** `signalsai/src/components/settings/BillingTab.tsx`
**Verify:** Manual: BillingTab renders without price, still shows plan name, features, manage button

## Done
- [ ] `npx tsc --noEmit` passes (backend)
- [ ] Migration runs clean
- [ ] 4 legacy orgs have `stripe_price_id` set in DB
- [ ] Garrison + McPherson have null `stripe_price_id` (use default)
- [ ] `getPriceIdByOrgType` fully removed
- [ ] BillingTab no longer shows hardcoded $2,000
- [ ] No regressions in checkout flow logic
