# Admin Auth Route Refactor Plan

## Current State

### File Location
`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/auth.ts`

### Lines of Code
78 LOC (including comments and whitespace)

### Endpoints
1. **POST /api/admin/pilot/:userId** (Lines 15-67)
   - Purpose: Generates impersonation token for target user
   - Protection: `authenticateToken` + `superAdminMiddleware`
   - Response: Pilot token, google account ID, target user info

2. **GET /api/admin/validate** (Lines 74-76)
   - Purpose: Validates Super Admin authorization
   - Protection: `authenticateToken` + `superAdminMiddleware`
   - Response: Simple success confirmation

### Current Dependencies
- `express` - routing framework
- `jsonwebtoken` - JWT token generation
- `../../database/connection` - direct db access (to be removed)
- `../../middleware/auth` - authentication middleware
- `../../middleware/superAdmin` - authorization middleware
- Environment variable: `JWT_SECRET`

### Direct Database Calls
1. Line 24: `db("users").where({ id: userId }).first()` - fetch target user
2. Line 31-33: `db("google_accounts").where({ user_id: userId }).first()` - fetch google account

### Business Logic in Route
- Lines 23-28: User lookup and 404 handling
- Lines 30-33: Google account lookup
- Lines 36-44: JWT token generation with custom claims
- Lines 46-48: Audit logging
- Lines 50-59: Response formatting
- Lines 60-65: Error handling

---

## Target Architecture

```
signalsai-backend/src/
├── controllers/
│   └── admin/
│       └── auth/
│           ├── AdminAuthController.ts        # Main controller
│           ├── services/
│           │   └── PilotSessionService.ts    # Pilot token generation logic
│           └── utils/
│               └── tokenHelpers.ts           # JWT-related utilities (if needed)
├── models/
│   ├── UserModel.ts                          # Existing
│   └── GoogleAccountModel.ts                 # Existing
└── routes/
    └── admin/
        └── auth.ts                            # Stripped down to route definitions only
```

---

## Mapping

### What Moves to Controller
**File: `AdminAuthController.ts`**
- Request validation (param extraction)
- Response formatting
- HTTP status code decisions
- Error-to-HTTP-response mapping
- Entry point for both endpoints

**Methods:**
- `createPilotSession(req: AuthRequest, res: Response)` - handles POST /pilot/:userId
- `validateSuperAdmin(req: AuthRequest, res: Response)` - handles GET /validate

### What Moves to Services
**File: `PilotSessionService.ts`**
- User lookup orchestration
- Google account lookup orchestration
- JWT token generation logic
- Audit logging
- Business rules for pilot sessions

**Methods:**
- `generatePilotToken(userId: string, adminEmail: string): Promise<PilotSessionResult>`
  - Returns: `{ token, googleAccountId, user }` or throws error

**Dependencies:**
- `UserModel.findById()`
- `GoogleAccountModel.findByUserId()`
- `jsonwebtoken` library
- Environment variable access for JWT_SECRET

### What Gets Replaced by Model Calls
1. **Line 24** → `UserModel.findById(userId)`
   - Direct replacement: `db("users").where({ id: userId }).first()` → `UserModel.findById(userId)`

2. **Lines 31-33** → `GoogleAccountModel.findByUserId(userId)`
   - Direct replacement: `db("google_accounts").where({ user_id: userId }).first()` → `GoogleAccountModel.findByUserId(userId)`

### What Stays in Route File
- Route definitions (router.post, router.get)
- Middleware attachments (authenticateToken, superAdminMiddleware)
- Controller method invocations
- Import statements for router, controller, middleware

---

## Step-by-Step Migration

### Step 1: Create Directory Structure
```bash
mkdir -p /Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/services
mkdir -p /Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/utils
```

### Step 2: Create PilotSessionService
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/services/PilotSessionService.ts`

**Extract from route file:**
- Lines 23-59: Core pilot session logic
- Replace db() calls with model methods
- Return structured result instead of sending HTTP response
- Throw domain errors instead of returning res.status()

**Service interface:**
```typescript
interface PilotSessionResult {
  token: string;
  googleAccountId: number | null;
  user: {
    id: number;
    email: string;
    name: string;
  };
}

class PilotSessionService {
  static async generatePilotToken(
    userId: string,
    adminEmail: string
  ): Promise<PilotSessionResult>
}
```

**Model call replacements:**
- `db("users")...` → `UserModel.findById(parseInt(userId))`
- `db("google_accounts")...` → `GoogleAccountModel.findByUserId(parseInt(userId))`

### Step 3: Create AdminAuthController
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/AdminAuthController.ts`

