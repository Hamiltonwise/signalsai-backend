# Restructure Onboarding Steps — Org Creation at Step 2, GBP + Domain at Step 3

## Problem Statement

The current 3-step onboarding flow is:
1. **Step 1** — User info (name, phone)
2. **Step 2** — Practice info + address + GBP selector
3. **Step 3** — Domain name → calls `completeOnboarding()` (creates org)

This creates two problems:

1. **GBP selector in Step 2 is broken for password-only users** — The GBP selector requires `tokenRefreshMiddleware` which requires `organizationId`, but the org doesn't exist until Step 3's `completeOnboarding()` runs. So the GBP section in Step 2 can never work for new users.

2. **No resume capability** — If a user completes Step 3 (org created, onboarding marked complete) but hasn't connected GBP yet, there's no way to direct them back to GBP selection on their next login. They skip straight to the dashboard empty state.

The user wants:
- **Step 2 creates the organization** (after collecting practice info + address)
- **Step 3 combines domain + GBP connection/selection** — since org now exists, GBP endpoints will work
- **Resume behavior** — if a user returns after org creation but before GBP setup, skip directly to Step 3

## Context Summary

### Current Onboarding Architecture

**Frontend:**
- `OnboardingContainer.tsx` — orchestrates 3 steps, calls `handleComplete` on Step 3's `onNext`
- `useOnboarding.ts` hook — manages all form state, step navigation, `completeOnboarding()` which posts to `/save-properties`
- Step components: `Step0_UserInfo`, `Step1_PracticeInfo`, `Step2_DomainInfo`
- `ProgressIndicator.tsx` — renders step dots based on `currentStep` and `totalSteps`
- `AuthContext.tsx` — caches `onboardingCompleted`, `hasGoogleConnection`, `hasProperties` from `/api/onboarding/status`

**Backend:**
- `POST /save-properties` → `completeOnboarding()` in `OnboardingController.ts` — handles both OAuth users (existing org) and password users (calls `completeOnboardingForPasswordUser` → `bootstrapOrganization`)
- `GET /status` → `getOnboardingStatus()` — returns `onboardingCompleted`, `hasGoogleConnection`, `organizationId`, `profile` data
- GBP endpoints (`/available-gbp`, `/save-gbp`, `/gbp-website`) — all require `tokenRefreshMiddleware` which requires `organizationId`
- `OrganizationBootstrapService.ts` — creates org + org_user link in transaction

**OAuth Flow (Critical Issue Identified):**
- `GoogleConnectButton` uses `window.location.href` (full-page redirect) but the OAuth callback returns HTML designed for popup (`window.opener.postMessage`). This means after OAuth, the user is **stranded on a success page** with no path back to the app.
- `MissingScopeBanner` (in Settings) correctly uses `window.open()` + message listener pattern.

### Middleware Chain
```
authenticateToken → rbacMiddleware → [tokenRefreshMiddleware] → handler
```
- `rbacMiddleware` sets `req.organizationId` from `organization_users` table (undefined if no row)
- `tokenRefreshMiddleware` requires `req.organizationId` to find `google_connections` token

## Existing Patterns to Follow

- Step components receive form state + callbacks as props from `OnboardingContainer`
- `useOnboarding` hook owns all mutable state and API calls
- `completeOnboarding()` in the hook posts profile data to `/save-properties`
- Backend `OnboardingController` already handles org-less users in `getOnboardingStatus` and `completeOnboarding`
- `AuthContext.loadUserProperties()` reads onboarding status from backend on mount

## Proposed Approach

### New Step Flow

| Step | Current | New |
|------|---------|-----|
| 1 | User Info (name, phone) | User Info (name, phone) — **unchanged** |
| 2 | Practice Info + Address + GBP | Practice Info + Address → **creates org on "Continue"** |
| 3 | Domain name → completes onboarding | Domain + Google Connect + GBP selector → **completes onboarding** |

### Frontend Changes

#### 1. Split `completeOnboarding()` into two backend calls

**`useOnboarding.ts`:**
- Add new function `saveProfileAndCreateOrg()` — calls a new backend endpoint `POST /api/onboarding/save-profile` that:
  - Creates the organization (via `bootstrapOrganization`)
  - Saves user profile (name, phone) and practice info (name, address)
  - Does NOT mark `onboarding_completed = true` yet
  - Returns `{ success: true, organizationId: number }`
- Rename existing `completeOnboarding()` → keep it for Step 3, but it now only saves domain + marks `onboarding_completed = true`
- `totalSteps` stays at 3

