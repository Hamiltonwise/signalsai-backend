# Profile Route Refactor Plan

## 1. Current State

### Overview
- **File Location**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/profile.ts`
- **Lines of Code**: 148 LOC
- **Endpoints**: 2
  - `GET /api/profile/get` - Fetch user profile data (phone, operational_jurisdiction)
  - `PUT /api/profile/update` - Update user profile data (phone, operational_jurisdiction)

### Current Architecture
- Route file contains all logic: validation, database queries, error handling, response formatting
- Direct database access via `db("google_accounts")`
- Helper function `handleError` for error handling (lines 14-22)
- Middleware chain: `tokenRefreshMiddleware` → `rbacMiddleware`

### Dependencies
- `express` - Router
- `../database/connection` - Direct db() access
- `../middleware/tokenRefresh` - Authentication
- `../middleware/rbac` - Authorization
- **No model usage** - Direct Knex queries

### Current Database Operations
1. **GET /get** (lines 48-51):
   - `db("google_accounts").where({ id }).select("phone", "operational_jurisdiction").first()`

2. **PUT /update** (lines 116-118):
   - `db("google_accounts").where({ id }).update(updateData)`

3. **PUT /update** - Refetch (lines 128-131):
   - `db("google_accounts").where({ id }).select("phone", "operational_jurisdiction").first()`

### Business Logic Present
- Validation: Missing googleAccountId check (lines 41-46, 88-93)
- Validation: No fields to update check (lines 109-114)
- Update data building with dynamic field inclusion (lines 96-106)
- Automatic `updated_at` timestamp injection (line 97)
- Post-update data refetch pattern (lines 127-131)

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── profile.ts                          # Route definitions only
├── controllers/
│   └── profile/
│       ├── profile.controller.ts           # Main controller with handler functions
│       ├── profile-services/
│       │   └── profile.service.ts          # Business logic & orchestration
│       └── profile-utils/
│           ├── validation.util.ts          # Input validation
│           └── response.util.ts            # Response formatting
└── models/
    └── GoogleAccountModel.ts               # Already exists - data access layer
```

### Layer Responsibilities

#### **routes/profile.ts** (10-15 LOC)
- Route definitions only
- Middleware attachment
- Controller function delegation
- No logic, no validation, no error handling

#### **controllers/profile/profile.controller.ts** (40-50 LOC)
- Request extraction (`req.googleAccountId`, `req.body`)
- Call validation utils
- Call service layer
- Call response utils
- Error handling wrapper (try/catch)
- No direct model calls
- No business logic

#### **controllers/profile/profile-services/profile.service.ts** (50-60 LOC)
- Business logic orchestration
- Model method calls (GoogleAccountModel)
- Data transformation
- Business rule enforcement
- Returns structured data or throws errors
- No req/res objects
- No response formatting

#### **controllers/profile/profile-utils/validation.util.ts** (30-40 LOC)
- Input validation functions
- Throws errors with specific messages
- Pure functions (no side effects)
- Reusable across controller functions

#### **controllers/profile/profile-utils/response.util.ts** (30-40 LOC)
- Response formatting helpers
- Success/error response structures
- Timestamp injection
- Standardized error messages
- No business logic

---

## 3. Code Mapping

### From Route to Service Layer

#### **handleError Helper** (lines 14-22)
→ **Destination**: `controllers/profile/profile-utils/response.util.ts`
- Extract to `formatErrorResponse(error, operation)`
- Make reusable for all profile errors
- Add logging wrapper

#### **GET /get Validation** (lines 41-46)
→ **Destination**: `controllers/profile/profile-utils/validation.util.ts`
- Extract to `validateGoogleAccountId(googleAccountId)`
- Throws error if missing

#### **GET /get Database Query** (lines 48-51)
→ **Destination**: `controllers/profile/profile-services/profile.service.ts`
- Replace with: `GoogleAccountModel.findById(googleAccountId)`
- Add field selection in service layer
- Transform model response to only include `phone` and `operational_jurisdiction`

