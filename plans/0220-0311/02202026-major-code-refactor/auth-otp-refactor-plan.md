# Auth OTP Route Refactor Plan

**Date:** 2026-02-18
**Route File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/auth-otp.ts`
**LOC:** 347 lines
**Endpoints:** 3
**Complexity:** Medium (transaction-based user creation, invitation handling, test bypass)

---

## 1. Current State

### Endpoints

| Method | Path | Handler | LOC | Complexity |
|--------|------|---------|-----|------------|
| POST | `/api/auth/otp/request` | Request OTP code | ~77 lines | Medium - email validation, super admin check, invitation check, OTP generation |
| POST | `/api/auth/otp/verify` | Verify OTP and login | ~164 lines | High - OTP verification, user creation, invitation acceptance, JWT generation, org linking |
| POST | `/api/auth/otp/validate` | Validate JWT token | ~69 lines | Low - JWT verification, user lookup |

### Dependencies

**External Libraries:**
- `express` - routing
- `jsonwebtoken` - JWT generation/verification
- `crypto` - used indirectly (imported but not used directly)

**Internal Services:**
- `../database/connection` - raw Knex db() calls
- `../services/mail` - sendOTP function

**Database Tables (Direct Queries):**
- `users` - 4 direct queries
- `otp_codes` - 4 direct queries
- `invitations` - 4 direct queries
- `organization_users` - 4 direct queries
- `google_accounts` - 1 direct query

### Current Data Flow

```
/request endpoint:
1. Validate email
2. Check test account bypass
3. Parse super admin list from env
4. Check super admin status
5. Query users table
6. Query invitations table
7. Generate 6-digit OTP
8. Insert into otp_codes
9. Send email via mail service
10. Return success

/verify endpoint:
1. Validate email & code
2. Check test account bypass
3. Parse super admin list from env
4. Check super admin status
5. Query & verify OTP (if not test)
6. Mark OTP as used
7. Query users table
8. If no user:
   - Query invitations
   - Create user (transaction-worthy)
   - If invitation: create org_user + update invitation
9. Generate JWT
10. Query organization_users
11. Query google_accounts
12. Set auth cookie
13. Return token & user data

/validate endpoint:
1. Extract token from header or body
2. Verify JWT
3. Parse super admin list from env
4. Check super admin status
5. Query users table
6. Query organization_users
7. Return validation result
```

### Business Logic Scattered in Route

1. **OTP Generation** - `generateCode()` helper (lines 14-16)
2. **Test Account Bypass** - hardcoded `TEST_EMAIL` constant (line 11)
3. **Super Admin Parsing** - repeated 3 times (lines 43-48, 119-124, 169-174, 305-310)
4. **Email Normalization** - repeated logic (toLowerCase)
5. **JWT Secret** - pulled from env at top level (line 8)
6. **User Creation with Invitation** - complex transaction logic inline (lines 183-211)
7. **Cookie Configuration** - inline configuration (lines 242-250)
8. **Role Assignment** - default role logic (line 260, 334)
9. **Google Account Selection** - "first created" heuristic (lines 228-239)

### Current Problems

1. **No transaction safety** - User creation + org linking + invitation update not wrapped
2. **Repeated super admin parsing** - Same env parsing logic 4 times
3. **Magic numbers** - OTP expiry (10 minutes), JWT expiry (7 days), code length (6 digits)
4. **Test account bypass** - Hardcoded, no configuration
5. **No model abstraction** - 17 direct db() calls
6. **Error handling inconsistency** - Some errors logged, others not
7. **JWT secret fallback** - Dangerous default for production
8. **No observability** - Limited logging, no metrics
9. **Mixed responsibilities** - Auth logic + user creation + invitation + org linking
10. **Google account selection** - Naive "first one" strategy with inline query

---

## 2. Target Architecture

### Folder Structure

```
src/
├── controllers/
│   └── auth-otp/
│       ├── AuthOtpController.ts          # Main controller with route handlers
│       ├── feature-services/
│       │   ├── service.otp-generation.ts # OTP generation & storage
│       │   ├── service.otp-verification.ts # OTP verification & cleanup
│       │   ├── service.user-onboarding.ts # User creation + invitation acceptance
│       │   ├── service.jwt-management.ts  # JWT generation & verification
│       │   └── service.super-admin.ts     # Super admin validation
│       └── feature-utils/
│           ├── util.email-normalization.ts # Email processing
│           ├── util.test-account.ts        # Test account configuration
│           └── util.cookie-config.ts       # Cookie configuration builder
├── models/
│   ├── UserModel.ts                # Abstract users table
│   ├── OtpCodeModel.ts            # Abstract otp_codes table
│   ├── InvitationModel.ts         # Abstract invitations table
│   ├── OrganizationUserModel.ts   # Abstract organization_users table
│   └── GoogleAccountModel.ts      # Abstract google_accounts table
└── routes/
    └── auth-otp.ts                # Thin route definitions only
