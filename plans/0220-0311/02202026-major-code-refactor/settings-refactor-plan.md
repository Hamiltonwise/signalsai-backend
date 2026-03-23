# Settings Route Refactor Plan

## Executive Summary

**Scope:** Refactor `signalsai-backend/src/routes/settings.ts` from a 712-line monolithic route file into a clean layered architecture with clear separation between routes, controllers, services, and models.

**Blast Radius:** Medium
- 10 endpoints affected
- No breaking API changes (route signatures preserved)
- Internal architecture change only
- Affects user profile, scopes, properties, and user management features

**Estimated LOC Migration:** 712 lines → distributed across ~8-10 files

---

## 1. Current State Analysis

### 1.1 File Overview
- **File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/settings.ts`
- **Lines of Code:** 712
- **Endpoints:** 10 total
- **Dependencies:**
  - Database: Direct `db()` calls (22 instances)
  - Models: None (should use GoogleAccountModel, UserModel, OrganizationUserModel, InvitationModel, OrganizationModel)
  - Middleware: `tokenRefreshMiddleware`, `rbacMiddleware`, `requireRole`, `canManageRoles`
  - External Services: `sendInvitation` from mail service
  - Google APIs: `google.analyticsadmin`, `google.searchconsole`, `mybusinessaccountmanagement`, `mybusinessbusinessinformation`
  - Utilities: `crypto` for token generation

### 1.2 Endpoint Inventory

#### User Profile & Role (1 endpoint)
1. **GET /api/settings/me** (Lines 42-75, ~33 LOC)
   - Purpose: Get current user profile and role
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`
   - DB Calls: 2 (google_accounts, users)
   - Logic: Profile retrieval with role information

#### Scopes Management (2 endpoints)
2. **GET /api/settings/scopes** (Lines 94-182, ~88 LOC)
   - Purpose: Check which OAuth scopes user has granted
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`
   - DB Calls: 1 (google_accounts)
   - Logic: Complex scope parsing and validation logic
   - Complexity: High (scope parsing, normalization, checking)

#### Properties Management (3 endpoints)
3. **GET /api/settings/properties** (Lines 192-239, ~47 LOC)
   - Purpose: Fetch connected properties for organization
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`
   - DB Calls: 1 (google_accounts)
   - Logic: Property retrieval and JSON parsing

4. **POST /api/settings/properties/update** (Lines 245-311, ~66 LOC)
   - Purpose: Update connected properties (connect/disconnect)
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`, `requireRole("admin")`
   - DB Calls: 2 (google_accounts read + update)
   - Logic: Complex property update logic for ga4/gsc/gbp types

5. **GET /api/settings/properties/available/:type** (Lines 318-416, ~98 LOC)
   - Purpose: Fetch available properties from Google APIs
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`
   - DB Calls: 0
   - Logic: Complex Google API integration for ga4/gsc/gbp
   - External: Multiple Google API calls

#### User Management (4 endpoints)
6. **GET /api/settings/users** (Lines 426-471, ~45 LOC)
   - Purpose: List users in organization with invitations
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`
   - DB Calls: 3 (google_accounts, organization_users join users, invitations)
   - Logic: User and invitation listing

7. **POST /api/settings/users/invite** (Lines 477-583, ~106 LOC)
   - Purpose: Invite new user to organization
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`, `requireRole("admin", "manager")`
   - DB Calls: 5 (google_accounts, organization_users join, invitations check, invitations insert, organizations)
   - Logic: Complex validation, invitation creation, email sending
   - External: Mail service integration

8. **DELETE /api/settings/users/:userId** (Lines 589-642, ~53 LOC)
   - Purpose: Remove user from organization
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`, `requireRole("admin")`
   - DB Calls: 3 (google_accounts, organization_users check, organization_users delete)
   - Logic: Permission checks, self-removal prevention

9. **PUT /api/settings/users/:userId/role** (Lines 649-710, ~61 LOC)
   - Purpose: Change user role (forces logout)
   - Auth: `tokenRefreshMiddleware`, `rbacMiddleware`, `requireRole("admin")`
   - DB Calls: 2 (google_accounts, organization_users update)
   - Logic: Role validation, self-update prevention

### 1.3 Helper Functions
- **handleError** (Lines 24-32): Generic error handler
  - Used: 10 times across all endpoints
  - Pattern: Consistent error response formatting

### 1.4 Constants
- **SCOPE_MAP** (Lines 84-88): OAuth scope definitions
  - Type: Configuration constant
  - Values: ga4, gsc, gbp scope URLs

### 1.5 Database Access Patterns

**Total db() calls: 22 instances**

#### google_accounts table (10 calls)
- Lines 49-51: SELECT by id (profile retrieval)
- Lines 106-108: SELECT by id (scopes check)
- Lines 205-207: SELECT by id (properties fetch)
- Lines 259-261: SELECT by id (properties update)
- Lines 295-300: UPDATE google_property_ids by id
- Lines 435-437: SELECT by id (users list)
- Lines 499-501: SELECT by id (invite user)
- Lines 604-606: SELECT by id (remove user)
- Lines 668-670: SELECT by id (update role)

#### users table (2 calls)
- Lines 57-59: SELECT by id (profile retrieval)
- Lines 446-455: JOIN with organization_users

#### organization_users table (6 calls)
- Lines 446-455: JOIN with users, SELECT by org_id (users list)
- Lines 510-516: JOIN with users, check membership
- Lines 616-618: SELECT by org_id and user_id (permission check)
- Lines 630-632: DELETE by org_id and user_id
- Lines 686-694: UPDATE role by org_id and user_id

#### invitations table (3 calls)
- Lines 458-460: SELECT pending by org_id
- Lines 525-531: SELECT pending by org_id and email
- Lines 544-553: INSERT invitation

#### organizations table (1 call)
- Lines 556-558: SELECT by id (get org name for email)

---

## 2. Target Architecture

### 2.1 Folder Structure

```
src/
├── routes/
│   └── settings.ts (SLIM - only route definitions)
│
├── controllers/
│   └── settings/
│       ├── SettingsController.ts (main controller)
│       ├── feature-services/
│       │   ├── service.profile.ts
│       │   ├── service.scopes.ts
│       │   ├── service.properties.ts
│       │   ├── service.user-management.ts
│       │   └── service.google-properties.ts
│       └── feature-utils/
│           ├── util.scope-parser.ts
│           ├── util.property-parser.ts
│           └── util.invitation-token.ts
│
└── models/
    ├── GoogleAccountModel.ts (already exists)
    ├── UserModel.ts (already exists)
    ├── OrganizationUserModel.ts (already exists)
    ├── InvitationModel.ts (already exists)
    └── OrganizationModel.ts (already exists)
```

### 2.2 Layer Responsibilities

#### Routes Layer (`routes/settings.ts`)
- **Only:** Express route definitions
- **Calls:** Controller methods
- **LOC Target:** ~100 lines
- **Contains:**
  - Route paths
  - HTTP methods
  - Middleware chains
  - Controller invocations
  - Zero business logic

#### Controller Layer (`controllers/settings/SettingsController.ts`)
- **Responsibility:** Request/response handling, orchestration
- **LOC Target:** ~150-200 lines
- **Contains:**
  - Request validation
  - Service orchestration
  - Response formatting
  - Error handling delegation
  - Zero database calls
  - Zero business logic

#### Service Layer (`controllers/settings/feature-services/`)
- **Responsibility:** Business logic, external integrations
- **LOC Target:** 50-150 lines per service
- **Contains:**
  - Business rules
  - Model orchestration
  - External API calls (Google APIs)
  - Email service integration
  - Complex validation logic
  - Zero database calls (delegates to models)

#### Utilities Layer (`controllers/settings/feature-utils/`)
- **Responsibility:** Pure functions, parsing, formatting
- **LOC Target:** 20-80 lines per utility
- **Contains:**
  - Scope parsing logic
  - Property JSON parsing
  - Token generation
  - Data transformation
  - Zero database calls
  - Zero external service calls

#### Model Layer (`models/`)
- **Responsibility:** Database access, data persistence
- **Already Exists:** 5 models available
- **Contains:**
  - All database queries
  - Data validation at persistence layer
  - Transaction management
  - Zero business logic

---

## 3. Detailed Migration Mapping

### 3.1 Controller Method Mapping

**SettingsController.ts will contain:**

```typescript
class SettingsController {
  // Profile & Role
  getUserProfile()        // GET /api/settings/me

