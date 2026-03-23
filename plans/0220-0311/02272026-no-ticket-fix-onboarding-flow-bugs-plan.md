# Fix Onboarding Flow Bugs

## Problem Statement

The onboarding flow has multiple interacting bugs that create a broken user experience:

1. **Race condition double-advance**: After saving practice details (Step 2), users are shown the GBP screen (Step 3) then immediately jumped to payment (Step 4) with no user interaction.
2. **Wizard fires before onboarding completes**: The product tour wizard auto-starts regardless of whether `onboarding_completed` is true, showing the "Welcome to Alloro" overlay on top of the onboarding flow.
3. **Wizard skip is permanent**: Clicking "Skip" permanently marks the wizard completed with no UI to restart it.
4. **Dead code confusion**: `handleComplete` in OnboardingContainer is never invoked by any step component — onboarding completion only happens in `OnboardingPaymentSuccess.tsx`.

## Context Summary

### Onboarding Step Flow
- Step 1: User Info (firstName, lastName, phone)
- Step 2: Practice Info (name, address, domain) → creates org via `saveProfileAndCreateOrg()`
- Step 3: GBP Connect (optional Google OAuth + location selection)
- Step 4: Plan Chooser → Stripe Checkout → `OnboardingPaymentSuccess` → `completeOnboarding()`

### Key Files
| File | Role |
|------|------|
| `signalsai/src/components/onboarding/OnboardingContainer.tsx` | Step orchestrator, resume logic |
| `signalsai/src/hooks/useOnboarding.ts` | Step state, API actions |
| `signalsai/src/pages/Dashboard.tsx` | Render branch logic |
| `signalsai/src/contexts/OnboardingWizardContext.tsx` | Wizard auto-start, skip/complete |
| `signalsai/src/contexts/AuthContext.tsx` | `loadUserProperties()`, `onboardingCompleted` state |
| `signalsai/src/pages/OnboardingPaymentSuccess.tsx` | Post-Stripe completion + redirect |

### User's Exact Experience (Traced)
1. Filled practice details → `handleSaveProfileAndAdvance` calls `saveProfileAndCreateOrg()`, then `refreshUserProperties()`, then `nextStep()`
2. Inside `loadUserProperties()`, `setUserProfile()` fires BEFORE `await getBillingStatus()` — React may flush this mid-function
3. Resume `useEffect` fires: sees `organizationId` set + `currentStep === 2` → calls `setCurrentStep(3)`
4. `await getBillingStatus()` completes, `loadUserProperties()` returns, `nextStep()` runs → `setCurrentStep(prev + 1)` = 3 + 1 = **4**
5. User sees Step 3 flash, then Step 4 (payment) immediately
6. User refreshes → `OnboardingWizardContext` mounts, calls `getWizardStatus()`, finds `onboarding_wizard_completed === false` → auto-starts wizard overlay
7. User skips wizard → permanently marked complete
8. On next refresh: wizard gone, stuck at Step 3 with no tour

## Existing Patterns to Follow

- State management via React Context (AuthContext, OnboardingWizardContext)
- API calls through dedicated service modules (`api/onboarding.ts`)
- Feature services on backend follow single-responsibility pattern
- Onboarding status centralized in AuthContext with localStorage cache
- Guard pattern: `prev === true && !isCompleted ? true : isCompleted` in AuthContext (line 59)

## Proposed Approach

### Fix 1: Eliminate resume useEffect race condition
**File:** `OnboardingContainer.tsx`

Replace the `useEffect` resume logic with **initial state computation**. Instead of using a side-effect that reacts to `organizationId` changes, compute the starting step on mount:

```tsx
// BEFORE (reactive, causes race condition):
useEffect(() => {
  if (userProfile?.organizationId && currentStep < 3) {
    setCurrentStep(3);
  }
}, [userProfile?.organizationId]);

// AFTER (computed initial state, no race):
// In useOnboarding hook, accept an initialStep parameter
const { currentStep, ... } = useOnboarding(
  userProfile?.organizationId ? 3 : 1
);
```

Modify `useOnboarding.ts` to accept an `initialStep` parameter:
```tsx
export const useOnboarding = (initialStep: number = 1) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  // ...rest unchanged
};
```

Remove the resume `useEffect` entirely from OnboardingContainer.

**Why this works:** The starting step is computed once from props, not reactively. No race condition because there's no effect to fire mid-update.

**Edge case:** If `userProfile` is null on first render (still loading), the initial step would be 1. We need to handle this by deferring OnboardingContainer render until `userProfile` is loaded. Dashboard already does this — it shows a loading spinner while `isLoadingUserProperties` is true.

### Fix 2: Guard wizard auto-start on onboarding completion
**File:** `OnboardingWizardContext.tsx`

The wizard's mount check (line 82-108) must NOT auto-start unless main onboarding is complete. Two approaches:

**Approach A (preferred):** Pass `onboardingCompleted` into the wizard context and guard:
```tsx
// In the mount useEffect:
if (!response.onboarding_wizard_completed && onboardingCompleted === true) {
  setShowWelcomeModal(true);
  setIsWizardActive(true);
}
```

This requires the wizard context to consume AuthContext's `onboardingCompleted` state. Since `OnboardingWizardProvider` is nested inside `AuthProvider` in App.tsx, this is safe.

Similarly, guard `recheckWizardStatus()` — only auto-start wizard if `onboardingCompleted === true`.

### Fix 3: Remove dead `handleComplete` code
**File:** `OnboardingContainer.tsx`

Remove `handleComplete` function (lines 83-98) and the `isCompletingOnboarding` state (line 55) and the "Preparing your dashboard" JSX (lines 117-148). This code is never reached — completion is handled by `OnboardingPaymentSuccess.tsx`. Keeping dead code creates confusion about where completion actually happens.

Also remove `completeOnboarding` from the destructured `useOnboarding()` return since it's no longer used in this component.

### Fix 4: Make wizard restartable
**File:** `OnboardingWizardContext.tsx` (already has `restartWizard()`)

The `restartWizard` function already exists and works. The issue is there's no UI to trigger it. Add a "Restart Product Tour" button to Settings page.

**File:** Settings page (wherever the settings UI lives)
- Add a section or button: "Restart Product Tour"
- Calls `restartWizard()` from the wizard context
- Only show when `onboarding_wizard_completed === true`

### Fix 5: Label the Step 3 button accurately
**File:** `Step2_DomainInfo.tsx`

The "Get Started" button (line 346) advances to Step 4 but reads like it starts the GBP connection. Change the label based on connection state:
- If GBP connected and locations selected: "Continue" or "Next"
- If GBP not connected: Keep "Skip for now" visible but change main button to "Continue without GBP" or "Next"
- Remove "Get Started" label — it's ambiguous

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Initial step computation depends on `userProfile` load timing | Level 2 | Dashboard already gates on `isLoadingUserProperties` before rendering OnboardingContainer |
| Wizard context consuming AuthContext creates coupling | Level 1 | These contexts are already tightly related; this makes the dependency explicit |
| Removing `handleComplete` dead code | Level 1 | Completion path via PaymentSuccess is confirmed working |
| Settings UI change for wizard restart | Level 1 | Additive, no existing behavior changes |
| Button label change on Step 3 | Level 1 | Copy change only, no logic change |

## Definition of Done

- [ ] After saving practice details (Step 2), user lands on Step 3 and stays there until explicit user action
- [ ] Refreshing during onboarding does NOT show the wizard welcome overlay
- [ ] Wizard only auto-starts AFTER `onboarding_completed === true`
- [ ] "Skip" on wizard is reversible — user can restart from Settings
- [ ] Dead `handleComplete` code removed from OnboardingContainer
- [ ] Step 3 button label clearly communicates "advance to next step" not "start GBP connection"
- [ ] No regressions: completing payment → PaymentSuccess → dashboard still works end-to-end

## Blast Radius Analysis

- **OnboardingContainer.tsx**: Resume logic rewritten, dead code removed. Only affects users in active onboarding flow.
- **useOnboarding.ts**: Minor signature change (accept `initialStep`). No external API changes.
- **OnboardingWizardContext.tsx**: Added guard condition. Only affects wizard start timing — all wizard functionality unchanged.
- **Step2_DomainInfo.tsx**: Button label change. No logic change.
- **Settings page**: Additive button. No existing behavior modified.
- **AuthContext.tsx**: No changes needed.
- **Backend**: No changes needed. All fixes are frontend-only.

## Execution Log

All fixes implemented. TypeScript compiles clean (`npx tsc --noEmit` passes).

### Files Modified
1. **`signalsai/src/hooks/useOnboarding.ts`** — Added `initialStep` parameter to hook signature
2. **`signalsai/src/components/onboarding/OnboardingContainer.tsx`** — Replaced reactive useEffect resume logic with computed `initialStep`. Removed dead `handleComplete`, `isCompletingOnboarding` state, and "Preparing your dashboard" JSX. Removed unused `Loader2` import and `useEffect` import.
3. **`signalsai/src/contexts/OnboardingWizardContext.tsx`** — Added `useAuth` import. Guarded mount `useEffect` and `recheckWizardStatus` to only fire when `onboardingCompleted === true`. Changed dependency array from `[]` to `[onboardingCompleted]`.
4. **`signalsai/src/components/onboarding/Step2_DomainInfo.tsx`** — Changed "Get Started" button label to "Continue"
5. **`signalsai/src/pages/Settings.tsx`** — Added `useOnboardingWizard` import. Added "Restart Product Tour" button in profile tab (only shown when wizard is not active).
