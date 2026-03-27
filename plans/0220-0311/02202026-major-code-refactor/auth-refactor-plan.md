# Auth Route Refactor Plan

**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/auth.ts`
**Current LOC:** 1,100 lines
**Type:** Multi-tenant JWT/OAuth2 authentication system
**Risk Level:** CRITICAL - Core authentication flow

---

## 1. Current State Analysis

### Endpoints (7 total)

| Endpoint | Method | LOC Range | Purpose | Complexity |
|----------|--------|-----------|---------|------------|
| `/ttim` | GET | 406-408 | Test endpoint (DELETE) | Trivial |
| `/google` | GET | 410-444 | Generate OAuth consent URL | Low |
| `/callback` | GET | 853 | OAuth callback handler (shared) | High |
| `/google/callback` | GET | 878 | OAuth callback handler (shared) | High |
| `/google/validate/:googleAccountId` | GET | 889-915 | Token validation/refresh | Medium |
| `/google/scopes` | GET | 922-941 | Return scope metadata | Low |
| `/google/reconnect` | GET | 968-1058 | Incremental authorization | Medium |

### Inline Functions (9 total)

| Function | LOC | Current Location | Purpose | Dependencies |
|----------|-----|------------------|---------|--------------|
| `validateEnvironmentVariables()` | 165-174 | Lines 165-174 | Env var validation | None |
| `createOAuth2Client()` | 180-188 | Lines 180-188 | Create OAuth2 client | google.auth.OAuth2 |
| `generateSecureState()` | 194-199 | Lines 194-199 | CSRF state generation | Math.random |
| `handleError()` | 208-232 | Lines 208-232 | Error response formatter | None |
| `logRequest()` | 237-246 | Lines 237-246 | Request logging middleware | None |
| `findOrCreateUser()` | 258-291 | Lines 258-291 | User upsert logic | db("users") |
| `upsertGoogleAccount()` | 300-356 | Lines 300-356 | Google account upsert | db("google_accounts") |
| `refreshAccessToken()` | 363-384 | Lines 363-384 | Token refresh wrapper | getValidOAuth2Client |
| `handleOAuthCallback()` | 452-838 | Lines 452-838 | **CRITICAL** OAuth callback logic | All db tables + fetch |

### Database Operations (Direct `db()` calls)

| Location | Table | Operation | Should Use Model |
|----------|-------|-----------|------------------|
| 261-263 | `users` | SELECT by email | `UserModel.findByEmail()` |
| 278 | `users` | INSERT | `UserModel.create()` |
| 279 | `users` | SELECT by id | `UserModel.findById()` |
| 319-324 | `google_accounts` | SELECT by google_user_id + user_id | `GoogleAccountModel.findByGoogleUserId()` |
| 328-330 | `google_accounts` | UPDATE by id | `GoogleAccountModel.updateById()` |
| 336 | `google_accounts` | INSERT | `GoogleAccountModel.create()` |
| 341-343 | `google_accounts` | SELECT by id | `GoogleAccountModel.findById()` |
| 371-373 | `google_accounts` | SELECT by id | `GoogleAccountModel.findById()` |
| 578-580 | `users` | SELECT by email (in transaction) | `UserModel.findByEmail()` |
| 594 | `users` | INSERT (in transaction) | `UserModel.create()` |
| 613-618 | `google_accounts` | SELECT by google_user_id + user_id (in trx) | `GoogleAccountModel.findByGoogleUserId()` |
| 623-625 | `google_accounts` | UPDATE by id (in trx) | `GoogleAccountModel.updateById()` |
| 632-638 | `google_accounts` | INSERT (in trx) | `GoogleAccountModel.create()` |
| 645-650 | `organization_users` | SELECT by user_id + org_id | `OrganizationUserModel.findByUserAndOrg()` |
| 653-659 | `organization_users` | INSERT | `OrganizationUserModel.create()` |
| 682-684 | `users` | SELECT by email (fallback) | `UserModel.findByEmail()` |
| 693 | `users` | INSERT (fallback) | `UserModel.create()` |
| 697-702 | `google_accounts` | SELECT by google_user_id + user_id (fallback) | `GoogleAccountModel.findByGoogleUserId()` |
| 717-719 | `google_accounts` | UPDATE by id (fallback) | `GoogleAccountModel.updateById()` |
| 723-729 | `google_accounts` | INSERT (fallback) | `GoogleAccountModel.create()` |
| 743-747 | `organization_users` | SELECT by user_id + org_id | `OrganizationUserModel.findByUserAndOrg()` |

### Dependencies

**External:**
- `express` - Routing framework
- `googleapis` - Google API client
- `google-auth-library` - OAuth2 client
- `knex` - SQL query builder
- `dotenv` - Environment variable loader
- `jsonwebtoken` - JWT handling (unused in file but referenced in middleware)

**Internal:**
- `../database/connection` → `db` instance
- `../auth/oauth2Helper` → `getValidOAuth2Client()`
- `../middleware/auth` → `authenticateToken()` (referenced in comments, not used)

**Models Available (Not Used):**
- `UserModel` - Has `findByEmail()`, `create()`, `findOrCreate()`
- `GoogleAccountModel` - Has `findByGoogleUserId()`, `create()`, `updateById()`, `updateTokens()`
- `OrganizationUserModel` - Has `findByUserAndOrg()`, `create()`

### Constants

| Name | Purpose | LOC |
|------|---------|-----|
| `REQUIRED_SCOPES` | OAuth scope array | 135-142 |
| `REQUIRED_ENV_VARS` | Env validation list | 147-155 |
| `SCOPE_MAP` | Scope key mapping | 946-950 |

### Interfaces (10 total)

All TypeScript interfaces (lines 41-126) are defined in-file:
- `User`, `GoogleAccount`, `GoogleProperty`, `GoogleUserProfile`
- `AuthUrlResponse`, `CallbackResponse`, `ErrorResponse`

---

## 2. Target Architecture

### Folder Structure

```
src/
├── controllers/
│   └── auth/
│       ├── AuthController.ts                 (~300 LOC)
│       ├── feature-services/
│       │   ├── OAuthFlowService.ts          (~250 LOC)
│       │   ├── TokenManagementService.ts    (~120 LOC)
│       │   ├── AccountLinkingService.ts     (~150 LOC)
│       │   └── ScopeManagementService.ts    (~80 LOC)
│       └── feature-utils/
│           ├── oauth-client-factory.ts      (~50 LOC)
│           ├── security-utils.ts            (~60 LOC)
│           ├── validation-utils.ts          (~40 LOC)
│           └── response-formatters.ts       (~80 LOC)
├── types/
│   └── auth.types.ts                        (~100 LOC)
├── routes/
│   └── auth.ts                              (~80 LOC - route definitions only)
└── models/
    └── (existing models remain unchanged)