  // Scopes
  getScopes()            // GET /api/settings/scopes

  // Properties
  getProperties()        // GET /api/settings/properties
  updateProperties()     // POST /api/settings/properties/update
  getAvailableProperties() // GET /api/settings/properties/available/:type

  // User Management
  listUsers()            // GET /api/settings/users
  inviteUser()           // POST /api/settings/users/invite
  removeUser()           // DELETE /api/settings/users/:userId
  updateUserRole()       // PUT /api/settings/users/:userId/role
}
```

### 3.2 Service Decomposition

#### service.profile.ts
**Purpose:** User profile operations
**Methods:**
- `getUserProfileWithRole(googleAccountId: number, userRole: string)`
  - **Migrates from:** Lines 47-70
  - **Calls models:**
    - `GoogleAccountModel.findById(googleAccountId)`
    - `UserModel.findById(googleAccount.user_id)`
  - **Returns:** User profile object with role

#### service.scopes.ts
**Purpose:** OAuth scope checking and validation
**Methods:**
- `getGrantedScopes(googleAccountId: number)`
  - **Migrates from:** Lines 98-177
  - **Calls models:**
    - `GoogleAccountModel.findById(googleAccountId)`
  - **Calls utils:**
    - `ScopeParser.parseScopes(googleAccount.scopes)`
    - `ScopeParser.checkScope(scopes, SCOPE_MAP.ga4)`
  - **Returns:** Scope status object

#### service.properties.ts
**Purpose:** Property management (connect/disconnect)
**Methods:**
- `getConnectedProperties(googleAccountId: number)`
  - **Migrates from:** Lines 196-234
  - **Calls models:**
    - `GoogleAccountModel.findByIdWithOrganization(googleAccountId)`
  - **Calls utils:**
    - `PropertyParser.parseProperties(googleAccount.google_property_ids)`
  - **Returns:** Properties object (ga4, gsc, gbp)

- `updateProperty(googleAccountId: number, type: string, data: any, action: string)`
  - **Migrates from:** Lines 250-306
  - **Calls models:**
    - `GoogleAccountModel.findById(googleAccountId)`
    - `GoogleAccountModel.updateProperties(googleAccountId, properties)`
  - **Calls utils:**
    - `PropertyParser.parseProperties()`
    - `PropertyParser.updatePropertyByType()`
  - **Returns:** Updated properties object

#### service.google-properties.ts
**Purpose:** Google API integration for fetching available properties
**Methods:**
- `fetchAvailableGA4Properties(oauth2Client)`
  - **Migrates from:** Lines 334-354
  - **External APIs:** google.analyticsadmin
  - **Returns:** Array of GA4 properties

- `fetchAvailableGSCProperties(oauth2Client)`
  - **Migrates from:** Lines 355-368
  - **External APIs:** google.searchconsole
  - **Returns:** Array of GSC sites

- `fetchAvailableGBPProperties(oauth2Client)`
  - **Migrates from:** Lines 369-403
  - **External APIs:** mybusinessaccountmanagement, mybusinessbusinessinformation
  - **Returns:** Array of GBP locations

- `getAvailablePropertiesByType(type: string, oauth2Client)`
  - **Migrates from:** Lines 322-411
  - **Orchestrates:** Calls appropriate fetch method based on type
  - **Returns:** Available properties array

#### service.user-management.ts
**Purpose:** User and invitation management
**Methods:**
- `listOrganizationUsers(googleAccountId: number)`
  - **Migrates from:** Lines 430-466
  - **Calls models:**
    - `GoogleAccountModel.findByIdWithOrganization(googleAccountId)`
    - `OrganizationUserModel.listByOrganization(orgId)`
    - `InvitationModel.listPending(orgId)`
  - **Returns:** Users and invitations arrays

- `inviteUserToOrganization(googleAccountId: number, email: string, role: string, inviterRole: string)`
  - **Migrates from:** Lines 482-578
  - **Validation:**
    - Manager cannot invite admin (line 492-496)
    - Email required (line 487-489)
  - **Calls models:**
    - `GoogleAccountModel.findByIdWithOrganization(googleAccountId)`
    - `OrganizationUserModel.findByEmail(orgId, email)`
    - `InvitationModel.findPending(orgId, email)`
    - `InvitationModel.create(invitation)`
    - `OrganizationModel.findById(orgId)`
  - **Calls utils:**
    - `InvitationTokenGenerator.generate()`
  - **External:**
    - `sendInvitation(email, organizationName, role)`
  - **Returns:** Success message

- `removeUserFromOrganization(googleAccountId: number, userIdToRemove: number, requesterId: number)`
  - **Migrates from:** Lines 594-637
  - **Validation:**
    - Cannot remove self (lines 624-627)
    - Only admin can remove (lines 616-622)
  - **Calls models:**
    - `GoogleAccountModel.findByIdWithOrganization(googleAccountId)`
    - `OrganizationUserModel.findByOrganizationAndUser(orgId, requesterId)`
    - `OrganizationUserModel.removeFromOrganization(orgId, userIdToRemove)`
  - **Returns:** Success message

- `updateUserRole(googleAccountId: number, userIdToUpdate: number, newRole: string, requesterId: number)`
  - **Migrates from:** Lines 654-705
  - **Validation:**
    - Role must be valid (lines 663-665)
    - Cannot change own role (lines 678-683)
  - **Calls models:**
    - `GoogleAccountModel.findByIdWithOrganization(googleAccountId)`
    - `OrganizationUserModel.updateRole(orgId, userIdToUpdate, newRole)`
  - **Returns:** Success message

### 3.3 Utility Functions

#### util.scope-parser.ts
**Purpose:** Parse and validate OAuth scopes
**Migrates from:** Lines 116-141 (scope parsing logic)
**Functions:**
- `parseScopes(scopeString: string): string[]`
  - Handles space-separated, comma-separated, single scope
  - Normalizes and trims
- `checkScope(grantedScopes: string[], requiredScope: string): boolean`
  - Returns whether scope is granted
- `getScopeStatus(grantedScopes: string[])`
  - Returns scope status object for ga4/gsc/gbp

**Constants:**
- `SCOPE_MAP` (migrates from lines 84-88)

#### util.property-parser.ts
**Purpose:** Parse and manipulate property JSON
**Migrates from:** Lines 220-229, 267-293
**Functions:**
- `parsePropertyIds(rawPropertyIds: string | object): PropertyIds`
  - Handles string JSON or object
  - Returns normalized property structure
- `updatePropertyByType(currentProperties: PropertyIds, type: string, data: any, action: string): PropertyIds`
  - Updates ga4/gsc/gbp based on action (connect/disconnect)
  - Returns updated properties

**Types:**
```typescript
interface PropertyIds {
  ga4: string | null;
  gsc: string | null;
  gbp: any[];
}
```

#### util.invitation-token.ts
**Purpose:** Generate invitation tokens
**Migrates from:** Lines 540-542
**Functions:**
- `generateToken(): string`
  - Uses crypto.randomBytes(32).toString("hex")
- `calculateExpiry(days: number): Date`
  - Returns expiry date (default 7 days)

### 3.4 Error Handling Migration

**Current:** `handleError()` helper (lines 24-32)
- Used 10 times across file
- Pattern: console.error + 500 response

**Target:** Centralized error handling
- Create: `controllers/settings/feature-utils/util.error-handler.ts`
- Migrate `handleError()` function
- Standardize error responses
- Add error type discrimination (validation errors, not found, auth errors)

**Enhanced error handling:**
```typescript
class SettingsErrorHandler {
  static handleError(res: Response, error: any, operation: string): Response
  static notFound(res: Response, resource: string): Response
  static forbidden(res: Response, message: string): Response
  static badRequest(res: Response, message: string): Response
  static unauthorized(res: Response): Response
}
```

---

## 4. Model Method Requirements

### 4.1 GoogleAccountModel Required Methods

**File:** `src/models/GoogleAccountModel.ts`

All methods should exist or need to be created:

1. `findById(id: number)`
   - Replaces: Lines 49-51, 106-108, 205-207, 259-261, 435-437, 499-501, 604-606, 668-670
   - Returns: GoogleAccount or null

2. `findByIdWithOrganization(id: number)`
   - Replaces: Lines 205-207 (and similar with organization check)
   - Returns: GoogleAccount with organization_id or null

3. `updateProperties(id: number, properties: object)`
   - Replaces: Lines 295-300
   - Updates: google_property_ids field
   - Returns: Updated GoogleAccount

### 4.2 UserModel Required Methods

**File:** `src/models/UserModel.ts`

1. `findById(id: number)`
   - Replaces: Lines 57-59
   - Returns: User or null

### 4.3 OrganizationUserModel Required Methods

**File:** `src/models/OrganizationUserModel.ts`

1. `listByOrganization(organizationId: number)`
   - Replaces: Lines 446-455 (join with users table)
   - Returns: Array of users with roles and joined_at
   - Select: user.id, user.email, user.name, org_user.role, org_user.created_at

2. `findByOrganizationAndEmail(organizationId: number, email: string)`
   - Replaces: Lines 510-516 (join with users)
   - Returns: OrganizationUser or null

3. `findByOrganizationAndUser(organizationId: number, userId: number)`
   - Replaces: Lines 616-618
   - Returns: OrganizationUser or null

4. `removeFromOrganization(organizationId: number, userId: number)`
   - Replaces: Lines 630-632 (DELETE)
   - Returns: boolean (success)

5. `updateRole(organizationId: number, userId: number, role: string)`
   - Replaces: Lines 686-694
   - Updates: role field, updated_at timestamp
   - Returns: boolean (success) or number of affected rows

### 4.4 InvitationModel Required Methods

**File:** `src/models/InvitationModel.ts`

1. `listPending(organizationId: number)`
   - Replaces: Lines 458-460
   - Where: organization_id = orgId, status = 'pending'
   - Select: id, email, role, created_at, expires_at
   - Returns: Array of invitations

2. `findPending(organizationId: number, email: string)`
   - Replaces: Lines 525-531
   - Where: organization_id = orgId, email = email, status = 'pending'
   - Returns: Invitation or null

3. `create(invitation: InvitationInput)`
   - Replaces: Lines 544-553
   - Insert: email, organization_id, role, token, expires_at, status, created_at, updated_at
   - Returns: Invitation ID or created invitation

**InvitationInput type:**
```typescript
interface InvitationInput {
  email: string;
  organization_id: number;
  role: string;
  token: string;
  expires_at: Date;
  status: 'pending';
  created_at: Date;
  updated_at: Date;
}
```

### 4.5 OrganizationModel Required Methods

**File:** `src/models/OrganizationModel.ts`

1. `findById(id: number)`
   - Replaces: Lines 556-558
   - Returns: Organization or null

---

## 5. Step-by-Step Migration Plan

### Phase 1: Preparation & Model Layer (Days 1-2)

#### Step 1.1: Verify Model Files
- Confirm existence of all 5 model files
- Read each model to understand existing methods
- Document which required methods already exist
- Identify gaps in model methods

#### Step 1.2: Extend Models
For each model (GoogleAccountModel, UserModel, OrganizationUserModel, InvitationModel, OrganizationModel):
- Add missing methods from section 4 (Model Method Requirements)
- Test each method individually
- Ensure proper error handling
- Add TypeScript types for all return values

**Files to modify:**
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/GoogleAccountModel.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/UserModel.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OrganizationUserModel.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/InvitationModel.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OrganizationModel.ts`