```

### Separation of Concerns

**Controller** (AuthOtpController.ts)
- Request/response handling
- Input validation
- HTTP status codes
- Response formatting
- Calls services

**Services** (feature-services/)
- Business logic
- Multi-step operations
- Service orchestration
- Error handling
- Transaction management

**Utils** (feature-utils/)
- Pure functions
- Configuration builders
- Data transformation
- No database access
- No external service calls

**Models**
- Database abstraction
- Query building
- Type safety
- Single table responsibility

---

## 3. Handler-to-Component Mapping

### POST /request Handler → Components

| Current Code | Target Component | Reason |
|--------------|------------------|--------|
| `email.toLowerCase()` | `util.email-normalization.ts::normalizeEmail()` | Reusable pure function |
| `TEST_EMAIL` check | `util.test-account.ts::isTestAccount()` | Configurable test logic |
| Super admin parsing | `service.super-admin.ts::isSuperAdmin()` | Reused 4x, needs caching |
| `db("users").where(...)` | `UserModel.findByEmail()` | Model abstraction |
| `db("invitations").where(...)` | `InvitationModel.findPendingByEmail()` | Model abstraction |
| `generateCode()` | `util.otp-generation.ts::generateSixDigitCode()` | Pure function with config |
| OTP expiry calculation | `service.otp-generation.ts::calculateExpiry()` | Business logic |
| `db("otp_codes").insert()` | `OtpCodeModel.create()` | Model abstraction |
| `sendOTP()` | Keep in controller, wrap in try/catch | External service |

**Controller Method:** `requestOtp(req, res)`

**Flow:**
```typescript
1. Validate input
2. normalizeEmail()
3. isTestAccount() → early return if true
4. isSuperAdmin()
5. Check admin login authorization
6. UserModel.findByEmail()
7. InvitationModel.findPendingByEmail()
8. Validate access (user/invitation/super admin)
9. service.otp-generation.createAndSendOtp()
   - generateSixDigitCode()
   - calculateExpiry()
   - OtpCodeModel.create()
   - sendOTP()
10. Return success
```

### POST /verify Handler → Components

| Current Code | Target Component | Reason |
|--------------|------------------|--------|
| Input validation | Controller | Request layer |
| `email.toLowerCase()` | `util.email-normalization.ts::normalizeEmail()` | Reusable |
| Test account check | `util.test-account.ts::isTestAccount()` | Reusable |
| Super admin parsing | `service.super-admin.ts::isSuperAdmin()` | Reused 4x |
| OTP query & verification | `service.otp-verification.ts::verifyOtp()` | Complex business logic |
| Mark OTP used | `OtpCodeModel.markAsUsed()` | Model method |
| User lookup | `UserModel.findByEmail()` | Model abstraction |
| Invitation lookup | `InvitationModel.findPendingByEmail()` | Model abstraction |
| User creation + org linking | `service.user-onboarding.ts::onboardUser()` | Complex transaction |
| JWT generation | `service.jwt-management.ts::generateToken()` | Business logic |
| Org user lookup | `OrganizationUserModel.findByUserId()` | Model abstraction |
| Google account lookup | `GoogleAccountModel.findPrimaryByOrg()` | Model abstraction |
| Cookie config | `util.cookie-config.ts::buildAuthCookie()` | Configuration |

**Controller Method:** `verifyOtp(req, res)`

**Flow:**
```typescript
1. Validate input
2. normalizeEmail()
3. isTestAccount()
4. isSuperAdmin()
5. Check admin login authorization
6. If not test: service.otp-verification.verifyAndConsume()
   - Find valid OTP
   - Mark as used
   - Return verification result