```

### File Responsibilities

#### **AuthController.ts** (~300 LOC)
- Public methods for each endpoint handler
- Orchestrates service calls
- Handles HTTP-level concerns (req/res)
- Delegates business logic to services
- No direct database access
- Methods:
  - `getGoogleAuthUrl(req, res)` - Generate OAuth URL
  - `handleOAuthCallback(req, res)` - Process callback (orchestrates)
  - `validateToken(req, res)` - Token validation
  - `getScopeInfo(req, res)` - Scope metadata
  - `getReconnectUrl(req, res)` - Incremental auth

#### **OAuthFlowService.ts** (~250 LOC)
- Core OAuth2 flow logic
- Token exchange with Google
- User profile fetching
- Transaction-based account creation
- Methods:
  - `exchangeCodeForTokens(code: string)` - Exchange auth code
  - `fetchGoogleUserProfile(accessToken: string)` - Fetch profile via Google API
  - `completeOAuthFlow(tokens, profile, trx?)` - Orchestrate user/account creation
  - `handleFallbackAuth(tokens, profile)` - Non-transactional fallback
- Uses: `UserModel`, `GoogleAccountModel`, `OrganizationUserModel`

#### **TokenManagementService.ts** (~120 LOC)
- Token refresh logic
- Token expiry validation
- Token storage/retrieval
- Methods:
  - `validateAndRefreshToken(googleAccountId: number)` - Validate + refresh wrapper
  - `checkTokenExpiry(expiryDate: Date)` - Expiry check logic
  - `refreshToken(googleAccountId: number)` - Delegates to oauth2Helper
- Uses: `GoogleAccountModel`, `oauth2Helper.getValidOAuth2Client()`

#### **AccountLinkingService.ts** (~150 LOC)
- User-to-organization linking
- Role assignment for OAuth users
- Multi-tenant account switching logic
- Methods:
  - `ensureOrganizationLink(userId, organizationId, trx?)` - Create org_user if missing
  - `getUserRole(userId, organizationId)` - Fetch role for response
  - `linkGoogleAccountToOrg(googleAccountId, organizationId, trx?)` - Link account
- Uses: `OrganizationUserModel`

#### **ScopeManagementService.ts** (~80 LOC)
- Scope validation
- Incremental authorization URL generation
- Scope description mapping
- Methods:
  - `validateScopes(scopeKeys: string[])` - Validate scope keys
  - `resolveScopeUrls(scopeKeys: string[])` - Map keys to URLs
  - `getScopeDescriptions()` - Return scope metadata
- Uses: Constants only

#### **oauth-client-factory.ts** (~50 LOC)
- OAuth2 client creation
- Environment validation
- Methods:
  - `validateEnvironmentVariables()` - Moved from route
  - `createOAuth2Client()` - Moved from route
- Uses: `google.auth.OAuth2`

#### **security-utils.ts** (~60 LOC)
- CSRF state generation
- Token sanitization for logging
- Methods:
  - `generateSecureState()` - Moved from route
  - `sanitizeTokenForLogging(token: string)` - Token preview generator
- Uses: None

#### **validation-utils.ts** (~40 LOC)
- Request parameter validation
- Error code validation
- Methods:
  - `validateCallbackParams(query)` - Validate code/state/error
  - `validateGoogleAccountId(id)` - ID validation

#### **response-formatters.ts** (~80 LOC)
- Standardized API responses
- Error response formatting
- HTML popup response generation
- Methods:
  - `handleError(res, error, operation)` - Moved from route
  - `formatCallbackResponse(user, googleAccount, tokens, role)` - Response builder
  - `generatePopupHtml(response)` - HTML generator for OAuth popup

#### **auth.types.ts** (~100 LOC)
- All TypeScript interfaces moved from route file
- Request/response types
- Domain types

#### **routes/auth.ts** (~80 LOC - stripped down)
- Route definitions only
- Middleware attachment
- Controller method binding
- No business logic
- No inline functions

---

## 3. Detailed Mapping (Handler → Controller/Service)

### Endpoint: `GET /google` (Generate Auth URL)

**Current:** Lines 410-444 (35 LOC)
**New Flow:**
```
Route → AuthController.getGoogleAuthUrl()
  → oauth-client-factory.validateEnvironmentVariables()
  → oauth-client-factory.createOAuth2Client()
  → security-utils.generateSecureState()
  → OAuth2Client.generateAuthUrl()
  → response-formatters.formatAuthUrlResponse()
```

**Files:**
- `AuthController.getGoogleAuthUrl()` - Main handler (~20 LOC)
- `oauth-client-factory.ts` - Client creation (~25 LOC)
- `security-utils.ts` - State generation (~10 LOC)
- `response-formatters.ts` - Response format (~15 LOC)

---

### Endpoint: `GET /callback` & `GET /google/callback` (OAuth Callback)

**Current:** `handleOAuthCallback()` lines 452-838 (386 LOC) - **MOST COMPLEX**
**New Flow:**
```
Route → AuthController.handleOAuthCallback()
  → validation-utils.validateCallbackParams()
  → oauth-client-factory.createOAuth2Client()
  → OAuthFlowService.exchangeCodeForTokens()
    → OAuth2Client.getToken()
  → OAuthFlowService.fetchGoogleUserProfile()
    → fetch() to Google API
  → OAuthFlowService.completeOAuthFlow() [WITH TRANSACTION]
    → UserModel.findByEmail() [via trx]
    → UserModel.create() [via trx if needed]
    → GoogleAccountModel.findByGoogleUserId() [via trx]
    → GoogleAccountModel.create() OR updateById() [via trx]
    → AccountLinkingService.ensureOrganizationLink() [via trx]
  → [FALLBACK IF TRANSACTION FAILS]
    → OAuthFlowService.handleFallbackAuth()
      → Same model calls without transaction
  → AccountLinkingService.getUserRole()
  → response-formatters.formatCallbackResponse()
  → response-formatters.generatePopupHtml()
```

**Files:**
- `AuthController.handleOAuthCallback()` - Orchestration (~40 LOC)
- `OAuthFlowService.ts`:
  - `exchangeCodeForTokens()` - ~25 LOC
  - `fetchGoogleUserProfile()` - ~35 LOC
  - `completeOAuthFlow()` - ~90 LOC (transaction logic)
  - `handleFallbackAuth()` - ~50 LOC (fallback logic)
- `AccountLinkingService.ts`:
  - `ensureOrganizationLink()` - ~30 LOC
  - `getUserRole()` - ~15 LOC
- `validation-utils.ts` - ~15 LOC
- `oauth-client-factory.ts` - ~15 LOC
- `response-formatters.ts`:
  - `formatCallbackResponse()` - ~20 LOC
  - `generatePopupHtml()` - ~60 LOC

---

### Endpoint: `GET /google/validate/:googleAccountId` (Token Validation)

**Current:** Lines 889-915 (27 LOC)
**New Flow:**
```
Route → AuthController.validateToken()
  → validation-utils.validateGoogleAccountId()
  → TokenManagementService.validateAndRefreshToken()
    → oauth2Helper.getValidOAuth2Client() (existing helper)
    → GoogleAccountModel.findById() (to fetch updated account)
  → response-formatters.formatValidationResponse()
```

**Files:**
- `AuthController.validateToken()` - Main handler (~12 LOC)
- `TokenManagementService.validateAndRefreshToken()` - Core logic (~25 LOC)
- `validation-utils.ts` - ID validation (~8 LOC)
- `response-formatters.ts` - Response format (~10 LOC)

---

### Endpoint: `GET /google/scopes` (Scope Metadata)

**Current:** Lines 922-941 (20 LOC)
**New Flow:**
```
Route → AuthController.getScopeInfo()
  → ScopeManagementService.getScopeDescriptions()
  → response-formatters.formatScopeResponse()
