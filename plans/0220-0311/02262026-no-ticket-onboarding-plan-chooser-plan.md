# Onboarding Plan Chooser (Step 4)

**Date:** 02/26/2026
**Ticket:** no-ticket
**Tier:** Structural Feature

---

## Problem Statement

The current onboarding flow is 3 steps: User Info → Practice Info → Google/GBP. After completion, users enter the app with a default DWY tier set by the system. There is no payment gate — everyone gets in free.

We need to add a 4th step to onboarding: a plan chooser where users select DWY ($500/mo) or DFY ($2,000/mo) and complete payment via Stripe Checkout before entering the app. No one gets in without paying.

If payment fails (card decline), the user stays on Step 4 and retries. They cannot log in or access the app without a successful payment, unless they are admin-granted DFY (handled in Ticket D).

---

## Context Summary

### Current Onboarding Flow
- **Step 1** (`Step0_UserInfo.tsx`): First name, last name, phone
- **Step 2** (`Step1_PracticeInfo.tsx`): Practice name, address, domain → creates org via `POST /onboarding/save-profile`
- **Step 3** (`Step2_DomainInfo.tsx`): Google OAuth + GBP selection → `POST /onboarding/save-gbp` then `POST /onboarding/complete` sets `onboarding_completed = true`

### Key Implementation Details
- `OnboardingContainer.tsx` renders steps conditionally based on `currentStep` (1, 2, 3)
- `useOnboarding.ts` hook manages all state, `totalSteps = 3`
- `ProgressIndicator.tsx` renders step dots based on `currentStep` and `totalSteps`
- `completeOnboarding()` in the hook calls `onboarding.completeOnboarding()` → `POST /onboarding/complete`
- After completion: 2-second "Preparing your dashboard..." then `window.location.reload()`
- Org is created in Step 2 with default `subscription_tier = 'DWY'`

### What Changes
- `totalSteps` goes from 3 → 4
- Step 3 (GBP) no longer calls `completeOnboarding()` — it just advances to Step 4
- Step 4 is the plan chooser + Stripe Checkout
- `onboarding_completed` is set to `true` only AFTER successful payment (via webhook or post-checkout confirmation)

### Dependencies
- **Ticket A (Stripe Billing Core)** must be complete: `POST /api/billing/checkout` endpoint, webhook handler, Stripe config

---

## Existing Patterns to Follow

1. **Step component pattern:** Each step is a standalone component (`Step0_UserInfo`, `Step1_PracticeInfo`, `Step2_DomainInfo`) receiving props from `OnboardingContainer`. New step follows the same pattern.
2. **Hook state management:** All onboarding state lives in `useOnboarding.ts`. New state for plan selection goes here.
3. **Progress indicator:** `ProgressIndicator.tsx` already scales with `totalSteps` prop — just change the number.
4. **Animation:** Steps use `framer-motion` `AnimatePresence` with fade variants. New step gets the same treatment.
5. **API module:** `src/api/onboarding.ts` wraps all onboarding API calls. New calls go here.
6. **Styling:** Alloro design system — `alloro-orange`, `alloro-navy`, gradient buttons, rounded-2xl cards, `font-body`/`font-heading`.

---

## Proposed Approach

### 1. New Step Component

**New file:** `signalsai/src/components/onboarding/Step3_PlanChooser.tsx`

**UI Layout:**
- Header: "Choose Your Plan"
- Subtext: "Select the plan that fits your practice"
- Two plan cards side-by-side:

**DWY Card ($500/mo):**
- Title: "Done With You"
- Price: "$500/month"
- Feature list: Rankings tracking, Task management, Practice analytics, Google Business Profile monitoring
- "Select" button

**DFY Card ($2,000/mo):**
- Title: "Done For You"
- Price: "$2,000/month"
- Feature list: Everything in DWY + AI-powered website builder, Page editing with AI, Media management, Custom domain support
- "Select" button (highlighted/recommended styling)

- Back button to return to Step 3
- No "skip" option — must select and pay

**Props interface:**
```typescript
interface Step3PlanChooserProps {
  onSelectPlan: (tier: 'DWY' | 'DFY') => void;
  onBack: () => void;
  isProcessing: boolean;
}
```

### 2. Checkout Flow from Step 4

When user clicks "Select" on a plan:

1. `onSelectPlan('DFY')` called in `OnboardingContainer`
2. Container calls new function in `useOnboarding`: `initiateCheckout(tier)`
3. `initiateCheckout` calls `POST /api/billing/checkout` with `{ tier, isOnboarding: true }`
4. Backend creates Stripe Checkout Session with:
   - `metadata.organization_id` = org created in Step 2
   - `metadata.is_onboarding` = `true`
   - `success_url` = `{app_url}/onboarding/payment-success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url` = `{app_url}/onboarding/payment-cancelled`
5. Frontend redirects to Stripe Checkout: `window.location.href = sessionUrl`
6. User completes payment on Stripe's hosted page

### 3. Post-Payment Return Handling

**Success return URL:** `/onboarding/payment-success?session_id=...`

**New route/page:** `signalsai/src/pages/OnboardingPaymentSuccess.tsx`

This page:
1. Shows "Processing your payment..." spinner
2. Calls `GET /api/billing/status` to confirm subscription is active
3. If active → calls `POST /onboarding/complete` to mark onboarding done → redirect to dashboard
4. If not yet active (webhook hasn't fired) → poll every 2 seconds, max 30 seconds
5. If still not active after 30s → show "Payment received, setting up your account..." with a "Continue to Dashboard" button that retries

**Cancel return URL:** `/onboarding/payment-cancelled`

This page:
1. Shows "Payment was cancelled"
2. "Try again" button → redirects back to onboarding Step 4
3. Onboarding is NOT complete — user must pay

### 4. Onboarding Completion Gate Change

**Current behavior:** `POST /onboarding/complete` is called at the end of Step 3 (GBP).

**New behavior:**
- Step 3 (GBP) calls `POST /onboarding/save-gbp` but does NOT call `POST /onboarding/complete`
- Step 3's "Next" button advances to Step 4 (plan chooser)
- `POST /onboarding/complete` is called only from the payment success page after confirming Stripe subscription is active

### 5. useOnboarding Hook Changes

**File:** `signalsai/src/hooks/useOnboarding.ts`

Changes:
- `totalSteps` → `4` (from 3)
- New state: `selectedPlan: 'DWY' | 'DFY' | null`
- New state: `isCheckoutProcessing: boolean`
- New function: `initiateCheckout(tier: 'DWY' | 'DFY')` — calls billing API, handles redirect
- `completeOnboarding()` unchanged — still calls `POST /onboarding/complete`, but now only invoked from payment success page

### 6. OnboardingContainer Changes

**File:** `signalsai/src/components/onboarding/OnboardingContainer.tsx`

Changes:
- Import `Step3PlanChooser`
- Step 3 (`Step2DomainInfo`): Change `onNext` from `handleComplete` to `nextStep` — no longer completes onboarding, just advances
- Add `currentStep === 4` rendering for `Step3PlanChooser`
- New handler: `handlePlanSelect(tier)` → calls `initiateCheckout(tier)` from the hook, which redirects to Stripe

### 7. Resume Logic — Returning to Step 4

If a user's payment fails or they close the browser mid-checkout and come back:
- They have an org (created in Step 2) but `onboarding_completed = false`
- They have NO Stripe subscription
- App should detect this and resume at Step 4

**Modify resume logic in OnboardingContainer:**
```
Current: if (org exists && currentStep < 3) → resume at Step 3
New:     if (org exists && onboarding not complete) → check if GBP is saved
           → if GBP saved but no subscription → resume at Step 4
           → if GBP not saved → resume at Step 3
```

This requires the `GET /onboarding/status` endpoint to also return `hasActiveSubscription` (or the container checks `GET /api/billing/status` separately).

### 8. Backend — Minor Endpoint Change

**Modify:** `POST /api/billing/checkout` (from Ticket A) to accept an optional `isOnboarding: true` flag.

When `isOnboarding` is true:
- `success_url` points to `/onboarding/payment-success` instead of `/billing?success=true`
- `cancel_url` points to `/onboarding/payment-cancelled` instead of `/billing?cancelled=true`

No other backend changes needed — Ticket A's webhook handler already saves Stripe data and calls `TierManagementService.updateTier()`.

### 9. Frontend Route Registration

Add two new routes:
- `/onboarding/payment-success` → `OnboardingPaymentSuccess.tsx`
- `/onboarding/payment-cancelled` → `OnboardingPaymentCancelled.tsx`

These routes should be accessible without completed onboarding (since the user is mid-onboarding).

### 10. Login Gate — No App Access Without Payment

After this change, the app entry logic becomes:

```
User logs in
  → Check onboarding status
  → if onboarding_completed === false:
      → Show onboarding flow (which now includes payment at Step 4)
  → if onboarding_completed === true:
      → Enter dashboard
```

Since `onboarding_completed` is only set after successful payment, users without payment cannot enter the app. No separate payment gate middleware needed — the existing onboarding gate handles it.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Webhook race condition on payment success return | Level 2 | Payment success page polls `GET /api/billing/status` with retry. Does not assume webhook has fired instantly. |
| User closes browser during Stripe Checkout | Level 1 | Resume logic detects org exists + no subscription → resumes at Step 4. No data loss. |
| Step 3 → Step 4 transition changes existing behavior | Level 2 | Step 3 no longer calls `completeOnboarding()`. Must verify no other code depends on Step 3 being the final step. The `completeOnboarding()` function itself is unchanged. |
| Existing users with `onboarding_completed = true` but no Stripe | Level 1 | Not affected by this change. This plan only modifies the onboarding flow for NEW users. Existing users already have `onboarding_completed = true` and bypass onboarding entirely. |

---

## Definition of Done

- [ ] `Step3_PlanChooser.tsx` component created with DWY and DFY plan cards
- [ ] `useOnboarding.ts` updated: `totalSteps = 4`, new `selectedPlan` state, new `initiateCheckout()` function
- [ ] `OnboardingContainer.tsx` updated: Step 3 no longer completes onboarding, Step 4 renders plan chooser
- [ ] `ProgressIndicator` shows 4 steps (automatic via `totalSteps` prop change)
- [ ] `OnboardingPaymentSuccess.tsx` page: polls billing status, marks onboarding complete, redirects to dashboard
- [ ] `OnboardingPaymentCancelled.tsx` page: shows cancel message, retry button → back to Step 4
- [ ] Resume logic: users returning with org + no subscription resume at Step 4
- [ ] `POST /api/billing/checkout` accepts `isOnboarding` flag for correct redirect URLs
- [ ] Frontend routes registered for `/onboarding/payment-success` and `/onboarding/payment-cancelled`
- [ ] End-to-end: new user completes Steps 1-3, selects plan, pays via Stripe test mode, onboarding completes, enters dashboard with correct tier

---

## Security Considerations

- Stripe Checkout is hosted by Stripe — we never handle card data
- `session_id` in success URL is only used for display/confirmation, not for granting access. Access is granted by webhook setting subscription data on the org.
- Onboarding completion is server-side only (`POST /onboarding/complete`) — cannot be spoofed from frontend

---

## Performance Considerations

- Stripe Checkout redirect is a full page navigation — no SPA state preserved. Payment success page must independently verify state via API calls.
- Polling on payment success page: 2-second intervals, max 15 attempts (30 seconds). If webhook is slow, user sees helpful messaging.

---

## Dependency Impact

- **Depends on Ticket A:** `POST /api/billing/checkout`, `GET /api/billing/status`, webhook handler
- **No new npm packages** on frontend (using redirect-based Checkout, not Stripe Elements)
- **Modifies existing files:** `OnboardingContainer.tsx`, `useOnboarding.ts` — changes Step 3 behavior
- **Does not modify backend onboarding endpoints** — they work as-is

---

## Alternatives Considered

1. **Embedded Stripe Elements in Step 4:** Collect card info inline without redirect. More seamless UX but requires `@stripe/stripe-js`, PCI considerations, more complex error handling. Overkill for MVP. Rejected.
2. **Payment after onboarding (deferred):** Let users in, show billing CTA later. Contradicts the requirement that no one enters without paying. Rejected.
3. **Combine GBP + Plan selection in one step:** Reduces steps but overloads a single screen. GBP is already complex. Keep them separate. Rejected.

---

## Revision Log

### R1 — 02/27/2026 — Single Product Pivot (DWY removed)

**Summary:** Two-card plan chooser (DWY vs DFY) replaced with a single "Subscribe to Alloro" screen. One product, one price.

**Reason:** DWY tier eliminated. All users get the full experience (dashboard + websites).

**Changes to this plan:**
- `Step3_PlanChooser.tsx` — redesign from two-card layout to single-product subscribe screen. One price ($2,000/mo), one CTA button, feature list.
- `useOnboarding.ts` — remove `selectedPlan` state. `initiateCheckout()` always passes `"DFY"` to the billing API.
- `OnboardingContainer.tsx` — Step 4 passes no tier choice, just triggers checkout directly.

**Updated Definition of Done:**
- [x] All original items still complete
- [ ] `Step3_PlanChooser.tsx` redesigned as single-product subscribe screen
- [ ] `useOnboarding.ts` simplified: no plan selection, always DFY checkout
