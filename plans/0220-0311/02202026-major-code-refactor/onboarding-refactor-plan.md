# Onboarding Route Refactor Plan

## Problem Statement

The onboarding route file (`signalsai-backend/src/routes/onboarding.ts`) currently contains 452 lines with mixed responsibilities: route definitions, business logic, database access, validation, error handling, and helper utilities. This violates separation of concerns and makes the code difficult to test, maintain, and extend.

**Current Issues:**
- Direct database calls (`db()`) scattered throughout route handlers
- Business logic embedded in route handlers
- No clear service layer for complex operations (organization creation transaction)
- Helper functions mixed with route definitions
- Difficult to unit test without HTTP layer
- Validation logic inline with route handlers
- Error handling duplicated across endpoints

**Goal:**
Refactor into a clean architecture with routes → controllers → services → models, following established patterns in the codebase.

---

## Current State Analysis

### File Statistics
- **File:** `signalsai-backend/src/routes/onboarding.ts`
- **LOC:** 452 lines
- **Endpoints:** 7
- **Direct db() calls:** 11
- **Helper functions:** 3 (getAccountIdFromHeader, handleError, buildAuthHeaders)
- **Transaction blocks:** 1 (complex organization creation logic)

### Endpoint Inventory

| Method | Path | Purpose | LOC | DB Calls | Complexity |
|--------|------|---------|-----|----------|------------|
| GET | `/status` | Check onboarding completion status | ~40 | 1 | Low |
| POST | `/save-properties` | Save profile + create/update org + complete onboarding | ~115 | 3 (in transaction) | High |
| GET | `/wizard/status` | Check product tour wizard status | ~30 | 1 | Low |
| PUT | `/wizard/complete` | Mark product tour as completed | ~25 | 1 | Low |
| POST | `/wizard/restart` | Reset product tour completion flag | ~25 | 1 | Low |
| GET | `/setup-progress` | Get setup wizard progress JSON | ~50 | 1 | Medium |
| PUT | `/setup-progress` | Update setup wizard progress JSON | ~45 | 1 | Medium |

### Dependencies

**External:**
- `express` - routing framework
- `googleapis` - (imported but unused in handlers)
- `axios` - (imported but unused in handlers)
- `@googleapis/mybusinessaccountmanagement` - (imported but unused)
- `@googleapis/mybusinessbusinessinformation` - (imported but unused)

**Internal:**
- `../middleware/tokenRefresh` - AuthenticatedRequest type, tokenRefreshMiddleware
- `../database/connection` - db() Knex instance

**Models Available (not currently used):**
- `GoogleAccountModel` - findById, updateById, create
- `OrganizationModel` - findById, create, updateById
- `OrganizationUserModel` - create, findByUserAndOrg

### Key Business Logic

**1. Profile Completion + Organization Creation (save-properties)**
Complex transaction handling:
- Fetch existing google account
- Check if organization exists
- If no org: create organization + link user as admin
- If org exists: update org name/domain
- Update google account profile fields + mark onboarding_completed = true

**2. Setup Progress Management**
- JSON field parsing/serialization
- Default value merging
- Error handling for malformed JSON

**3. Wizard State Management**
- Boolean flag management for onboarding_wizard_completed
- Simple CRUD operations

---

## Target Architecture

### Directory Structure
```
src/
├── routes/
│   └── onboarding.ts                    [~50 LOC - route definitions only]
├── controllers/
│   └── onboarding/
│       ├── OnboardingController.ts      [~200 LOC - orchestration layer]
│       ├── feature-services/
│       │   ├── ProfileCompletionService.ts  [~120 LOC - transaction logic]
│       │   ├── WizardStatusService.ts       [~80 LOC - wizard state mgmt]
│       │   └── SetupProgressService.ts      [~100 LOC - JSON progress mgmt]
│       └── feature-utils/
│           ├── onboardingValidation.ts      [~60 LOC - validation schemas]
│           └── onboardingHelpers.ts         [~40 LOC - helper functions]
└── models/
    ├── GoogleAccountModel.ts            [existing - may need new methods]
    ├── OrganizationModel.ts             [existing]
    └── OrganizationUserModel.ts         [existing]
```

### Layer Responsibilities

**Routes Layer** (`routes/onboarding.ts`):
- Route definitions only
- Middleware application
- Delegate to controller methods
- No business logic
- No direct database access