7. UserModel.findByEmail()
8. If no user: service.user-onboarding.onboardUser()
   - TRANSACTION START
   - Create user
   - Accept invitation (if exists)
   - Link to organization
   - COMMIT
9. service.jwt-management.generateToken()
10. OrganizationUserModel.findByUserId()
11. GoogleAccountModel.findPrimaryByOrg()
12. buildAuthCookie()
13. Set cookie
14. Return success with token & user
```

### POST /validate Handler → Components

| Current Code | Target Component | Reason |
|--------------|------------------|--------|
| Token extraction | Controller | Request layer |
| JWT verification | `service.jwt-management.ts::verifyToken()` | Business logic |
| Super admin parsing | `service.super-admin.ts::isSuperAdmin()` | Reused |
| User lookup | `UserModel.findById()` | Model abstraction |
| Org user lookup | `OrganizationUserModel.findByUserId()` | Model abstraction |

**Controller Method:** `validateToken(req, res)`

**Flow:**
```typescript
1. Extract token from header or body
2. service.jwt-management.verifyToken()
3. isSuperAdmin()
4. UserModel.findById()
5. OrganizationUserModel.findByUserId()
6. Return validation result
```

---

## 4. Database Call → Model Method Mapping

### All db() Calls

| Line | Current Query | Target Model Method | Notes |
|------|---------------|---------------------|-------|
| 58 | `db("users").where({ email }).first()` | `UserModel.findByEmail(email)` | Simple lookup |
| 61-63 | `db("invitations").where({ email, status: "pending" }).first()` | `InvitationModel.findPendingByEmail(email)` | Filtered lookup |
| 79-85 | `db("otp_codes").insert({...})` | `OtpCodeModel.create(data)` | Insert with timestamps |
| 136-144 | `db("otp_codes").where({...}).orderBy(...).first()` | `OtpCodeModel.findValidCode(email, code)` | Complex query with expiry check |
| 151-153 | `db("otp_codes").where({ id }).update({ used: true })` | `OtpCodeModel.markAsUsed(id)` | Update operation |
| 159 | `db("users").where({ email }).first()` | `UserModel.findByEmail(email)` | Duplicate of line 58 |
| 164-166 | `db("invitations").where({ email, status: "pending" }).first()` | `InvitationModel.findPendingByEmail(email)` | Duplicate of line 61-63 |
| 184-191 | `db("users").insert({...}).returning("*")` | `UserModel.create(data)` | Insert with return |
| 197-203 | `db("organization_users").insert({...})` | `OrganizationUserModel.create(data)` | Insert operation |
| 205-207 | `db("invitations").where({ id }).update({ status, updated_at })` | `InvitationModel.markAsAccepted(id)` | Update operation |
| 224-226 | `db("organization_users").where({ user_id }).first()` | `OrganizationUserModel.findByUserId(userId)` | Simple lookup |
| 231-234 | `db("google_accounts").where({ organization_id }).orderBy("created_at").first()` | `GoogleAccountModel.findPrimaryByOrg(orgId)` | First account heuristic |
| 313 | `db("users").where({ id }).first()` | `UserModel.findById(id)` | Simple lookup |
| 323-325 | `db("organization_users").where({ user_id }).first()` | `OrganizationUserModel.findByUserId(userId)` | Duplicate lookup |

**Total:** 17 db() calls → 12 unique model methods (some duplicates)

### Model Methods to Create

**UserModel:**
- `findByEmail(email: string): Promise<User | null>`
- `findById(id: string): Promise<User | null>`
- `create(data: CreateUserInput): Promise<User>`

**OtpCodeModel:**
- `create(data: CreateOtpCodeInput): Promise<OtpCode>`
- `findValidCode(email: string, code: string): Promise<OtpCode | null>`
- `markAsUsed(id: string): Promise<void>`

**InvitationModel:**
- `findPendingByEmail(email: string): Promise<Invitation | null>`
- `markAsAccepted(id: string): Promise<void>`

**OrganizationUserModel:**
- `findByUserId(userId: string): Promise<OrganizationUser | null>`
- `create(data: CreateOrgUserInput): Promise<OrganizationUser>`

**GoogleAccountModel:**
- `findPrimaryByOrg(organizationId: string): Promise<GoogleAccount | null>`

---

## 5. Step-by-Step Migration

### Phase 1: Setup (No Breaking Changes)

**Step 1.1:** Create controller directory structure
```bash
mkdir -p src/controllers/auth-otp/feature-services
mkdir -p src/controllers/auth-otp/feature-utils
```

**Step 1.2:** Create model methods (additive only)
- UserModel.findByEmail()
- UserModel.findById()
- UserModel.create()
- OtpCodeModel.create()
- OtpCodeModel.findValidCode()
- OtpCodeModel.markAsUsed()
- InvitationModel.findPendingByEmail()
- InvitationModel.markAsAccepted()
- OrganizationUserModel.findByUserId()
- OrganizationUserModel.create()
- GoogleAccountModel.findPrimaryByOrg()

**Step 1.3:** Create utility modules
- `util.email-normalization.ts`
  - `normalizeEmail(email: string): string`
- `util.test-account.ts`
  - `isTestAccount(email: string): boolean`
  - Config via `TEST_EMAILS` env var (comma-separated)
- `util.cookie-config.ts`
  - `buildAuthCookieOptions(): CookieOptions`

**Validation:** Run tests, ensure no regressions

---

### Phase 2: Service Layer (No Route Changes Yet)

**Step 2.1:** Create service.super-admin.ts
```typescript
// Singleton pattern with caching
class SuperAdminService {
  private cache: Set<string> | null = null;
  private cacheTimestamp: number = 0;
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  isSuperAdmin(email: string): boolean {
    // Load and cache super admin emails
    // Return boolean
  }
}
```

**Step 2.2:** Create service.otp-generation.ts
```typescript
// Constants configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

