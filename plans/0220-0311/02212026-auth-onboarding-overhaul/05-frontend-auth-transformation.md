# Plan 05 — Frontend Auth Transformation

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 04 (backend auth endpoints exist, middleware chain updated)
**Estimated files:** ~15 frontend files

---

## Entry Conditions

- Plan 04 complete (backend has register/login/verify endpoints, JWT-based middleware)
- Backend responds to `Authorization: Bearer <JWT>` on all routes
- Backend no longer requires `x-google-account-id` header for auth
- Frontend currently compiles cleanly (Plans 01-02 done)

---

## Problem Statement

Replace the Google OAuth login UI with email/password signup + email verification + login forms. Refactor the frontend session management from `google_account_id` to JWT token. Update all API calls to stop sending `x-google-account-id`. Update route protection to check JWT.

---

## Step 1: Create Signup page

**New file:** `signalsai/src/pages/Signup.tsx`

**UI:**
- Email input
- Password input (with visibility toggle)
- Confirm password input (with visibility toggle)
- "Create Account" button
- "Already have an account? Sign in" link

**Behavior:**
- Validate: email format, password min 8 chars with 1 uppercase + 1 number, passwords match
- On submit: `POST /api/auth/register`
- On success: navigate to `/verify-email?email=<email>`
- On error: show inline error (email taken, validation failure)

**Follow existing page patterns:** Match Signin.tsx layout, styling, and component structure.

---

## Step 2: Create Email Verification page

**New file:** `signalsai/src/pages/VerifyEmail.tsx`

**UI:**
- "Enter the verification code sent to {email}" heading
- 6-digit code input (styled like OTP input if pattern exists)
- "Verify" button
- "Resend code" link (with cooldown timer)
- "Back to signup" link

**Behavior:**
- Read email from query params or navigation state
- On submit: `POST /api/auth/verify-email`
- On success: store JWT in localStorage, navigate to onboarding (or dashboard if already onboarded)
- On resend: `POST /api/auth/resend-verification`

---

## Step 3: Refactor Signin page

**File:** `signalsai/src/pages/Signin.tsx`

**Remove:**
- Google OAuth button/flow
- `useGoogleAuth` hook usage
- Google API terms modal trigger
- OAuth popup handling

**Add:**
- Email input
- Password input (with visibility toggle)
- "Sign In" button
- "Don't have an account? Sign up" link
- "Forgot password?" link (can be placeholder for now)

**Behavior:**
- On submit: `POST /api/auth/login`
- On success: store JWT in localStorage, store user role, navigate to dashboard
- On 403 (email not verified): navigate to `/verify-email?email=<email>`
- On 401: show "Invalid email or password"

---

## Step 4: Create frontend API functions for new auth

**New file:** `signalsai/src/api/auth-password.ts`

```typescript
export async function register(email: string, password: string, confirmPassword: string)
export async function verifyEmail(email: string, code: string)
export async function login(email: string, password: string)
export async function resendVerification(email: string)
```

Follow existing patterns from `signalsai/src/api/` — use `apiPost` from index.ts.

---

## Step 5: Update `getCommonHeaders()` in api/index.ts

**File:** `signalsai/src/api/index.ts`

**Remove:**
```typescript
const googleAccountId = getPriorityItem("google_account_id");
if (googleAccountId) {
  headers["x-google-account-id"] = googleAccountId;
}
```

**Keep:**
```typescript
const token = getPriorityItem("token");
if (token) {
  headers.Authorization = `Bearer ${token}`;
}
```

JWT is now the sole auth header.

---

## Step 6: Update ProtectedRoute

**File:** `signalsai/src/components/ProtectedRoute.tsx`

**Current:** Checks `getPriorityItem("google_account_id")`.

**New:** Check `getPriorityItem("auth_token")` or `getPriorityItem("token")` (whatever key the JWT is stored under).

If no token: redirect to `/signin`.

---

## Step 7: Update PublicRoute

**File:** `signalsai/src/components/PublicRoute.tsx`

**Current:** Checks `getPriorityItem("google_account_id")` to redirect authenticated users.

**New:** Check for JWT token instead.

---

## Step 8: Refactor AuthContext

**File:** `signalsai/src/contexts/AuthContext.tsx`