**Controller Layer** (`OnboardingController.ts`):
- Request/response handling
- Input extraction
- Call validation utilities
- Orchestrate service calls
- Format responses
- Handle errors with proper HTTP codes

**Service Layer** (`feature-services/`):
- Business logic orchestration
- Transaction management
- Call multiple models
- Enforce business rules
- Return domain objects (not HTTP responses)

**Utils Layer** (`feature-utils/`):
- Pure validation functions
- Helper utilities
- Request parsing helpers
- No database access
- No side effects

**Model Layer** (existing models):
- Database operations only
- CRUD abstractions
- Type-safe interfaces
- Transaction context support

---

## Detailed Mapping

### 1. GET /status → getOnboardingStatus

**Current Implementation:**
```typescript
// Lines 52-94: ~40 LOC
// - Parse googleAccountId from req or header
// - Validate presence
// - db("google_accounts").where().first()
// - Format response with profile fields
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.getOnboardingStatus()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> GoogleAccountModel.findById(id)
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition: `router.get("/status", controller.getOnboardingStatus)`
- `controllers/onboarding/OnboardingController.ts` - create method
- `feature-utils/onboardingHelpers.ts` - extractGoogleAccountId helper
- `models/GoogleAccountModel.ts` - use existing findById

**Database calls replaced:**
- `db("google_accounts").where({ id }).first()` → `GoogleAccountModel.findById(id)`

---

### 2. POST /save-properties → completeOnboarding

**Current Implementation:**
```typescript
// Lines 113-230: ~115 LOC
// - Parse googleAccountId
// - Extract & validate profile from req.body
// - db.transaction() with complex logic:
//   - Fetch google account
//   - Check organization_id
//   - If no org: create org + create org_user link
//   - If org exists: update org
//   - Update google account with profile + onboarding_completed
// - Log completion
// - Return formatted response
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.completeOnboarding()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> onboardingValidation.validateProfileData(req.body.profile)
      ├─> ProfileCompletionService.completeOnboardingWithProfile({
      │     googleAccountId,
      │     profileData
      │   })
      │   └─> (inside transaction)
      │       ├─> GoogleAccountModel.findById(id, trx)
      │       ├─> if (!orgId):
      │       │   ├─> OrganizationModel.create({...}, trx)
      │       │   └─> OrganizationUserModel.create({...}, trx)
      │       ├─> else:
      │       │   └─> OrganizationModel.updateById(orgId, {...}, trx)
      │       └─> GoogleAccountModel.updateById(id, {...}, trx)
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - completeOnboarding method
- `feature-services/ProfileCompletionService.ts` - NEW complex transaction logic
- `feature-utils/onboardingValidation.ts` - NEW validateProfileData
- `models/GoogleAccountModel.ts` - may need updateProfile helper method
- `models/OrganizationModel.ts` - existing methods sufficient
- `models/OrganizationUserModel.ts` - existing methods sufficient

**Database calls replaced:**
```typescript
// Before:
db.transaction(async (trx) => {
  await trx("google_accounts").where().first()
  await trx("organizations").insert().returning("id")
  await trx("organization_users").insert()
  await trx("organizations").where().update()
  await trx("google_accounts").where().update()
})

// After:
await ProfileCompletionService.completeOnboardingWithProfile({
  // Uses GoogleAccountModel, OrganizationModel, OrganizationUserModel
  // All with transaction context
})
```

---

### 3. GET /wizard/status → getWizardStatus

**Current Implementation:**
```typescript
// Lines 237-267: ~30 LOC
// - Parse googleAccountId
// - db("google_accounts").where().first()
// - Return onboarding_wizard_completed boolean
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.getWizardStatus()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> WizardStatusService.getWizardStatus(googleAccountId)
      │   └─> GoogleAccountModel.findById(id)
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - getWizardStatus method
- `feature-services/WizardStatusService.ts` - NEW service for wizard operations
- `models/GoogleAccountModel.ts` - use existing findById

**Database calls replaced:**
- `db("google_accounts").where({ id }).first()` → `GoogleAccountModel.findById(id)`

---

### 4. PUT /wizard/complete → completeWizard

**Current Implementation:**
```typescript
// Lines 274-304: ~25 LOC
// - Parse googleAccountId
// - db("google_accounts").where().update({ onboarding_wizard_completed: true })
// - Return success response
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.completeWizard()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> WizardStatusService.markWizardComplete(googleAccountId)
      │   └─> GoogleAccountModel.updateById(id, { onboarding_wizard_completed: true })
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - completeWizard method
- `feature-services/WizardStatusService.ts` - markWizardComplete method
- `models/GoogleAccountModel.ts` - use existing updateById

