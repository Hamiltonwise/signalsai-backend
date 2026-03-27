# Stripe Subscription Quantity Sync on Location Change

## Why
Checkout sets subscription quantity = location count at time of purchase. But when a client adds or removes a location via settings, the Stripe subscription quantity stays stale. Client underpays when adding locations, overpays when removing.

## What
- After every location add/remove, if the org has an active Stripe subscription, update the subscription item quantity to match the current location count
- Stripe handles proration automatically (prorated charge/credit on next invoice)
- Send email notification to org admins when billing quantity changes

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/locations/LocationService.ts` — `createLocation()` and `removeLocation()` are the hook points
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Stripe SDK access, org lookup patterns
- `signalsai-backend/src/models/OrganizationModel.ts` — has `stripe_subscription_id`
- `signalsai-backend/src/models/OrganizationUserModel.ts` — `listByOrgWithUsers()` for admin emails
- `signalsai-backend/src/emails/emailService.ts` — `sendEmail()` helper
- `signalsai-backend/src/config/stripe.ts` — `getStripe()`, `getPriceIdByOrgType()`

**Patterns to follow:**
- Admin email lookup: `OrganizationUserModel.listByOrgWithUsers(orgId).filter(u => u.role === "admin").map(u => u.email)` (used in `formSubmissionController.ts`)
- Email: `sendEmail({ subject, body, recipients })` (existing pattern)
- Best-effort external calls: log errors, don't roll back local state (same as webhook processing)

**Key decisions already made:**
- Automatic — no admin approval step
- Best-effort — Stripe failure does not roll back location change
- Email notification to org admins on quantity change
- No-op if org has no `stripe_subscription_id` (admin-granted orgs skip)
- Proration: Stripe default (`create_prorations` — adjusts next invoice)

## Constraints

**Must:**
- Not block or roll back location changes if Stripe API fails
- Not fire for orgs without a Stripe subscription
- Not send email if quantity didn't actually change (idempotent)
- Use existing `sendEmail` and `OrganizationUserModel` patterns

**Must not:**
- Modify the location creation/removal logic itself
- Add new dependencies
- Change the Stripe checkout flow

**Out of scope:**
- In-app notification (email only)
- Admin approval workflow for billing changes
- Retroactive sync for existing mismatched subscriptions
- `syncLocationsFromGBP()` (only runs during onboarding when no subscription exists)

## Risk

**Level:** 2

**Risks identified:**
- Client surprised by billing change on location add → **Mitigation:** email notification sent immediately with old/new quantity and new total
- Stripe API fails after location change → **Mitigation:** best-effort, log error. Subscription can be manually corrected in Stripe Dashboard or re-synced on next location change

## Tasks

### T1: Subscription quantity sync function
**Do:**
- Add `syncSubscriptionQuantity(organizationId: number): Promise<void>` to `BillingService.ts`
  - Look up org: `stripe_subscription_id`, `organization_type`, `name`
  - If no `stripe_subscription_id` → return (no-op)
  - Count locations: `SELECT COUNT(*) FROM locations WHERE organization_id = ?`
  - Get subscription from Stripe: `stripe.subscriptions.retrieve(subId)`
  - Get first subscription item from `subscription.items.data[0]`
  - If `item.quantity === locationCount` → return (no change)
  - Update: `stripe.subscriptionItems.update(itemId, { quantity: Math.max(locationCount, 1) })`
  - Look up org admin emails via `OrganizationUserModel.listByOrgWithUsers()`
  - Send email with: org name, old quantity, new quantity, unit price label, new estimated monthly total
  - Wrap entire function in try/catch — log errors, never throw

**Files:**
- `signalsai-backend/src/controllers/billing/BillingService.ts`

**Verify:** TS compiles

### T2: Hook into location add/remove
**Do:**
- At end of `createLocation()` (after transaction commits, outside the `db.transaction` block): call `syncSubscriptionQuantity(organizationId)` fire-and-forget
- At end of `removeLocation()` (same pattern): call `syncSubscriptionQuantity(organizationId)` fire-and-forget
- Import `syncSubscriptionQuantity` from BillingService

**Files:**
- `signalsai-backend/src/controllers/locations/LocationService.ts`

**Verify:** TS compiles. Adding a location for a subscribed org updates Stripe quantity. Removing does the same.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Adding a location for a subscribed org updates Stripe subscription quantity
- [ ] Removing a location updates quantity
- [ ] Email sent to org admins on quantity change
- [ ] No-op for admin-granted orgs (no Stripe subscription)
- [ ] Stripe failure does not break location add/remove