// Functions
- generateSixDigitCode(): string
- calculateExpiry(minutes: number): Date
- createAndSendOtp(email: string): Promise<OtpGenerationResult>
```

**Step 2.3:** Create service.otp-verification.ts
```typescript
// Functions
- verifyAndConsume(email: string, code: string): Promise<VerificationResult>
  - Uses OtpCodeModel.findValidCode()
  - Uses OtpCodeModel.markAsUsed()
  - Returns { verified: boolean, error?: string }
```

**Step 2.4:** Create service.user-onboarding.ts
```typescript
// Transaction-wrapped user creation
- onboardUser(email: string): Promise<OnboardingResult>
  - Starts transaction
  - Creates user
  - Accepts invitation (if exists)
  - Links to org
  - Commits transaction
  - Returns { user, isNewUser, orgUser? }
```

**Step 2.5:** Create service.jwt-management.ts
```typescript
// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '7d';

// Functions
- generateToken(userId: string, email: string): string
- verifyToken(token: string): Promise<TokenPayload>
- validateJwtSecret(): void // Throws if using default in production
```

**Validation:** Unit test each service in isolation

---

### Phase 3: Controller Creation

**Step 3.1:** Create AuthOtpController.ts
```typescript
export class AuthOtpController {
  async requestOtp(req: Request, res: Response): Promise<void> {
    // Orchestrate services
    // Handle errors
    // Return responses
  }