**Database calls replaced:**
- `db("google_accounts").where().update()` → `GoogleAccountModel.updateById(id, data)`

---

### 5. POST /wizard/restart → restartWizard

**Current Implementation:**
```typescript
// Lines 311-341: ~25 LOC
// - Parse googleAccountId
// - db("google_accounts").where().update({ onboarding_wizard_completed: false })
// - Return success response
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.restartWizard()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> WizardStatusService.resetWizard(googleAccountId)
      │   └─> GoogleAccountModel.updateById(id, { onboarding_wizard_completed: false })
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - restartWizard method
- `feature-services/WizardStatusService.ts` - resetWizard method
- `models/GoogleAccountModel.ts` - use existing updateById

**Database calls replaced:**
- `db("google_accounts").where().update()` → `GoogleAccountModel.updateById(id, data)`

---

### 6. GET /setup-progress → getSetupProgress

**Current Implementation:**
```typescript
// Lines 348-403: ~50 LOC
// - Parse googleAccountId
// - db("google_accounts").where().first()
// - Handle JSON parsing of setup_progress field
// - Merge with default values
// - Error handling for parse failures
// - Return formatted response
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.getSetupProgress()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> SetupProgressService.getSetupProgress(googleAccountId)
      │   ├─> GoogleAccountModel.findById(id)
      │   └─> Parse/merge with defaults (handled by model jsonFields)
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - getSetupProgress method
- `feature-services/SetupProgressService.ts` - NEW service for progress operations
- `models/GoogleAccountModel.ts` - already has setup_progress as jsonField (auto-parses)

**Database calls replaced:**
- `db("google_accounts").where().first()` → `GoogleAccountModel.findById(id)`
- JSON parsing handled by BaseModel jsonFields deserialization

**Note:** GoogleAccountModel already declares `setup_progress` in jsonFields array, so BaseModel handles serialization/deserialization automatically.

---

### 7. PUT /setup-progress → updateSetupProgress

**Current Implementation:**
```typescript
// Lines 410-450: ~45 LOC
// - Parse googleAccountId
// - Extract progress from req.body
// - Validate progress object exists
// - db("google_accounts").where().update({ setup_progress: JSON.stringify(progress) })
// - Return success response
```

**New Architecture:**
```
Route (onboarding.ts)
  ├─> OnboardingController.updateSetupProgress()
      ├─> onboardingHelpers.extractGoogleAccountId(req)
      ├─> onboardingValidation.validateProgressData(req.body.progress)
      ├─> SetupProgressService.updateSetupProgress(googleAccountId, progressData)
      │   └─> GoogleAccountModel.updateById(id, { setup_progress: progressData })
      │       └─> BaseModel auto-serializes JSON field
      └─> Format response
```

**Files to modify/create:**
- `routes/onboarding.ts` - route definition
- `controllers/onboarding/OnboardingController.ts` - updateSetupProgress method
- `feature-services/SetupProgressService.ts` - updateSetupProgress method
- `feature-utils/onboardingValidation.ts` - validateProgressData
- `models/GoogleAccountModel.ts` - use existing updateById (jsonFields auto-serializes)

**Database calls replaced:**
- `db("google_accounts").where().update()` → `GoogleAccountModel.updateById(id, data)`
- JSON.stringify handled by BaseModel jsonFields serialization

---

### Helper Functions Migration

**Current Helpers:**

1. **getAccountIdFromHeader** (lines 17-22)
   - Move to: `feature-utils/onboardingHelpers.ts` as `extractGoogleAccountId(req)`
   - Enhanced version that checks both `req.googleAccountId` and header

2. **handleError** (lines 27-35)
   - Move to: `OnboardingController.ts` as private method
   - Or generalize to shared error handler utility

3. **buildAuthHeaders** (lines 40-45)
   - **UNUSED** - imported googleapis but never used in any endpoint
   - Delete this function during refactor

**Unused Imports to Remove:**
- `google` from googleapis
- `axios`
- `mybusinessaccountmanagement_v1`
- `mybusinessbusinessinformation_v1`

These were likely left over from earlier implementation or copied from another route file.

---

## Model Method Requirements