```

**Files:**
- `AuthController.getScopeInfo()` - Main handler (~8 LOC)
- `ScopeManagementService.getScopeDescriptions()` - Metadata (~20 LOC)
- `response-formatters.ts` - Response format (~10 LOC)

---

### Endpoint: `GET /google/reconnect` (Incremental Authorization)

**Current:** Lines 968-1058 (91 LOC)
**New Flow:**
```
Route → AuthController.getReconnectUrl()
  → validation-utils.validateReconnectParams()
  → ScopeManagementService.validateScopes()
  → ScopeManagementService.resolveScopeUrls()
  → oauth-client-factory.createOAuth2Client()
  → security-utils.generateSecureState()
  → OAuth2Client.generateAuthUrl()
  → response-formatters.formatReconnectResponse()
```

**Files:**
- `AuthController.getReconnectUrl()` - Main handler (~20 LOC)
- `ScopeManagementService.ts`:
  - `validateScopes()` - ~25 LOC
  - `resolveScopeUrls()` - ~20 LOC
- `validation-utils.ts` - Param validation (~12 LOC)
- `oauth-client-factory.ts` - Client creation (~15 LOC)
- `security-utils.ts` - State generation (~10 LOC)
- `response-formatters.ts` - Response format (~25 LOC)

---

### Standalone Functions (Not Endpoint-Specific)

| Function | Current LOC | New Location | New LOC |
|----------|-------------|--------------|---------|
| `validateEnvironmentVariables()` | 165-174 | `oauth-client-factory.ts` | ~10 LOC |
| `createOAuth2Client()` | 180-188 | `oauth-client-factory.ts` | ~15 LOC |
| `generateSecureState()` | 194-199 | `security-utils.ts` | ~8 LOC |
| `handleError()` | 208-232 | `response-formatters.ts` | ~25 LOC |
| `logRequest()` | 237-246 | ~~DELETE~~ (unused middleware) | N/A |
| `findOrCreateUser()` | 258-291 | ~~REPLACE~~ with `UserModel.findOrCreate()` | N/A |
| `upsertGoogleAccount()` | 300-356 | `OAuthFlowService.upsertGoogleAccount()` | ~40 LOC |
| `refreshAccessToken()` | 363-384 | `TokenManagementService.refreshToken()` | ~15 LOC |

---

## 4. Database Call Replacements (ALL instances)

### UserModel Replacements

| Current Code | Line(s) | Replace With | Service |
|--------------|---------|--------------|---------|
| `db("users").where({ email }).first()` | 261-263 | `UserModel.findByEmail(email, trx?)` | OAuthFlowService |
| `db("users").insert(userData)` | 278 | `UserModel.create({ email, name }, trx?)` | OAuthFlowService |
| `db("users").where({ id }).first()` | 279 | `UserModel.findById(id, trx?)` | OAuthFlowService |
| `trx("users").where({ email }).first()` | 578-580 | `UserModel.findByEmail(email, trx)` | OAuthFlowService |
| `trx("users").insert(userData).returning("*")` | 594 | `UserModel.create({ email, name }, trx)` | OAuthFlowService |
| `db("users").where({ email }).first()` (fallback) | 682-684 | `UserModel.findByEmail(email)` | OAuthFlowService |
| `db("users").insert(userData).returning("*")` (fallback) | 693 | `UserModel.create({ email, name })` | OAuthFlowService |

**Note:** `UserModel.findOrCreate()` already exists and should be preferred where applicable.

---

### GoogleAccountModel Replacements

| Current Code | Line(s) | Replace With | Service |
|--------------|---------|--------------|---------|
| `db("google_accounts").where({ google_user_id, user_id }).first()` | 319-324 | `GoogleAccountModel.findByGoogleUserId(googleUserId, userId, trx?)` | OAuthFlowService |
| `db("google_accounts").where({ id }).update(accountData)` | 328-330 | `GoogleAccountModel.updateById(id, accountData, trx?)` | OAuthFlowService |
| `db("google_accounts").insert(data)` | 336 | `GoogleAccountModel.create(data, trx?)` | OAuthFlowService |
| `db("google_accounts").where({ id }).first()` | 341-343 | `GoogleAccountModel.findById(id, trx?)` | TokenManagementService |
| `db("google_accounts").where({ id }).first()` | 371-373 | `GoogleAccountModel.findById(id)` | TokenManagementService |
| `trx("google_accounts").where({ google_user_id, user_id }).first()` | 613-618 | `GoogleAccountModel.findByGoogleUserId(googleUserId, userId, trx)` | OAuthFlowService |
| `trx("google_accounts").where({ id }).update(accountData)` | 623-625 | `GoogleAccountModel.updateById(id, accountData, trx)` | OAuthFlowService |
| `trx("google_accounts").insert(data).returning("*")` | 632-638 | `GoogleAccountModel.create(data, trx)` | OAuthFlowService |
| `db("google_accounts").where({ google_user_id, user_id }).first()` (fallback) | 697-702 | `GoogleAccountModel.findByGoogleUserId(googleUserId, userId)` | OAuthFlowService |
| `db("google_accounts").where({ id }).update(accountData)` (fallback) | 717-719 | `GoogleAccountModel.updateById(id, accountData)` | OAuthFlowService |
| `db("google_accounts").insert(data).returning("*")` (fallback) | 723-729 | `GoogleAccountModel.create(data)` | OAuthFlowService |

**New Method Needed:** `GoogleAccountModel.upsert()` - Combine findByGoogleUserId + create/update logic (~30 LOC)

---

### OrganizationUserModel Replacements

| Current Code | Line(s) | Replace With | Service |
|--------------|---------|--------------|---------|
| `trx("organization_users").where({ user_id, organization_id }).first()` | 645-650 | `OrganizationUserModel.findByUserAndOrg(userId, orgId, trx)` | AccountLinkingService |
| `trx("organization_users").insert(data)` | 653-659 | `OrganizationUserModel.create(data, trx)` | AccountLinkingService |
| `db("organization_users").where({ user_id, organization_id }).first()` | 743-747 | `OrganizationUserModel.findByUserAndOrg(userId, orgId)` | AccountLinkingService |

---

## 5. Step-by-Step Migration Plan

### Phase 1: Setup (Low Risk)

**Step 1.1:** Create folder structure
```bash
mkdir -p src/controllers/auth/feature-services
mkdir -p src/controllers/auth/feature-utils
```

**Step 1.2:** Create `src/types/auth.types.ts`
- Copy all interfaces from lines 41-126 to new file
- Export all types
- Verify no breaking changes
- **LOC:** ~100 lines moved

**Step 1.3:** Update route file imports
- Import types from `../../types/auth.types`
- Remove inline interface definitions
- **Test:** Compile TypeScript, run tests

**Estimated Time:** 30 minutes
**Risk:** Very Low

---

### Phase 2: Utility Extraction (Low Risk)

**Step 2.1:** Create `oauth-client-factory.ts`
- Move `validateEnvironmentVariables()` (lines 165-174)
- Move `createOAuth2Client()` (lines 180-188)
- Add imports: `google.auth.OAuth2`, `dotenv`
- Export both functions
- **LOC:** ~50 lines

**Step 2.2:** Create `security-utils.ts`
- Move `generateSecureState()` (lines 194-199)
- Add `sanitizeTokenForLogging(token: string)` - Extract from lines 507-515
- Export both functions
- **LOC:** ~60 lines

**Step 2.3:** Create `validation-utils.ts`
- Extract validation logic from callback (lines 454-483)
- Create `validateCallbackParams(query)`
- Create `validateGoogleAccountId(id)`
- Create `validateReconnectParams(query)`
- Export all functions
- **LOC:** ~40 lines

**Step 2.4:** Create `response-formatters.ts`
- Move `handleError()` (lines 208-232)
- Extract HTML popup (lines 770-830) → `generatePopupHtml(response)`
- Add response formatters:
  - `formatAuthUrlResponse()`
  - `formatCallbackResponse()`
  - `formatValidationResponse()`
  - `formatScopeResponse()`
  - `formatReconnectResponse()`
- **LOC:** ~80 lines

**Step 2.5:** Update route file
- Replace all utility function calls with imports
- Remove inline utility functions
- **Test:** Run all auth endpoints, verify responses

**Estimated Time:** 2 hours
**Risk:** Low (utilities are pure functions)

---

### Phase 3: Service Layer - Token Management (Medium Risk)

**Step 3.1:** Create `TokenManagementService.ts`
- Import: `GoogleAccountModel`, `oauth2Helper`
- Implement:
  - `validateAndRefreshToken(googleAccountId: number)` - Wraps oauth2Helper
  - `checkTokenExpiry(expiryDate: Date)` - Expiry check
  - `refreshToken(googleAccountId: number)` - Calls getValidOAuth2Client
- Replace `refreshAccessToken()` function (lines 363-384)
- **LOC:** ~120 lines

**Step 3.2:** Update `/google/validate/:googleAccountId` endpoint
- Use `TokenManagementService.validateAndRefreshToken()`
- Keep route handler thin (~12 LOC)
- **Test:** Call endpoint, verify token refresh

**Estimated Time:** 1.5 hours
**Risk:** Medium (token refresh is critical)

---

### Phase 4: Service Layer - Scope Management (Low Risk)

**Step 4.1:** Create `ScopeManagementService.ts`
- Import: `REQUIRED_SCOPES`, `SCOPE_MAP` constants
- Implement:
  - `validateScopes(scopeKeys: string[])` - Validate scope keys
  - `resolveScopeUrls(scopeKeys: string[])` - Map keys to URLs
  - `getScopeDescriptions()` - Return metadata
- **LOC:** ~80 lines

**Step 4.2:** Update `/google/scopes` endpoint
- Use `ScopeManagementService.getScopeDescriptions()`
- **Test:** Call endpoint, verify response

**Step 4.3:** Update `/google/reconnect` endpoint
- Use `ScopeManagementService.validateScopes()` and `resolveScopeUrls()`
- **Test:** Call endpoint with various scope parameters

**Estimated Time:** 1 hour
**Risk:** Low (read-only operations)

---

### Phase 5: Service Layer - Account Linking (Medium Risk)

**Step 5.1:** Create `AccountLinkingService.ts`
- Import: `OrganizationUserModel`
- Implement:
  - `ensureOrganizationLink(userId, organizationId, trx?)` - Create if missing
  - `getUserRole(userId, organizationId)` - Fetch role
  - `linkGoogleAccountToOrg(googleAccountId, organizationId, trx?)` - Link account
- Replace organization_users logic from lines 644-664 and 743-752
- **LOC:** ~150 lines

**Step 5.2:** Add unit tests
- Test organization linking in transaction
- Test role retrieval
- Test duplicate prevention

**Estimated Time:** 2 hours
**Risk:** Medium (multi-tenant logic)

---

### Phase 6: Service Layer - OAuth Flow (HIGH RISK)

**Step 6.1:** Create `OAuthFlowService.ts` (Part 1: Token Exchange)
- Import: `UserModel`, `GoogleAccountModel`, `AccountLinkingService`, `oauth-client-factory`, `security-utils`
- Implement:
  - `exchangeCodeForTokens(code: string)` - OAuth2 token exchange (lines 489-493)
  - `fetchGoogleUserProfile(accessToken: string)` - Fetch profile (lines 524-569)
- **LOC:** ~60 lines

**Step 6.2:** Test token exchange and profile fetching
- Unit tests with mocked Google API
- Integration test with test OAuth code (if available)

**Step 6.3:** Create `OAuthFlowService.ts` (Part 2: Transaction Flow)
- Implement:
  - `completeOAuthFlow(tokens, profile, trx?)` - Main transaction logic
    - UserModel.findOrCreate()
    - GoogleAccountModel.findByGoogleUserId()
    - GoogleAccountModel.create() OR updateById()
    - AccountLinkingService.ensureOrganizationLink()
- Replace transaction logic from lines 576-667
- **LOC:** ~100 lines

**Step 6.4:** Create `OAuthFlowService.ts` (Part 3: Fallback Flow)
- Implement:
  - `handleFallbackAuth(tokens, profile)` - Non-transactional fallback
- Replace fallback logic from lines 678-738
- **LOC:** ~60 lines

**Step 6.5:** Add comprehensive tests
- Test transaction rollback scenarios
- Test fallback activation
- Test duplicate user handling
- Test organization linking

**Estimated Time:** 4 hours
**Risk:** HIGH (critical auth flow, transaction handling)

---

### Phase 7: Controller Layer (Medium Risk)

**Step 7.1:** Create `AuthController.ts` skeleton
- Import all services
- Create class with placeholder methods for all endpoints
- **LOC:** ~50 lines

**Step 7.2:** Implement simple endpoints
- `getGoogleAuthUrl(req, res)` - Generate OAuth URL
- `getScopeInfo(req, res)` - Scope metadata
- `getReconnectUrl(req, res)` - Incremental auth
- **LOC:** ~80 lines

**Step 7.3:** Implement complex endpoints
- `validateToken(req, res)` - Token validation
- `handleOAuthCallback(req, res)` - **MOST COMPLEX** - Orchestrate OAuthFlowService
  - Call validation-utils
  - Call OAuthFlowService.exchangeCodeForTokens()
  - Call OAuthFlowService.fetchGoogleUserProfile()
  - Call OAuthFlowService.completeOAuthFlow() with try/catch
  - Call OAuthFlowService.handleFallbackAuth() on failure
  - Call AccountLinkingService.getUserRole()
  - Call response-formatters.generatePopupHtml()
- **LOC:** ~170 lines

**Step 7.4:** Add error handling
- Wrap all methods in try/catch
- Use response-formatters.handleError()
- Log appropriately

**Estimated Time:** 3 hours
**Risk:** Medium (orchestration logic)

---

### Phase 8: Route Refactor (Low Risk)

**Step 8.1:** Strip route file to definitions only
- Import AuthController
- Instantiate controller
- Replace all inline handlers with controller methods
- Remove all:
  - Inline functions (now in services/utils)
  - Constants (move to auth.types.ts or service files)
  - TypeScript interfaces (already moved)
  - Database imports (no longer needed)

**Step 8.2:** Final route file structure (~80 LOC):
```typescript
import express from "express";
import { AuthController } from "../controllers/auth/AuthController";

