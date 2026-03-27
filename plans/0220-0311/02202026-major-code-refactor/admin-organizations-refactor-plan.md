# Admin Organizations Route Refactor Plan

**Target File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/organizations.ts`
**Status:** Medium Complexity Route
**Total LOC:** 321 lines
**Created:** 2026-02-18

---

## Current State

### Route Overview

**File:** `signalsai-backend/src/routes/admin/organizations.ts`

**Endpoints:**
1. `GET /api/admin/organizations` - List all organizations with enriched data
2. `GET /api/admin/organizations/:id` - Get single organization details
3. `PATCH /api/admin/organizations/:id` - Update organization name
4. `PATCH /api/admin/organizations/:id/tier` - Update subscription tier with side effects

**Line Count:** 321 LOC

**Dependencies:**
- `express` - Router and types
- `src/database/connection` - Direct db() access (15 raw queries)
- `src/middleware/auth` - authenticateToken, AuthRequest
- `src/middleware/superAdmin` - superAdminMiddleware
- `src/emails/emailService` - sendToAdmins
- `uuid` - v4 for project ID generation

**Models Available:**
- `OrganizationModel` - Has listAll(), findById(), updateById(), updateTier()
- `OrganizationUserModel` - Has countByOrg(), listByOrgWithUsers()
- `GoogleAccountModel` - Has basic CRUD, but needs extension for connections
- `ProjectModel` - Has findByOrganizationId(), create(), updateById()

**Current Issues:**
1. **15 raw db() calls** - Bypasses model layer entirely
2. **Complex business logic in route handlers** - Connection detection, tier upgrade/downgrade logic
3. **Mixed concerns** - Validation, data enrichment, transaction management, email sending all in routes
4. **No separation of concerns** - Routes handle HTTP, validation, business logic, data access
5. **Error handling helper in route file** - Should be middleware/utility
6. **JSON parsing logic scattered** - google_property_ids parsing repeated 3 times
7. **Transaction management in route** - Should be in service layer
8. **Email composition in route** - Should be in service/template
9. **Hostname generation logic in route** - Should be in utility
10. **No test coverage possible** - Business logic trapped in route handlers

---

## Target Architecture

### Folder Structure

```
src/
├── routes/
│   └── admin/
│       └── organizations.ts          # Route definitions only (50-70 LOC)
│
├── controllers/
│   └── admin-organizations/
│       ├── AdminOrganizationsController.ts   # Main controller (200-250 LOC)
│       ├── feature-services/
│       │   ├── OrganizationEnrichmentService.ts   # Enrichment logic (~80 LOC)
│       │   ├── TierManagementService.ts           # Tier upgrade/downgrade (~120 LOC)
│       │   └── ConnectionDetectionService.ts      # Connection status logic (~60 LOC)
│       └── feature-utils/
│           ├── hostnameGenerator.ts               # Hostname creation (~30 LOC)
│           ├── propertyIdsParser.ts               # JSON parsing (~40 LOC)
│           └── tierEmailTemplates.ts              # Email templates (~50 LOC)
│
├── models/
│   ├── OrganizationModel.ts                       # Extend with new methods
│   ├── OrganizationUserModel.ts                   # Already has needed methods
│   ├── GoogleAccountModel.ts                      # Extend with connection queries
│   └── website-builder/
│       └── ProjectModel.ts                        # Extend with tier operations
│
└── middleware/
    └── errorHandler.ts                            # Move handleError here
