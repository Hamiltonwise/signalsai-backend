# Remove Phone from Onboarding & Settings, Fix Banners

## Problem Statement
Multiple UI cleanup items:
1. Remove phone field from onboarding Step 0
2. Remove phone and location rows from settings profile card
3. When no Google connection + no locations: show "Connect Google" banner instead of PMS banner
4. Show "You're All Set" PMS banner only when no PMS data AND at least 1 location registered
5. Change Google Connect button to white background with black text

## Context Summary
- `Step0_UserInfo.tsx` — onboarding step with phone field
- `useOnboarding.ts` — holds businessPhone state
- `OnboardingContainer.tsx` — passes phone props
- `onboardingValidation.ts` — backend requires phone
- `Settings.tsx` — shows phone + location EditableInfoRows, PMS banner
- `GoogleConnectButton.tsx` — primary variant color
- `PMSUploadBanner.tsx` — "You're All Set" banner

## Proposed Approach
### Onboarding (3 files)
1. `Step0_UserInfo.tsx` — Remove phone field, phone validation, phone helpers, phone props
2. `useOnboarding.ts` — Remove businessPhone state and exports
3. `OnboardingContainer.tsx` — Remove businessPhone props

### Backend (1 file)
4. `onboardingValidation.ts` — Make phone optional

### Settings (1 file)
5. `Settings.tsx` — Remove phone and location EditableInfoRows, add Google connect banner when !hasGoogleConnection && !hasProperties, keep PMS banner condition as hasProperties && !hasPmsData

### Google Connect Button (1 file)
6. `GoogleConnectButton.tsx` — Change primary variant to white bg + black text

## Risk Analysis
- Level 1 — Suggestion. UI removals and conditional banner logic.

## Definition of Done
- [x] Phone removed from onboarding
- [x] Phone + location removed from settings profile
- [x] Google connect banner shown when no Google connection
- [x] PMS banner shown only with locations registered
- [x] Google Connect button white bg + black text
- [x] Dead code cleanup: removed EditableInfoRow, profileData, fetchProfile, unused imports
- [x] Setup Progress wizard: fixed step 1 auto-detect to also mark incomplete when Google disconnected
- [x] "Connect Your Google Properties" → "Connect Your Google Business Profile" in Dashboard + PMSVisualPillars
- [x] Website tab empty state: removed "No Pages Yet" card, added animated building blocks, updated copy, removed auto-update note

## Revision Log
### 2026-03-04 — Additional fixes
- **Setup Progress floater**: Step 1 was showing as completed even without Google connection. Added reverse auto-detect in `SetupProgressContext.tsx` to mark step 1 incomplete when `!hasGoogleConnection && !hasProperties`.
- **Text updates**: Changed "Connect Your Google Properties" to "Connect Your Google Business Profile" in `Dashboard.tsx` and `PMSVisualPillars.tsx`.
- **Website tab empty state**: Replaced "No Pages Yet" card with animated alloro-orange building blocks animation. Updated copy to "Alloro is setting up your pages". Removed "This page will update automatically" text.
- **Dead code cleanup**: Removed `EditableInfoRow` component, `profileData` state, `fetchProfile` function, `getProfile`/`updateProfile`/`ProfileData` imports, and unused lucide icons (`Edit3`, `Check`, `X`) from `Settings.tsx`.