  async verifyOtp(req: Request, res: Response): Promise<void> {
    // Orchestrate services
    // Handle transaction
    // Return responses
  }

  async validateToken(req: Request, res: Response): Promise<void> {
    // Validate JWT
    // Return user data
  }
}

// Export singleton
export const authOtpController = new AuthOtpController();
```

**Step 3.2:** Add comprehensive error handling
- Wrap all service calls in try/catch
- Log errors with context
- Return appropriate HTTP status codes
- Never leak internal errors to client

**Validation:** Integration tests for full flow

---

### Phase 4: Route Refactor

**Step 4.1:** Update auth-otp.ts route file
```typescript
import express from 'express';
import { authOtpController } from '../controllers/auth-otp/AuthOtpController';

const router = express.Router();

router.post('/request', (req, res) => authOtpController.requestOtp(req, res));
router.post('/verify', (req, res) => authOtpController.verifyOtp(req, res));
router.post('/validate', (req, res) => authOtpController.validateToken(req, res));

export default router;
```

**Route file should be:** ~12 lines (down from 347)

**Validation:**
- Run full test suite
- Manual testing of all 3 endpoints
- Test error cases
- Test test account bypass
- Test super admin flow

---

### Phase 5: Cleanup

**Step 5.1:** Remove old code
- Remove helper functions from route file
- Remove constants from route file
- Verify no dead code

**Step 5.2:** Add observability
- Log all auth attempts (success/failure)
- Log OTP generation
- Log user creation
- Add metrics hooks (if available)

**Step 5.3:** Documentation
- Update API documentation
- Document new service layer
- Document model methods
- Add inline comments for complex logic

---

## 6. Files to Create

### Controllers
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/AuthOtpController.ts` (~200 lines)

### Services
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-services/service.otp-generation.ts` (~80 lines)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-services/service.otp-verification.ts` (~60 lines)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-services/service.user-onboarding.ts` (~120 lines)
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-services/service.jwt-management.ts` (~80 lines)
6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-services/service.super-admin.ts` (~50 lines)

### Utils
7. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-utils/util.email-normalization.ts` (~15 lines)
8. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-utils/util.test-account.ts` (~30 lines)
9. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/auth-otp/feature-utils/util.cookie-config.ts` (~40 lines)

### Model Methods (add to existing files)
- UserModel methods (3 new)
- OtpCodeModel methods (3 new)
- InvitationModel methods (2 new)
- OrganizationUserModel methods (2 new)
- GoogleAccountModel methods (1 new)

**Total New Files:** 9
**Total Estimated New LOC:** ~675 lines (more lines, but organized and testable)

---

## 7. Files to Modify

1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/auth-otp.ts`
   - **Before:** 347 lines
   - **After:** ~12 lines
   - **Change:** Replace all handlers with controller calls

2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/UserModel.ts`
   - Add: `findByEmail()`, `findById()`, `create()`

3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OtpCodeModel.ts`
   - Add: `create()`, `findValidCode()`, `markAsUsed()`

4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/InvitationModel.ts`
   - Add: `findPendingByEmail()`, `markAsAccepted()`

5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OrganizationUserModel.ts`
   - Add: `findByUserId()`, `create()`

6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/GoogleAccountModel.ts`
   - Add: `findPrimaryByOrg()`

---

## 8. Risk Assessment

### High Risk

**1. Transaction Safety in User Onboarding**
- **Current:** User creation + org linking + invitation update NOT wrapped in transaction
- **Risk:** Partial failure could leave user created but not linked to org
- **Mitigation:** Wrap entire flow in `db.transaction()` in service.user-onboarding.ts
- **Testing:** Create failure scenarios, verify rollback

**2. JWT Secret Production Safety**
- **Current:** Falls back to "dev-secret-key-change-in-prod"
- **Risk:** Production deployment without proper secret = security breach
- **Mitigation:** Add startup validation in service.jwt-management.ts that throws if NODE_ENV=production and using default
- **Testing:** Environment validation tests