```

### Layer Responsibilities

**Routes Layer** (`routes/admin/organizations.ts`)
- HTTP route definitions only
- Call controller methods
- Pass req/res/next
- No business logic
- No validation
- No database calls
- Target: 50-70 LOC

**Controller Layer** (`AdminOrganizationsController.ts`)
- Request/response handling
- Input validation
- Orchestrate service calls
- Format responses
- Error handling
- Target: 200-250 LOC

**Service Layer** (`feature-services/`)
- Business logic execution
- Cross-model operations
- Transaction coordination
- Call model methods
- No direct db() access
- No HTTP concerns

**Utility Layer** (`feature-utils/`)
- Pure functions
- No database access
- Reusable logic
- Data transformation
- Template generation

**Model Layer** (`models/`)
- Database operations only
- Type definitions
- Query building
- No business logic
- No validation

---

## Detailed Mapping

### Endpoint 1: GET /api/admin/organizations

**Current Handler:** Lines 27-92 (66 LOC)

**Mapping:**

| Current Code | Target Location | Responsibility |
|--------------|-----------------|----------------|
| Route definition (lines 27-31) | `routes/admin/organizations.ts` | Route setup |
| Handler function (lines 32-91) | `AdminOrganizationsController.listAll()` | Orchestration |
| `db("organizations").select(...).orderBy(...)` (lines 34-36) | `OrganizationModel.listAll()` | Already exists |
| User count query (lines 42-45) | `OrganizationUserModel.countByOrg(orgId)` | Already exists |
| Google accounts query (lines 49-51) | `GoogleAccountModel.findByOrganization(orgId)` | **NEW METHOD** |
| Property parsing + detection (lines 57-70) | `ConnectionDetectionService.detectConnections(accounts)` | **NEW SERVICE** |
| Property JSON parsing (lines 59-65) | `propertyIdsParser.parse(propertyIds)` | **NEW UTIL** |
| Enrichment loop (lines 39-82) | `OrganizationEnrichmentService.enrichWithMetadata(orgs)` | **NEW SERVICE** |
| Error handling (lines 88-90) | Middleware errorHandler | Move to middleware |

**Database Calls:**
- `db("organizations").select(...).orderBy(...)` → `OrganizationModel.listAll()`
- `db("organization_users").where(...).count(...)` → `OrganizationUserModel.countByOrg()`
- `db("google_accounts").where(...).select(...)` → `GoogleAccountModel.findByOrganization()`

**New Methods Needed:**
- `GoogleAccountModel.findByOrganization(orgId)` - Return all accounts for org
- `ConnectionDetectionService.detectConnections(accounts)` - Analyze property IDs
- `OrganizationEnrichmentService.enrichWithMetadata(orgs)` - Coordinate enrichment

---

### Endpoint 2: GET /api/admin/organizations/:id

**Current Handler:** Lines 98-167 (70 LOC)

**Mapping:**

| Current Code | Target Location | Responsibility |
|--------------|-----------------|----------------|
| Route definition (lines 98-102) | `routes/admin/organizations.ts` | Route setup |
| Handler function (lines 103-166) | `AdminOrganizationsController.getById()` | Orchestration |
| ID validation (lines 104-107) | `AdminOrganizationsController.getById()` | Input validation |
| `db("organizations").where({id}).first()` (lines 109-111) | `OrganizationModel.findById(orgId)` | Already exists |
| Users join query (lines 118-127) | `OrganizationUserModel.listByOrgWithUsers(orgId)` | Already exists |
| Google accounts query (lines 130-132) | `GoogleAccountModel.findByOrganization(orgId)` | **NEW METHOD** |
| Property parsing (lines 134-148) | `ConnectionDetectionService.formatConnectionDetails(accounts)` | **NEW SERVICE** |
| Website query (lines 151-154) | `ProjectModel.findByOrganizationId(orgId)` | Already exists |
| Error handling (lines 163-165) | Middleware errorHandler | Move to middleware |

**Database Calls:**
- `db("organizations").where({id}).first()` → `OrganizationModel.findById()`
- `db("organization_users").join("users")...` → `OrganizationUserModel.listByOrgWithUsers()`
- `db("google_accounts").where({organization_id})` → `GoogleAccountModel.findByOrganization()`
- `db("website_builder.projects").where({organization_id})` → `ProjectModel.findByOrganizationId()`

**New Methods Needed:**
- Same `GoogleAccountModel.findByOrganization()` as Endpoint 1
- `ConnectionDetectionService.formatConnectionDetails(accounts)` - Format for detail view

---

### Endpoint 3: PATCH /api/admin/organizations/:id

**Current Handler:** Lines 173-210 (38 LOC)

**Mapping:**

| Current Code | Target Location | Responsibility |
|--------------|-----------------|----------------|
| Route definition (lines 173-177) | `routes/admin/organizations.ts` | Route setup |
| Handler function (lines 178-209) | `AdminOrganizationsController.updateName()` | Orchestration |
| ID validation (lines 179-184) | `AdminOrganizationsController.updateName()` | Input validation |
| Name validation (lines 186-188) | `AdminOrganizationsController.updateName()` | Input validation |
| `db("organizations").where({id}).update(...)` (lines 190-195) | `OrganizationModel.updateById(id, {name})` | Already exists |
| Error handling (lines 206-208) | Middleware errorHandler | Move to middleware |

**Database Calls:**
- `db("organizations").where({id}).update(...)` → `OrganizationModel.updateById()`

**New Methods Needed:**
- None - model method already exists

---

### Endpoint 4: PATCH /api/admin/organizations/:id/tier

**Current Handler:** Lines 216-319 (104 LOC) - **MOST COMPLEX**

**Mapping:**

| Current Code | Target Location | Responsibility |
|--------------|-----------------|----------------|
| Route definition (lines 216-220) | `routes/admin/organizations.ts` | Route setup |
| Handler function (lines 221-318) | `AdminOrganizationsController.updateTier()` | Orchestration |
| Transaction start (line 221) | `TierManagementService.updateTier()` | Service manages transaction |
| ID validation (lines 224-230) | `AdminOrganizationsController.updateTier()` | Input validation |
| Tier validation (lines 232-237) | `AdminOrganizationsController.updateTier()` | Input validation |
| `trx("organizations").where({id}).first()` (line 239) | `OrganizationModel.findById(orgId, trx)` | Already exists |
| `trx("organizations").where({id}).update(...)` (lines 248-251) | `OrganizationModel.updateTier(orgId, tier, trx)` | Already exists |
| DFY upgrade logic (lines 254-294) | `TierManagementService.handleDfyUpgrade(org, trx)` | **NEW SERVICE** |
| Existing project check (lines 255-257) | `ProjectModel.findByOrganizationId(orgId, trx)` | Already exists |
| Hostname generation (lines 260-267) | `hostnameGenerator.generate(orgName)` | **NEW UTIL** |
| Project creation (lines 270-277) | `ProjectModel.create({...}, trx)` | Already exists |
| Admin email sending (lines 280-293) | `sendToAdmins()` via email template | Use existing service |
| Email body composition (lines 282-292) | `tierEmailTemplates.dfyUpgradeEmail(org, hostname)` | **NEW UTIL** |
| DWY downgrade logic (lines 298-302) | `TierManagementService.handleDwyDowngrade(orgId, trx)` | **NEW SERVICE** |
| Project read-only update (lines 299-301) | `ProjectModel.setReadOnly(orgId, trx)` | **NEW METHOD** |
| Transaction commit/rollback | `TierManagementService.updateTier()` | Service manages transaction |
| Error handling (lines 314-316) | Middleware errorHandler | Move to middleware |

**Database Calls:**
- `trx("organizations").where({id}).first()` → `OrganizationModel.findById(id, trx)`
- `trx("organizations").where({id}).update(...)` → `OrganizationModel.updateTier(id, tier, trx)`
- `trx("website_builder.projects").where({organization_id}).first()` → `ProjectModel.findByOrganizationId(orgId, trx)`
- `trx("website_builder.projects").insert(...)` → `ProjectModel.create(data, trx)`
- `trx("website_builder.projects").where({organization_id}).update(...)` → `ProjectModel.setReadOnly(orgId, trx)`

**New Methods Needed:**
- `TierManagementService.updateTier(orgId, tier)` - Main orchestrator
- `TierManagementService.handleDfyUpgrade(org, trx)` - DFY upgrade logic
- `TierManagementService.handleDwyDowngrade(orgId, trx)` - DWY downgrade logic
- `hostnameGenerator.generate(orgName)` - Hostname creation utility
- `tierEmailTemplates.dfyUpgradeEmail(org, hostname)` - Email template
- `ProjectModel.setReadOnly(orgId, trx)` - Set project read-only

---

## Model Extensions Required

### GoogleAccountModel Extensions

**File:** `src/models/GoogleAccountModel.ts`

**New Method 1: findByOrganization**
```typescript
static async findByOrganization(
  orgId: number,
  trx?: QueryContext
): Promise<IGoogleAccount[]> {
  const rows = await this.table(trx)
    .where({ organization_id: orgId })
    .select("id", "email", "google_property_ids");
  return rows.map((row: IGoogleAccount) =>
    this.deserializeJsonFields(row)
  );
}
```

**Replaces:**
- Lines 49-51 in GET / endpoint
- Lines 130-132 in GET /:id endpoint

---

### ProjectModel Extensions

**File:** `src/models/website-builder/ProjectModel.ts`

**New Method 1: setReadOnly**
```typescript
static async setReadOnly(
  orgId: number,
  trx?: QueryContext
): Promise<number> {
  return this.table(trx)
    .where({ organization_id: orgId })
    .update({
      is_read_only: true,
      updated_at: new Date()
    });
}
```

**Replaces:**
- Lines 299-301 in PATCH /:id/tier endpoint

**Note:** Assumes `is_read_only` column exists on `website_builder.projects` table. If not, this is a database migration requirement.

---

## Step-by-Step Migration Plan

### Phase 1: Foundation (Utilities & Extensions)

**Step 1.1: Create Utility Functions**

Files to create:
1. `src/controllers/admin-organizations/feature-utils/propertyIdsParser.ts`
   - `parse(propertyIds: string | object): ParsedProperties`
   - Handles JSON parsing with error handling
   - Returns typed object with ga4, gsc, gbp properties

2. `src/controllers/admin-organizations/feature-utils/hostnameGenerator.ts`
   - `generate(orgName: string): string`
   - Normalizes org name to hostname format
   - Adds random suffix
   - Validates length constraints

3. `src/controllers/admin-organizations/feature-utils/tierEmailTemplates.ts`
   - `dfyUpgradeEmail(org: IOrganization, hostname: string): string`
   - Returns formatted email body
   - No logic, just template string

**Step 1.2: Extend Models**

Modify:
1. `src/models/GoogleAccountModel.ts`
   - Add `findByOrganization()` method

2. `src/models/website-builder/ProjectModel.ts`
   - Add `setReadOnly()` method

**Step 1.3: Move Error Handler**

Modify:
1. `src/middleware/errorHandler.ts`
   - Add `handleError()` function from routes (or enhance existing handler)

**Testing:**
- Unit test each utility in isolation
- Test model extensions with database
- No route changes yet - zero risk

---

### Phase 2: Service Layer

**Step 2.1: Create ConnectionDetectionService**

File: `src/controllers/admin-organizations/feature-services/ConnectionDetectionService.ts`

Responsibilities:
- `detectConnections(accounts: IGoogleAccount[]): ConnectionStatus`
  - Takes array of google accounts
  - Uses `propertyIdsParser.parse()` for each account
  - Returns { ga4, gsc, gbp } boolean flags

- `formatConnectionDetails(accounts: IGoogleAccount[]): ConnectionDetail[]`
  - Formats accounts with parsed properties for detail view
  - Returns array of { accountId, email, properties }

Replaces:
- Lines 57-70 in GET / endpoint
- Lines 134-148 in GET /:id endpoint

**Step 2.2: Create OrganizationEnrichmentService**

File: `src/controllers/admin-organizations/feature-services/OrganizationEnrichmentService.ts`

Responsibilities:
- `enrichWithMetadata(orgs: IOrganization[]): Promise<EnrichedOrganization[]>`
  - Orchestrates enrichment for list of orgs
  - Calls `OrganizationUserModel.countByOrg()` for each
  - Calls `GoogleAccountModel.findByOrganization()` for each
  - Calls `ConnectionDetectionService.detectConnections()`
  - Returns enriched org objects

Replaces:
- Lines 39-82 in GET / endpoint

**Step 2.3: Create TierManagementService**

File: `src/controllers/admin-organizations/feature-services/TierManagementService.ts`

Responsibilities:
- `updateTier(orgId: number, newTier: string): Promise<TierUpdateResult>`
  - Main orchestrator
  - Manages transaction lifecycle
  - Calls `handleDfyUpgrade()` or `handleDwyDowngrade()`
  - Commits or rolls back transaction
  - Returns success/failure result

- `handleDfyUpgrade(org: IOrganization, trx: Transaction): Promise<void>`
  - Checks for existing project
  - Generates hostname via `hostnameGenerator.generate()`
  - Creates project via `ProjectModel.create()`
  - Sends email via `sendToAdmins()` with template

- `handleDwyDowngrade(orgId: number, trx: Transaction): Promise<void>`
  - Sets project read-only via `ProjectModel.setReadOnly()`

Replaces:
- Lines 254-302 in PATCH /:id/tier endpoint (tier upgrade/downgrade logic)

**Testing:**
- Unit test services with mocked models
- Integration test services with test database
- Test transaction rollback scenarios
- No route changes yet

---

### Phase 3: Controller Layer

**Step 3.1: Create AdminOrganizationsController**

File: `src/controllers/admin-organizations/AdminOrganizationsController.ts`

Structure:
```typescript
export class AdminOrganizationsController {

