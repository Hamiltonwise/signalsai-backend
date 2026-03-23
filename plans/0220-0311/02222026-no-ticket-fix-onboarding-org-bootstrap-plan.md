# Fix Onboarding Organization Bootstrap for Password-Only Users

## Problem Statement

Password-only users (email/password signup, no Google OAuth) cannot complete onboarding. Two failures:

1. **`POST /onboarding/save-properties` returns "Missing organization ID"** — `extractOrganizationId()` throws because `req.organizationId` is `undefined`. The `ProfileCompletionService` has logic to create an organization, but it's unreachable because the gatekeeper blocks first.

2. **GBP selector returns "Organization required for Google API access"** — `tokenRefreshMiddleware` rejects because no `organization_users` row exists, so `req.organizationId` is `undefined`.

Root cause: Password signup creates a `users` row but no `organization_users` row. Every onboarding endpoint depends on `rbacMiddleware` setting `req.organizationId`, which requires that row to exist. The organization is supposed to be created in `save-properties`, but `save-properties` can't run without it — a chicken-and-egg problem.

## Context Summary

**Current middleware chain for onboarding:**
```
authenticateToken → rbacMiddleware → [tokenRefreshMiddleware for GBP routes] → handler
```

- `rbacMiddleware` queries `organization_users` for the JWT's `userId`. If no row → `req.organizationId = undefined`, still calls `next()`.
- `extractOrganizationId()` in handlers throws 400 if `req.organizationId` is falsy.
- `tokenRefreshMiddleware` returns 400 if `req.organizationId` is falsy.
- OAuth users work because `OAuthFlowService.completeOAuthFlow()` creates `organization_users` during callback.

**Frontend context:**
- `NewAccountOnboarding.tsx` has a "Skip for now" button → navigates to `/dashboard`.
- `GoogleConnectButton.tsx` immediately redirects to Google OAuth on click — no confirmation.
- `Step1_PracticeInfo.tsx` always shows the GBP selector button, regardless of connection status.
- `useOnboarding.ts` calls `onboarding.saveProperties()` which hits the broken endpoint.

## Existing Patterns to Follow

- `ProfileCompletionService` already handles org creation inside a transaction (lines 39-60) — the pattern exists, just unreachable.
- `OrganizationModel.create()` + `OrganizationUserModel.create()` are the standard way to bootstrap an org.
- RBAC middleware already gracefully handles missing org (sets `undefined`, continues).
- `handleError()` in OnboardingController uses consistent error response shapes.

## Proposed Approach

### Backend Changes

#### 1. New service: `OrganizationBootstrapService`

Create a focused service that handles org creation for users who don't have one yet. This replaces the inline org-creation logic currently buried in `ProfileCompletionService` (which depends on `google_connections`).

**Location:** `signalsai-backend/src/controllers/onboarding/feature-services/OrganizationBootstrapService.ts`

**Logic:**
```
bootstrapOrganization(userId, profileData, trx):
  1. Create organization (name = practiceName)
  2. Create organization_users row (userId, orgId, role = "admin")
  3. Return orgId
```

#### 2. Modify `completeOnboarding()` in `OnboardingController.ts`

Instead of calling `extractOrganizationId(req)` (which throws), handle both paths:

- **If `req.organizationId` exists** (OAuth user) → use existing `completeOnboardingWithProfile()` path
- **If `req.organizationId` is undefined** (password user, no org yet) → call `OrganizationBootstrapService` to create org, then update user profile fields on the `users` and `organizations` tables directly (no `google_connections` dependency)

The handler needs `req.userId` (always available from RBAC middleware) to create the org link.

#### 3. Modify `ProfileCompletionService.completeOnboardingWithProfile()`

Currently takes `googleAccountId` as first param and requires a `google_connections` row. This needs a parallel path:

- Add a new function `completeOnboardingForPasswordUser(userId, profileData)` that:
  1. Creates org + org_user link (via bootstrap service)
  2. Updates `users` table with profile fields (first_name, last_name, phone)
  3. Updates `organizations` table (name, domain, operational_jurisdiction, onboarding_completed = true)
  4. All within a single transaction

#### 4. Update `getOnboardingStatus()` handler

Currently requires `organizationId` AND a `google_connections` row. For password-only users with no org:
- Return a "not started" status instead of throwing.
- Return `onboardingCompleted: false` with null profile data.

### Frontend Changes