#### **GET /get Not Found Check** (lines 53-57)
→ **Destination**: `controllers/profile/profile-services/profile.service.ts`
- Service throws error if account not found
- Controller catches and formats error response

#### **GET /get Response** (lines 60-67)
→ **Destination**: `controllers/profile/profile-utils/response.util.ts`
- Extract to `formatProfileDataResponse(data)`
- Standardized success response structure

#### **PUT /update Validation** (lines 88-93, 109-114)
→ **Destination**: `controllers/profile/profile-utils/validation.util.ts`
- `validateGoogleAccountId(googleAccountId)` (reused from GET)
- `validateUpdateFields(phone, operational_jurisdiction)` (new)
  - Checks at least one field provided
  - Returns sanitized update object

#### **PUT /update Data Building** (lines 96-106)
→ **Destination**: `controllers/profile/profile-services/profile.service.ts`
- Business logic: conditional field inclusion
- Automatic `updated_at` injection
- Transform to model update format

#### **PUT /update Database Operations** (lines 116-118, 128-131)
→ **Destination**: `controllers/profile/profile-services/profile.service.ts`
- Replace update with: `GoogleAccountModel.updateById(id, updateData)`
- Replace refetch with: `GoogleAccountModel.findById(id)`
- Return only `phone` and `operational_jurisdiction` fields

#### **PUT /update Response** (lines 133-141)
→ **Destination**: `controllers/profile/profile-utils/response.util.ts`
- Extract to `formatProfileUpdateResponse(data)`
- Includes success message

---

## 4. Model Replacements

### Database Call → Model Method Mapping

| Current db() Call | Model Method Replacement | Location |
|-------------------|-------------------------|----------|
| `db("google_accounts").where({ id: googleAccountId }).select("phone", "operational_jurisdiction").first()` | `GoogleAccountModel.findById(googleAccountId)` | Service layer (GET) |
| `db("google_accounts").where({ id: googleAccountId }).update(updateData)` | `GoogleAccountModel.updateById(googleAccountId, updateData)` | Service layer (PUT) |
| `db("google_accounts").where({ id: googleAccountId }).select("phone", "operational_jurisdiction").first()` | `GoogleAccountModel.findById(googleAccountId)` | Service layer (PUT refetch) |

### Notes on Model Usage
- `GoogleAccountModel.findById()` returns full `IGoogleAccount` object
- Service layer must extract only `phone` and `operational_jurisdiction`
- `GoogleAccountModel.updateById()` returns affected row count (number)
- Service layer must handle `0` return value as "not found"

---

## 5. Step-by-Step Migration

### Phase 1: Create Directory Structure
```bash
mkdir -p src/controllers/profile/profile-services
mkdir -p src/controllers/profile/profile-utils
```

### Phase 2: Create Utility Files (Bottom-Up)

#### Step 2.1: Create `validation.util.ts`
- Extract validation logic
- Create functions:
  - `validateGoogleAccountId(googleAccountId: number | undefined): void`
  - `validateUpdateFields(phone?: string, operational_jurisdiction?: string): { phone?: string, operational_jurisdiction?: string }`
- Throw errors with descriptive messages

#### Step 2.2: Create `response.util.ts`
- Extract response formatting
- Create functions:
  - `formatProfileDataResponse(data: { phone: string | null, operational_jurisdiction: string | null })`
  - `formatProfileUpdateResponse(data: { phone: string | null, operational_jurisdiction: string | null })`
  - `formatErrorResponse(error: any, operation: string)`
- Return Response object shapes (not actual Express responses)

### Phase 3: Create Service Layer

#### Step 3.1: Create `profile.service.ts`
- Create functions:
  - `getProfileData(googleAccountId: number): Promise<{ phone: string | null, operational_jurisdiction: string | null }>`
  - `updateProfileData(googleAccountId: number, updates: { phone?: string, operational_jurisdiction?: string }): Promise<{ phone: string | null, operational_jurisdiction: string | null }>`
- Replace all `db()` calls with `GoogleAccountModel` methods
- Add data transformation logic
- Throw errors for not-found cases
- No req/res dependencies