**Remove:**
- `getPriorityItem("google_account_id")` references
- `googleAccountId` from user profile state
- Any Google OAuth specific state

**Add/Update:**
- Load user profile via `POST /api/auth/otp/validate` (or new JWT validation endpoint)
- Store: userId, email, name, organizationId, role
- Expose: `user`, `isAuthenticated`, `isLoading`, `logout()`

**Logout function:**
- Clear `auth_token` from localStorage
- Clear `user_role` from localStorage
- Clear any session storage
- Navigate to `/signin`

---

## Step 9: Remove useGoogleAuth hook

**File:** `signalsai/src/hooks/useGoogleAuth.ts`

**Action:** Delete this file entirely. It handles Google OAuth popup flow for login — no longer needed.

Update any imports that reference it:
- `signalsai/src/pages/NewAccountOnboarding.tsx` (but this page is being redesigned in Plan 06)
- Any other files importing useGoogleAuth

---

## Step 10: Update PilotHandler

**File:** `signalsai/src/components/PilotHandler.tsx`

**Current:** Reads `google_account_id` from URL params, stores in sessionStorage.

**New:** Should receive a JWT token or user_id instead. Update to match new auth pattern. The pilot flow from admin should issue a JWT for the target user.

---

## Step 11: Update Admin components

**Files:**
- `signalsai/src/components/Admin/AdminTopBar.tsx` — Update logout: remove `localStorage.removeItem("google_account_id")`, ensure it removes `auth_token`
- `signalsai/src/components/Admin/PilotBanner.tsx` — Remove `sessionStorage.removeItem("google_account_id")`, update to new session key

---

## Step 12: Update localStorage references across components

**Files that read `google_account_id` from storage:**
- `signalsai/src/pages/Settings.tsx` — Replace all `getPriorityItem("google_account_id")` calls. These are used for API calls — after Step 5, the header is automatic via JWT, so these can be removed.
- `signalsai/src/pages/Dashboard.tsx` — Same pattern
- `signalsai/src/components/settings/PropertiesTab.tsx` — Same
- `signalsai/src/components/settings/UsersTab.tsx` — Same
- `signalsai/src/contexts/OnboardingWizardContext.tsx` — Same

**In most cases:** The `getPriorityItem("google_account_id")` calls were used to pass as API parameters. Since auth is now JWT-based and the backend resolves organizationId from JWT, these frontend-side ID lookups are no longer needed for auth headers. However, some may still need to pass `organizationId` as a query param — these should read from AuthContext instead.

---

## Step 13: Add routes for new pages

**File:** `signalsai/src/App.tsx` (or wherever routes are defined)

**Add:**
- `/signup` → `<Signup />`
- `/verify-email` → `<VerifyEmail />`

**Ensure:**
- `/signup` and `/verify-email` are public routes (accessible without auth)
- `/signin` still works with new email/password form

---

## Step 14: Update type definitions

**File:** `signalsai/src/types/google-auth.ts`

**Remove or update:** Types related to Google OAuth login flow. Keep types needed for GBP connection (separate from login).

**Files:**
- `signalsai/src/types/agentOutputs.ts` — Update `google_account_id` → `organization_id`
- `signalsai/src/types/tasks.ts` — Update `google_account_id` → `organization_id`

---

## Verification

1. Frontend compiles cleanly
2. Signup flow works: form → submit → verification page
3. Email verification works: code input → JWT stored → redirect
4. Login flow works: email/password → JWT stored → dashboard
5. Protected routes redirect to `/signin` without JWT
6. No remaining `google_account_id` references in localStorage operations
7. No remaining `x-google-account-id` in API headers
8. All API calls authenticate via JWT
9. Logout clears JWT and redirects

---

## Exit Conditions

- [ ] Signup page created and functional
- [ ] Email verification page created and functional
- [ ] Signin page refactored to email/password
- [ ] `getCommonHeaders()` no longer sends `x-google-account-id`
- [ ] ProtectedRoute checks JWT (not google_account_id)
- [ ] AuthContext loads user from JWT validation
- [ ] `useGoogleAuth` hook deleted
- [ ] All localStorage references updated from google_account_id to auth_token
- [ ] New routes added (/signup, /verify-email)
- [ ] Frontend compiles cleanly
- [ ] Full signup → verify → login → dashboard flow works end-to-end