### GoogleAccountModel.ts

**Existing methods (sufficient):**
- ✅ `findById(id, trx?)` - used by all endpoints
- ✅ `updateById(id, data, trx?)` - used for profile/wizard/progress updates
- ✅ `create(data, trx?)` - not used in onboarding, but exists

**Optional additions:**
- `updateOnboardingStatus(id, completed: boolean, trx?)` - convenience wrapper
- `updateProfile(id, profileData, trx?)` - type-safe profile update

**Verdict:** Existing methods are sufficient. Optional convenience methods can be added later if duplication emerges.

---

### OrganizationModel.ts

**Existing methods (sufficient):**
- ✅ `findById(id, trx?)` - used to check existing org
- ✅ `create(data, trx?)` - used for new org creation
- ✅ `updateById(id, data, trx?)` - used for updating org name/domain

**Verdict:** Existing methods are sufficient.

---

### OrganizationUserModel.ts

**Existing methods (sufficient):**
- ✅ `create(data, trx?)` - used to link user to org as admin
- ✅ `findByUserAndOrg(userId, orgId, trx?)` - could be used to check existing link

**Verdict:** Existing methods are sufficient.

---

## Step-by-Step Migration

### Phase 1: Preparation (No Breaking Changes)

**Step 1.1: Create directory structure**
```bash
mkdir -p src/controllers/onboarding/feature-services
mkdir -p src/controllers/onboarding/feature-utils
```

**Step 1.2: Create utility files**
- Create `feature-utils/onboardingHelpers.ts`
  - Export `extractGoogleAccountId(req: AuthenticatedRequest): number`
  - Implement logic from current getAccountIdFromHeader
  - Throw error if missing (controller will catch)

- Create `feature-utils/onboardingValidation.ts`
  - Export `validateProfileData(profile: any): ProfileData`
  - Export `validateProgressData(progress: any): SetupProgress`
  - Implement validation logic from inline checks
  - Throw descriptive errors for missing fields

**Step 1.3: Create service files**
- Create `feature-services/WizardStatusService.ts`
  - Implement `getWizardStatus(googleAccountId)`
  - Implement `markWizardComplete(googleAccountId)`
  - Implement `resetWizard(googleAccountId)`
  - Use GoogleAccountModel internally

- Create `feature-services/SetupProgressService.ts`
  - Implement `getSetupProgress(googleAccountId)`
  - Implement `updateSetupProgress(googleAccountId, progressData)`
  - Handle default values merging
  - Use GoogleAccountModel internally

- Create `feature-services/ProfileCompletionService.ts`
  - Implement `completeOnboardingWithProfile(params)`
  - Encapsulate entire transaction logic
  - Use GoogleAccountModel, OrganizationModel, OrganizationUserModel
  - Accept transaction context from outside or create internally

**Step 1.4: Create controller**
- Create `controllers/onboarding/OnboardingController.ts`
  - Implement all 7 controller methods
  - Import and use services
  - Handle errors with proper HTTP status codes
  - Format consistent response shapes

**Step 1.5: Write tests**
- Unit tests for services (mock models)
- Unit tests for controller (mock services)
- Integration tests for full flow (use test database)

---

### Phase 2: Route Migration (Breaking Change)

**Step 2.1: Update routes file**
- Import OnboardingController
- Instantiate controller instance
- Replace inline handlers with `controller.methodName` references
- Keep middleware in place (tokenRefreshMiddleware where needed)

**Before:**
```typescript
onboardingRoutes.get("/status", async (req, res) => {
  // 40 lines of implementation
});
```

**After:**
```typescript
const controller = new OnboardingController();
onboardingRoutes.get("/status", (req, res) => controller.getOnboardingStatus(req, res));
```

**Step 2.2: Remove old code**
- Delete getAccountIdFromHeader helper
- Delete handleError helper
- Delete buildAuthHeaders (unused)
- Remove unused imports (googleapis, axios, etc.)

**Step 2.3: Verify**
- All tests pass
- API responses unchanged
- Error handling preserved
- Logging maintained

---

### Phase 3: Cleanup & Documentation

**Step 3.1: Add JSDoc comments**
- Document all controller methods
- Document all service methods
- Document validation schemas

**Step 3.2: Update types**
- Create interface for ProfileData
- Create interface for SetupProgress
- Export from appropriate files

