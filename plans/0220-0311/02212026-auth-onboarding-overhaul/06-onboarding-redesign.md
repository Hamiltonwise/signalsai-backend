# Plan 06 — Onboarding Redesign

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 04 (backend auth), 05 (frontend auth)
**Estimated files:** ~10 files

---

## Entry Conditions

- Plans 04 and 05 complete (email/password auth works end-to-end)
- Users can register, verify email, and log in
- JWT-based session is active
- `users` table has profile columns (first_name, last_name, phone)
- `organizations` table has onboarding columns (onboarding_completed, setup_progress)
- `google_connections` table exists

---

## Problem Statement

Redesign the onboarding flow to work without Google OAuth as a prerequisite. Users arrive at onboarding after email signup + verification. The 3-step wizard collects the same data (user info, practice info with optional GBP, domain info) but saves to `users` and `organizations` tables. GBP connection is optional and triggers a standalone Google OAuth popup for integration only.

---

## Step 1: Redesign NewAccountOnboarding page

**File:** `signalsai/src/pages/NewAccountOnboarding.tsx`

**Current flow:**
1. Step 1: Google API Terms modal → Accept
2. Step 2: "Connect Google Account" button → OAuth popup
3. On success: redirect to OnboardingContainer wizard

**New flow:**
1. User arrives already authenticated (JWT from signup/verify)
2. Directly show OnboardingContainer wizard (no Google OAuth gate)
3. Remove: Google API Terms step, Google Connect button
4. The entire "Phase 1" is gone — user goes straight to profile wizard

**Changes:**
- Remove Google API Terms modal
- Remove GoogleConnectButton
- Remove OAuth state management
- Check: if user already has `onboarding_completed = true` via their organization, redirect to dashboard
- If no organization yet: show wizard

---

## Step 2: Update OnboardingContainer

**File:** `signalsai/src/components/onboarding/OnboardingContainer.tsx`

**Keep:** 3-step wizard structure, animations, transitions, loading state, error handling.

**Update:**
- Remove any dependency on `google_account_id` for state management
- Read user identity from AuthContext (JWT-based)
- On completion: call updated backend endpoint that creates org and saves to correct tables

---

## Step 3: Update Step 0 — User Info

**File:** `signalsai/src/components/onboarding/Step0_UserInfo.tsx`

**No major changes.** Same fields: first name, last name, phone.

**Minor update:** Data is now destined for `users` table (previously went to `google_accounts`). This is transparent to the frontend — the backend handles it.

---

## Step 4: Update Step 1 — Practice Info

**File:** `signalsai/src/components/onboarding/Step1_PracticeInfo.tsx`

**Keep:** Practice name, address fields (street, city, state, zip), GBP location selector.

**Update GBP connection flow:**
- Currently: GBP fetch uses `tokenRefreshMiddleware` which requires `x-google-account-id` header → user must already be Google-authenticated
- New: GBP connection triggers a standalone Google OAuth popup
  - User clicks "Connect Google Business Profile" button
  - Popup opens Google consent screen (scopes: openid, email, profile, business.manage)
  - On success: backend creates `google_connections` record linked to the user's organization (org may not exist yet — see Step 6)
  - Then: frontend calls `/onboarding/available-gbp` with JWT auth → backend looks up google_connection by org
  - GBP locations displayed, user selects

**Edge case:** Organization doesn't exist yet during Step 1. Options:
  a) Create org eagerly when user starts onboarding (before step completion)
  b) Store GBP connection temporarily and associate when org is created at completion

**Recommended:** Option (a) — create a placeholder org at the start of onboarding with minimal data, then update it on completion. This allows the google_connection to have an organization_id immediately.

**Alternative:** Store the Google OAuth tokens in a temporary state (session or user-level record) and create the google_connection at completion time. This avoids orphan orgs.

**Decision needed during execution:** Pick whichever pattern is cleaner given existing code structure.

---

## Step 5: Update Step 2 — Domain Info

**File:** `signalsai/src/components/onboarding/Step2_DomainInfo.tsx`

**No major changes.** Same field: domain name, same validation, same domain check API.

**Minor update:** Domain check endpoint may need to work without `x-google-account-id` header (should already be handled by Plan 04).

---

## Step 6: Update backend ProfileCompletionService

**File:** `signalsai-backend/src/controllers/onboarding/feature-services/ProfileCompletionService.ts`