**3. Super Admin Email Parsing**
- **Current:** Parsed 4 times from env, no validation
- **Risk:** Typo in env var = locked out admins
- **Mitigation:** Singleton service with caching, validation, and logging
- **Testing:** Test malformed env vars, empty values, whitespace

### Medium Risk

**4. Test Account Configuration**
- **Current:** Hardcoded single email
- **Risk:** Need to add test accounts, requires code change
- **Mitigation:** Move to TEST_EMAILS env var (comma-separated)
- **Testing:** Test multiple test emails, invalid formats

**5. Google Account "Primary" Selection**
- **Current:** Naive "first created" heuristic
- **Risk:** Wrong account selected if multiple exist
- **Mitigation:** Document limitation, add TODO for proper primary flag
- **Testing:** Test orgs with multiple google accounts

**6. OTP Cleanup**
- **Current:** No cleanup of old/expired OTP codes
- **Risk:** Table bloat over time
- **Mitigation:** Add cleanup job (separate task, not in this refactor)
- **Testing:** Monitor table size

### Low Risk

**7. Cookie Domain Configuration**
- **Current:** Hardcoded ".getalloro.com" for production
- **Risk:** Breaks if domain changes
- **Mitigation:** Move to COOKIE_DOMAIN env var with fallback
- **Testing:** Test cookie in different environments

**8. Email Service Failure**
- **Current:** Returns 500 if sendOTP fails
- **Risk:** User locked out if email service down
- **Mitigation:** Add retry logic, better error message
- **Testing:** Mock email service failures

**9. Role Default Value**
- **Current:** Defaults to "viewer" if no org user
- **Risk:** Could grant unintended access
- **Mitigation:** Explicit null return, force frontend to handle no-role case
- **Testing:** Test users without org membership

### Migration Risk

**10. Behavior Changes During Refactor**
- **Risk:** Subtle logic changes break existing clients
- **Mitigation:**
  - Comprehensive integration tests before refactor
  - Side-by-side comparison testing
  - Feature flag to toggle new controller (optional)
- **Testing:** Record current responses, validate identical after refactor

**11. Import Path Changes**
- **Risk:** Other code importing from routes/auth-otp.ts breaks
- **Mitigation:** Grep for imports, verify only used as route in app.ts
- **Testing:** Full compilation check

---

## 9. Testing Strategy

### Before Refactor
1. Document current behavior with integration tests
2. Create test suite covering:
   - Successful OTP flow
   - Test account bypass
   - Super admin login
   - Regular user login
   - Invitation acceptance
   - Invalid OTP
   - Expired OTP
   - Missing user/invitation
   - JWT validation
   - Invalid JWT

### During Refactor
1. Unit test each service in isolation
2. Unit test each util function
3. Mock database calls in service tests
4. Test error paths explicitly

### After Refactor
1. Run original integration tests
2. Verify identical responses
3. Performance comparison (should be similar)
4. Manual testing of full flow
5. Load test OTP endpoints

### Regression Prevention
1. Add tests for:
   - Transaction rollback on user creation failure
   - Super admin cache invalidation
   - Test account configuration
   - Cookie security flags
   - JWT secret validation

---

## 10. Definition of Done

- [ ] All 9 new files created
- [ ] All 6 model files updated with new methods
- [ ] Route file reduced to ~12 lines
- [ ] All 17 db() calls replaced with model methods
- [ ] Transaction wrapper added to user onboarding
- [ ] Super admin service with caching implemented
- [ ] JWT secret production validation added
- [ ] Test account configuration via env var
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] No console.log statements (use proper logger)
- [ ] Error handling consistent across all handlers
- [ ] TypeScript compilation succeeds with no errors
- [ ] Postman/API tests verified
- [ ] Production deployment checklist:
  - [ ] JWT_SECRET env var set
  - [ ] SUPER_ADMIN_EMAILS env var set
  - [ ] TEST_EMAILS env var set (or empty for prod)
  - [ ] COOKIE_DOMAIN env var set

