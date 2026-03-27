# Remove Primary Location Input from Onboarding Step 2

## Problem Statement
The onboarding Step 2 (Practice Info) currently collects street, city, state, and zip fields under a "Primary Location" section. These need to be removed, keeping only Practice Name and Website Domain.

## Context Summary
- `Step1_PracticeInfo.tsx` — renders the form with location fields
- `useOnboarding.ts` — holds street/city/state/zip state, concatenates into `operationalJurisdiction`
- `OnboardingContainer.tsx` — passes address props from hook to component
- `onboardingValidation.ts` — backend requires `operationalJurisdiction` as non-empty
- `ProfileCompletionService.ts` — stores `operational_jurisdiction` on org

## Existing Patterns to Follow
- Props-based form components with parent-managed state via hook
- Backend validation in `onboardingValidation.ts`

## Proposed Approach

### Frontend (3 files)
1. **`Step1_PracticeInfo.tsx`** — Remove location section (lines 367-524), remove address props from interface, remove address validation, remove address from `isFormValid()`, remove US_STATES array, remove state dropdown logic/state/effects
2. **`useOnboarding.ts`** — Remove street/city/state/zip state, stop sending `operationalJurisdiction` (or send empty string), remove from exports
3. **`OnboardingContainer.tsx`** — Remove address props passed to Step1PracticeInfo

### Backend (1 file)
4. **`onboardingValidation.ts`** — Make `operationalJurisdiction` optional (remove from required check)

## Risk Analysis
- **Level 1 — Suggestion.** Removing form fields is straightforward.
- The `operational_jurisdiction` column stays on the org table (nullable). We just stop collecting it during onboarding.
- Backend stores whatever is sent. Making it optional means existing orgs with data keep it, new orgs get null.

## Definition of Done
- [x] Location fields removed from Step 2 UI
- [x] Address state removed from `useOnboarding.ts`
- [x] Address props removed from `OnboardingContainer.tsx`
- [x] Backend validation no longer requires `operationalJurisdiction`
- [x] Form shows only: Practice Name + Website Domain
- [x] Frontend TypeScript compiles clean
- [x] Backend TypeScript compiles clean