**Current behavior:**
- Receives profile data + `googleAccountId`
- Loads GoogleAccount by ID
- If no organization: creates Organization, creates OrganizationUser
- Updates GoogleAccount with profile fields + `onboarding_completed = true`

**New behavior:**
- Receives profile data + `userId` (from JWT via req.user.userId)
- Loads User by ID
- Updates `users` table: first_name, last_name, phone
- If no organization exists for this user:
  - Creates Organization (name = practiceName, domain = domainName, operational_jurisdiction = address)
  - Creates OrganizationUser (user_id, org_id, role = "admin")
- If organization exists:
  - Updates Organization (name, domain, operational_jurisdiction)
- Sets `organizations.onboarding_completed = true`
- If GBP was connected: ensure google_connection.organization_id is set

---

## Step 7: Update backend GbpOnboardingService

**File:** `signalsai-backend/src/controllers/onboarding/feature-services/GbpOnboardingService.ts`

**Current:** Uses `oauth2Client` from `tokenRefreshMiddleware` (which required google_account_id header).

**New:** Uses `oauth2Client` from refactored `tokenRefreshMiddleware` (which resolves from organization_id). OR: uses a temporary OAuth client created during the GBP connection step.

**Update available-gbp endpoint:**
- Needs `req.organizationId` to look up google_connection
- Creates OAuth2 client from connection's tokens
- Fetches GBP locations
- Returns to frontend

**Update save-gbp endpoint:**
- Saves selected locations to `google_connections.google_property_ids.gbp`
- Uses organization_id (not google_account_id)

---

## Step 8: Update backend onboarding status endpoint

**File:** `signalsai-backend/src/controllers/onboarding/OnboardingController.ts`

**`GET /onboarding/status`:**
- Current: checks `google_accounts.onboarding_completed`
- New: checks `organizations.onboarding_completed` (via req.organizationId from rbac)
- Handle: user with no org yet → return `{ completed: false }`

**`GET /onboarding/setup-progress`:**
- Current: reads from `google_accounts.setup_progress`
- New: reads from `organizations.setup_progress`

**`PUT /onboarding/setup-progress`:**
- Current: writes to `google_accounts.setup_progress`
- New: writes to `organizations.setup_progress`

**Wizard status endpoints:** Same pattern — move from google_accounts to organizations.

---

## Step 9: Update frontend onboarding hook and API

**File:** `signalsai/src/hooks/useOnboarding.ts`

**Remove:** Any `google_account_id` dependencies in state management.

**File:** `signalsai/src/api/onboarding.ts`

**Update API calls:**
- Remove `google_account_id` from request params (backend resolves from JWT)
- Keep the same endpoint paths
- `saveProperties()` payload: same profile data, but backend saves to different tables

---

## Step 10: Update SetupProgressWizard

**File:** `signalsai/src/components/SetupProgressWizard/SetupProgressWizard.tsx`

**Update:**
- Step 1 should say "Connect Google Business Profile" (not "Connect Google Accounts" — GA4/GSC are gone)
- Navigate to settings GBP section (not general integrations)
- Status check reads from organization-level setup_progress

---

## Step 11: Update OnboardingWizardContext

**File:** `signalsai/src/contexts/OnboardingWizardContext.tsx`

**Remove:** All `getPriorityItem("google_account_id")` calls.
**Replace with:** User/org info from AuthContext.

---

## Verification

1. Full flow: signup → verify email → land on onboarding → complete 3 steps → dashboard
2. GBP optional: complete onboarding without connecting GBP
3. GBP connected: connect GBP during Step 1, select locations, complete onboarding
4. Organization created with correct data
5. User profile updated with first/last name, phone
6. `onboarding_completed = true` on organization
7. SetupProgressWizard shows after onboarding

---

## Exit Conditions

- [ ] NewAccountOnboarding page no longer requires Google OAuth
- [ ] OnboardingContainer works with JWT auth
- [ ] Profile data saves to users + organizations tables
- [ ] GBP connection is optional standalone OAuth flow
- [ ] Organization created at onboarding completion
- [ ] Onboarding status reads from organizations table
- [ ] Setup progress reads/writes to organizations table
- [ ] SetupProgressWizard updated for GBP-only messaging
- [ ] Full end-to-end onboarding flow works