#### 2. Modify `Step1_PracticeInfo.tsx`

- **Remove** all GBP-related code (GBP modal, GBP state, GBP selector UI)
- **Remove** `hasGoogleConnection`, `onGbpSelect`, `fetchAvailableGBP`, `selectedGbpLocations` props
- On "Continue" click: call `saveProfileAndCreateOrg()` (via new `onNext` prop that does this), then advance to Step 3
- Show a loading state while the org is being created

#### 3. Create new `Step2_DomainAndGBP.tsx` (replaces `Step2_DomainInfo.tsx`)

Combines the old domain-only step with GBP connection:

- **Section 1: Domain Name** — same as current `Step2_DomainInfo` (input + domain check)
- **Section 2: Google Business Profile (Optional)** — with two sub-states:
  - **Not connected:** Show `GoogleConnectButton` inline with explanation text
  - **Connected:** Show GBP location selector (moved from old Step 2)
- "Get Started" button calls `completeOnboarding()` → marks onboarding done
- GBP is optional — user can click "Get Started" with just a domain

#### 4. Fix `GoogleConnectButton.tsx` OAuth pattern

The current `window.location.href` redirect is broken (user gets stranded on callback HTML). Two options:

**Option A (Recommended): Switch to popup pattern** — match `MissingScopeBanner`'s approach:
- Use `window.open()` to open OAuth in popup
- Listen for `GOOGLE_OAUTH_SUCCESS` postMessage
- On success: call `refreshUserProperties()` to update `hasGoogleConnection` state
- User stays on onboarding Step 3 throughout

**Option B: Add redirect support to callback** — modify backend to detect non-popup context and redirect to `/dashboard`. More invasive, changes shared auth infrastructure.

We go with **Option A**.

#### 5. Update `OnboardingContainer.tsx`

- Step 2 (`Step1PracticeInfo`): `onNext` now calls `saveProfileAndCreateOrg()` then advances
- Step 3 (`Step2DomainAndGBP`): `onNext` calls `completeOnboarding()` (domain + mark complete)
- Pass `hasGoogleConnection` to Step 3 instead of Step 2
- Pass GBP-related props to Step 3

#### 6. Update `AuthContext.tsx` — Resume logic

After `loadUserProperties()`:
- If `onboardingCompleted === false` AND `organizationId !== null` → user has an org but didn't finish
- Expose a new field: `onboardingResumeStep: number | null` — `3` if org exists but onboarding not complete, `null` otherwise
- `useOnboarding` hook reads this to set initial `currentStep`

### Backend Changes

#### 1. New endpoint: `POST /api/onboarding/save-profile`

Route: `authenticateToken → rbacMiddleware → handler`

Handler logic:
- If `req.organizationId` exists → update org with practice data, update user profile
- If `req.organizationId` is missing → call `bootstrapOrganization()` to create org, then update
- Does NOT set `onboarding_completed = true`
- Returns `{ success: true, organizationId: number }`

#### 2. Modify `POST /api/onboarding/save-properties`

- Now only responsible for: saving domain name + marking `onboarding_completed = true`
- Expects `req.organizationId` to exist (org was created in Step 2)
- Simpler logic: update `organizations.domain` and `organizations.onboarding_completed = true`

#### 3. Update `GET /api/onboarding/status` response

Add `organizationId` presence as a signal for resume:
- Already returns `organizationId: null` for no-org users
- Already returns `organizationId: number` + `onboardingCompleted: false` for mid-onboarding users
- No change needed — frontend reads existing fields

### Data Flow Summary

```
Step 1 (User Info) → local state only, no API call
    ↓
Step 2 (Practice Info) → POST /save-profile → creates org + saves profile
    ↓
Step 3 (Domain + GBP) → [optional: Google OAuth popup → connects GBP]
                        → POST /save-properties → saves domain, marks complete
```

**Resume flow (user returns after Step 2):**
```
Login → AuthContext loads /status → onboardingCompleted=false, organizationId=123
    → Dashboard renders OnboardingContainer
    → useOnboarding sees org exists → starts at Step 3
```

## Architectural Decisions

### Decision 1: Org creation at Step 2, not Step 3
**Reasoning:** GBP endpoints require `organizationId` via middleware. Creating the org earlier unblocks GBP operations in Step 3.
**Tradeoff:** If user abandons after Step 2, an org exists with `onboarding_completed = false`. This is acceptable — the org is cleaned up data-wise, and the resume logic handles it.