**Validation:**
- Unit test each new model method
- No db() calls should remain in services after this phase

### Phase 2: Utilities Layer (Day 3)

#### Step 2.1: Create Utilities Directory
```bash
mkdir -p src/controllers/settings/feature-utils
```

#### Step 2.2: Create Utility Files
**Order matters - start with zero-dependency utilities:**

1. **util.invitation-token.ts** (simplest)
   - Migrate lines 540-542 (token generation)
   - Pure function, no dependencies
   - Test token format and randomness

2. **util.scope-parser.ts**
   - Migrate lines 84-88 (SCOPE_MAP constant)
   - Migrate lines 116-141 (scope parsing logic)
   - Migrate lines 143-164 (scope checking logic)
   - Pure functions, no dependencies
   - Test with various scope formats

3. **util.property-parser.ts**
   - Migrate lines 220-229 (property parsing)
   - Migrate lines 267-293 (property update logic)
   - Pure functions, no dependencies
   - Test JSON parsing and updates

4. **util.error-handler.ts**
   - Migrate lines 24-32 (handleError)
   - Enhance with specific error types
   - Depends on Express Response type only
   - Test error response formats

**Files to create:**
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.invitation-token.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.scope-parser.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.property-parser.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.error-handler.ts`

**Validation:**
- Unit test each utility function
- Test edge cases (null, undefined, malformed input)
- Ensure zero side effects

### Phase 3: Services Layer (Days 4-6)

#### Step 3.1: Create Services Directory
```bash
mkdir -p src/controllers/settings/feature-services
```

#### Step 3.2: Create Service Files
**Build services in dependency order:**

1. **service.profile.ts** (Day 4)
   - Migrate lines 47-70 (getUserProfile logic)
   - Depends on: GoogleAccountModel, UserModel
   - No external APIs
   - Simple service - good starting point

2. **service.scopes.ts** (Day 4)
   - Migrate lines 98-177 (getScopes logic)
   - Depends on: GoogleAccountModel, util.scope-parser
   - No external APIs
   - Medium complexity

3. **service.google-properties.ts** (Day 5)
   - Migrate lines 334-354 (GA4 fetching)
   - Migrate lines 355-368 (GSC fetching)
   - Migrate lines 369-403 (GBP fetching)
   - Migrate lines 322-411 (orchestration)
   - Depends on: Google APIs (external)
   - No model dependencies
   - High complexity due to external APIs

4. **service.properties.ts** (Day 5)
   - Migrate lines 196-234 (getConnectedProperties)
   - Migrate lines 250-306 (updateProperty)
   - Depends on: GoogleAccountModel, util.property-parser
   - No external APIs
   - Medium complexity

5. **service.user-management.ts** (Day 6)
   - Migrate lines 430-466 (listOrganizationUsers)
   - Migrate lines 482-578 (inviteUserToOrganization)
   - Migrate lines 594-637 (removeUserFromOrganization)
   - Migrate lines 654-705 (updateUserRole)
   - Depends on: All models, util.invitation-token, mail service
   - Complex validation logic
   - Highest complexity

**Files to create:**
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.profile.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.scopes.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.google-properties.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.properties.ts`
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.user-management.ts`

**Validation per service:**
- Unit tests with mocked models
- Integration tests with real database
- Test error handling paths
- Test validation rules

### Phase 4: Controller Layer (Day 7)

#### Step 4.1: Create Controller
**File:** `src/controllers/settings/SettingsController.ts`

Build controller class with 10 methods:
1. `getUserProfile(req, res)` - calls ProfileService
2. `getScopes(req, res)` - calls ScopesService
3. `getProperties(req, res)` - calls PropertiesService
4. `updateProperties(req, res)` - calls PropertiesService
5. `getAvailableProperties(req, res)` - calls GooglePropertiesService
6. `listUsers(req, res)` - calls UserManagementService
7. `inviteUser(req, res)` - calls UserManagementService
8. `removeUser(req, res)` - calls UserManagementService
9. `updateUserRole(req, res)` - calls UserManagementService

**Responsibilities:**
- Extract data from req (body, params, custom properties)
- Call appropriate service method
- Format response
- Delegate errors to error handler
- No business logic
- No database calls

**File to create:**
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/SettingsController.ts`

