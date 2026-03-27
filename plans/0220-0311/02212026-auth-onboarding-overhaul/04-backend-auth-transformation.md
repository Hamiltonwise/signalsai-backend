# Plan 04 — Backend Auth Transformation

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 03 (schema migration complete, models updated)
**Estimated files:** ~25 backend files

---

## Entry Conditions

- Plan 03 complete (google_connections table exists, models updated)
- `users` table has `password_hash`, `email_verified`, `email_verification_code`, `email_verification_expires_at` columns
- `organizations` table has `onboarding_completed`, `setup_progress` columns
- All models updated with new interfaces
- Backend compiles cleanly

---

## Problem Statement

Replace the Google OAuth login system with email/password registration + email verification. Refactor the middleware chain from `x-google-account-id`-based identity to JWT-based identity. Update all controllers from `req.googleAccountId` to `req.organizationId`.

---

## Step 1: Create password auth endpoints

**New file:** `signalsai-backend/src/routes/auth-password.ts`

**Endpoints:**

```
POST /api/auth/register
  Body: { email, password, confirmPassword }
  - Validate email format
  - Validate password strength (min 8 chars, require 1 uppercase, 1 number)
  - Check email not already registered
  - Hash password with bcrypt (salt rounds = 12)
  - Create user record (email_verified = false)
  - Generate 6-digit verification code (10-minute expiry)
  - Store code in users table
  - Send verification email (reuse existing email service from OTP system)
  - Return: { success: true, message: "Verification code sent" }

POST /api/auth/verify-email
  Body: { email, code }
  - Find user by email
  - Check code matches and hasn't expired
  - Set email_verified = true, clear verification code
  - Generate JWT (same pattern as OTP: { userId, email, expiresIn: "7d" })
  - Return: { success: true, token, user: { id, email, name } }

POST /api/auth/login
  Body: { email, password }
  - Find user by email
  - If not found: 401
  - If email_verified = false: 403 "Please verify your email first"
  - Compare password with bcrypt
  - If wrong: 401
  - Look up organization via organization_users
  - Generate JWT
  - Return: { success: true, token, user: { id, email, name, organizationId, role } }

POST /api/auth/resend-verification
  Body: { email }
  - Find user by email
  - If already verified: 400
  - Generate new 6-digit code (10-minute expiry)
  - Update users table
  - Send email
  - Return: { success: true, message: "New code sent" }
```

**New controller file:** `signalsai-backend/src/controllers/auth-password/AuthPasswordController.ts`

Follow patterns from existing `AuthOtpController.ts`:
- Same JWT generation (reuse `generateToken()` from OTP)
- Same email sending pattern (reuse `createAndSendOtp()` infrastructure)
- Same response format

**Register route in index.ts:**
```typescript
import authPasswordRoutes from "./routes/auth-password";
app.use("/api/auth", authPasswordRoutes);
```

---

## Step 2: Refactor `authenticateToken` middleware

**File:** `signalsai-backend/src/middleware/auth.ts`

**Current behavior:** Only used for admin routes. Validates JWT, attaches `req.user = { userId, email }`.

**Change:** No functional change needed — already does what we need. But verify:
- Reads `Authorization: Bearer <token>` header
- Validates with `JWT_SECRET`
- Attaches `req.user.userId` and `req.user.email`
- Returns 401 on failure

This middleware becomes the **primary auth mechanism** for all routes.

---

## Step 3: Refactor `rbacMiddleware`

**File:** `signalsai-backend/src/middleware/rbac.ts`

**Current flow:**
```
req.googleAccountId → GoogleAccountModel.findById() → get user_id → OrganizationUserModel.findByUserAndOrg()
```

**New flow:**
```
req.user.userId (from authenticateToken) → OrganizationUserModel.findByUserId() → get organizationId + role
```

**Changes:**
- Remove dependency on `req.googleAccountId`
- Read `req.user.userId` instead (requires `authenticateToken` to run first)
- Query `organization_users` directly by `user_id`
- Attach: `req.userRole`, `req.userId`, `req.organizationId`
- Handle case where user has no organization (onboarding not complete): set `req.organizationId = null`

---

## Step 4: Refactor `tokenRefreshMiddleware`

**File:** `signalsai-backend/src/middleware/tokenRefresh.ts`

**Current behavior:** Required middleware. Reads `x-google-account-id` header, refreshes OAuth token, attaches `req.oauth2Client` and `req.googleAccountId`.

**New behavior:** Optional middleware. Only for routes that need Google API access.

**New flow:**
```
req.organizationId (from rbacMiddleware) → GoogleConnectionModel.findByOrganization(orgId) → refresh token → attach req.oauth2Client
```

**Changes:**
- Remove `x-google-account-id` header reading
- Read `req.organizationId` from rbac middleware instead
- Look up `google_connections` by `organization_id`
- If no connection found: return clear error "No Google account connected"
- If connection found: refresh token if needed, attach `req.oauth2Client`
- Remove `req.googleAccountId` attachment — replace with `req.googleConnectionId` if needed

---

## Step 5: Update `superAdminMiddleware`

**File:** `signalsai-backend/src/middleware/superAdmin.ts`

**Current:** Falls back to `req.googleAccountId` → looks up email.

**New:** Only reads from `req.user.email` (from JWT via authenticateToken). Remove the google_account fallback path entirely.