  static async listAll(req: AuthRequest, res: Response): Promise<Response> {
    // Input validation (none needed)
    // Call OrganizationModel.listAll()
    // Call OrganizationEnrichmentService.enrichWithMetadata()
    // Format response
    // Error handling
  }

  static async getById(req: AuthRequest, res: Response): Promise<Response> {
    // Parse & validate ID
    // Call OrganizationModel.findById()
    // Call OrganizationUserModel.listByOrgWithUsers()
    // Call GoogleAccountModel.findByOrganization()
    // Call ConnectionDetectionService.formatConnectionDetails()
    // Call ProjectModel.findByOrganizationId()
    // Format response
    // Error handling
  }

  static async updateName(req: AuthRequest, res: Response): Promise<Response> {
    // Parse & validate ID
    // Validate name input
    // Call OrganizationModel.updateById()
    // Format response
    // Error handling
  }

  static async updateTier(req: AuthRequest, res: Response): Promise<Response> {
    // Parse & validate ID
    // Validate tier input
    // Call TierManagementService.updateTier()
    // Format response
    // Error handling
  }
}
```

Responsibilities:
- All input validation
- HTTP request/response handling
- Orchestrate service/model calls
- Format JSON responses
- Error catching and response formatting
- No business logic
- No database calls

Replaces:
- All handler functions from routes/admin/organizations.ts

**Testing:**
- Unit test controller with mocked services
- Test input validation
- Test error response formatting
- No route changes yet

---

### Phase 4: Route Refactor

**Step 4.1: Refactor Route File**

Modify: `src/routes/admin/organizations.ts`

New structure:
```typescript
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { AdminOrganizationsController } from "../../controllers/admin-organizations/AdminOrganizationsController";