### Phase 4: Create Controller

#### Step 4.1: Create `profile.controller.ts`
- Create handler functions:
  - `getProfile(req: RBACRequest, res: Response)`
  - `updateProfile(req: RBACRequest, res: Response)`
- Extract request data
- Call validation utils
- Call service functions
- Format responses using response utils
- Wrap in try/catch with error handling

### Phase 5: Refactor Route File

#### Step 5.1: Update `profile.ts`
- Remove all logic (validation, db calls, response formatting)
- Import controller functions
- Keep only route definitions and middleware chains:
  ```typescript
  profileRoutes.get("/get", tokenRefreshMiddleware, rbacMiddleware, profileController.getProfile);
  profileRoutes.put("/update", tokenRefreshMiddleware, rbacMiddleware, profileController.updateProfile);
  ```
- Remove `handleError` helper

### Phase 6: Testing & Verification

#### Step 6.1: Unit Tests
- Test validation utils in isolation
- Test service layer with mocked model
- Test response utils

#### Step 6.2: Integration Tests
- Test full request/response cycle
- Verify middleware chain still works
- Test error cases

#### Step 6.3: Manual Testing
- Test GET endpoint
- Test PUT endpoint with valid data
- Test error cases (missing ID, no fields, account not found)

---

## 6. Files to Create

### New Files

1. **`src/controllers/profile/profile.controller.ts`**
   - **Responsibility**: HTTP request/response handling
   - **Exports**: `getProfile`, `updateProfile`
   - **Dependencies**: validation utils, service layer, response utils

2. **`src/controllers/profile/profile-services/profile.service.ts`**
   - **Responsibility**: Business logic and model orchestration
   - **Exports**: `getProfileData`, `updateProfileData`
   - **Dependencies**: GoogleAccountModel

3. **`src/controllers/profile/profile-utils/validation.util.ts`**
   - **Responsibility**: Input validation
   - **Exports**: `validateGoogleAccountId`, `validateUpdateFields`
   - **Dependencies**: None (pure functions)

4. **`src/controllers/profile/profile-utils/response.util.ts`**
   - **Responsibility**: Response formatting
   - **Exports**: `formatProfileDataResponse`, `formatProfileUpdateResponse`, `formatErrorResponse`
   - **Dependencies**: None (pure functions)

### Total New Files: 4

---

## 7. Files to Modify

### Modified Files

1. **`src/routes/profile.ts`**
   - **Current LOC**: 148
   - **Target LOC**: 10-15
   - **Changes**:
     - Remove all inline logic
     - Remove `handleError` helper
     - Import controller functions
     - Convert route definitions to use controller references
     - Keep middleware chains intact
   - **Resulting Structure**:
     ```typescript
     import express from "express";
     import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
     import { rbacMiddleware } from "../middleware/rbac";
     import * as profileController from "../controllers/profile/profile.controller";

     const profileRoutes = express.Router();

     profileRoutes.get("/get", tokenRefreshMiddleware, rbacMiddleware, profileController.getProfile);
     profileRoutes.put("/update", tokenRefreshMiddleware, rbacMiddleware, profileController.updateProfile);

     export default profileRoutes;
     ```

### Total Modified Files: 1

---

## 8. Risk Assessment

### High Risk Areas

#### 8.1 **Response Format Changes**
- **Risk**: Accidentally changing response structure breaks frontend
- **Mitigation**:
  - Preserve exact response structure during refactor
  - Create response format unit tests before refactoring
  - Compare old vs new responses in integration tests
  - Document current response contracts

#### 8.2 **Middleware Chain Breakage**
- **Risk**: Losing `req.googleAccountId` from middleware due to incorrect typing
- **Mitigation**:
  - Verify `RBACRequest` type is used in controller
  - Test that `googleAccountId` is still populated
  - Keep middleware order identical

#### 8.3 **Error Handling Behavior Changes**
- **Risk**: Different error codes or messages returned
- **Mitigation**:
  - Document all current error responses (status codes + messages)
  - Preserve exact error messages in response utils
  - Test all error paths (missing ID, not found, no fields, db errors)