---

## Step 6: Update route middleware composition

All routes must switch from:
```typescript
router.get("/path", tokenRefreshMiddleware, rbacMiddleware, controller.handler);
```

To:
```typescript
router.get("/path", authenticateToken, rbacMiddleware, controller.handler);
```

And for GBP-related routes:
```typescript
router.get("/gbp-path", authenticateToken, rbacMiddleware, tokenRefreshMiddleware, controller.handler);
```

**Files to update:**
- `src/routes/profile.ts`
- `src/routes/settings.ts`
- `src/routes/gbp.ts`
- `src/routes/onboarding.ts`
- `src/routes/agentsV2.ts`
- `src/routes/tasks.ts`
- `src/routes/notifications.ts`
- `src/routes/practiceRanking.ts`
- `src/routes/clarity.ts`
- Any other route files using `tokenRefreshMiddleware` as auth

---

## Step 7: Update all controllers

Every controller that uses `req.googleAccountId` must switch to `req.organizationId` and/or `req.user.userId`.

**Pattern:**
```typescript
// BEFORE
const googleAccountId = req.googleAccountId;
const data = await SomeModel.findByGoogleAccountId(googleAccountId);

// AFTER
const organizationId = req.organizationId;
const data = await SomeModel.findByOrganizationId(organizationId);
```

**Controllers to update:**
- `src/controllers/settings/SettingsController.ts` — 8+ references
- `src/controllers/profile/profile.controller.ts` — 2 references
- `src/controllers/onboarding/OnboardingController.ts` — multiple references
- `src/controllers/onboarding/feature-services/ProfileCompletionService.ts`
- `src/controllers/onboarding/feature-services/GbpOnboardingService.ts`
- `src/controllers/onboarding/feature-services/SetupProgressService.ts`
- `src/controllers/onboarding/feature-services/WizardStatusService.ts`
- `src/controllers/onboarding/feature-utils/onboardingHelpers.ts` — the `extractGoogleAccountId()` function must be replaced with `extractOrganizationId()` or removed
- `src/controllers/tasks/TasksController.ts`
- `src/controllers/notifications/NotificationsController.ts`
- `src/controllers/agents/AgentsController.ts`
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
- `src/controllers/agents/feature-services/service.task-creator.ts`
- `src/controllers/gbp/GbpController.ts`
- `src/controllers/practice-ranking/PracticeRankingController.ts`

---

## Step 8: Update `oauth2Helper.ts`

**File:** `signalsai-backend/src/auth/oauth2Helper.ts`

**Current:** `getValidOAuth2Client(googleAccountId)` — looks up by `google_accounts.id`

**New:** `getValidOAuth2Client(googleConnectionId)` — looks up by `google_connections.id`

OR better: `getValidOAuth2ClientByOrg(organizationId)` — looks up by `google_connections.organization_id`

Update the function signature and internal query.

---

## Step 9: Remove Google OAuth login routes

**Files to evaluate:**
- `src/routes/auth.ts` — Remove: `GET /auth/google` (auth URL generation), `GET /auth/callback` (OAuth callback), `GET /auth/google/callback`
- Keep: Any routes needed for GBP connection OAuth (separate flow)
- `src/controllers/auth/AuthController.ts` — Remove login-specific OAuth handlers
- `src/controllers/auth/feature-services/OAuthFlowService.ts` — Refactor: no longer creates user sessions, only creates google_connections

**The Google OAuth flow must still exist** but only for "Connect GBP" (not login). This means:
- OAuth URL generation stays (but scopes reduced to 4)
- Callback handler stays (but instead of establishing a session, it creates/updates a `google_connections` record linked to the user's organization)
- The callback no longer returns `googleAccountId` to the frontend for session use

---

## Step 10: Update CORS configuration

**File:** `signalsai-backend/src/index.ts`

**Remove:** `"googleaccountid"` from allowed headers in CORS config.

**Keep:** Standard CORS headers for Authorization.

---

## Step 11: Remove `x-google-account-id` from API documentation

**Files:**
- `src/routes/documentation.ts`
- `src/controllers/documentation/documentation-utils/apiDocumentation.ts`

Remove references to the old header.

---

## Verification

1. Backend compiles cleanly
2. New auth endpoints work: register → verify → login
3. JWT tokens issued correctly
4. `authenticateToken` + `rbacMiddleware` chain works on existing routes
5. GBP routes still work with `tokenRefreshMiddleware` (now org-based)
6. No remaining references to `x-google-account-id` in backend src (except comments)
7. No remaining references to `req.googleAccountId` in controllers

---

## Exit Conditions

- [ ] `POST /api/auth/register` works (creates user, sends verification code)
- [ ] `POST /api/auth/verify-email` works (verifies code, issues JWT)
- [ ] `POST /api/auth/login` works (validates password, issues JWT)
- [ ] `authenticateToken` is primary auth middleware on all routes
- [ ] `rbacMiddleware` resolves from `req.user.userId` (not googleAccountId)
- [ ] `tokenRefreshMiddleware` resolves from `req.organizationId` (not header)
- [ ] All controllers use `req.organizationId` and `req.user.userId`
- [ ] Google OAuth flow repurposed for GBP connection only (not login)
- [ ] `x-google-account-id` header removed from CORS and all reading logic
- [ ] Backend compiles cleanly