#### 5. Add confirmation dialog to `GoogleConnectButton`

When the user clicks "Connect Google Account":
- Show a confirmation modal: "Are you sure you want to connect your Google Business Profile account?"
- Confirm → proceed with OAuth redirect
- Cancel → close dialog, user stays on page

Simple `useState` + inline modal, no new component needed.

#### 6. Hide GBP selector when no Google connection exists

In `Step1_PracticeInfo.tsx`:
- Accept a new prop `hasGoogleConnection: boolean`
- If `false`: show an info message instead of the GBP selector button: "Connect your Google account in Settings to select GBP locations."
- If `true`: show the existing GBP selector button

The parent (`OnboardingContainer`) needs to know whether a Google connection exists. This can be derived from auth context or a simple check.

## Architectural Decisions

**Decision 1: Separate bootstrap service vs. modifying RBAC middleware**
- Option A: Make RBAC middleware auto-create orgs → Rejected. RBAC is read-only by design. Creating orgs in middleware violates separation of concerns.
- Option B: Create a dedicated bootstrap service → Chosen. Keeps org creation explicit and transactional within the onboarding flow.

**Decision 2: New function vs. modifying existing `completeOnboardingWithProfile`**
- Option A: Modify existing function to handle both paths → Rejected. It's tightly coupled to `google_connections` (fetches by ID, updates profile fields on that table).
- Option B: New function for password users → Chosen. Clean separation. OAuth path stays unchanged, password path has its own logic.

**Decision 3: Confirmation dialog approach**
- Simple inline confirmation using existing Tailwind modal patterns. No external library, no new shared component.

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| OAuth user path broken by changes | Level 2 | OAuth path remains untouched — `completeOnboardingWithProfile()` is not modified, only called when `req.organizationId` exists |
| Duplicate org creation on retry | Level 2 | Check for existing `organization_users` row before creating, inside the transaction |
| Profile data stored inconsistently between user types | Level 2 | Password users store profile on `users` + `organizations` tables (the new canonical location). OAuth users still use `google_connections` fields transitionally |

## Failure Mode Analysis

- **Partial failure in org bootstrap**: Transaction ensures atomicity — org + org_user created together or neither.
- **User refreshes mid-onboarding**: No issue — `getOnboardingStatus` will return "not started" for password users, wizard restarts.
- **User connects Google after completing onboarding**: Settings page handles this independently — `OAuthFlowService` links connection to existing org.
- **Concurrent requests**: Transaction isolation prevents duplicate orgs.

## Security Considerations

- `userId` from JWT (via `authenticateToken` + `rbacMiddleware`) is the only identity source. No user-supplied ID.
- Org creation is gated behind JWT authentication — no unauthenticated access.
- Admin role assigned only to the creating user.

## Performance Considerations

- One additional DB query (check existing org_user) for the new path. Negligible.
- No N+1 risks. Single transaction with 2-3 inserts.

## Test Strategy

- Manual test: Register password-only user → complete 3-step onboarding → verify org + org_user created → verify dashboard loads.
- Manual test: Register password-only user → verify GBP selector shows "connect in Settings" message.
- Manual test: OAuth user → verify existing flow unchanged.
- Manual test: Click Google connect button → verify confirmation dialog appears → cancel → verify no redirect.

## Blast Radius Analysis

| Component | Impact |
|-----------|--------|
| `OnboardingController.completeOnboarding()` | Modified — adds password-user path |
| `OnboardingController.getOnboardingStatus()` | Modified — handles missing org gracefully |
| `ProfileCompletionService` | New function added, existing untouched |
| `OrganizationBootstrapService` | New file |
| `GoogleConnectButton.tsx` | Modified — adds confirmation dialog |
| `Step1_PracticeInfo.tsx` | Modified — conditional GBP selector |
| `OnboardingContainer.tsx` | Modified — passes `hasGoogleConnection` prop |
| `useOnboarding.ts` | No change |
| RBAC middleware | No change |
| Token refresh middleware | No change |
| GBP routes | No change |
| OAuth flow | No change |

## Definition of Done

- [ ] Password-only users can complete all 3 onboarding steps and land on dashboard
- [ ] Organization + organization_users rows created during save-properties for password users
- [ ] OAuth users' onboarding flow unchanged
- [ ] Confirmation dialog shown before Google OAuth redirect
- [ ] GBP selector hidden with guidance message when no Google connection exists
- [ ] No 400 errors for password-only users during onboarding
