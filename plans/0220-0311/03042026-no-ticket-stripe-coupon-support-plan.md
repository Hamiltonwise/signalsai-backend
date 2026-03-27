# Stripe Coupon Support

## Problem Statement
Users need the ability to apply promotion codes (e.g. 1 month free) during Stripe checkout. Currently the checkout session does not allow promotion code entry.

## Context Summary
- Checkout session created in `signalsai-backend/src/controllers/billing/BillingService.ts`
- Single-product model ($2,000/mo DFY subscription)
- Stripe's hosted checkout page handles all UI
- Coupons and promotion codes managed entirely in Stripe Dashboard
- Existing webhook handlers already process $0 invoices correctly

## Existing Patterns to Follow
- Checkout session params object at `BillingService.ts:82-97`
- No custom billing UI — all payment handled by Stripe hosted page

## Proposed Approach
Add `allow_promotion_codes: true` to the `Stripe.Checkout.SessionCreateParams` object in `createCheckoutSession()`. This enables Stripe's built-in promotion code input field on the hosted checkout page.

**File:** `signalsai-backend/src/controllers/billing/BillingService.ts`
**Change:** Add one property to `sessionParams` object.

No other files, endpoints, migrations, or frontend changes required.

## Risk Analysis
- **Level 1 — Suggestion**
- Single additive property on an existing config object
- No breaking changes, no new dependencies
- Stripe validates promo codes server-side — no security exposure
- Webhook flow unchanged — `checkout.session.completed` fires regardless of discount amount

## Definition of Done
- [x] `allow_promotion_codes: true` added to checkout session params
- [x] Verified no other code changes needed