**Validation:**
- Integration tests for each controller method
- Test middleware integration (rbacMiddleware, tokenRefreshMiddleware)
- Test error responses

### Phase 5: Routes Layer (Day 8)

#### Step 5.1: Refactor Routes File
**File:** `src/routes/settings.ts`

**Current size:** 712 lines
**Target size:** ~100 lines

**Process:**
1. Keep imports: express, middleware imports
2. Add import: SettingsController
3. Replace all handler functions with controller method calls
4. Preserve all middleware chains exactly as-is
5. Preserve all route paths exactly as-is
6. Delete all business logic
7. Delete all helper functions (moved to utils)

**Example transformation:**
```typescript
// BEFORE (lines 42-75)
settingsRoutes.get(
  "/me",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();
      // ... 30+ lines of logic
    } catch (error) {
      return handleError(res, error, "Fetch user profile");
    }
  }
);

// AFTER
settingsRoutes.get(
  "/me",
  tokenRefreshMiddleware,
  rbacMiddleware,
  SettingsController.getUserProfile
);
```

**File to modify:**
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/settings.ts`

**Validation:**
- All 10 endpoints must work identically
- Run full integration test suite
- Test with Postman/curl for each endpoint
- Verify error responses match original format

### Phase 6: Testing & Validation (Days 9-10)

#### Step 6.1: Unit Tests
- Test all utility functions
- Test all service methods (with mocked models)
- Test all model methods
- Target: 80%+ code coverage

#### Step 6.2: Integration Tests
- Test all 10 endpoints end-to-end
- Test with different user roles (admin, manager, viewer)
- Test error scenarios
- Test Google API integrations (may require mocking)

#### Step 6.3: Manual Testing
- Deploy to staging environment
- Test user flows:
  - View profile
  - Check scopes
  - Connect/disconnect properties
  - Invite users
  - Remove users
  - Update roles
- Verify error messages are user-friendly

#### Step 6.4: Performance Validation
- Compare response times before/after refactor
- Ensure no N+1 queries introduced
- Verify database connection pooling still works
- Check for memory leaks

### Phase 7: Cleanup & Documentation (Day 11)

#### Step 7.1: Code Review
- Review all new files for consistency
- Check TypeScript types are complete
- Ensure error handling is comprehensive
- Verify logging is adequate

#### Step 7.2: Documentation
- Add JSDoc comments to all public methods
- Document service dependencies
- Document model method contracts
- Update API documentation if external-facing

#### Step 7.3: Final Cleanup
- Remove commented-out code
- Remove debug console.logs (keep only production logging)
- Ensure consistent code formatting
- Run linter and fix all warnings

---

## 6. Files to Create

### 6.1 Utilities (4 files)
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.invitation-token.ts` (~20 lines)
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.scope-parser.ts` (~80 lines)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.property-parser.ts` (~60 lines)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-utils/util.error-handler.ts` (~40 lines)

**Total utilities LOC:** ~200 lines

### 6.2 Services (5 files)
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.profile.ts` (~50 lines)
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.scopes.ts` (~80 lines)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.properties.ts` (~100 lines)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.google-properties.ts` (~150 lines)
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/feature-services/service.user-management.ts` (~200 lines)

**Total services LOC:** ~580 lines

### 6.3 Controller (1 file)
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/settings/SettingsController.ts` (~150 lines)

**Total controller LOC:** ~150 lines

### 6.4 Total New Files: 10
**Total new LOC:** ~930 lines (includes imports, types, error handling, comments)

---

## 7. Files to Modify

### 7.1 Routes
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/settings.ts`
   - **Current:** 712 lines
   - **Target:** ~100 lines
   - **Change:** Replace all handlers with controller calls, remove all business logic

### 7.2 Models (to be extended)
All models likely need new methods. Exact changes depend on existing implementation:

1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/GoogleAccountModel.ts`
   - Add/verify: `findById()`, `findByIdWithOrganization()`, `updateProperties()`
   - Estimated: +30-60 lines

2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/UserModel.ts`
   - Add/verify: `findById()`
   - Estimated: +10-20 lines

3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OrganizationUserModel.ts`
   - Add/verify: `listByOrganization()`, `findByOrganizationAndEmail()`, `findByOrganizationAndUser()`, `removeFromOrganization()`, `updateRole()`
   - Estimated: +60-100 lines

4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/InvitationModel.ts`
   - Add/verify: `listPending()`, `findPending()`, `create()`
   - Estimated: +40-60 lines