const organizationsRoutes = express.Router();

organizationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  AdminOrganizationsController.listAll
);

organizationsRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  AdminOrganizationsController.getById
);

organizationsRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  AdminOrganizationsController.updateName
);

organizationsRoutes.patch(
  "/:id/tier",
  authenticateToken,
  superAdminMiddleware,
  AdminOrganizationsController.updateTier
);

export default organizationsRoutes;
```

Target LOC: ~50 lines

Changes:
- Remove all handler function implementations
- Remove handleError helper (moved to middleware)
- Remove direct imports of db, uuid, emailService
- Import AdminOrganizationsController
- Replace handlers with controller method references
- Keep middleware chain unchanged

**Testing:**
- Integration test all endpoints
- Verify same HTTP behavior as before
- Test error responses
- Test with real database

---

### Phase 5: Validation & Cleanup

**Step 5.1: Integration Testing**

Test scenarios:
1. GET /api/admin/organizations
   - Returns enriched list
   - Handles empty database
   - Connection detection accuracy

2. GET /api/admin/organizations/:id
   - Returns full details
   - Returns 404 for missing org
   - Returns 400 for invalid ID

3. PATCH /api/admin/organizations/:id
   - Updates name successfully
   - Returns 400 for invalid name
   - Returns 404 for missing org

4. PATCH /api/admin/organizations/:id/tier
   - DWY → DFY upgrade creates project and sends email
   - DFY → DWY downgrade sets read-only
   - Returns 400 for invalid tier
   - Rolls back on error
   - Email delivery verification

**Step 5.2: Remove Old Code**

After successful testing:
- Remove all inline handler implementations from route file
- Verify no orphaned imports
- Update any route documentation

**Step 5.3: Documentation**

Update:
- API documentation if exists
- Controller method JSDoc comments
- Service method JSDoc comments
- Model method JSDoc comments

---

## Files Summary

### Files to Create (9 files)

1. **Controller:**
   - `src/controllers/admin-organizations/AdminOrganizationsController.ts`

2. **Services (3):**
   - `src/controllers/admin-organizations/feature-services/ConnectionDetectionService.ts`
   - `src/controllers/admin-organizations/feature-services/OrganizationEnrichmentService.ts`
   - `src/controllers/admin-organizations/feature-services/TierManagementService.ts`

3. **Utilities (3):**
   - `src/controllers/admin-organizations/feature-utils/propertyIdsParser.ts`
   - `src/controllers/admin-organizations/feature-utils/hostnameGenerator.ts`
   - `src/controllers/admin-organizations/feature-utils/tierEmailTemplates.ts`

4. **Index files (2):**
   - `src/controllers/admin-organizations/feature-services/index.ts`
   - `src/controllers/admin-organizations/feature-utils/index.ts`

### Files to Modify (4 files)

1. **Routes:**
   - `src/routes/admin/organizations.ts` - Refactor to route definitions only

2. **Models (3):**
   - `src/models/GoogleAccountModel.ts` - Add findByOrganization()
   - `src/models/website-builder/ProjectModel.ts` - Add setReadOnly()
   - `src/middleware/errorHandler.ts` - Add handleError() if not exists

### Files to Delete

- None (handlers are replaced in-place)

---

## Database Call Mapping

### Before (15 raw db() calls)

**GET / endpoint:**
1. `db("organizations").select(...).orderBy(...)` (line 34)
2. `db("organization_users").where(...).count(...)` (line 42) - inside loop
3. `db("google_accounts").where(...).select(...)` (line 49) - inside loop

**GET /:id endpoint:**
4. `db("organizations").where({id}).first()` (line 109)
5. `db("organization_users").join("users")...` (line 118)
6. `db("google_accounts").where({organization_id})` (line 130)
7. `db("website_builder.projects").where({organization_id})` (line 151)

**PATCH /:id endpoint:**
8. `db("organizations").where({id}).update(...)` (line 190)

**PATCH /:id/tier endpoint:**
9. `trx("organizations").where({id}).first()` (line 239)
10. `trx("organizations").where({id}).update(...)` (line 248)
11. `trx("website_builder.projects").where({organization_id}).first()` (line 255)
12. `trx("website_builder.projects").insert(...)` (line 270)
13. `trx("website_builder.projects").where({organization_id}).update(...)` (line 299)

### After (0 raw db() calls, all via models)

**GET / endpoint:**
1. `OrganizationModel.listAll()`
2. `OrganizationUserModel.countByOrg(orgId)` - inside service
3. `GoogleAccountModel.findByOrganization(orgId)` - inside service

**GET /:id endpoint:**
4. `OrganizationModel.findById(orgId)`
5. `OrganizationUserModel.listByOrgWithUsers(orgId)`
6. `GoogleAccountModel.findByOrganization(orgId)`
7. `ProjectModel.findByOrganizationId(orgId)`

**PATCH /:id endpoint:**
8. `OrganizationModel.updateById(orgId, {name})`

**PATCH /:id/tier endpoint:**
9. `OrganizationModel.findById(orgId, trx)` - inside service
10. `OrganizationModel.updateTier(orgId, tier, trx)` - inside service
11. `ProjectModel.findByOrganizationId(orgId, trx)` - inside service
12. `ProjectModel.create(data, trx)` - inside service
13. `ProjectModel.setReadOnly(orgId, trx)` - inside service

**All database access now goes through model layer.**

---

## Risk Assessment

### Migration Risks

#### Low Risk (Green)

**Phase 1: Foundation**
- Creating utilities has zero impact on runtime
- Extending models is additive (doesn't change existing behavior)
- Can be tested in isolation
- Can be deployed without route changes

**Mitigation:** None needed - purely additive work.

#### Medium Risk (Yellow)

**Phase 2-3: Service & Controller Creation**
- New service layer introduces new code paths
- Transaction management moves to service layer
- Business logic extraction may introduce subtle bugs

**Mitigation:**
- Comprehensive unit tests for services
- Integration tests with test database
- Test transaction rollback scenarios
- Manual QA of tier upgrade/downgrade flows
- Deploy services without route changes initially

#### High Risk (Red)

**Phase 4: Route Refactor**
- Changes production route behavior
- All endpoints affected simultaneously
- Transaction handling changes for tier endpoint
- Email sending moved to service layer

**Mitigation:**
- Complete integration test suite before deployment
- Deploy during low-traffic window
- Have rollback plan ready (git revert)
- Monitor error logs closely post-deployment
- Test tier upgrade flow in staging extensively
- Verify email delivery in staging

### Specific Risk Scenarios

**Risk 1: Transaction Rollback Behavior Changes**
- **Location:** PATCH /:id/tier endpoint
- **Issue:** Transaction management moves from route to service
- **Impact:** Failed tier upgrades might not rollback properly
- **Mitigation:**
  - Write integration tests for rollback scenarios
  - Test with intentional email service failures
  - Test with database constraint violations

**Risk 2: JSON Parsing Consistency**
- **Location:** Connection detection logic
- **Issue:** Property IDs parsing extracted to utility
- **Impact:** Different parsing behavior could break connection detection
- **Mitigation:**
  - Extract parsing logic exactly as-is
  - Add tests for malformed JSON cases
  - Test with real production data samples

**Risk 3: Email Template Formatting**
- **Location:** DFY upgrade email
- **Issue:** Email body moved to template utility
- **Impact:** Email format/content might change
- **Mitigation:**
  - Copy existing email body exactly
  - Test email delivery in staging
  - Review email in inbox before production deploy

**Risk 4: Hostname Generation Consistency**
- **Location:** Project creation in tier upgrade
- **Issue:** Hostname generation extracted to utility
- **Impact:** Generated hostnames might not be valid
- **Mitigation:**
  - Extract logic exactly as-is
  - Test with various org names (special chars, long names, etc.)
  - Validate against existing hostname patterns

**Risk 5: Enrichment Performance**
- **Location:** GET / endpoint
- **Issue:** Enrichment moved to service with multiple model calls
- **Impact:** Performance regression if service makes more queries
- **Mitigation:**
  - Profile database query count before/after
  - Ensure same number of queries
  - Monitor API response times post-deployment

### Rollback Plan

**If issues occur post-deployment:**

1. **Immediate rollback:**
   ```bash
   git revert <refactor-commit-hash>
   git push
   pm2 restart api
   ```

2. **Partial rollback (if only one endpoint broken):**
   - Cherry-pick old handler for broken endpoint back into route file
   - Deploy hotfix
   - Resume refactor after root cause analysis

3. **Emergency workaround:**
   - Feature flag to toggle between old/new implementation
   - Requires preparation before deployment

**Rollback decision criteria:**
- Any endpoint returns 500 errors
- Transaction rollback failures
- Data corruption detected
- Emails not sending
- Performance degradation > 50%

---

## Testing Strategy

### Unit Tests

**Utilities:**
- `propertyIdsParser.parse()` - Valid JSON, malformed JSON, string input, object input
- `hostnameGenerator.generate()` - Various org names, special chars, length limits
- `tierEmailTemplates.dfyUpgradeEmail()` - Template variable substitution

**Services:**
- `ConnectionDetectionService.detectConnections()` - Empty accounts, multiple accounts, various property configurations
- `ConnectionDetectionService.formatConnectionDetails()` - Account formatting
- `OrganizationEnrichmentService.enrichWithMetadata()` - Mock model calls
- `TierManagementService.updateTier()` - DWY→DFY, DFY→DWY, same tier
- `TierManagementService.handleDfyUpgrade()` - New project creation, existing project
- `TierManagementService.handleDwyDowngrade()` - Read-only update

**Controller:**
- `AdminOrganizationsController.listAll()` - Mock service calls
- `AdminOrganizationsController.getById()` - Valid ID, invalid ID, missing org
- `AdminOrganizationsController.updateName()` - Valid input, invalid input
- `AdminOrganizationsController.updateTier()` - Valid tier, invalid tier

**Models:**
- `GoogleAccountModel.findByOrganization()` - Org with accounts, org without accounts
- `ProjectModel.setReadOnly()` - Update success, no project found

### Integration Tests

**Endpoint Tests:**
1. GET /api/admin/organizations
   - Returns 200 with enriched orgs
   - Connection detection accuracy
   - Handles empty database

2. GET /api/admin/organizations/:id
   - Returns 200 with full details
   - Returns 404 for missing org
   - Returns 400 for invalid ID format

3. PATCH /api/admin/organizations/:id
   - Returns 200 on successful update
   - Returns 400 for missing name
   - Returns 400 for empty name
   - Returns 404 for missing org

4. PATCH /api/admin/organizations/:id/tier
   - Returns 200 on DWY→DFY upgrade
   - Creates project on upgrade
   - Sends email on upgrade
   - Returns 200 on DFY→DWY downgrade
   - Sets project read-only on downgrade
   - Returns 400 for invalid tier
   - Returns 404 for missing org
   - Rolls back on project creation failure
   - Rolls back on email failure (if critical)

**Transaction Tests:**
- Verify rollback on email send failure
- Verify commit on successful upgrade
- Verify database state unchanged on rollback

**Performance Tests:**
- Compare response times before/after refactor
- Verify query count unchanged
- Load test with 100+ orgs

### Manual QA Checklist

Pre-deployment staging verification:
- [ ] GET / returns enriched orgs with correct connection status
- [ ] GET /:id returns full org details
- [ ] PATCH /:id updates org name
- [ ] PATCH /:id/tier DWY→DFY creates project
- [ ] Email received in admin inbox for tier upgrade
- [ ] Email content matches expected format
- [ ] Hostname generated correctly for new project
- [ ] PATCH /:id/tier DFY→DWY sets project read-only
- [ ] Invalid inputs return 400 with clear error messages
- [ ] Missing resources return 404
- [ ] Server errors return 500 with error details

Post-deployment production verification:
- [ ] All endpoints return 200 for valid requests
- [ ] No 500 errors in logs
- [ ] Response times within acceptable range
- [ ] Database query count unchanged
- [ ] Tier upgrade email delivery confirmed

---

## Definition of Done

### Code Complete
- [ ] All 9 new files created with implementations
- [ ] All 4 files modified as specified
- [ ] Route file reduced to ~50 LOC (route definitions only)
- [ ] All database calls go through model layer (0 raw db() calls)
- [ ] No business logic in routes
- [ ] handleError moved to middleware

### Model Layer
- [ ] `GoogleAccountModel.findByOrganization()` implemented
- [ ] `ProjectModel.setReadOnly()` implemented
- [ ] All model methods accept QueryContext for transactions

### Service Layer
- [ ] `ConnectionDetectionService` implemented with 2 methods
- [ ] `OrganizationEnrichmentService` implemented
- [ ] `TierManagementService` implemented with 3 methods
- [ ] All services use model layer (no raw db() calls)
- [ ] Transaction management in service layer

### Utility Layer
- [ ] `propertyIdsParser` implemented
- [ ] `hostnameGenerator` implemented
- [ ] `tierEmailTemplates` implemented
- [ ] All utilities are pure functions

### Controller Layer
- [ ] `AdminOrganizationsController` implemented with 4 methods
- [ ] All input validation in controller
- [ ] No business logic in controller
- [ ] Proper error handling and response formatting

### Testing
- [ ] Unit tests for all utilities (100% coverage)
- [ ] Unit tests for all services (100% coverage)
- [ ] Unit tests for all new model methods
- [ ] Integration tests for all 4 endpoints
- [ ] Transaction rollback tests
- [ ] Manual QA checklist completed in staging

### Documentation
- [ ] JSDoc comments on all public methods
- [ ] API documentation updated (if exists)
- [ ] README updated with new architecture (if exists)
- [ ] Migration notes for other developers

### Deployment
- [ ] All tests passing in CI
- [ ] Manual QA in staging completed
- [ ] Rollback plan documented
- [ ] Deployed to production
- [ ] Post-deployment verification completed
- [ ] No errors in production logs
- [ ] Performance metrics acceptable

### Validation
- [ ] Same HTTP behavior as before refactor
- [ ] All endpoints return correct responses
- [ ] Tier upgrade flow works end-to-end
- [ ] Emails delivered successfully
- [ ] Transaction rollback works correctly
- [ ] No N+1 query issues introduced
- [ ] Response times unchanged or improved

---

## Success Metrics

**Code Quality:**
- Route file LOC: 321 → 50 (84% reduction)
- Raw db() calls: 15 → 0 (100% elimination)
- Business logic in routes: 100% → 0% (complete separation)
- Testable code coverage: ~0% → 100% (all business logic testable)

**Maintainability:**
- Controller: Single responsibility per method
- Services: Business logic isolated and reusable
- Utilities: Pure functions, easy to test
- Models: Database operations only

**Performance:**
- Response time delta: ≤ 5% increase acceptable
- Query count: Must remain same or decrease
- Memory usage: Should remain constant

**Reliability:**
- Zero data corruption incidents
- Transaction rollback working correctly
- Email delivery rate unchanged
- Error rate unchanged or decreased

---

## Notes

### Why This Architecture?

**Controller/Service/Utility Pattern:**
- Controller = HTTP boundary, input validation
- Service = Business logic orchestration
- Utility = Pure transformation functions
- Model = Database operations

This creates clear responsibility boundaries and makes testing straightforward.

### Transaction Management Philosophy

Transactions belong in the service layer because:
- Services coordinate multi-model operations
- Services understand business requirements for atomicity
- Controllers don't need to know about transaction boundaries
- Models just execute queries (transactional or not)

### Email Handling

Email sending stays async via existing `sendToAdmins()` service:
- Email failures don't block tier upgrades
- Admins are notified but tier change succeeds
- Consider: Should email failure rollback tier change? (Current behavior: no)

### Future Improvements (Out of Scope)

Consider for future iterations:
1. Pagination for GET / endpoint (currently returns all orgs)
2. Filtering/search for GET / endpoint
3. Webhook notifications instead of email for tier changes
4. Audit logging for tier changes
5. Bulk operations support
6. Rate limiting on admin endpoints
7. GraphQL endpoint for richer queries
8. Caching for expensive enrichment operations
9. Background job for DFY project setup instead of inline
10. Rollback command for tier downgrades

---

## Appendix: Example Service Implementation

### TierManagementService.ts (Skeleton)

```typescript
import { db } from "../../../database/connection";
import { OrganizationModel, IOrganization } from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { sendToAdmins } from "../../../emails/emailService";
import { hostnameGenerator } from "../feature-utils/hostnameGenerator";
import { tierEmailTemplates } from "../feature-utils/tierEmailTemplates";
import { v4 as uuid } from "uuid";

