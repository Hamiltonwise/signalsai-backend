# Onboarding Payment Cancelled + Step 4 — Truthful Copy + Skip Escape Hatch

## Why
Two onboarding surfaces lie to users about payment being mandatory:
- `/onboarding/payment-cancelled` tells users *"A subscription is required to access Alloro"* and *"Onboarding is NOT complete — they must pay to enter the app."*
- Step 4 (`Step3_PlanChooser.tsx`) offers no exit other than "Back" — the user has to close the tab.

Neither reflects product intent: **users should be able to enter the app without paying, with the existing amber top-bar banner doing the soft nudge.** The backend already works that way (`subscription_status='active'` by default; billing gate only fires on `inactive`). We're aligning the UI with reality.

## What
1. `frontend/src/pages/OnboardingPaymentCancelled.tsx` — rewrite stale comment + body copy; add **"I'll link my card later"** button.
2. `frontend/src/components/onboarding/Step3_PlanChooser.tsx` — add **"I'll link my card later"** skip link, matching the GBP step's visual pattern.
3. Both skip handlers must call `POST /api/onboarding/complete` before navigating to `/dashboard`, otherwise the user gets routed back to the wizard by `Dashboard.tsx:148` (`onboardingCompleted === false` → render branch `"ONBOARDING"`).

Done when: (a) cancelled page tells the truth, (b) user can exit Step 4 or the cancelled page without paying in one click, (c) they land on the dashboard cleanly with the amber banner showing, (d) they do **not** get bounced back to the wizard.

## Context

**Relevant files:**
- `frontend/src/pages/OnboardingPaymentCancelled.tsx` — cancelled page (copy + new button).
- `frontend/src/components/onboarding/Step3_PlanChooser.tsx` — Step 4 plan chooser (new skip link).
- `frontend/src/hooks/useOnboarding.ts:102-122` — exposes `completeOnboarding()` which POSTs `/api/onboarding/complete`. Already used by `OnboardingPaymentSuccess.tsx:62`. Reuse in Step 4's skip handler.
- `frontend/src/api/onboarding.ts` — raw API client for direct `completeOnboarding()` call from the cancelled page (not wired to the hook; simpler to call the API module).
- `frontend/src/pages/Dashboard.tsx:148` — **critical routing guard**: `onboardingCompleted === false` renders the onboarding branch. Skip handlers must flip this flag first.
- `frontend/src/components/PageWrapper.tsx:124-141` — amber "Subscribe" banner that nudges users who skipped payment. This is the intentional soft-gate.
- `frontend/src/components/onboarding/Step2_DomainInfo.tsx:350-360` — **reference analog**: GBP step's "Skip for now — I'll connect later" link. Same visual weight on both new buttons.
- `frontend/src/contexts/AuthContext.tsx:59-62` — `setOnboardingCompleted(true)` + `localStorage.setItem("onboardingCompleted", "true")` after successful completion. Ensure the auth context reflects the new state so the dashboard doesn't bounce back.

**Patterns to follow:**
- Secondary-action buttons in onboarding use `text-sm text-alloro-orange hover:text-alloro-orange/80 transition-colors` (plain text link, no fill) — see `Step2_DomainInfo.tsx:353-358`.
- Primary CTAs stay as the gradient-filled orange button. Don't demote "Try Again" or "Subscribe Now".
- On success, call `refreshUserProperties()` from `useAuth()` so the new `onboardingCompleted=true` propagates before navigation (pattern from `OnboardingContainer.tsx:59`).

**Reference file:** `frontend/src/components/onboarding/Step2_DomainInfo.tsx` — closest existing analog for the "subordinate skip action beneath a primary CTA" pattern. `frontend/src/pages/OnboardingPaymentSuccess.tsx:62` — closest analog for calling `completeOnboarding()` + navigating to `/dashboard`.

## Constraints