5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/OrganizationModel.ts`
   - Add/verify: `findById()`
   - Estimated: +10-20 lines

**Total model extensions:** ~150-260 lines

### 7.3 Total Files to Modify: 6

---

## 8. Risk Assessment

### 8.1 Low Risks

**1. Utility Functions**
- **Risk:** Pure functions are easiest to test and migrate
- **Mitigation:** Unit tests provide 100% confidence
- **Impact:** None if tests pass

**2. Model Layer Extensions**
- **Risk:** Adding methods to existing models is additive
- **Mitigation:** Does not break existing functionality
- **Impact:** Low - isolated changes

**3. Route Signatures**
- **Risk:** None - route paths and middleware chains remain identical
- **Mitigation:** External API contract unchanged
- **Impact:** Zero breaking changes for clients

### 8.2 Medium Risks

**1. Service Logic Extraction**
- **Risk:** Complex business logic might be misunderstood during extraction
- **Concern:** Lines 482-578 (invite user) has intricate validation flow
- **Mitigation:**
  - Comprehensive integration tests
  - Side-by-side comparison with original
  - Staging environment validation
- **Impact:** Potential logic bugs if not careful

**2. Google API Integration**
- **Risk:** Lines 334-403 contain complex external API calls
- **Concern:** Error handling might differ between google.analyticsadmin and mybusiness APIs
- **Mitigation:**
  - Preserve exact API call patterns
  - Test with real Google API responses
  - Mock external calls in tests
- **Impact:** Could break property fetching if errors not handled correctly

**3. Property JSON Parsing**
- **Risk:** Lines 220-229, 267-293 handle JSON parsing with fallbacks
- **Concern:** String vs object handling is defensive
- **Mitigation:**
  - Preserve exact parsing logic
  - Test with various input formats
  - Add regression tests
- **Impact:** Could corrupt property data if parsing changes

**4. Role-Based Authorization Logic**
- **Risk:** Lines 492-496, 616-622, 678-683 contain RBAC logic
- **Concern:** Manager cannot invite admin, admin cannot change own role, etc.
- **Mitigation:**
  - Extract authorization rules to separate validation functions
  - Test all role combinations
  - Document authorization matrix
- **Impact:** Security vulnerability if authorization bypassed

### 8.3 High Risks

**1. Database Transaction Atomicity**
- **Risk:** Current code does not use transactions explicitly
- **Concern:** Lines 544-553 (invitation insert) followed by email send (lines 563-567)
  - If email fails, invitation exists but user never notified
  - Current code warns but does not rollback
- **Mitigation:**
  - Document current behavior
  - Consider transaction boundaries in services
  - Do not change transactional semantics during refactor
- **Impact:** Data consistency issues if behavior changes

**2. Error Response Format Changes**
- **Risk:** Lines 24-32 define error format used by all endpoints
- **Concern:** Clients may depend on exact error response structure
- **Mitigation:**
  - Preserve exact error response format
  - Test error responses match original
  - Document any intentional changes
- **Impact:** Could break client error handling

**3. Scope Parsing Logic**
- **Risk:** Lines 116-141 contain complex scope delimiter detection
- **Concern:** Handles space-separated, comma-separated, and single scope formats
  - Unclear which format is canonical
  - Defensive parsing might mask data quality issues
- **Mitigation:**
  - Preserve exact parsing logic
  - Add tests for all formats
  - Consider standardizing scope storage format (future work)
- **Impact:** Could break scope checking, affecting permissions

**4. Invitation Token Security**
- **Risk:** Lines 540-542 generate 32-byte hex token
- **Concern:** Token generation is security-critical
- **Mitigation:**
  - Use crypto.randomBytes (already does)
  - Do not change token format or length
  - Preserve expiry calculation (7 days)
- **Impact:** Security vulnerability if tokens become predictable

### 8.4 Critical Risks

**1. User Removal Cascade Effects**
- **Risk:** Lines 630-632 delete from organization_users
- **Concern:** What happens to user's data, sessions, API tokens?
  - No cascade delete verification in current code
  - User might still have active sessions after removal
- **Mitigation:**
  - Do not change deletion logic
  - Document cascade behavior
  - Consider adding session invalidation (separate feature)
- **Impact:** Orphaned data or security issues if behavior changes

**2. Role Change Without Session Invalidation**
- **Risk:** Lines 686-694 update role but message says "User will need to log in again"
- **Concern:** Role change does not actually invalidate session
  - User's current JWT/session might still have old role
  - Security gap until next token refresh
- **Mitigation:**
  - Do not change current behavior during refactor
  - Document this limitation
  - Flag as technical debt for future fix
- **Impact:** Authorization bypass window if behavior changes

**3. Multiple DB Queries Without Transactions**
- **Risk:** Lines 510-516, 525-531, 544-553 are three separate queries
- **Concern:** Race condition possible between membership check and invitation insert
  - Two simultaneous invites could both pass the check
- **Mitigation:**
  - Do not change to transactions during refactor (scope creep)
  - Document race condition risk
  - Consider unique constraint at database level (future work)
- **Impact:** Duplicate invitations possible (existing bug, do not fix here)

**4. Email Service Failure Handling**
- **Risk:** Lines 563-573 show email failure is logged but does not fail the request
- **Concern:** Invitation created but user never notified
  - No retry mechanism
  - No notification to admin that email failed
- **Mitigation:**
  - Preserve exact behavior (warn but succeed)
  - Do not add retry logic during refactor
  - Document as known limitation
- **Impact:** Silent failures if email sending becomes unreliable

### 8.5 Blast Radius Matrix

| Change Type | Files Affected | Endpoints Affected | Risk Level | Rollback Difficulty |
|-------------|----------------|--------------------|-----------|--------------------|
| Utility creation | 4 new files | 0 direct | Low | Easy - delete files |
| Model extensions | 5 existing files | 0 direct | Low | Easy - revert commits |
| Service creation | 5 new files | 0 direct | Medium | Easy - delete files |
| Controller creation | 1 new file | 0 direct | Medium | Easy - delete file |
| Route refactor | 1 existing file | 10 endpoints | High | Easy - revert commit |
| Integration | All files | 10 endpoints | Critical | Medium - requires testing |

### 8.6 Rollback Plan

**Scenario: Refactor introduces bugs in production**

**Immediate Rollback (< 5 minutes):**
1. Revert commit to `src/routes/settings.ts`
2. Deploy previous version
3. All endpoints back to original monolithic handlers
4. No data loss (models not changed, services not used)

**Partial Rollback (if some endpoints work):**
1. Keep new infrastructure (controller, services, utils)
2. Selectively revert individual route handlers to original inline logic
3. Fix issues in services/controller
4. Gradually re-enable refactored routes

**Point of No Return:**
- Once model methods are in use by OTHER routes
- Then full rollback requires reverting models too
- **Mitigation:** Ensure models are backward compatible
  - New methods are additive
  - Do not modify existing model methods

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Utilities (4 test files)**
- `util.invitation-token.test.ts`
  - Test token length (64 chars hex)
  - Test token uniqueness
  - Test expiry calculation
- `util.scope-parser.test.ts`
  - Test space-separated scopes
  - Test comma-separated scopes
  - Test single scope
  - Test empty string
  - Test malformed input
  - Test scope checking logic
- `util.property-parser.test.ts`
  - Test JSON string parsing
  - Test object parsing
  - Test malformed JSON handling
  - Test property updates (ga4, gsc, gbp)
  - Test connect/disconnect actions
- `util.error-handler.test.ts`
  - Test error response format
  - Test different error types

**Services (5 test files with mocked models)**
- `service.profile.test.ts`
  - Test profile retrieval with valid account
  - Test with missing account
  - Test with missing user
- `service.scopes.test.ts`
  - Test scope checking with all scopes
  - Test with missing scopes
  - Test with malformed scope string
- `service.properties.test.ts`
  - Test property retrieval
  - Test property update for each type
  - Test connect/disconnect actions
- `service.google-properties.test.ts` (with mocked Google APIs)
  - Test GA4 property fetching
  - Test GSC site fetching
  - Test GBP location fetching
  - Test error handling for API failures
- `service.user-management.test.ts`
  - Test user listing
  - Test invitation creation with role validation
  - Test manager cannot invite admin
  - Test duplicate invitation prevention
  - Test user removal with permission checks
  - Test self-removal prevention
  - Test role update with validation
  - Test self-role-change prevention

**Models (5 test files with real database)**
- Test all new methods
- Test error cases (not found, constraint violations)
- Test edge cases (null values, large datasets)

**Target:** 80%+ code coverage on new code

### 9.2 Integration Tests

**Endpoint Tests (10 test suites)**

Each endpoint needs:
- Success case with valid data
- Error case with invalid data
- Permission tests (admin, manager, viewer roles)
- Edge cases

**Test Matrix:**
| Endpoint | Auth Tests | Role Tests | Error Tests | Edge Cases |
|----------|-----------|-----------|-------------|-----------|
| GET /me | ✓ | ✓ | missing account | - |
| GET /scopes | ✓ | ✓ | missing account, malformed scopes | all scope combinations |
| GET /properties | ✓ | ✓ | missing org | null properties |
| POST /properties/update | ✓ | admin only | invalid type, missing data | disconnect all |
| GET /properties/available/:type | ✓ | ✓ | invalid type, API failure | empty results |
| GET /users | ✓ | ✓ | missing org | no users, no invitations |
| POST /users/invite | ✓ | admin+manager | duplicate, invalid email | manager inviting admin |
| DELETE /users/:userId | ✓ | admin only | invalid ID, self-removal | last admin |
| PUT /users/:userId/role | ✓ | admin only | invalid role, self-update | - |

**Test Environment:**
- Staging database with test data
- Mock Google APIs (or use test Google accounts)
- Mock email service (verify calls without sending)

### 9.3 Manual Testing Checklist

**User Flows:**
- [ ] Admin can view own profile
- [ ] Admin can see all scopes
- [ ] Admin can connect GA4 property
- [ ] Admin can connect GSC property
- [ ] Admin can connect GBP locations
- [ ] Admin can disconnect properties
- [ ] Admin can view all users
- [ ] Admin can invite manager
- [ ] Admin can invite viewer
- [ ] Manager can invite viewer
- [ ] Manager cannot invite admin (verify error)
- [ ] Admin can remove user
- [ ] Admin cannot remove self (verify error)
- [ ] Admin can change user role
- [ ] Admin cannot change own role (verify error)
- [ ] Viewer can view profile but not manage users

**Error Scenarios:**
- [ ] Invalid token returns 401
- [ ] Missing google account returns 404
- [ ] Invalid role returns 400
- [ ] Duplicate invitation returns 400
- [ ] Google API failure returns 500 with proper message

### 9.4 Performance Testing

**Benchmarks (before and after refactor):**
- Measure response time for each endpoint
- Target: No more than 10% increase
- Acceptable: Additional 5-10ms for abstraction layers

**Database Queries:**
- Count queries per endpoint
- Target: Same number or fewer queries
- Watch for N+1 query introduction

**Memory:**
- Monitor heap usage during load test
- Target: No memory leaks
- Test with 100+ concurrent requests

**Tools:**
- Apache Bench or Artillery for load testing
- Database query logging
- Node.js profiler for memory leaks

---

## 10. Performance Considerations

### 10.1 Query Optimization

**Current State:**
- Direct db() calls: 22 instances
- Some queries join tables (lines 446-455, 510-516)
- No obvious N+1 issues in current code

**After Refactor:**
- All queries go through models
- Risk: Model methods might introduce inefficiencies
- Mitigation: Ensure model methods use same queries as original

**Specific Concerns:**
1. Lines 446-455: JOIN between organization_users and users
   - Must preserve in `OrganizationUserModel.listByOrganization()`
   - Do not fetch users separately (N+1 risk)

2. Lines 510-516: JOIN for membership check
   - Must preserve in `OrganizationUserModel.findByOrganizationAndEmail()`
   - Do not split into two queries

**Validation:**
- Enable query logging before/after
- Compare query plans
- Ensure indexes are used

### 10.2 External API Calls

**Current State:**
- Google Analytics Admin API: 1 call per GA4 fetch
- Google Search Console API: 1 call per GSC fetch
- Google Business Profile APIs: N calls (one per account, then locations)

**After Refactor:**
- Same API calls, just in service layer
- No change in API usage patterns

**Specific Concerns:**
- Lines 385-402: Loop over accounts to fetch locations
  - Potential performance issue if many accounts
  - Do not change during refactor (existing behavior)
  - Consider pagination in future

**Validation:**
- Mock external APIs in tests
- Log API call count in integration tests
- Ensure no duplicate API calls introduced

### 10.3 JSON Parsing

**Current State:**
- Lines 220-229: Parse google_property_ids on every fetch
- Lines 267-293: Parse, modify, stringify on update

**After Refactor:**
- Same parsing logic in util.property-parser
- Consider caching parsed properties (future optimization)

**Risk:**
- JSON.parse/stringify is fast but not free
- Acceptable for settings endpoints (low frequency)

### 10.4 Memory Usage

**Current State:**
- Route handlers are anonymous functions (no closure leaks)
- Minimal object creation

**After Refactor:**
- Controller is a class (might instantiate per request or singleton)
- Services might be classes or modules
- Risk: Improper class instantiation could leak memory

**Mitigation:**
- Use static methods for stateless operations
- Do not store request data in class properties
- Prefer functional services over class-based if no state needed

**Decision:** Use class with static methods for controller and services
- No instance state
- No memory leaks
- Easy to test

---

## 11. Security Considerations

### 11.1 Authorization

**Current State:**
- RBAC middleware checks role: admin, manager, viewer
- Role stored in organization_users table
- requireRole() middleware enforces endpoints

**After Refactor:**
- Must preserve all role checks
- No relaxation of permissions

**Critical Checks to Preserve:**
1. Line 249: Only admin can update properties
2. Line 481: Admin and manager can invite
3. Line 492-496: Manager cannot invite admin
4. Line 593: Only admin can remove users
5. Line 624-627: Cannot remove self
6. Line 653: Only admin can change roles
7. Line 678-683: Cannot change own role

**Validation:**
- Security test suite with different roles
- Verify 403 responses for unauthorized actions
- Test role escalation attempts

### 11.2 Input Validation

**Current State:**
- Email validation: Implicit (lines 487-489)
- Role validation: Lines 663-665 (admin, manager, viewer)
- User ID validation: Lines 599-601, 659-661
- Type validation: Line 405 (ga4, gsc, gbp)

**After Refactor:**
- Must preserve all validations
- Consider adding TypeScript types for stronger validation

**Critical Validations:**
1. Email format (consider adding email regex)
2. Role enum (already checked)
3. User ID numeric (already checked)
4. Property type enum (already checked)

**Enhancement Opportunity:**
- Use validation library (Joi, Zod) in services
- Do not add during refactor (scope creep)
- Flag as future improvement

### 11.3 Data Sanitization

**Current State:**
- Email lowercased: Lines 514, 528, 545, 564 (good)
- No obvious SQL injection risk (using Knex query builder)
- No XSS risk in API (no HTML rendering)

**After Refactor:**
- Preserve email lowercasing
- Models should also lowercase emails for consistency

**Validation:**
- Test with malicious input (SQL injection attempts, XSS payloads)
- Verify Knex query builder escapes properly

### 11.4 Token Security

**Current State:**
- Invitation token: 32 bytes random hex (secure)
- Expiry: 7 days (reasonable)
- Token stored in database, sent via email

**After Refactor:**
- Preserve token generation logic exactly
- Do not reduce token length
- Do not change crypto library

**Critical Security:**
- crypto.randomBytes is cryptographically secure
- 32 bytes = 256 bits entropy (excellent)
- Hex encoding = 64 characters (do not reduce)

**Validation:**
- Test token uniqueness (vanishingly small collision risk)
- Test token format (64 hex chars)
- Verify expiry calculation

### 11.5 Session Management

**Current State:**
- Lines 702-705: Message says "User will need to log in again"
- Reality: Role change does not invalidate session
- Security gap: User's current session has old role until token expires

**After Refactor:**
- Do not fix during refactor (separate security feature)
- Document limitation
- Flag as technical debt

**Future Work:**
- Add session invalidation on role change
- Add session invalidation on user removal
- Consider JWT blacklist or short-lived tokens

---

## 12. Observability & Logging

### 12.1 Current Logging

**Console.error:**
- Line 25: All errors logged via handleError()
- Format: `[Settings] {operation} Error: {message}`

**Console.log:**
- Lines 137-141: Debug logging for scope parsing
- Lines 570-573: Invitation email status

**Console.warn:**
- Line 570: Email send failure warning

**Current State:**
- Inconsistent logging levels (error, log, warn)
- No structured logging
- Debug logs in production

### 12.2 Logging Strategy After Refactor

**Standardize Logging:**
- Use logging library (Winston, Pino)
- Structured JSON logs
- Correlation IDs for request tracing

**Log Levels:**
- ERROR: All caught exceptions
- WARN: Email send failures, API errors
- INFO: User management actions (invite, remove, role change)
- DEBUG: Scope parsing, property parsing (disabled in production)

**What to Log:**

**Service Layer:**
- Start/end of service operations (INFO)
- External API calls (INFO)
- Email sends (INFO success, WARN failure)
- Validation failures (WARN)
- Errors (ERROR)

**Model Layer:**
- Database errors (ERROR)
- Query performance (DEBUG)

**Controller Layer:**
- Request received (DEBUG)
- Response sent (DEBUG)
- Errors (ERROR via error handler)

**Sensitive Data:**
- Do not log: passwords, tokens, full emails
- Log: user IDs, organization IDs, email domains (anonymized)
- Mask: token values (log "token_xyz***" not full token)

### 12.3 Metrics

**Add Metrics for:**
- Endpoint response times
- Database query times
- External API call times
- Error rates per endpoint
- Invitation success/failure rates

**Tool Integration:**
- StatsD/Prometheus for metrics
- Grafana for dashboards
- Consider APM tool (New Relic, DataDog)

**Critical Metrics:**
- `/api/settings/users/invite` failure rate
  - Track email send failures separately
  - Alert if > 5% failure rate
- `/api/settings/properties/available/:type` response time
  - Google API calls can be slow
  - Alert if > 5 seconds

---

## 13. Dependencies

### 13.1 Current Dependencies

**NPM Packages:**
- express: Web framework
- googleapis: Google API client
- @googleapis/mybusinessaccountmanagement: GBP accounts API
- @googleapis/mybusinessbusinessinformation: GBP business info API
- crypto: Built-in (token generation)

**Internal Dependencies:**
- `../database/connection`: Knex instance
- `../middleware/tokenRefresh`: Auth middleware
- `../middleware/rbac`: Role-based access control
- `../services/mail`: Email service

**Database:**
- google_accounts table
- users table
- organization_users table
- invitations table
- organizations table

### 13.2 New Dependencies After Refactor

**No new external dependencies required.**

**New internal dependencies:**
- Controllers depend on services
- Services depend on models
- Services depend on utilities
- Services depend on external APIs (no change)
- Services depend on mail service (no change)
- Controllers depend on error handler utility

**Dependency Graph:**
```
routes/settings.ts
└── controllers/SettingsController
    ├── feature-services/ProfileService
    │   ├── models/GoogleAccountModel
    │   └── models/UserModel
    ├── feature-services/ScopesService
    │   ├── models/GoogleAccountModel
    │   └── feature-utils/ScopeParser
    ├── feature-services/PropertiesService
    │   ├── models/GoogleAccountModel
    │   └── feature-utils/PropertyParser
    ├── feature-services/GooglePropertiesService
    │   └── googleapis (external)
    ├── feature-services/UserManagementService
    │   ├── models/GoogleAccountModel
    │   ├── models/OrganizationUserModel
    │   ├── models/InvitationModel
    │   ├── models/OrganizationModel
    │   ├── feature-utils/InvitationTokenGenerator
    │   └── services/mail (external)
    └── feature-utils/ErrorHandler