**Extract from route file:**
- Lines 19-66: Request handler wrapper (minus business logic)
- Transform service errors into HTTP responses
- Handle try-catch at HTTP boundary
- Format responses

**Controller responsibilities:**
1. Extract `userId` from `req.params`
2. Extract admin email from `req.user?.email`
3. Call `PilotSessionService.generatePilotToken()`
4. Return formatted JSON response
5. Map errors to appropriate HTTP status codes

**Methods:**
```typescript
class AdminAuthController {
  static async createPilotSession(req: AuthRequest, res: Response)
  static async validateSuperAdmin(req: AuthRequest, res: Response)
}
```

### Step 4: Update Route File
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/auth.ts`

**Remove:**
- Lines 2 (jsonwebtoken import)
- Line 3 (db import)
- Line 8 (JWT_SECRET constant)
- Lines 19-66 (entire handler body)
- Lines 74-76 (validate handler body)

**Add:**
- Import: `AdminAuthController` from controller file

**Replace handlers with:**
```typescript
router.post(
  "/pilot/:userId",
  authenticateToken,
  superAdminMiddleware,
  AdminAuthController.createPilotSession
);

router.get(
  "/validate",
  authenticateToken,
  superAdminMiddleware,
  AdminAuthController.validateSuperAdmin
);
```

**Final route file:** ~20 LOC (down from 78)

### Step 5: Verification
1. Run TypeScript compiler: `tsc --noEmit`
2. Run tests (if they exist): `npm test -- admin/auth`
3. Manual test: POST to /api/admin/pilot/:userId with valid super admin token
4. Manual test: GET to /api/admin/validate with valid super admin token
5. Verify audit logs appear correctly

---

## Model Replacements

### Before → After

#### User Lookup (Line 24)
**Before:**
```typescript
const targetUser = await db("users").where({ id: userId }).first();
```

**After:**
```typescript
const targetUser = await UserModel.findById(parseInt(userId));
```

**Changes:**
- `userId` string → parsed to number
- Direct db query → Model method
- Return type: implicit `any` → typed `IUser | undefined`

#### Google Account Lookup (Lines 31-33)
**Before:**
```typescript
const googleAccount = await db("google_accounts")
  .where({ user_id: userId })
  .first();
```

**After:**
```typescript
const googleAccount = await GoogleAccountModel.findByUserId(parseInt(userId));
```

**Changes:**
- `userId` string → parsed to number
- Direct db query → Model method
- Return type: implicit `any` → typed `IGoogleAccount | undefined`

---

## Files to Create

### 1. PilotSessionService.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/services/PilotSessionService.ts`

**Responsibilities:**
- Orchestrate pilot session creation
- User existence validation
- Google account lookup
- JWT token generation with pilot claims
- Audit logging
- Return structured result

**Dependencies:**
- UserModel (from `../../../../models/UserModel`)
- GoogleAccountModel (from `../../../../models/GoogleAccountModel`)
- jsonwebtoken
- process.env.JWT_SECRET

**Exports:**
- `PilotSessionResult` interface
- `PilotSessionService` class with static `generatePilotToken()` method

**Error handling:**
- Throw error if user not found (controller maps to 404)
- Throw error on JWT signing failure (controller maps to 500)

### 2. AdminAuthController.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/AdminAuthController.ts`

**Responsibilities:**
- HTTP request/response handling
- Parameter extraction and validation
- Service orchestration
- Error-to-status-code mapping
- Response formatting

**Dependencies:**
- PilotSessionService (from `./services/PilotSessionService`)
- AuthRequest type (from `../../../middleware/auth`)
- Express types

**Exports:**
- `AdminAuthController` class with static methods:
  - `createPilotSession`
  - `validateSuperAdmin`

**Error mapping:**
- "User not found" → 404
- All other errors → 500

### 3. (Optional) tokenHelpers.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin/auth/utils/tokenHelpers.ts`

**Defer creation unless JWT logic becomes more complex.**

Current JWT generation is simple enough to live in service.

Only create if:
- Multiple services need to generate pilot tokens
- Token validation logic is added
- Token refresh logic is added

---

## Files to Modify