---

## 11. Architectural Decisions

### Decision 1: Controller Pattern (Class vs Functions)
**Chosen:** Class-based controller with singleton export
**Reasoning:**
- Allows dependency injection later
- Groups related handlers
- Easier to test with mocks
- Standard pattern in Express ecosystem

**Tradeoffs:**
- Slightly more boilerplate than pure functions
- `this` binding concerns (solved with arrow functions or explicit binding)

**Alternative Considered:** Functional controller with exported handler functions
- Pro: Simpler, more functional
- Con: Harder to mock dependencies, less organized

---

### Decision 2: Service Transaction Ownership
**Chosen:** service.user-onboarding.ts owns transaction
**Reasoning:**
- Business logic layer should control atomicity
- Controller shouldn't know about transactions
- Easier to test transaction behavior

**Tradeoffs:**
- Service needs db connection reference
- Harder to compose transactions across services

**Alternative Considered:** Controller manages transaction
- Pro: Explicit in handler, easier to see flow
- Con: Leaks persistence concerns to controller

---

### Decision 3: Super Admin Caching Strategy
**Chosen:** In-memory cache with 5-minute TTL
**Reasoning:**
- Env var rarely changes at runtime
- Reduces repeated string parsing
- Low memory footprint
- 5-minute TTL allows reload without restart

**Tradeoffs:**
- Stale data for up to 5 minutes
- Per-instance cache (not shared across servers)

**Alternative Considered:** No caching, parse every time
- Pro: Always fresh
- Con: Wasteful CPU for every auth request

**Alternative Considered:** Load once at startup
- Pro: Simplest
- Con: Requires restart to update (acceptable tradeoff?)

---

### Decision 4: Model Method Granularity
**Chosen:** Specific methods (e.g., `findPendingByEmail`) vs generic (e.g., `findOne`)
**Reasoning:**
- Self-documenting
- Encapsulates business rules ("pending" status)
- Type-safe return types
- Easier to optimize/index

**Tradeoffs:**
- More methods to maintain
- Some duplication in query logic

**Alternative Considered:** Generic query builder pattern
- Pro: Fewer methods, more flexible
- Con: Business logic leaks to caller, less type-safe

---

### Decision 5: Error Handling Strategy
**Chosen:** Try/catch in controller, throw from services
**Reasoning:**
- Services focus on business logic
- Controller translates errors to HTTP responses
- Centralized error logging in controller

**Tradeoffs:**
- Services can't control HTTP status codes directly

**Alternative Considered:** Services return Result<T, Error> type
- Pro: Explicit error handling, no exceptions
- Con: More boilerplate, less idiomatic TypeScript

---

### Decision 6: Test Account Configuration
**Chosen:** Env var `TEST_EMAILS` (comma-separated)
**Reasoning:**
- Easy to configure per environment
- Supports multiple test accounts
- No code change needed to add accounts

**Tradeoffs:**
- Comma-separated format is fragile (no validation)

**Alternative Considered:** Separate config file
- Pro: Can include metadata (name, purpose)
- Con: Requires file deployment, more complex

---

## 12. Performance Considerations

### Current Performance Characteristics
- **/request:** 2 SELECT queries + 1 INSERT + 1 email send
- **/verify:** 3-5 SELECT queries + 1-3 INSERTs/UPDATEs (depends on new user)
- **/validate:** 2 SELECT queries

### Refactored Performance
- **Same number of DB queries** (no N+1 added)
- **Super admin cache** reduces env parsing overhead
- **Transaction overhead** adds ~2-5ms for user onboarding (acceptable)

### Optimization Opportunities (Future)
1. **Cache user org lookup** - GET /validate called frequently
2. **Batch OTP cleanup** - Scheduled job vs per-request
3. **Redis for OTP storage** - Faster than Postgres for temporary data
4. **JWT blacklist** - Redis-based revocation (not in scope)