**Step 3.3: Logging improvements**
- Add structured logging in services
- Include request context where helpful
- Maintain existing console.log for onboarding completion

**Step 3.4: Error handling audit**
- Ensure all errors have proper messages
- Verify HTTP status codes are appropriate
- Add error codes for frontend consumption

---

## Files to Create

### 1. `src/controllers/onboarding/OnboardingController.ts`
**Purpose:** Central controller orchestrating all onboarding operations
**LOC estimate:** ~200 lines
**Methods:**
- `getOnboardingStatus(req, res)`
- `completeOnboarding(req, res)`
- `getWizardStatus(req, res)`
- `completeWizard(req, res)`
- `restartWizard(req, res)`
- `getSetupProgress(req, res)`
- `updateSetupProgress(req, res)`
- Private: `handleError(res, error, operation)`

**Imports:**
```typescript
import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { extractGoogleAccountId } from "./feature-utils/onboardingHelpers";
import { validateProfileData, validateProgressData } from "./feature-utils/onboardingValidation";
import { ProfileCompletionService } from "./feature-services/ProfileCompletionService";
import { WizardStatusService } from "./feature-services/WizardStatusService";
import { SetupProgressService } from "./feature-services/SetupProgressService";
```

---

### 2. `src/controllers/onboarding/feature-services/ProfileCompletionService.ts`
**Purpose:** Complex transaction logic for profile + org creation
**LOC estimate:** ~120 lines
**Methods:**
- `completeOnboardingWithProfile(params: { googleAccountId: number, profileData: ProfileData })`

**Imports:**
```typescript
import { db } from "../../../database/connection";
import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
```

**Key logic:**
- Start transaction
- Fetch google account
- Check/create organization
- Link user if new org
- Update google account profile
- Commit transaction
- Return updated account data

---

### 3. `src/controllers/onboarding/feature-services/WizardStatusService.ts`
**Purpose:** Manage product tour wizard completion state
**LOC estimate:** ~80 lines
**Methods:**
- `getWizardStatus(googleAccountId: number): Promise<boolean>`
- `markWizardComplete(googleAccountId: number): Promise<void>`
- `resetWizard(googleAccountId: number): Promise<void>`

**Imports:**
```typescript
import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
```

---

### 4. `src/controllers/onboarding/feature-services/SetupProgressService.ts`
**Purpose:** Manage setup wizard progress JSON state
**LOC estimate:** ~100 lines
**Methods:**
- `getSetupProgress(googleAccountId: number): Promise<SetupProgress>`
- `updateSetupProgress(googleAccountId: number, progress: SetupProgress): Promise<void>`

**Imports:**
```typescript
import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
```

**Types:**
```typescript
export interface SetupProgress {
  step1_api_connected: boolean;
  step2_pms_uploaded: boolean;
  dismissed: boolean;
  completed: boolean;
}
```

**Key logic:**
- Fetch account (model auto-parses JSON)
- Merge with defaults
- Return/update typed progress object

---

### 5. `src/controllers/onboarding/feature-utils/onboardingValidation.ts`
**Purpose:** Pure validation functions for request data
**LOC estimate:** ~60 lines
**Functions:**
- `validateProfileData(profile: any): ProfileData`
- `validateProgressData(progress: any): SetupProgress`

**Types:**
```typescript
export interface ProfileData {
  firstName: string;
  lastName: string;
  phone: string;
  practiceName: string;
  operationalJurisdiction: string;
  domainName: string;
}
```

**Validation rules:**
- All profile fields required (throw descriptive error)
- Progress object required (throw descriptive error)
- Type checking (string vs number)

---

### 6. `src/controllers/onboarding/feature-utils/onboardingHelpers.ts`
**Purpose:** Helper utilities for request parsing
**LOC estimate:** ~40 lines
**Functions:**
- `extractGoogleAccountId(req: AuthenticatedRequest): number`

**Logic:**
```typescript
export function extractGoogleAccountId(req: AuthenticatedRequest): number {
  const fromMiddleware = req.googleAccountId;
  if (fromMiddleware) return fromMiddleware;

  const fromHeader = req.headers["x-google-account-id"];
  if (!fromHeader) {
    throw new Error("Missing google account ID");
  }

  const id = parseInt(fromHeader as string, 10);
  if (isNaN(id)) {
    throw new Error("Invalid google account ID format");
  }

  return id;
}
```

---

## Files to Modify