```

**Circular Dependency Risk:** Low
- One-way dependency flow: routes → controller → services → models
- No model-to-service dependencies
- No service-to-controller dependencies

---

## 14. Alternatives Considered

### 14.1 Alternative: Single Service File

**Approach:**
- Create single `SettingsService.ts` instead of 5 separate services
- All business logic in one file (~500 lines)

**Pros:**
- Fewer files to manage
- Easier to find code
- Less import overhead

**Cons:**
- Large file (500+ lines)
- Mixes different concerns (profile, scopes, properties, users)
- Harder to test individual features
- Does not follow single responsibility principle

**Decision:** Rejected
- Reason: Feature-based services provide better separation
- Each service has clear responsibility
- Easier to test and maintain

### 14.2 Alternative: No Controller Layer

**Approach:**
- Routes call services directly
- Skip controller abstraction

**Pros:**
- Fewer files
- Less indirection
- Simpler architecture

**Cons:**
- Routes file becomes larger
- Request/response handling mixed with routing
- Harder to test (need to mock express req/res)
- Controller provides useful abstraction for testing

**Decision:** Rejected
- Reason: Controller layer provides clear separation
- Makes testing easier (controller methods are just functions)
- Standard pattern in larger applications

### 14.3 Alternative: Domain-Driven Design

**Approach:**
- Organize by domain entities: User, Property, Scope, Invitation
- Each domain has: entity, repository, service, controller

**Pros:**
- More aligned with DDD principles
- Clear entity boundaries
- Scalable for large applications

**Cons:**
- Overkill for 10 endpoints
- More files and directories
- Higher cognitive overhead
- Unclear domain boundaries in this case (User vs OrganizationUser?)

**Decision:** Rejected for now
- Reason: Feature-based is sufficient for current scale
- Can evolve to DDD later if needed
- Keep it simple

### 14.4 Alternative: Keep db() Calls in Services

**Approach:**
- Services use db() directly instead of models
- Skip model layer extension

**Pros:**
- Faster migration (no model work needed)
- Fewer layers
- Direct control over queries

**Cons:**
- Models become inconsistent (some routes use models, settings doesn't)
- Harder to mock database in tests
- No single source of truth for database access
- Violates existing architecture (other routes use models)

**Decision:** Rejected
- Reason: Models already exist, should use them
- Consistency with rest of codebase is critical
- Models provide better testability

---

## 15. Definition of Done

### 15.1 Code Complete

- [ ] All 10 utility/service/controller files created
- [ ] All 5 model files extended with required methods
- [ ] routes/settings.ts refactored to ~100 lines
- [ ] All db() calls removed from routes
- [ ] All business logic moved to services
- [ ] All utilities are pure functions
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes with zero warnings

### 15.2 Testing Complete

- [ ] Unit tests written for all utilities (4 test files)
- [ ] Unit tests written for all services (5 test files, mocked models)
- [ ] Unit tests written for all new model methods
- [ ] Integration tests pass for all 10 endpoints
- [ ] Manual testing checklist completed
- [ ] Performance benchmarks show < 10% regression
- [ ] Security test suite passes (role-based access)
- [ ] Code coverage ≥ 80% on new code

### 15.3 Documentation Complete

- [ ] JSDoc comments on all public methods
- [ ] Service dependencies documented
- [ ] Model method contracts documented
- [ ] Known limitations documented (session invalidation)
- [ ] Migration notes for other developers
- [ ] Rollback plan documented
- [ ] Technical debt items logged (if any)

### 15.4 Deployment Ready

- [ ] Code reviewed by at least one other engineer
- [ ] Staging deployment successful
- [ ] Staging smoke tests passed
- [ ] Performance validated in staging
- [ ] Database migrations run (if needed for indexes)
- [ ] Rollback plan tested
- [ ] Monitoring dashboards created
- [ ] Alerts configured for critical endpoints

### 15.5 Post-Deployment

- [ ] Production deployment successful
- [ ] Production smoke tests passed
- [ ] No errors in production logs (first 24 hours)
- [ ] Performance metrics within acceptable range
- [ ] User feedback positive (no reported issues)
- [ ] Rollback plan remains available for 1 week
- [ ] Post-mortem completed (if issues found)

---

## 16. Timeline & Effort Estimate

### 16.1 Detailed Timeline

| Phase | Duration | Engineer Days | Parallelizable |
|-------|----------|--------------|----------------|
| Phase 1: Model Layer | 2 days | 2 days | No |
| Phase 2: Utilities | 1 day | 1 day | Yes (after Phase 1) |
| Phase 3: Services | 3 days | 3 days | Partially (after Phase 2) |
| Phase 4: Controller | 1 day | 1 day | No (after Phase 3) |
| Phase 5: Routes | 1 day | 1 day | No (after Phase 4) |
| Phase 6: Testing | 2 days | 2 days | Partially (after Phase 5) |
| Phase 7: Cleanup | 1 day | 1 day | No (after Phase 6) |
| **Total** | **11 days** | **11 engineer days** | - |

### 16.2 Realistic Schedule

**With 1 engineer (sequential):**
- Duration: 11-12 working days (~2.5 weeks)
- Includes buffer for unexpected issues

**With 2 engineers (parallel where possible):**
- Duration: 7-8 working days (~1.5 weeks)
- Engineer A: Models → Services (profile, scopes)
- Engineer B: Utilities → Services (properties, google-properties, user-management)
- Merge: Controller → Routes → Testing → Cleanup

**Critical Path:**
Models → Services → Controller → Routes → Testing

**Cannot parallelize:**
- Model extensions must complete before services
- Services must complete before controller
- Controller must complete before routes refactor
- Routes refactor must complete before integration testing

### 16.3 Risk Buffer

**Contingency: +20% time**
- 11 days × 1.2 = 13-14 days with buffer
- Accounts for:
  - Unexpected bugs in services
  - Model methods needing more work
  - Integration test failures
  - Performance issues requiring optimization

### 16.4 Minimum Viable Refactor

**If timeline is aggressive, consider phased approach:**

**Phase 1 (Priority 1 - 5 days):**
- Models + Utilities
- Profile + Scopes services
- Controller (partial)
- Routes (refactor 2 endpoints)
- Deploy to staging

**Phase 2 (Priority 2 - 4 days):**
- Properties services
- Google Properties service
- Routes (refactor 3 endpoints)
- Deploy to staging

**Phase 3 (Priority 3 - 5 days):**
- User Management service
- Routes (refactor 5 endpoints)
- Full testing
- Deploy to production

**Total: 14 days spread over 3 phases**

---

## 17. Success Metrics

### 17.1 Technical Metrics

**Code Quality:**
- Lines of code: 712 → ~1080 (distributed, better organized)
- Files count: 1 → 11 (modular, single responsibility)
- Cyclomatic complexity: Reduced per file
- Test coverage: 0% → 80%+

**Performance:**
- Endpoint response time: ≤ 10% increase
- Database queries: Same or fewer per endpoint
- Memory usage: No leaks, stable heap

**Architecture:**
- Layer violations: 0 (no business logic in routes)
- Database calls in routes: 0 (all in models)
- Circular dependencies: 0

### 17.2 Team Metrics

**Developer Experience:**
- Time to understand settings code: Reduced (clear structure)
- Time to add new endpoint: Reduced (follow pattern)
- Time to debug issues: Reduced (clear separation)
- Onboarding new developers: Easier (standard pattern)

**Maintenance:**
- Bug fix locations: Easier to identify (service layer)
- Test addition: Easier (isolated functions)
- Refactoring risk: Lower (clear dependencies)

### 17.3 Business Metrics

**Reliability:**
- Error rate: No increase
- Uptime: No degradation
- User-reported issues: Zero related to refactor

**Velocity:**
- Sprint velocity: Maintained after learning curve
- Feature addition time: Reduced for settings-related features
- Technical debt: Reduced (clean architecture)

---

## 18. Post-Refactor Recommendations

### 18.1 Technical Debt to Address

**Identified During Analysis:**

1. **Session Invalidation on Role Change**
   - Lines 702-705: Says "user will need to log in" but doesn't invalidate session
   - Security gap: Old role active until token expiry
   - Recommendation: Add JWT blacklist or short-lived tokens

2. **Race Condition in Invitation Creation**
   - Lines 510-553: Three separate queries without transaction
   - Risk: Duplicate invitations if concurrent requests
   - Recommendation: Add unique constraint or use transaction

3. **Email Send Failures Are Silent**
   - Lines 563-573: Email failure logged but request succeeds
   - Risk: User invited but never notified
   - Recommendation: Add email retry queue or admin notification

4. **Scope Storage Format Inconsistency**
   - Lines 116-141: Defensive parsing for space/comma delimiters
   - Problem: Unclear canonical format
   - Recommendation: Standardize on space-separated (Google OAuth format)

5. **GBP Location Fetching Inefficiency**
   - Lines 385-402: Loop over accounts, fetch locations sequentially
   - Risk: Slow if many accounts
   - Recommendation: Add pagination or parallel fetching

### 18.2 Feature Enhancements

**Low-Hanging Fruit:**

1. **Add Email Validation**
   - Currently no format validation
   - Add regex or validation library

2. **Add Property Connection Webhooks**
   - Notify external systems when properties connected
   - Useful for integration pipelines

3. **Add Bulk User Management**
   - Invite multiple users at once
   - Import from CSV

4. **Add Audit Log**
   - Log all user management actions
   - Who invited/removed/changed roles for whom

5. **Add Invitation Resend**
   - Allow resending invitation email
   - Useful if email lost or expired

### 18.3 Architecture Evolution

**Future Patterns:**

1. **Event-Driven Architecture**
   - Emit events: UserInvited, UserRemoved, RoleChanged
   - Subscribers can invalidate sessions, send notifications, log audits

2. **Command Query Responsibility Segregation (CQRS)**
   - Separate read models for user lists
   - Optimize queries without affecting writes

3. **Domain-Driven Design**
   - Evolve to domain entities: User, Property, Invitation
   - If settings grows beyond 20 endpoints

4. **API Versioning**
   - Add /v1/ prefix to routes
   - Allows backward-compatible changes

5. **GraphQL Gateway**
   - Combine multiple REST endpoints
   - Reduce over-fetching for frontend

---

## 19. Appendix

### 19.1 File Size Breakdown

**Current State:**
- settings.ts: 712 lines (100% of code)

**Target State:**
- settings.ts: ~100 lines (14% of code)
- SettingsController.ts: ~150 lines (21% of code)
- Services: ~580 lines (54% of code)
- Utilities: ~200 lines (19% of code)
- Model extensions: ~200 lines (not counted in total)

**Total: ~1030 lines (excluding models)**

### 19.2 Endpoint Complexity Analysis

| Endpoint | LOC | DB Calls | External APIs | Complexity |
|----------|-----|----------|---------------|-----------|
| GET /me | 33 | 2 | 0 | Low |
| GET /scopes | 88 | 1 | 0 | Medium (parsing) |
| GET /properties | 47 | 1 | 0 | Low |
| POST /properties/update | 66 | 2 | 0 | Medium |
| GET /properties/available/:type | 98 | 0 | 3 | High (Google APIs) |
| GET /users | 45 | 3 | 0 | Low |
| POST /users/invite | 106 | 5 | 1 (email) | High (validation) |
| DELETE /users/:userId | 53 | 3 | 0 | Medium (permissions) |
| PUT /users/:userId/role | 61 | 2 | 0 | Medium (validation) |

**Total LOC:** 597 (excluding helper functions and constants)

### 19.3 Model Method Coverage

**GoogleAccountModel:**
- Existing methods: Unknown (need to check)
- Required methods: 3 (findById, findByIdWithOrganization, updateProperties)
- Usage count: 10 calls in routes

**UserModel:**
- Existing methods: Unknown
- Required methods: 1 (findById)
- Usage count: 1 call in routes

**OrganizationUserModel:**
- Existing methods: Unknown
- Required methods: 5 (list, find by email, find by user, remove, update role)
- Usage count: 6 calls in routes

**InvitationModel:**
- Existing methods: Unknown
- Required methods: 3 (list pending, find pending, create)
- Usage count: 3 calls in routes

**OrganizationModel:**
- Existing methods: Unknown
- Required methods: 1 (findById)
- Usage count: 1 call in routes

### 19.4 Migration Checklist Template

**For Each Endpoint:**
- [ ] Identify current handler function
- [ ] List all db() calls
- [ ] List all external API calls
- [ ] List all validation logic
- [ ] List all error handling
- [ ] Create corresponding service method
- [ ] Map db() calls to model methods
- [ ] Extract utilities if needed
- [ ] Create controller method
- [ ] Update route definition
- [ ] Write unit tests
- [ ] Write integration test
- [ ] Manual test with Postman
- [ ] Compare response with original
- [ ] Document any behavior changes

### 19.5 Key Contacts

**For Questions During Implementation:**
- Database team: Model schema questions, index optimization
- Infrastructure team: Deployment, rollback procedures
- Frontend team: API contract verification, error format
- Security team: Authorization rules, token validation
- QA team: Test coverage, edge cases

---

## 20. Conclusion

### 20.1 Summary

This refactor plan transforms the 712-line monolithic settings route into a clean, layered architecture with:
- **10 new files** (controller, services, utilities)
- **5 extended models** (database access layer)
- **1 refactored route file** (thin route definitions)

The refactor:
- **Preserves** all existing functionality and API contracts
- **Improves** code organization, testability, and maintainability
- **Reduces** future development time for settings features
- **Maintains** performance and security characteristics

### 20.2 Risk Mitigation

The plan addresses risks through:
- Comprehensive testing strategy (unit, integration, manual)
- Clear rollback plan (revert route file only)
- Phased migration approach (models → utils → services → controller → routes)
- Detailed validation at each phase

### 20.3 Long-Term Benefits

**For Engineers:**
- Clear code organization (easy to find and modify)
- Better testing (isolated units)
- Reduced cognitive load (single responsibility)
- Easier onboarding (standard patterns)

**For Product:**
- Faster feature development (follow established patterns)
- Fewer bugs (better test coverage)
- Easier maintenance (clear dependencies)
- Reduced technical debt (clean architecture)

**For Business:**
- Higher reliability (comprehensive testing)
- Lower maintenance cost (easier debugging)
- Faster time-to-market (reusable services)
- Better scalability (modular design)

---

## Sign-Off

**Plan Created:** 2026-02-18
**Plan Version:** 1.0
**Estimated Duration:** 11-14 days (1 engineer)
**Risk Level:** Medium (comprehensive testing mitigates risk)
**Rollback Difficulty:** Easy (single file revert)

**Ready for Review:** ✓

---

**Next Steps:**
1. Review this plan with team
2. Verify model files and existing methods
3. Adjust timeline based on model gaps
4. Assign engineer(s)
5. Begin Phase 1 (Model Layer)