#### 8.4 **Model Method Misuse**
- **Risk**: `findById` returns full object, not just phone/jurisdiction fields
- **Mitigation**:
  - Service layer must explicitly extract fields
  - Add unit tests verifying field extraction
  - Document that model returns full `IGoogleAccount`

#### 8.5 **Update Semantics Change**
- **Risk**: `updateById` returns count, not boolean - could break not-found detection
- **Mitigation**:
  - Service checks if returned count is 0
  - Throw error if no rows affected
  - Test update with non-existent ID

### Medium Risk Areas

#### 8.6 **Transaction Boundary Loss**
- **Risk**: Model methods support transactions but not used here
- **Mitigation**:
  - Current code doesn't use transactions, so no risk for now
  - Document that future transactional work should happen in service layer

#### 8.7 **Validation Logic Drift**
- **Risk**: Extracted validation behaves differently than inline version
- **Mitigation**:
  - Extract validation exactly as-is first
  - Test with same inputs
  - Refine only after confirming behavior match

### Low Risk Areas

#### 8.8 **Import Path Changes**
- **Risk**: Relative imports break after file moves
- **Mitigation**:
  - Use TypeScript compiler to catch import errors
  - Test build succeeds after refactor

#### 8.9 **Logging Changes**
- **Risk**: Error logging behavior changes
- **Mitigation**:
  - Preserve `console.error` calls in response utils
  - Verify errors still logged with operation context

### Rollback Strategy

If issues arise during deployment:
1. **Immediate rollback**: Revert `profile.ts` to original (single file with all logic)
2. **Keep new files**: Leave controller/service files in place for next attempt
3. **Root cause**: Compare request/response logs between versions
4. **Fix forward**: If minor issue, patch controller and redeploy

### Testing Checklist Before Deployment

- [ ] Unit tests pass for validation utils
- [ ] Unit tests pass for response utils
- [ ] Unit tests pass for service layer (with mocked model)
- [ ] Integration tests pass for both endpoints
- [ ] Error cases tested (400, 404, 500)
- [ ] Response format exactly matches current behavior
- [ ] TypeScript compiles without errors
- [ ] Middleware chain intact (`googleAccountId` present)
- [ ] Manual testing in dev environment
- [ ] Load/performance testing (optional, if high traffic)

---

## 9. Post-Refactor Benefits

### Immediate Wins
- **Testability**: Each layer can be unit tested in isolation
- **Reusability**: Validation and response utils can be reused across routes
- **Readability**: Route file is now 15 LOC instead of 148
- **Maintainability**: Logic changes don't require editing route definitions

### Long-Term Benefits
- **Model consistency**: All DB access goes through `GoogleAccountModel`
- **Pattern establishment**: Template for refactoring other route files
- **Error handling standardization**: Centralized error formatting
- **Business logic clarity**: Service layer makes domain logic explicit

### Architectural Improvements
- **Layer separation**: Clear boundaries between HTTP, business logic, data access
- **Dependency direction**: Routes → Controllers → Services → Models (one-way)
- **Testing pyramid**: Easy to test services without spinning up Express

---

## 10. Estimated Effort

- **Phase 1-2 (Utilities)**: 1-2 hours
- **Phase 3 (Service)**: 1-2 hours
- **Phase 4 (Controller)**: 1 hour
- **Phase 5 (Route refactor)**: 30 minutes
- **Phase 6 (Testing)**: 2-3 hours
- **Total**: 6-9 hours

---

## 11. Success Criteria

The refactor is complete when:
1. Route file is ≤15 LOC with only route definitions
2. All logic moved to appropriate layers (controller/service/utils)
3. All `db()` calls replaced with `GoogleAccountModel` methods
4. All existing tests pass
5. New unit tests cover validation, response formatting, and service logic
6. API behavior is identical (same responses, same errors, same status codes)
7. TypeScript compilation succeeds with no errors
8. Code review approved by senior engineer
