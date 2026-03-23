# Auth Overhaul + GA4/GSC Removal Plan

**Date:** February 21, 2026
**Ticket:** no-ticket
**Tier:** Migration (Level 4 — Major Impact)

---

## Problem Statement

The application currently requires Google OAuth as the sole login method for regular users. All session identity flows through `google_account_id` — every API request sends `x-google-account-id` as the primary authentication header, and the entire backend resolves user/organization context from this.

This needs to change to:

1. **Email/password signup** with email verification (code-based), completely replacing Google OAuth as login
2. **Remove GA4 and GSC integrations entirely** — routes, controllers, contexts, hooks, dashboard sections, settings, agents
3. **Retain GBP only** as a Google integration, connected optionally during onboarding or later via settings
4. **Shift session identity** from `google_account_id` to `user_id` (JWT-based), with `organization_id` as the primary data scoping key
5. **Restructure data model** — profile fields move from `google_accounts` to `users`/`organizations`, table renamed to `google_connections`

---

## Context Summary

### Current Auth Architecture

- **Regular users**: Google OAuth only. No email/password path exists.
- **Super admins**: OTP-based email login (separate system, JWT-issued).
- **Session identity**: `x-google-account-id` header on every request. `tokenRefreshMiddleware` reads it, attaches `req.googleAccountId` and `req.oauth2Client`.
- **RBAC resolution**: `rbacMiddleware` chains from `googleAccountId` → `google_accounts.user_id` → `organization_users.role`.
- **Frontend**: `localStorage.google_account_id` is the auth gate. `ProtectedRoute` checks for its presence. `getCommonHeaders()` injects it into every API call.

### Current Data Model

```
users
├── id, email, name, password_hash (nullable), created_at, updated_at

google_accounts  (THE ANCHOR ENTITY — stores everything)
├── id, user_id (FK), google_user_id, email
├── refresh_token, access_token, token_type, expiry_date, scopes
├── first_name, last_name, phone              ← profile (should be on users)
├── practice_name, domain_name, operational_jurisdiction  ← org data (should be on organizations)
├── organization_id (FK, nullable)
├── onboarding_completed, onboarding_wizard_completed     ← org state
├── google_property_ids (JSONB), setup_progress (JSONB)
├── created_at, updated_at

organizations
├── id, name, domain, subscription_tier, subscription_status, ...

organization_users
├── user_id, organization_id, role
```

### Current Onboarding Flow

1. Accept Google API Terms → Google OAuth popup → tokens saved → `google_account_id` stored
2. 3-step wizard: User Info → Practice Info (optional GBP) → Domain Info
3. Completion creates Organization, links GoogleAccount, sets `onboarding_completed = true`

### GA4/GSC Status

- `Step1_GA4Selection.tsx` and `Step2_GSCSelection.tsx` exist as dead components (not wired into active flow)
- GA4/GSC connection happens post-onboarding in Settings
- OAuth requests all 6 scopes upfront (including analytics.readonly and webmasters.readonly)
- Dashboard `VitalSignsCards` has Awareness (GSC) and Research (GA4) stages
- Backend has full route/controller/service trees for both
- `dataAggregator.ts` and agent orchestrator fetch GA4/GSC data for AI agents

---

## Existing Patterns to Follow

1. **OTP system** (`AuthOtpController`) — already handles email-based login with JWT issuance. The email/password system should follow the same JWT generation pattern and response structure.
2. **Migration pattern** — Knex migrations in `src/database/migrations/` with timestamps. Naming: `YYYYMMDDHHMMSS_description.ts`.
3. **Model pattern** — `BaseModel` abstraction with static methods, `jsonFields` array for auto-parsing.
4. **Middleware composition** — Routes compose middleware: `router.get("/path", middleware1, middleware2, controller.handler)`.
5. **Frontend API helpers** — `apiGet`, `apiPost` etc. in `src/api/index.ts` with `getCommonHeaders()`.
6. **Context/Hook pattern** — React contexts with corresponding `useX` hooks.

---

## Proposed Approach

### Phase 1: Database Schema Migration

**New migration: Add columns to `users` table**
- `first_name` (string, nullable)
- `last_name` (string, nullable)
- `phone` (string, nullable)
- `email_verified` (boolean, default false)
- `email_verification_code` (string, nullable)
- `email_verification_expires_at` (timestamp, nullable)

**New migration: Add columns to `organizations` table**
- `operational_jurisdiction` (string, nullable)
- `onboarding_completed` (boolean, default false)
- `onboarding_wizard_completed` (boolean, default false)
- `setup_progress` (JSONB, default `{"step1_api_connected": false, "step2_pms_uploaded": false, "dismissed": false, "completed": false}`)