### Decision 2: Popup OAuth instead of full-page redirect
**Reasoning:** The backend callback handler already generates popup HTML (`window.opener.postMessage`). Changing GoogleConnectButton to use `window.open()` aligns with the existing pattern (MissingScopeBanner) and keeps the user on the onboarding step.
**Tradeoff:** Popup blockers could interfere, but this matches the existing Settings pattern that works in production.

### Decision 3: Domain stays required, GBP stays optional
**Reasoning:** Domain is needed for SEO/analytics features. GBP connection can happen post-onboarding in Settings.
**Tradeoff:** Users who skip GBP during onboarding see the "Connect Properties" empty state on the dashboard — which is the existing behavior.

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Orphaned orgs (user abandons after Step 2) | Level 1 | Org has `onboarding_completed = false` — can be cleaned up; resume logic handles re-entry |
| Popup blocker prevents Google OAuth | Level 2 | Same risk as existing Settings flow; can add fallback messaging |
| Race condition: OAuth completes but `hasGoogleConnection` not refreshed | Level 2 | After OAuth success message, explicitly call `refreshUserProperties()` before showing GBP selector |
| Backend `/save-profile` called twice (double-click) | Level 1 | `bootstrapOrganization` already has retry safety (checks for existing org_user row) |

## Failure Mode Analysis

- **User closes browser during Step 2 API call:** Transaction rolls back, no partial data. User restarts at Step 1.
- **User completes Step 2, closes browser, returns:** `getOnboardingStatus` returns `organizationId` + `onboardingCompleted: false` → frontend resumes at Step 3.
- **OAuth popup blocked:** User sees no popup. GBP section stays in "not connected" state. User can proceed without GBP or retry.
- **OAuth succeeds but postMessage fails:** Popup shows success page but stays open. User manually closes popup, can retry the connect button.
- **`/save-properties` fails after org is created:** `onboarding_completed` stays `false`. User retries Step 3.

## Security Considerations

- `POST /save-profile` uses same auth middleware chain as existing endpoints
- `bootstrapOrganization` already validates no duplicate `organization_users` rows
- No new attack surface — reusing existing OAuth patterns

## Performance Considerations

- One additional API call (Step 2 now calls `/save-profile`). Acceptable — it's a one-time onboarding action.
- No N+1 risks — single transaction per step.

## Observability & Monitoring Impact

- Existing `console.log("[Onboarding]...")` pattern continues for new endpoint
- `bootstrapOrganization` already logs org creation

## Test Strategy

- Manual: Create new password user → complete Step 1 → Step 2 creates org → Step 3 connect GBP + domain → verify dashboard loads
- Manual: Complete Step 2, close browser, re-login → verify resume at Step 3
- Manual: Complete Step 2, skip GBP, enter domain → verify onboarding completes
- Manual: Verify existing OAuth users still work (they already have org)

## Blast Radius Analysis

**Frontend files modified:**
- `useOnboarding.ts` — new function, modified `completeOnboarding`
- `Step1_PracticeInfo.tsx` — remove GBP code
- `Step2_DomainInfo.tsx` → renamed/replaced by `Step2_DomainAndGBP.tsx` — adds GBP section
- `OnboardingContainer.tsx` — rewire step props
- `GoogleConnectButton.tsx` — switch to popup OAuth
- `AuthContext.tsx` — add resume step calculation
- `authContext.ts` — add `onboardingResumeStep` to type

**Backend files modified:**
- `OnboardingController.ts` — new `saveProfile` handler, simplify `completeOnboarding`
- `onboarding.ts` routes — add `/save-profile` route
- `ProfileCompletionService.ts` — new `saveProfileAndBootstrapOrg()` function

**Backend files unchanged:**
- `OrganizationBootstrapService.ts` — reused as-is
- Middleware — no changes
- `getOnboardingStatus` — no changes (already returns the right data)

**No impact on:**
- Settings page GBP flow
- Dashboard rendering logic
- Existing OAuth users' onboarding path

## Definition of Done

- [ ] Step 2 "Continue" creates the organization and saves profile/practice data
- [ ] Step 3 shows domain input + Google connect button + GBP selector
- [ ] Google connect uses popup pattern (not full-page redirect)
- [ ] GBP selector appears after successful Google connection
- [ ] User can complete onboarding with just domain (GBP optional)
- [ ] Returning user with org but incomplete onboarding resumes at Step 3
- [ ] TypeScript compiles with no errors
- [ ] Existing OAuth user onboarding path unbroken