export interface TierUpdateResult {
  success: boolean;
  tier?: string;
  message?: string;
  error?: string;
}

export class TierManagementService {

  static async updateTier(
    orgId: number,
    newTier: "DWY" | "DFY"
  ): Promise<TierUpdateResult> {
    const trx = await db.transaction();

    try {
      // Get org and old tier
      const org = await OrganizationModel.findById(orgId, trx);
      if (!org) {
        await trx.rollback();
        return { success: false, error: "Organization not found" };
      }

      const oldTier = org.subscription_tier;

      // Update tier
      await OrganizationModel.updateTier(orgId, newTier, trx);

      // Handle upgrade/downgrade
      if (oldTier === "DWY" && newTier === "DFY") {
        await this.handleDfyUpgrade(org, trx);
      } else if (oldTier === "DFY" && newTier === "DWY") {
        await this.handleDwyDowngrade(orgId, trx);
      }

      await trx.commit();

      return {
        success: true,
        tier: newTier,
        message: newTier === "DFY"
          ? "Organization upgraded. Website project created."
          : "Organization downgraded. Website is now read-only."
      };

    } catch (error: any) {
      await trx.rollback();
      return {
        success: false,
        error: error.message || "Failed to update tier"
      };
    }
  }

  private static async handleDfyUpgrade(
    org: IOrganization,
    trx: any
  ): Promise<void> {
    // Check for existing project
    const existingProject = await ProjectModel.findByOrganizationId(org.id, trx);
    if (existingProject) {
      return; // Project already exists
    }

    // Generate hostname
    const hostname = hostnameGenerator.generate(org.name);

    // Create project
    await ProjectModel.create({
      id: uuid(),
      organization_id: org.id,
      generated_hostname: hostname,
      status: "CREATED",
      created_at: new Date(),
      updated_at: new Date()
    }, trx);

    // Send email (fire and forget - don't block on failure)
    const emailBody = tierEmailTemplates.dfyUpgradeEmail(org, hostname);
    sendToAdmins(
      `New DFY Website Ready for Setup: ${org.name}`,
      emailBody
    ).catch(err => {
      console.error("Failed to send tier upgrade email:", err);
    });
  }

  private static async handleDwyDowngrade(
    orgId: number,
    trx: any
  ): Promise<void> {
    await ProjectModel.setReadOnly(orgId, trx);
  }
}
```

---

## Timeline Estimate

**Phase 1 (Foundation):** 4-6 hours
- 3 utilities: 1 hour each
- 2 model extensions: 30 min each
- Error handler move: 30 min
- Unit tests: 1 hour

**Phase 2 (Services):** 6-8 hours
- ConnectionDetectionService: 2 hours
- OrganizationEnrichmentService: 2 hours
- TierManagementService: 3 hours (most complex)
- Unit tests: 2 hours

**Phase 3 (Controller):** 3-4 hours
- AdminOrganizationsController: 2 hours
- Unit tests: 1.5 hours

**Phase 4 (Routes):** 1-2 hours
- Route refactor: 30 min
- Integration tests: 1 hour

**Phase 5 (Validation):** 2-3 hours
- Manual QA: 1 hour
- Documentation: 1 hour
- Deployment: 30 min

**Total Estimate: 16-23 hours** (2-3 days of focused work)

---

**Plan End**