### 1. auth.ts (Route file)
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/auth.ts`

**Changes:**
- Remove: jsonwebtoken import
- Remove: db connection import
- Remove: JWT_SECRET constant
- Add: AdminAuthController import
- Replace: Inline handlers with controller method references
- Keep: express, middleware imports, router setup, export

**Before:** 78 LOC with business logic
**After:** ~20 LOC with route definitions only

**Critical:** Ensure middleware order is preserved:
1. authenticateToken
2. superAdminMiddleware
3. Controller method

---

## Risk Assessment

### Low Risk ✅
- **Simple endpoints:** Only 2 endpoints, both straightforward
- **No shared state:** No in-memory state or caching
- **Existing models:** UserModel and GoogleAccountModel already implement needed queries
- **Clear boundaries:** Business logic cleanly separates from HTTP handling
- **Middleware unchanged:** Auth middleware stack stays identical

### Medium Risk ⚠️
- **Type coercion:** `userId` param is string, must parse to number for model methods
  - **Mitigation:** Wrap in `parseInt()`, handle NaN case

- **Error message changes:** Service throws errors vs route returns responses
  - **Mitigation:** Controller maps error messages to identical HTTP responses

- **Audit logging:** Console.log references `req.user?.email`
  - **Mitigation:** Pass admin email as parameter to service

### Potential Failure Points 🔴

#### 1. Type mismatches on userId
**Problem:** Route receives string, models expect number

**Solution:**
```typescript
const userIdNum = parseInt(userId);
if (isNaN(userIdNum)) {
  return res.status(400).json({ error: "Invalid user ID" });
}
```

#### 2. JWT_SECRET access in service
**Problem:** Service needs environment variable

**Solution:**
- Import at top of service file
- Add runtime check: throw if undefined
- Or: Pass as dependency injection parameter

#### 3. Audit log loses context
**Problem:** Service doesn't have access to req.user

**Solution:**
- Pass `adminEmail` as explicit parameter
- Service logs using provided admin email

#### 4. Error response format changes
**Problem:** Service throws Error objects, route returned JSON

**Solution:**
- Controller catches service errors
- Maps to identical JSON response structure
- Preserves status codes (404 for not found, 500 for other)

#### 5. Middleware execution order
**Problem:** Moving handler to controller could break middleware chain

**Solution:**
- Verify middleware runs before controller
- Test with invalid tokens
- Test with non-super-admin tokens

### Testing Strategy

#### Unit Tests
- `PilotSessionService.generatePilotToken()`
  - Mock UserModel.findById
  - Mock GoogleAccountModel.findByUserId
  - Verify token generation
  - Verify error on user not found

#### Integration Tests
- POST /api/admin/pilot/:userId
  - With valid super admin token
  - With invalid token (expect 401)
  - With non-super-admin token (expect 403)
  - With non-existent userId (expect 404)

- GET /api/admin/validate
  - With valid super admin token (expect 200)
  - With invalid token (expect 401)
  - With non-super-admin token (expect 403)

#### Manual Verification
1. Start dev server
2. Generate super admin token
3. Call POST /pilot/:userId → verify response structure unchanged
4. Check console logs → verify audit log appears
5. Call GET /validate → verify 200 response

### Rollback Plan

If issues arise:

1. **Immediate:** Revert route file to original version (git revert)
2. **Clean up:** Delete controller directory
3. **Verify:** Run tests, restart server
4. **Duration:** < 5 minutes

**No data migration involved** - purely code reorganization.

---

## Definition of Done

- [ ] PilotSessionService created with generatePilotToken method
- [ ] AdminAuthController created with both endpoint handlers
- [ ] Route file stripped to route definitions only
- [ ] All db() calls replaced with model methods
- [ ] TypeScript compiles without errors
- [ ] Existing tests pass (if any)
- [ ] Manual test: pilot session creation works
- [ ] Manual test: validate endpoint works
- [ ] Audit logs still appear in console
- [ ] Response structures unchanged (exact same JSON)
- [ ] Error responses unchanged (same status codes)
- [ ] Middleware chain preserved (auth + superAdmin)

---

## Notes

### Why This Refactor?
- **Separation of concerns:** HTTP handling vs business logic
- **Testability:** Service can be unit tested without Express
- **Reusability:** Pilot token logic could be called from other contexts
- **Consistency:** Matches target architecture pattern
- **Model usage:** Replaces raw db() calls with typed models

### Future Enhancements (Out of Scope)
- Token refresh mechanism
- Pilot session expiration tracking
- Audit log persistence (currently console only)
- Rate limiting on pilot endpoint
- Pilot session revocation

### Related Files (For Reference)
- Middleware: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/middleware/auth.ts`
- Middleware: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/middleware/superAdmin.ts`
- Models: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/UserModel.ts`
- Models: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/GoogleAccountModel.ts`
