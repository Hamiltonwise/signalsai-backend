# Billing Quantity Override for Legacy Flat-Rate Clients

## Why
Caswell Orthodontics (3 locations) and One Endodontics (5 locations) have flat-rate deals — they pay for 1 unit regardless of location count. Current billing always multiplies unit price × location count, which would overcharge them at checkout and on every location sync.

## What
Add a `billing_quantity_override` column to organizations. When set, checkout and quantity sync use this value instead of counting locations. Seed it to `1` for Caswell and One Endo.

## Context

**Relevant files:**
- `src/database/migrations/` — new migration goes here
- `src/models/OrganizationModel.ts` — `IOrganization` interface needs the new field
- `src/controllers/billing/BillingService.ts` — `createCheckoutSession` (line 111) and `syncSubscriptionQuantity` (line 575) both compute quantity from location count

**Key decisions:**
- Nullable integer column — `null` means normal per-location billing
- Only Caswell (org 25) and One Endo (org 39) get seeded values

## Constraints

**Must:**
- Follow existing migration naming convention (`YYYYMMDD######`)
- Match existing pattern from `20260319000002_add_stripe_price_id_to_organizations.ts` for column + data seed in same migration

**Must not:**
- Change billing behavior for any org where `billing_quantity_override` is null
- Modify unrelated code

**Out of scope:**
- Admin UI to manage this field
- Email template changes for flat-rate wording
- Billing status endpoint changes

## Risk

**Level:** 1

**Risks identified:**
- None significant. Nullable column with null default has zero impact on existing behavior.

## Tasks

### T1: Migration — add column and seed data
**Do:** Create migration that adds `billing_quantity_override` (integer, nullable) to organizations. Seed `1` for org IDs 25 and 39.
**Files:** `src/database/migrations/20260323000001_add_billing_quantity_override.ts`
**Verify:** `npx knex migrate:latest` succeeds; query confirms column exists with correct values.

### T2: Update model interface and billing logic
**Do:** Add `billing_quantity_override` to `IOrganization`. In `createCheckoutSession`, use `org.billing_quantity_override ?? locationCount` for quantity. In `syncSubscriptionQuantity`, use `org.billing_quantity_override ?? newQuantity` for the Stripe update (and skip update if override matches current quantity).
**Files:** `src/models/OrganizationModel.ts`, `src/controllers/billing/BillingService.ts`
**Verify:** `npx tsc --noEmit` passes.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Migration runs clean
- [ ] Orgs 25 and 39 have `billing_quantity_override = 1`
- [ ] All other orgs have `billing_quantity_override = null`
- [ ] Checkout and sync logic respects override when present, falls back to location count when null