**Data migration: Copy existing data**
- `google_accounts.first_name/last_name/phone` → `users` (matched by `google_accounts.user_id`)
- `google_accounts.practice_name` → `organizations.name` (matched by `google_accounts.organization_id`)
- `google_accounts.domain_name` → `organizations.domain`
- `google_accounts.operational_jurisdiction` → `organizations.operational_jurisdiction`
- `google_accounts.onboarding_completed` → `organizations.onboarding_completed`
- `google_accounts.onboarding_wizard_completed` → `organizations.onboarding_wizard_completed`
- `google_accounts.setup_progress` → `organizations.setup_progress`

**New migration: Rename `google_accounts` → `google_connections`**
- Drop columns that moved: `first_name`, `last_name`, `phone`, `practice_name`, `domain_name`, `operational_jurisdiction`, `onboarding_completed`, `onboarding_wizard_completed`, `setup_progress`
- Drop `user_id` FK (connections now belong to organizations only)
- Keep: `id`, `organization_id` (NOT NULL after migration), `google_user_id`, `email`, `refresh_token`, `access_token`, `token_type`, `expiry_date`, `scopes`, `google_property_ids`, `created_at`, `updated_at`

**Update all foreign key references:**
- `google_properties.google_account_id` → rename column to `google_connection_id`
- `practice_rankings.google_account_id` → migrate to `organization_id`
- `agent_results.google_account_id` → migrate to `organization_id`
- `tasks.google_account_id` → migrate to `organization_id`

### Phase 2: Backend Auth Transformation

**New: Password-based registration endpoint**
```
POST /api/auth/register
Body: { email, password, confirmPassword }
Response: { success, message: "Verification code sent" }
```
- Validate email format and password strength
- Hash password with bcrypt
- Generate 6-digit verification code (10-minute expiry)
- Store in users table (email_verified = false)
- Send verification email

**New: Email verification endpoint**
```
POST /api/auth/verify-email
Body: { email, code }
Response: { success, token (JWT), user }
```
- Verify code matches and hasn't expired
- Set `email_verified = true`
- Generate JWT token (same pattern as OTP flow)
- Return JWT + user data

**New: Password login endpoint**
```
POST /api/auth/login
Body: { email, password }
Response: { success, token (JWT), user }
```
- Find user by email
- Compare password_hash with bcrypt
- Require email_verified = true
- Generate JWT token
- Return JWT + user data

**Refactor: `authenticateToken` middleware becomes primary auth**
- Expand from admin-only to all user-facing routes
- Reads `Authorization: Bearer <JWT>` header
- Attaches `req.user = { userId, email }` to request
- Returns 401 if missing/invalid

**Refactor: `rbacMiddleware`**
- Current: `req.googleAccountId` → lookup google_account → user_id → organization_users
- New: `req.user.userId` → directly query `organization_users` → get role + organizationId
- Attach `req.userRole`, `req.userId`, `req.organizationId`

**Refactor: `tokenRefreshMiddleware`**
- No longer the primary auth mechanism
- Becomes an **optional** middleware for routes that need Google API access (GBP endpoints)
- Resolves Google connection from `organization_id` (from rbac) instead of header
- Only used on: `/api/gbp/*`, `/api/onboarding/available-gbp`, `/api/onboarding/save-gbp`, `/api/onboarding/gbp-website`, `/api/settings/properties/*`

**Remove: `x-google-account-id` header dependency**
- Frontend stops sending it
- Backend stops reading it from headers
- All routes switch to JWT-based auth
- Google connection looked up via `organization_id` when needed

**Update: All controllers**
- Replace `req.googleAccountId` with `req.organizationId` (from rbac middleware)
- Controllers that need Google API access: look up `google_connections` by `organization_id`
- Controllers that need user context: use `req.user.userId`

### Phase 3: Frontend Auth Transformation

**New: Signup page**
- Email + Password + Confirm Password form
- On submit: `POST /api/auth/register`
- Redirect to email verification screen

**New: Email verification screen**
- 6-digit code input
- On submit: `POST /api/auth/verify-email`
- On success: store JWT in localStorage, redirect to onboarding

**Refactor: Signin page**
- Replace Google OAuth button with email/password form
- On submit: `POST /api/auth/login`
- On success: store JWT in localStorage, redirect to dashboard

**Refactor: `getCommonHeaders()` in `src/api/index.ts`**
- Remove `x-google-account-id` header injection
- Keep `Authorization: Bearer <JWT>` header (already present)