### 1. `src/routes/onboarding.ts`
**Changes:**
- Replace inline handlers with controller method calls
- Remove all business logic
- Remove helper functions
- Remove unused imports (googleapis, axios, etc.)
- Keep middleware applications
- Keep route structure unchanged

**Before:** 452 lines
**After:** ~50 lines

**Structure:**
```typescript
import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import { OnboardingController } from "../controllers/onboarding/OnboardingController";

const onboardingRoutes = express.Router();
const controller = new OnboardingController();

onboardingRoutes.get("/status", (req, res) => controller.getOnboardingStatus(req, res));
onboardingRoutes.post("/save-properties", (req, res) => controller.completeOnboarding(req, res));
onboardingRoutes.get("/wizard/status", (req, res) => controller.getWizardStatus(req, res));
onboardingRoutes.put("/wizard/complete", (req, res) => controller.completeWizard(req, res));
onboardingRoutes.post("/wizard/restart", (req, res) => controller.restartWizard(req, res));
onboardingRoutes.get("/setup-progress", (req, res) => controller.getSetupProgress(req, res));
onboardingRoutes.put("/setup-progress", (req, res) => controller.updateSetupProgress(req, res));

export default onboardingRoutes;
```

---

### 2. `src/models/GoogleAccountModel.ts` (Optional)
**Changes:**
- No changes required for MVP
- Optional: Add convenience methods if duplication emerges later

**Potential additions:**
```typescript
static async updateOnboardingStatus(
  id: number,
  completed: boolean,
  trx?: QueryContext
): Promise<number> {
  return this.updateById(id, { onboarding_completed: completed }, trx);
}

static async updateProfile(
  id: number,
  profile: {
    first_name: string;
    last_name: string;
    phone: string;
    practice_name: string;
    operational_jurisdiction: string;
    domain_name: string;
  },
  trx?: QueryContext
): Promise<number> {
  return this.updateById(id, profile, trx);
}
```

**Recommendation:** Skip these for initial refactor. Add only if controller code becomes repetitive.

---

## Risk Assessment

### High Risk

**1. Transaction logic correctness**
- **Risk:** ProfileCompletionService transaction must preserve exact behavior
- **Mitigation:**
  - Copy transaction logic verbatim
  - Extensive integration tests covering all branches
  - Test rollback scenarios (org creation fails, user link fails)
  - Manual testing of onboarding flow in staging

**2. JSON field serialization**
- **Risk:** setup_progress parsing/stringifying must work correctly
- **Mitigation:**
  - GoogleAccountModel already handles this via jsonFields
  - Test with malformed JSON in database
  - Test null values
  - Test default value merging

**3. Error response format changes**
- **Risk:** Frontend depends on specific error structure
- **Mitigation:**
  - Controller must preserve exact error response format
  - Test error cases explicitly
  - Compare API responses before/after with integration tests

---

### Medium Risk

**1. Header vs middleware account ID extraction**
- **Risk:** Misunderstanding when googleAccountId comes from middleware vs header
- **Mitigation:**
  - extractGoogleAccountId helper handles both cases
  - Comment explains middleware not always applied
  - Test both paths

**2. Organization creation race condition**
- **Risk:** Concurrent requests might try to create org twice
- **Current behavior:** Transaction + unique constraints prevent duplicates
- **Mitigation:**
  - Preserve transaction isolation
  - Test concurrent requests
  - Document behavior in service comments

**3. Import path changes**
- **Risk:** Breaking imports when moving code
- **Mitigation:**
  - Use absolute imports from src/ root
  - TypeScript compiler will catch broken imports
  - Test build before deploying

---

### Low Risk

**1. Logging changes**
- **Risk:** Losing important log messages
- **Mitigation:**
  - Preserve existing console.log statements
  - Add structured logging in services
  - Verify logs in development

**2. Unused code removal**
- **Risk:** Deleting code that's actually used elsewhere
- **Mitigation:**
  - buildAuthHeaders is confirmed unused (no calls in file)
  - googleapis imports are confirmed unused (no API calls)
  - Search codebase for references before deleting

**3. Response format consistency**
- **Risk:** Slight differences in response shape
- **Mitigation:**
  - Controller explicitly formats responses to match current structure
  - Integration tests verify response schemas
  - TypeScript interfaces enforce consistency

---

## Blast Radius Analysis