**Must:**
- Keep primary CTAs dominant: "Try Again" (cancelled page) and "Subscribe Now" (Step 4) stay as the filled gradient buttons.
- New skip buttons route to `/dashboard` via `react-router-dom` `useNavigate`, **after** `completeOnboarding()` resolves.
- Show a loading state on the skip button while the completion API is in-flight (reuse `isLoading`-style pattern from the file's existing buttons).
- Match the rest of each page's visual language (framer-motion fade, alloro-orange palette, rounded-xl).
- Surface failure: if `completeOnboarding()` fails, show an inline error — do not navigate.

**Must not:**
- Touch backend billing logic. No gate changes, no status flips.
- Add new dependencies.
- Change the `/new-account-onboarding` → Step 4 resume behavior of "Try Again".
- Mark onboarding complete via the skip button while leaving the auth context stale — must call `refreshUserProperties()` or update local state.

**Out of scope:**
- Reworking the amber banner copy.
- Adding analytics on the "link later" click (follow-up).
- Revisiting Step 3 (GBP) skip — already behaves correctly.
- Any backend-side onboarding API change.

## Risk

**Level:** 2 (Concern-tier — raised from 1 after Step 4 was added, because of the bounce-back routing pitfall)

**Risks identified:**
- **Bounce-back loop** — `Dashboard.tsx:148` redirects to the onboarding branch whenever `onboardingCompleted === false`. If the skip handler navigates to `/dashboard` before the completion flag flips (or the auth context refreshes), the user ping-pongs back to the wizard. → **Mitigation:** `await onboarding.completeOnboarding()` → `await refreshUserProperties()` (or explicitly `setOnboardingCompleted(true)` + `localStorage.setItem("onboardingCompleted","true")`) → `navigate("/dashboard")`. Follow the exact sequence from `OnboardingPaymentSuccess.tsx:62`.
- **Conversion risk** — a one-click skip on Step 4 and the cancelled page reduces the implicit friction pressuring signups. → **Mitigation:** keep primary CTAs dominant (gradient-filled); skip rendered as subordinate text link. Matches the GBP step pattern. Product explicitly confirmed the intent is free access + top-bar nudge, so this is acceptable.
- **Copy drift** — if payment enforcement is ever introduced later, this copy must revert. → **Mitigation:** call out in the code that current behavior is "soft-gate via PageWrapper banner"; future enforcement spec owns the revert.
- **Completion API failure during skip** — if the POST fails (network blip, server error), naïve navigation strands the user in inconsistent state (wizard thinks complete, backend doesn't). → **Mitigation:** surface the error inline; do not navigate until success. Reuse the existing error display pattern already on each page.

**Blast radius:**
- `OnboardingPaymentCancelled.tsx` — only entry point is route `/onboarding/payment-cancelled` (see `frontend/src/App.tsx`) and Stripe Checkout's `cancel_url`. No imports elsewhere.
- `Step3_PlanChooser.tsx` — only imported by `OnboardingContainer.tsx:9`. No other consumers.
- Neither file exports types or utilities reused elsewhere. Safe, isolated.

**Pushback resolved:**
- ✅ Step 4 scope: user confirmed inclusion.
- ✅ Product intent: user confirmed the goal is "enter the app without paying, top-bar banner nudges them." Proceeding.

## Tasks

**Parallel groups:** T1–T3 (cancelled page) and T4 (Step 4 plan chooser) touch disjoint files; safe to execute in parallel. T5 is verification, runs last.

### T1: Update file header comment on cancelled page
**Do:** Replace lines in the top comment block claiming "Onboarding is NOT complete — they must pay to enter the app." with accurate description: page shown after Stripe Checkout cancellation, offers retry or continue-without-payment.
**Files:** `frontend/src/pages/OnboardingPaymentCancelled.tsx` (lines 1-7)
**Depends on:** none
**Verify:** Manual: grep the file — no occurrence of "must pay" or "subscription is required."

### T2: Update on-page body copy
**Do:** Replace *"No worries — you can try again whenever you're ready. A subscription is required to access Alloro."* with copy that matches product intent. Suggested: *"No worries — you can subscribe whenever you're ready. Head into the app now or try again."* Keep "Payment Cancelled" heading.
**Files:** `frontend/src/pages/OnboardingPaymentCancelled.tsx` (lines 41-44)
**Depends on:** none
**Verify:** Manual: load `/onboarding/payment-cancelled`, confirm honest copy, no lockout implication.

### T3: Add "I'll link my card later" button on cancelled page
**Do:** Below "Try Again", add a text-link-styled button: "I'll link my card later". Handler: `await onboarding.completeOnboarding()` (import from `../api/onboarding`) → on success, set localStorage `onboardingCompleted=true` (match `AuthContext.tsx:61`) → `navigate("/dashboard")`. On failure, set a local error state and render it inline (reuse the page's existing color/styling — add a simple `<p>` with `text-red-600 text-sm`). Add loading state on the button (disable + "Finishing..." label) while the API is in-flight. Match styling from `Step2_DomainInfo.tsx:353-358` (`text-sm text-alloro-orange hover:text-alloro-orange/80`).
**Files:** `frontend/src/pages/OnboardingPaymentCancelled.tsx`
**Depends on:** none (safe to parallel with T1/T2)
**Verify:**
- Manual: click "I'll link my card later" → lands on `/dashboard` with amber banner.
- Manual: navigate away and back — does not bounce back to wizard.
- Manual: force the API to fail (devtools offline) — inline error appears, no navigation.
- Manual: "Try Again" still navigates to `/new-account-onboarding` and resumes at Step 4.

### T4: Add "I'll link my card later" skip link on Step 4 (plan chooser)
**Do:** In `Step3_PlanChooser.tsx`, below the Back button (or paired with it in the same row), add a text-link-styled button: "I'll link my card later". Extend the component's props with `onSkip: () => Promise<void>` and `isSkipping: boolean`. In `OnboardingContainer.tsx`, wire `onSkip` to a new handler that calls the hook's `completeOnboarding()` → `refreshUserProperties()` → `navigate("/dashboard")`. Track `isSkipping` state in the container (or extend `useOnboarding` with `isCompletingSkip`) and pass through. Disable both "Subscribe Now" and the skip link while either action is in progress (mutually exclusive). Match skip-link styling from `Step2_DomainInfo.tsx:353-358`.
**Files:** `frontend/src/components/onboarding/Step3_PlanChooser.tsx`, `frontend/src/components/onboarding/OnboardingContainer.tsx`
**Depends on:** none (safe to parallel with T1/T2/T3)
**Verify:**
- Manual: complete Steps 1–3 (skip GBP), reach Step 4, click "I'll link my card later" → lands on `/dashboard` with amber banner.
- Manual: refresh the page on dashboard — stays on dashboard, no wizard bounce-back.
- Manual: "Subscribe Now" path unchanged — redirects to Stripe.
- Manual: during skip processing, Subscribe button is disabled; during checkout processing, skip link is disabled.

### T5: End-to-end parity verification
**Do:** Walk the full flow in the browser: signup → verify email → Steps 1+2 → skip GBP → skip Step 4 → dashboard. Separately: signup → Steps 1+2 → skip GBP → Subscribe → cancel at Stripe → cancelled page → "I'll link my card later" → dashboard. Confirm both endpoints reach the dashboard with the amber banner, no console errors, and reloading the dashboard does not bounce back to `/new-account-onboarding`.
**Files:** none (verification only)
**Depends on:** T1, T2, T3, T4
**Verify:** See Done checklist.

## Done
- [ ] File header comment in `OnboardingPaymentCancelled.tsx` no longer claims payment is required.
- [ ] Body copy on the cancelled page is truthful (no "required to access" language).
- [ ] New "I'll link my card later" button on cancelled page calls `completeOnboarding()` then navigates to `/dashboard`.
- [ ] New "I'll link my card later" skip link on Step 4 (`Step3_PlanChooser.tsx`) calls `completeOnboarding()` + `refreshUserProperties()` then navigates to `/dashboard`.
- [ ] Both skip handlers disable their button and show loading state while in-flight.
- [ ] Both skip handlers surface API failures inline without navigating.
- [ ] `npx tsc --noEmit` — zero new errors attributable to this change.
- [ ] Lint passes (`npm run lint` if configured).
- [ ] Manual: cancelled-page skip → dashboard, amber banner visible, reload stays on dashboard.
- [ ] Manual: Step 4 skip → dashboard, amber banner visible, reload stays on dashboard.
- [ ] Manual: "Try Again" still returns to `/new-account-onboarding` resuming at Step 4.
- [ ] Manual: "Subscribe Now" still redirects to Stripe Checkout unchanged.
- [ ] Manual: no regressions on `PageWrapper` banner logic (amber shows for admin-granted; red shows for locked-out).

## Revision Log

### Rev 1 — 2026-04-15
**Change:** Expanded scope to cover Step 4 (`Step3_PlanChooser.tsx`) in addition to the cancelled page. Added T4 (skip link on Step 4) and T5 (E2E verification). Revised T3 to call `completeOnboarding()` + update auth context before navigation. Removed both pushback items (resolved by product confirmation). Raised risk level from 1 → 2.
**Reason:** User confirmed product intent: *"we want the user to get into the app without payment but have the top-bar notif."* This resolves the two open pushback questions in one decision. During context-gathering for this revision, discovered `Dashboard.tsx:148` bounces users with `onboardingCompleted=false` back to the wizard — so a naïve `navigate("/dashboard")` from either skip button would loop. Skip handlers must flip the completion flag first (match the `OnboardingPaymentSuccess.tsx:62` pattern).
**Updated Done criteria:** Added Step 4 verification items, loading-state requirements, and failure-mode checks for both skip buttons.