---

## 13. Security Considerations

### Current Security Issues Addressed
1. **JWT Secret Validation** - Fails startup if production with default secret
2. **Transaction Safety** - Prevents partial user creation
3. **Email Normalization** - Consistent casing prevents bypass
4. **OTP Expiry** - Configurable, currently 10 minutes
5. **Cookie Security** - httpOnly in production, secure flag

### Remaining Security Concerns (Not in Scope)
1. **Rate Limiting** - Not implemented, OTP endpoint vulnerable to spam
2. **Brute Force Protection** - No lockout after X failed attempts
3. **OTP Reuse Prevention** - Handled (marked as used)
4. **Email Validation** - No regex check for valid email format
5. **CORS Configuration** - Not visible in this route

---

## 14. Rollback Plan

### If Refactor Fails in Production

**Immediate Rollback (< 5 minutes):**
1. Revert Git commit
2. Redeploy previous version
3. Verify auth flow works

**Partial Rollback (Model-only changes):**
- If only models are deployed, no breaking change
- Models are additive only
- Safe to leave deployed

**Debug Production Issues:**
1. Check logs for error messages
2. Compare request/response with old version
3. Verify env vars (JWT_SECRET, SUPER_ADMIN_EMAILS, TEST_EMAILS)
4. Check database transaction logs

**Rollback Triggers:**
- Auth failure rate > 5%
- User creation failures
- JWT validation failures
- Email sending failures

---

## 15. Migration Checklist

### Pre-Migration
- [ ] Create feature branch
- [ ] Run existing tests, ensure passing
- [ ] Document current API responses
- [ ] Notify team of upcoming refactor

### Phase 1: Models
- [ ] Create model methods
- [ ] Unit test model methods
- [ ] Verify no breaking changes

### Phase 2: Services
- [ ] Create service modules
- [ ] Unit test services
- [ ] Mock database calls

### Phase 3: Controller
- [ ] Create controller class
- [ ] Integration test controller
- [ ] Compare responses with original

### Phase 4: Routes
- [ ] Update route file
- [ ] Full integration test
- [ ] Manual testing

### Phase 5: Deployment
- [ ] Code review
- [ ] Merge to main
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor logs for errors
- [ ] Monitor auth success rate

### Post-Migration
- [ ] Update documentation
- [ ] Archive old code (if any)
- [ ] Plan cleanup tasks (OTP cleanup job, rate limiting)

---

## Appendix A: Environment Variables

### Required
- `JWT_SECRET` - Must be set in production, throws error if using default
- `SUPER_ADMIN_EMAILS` - Comma-separated list of admin emails

### Optional
- `TEST_EMAILS` - Comma-separated list of test account emails (default: empty)
- `COOKIE_DOMAIN` - Domain for auth cookie (default: ".getalloro.com" in prod)
- `NODE_ENV` - Controls cookie security flags and JWT validation

### Example .env
```bash
NODE_ENV=production
JWT_SECRET=your-secret-key-here-at-least-32-chars
SUPER_ADMIN_EMAILS=admin@getalloro.com,cto@getalloro.com
TEST_EMAILS=test1@example.com,test2@example.com
COOKIE_DOMAIN=.getalloro.com
```

---

## Appendix B: Code Organization Principles

### Why This Structure?

**Controller Folder:**
- Groups all auth-otp related code in one place
- Easy to find and navigate
- Clear ownership boundary

**Feature Services:**
- Each service has single responsibility
- Independently testable
- Reusable across controllers (if needed)

**Feature Utils:**
- Pure functions, no side effects
- No database or external service dependencies
- Easy to test, easy to reason about

**Models:**
- Database abstraction layer
- Type-safe queries
- Single table responsibility
- Can be shared across features

This refactor transforms a monolithic 347-line route file into a well-organized, maintainable architecture with clear separation of concerns, comprehensive error handling, and transaction safety.