### Direct Impact
- **Onboarding endpoints:** All 7 endpoints will be refactored
- **Frontend:** No changes required (API contract unchanged)
- **Database:** No schema changes
- **Auth flow:** No changes (middleware stays in place)

### Indirect Impact
- **Other routes:** None (isolated to onboarding.ts)
- **Shared models:** Used by other routes, but existing methods unchanged
- **Middleware:** No changes to tokenRefreshMiddleware
- **Tests:** Existing integration tests should continue passing

### Rollback Plan
- Keep original `onboarding.ts` as `onboarding.ts.backup`
- If issues arise, restore backup file
- Git revert commit
- No database migration needed (no schema changes)

---

## Definition of Done

### Code Quality
- ✅ All business logic moved to services
- ✅ All validation moved to utils
- ✅ Routes file < 60 lines
- ✅ No direct db() calls in routes
- ✅ No direct db() calls in controllers
- ✅ All models used for database access
- ✅ TypeScript strict mode passes
- ✅ ESLint passes with no warnings
- ✅ No unused imports

### Testing
- ✅ Unit tests for all service methods (>80% coverage)
- ✅ Unit tests for validation functions (100% coverage)
- ✅ Integration tests for all 7 endpoints pass
- ✅ Transaction rollback tests pass
- ✅ Error handling tests pass
- ✅ JSON parsing edge cases tested

### Documentation
- ✅ JSDoc comments on all public methods
- ✅ Interface/type exports documented
- ✅ Transaction logic commented
- ✅ README updated with new architecture

### Operational
- ✅ All existing functionality preserved
- ✅ API responses unchanged
- ✅ Error messages unchanged
- ✅ Logging maintained
- ✅ Performance unchanged (transaction behavior preserved)
- ✅ Deployed to staging and manually tested
- ✅ All integration tests pass in CI

---

## Performance Considerations

### Database Query Impact
- **No change:** Same queries executed, just moved to models
- **Transaction behavior:** Preserved exactly (ProfileCompletionService)
- **Connection pooling:** No impact (models use same db() instance)

### Memory Impact
- **Minimal:** Service instances are lightweight
- **Controller instance:** Stateless, can be reused
- **No caching:** Services fetch fresh data each time (same as current)

### Potential Optimizations (Post-Refactor)
- Add caching for wizard status queries
- Batch organization checks if needed
- Add database indexes if slow queries emerge

**Recommendation:** Profile performance before and after refactor. No optimization needed for MVP.

---

## Security Considerations

### Authentication
- **No change:** Middleware still enforces token validation
- **Account ID extraction:** Still validates format and presence
- **Error messages:** Don't leak sensitive data

### Authorization
- **Current:** No authorization checks (user can only see own data via googleAccountId)
- **Maintained:** Services still use googleAccountId from authenticated request
- **No elevation:** Cannot access other users' data

### Input Validation
- **Improved:** Centralized validation in onboardingValidation.ts
- **SQL injection:** Protected by models using parameterized queries
- **XSS:** Response data is JSON (no HTML rendering)

### Data Exposure
- **No change:** Same fields returned in responses
- **Secrets:** No token/password data exposed
- **Logging:** Preserve same logging (no sensitive data logged)

---

## Migration Timeline

### Estimated Effort
- **Phase 1 (Preparation):** 6-8 hours
  - Create directory structure: 15 min
  - Write utils: 1 hour
  - Write services: 3-4 hours
  - Write controller: 1.5-2 hours
  - Write tests: 1.5-2 hours

- **Phase 2 (Migration):** 2-3 hours
  - Update routes: 30 min
  - Remove old code: 15 min
  - Fix imports: 15 min
  - Run tests & fix issues: 1.5-2 hours

- **Phase 3 (Cleanup):** 1-2 hours
  - Add JSDoc: 30 min
  - Update types: 30 min
  - Improve logging: 30 min
  - Final review: 30 min

**Total:** 9-13 hours

### Rollout Strategy
1. Develop in feature branch: `refactor/onboarding-route-architecture`
2. Code review with at least one other engineer
3. Deploy to staging environment
4. Manual QA of all 7 endpoints
5. Monitor staging for 24 hours
6. Deploy to production during low-traffic window
7. Monitor error rates & response times for 48 hours
8. If issues: rollback immediately using backup file

---

## Success Metrics

### Code Quality Metrics
- Lines of code in routes file: **452 → ~50** (89% reduction)
- Number of files: **1 → 7** (improved separation of concerns)
- Test coverage: **current → >80%** for services
- Cyclomatic complexity: Reduced (smaller functions)