const router = express.Router();
const authController = new AuthController();

// Test endpoint (to be removed in production)
router.get("/ttim", (req, res) => res.json("hello"));

// OAuth flow endpoints
router.get("/google", (req, res) => authController.getGoogleAuthUrl(req, res));
router.get("/callback", (req, res) => authController.handleOAuthCallback(req, res));
router.get("/google/callback", (req, res) => authController.handleOAuthCallback(req, res));

// Token management
router.get("/google/validate/:googleAccountId", (req, res) =>
  authController.validateToken(req, res)
);

// Scope management
router.get("/google/scopes", (req, res) => authController.getScopeInfo(req, res));
router.get("/google/reconnect", (req, res) => authController.getReconnectUrl(req, res));

// Error handling middleware
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[AUTH] Unhandled route error:", error);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
  next(error);
});

export default router;
```

**Step 8.3:** Remove unused exports
- Remove exported functions (now in services)
- Keep only `router` export
- Update any files importing from this route

**Estimated Time:** 1 hour
**Risk:** Low

---

### Phase 9: Testing & Validation (Critical)

**Step 9.1:** Unit tests for all services
- TokenManagementService - Token refresh scenarios
- ScopeManagementService - Scope validation
- AccountLinkingService - Org linking logic
- OAuthFlowService - Transaction flows, fallback logic

**Step 9.2:** Integration tests
- Full OAuth flow (mocked Google API)
- Token refresh flow
- Incremental authorization flow
- Error scenarios (missing code, expired token, etc.)

**Step 9.3:** Manual testing (REQUIRED)
- Test OAuth flow end-to-end in browser
- Test token refresh with expired token
- Test incremental authorization
- Test multi-tenant account switching
- Test error responses

**Step 9.4:** Load testing (if applicable)
- Concurrent OAuth callbacks
- Token refresh under load

**Estimated Time:** 4 hours
**Risk:** Critical (catch any regression bugs)

---

### Phase 10: Cleanup & Documentation

**Step 10.1:** Remove test endpoint
- Delete `/ttim` endpoint (line 406-408)

**Step 10.2:** Update imports across codebase
- Search for imports from `routes/auth.ts`
- Update to use new types/services

**Step 10.3:** Add JSDoc comments
- Document all controller methods
- Document all service methods
- Document all utility functions

**Step 10.4:** Update README/docs
- Document new architecture
- Update API documentation
- Add migration notes

**Estimated Time:** 2 hours
**Risk:** Low

---

## 6. Files to Create (Summary)

| File Path | Responsibility | LOC | Dependencies |
|-----------|----------------|-----|--------------|
| `src/types/auth.types.ts` | Type definitions | ~100 | None |
| `src/controllers/auth/AuthController.ts` | HTTP request handlers | ~300 | All services |
| `src/controllers/auth/feature-services/OAuthFlowService.ts` | OAuth flow logic | ~250 | UserModel, GoogleAccountModel, OrganizationUserModel |
| `src/controllers/auth/feature-services/TokenManagementService.ts` | Token management | ~120 | GoogleAccountModel, oauth2Helper |
| `src/controllers/auth/feature-services/AccountLinkingService.ts` | Account/org linking | ~150 | OrganizationUserModel |
| `src/controllers/auth/feature-services/ScopeManagementService.ts` | Scope management | ~80 | Constants only |
| `src/controllers/auth/feature-utils/oauth-client-factory.ts` | OAuth2 client creation | ~50 | google.auth.OAuth2 |
| `src/controllers/auth/feature-utils/security-utils.ts` | Security utilities | ~60 | None |
| `src/controllers/auth/feature-utils/validation-utils.ts` | Request validation | ~40 | None |
| `src/controllers/auth/feature-utils/response-formatters.ts` | Response formatting | ~80 | None |

**Total New Code:** ~1,230 LOC (vs. 1,100 LOC original, accounting for better structure and error handling)

---

## 7. Files to Modify

| File Path | Changes | Impact |
|-----------|---------|--------|
| `src/routes/auth.ts` | Strip to ~80 LOC route definitions only | HIGH (simplification) |
| `src/models/GoogleAccountModel.ts` | Add `upsert()` method (~30 LOC) | LOW (new method) |
| Any files importing from `routes/auth.ts` | Update imports to use new types/services | MEDIUM (breaking change) |

---

## 8. Risk Assessment

### Critical Risks (HIGH PRIORITY)

#### Risk 1: OAuth Callback Transaction Failure
**Severity:** CRITICAL
**Likelihood:** MEDIUM
**Impact:** User authentication fails, no account created
**Current Mitigation:** Fallback non-transactional flow (lines 678-738)
**New Mitigation:**
- Preserve fallback logic in `OAuthFlowService.handleFallbackAuth()`
- Add comprehensive transaction error logging
- Add retry logic for transient failures
- Monitor transaction success rate

**Testing:**
- Simulate transaction rollback (e.g., constraint violation)
- Verify fallback activation
- Verify eventual consistency

---

#### Risk 2: Token Refresh Failure During Active Session
**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** User session broken, API calls fail
**Current Mitigation:** Token refresh wrapper in oauth2Helper
**New Mitigation:**
- Preserve `getValidOAuth2Client()` usage in TokenManagementService
- Add token expiry buffer (5 minutes, already present)
- Add retry logic for refresh failures
- Log all refresh failures with context

**Testing:**
- Test with expired token
- Test with invalid refresh token
- Test concurrent refresh requests

---

#### Risk 3: Multi-Tenant Account Switching Logic
**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** User accesses wrong organization data
**Current Mitigation:** Organization linking in transaction (lines 644-664)
**New Mitigation:**
- Preserve organization linking in `AccountLinkingService`
- Add validation to ensure user belongs to organization
- Add audit logging for role changes
- Add tests for cross-tenant access prevention

**Testing:**
- Test organization switching flow
- Test user with multiple organizations
- Test unauthorized organization access

---

#### Risk 4: CSRF/State Parameter Validation Missing
**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** CSRF attack possible during OAuth flow
**Current State:** State generated but NOT validated in callback
**New Mitigation:**
- **ADD STATE VALIDATION** to `OAuthFlowService.completeOAuthFlow()`
- Store state in session/cache with expiry
- Validate state parameter matches stored value
- Reject callback if state missing/invalid

**Testing:**
- Test callback with invalid state
- Test callback with missing state
- Test callback with expired state

---

### Medium Risks

#### Risk 5: Environment Variable Validation
**Severity:** MEDIUM
**Likelihood:** LOW
**Impact:** Server fails to start or OAuth fails
**Current Mitigation:** `validateEnvironmentVariables()` called on each request
**New Mitigation:**
- Keep validation in `oauth-client-factory.ts`
- Call once at server startup (not per-request)
- Fail fast if env vars missing

**Testing:**
- Test server startup with missing env vars
- Verify error message clarity

---

#### Risk 6: Google API Rate Limiting
**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Impact:** OAuth flow fails during high traffic
**Current Mitigation:** None explicit
**New Mitigation:**
- Add retry logic with exponential backoff
- Add rate limit error detection
- Log rate limit errors separately
- Consider caching user profile responses

**Testing:**
- Simulate rate limit error from Google
- Verify retry behavior

---

#### Risk 7: Token Storage Security
**Severity:** MEDIUM
**Likelihood:** LOW
**Impact:** Token exposure in logs
**Current Mitigation:** Token sanitization in logs (lines 507-515)
**New Mitigation:**
- Move sanitization to `security-utils.ts`
- Ensure NO full tokens in logs
- Add audit logging for token access
- Consider encrypting refresh tokens at rest

**Testing:**
- Review all logs for token exposure
- Audit database for plaintext tokens

---

### Low Risks

#### Risk 8: Breaking Changes to Downstream Consumers
**Severity:** LOW
**Likelihood:** HIGH
**Impact:** Imports fail in other modules
**Mitigation:**
- Search codebase for all imports from `routes/auth.ts`
- Update imports to use new types/services
- Maintain backward compatibility where possible
- Add deprecation warnings before breaking changes

**Testing:**
- Grep for `from "../routes/auth"` or `from "./routes/auth"`
- Update all references
- Run full test suite

---

#### Risk 9: Response Format Changes
**Severity:** LOW
**Likelihood:** LOW
**Impact:** Frontend breaks if response format changes
**Mitigation:**
- Preserve exact response structure in `response-formatters.ts`
- Add response schema validation tests
- Document any intentional changes

**Testing:**
- Compare responses before/after refactor
- Use snapshot tests for response format

---

#### Risk 10: Logging Verbosity Changes
**Severity:** LOW
**Likelihood:** MEDIUM
**Impact:** Debugging becomes harder if logs change
**Mitigation:**
- Preserve all existing log statements
- Add structured logging where missing
- Use consistent log prefixes (e.g., `[AUTH]`)

**Testing:**
- Review logs before/after refactor
- Ensure critical events still logged

---

## 9. Security Considerations

### Current Security Posture

**Strengths:**
- JWT-based authentication (via middleware)
- OAuth2 with refresh tokens
- HTTPS required (assumed via redirect URI)
- Token expiry handling
- CSRF state parameter generation
- No password storage for OAuth users

**Weaknesses:**
1. **NO STATE VALIDATION** - CSRF vulnerability
2. **No rate limiting** on auth endpoints
3. **No IP-based lockout** for failed attempts
4. **Refresh tokens stored in plaintext** in database
5. **No audit logging** for auth events
6. **Access tokens exposed in response** (line 759)
7. **Origin validation uses `*`** in postMessage (line 820)

---

### Security Improvements to Add

#### Improvement 1: State Validation (CRITICAL)
**Location:** `OAuthFlowService.completeOAuthFlow()`
**Implementation:**
```typescript
// Before token exchange:
// 1. Retrieve stored state from cache/session
// 2. Compare with req.query.state
// 3. Reject if mismatch
// 4. Delete state after validation
```

#### Improvement 2: Rate Limiting
**Location:** `AuthController` or route middleware
**Implementation:**
- Add express-rate-limit to auth endpoints
- Limit: 10 requests per 15 minutes per IP
- Separate limits for different endpoints

#### Improvement 3: Audit Logging
**Location:** All services
**Implementation:**
- Log all auth events (login, token refresh, errors)
- Include: userId, IP, timestamp, action, result
- Store in separate audit table or logging service

#### Improvement 4: Token Encryption
**Location:** `GoogleAccountModel` or BaseModel
**Implementation:**
- Encrypt refresh tokens before storing
- Decrypt on retrieval
- Use AES-256 with env-based key
- **Note:** Adds complexity, consider KMS for production

#### Improvement 5: Origin Validation
**Location:** `response-formatters.generatePopupHtml()`
**Implementation:**
- Replace `'*'` with `process.env.FRONTEND_URL`
- Validate allowed origins in env config
- **Current Line:** 820

#### Improvement 6: Remove Access Token from Response
**Location:** `response-formatters.formatCallbackResponse()`
**Implementation:**
- Remove `accessToken` field from response (line 759)
- Frontend should not handle access tokens directly
- Use HTTP-only cookies or opaque session tokens instead
- **Note:** May break frontend - coordinate with frontend team

---

## 10. Performance Considerations

### Current Performance Profile

**Database Queries Per OAuth Callback:**
- Transaction path:
  - 1x SELECT users by email
  - 0-1x INSERT user (if new)
  - 1x SELECT google_accounts by google_user_id
  - 1x UPDATE or INSERT google_accounts
  - 1x SELECT organization_users
  - 0-1x INSERT organization_users (if new)
  - 1x SELECT organization_users (for role)
- **Total:** 4-7 queries

**Fallback path (if transaction fails):**
- Same queries without transaction wrapper
- **Total:** 4-7 queries

**External API Calls Per Callback:**
- 1x Google OAuth token exchange (`oauth2Client.getToken()`)
- 1x Google user profile fetch (`fetch()` to userinfo endpoint)
- **Total:** 2 API calls

---

### Performance Improvements

#### Improvement 1: Reduce Query Count
**Current Issue:** Multiple SELECT queries in sequence
**Solution:**
- Combine user + google account lookup into single query with JOIN
- Cache organization role lookups
- **Estimated Savings:** 2-3 queries per callback

#### Improvement 2: Add Database Indexes
**Current Issue:** No explicit indexes mentioned
**Required Indexes:**
- `users.email` (unique, for findByEmail)
- `google_accounts.google_user_id` (for findByGoogleUserId)
- `google_accounts.user_id` (for findByUserId)
- `organization_users.user_id + organization_id` (composite, for findByUserAndOrg)

**Implementation:**
- Add migration to create indexes
- Verify indexes exist in production

#### Improvement 3: Cache Token Expiry Checks
**Current Issue:** Database query on every token validation
**Solution:**
- Cache token expiry in Redis/memory
- Invalidate on refresh
- **Estimated Savings:** 1 DB query per API call

#### Improvement 4: Optimize Transaction Scope
**Current Issue:** Long-running transaction holds locks
**Solution:**
- Minimize transaction duration
- Move organization linking outside transaction if safe
- Use read-committed isolation level

#### Improvement 5: Add Monitoring
**Add Metrics:**
- OAuth callback latency (p50, p95, p99)
- Token refresh latency
- Transaction success rate
- Fallback activation rate
- Google API call latency

**Tools:**
- Use Prometheus + Grafana
- Add custom metrics in services

---

## 11. Observability & Monitoring Impact

### Current Logging

**Log Statements:**
- Request logging (line 238-245) - `[AUTH] METHOD PATH`
- OAuth flow events - `[AUTH] Generated authorization URL`
- Token exchange - `[AUTH] OAuth tokens received`
- Profile fetch - `[AUTH] Google profile fetched`
- Transaction start - `[AUTH] Starting database transaction`
- User creation/update - `[AUTH] Found existing user` / `Created new user`
- Account creation/update - `[AUTH] Updated Google account`
- Org linking - `[AUTH] Created admin role for user`
- Transaction complete - `[AUTH] Database transaction completed`
- Errors - `[AUTH ERROR] {operation}`

**Log Level:** Mixed (console.log, console.error)
**Structured Logging:** No (plain strings)

---

### Logging Improvements

#### Improvement 1: Structured Logging
**Current:** Plain console.log strings
**New:** Use Winston or Pino with JSON formatting
**Benefits:**
- Queryable logs (e.g., filter by userId)
- Better parsing in log aggregation tools
- Consistent format

**Example:**
```typescript
logger.info("OAuth flow completed", {
  operation: "oauth_callback",
  userId: user.id,
  googleAccountId: googleAccount.id,
  email: user.email,
  duration: Date.now() - startTime,
});
```

#### Improvement 2: Add Trace IDs
**Current:** No request correlation
**New:** Add trace ID to all logs in a request
**Implementation:**
- Use express middleware to generate trace ID
- Attach to req object
- Include in all log statements

#### Improvement 3: Add Performance Timing
**Current:** No latency tracking
**New:** Log duration for critical operations
**Locations:**
- OAuth token exchange
- Google API calls
- Database transactions
- Full callback flow

#### Improvement 4: Error Context
**Current:** Error messages lack context
**New:** Add rich error context
**Include:**
- Operation being performed
- Input parameters (sanitized)
- Stack trace (in dev mode)
- Error code/type
- User ID (if available)

---

### Monitoring Alerts

**Recommended Alerts:**

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| OAuth callback failure rate > 5% | 1 minute window | HIGH | Page on-call |
| Token refresh failure rate > 10% | 5 minute window | MEDIUM | Notify team |
| Transaction fallback rate > 2% | 5 minute window | MEDIUM | Investigate DB |
| OAuth callback latency p95 > 5s | 5 minute window | LOW | Optimize flow |
| Google API errors > 10/min | 1 minute window | HIGH | Check API quota |

---

## 12. Testing Strategy

### Unit Tests (New Files)

#### TokenManagementService Tests
- `validateAndRefreshToken()` with valid token → no refresh
- `validateAndRefreshToken()` with expired token → refresh triggered
- `validateAndRefreshToken()` with invalid googleAccountId → error
- `refreshToken()` with missing refresh token → error
- `checkTokenExpiry()` with various expiry dates

#### ScopeManagementService Tests
- `validateScopes()` with valid keys → success
- `validateScopes()` with invalid keys → error
- `resolveScopeUrls()` with "all" → returns all scopes
- `resolveScopeUrls()` with specific keys → returns subset
- `getScopeDescriptions()` → returns metadata

#### AccountLinkingService Tests
- `ensureOrganizationLink()` creates link if missing
- `ensureOrganizationLink()` skips if exists
- `ensureOrganizationLink()` within transaction
- `getUserRole()` returns correct role
- `getUserRole()` returns default if no org

#### OAuthFlowService Tests (CRITICAL)
- `exchangeCodeForTokens()` with valid code → tokens
- `exchangeCodeForTokens()` with invalid code → error
- `fetchGoogleUserProfile()` with valid token → profile
- `fetchGoogleUserProfile()` with invalid token → error
- `completeOAuthFlow()` with new user → creates user + account + org link
- `completeOAuthFlow()` with existing user → updates account
- `completeOAuthFlow()` transaction rollback → does not persist
- `handleFallbackAuth()` with new user → creates without transaction
- `handleFallbackAuth()` with existing user → updates

#### Utility Tests
- `oauth-client-factory.validateEnvironmentVariables()` with missing vars → error
- `oauth-client-factory.createOAuth2Client()` with valid env → client
- `security-utils.generateSecureState()` → random string
- `security-utils.sanitizeTokenForLogging()` → truncated token
- `validation-utils.validateCallbackParams()` with valid params → success
- `validation-utils.validateCallbackParams()` with missing code → error
- `validation-utils.validateGoogleAccountId()` with valid ID → success
- `validation-utils.validateGoogleAccountId()` with NaN → error

---

### Integration Tests

#### Full OAuth Flow
1. Generate auth URL → returns URL
2. Mock OAuth callback with code → creates user + account
3. Verify user in database
4. Verify google account in database
5. Verify organization link in database
6. Verify response format matches expected

#### Token Refresh Flow
1. Create google account with expired token
2. Call `/google/validate/:googleAccountId`
3. Verify token refreshed in database
4. Verify response contains new expiry

#### Incremental Authorization Flow
1. Call `/google/reconnect?scopes=ga4,gbp`
2. Verify auth URL contains correct scopes
3. Mock callback with new scopes
4. Verify scopes updated in database

#### Error Scenarios
1. OAuth callback with missing code → 400 error
2. OAuth callback with invalid code → Google API error
3. OAuth callback with expired state → error (once state validation added)
4. Token refresh with invalid googleAccountId → 400 error
5. Reconnect with invalid scope key → 400 error

---

### Manual Testing Checklist

**OAuth Flow:**
- [ ] Open `/api/auth/google` in browser
- [ ] Redirected to Google consent screen
- [ ] Grant all permissions
- [ ] Redirected back to callback URL
- [ ] Popup closes automatically
- [ ] User created in database
- [ ] Google account created in database
- [ ] Organization link created (if org_id present)
- [ ] Tokens stored correctly

**Token Refresh:**
- [ ] Set token expiry to past date in database
- [ ] Call protected API endpoint
- [ ] Verify token refreshed automatically
- [ ] API call succeeds with new token

**Multi-Tenant:**
- [ ] Authenticate with Google account A
- [ ] Note organization ID
- [ ] Authenticate with Google account B (different org)
- [ ] Verify correct organization linked
- [ ] Switch between accounts
- [ ] Verify data isolation

**Error Handling:**
- [ ] OAuth callback with no code → clear error message
- [ ] OAuth callback with invalid code → clear error message
- [ ] Token refresh with invalid ID → clear error message
- [ ] All errors return proper HTTP status codes
- [ ] Error responses match ErrorResponse interface

---

## 13. Definition of Done

### Code Complete
- [ ] All 10 new files created
- [ ] All functions moved from route file to appropriate services/utils
- [ ] Route file stripped to ~80 LOC (route definitions only)
- [ ] All `db()` calls replaced with Model methods
- [ ] All TypeScript interfaces moved to `auth.types.ts`
- [ ] Constants moved to appropriate files
- [ ] No code duplication

### Testing Complete
- [ ] Unit tests written for all services (min 80% coverage)
- [ ] Unit tests written for all utilities (min 90% coverage)
- [ ] Integration tests for full OAuth flow
- [ ] Integration tests for token refresh
- [ ] Integration tests for error scenarios
- [ ] Manual testing checklist completed
- [ ] All tests passing

### Documentation Complete
- [ ] JSDoc comments added to all public methods
- [ ] README updated with new architecture
- [ ] API documentation updated (if applicable)
- [ ] Migration notes written
- [ ] Security considerations documented
- [ ] Performance considerations documented

### Security Complete
- [ ] State validation implemented (CSRF protection)
- [ ] Rate limiting added
- [ ] Audit logging added
- [ ] Token sanitization in all logs verified
- [ ] Origin validation improved (postMessage)
- [ ] Access token removed from response (coordinate with frontend)

### Performance Complete
- [ ] Database indexes verified
- [ ] Query count optimized
- [ ] Monitoring metrics added
- [ ] Alerts configured
- [ ] Load testing performed (if applicable)

### Deployment Ready
- [ ] All imports updated across codebase
- [ ] No breaking changes (or migration plan documented)
- [ ] Environment variables documented
- [ ] Database migrations created (if needed)
- [ ] Rollback plan documented
- [ ] Canary deployment plan (if applicable)

---

## 14. Rollback Plan

### Pre-Deployment
1. **Tag current working version** in git
2. **Backup database** (if schema changes)
3. **Document current env vars**
4. **Create rollback script**

### Rollback Triggers
Rollback if any of:
- OAuth flow success rate < 95%
- Token refresh failure rate > 10%
- Any 500 errors on auth endpoints
- Transaction failure rate > 5%
- Manual testing checklist fails

### Rollback Steps
1. **Revert Git Commit:**
   ```bash
   git revert <refactor-commit-hash>
   git push origin main
   ```

2. **Redeploy Previous Version:**
   - Use CI/CD to deploy previous tag
   - Verify previous version running

3. **Verify Rollback:**
   - Test OAuth flow end-to-end
   - Check error logs
   - Monitor metrics for 15 minutes

4. **Restore Database (if needed):**
   - Only if schema migrations ran
   - Restore from pre-deployment backup

5. **Notify Team:**
   - Post in Slack/incident channel
   - Document rollback reason
   - Schedule post-mortem

---

## 15. Post-Refactor Improvements (Future Work)

### Phase 2 Enhancements (Not in Scope)

1. **JWT Token Management in Controller**
   - Currently auth endpoint doesn't issue JWTs
   - Add JWT generation in callback response
   - Use existing `jwt.sign()` from middleware

2. **Refresh Token Rotation**
   - Rotate refresh tokens on each use
   - Invalidate old refresh tokens
   - Detect token reuse (security)

3. **Session Management**
   - Add session table for active sessions
   - Track last activity timestamp
   - Implement session timeout
   - Add "logout all devices" feature

4. **OAuth State Persistence**
   - Store state in Redis with TTL
   - Associate state with session
   - Validate state on callback
   - Clean up expired states

5. **Multi-Factor Authentication**
   - Add MFA enrollment flow
   - Require MFA for sensitive actions
   - Support TOTP (Google Authenticator)

6. **Audit Log Queries**
   - Add API endpoint to query audit logs
   - Filter by user, action, date range
   - Admin-only access

7. **Token Encryption at Rest**
   - Encrypt refresh tokens in database
   - Use AWS KMS or similar
   - Transparent decryption on retrieval

8. **IP Whitelisting**
   - Allow organization-level IP restrictions
   - Block OAuth from unauthorized IPs
   - Log all IP-based blocks

9. **Device Fingerprinting**
   - Track devices per user
   - Notify on new device login
   - Allow device revocation

10. **OAuth Provider Abstraction**
    - Support multiple OAuth providers (GitHub, Microsoft, etc.)
    - Abstract provider-specific logic
    - Unified provider interface

---

## 16. Timeline Estimate

| Phase | Description | Time | Risk |
|-------|-------------|------|------|
| 1 | Setup + Types | 0.5 hrs | Low |
| 2 | Utility Extraction | 2 hrs | Low |
| 3 | Token Management Service | 1.5 hrs | Medium |
| 4 | Scope Management Service | 1 hr | Low |
| 5 | Account Linking Service | 2 hrs | Medium |
| 6 | OAuth Flow Service | 4 hrs | HIGH |
| 7 | Controller Layer | 3 hrs | Medium |
| 8 | Route Refactor | 1 hr | Low |
| 9 | Testing & Validation | 4 hrs | Critical |
| 10 | Cleanup & Documentation | 2 hrs | Low |

**Total Estimated Time:** 21 hours (~3 full working days)

**Buffer for Issues:** +8 hours (40% buffer)

**Total Project Time:** ~29 hours (~4 full working days)

**Recommended Schedule:**
- **Day 1:** Phases 1-4 (Setup, utilities, simple services)
- **Day 2:** Phases 5-6 (Account linking, OAuth flow - CRITICAL)
- **Day 3:** Phases 7-8 (Controller, route refactor)
- **Day 4:** Phases 9-10 (Testing, documentation, deployment)

---

## 17. Critical Success Factors

### Must-Have
1. **Zero breaking changes to OAuth flow** - Users must be able to authenticate
2. **Transaction integrity preserved** - No data corruption
3. **Token refresh continues working** - No user session disruptions
4. **All tests passing** - No regressions
5. **Security not degraded** - State validation added

### Nice-to-Have
1. Performance improvements (faster queries)
2. Better error messages
3. Structured logging
4. Monitoring dashboards

### Non-Goals (Out of Scope)
1. JWT token issuance (already handled elsewhere)
2. New OAuth providers
3. MFA implementation
4. Session management UI
5. Refresh token rotation

---

## 18. Dependencies & Prerequisites

### Required Before Starting
- [ ] All existing auth tests passing
- [ ] Access to test Google OAuth credentials
- [ ] Access to test database
- [ ] Existing models (`UserModel`, `GoogleAccountModel`, `OrganizationUserModel`) working
- [ ] `oauth2Helper.getValidOAuth2Client()` working

### Required During Refactor
- [ ] No other developers modifying auth routes simultaneously
- [ ] Ability to deploy to staging environment
- [ ] Ability to rollback quickly if issues arise

### Required Before Production Deployment
- [ ] All manual testing completed
- [ ] Load testing completed (if high traffic expected)
- [ ] Monitoring alerts configured
- [ ] Rollback plan tested
- [ ] Team trained on new architecture

---

## 19. Communication Plan

### Before Starting
- [ ] Notify team of refactor plan
- [ ] Share this plan document for review
- [ ] Get approval from tech lead/architect
- [ ] Schedule pair programming sessions for critical phases

### During Refactor
- [ ] Daily standup updates
- [ ] Post in Slack when phases complete
- [ ] Request code review after each major phase
- [ ] Escalate blockers immediately

### Before Deployment
- [ ] Demo refactored system to team
- [ ] Walk through new architecture
- [ ] Review rollback plan with ops team
- [ ] Schedule deployment during low-traffic window

### After Deployment
- [ ] Monitor metrics for 24 hours
- [ ] Post deployment summary in Slack
- [ ] Document any issues encountered
- [ ] Schedule retrospective

---

## 20. Conclusion

This refactor transforms a 1,100-line monolithic route file into a clean, maintainable architecture with:

- **10 new files** organized by responsibility
- **~80 LOC route file** (route definitions only)
- **All database calls** using Model abstractions
- **Transaction integrity** preserved
- **Security improvements** (state validation, audit logging)
- **Better testability** (unit tests for all services)
- **Clear separation of concerns** (controller → service → model)

**Estimated effort:** 4 full working days
**Risk level:** HIGH (critical auth flow)
**Recommended approach:** Phase-by-phase with comprehensive testing at each step

**Success criteria:** Zero downtime, zero breaking changes, 100% test coverage for new code.

---

**Plan Author:** Engineering Control Agent
**Plan Version:** 1.0
**Date:** 2026-02-18
**Status:** Ready for Review