**Refactor: `ProtectedRoute`**
- Check for JWT token presence instead of `google_account_id`

**Refactor: `AuthContext`**
- Load user profile from JWT-validated endpoint
- Remove google_account_id dependency

**Remove: `useGoogleAuth` hook** (Google OAuth login flow)
- No longer used for login
- GBP connection uses a different OAuth flow (settings-only)

**Update: localStorage keys**
- Remove: `google_account_id`
- Keep: `auth_token` (JWT)
- Keep: `user_role`

### Phase 4: Onboarding Redesign

**New flow:**
1. User signs up (email/password) → email verification → JWT issued
2. Onboarding wizard (3 steps, same as current):
   - Step 0: User Info (first name, last name, phone)
   - Step 1: Practice Info (name, address, optional GBP connection)
   - Step 2: Domain Info (domain name, validation)
3. On completion:
   - Create Organization (name, domain, operational_jurisdiction)
   - Create OrganizationUser (user_id, org_id, role=admin)
   - If GBP connected: create GoogleConnection (organization_id, tokens, property_ids)
   - Set `organizations.onboarding_completed = true`
   - Update `users` with first_name, last_name, phone

**GBP connection during onboarding:**
- Optional step in Practice Info (same UX as current)
- Triggers Google OAuth popup — but this is for GBP connection, NOT login
- Scopes: `openid`, `email`, `profile`, `business.manage` (4 scopes, no GA4/GSC)
- On success: store tokens in `google_connections` table linked to the new organization

**Backend changes:**
- `ProfileCompletionService`: Save to `users` and `organizations` tables instead of `google_accounts`
- `GbpOnboardingService`: Create `google_connections` record linked to organization
- Onboarding status: Check `organizations.onboarding_completed` instead of `google_accounts.onboarding_completed`

### Phase 5: GA4/GSC Complete Removal

**Backend — DELETE entirely (23 files):**
- `src/routes/ga4.ts`
- `src/routes/gsc.ts`
- `src/controllers/ga4/` (entire directory — Ga4Controller + 7 service/util files)
- `src/controllers/gsc/` (entire directory — GscController + 8 service/util files)