### Operational Metrics
- API response times: No regression (±5ms acceptable)
- Error rate: No increase
- Database query count: Unchanged
- Transaction rollback rate: Unchanged

### Maintainability Metrics
- Time to add new onboarding step: Faster (clear service pattern)
- Time to debug issues: Faster (isolated layers)
- Onboarding for new engineers: Easier (standard architecture)

---

## Alternatives Considered

### Alternative 1: Keep everything in routes file
**Pros:** No refactor needed, faster short-term
**Cons:** Technical debt accumulates, hard to test, hard to extend
**Verdict:** Rejected - not sustainable

### Alternative 2: Move to single OnboardingService
**Pros:** Simpler than 3 separate services
**Cons:** God object anti-pattern, less focused
**Verdict:** Rejected - violates single responsibility

### Alternative 3: Use class-based controllers with decorators
**Pros:** Modern pattern (NestJS-style)
**Cons:** Requires additional framework, over-engineered for this codebase
**Verdict:** Rejected - keep it simple

### Alternative 4: Keep db() calls, just move to controller
**Pros:** Smaller refactor
**Cons:** Still couples controller to database implementation
**Verdict:** Rejected - incomplete separation of concerns

**Chosen Approach:** Routes → Controller → Services → Models
**Rationale:** Industry standard, testable, maintainable, aligns with existing model patterns

---

## Open Questions

### 1. Error handling standardization
**Question:** Should we create a shared ErrorHandler utility for all controllers?
**Current state:** Each route has handleError helper with similar logic
**Recommendation:** Create `src/utils/errorHandler.ts` in follow-up refactor

### 2. Response formatting
**Question:** Should we standardize success/error response shapes across all routes?
**Current state:** Inconsistent shapes (some use `success`, some use `data`, etc.)
**Recommendation:** Create ResponseFormatter utility in follow-up refactor

### 3. Validation library
**Question:** Should we adopt a validation library (Zod, Joi, etc.)?
**Current state:** Manual validation in inline code
**Recommendation:** Add Zod in follow-up refactor for all routes

### 4. Logging library
**Question:** Should we adopt structured logging (Winston, Pino)?
**Current state:** console.log scattered throughout
**Recommendation:** Add structured logging in follow-up refactor

**For this refactor:** Keep current patterns. Don't introduce new libraries. Focus on architectural separation.

---

## Appendix: Full Database Call Inventory

| Line | Current Code | New Code |
|------|-------------|----------|
| 64 | `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.findById(id)` |
| 155 | `trx("google_accounts").where({ id }).first()` | `GoogleAccountModel.findById(id, trx)` |
| 167 | `trx("organizations").insert({...}).returning("id")` | `OrganizationModel.create({...}, trx)` |
| 180 | `trx("organization_users").insert({...})` | `OrganizationUserModel.create({...}, trx)` |
| 189 | `trx("organizations").where({ id }).update({...})` | `OrganizationModel.updateById(id, {...}, trx)` |
| 197 | `trx("google_accounts").where({ id }).update({...})` | `GoogleAccountModel.updateById(id, {...}, trx)` |
| 249 | `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.findById(id)` |
| 289 | `db("google_accounts").where({ id }).update({...})` | `GoogleAccountModel.updateById(id, {...})` |
| 327 | `db("google_accounts").where({ id }).update({...})` | `GoogleAccountModel.updateById(id, {...})` |
| 363 | `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.findById(id)` |
| 435 | `db("google_accounts").where({ id }).update({...})` | `GoogleAccountModel.updateById(id, {...})` |

**Total replacements:** 11 database calls → 11 model method calls

---

## Conclusion

This refactor will transform the onboarding route from a 452-line monolithic file into a clean, layered architecture with clear separation of concerns. By moving business logic to services, validation to utils, and database access to models, we'll achieve:

- **Testability:** Unit test each layer independently
- **Maintainability:** Clear boundaries make changes safer
- **Consistency:** Aligns with emerging patterns in codebase
- **Scalability:** Easy to add new onboarding steps

The migration is low-risk because:
- No API contract changes (frontend unaffected)
- No database schema changes
- Existing integration tests will catch regressions
- Straightforward rollback plan

This sets the pattern for refactoring other route files and moves the codebase toward a more professional, production-grade architecture.