**Backend — MODIFY:**
- `src/index.ts`: Remove ga4Routes and gscRoutes imports and registrations
- `src/utils/dataAggregation/dataAggregator.ts`: Remove `fetchGA4DataForRange()`, `fetchGSCDataForRange()`, GA4/GSC imports
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts`: Remove GA4/GSC data fields from agent payloads
- `src/controllers/agents/feature-services/service.agent-input-builder.ts`: Remove GA4/GSC payload sections
- `src/controllers/settings/SettingsController.ts`: Remove GA4/GSC property management
- `src/controllers/settings/feature-services/service.google-properties.ts`: Remove GA4/GSC property listing
- `src/controllers/settings/feature-utils/util.property-parser.ts`: Remove GA4/GSC parsing
- `src/controllers/settings/feature-utils/util.scope-parser.ts`: Remove GA4/GSC scopes
- `src/controllers/auth/feature-services/ScopeManagementService.ts`: Remove GA4/GSC scopes
- `src/controllers/googleauth/utils/scopeDefinitions.ts`: Remove GA4/GSC scope definitions
- `src/controllers/admin-organizations/feature-utils/propertyIdsParser.ts`: Remove GA4/GSC parsing
- `src/controllers/admin-organizations/feature-services/ConnectionDetectionService.ts`: Remove GA4/GSC detection
- Practice ranking files that reference GA4/GSC (service.ranking-pipeline.ts, service.ranking-computation.ts, service.ranking-algorithm.ts)

**Frontend — DELETE entirely (12 files):**
- `src/api/ga4.ts`
- `src/api/gsc.ts`
- `src/hooks/useGA4.ts`
- `src/hooks/useGSC.ts`
- `src/contexts/GA4Context.tsx` (and `.ts` type file if separate)
- `src/contexts/GSCContext.tsx` (and `.ts` type file if separate)
- `src/components/GA4IntegrationModal.tsx`
- `src/components/GSCIntegrationModal.tsx`
- `src/components/onboarding/Step1_GA4Selection.tsx`
- `src/components/onboarding/Step2_GSCSelection.tsx`

**Frontend — MODIFY:**
- `src/App.tsx`: Remove GA4Provider, GSCProvider from AppProviders
- `src/pages/Dashboard.tsx`: Remove GA4/GSC modal handlers and JSX
- `src/pages/Settings.tsx`: Remove GA4/GSC integration cards, connection handlers, state, modals
- `src/components/VitalSignsCards/VitalSignsCards.tsx`: Remove GA4/GSC stages, hooks, data fetching
- `src/components/VitalSignsCards/Awareness.tsx`: Remove GSC dependency (component may become empty — decide: delete or repurpose)
- `src/components/VitalSignsCards/Research.tsx`: Remove GA4 dependency (same decision)
- `src/types/onboarding.ts`: Remove GA4/GSC type definitions
- `src/components/settings/PropertiesTab.tsx`: Remove GA4/GSC sections (GBP only remains)
- `src/components/settings/MissingScopeBanner.tsx`: Remove GA4/GSC scope checks

### Phase 6: Settings Page — GBP Only

- Properties tab shows GBP connection only
- "Connect Google Account" flow triggers OAuth for GBP scope only
- Google connection created/updated in `google_connections` table linked to organization
- Multiple users in the org see the same GBP connection
- Only admins can connect/disconnect

### Phase 7: Agent Infrastructure Update

- `agent_results` table: Add `organization_id` column, migrate data from `google_account_id`, eventually drop `google_account_id`
- `tasks` table: Same migration pattern
- Agent orchestrator: Look up Google connection via `organization_id` instead of `google_account_id`
- Agent payloads: Replace `googleAccountId` with `organizationId`
- API endpoints: Change route params from `:googleAccountId` to `:organizationId`
- Frontend agent API calls: Use organization ID

---

## Architectural Decisions

### 1. JWT as primary session identity (not google_account_id)
**Rationale:** With email/password auth, users exist before any Google connection. JWT provides user identity independent of Google.
**Tradeoff:** Every route middleware chain changes. But the existing OTP system already issues JWTs, so infrastructure exists.

### 2. Organization as the data scoping boundary (not google_account_id)
**Rationale:** Multiple users share an org. Google connection belongs to org, not user. Data (tasks, rankings, agent results) belongs to org.
**Tradeoff:** Historical data in `agent_results`, `tasks`, `practice_rankings` all keyed by `google_account_id` must be migrated.

### 3. Rename table to `google_connections` (not `google_properties`)
**Rationale:** `google_properties` table already exists (though unused). The table stores OAuth connection metadata — "connections" is semantically accurate. Avoids naming collision.
**Note:** You mentioned renaming to `google_properties` — but that name conflicts with the existing `google_properties` model. Recommend `google_connections` instead. If you want `google_properties`, we'd need to drop/rename the existing `google_properties` table first. Clarify preference.

### 4. Scopes reduced to 4 (openid, email, profile, business.manage)
**Rationale:** GA4/GSC removed. Only GBP needs Google API access. `openid`/`email`/`profile` are standard for identifying the Google account being connected.

### 5. GBP OAuth is connection-only, not login
**Rationale:** Users log in with email/password. Google OAuth popup only appears when connecting GBP. This decouples identity from integration.

---

## Risk Analysis

### Escalation: Level 4 — Major Impact

**Cross-cutting change affecting:**
- Authentication middleware (every protected route)
- Session identity (every frontend API call)
- Database schema (6+ tables)
- Data migration (historical agent results, tasks, rankings)
- Onboarding flow (complete redesign)
- Dashboard (removing 2 data sources)
- Settings (removing 2 integration types)
- Agent infrastructure (payload format change)

### Specific Risks

1. **Data migration risk** — Existing `google_accounts` data must be cleanly split across 3 tables. Any missed FK reference breaks queries. Mitigation: Run migration in transaction, validate row counts before/after.

2. **Session continuity** — Existing users have `google_account_id` in localStorage. After deployment, these sessions break. Mitigation: Frontend checks for old storage keys and forces re-login.

3. **Agent webhook contracts** — If external webhooks (n8n, etc.) expect `googleAccountId` in payloads, they break. Mitigation: Audit all webhook consumers, update in coordinated deployment.

4. **Backward compatibility of agent_results** — Historical data keyed by `google_account_id`. Mitigation: Migration adds `organization_id` column and backfills from `google_accounts.organization_id` before dropping the old column.

5. **Google token refresh** — Currently happens on every request via `tokenRefreshMiddleware`. After change, only happens on GBP-related requests. If a scheduled agent job needs Google tokens, it must look up the connection via `organization_id`. Mitigation: Agent orchestrator refactored to resolve connection from org.

---

## Failure Mode Analysis

1. **User has no organization yet** — After signup + email verification, user has no org. Onboarding creates it. Middleware must handle `organizationId = null` gracefully for onboarding routes.

2. **Organization has no Google connection** — GBP is optional. GBP-related endpoints must return clear "not connected" response, not crash.

3. **Multiple Google connections per org** — Current design is 1:1 (one google_account per user per org). New design: one connection per org. What if admin disconnects and reconnects with a different Google account? Old tokens must be replaced, not duplicated.

4. **Concurrent onboarding** — Two people invited to same org both try to onboard. Only the first should create the org. Second should join existing. Handle with unique constraint or lock.

5. **Email verification code expiry** — User takes too long. Must be able to request a new code.

---

## Security Considerations

- **Password hashing**: bcrypt with salt rounds >= 12
- **Email verification**: Required before any access. JWT not issued until verified.
- **Brute force protection**: Rate limit on login and verification endpoints
- **JWT secret**: Must be strong, stored in env var (already exists as `JWT_SECRET`)
- **Google tokens**: Remain server-side only. Frontend never sees access/refresh tokens.
- **RBAC enforcement**: Organization-scoped. Users cannot access data outside their org.
- **Session invalidation**: Consider adding JWT blacklist or short expiry + refresh token for password-based auth

---

## Performance Considerations

- Removing GA4/GSC reduces API call volume to Google (fewer token refreshes)
- `tokenRefreshMiddleware` no longer runs on every route — only GBP routes — reducing middleware overhead
- Agent runs have less data to aggregate (faster)
- Dashboard loads faster (fewer parallel data fetches)

---

## Observability & Monitoring Impact

- Existing logging tagged `[GA4 API]` and `[GSC API]` will no longer emit — update monitoring dashboards
- Auth logging must be added for new email/password flow: registration, verification, login failures
- Agent orchestrator logs must update from `googleAccountId` to `organizationId`
- Token refresh logs now only for GBP — reduced volume

---

## Test Strategy

1. **Unit tests**: New auth endpoints (register, verify, login), password hashing, JWT generation
2. **Integration tests**: Full signup → verify → onboard → connect GBP → view dashboard flow
3. **Migration tests**: Run migration on staging DB copy, verify data integrity
4. **Regression tests**: Existing GBP flow still works after migration
5. **Auth boundary tests**: User A cannot access Org B's data
6. **Edge cases**: Expired verification code, wrong password, duplicate email, missing org

---

## Blast Radius Analysis

| Area | Impact | Files Affected |
|------|--------|---------------|
| Auth middleware | Complete rewrite | 4 middleware files |
| Backend routes | Header change on all routes | ~15 route files |
| Backend controllers | `req.googleAccountId` → `req.organizationId` | ~12 controller files |
| Backend models | Schema changes | 6+ model files |
| Database | 4+ migrations, data migration | 6 tables |
| Frontend API layer | Header injection change | 1 file (api/index.ts) + all API modules |
| Frontend auth | New signup/login/verify pages | 3 new pages + auth context |
| Frontend onboarding | Flow redesign | 5+ component files |
| Frontend dashboard | Remove GA4/GSC sections | 4+ component files |
| Frontend settings | Remove GA4/GSC tabs | 3+ component files |
| GA4 backend | Delete entirely | 12 files |
| GSC backend | Delete entirely | 11 files |
| GA4 frontend | Delete entirely | 6 files |
| GSC frontend | Delete entirely | 6 files |
| Agent infrastructure | Payload + storage refactor | 5+ files |
| **Total estimated** | | **90+ files** |

---

## Definition of Done

1. Users can register with email + password
2. Email verification via 6-digit code works
3. Users can log in with email + password
4. Google OAuth is no longer a login method
5. Onboarding wizard collects user/practice info and optionally connects GBP
6. Organization is created at onboarding completion
7. GBP connection stored in `google_connections` table linked to organization
8. All API routes use JWT auth with `x-user-id` / `organizationId` (no more `x-google-account-id`)
9. GA4 routes, controllers, services, contexts, hooks, components — fully deleted
10. GSC routes, controllers, services, contexts, hooks, components — fully deleted
11. Dashboard renders without GA4/GSC (GBP + PMS data remain)
12. Settings shows GBP connection only
13. Agent infrastructure references `organization_id` instead of `google_account_id`
14. Data migration preserves all existing data
15. Existing users can log in after migration (they'll need to set a password — password reset flow)

---

## Open Question

**Table naming**: You said rename `google_accounts` to `google_properties`. However, a `google_properties` table/model already exists in the codebase (`GooglePropertyModel.ts`). Options:

1. Rename to `google_connections` (recommended — avoids collision, semantically accurate)
2. Drop the existing `google_properties` table first (it's unused), then rename `google_accounts` to `google_properties`
3. Different name entirely

**Needs your decision before execution.**
