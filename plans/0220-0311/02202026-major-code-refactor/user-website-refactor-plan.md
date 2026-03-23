# User Website Route Refactor Plan

## 1. Current State

### Overview
- **File Location**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/user/website.ts`
- **Lines of Code**: 276 LOC
- **Endpoints**: 2
  - `GET /api/user/website` - Fetch user's organization website data (DFY tier only)
  - `POST /api/user/website/pages/:pageId/edit` - AI-powered page component edit with rate limiting

### Current Architecture
- Route file contains all logic: tier validation, rate limiting, storage calculation, database queries, AI service orchestration, error handling
- Direct database access via `db()` for multiple tables
- Helper function `handleError` for error handling (lines 12-19)
- Middleware chain: `tokenRefreshMiddleware` → `requireRole("admin", "manager")`
- Lazy import of `pageEditorService` for AI operations (line 228-230)

### Dependencies
- `express` - Router
- `../../database/connection` - Direct db() access (6 distinct queries)
- `../../middleware/tokenRefresh` - Authentication
- `../../middleware/rbac` - Role-based authorization
- `../../services/pageEditorService` - AI-powered HTML editing (lazy import)
- `uuid` - ID generation for user edits
- **Partial model usage** - Models exist but not utilized

### Current Database Operations

#### GET `/` Endpoint (lines 25-114)
1. **Line 38**: `db("organizations").where({ id: orgId }).first()`
   - Fetch organization to check subscription tier
   - Purpose: DFY tier validation

2. **Lines 50-52**: `db("website_builder.projects").where({ organization_id: orgId }).first()`
   - Fetch project by organization ID
   - Purpose: Check if website exists

3. **Lines 63-65**: `db("website_builder.pages").where({ project_id, status: "published" }).orderBy("path")`
   - Fetch all published pages
   - Purpose: Display published pages only to users

4. **Lines 68-70**: `db("website_builder.media").where({ project_id }).orderBy("created_at", "desc")`
   - Fetch all media items
   - Purpose: Display media library

5. **Lines 83-87**: `db("website_builder.user_edits").where({ organization_id: orgId }).where("created_at", ">=", today).count("* as count").first()`
   - Count today's edits for rate limiting display
   - Purpose: Show user remaining edits

#### POST `/pages/:pageId/edit` Endpoint (lines 121-274)
1. **Line 145**: `db("organizations").where({ id: orgId }).first()`
   - Fetch organization for tier validation
   - Purpose: Ensure DFY tier access

2. **Lines 150-152**: `db("website_builder.projects").where({ organization_id: orgId }).first()`
   - Fetch project to verify ownership and check read-only status
   - Purpose: Access control and read-only check

3. **Lines 170-174**: `db("website_builder.user_edits").where({ organization_id: orgId }).where("created_at", ">=", today).count("* as count").first()`
   - Count today's edits for rate limiting
   - Purpose: Enforce 50 edits/day limit

4. **Lines 189-191**: `db("website_builder.pages").where({ id: pageId, project_id }).first()`
   - Verify page exists and belongs to project
   - Purpose: Page ownership verification

5. **Lines 198-208**: `db("website_builder.media").where({ project_id }).orderBy("created_at", "desc").select(...)`
   - Fetch media library for AI context
   - Purpose: Provide available media URLs to AI

6. **Lines 243-255**: `db("website_builder.user_edits").insert({ ... })`
   - Log user edit operation
   - Purpose: Audit trail and rate limiting enforcement

### Business Logic Present

#### GET Endpoint
- **Tier validation** (lines 41-47): DFY tier requirement enforcement
- **PREPARING state handling** (lines 54-60): Return status message if no project exists yet
- **Storage calculation** (lines 73-77): Sum all media file sizes for usage display
- **Storage percentage** (line 105): Calculate usage percentage against 1GB limit
- **Date manipulation** (lines 80-81): Reset hours for "today" boundary
- **Response transformation** (lines 89-109): Format project, pages, media, and usage data

#### POST Endpoint
- **Input validation** (lines 133-138): Required fields check
- **Tier validation** (lines 144-148): DFY tier requirement
- **Read-only enforcement** (lines 158-164): Prevent edits on frozen projects
- **Rate limiting logic** (lines 166-186): 50 edits/day limit with reset logic
- **Media context building** (lines 210-221): Format media library for AI prompt
- **AI orchestration** (lines 233-240): Call pageEditorService with user-specific prompt
- **Audit logging** (lines 243-255): Record edit attempt with success/failure
- **Response calculation** (line 264): Calculate remaining edits for user

### Service Dependencies
- **pageEditorService.editHtmlComponent**: External AI service for HTML editing
  - Input: alloroClass, currentHtml, instruction, chatHistory, mediaContext, promptType
  - Output: { editedHtml, message, rejected, debug }
  - Lazy loaded to reduce cold start time

### Constants & Magic Numbers
- **Storage limit**: 1GB (1 * 1024 * 1024 * 1024) - line 77
- **Daily edit limit**: 50 - line 176
- **Subscription tier**: "DFY" - required tier for access
- **Page status filter**: "published" - only published pages shown to users
- **Prompt type**: "user" - stricter AI constraints vs admin

### Error Handling
- Generic `handleError` helper (lines 12-19)
- Specific error codes: `DFY_TIER_REQUIRED`, `READ_ONLY`, `RATE_LIMIT_EXCEEDED`, `INVALID_INPUT`, `EDIT_ERROR`
- Console logging with `[User/Website]` prefix
- Status codes: 400 (validation), 403 (tier/permission), 404 (not found), 429 (rate limit), 500 (server error)

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── user/
│       └── website.ts                                    # Route definitions only (15-20 LOC)
├── controllers/
│   └── user-website/
│       ├── UserWebsiteController.ts                      # Main controller (80-100 LOC)
│       ├── user-website-services/
│       │   ├── website-fetch.service.ts                  # GET logic (60-80 LOC)
│       │   ├── page-edit.service.ts                      # POST edit orchestration (80-100 LOC)
│       │   ├── rate-limiting.service.ts                  # Rate limit logic (40-50 LOC)
│       │   └── media-context.service.ts                  # Media context building (30-40 LOC)
│       └── user-website-utils/
│           ├── validation.util.ts                        # Input validation (30-40 LOC)
│           ├── tier-check.util.ts                        # DFY tier validation (20-30 LOC)
│           ├── storage-calculation.util.ts               # Storage math (20-30 LOC)
│           ├── response-formatting.util.ts               # Response structures (40-50 LOC)
│           └── error-handling.util.ts                    # Error types & handlers (30-40 LOC)
└── models/
    ├── OrganizationModel.ts                              # Already exists
    └── website-builder/
        ├── ProjectModel.ts                               # Already exists (needs enhancement)
        ├── PageModel.ts                                  # Already exists
        ├── MediaModel.ts                                 # Already exists (needs enhancement)
        └── UserEditModel.ts                              # Already exists (needs enhancement)
```

### Layer Responsibilities

#### **routes/user/website.ts** (15-20 LOC)
- Route definitions only
- Middleware attachment (`tokenRefreshMiddleware`, `requireRole`)
- Controller method delegation
- No logic, no validation, no error handling
- Example:
  ```typescript
  router.get("/", tokenRefreshMiddleware, requireRole("admin", "manager"),
    UserWebsiteController.getUserWebsite);
  router.post("/pages/:pageId/edit", tokenRefreshMiddleware, requireRole("admin", "manager"),
    UserWebsiteController.editPageComponent);
  ```

#### **controllers/user-website/UserWebsiteController.ts** (80-100 LOC)
- Request extraction (`req.organizationId`, `req.userId`, `req.params`, `req.body`)
- Call validation utils
- Call tier-check utils
- Delegate to service layer
- Call response formatting utils
- Error handling wrapper (try/catch with specific error types)
- No direct model calls
- No business logic
- No database queries

**Methods**:
- `getUserWebsite(req: RBACRequest, res: Response)` - GET handler
- `editPageComponent(req: RBACRequest, res: Response)` - POST handler

#### **controllers/user-website/user-website-services/** (Service Layer)

##### **website-fetch.service.ts** (60-80 LOC)
- Orchestrates website data fetching
- Calls multiple models (Organization, Project, Page, Media, UserEdit)
- Implements business logic for data aggregation
- Handles PREPARING state logic
- Returns structured data object
- Pure business logic - no req/res objects

**Methods**:
- `fetchUserWebsiteData(orgId: number): Promise<WebsiteData | PreparingState>`

##### **page-edit.service.ts** (80-100 LOC)
- Orchestrates page editing workflow
- Validates page ownership
- Checks read-only status
- Enforces rate limiting (delegates to rate-limiting service)
- Builds media context (delegates to media-context service)
- Calls pageEditorService for AI editing
- Logs edit to UserEditModel
- Returns edit result
- No req/res objects

**Methods**:
- `editPageComponent(params: EditPageParams): Promise<EditResult>`

##### **rate-limiting.service.ts** (40-50 LOC)
- Rate limiting business logic
- Fetches today's edit count via UserEditModel
- Enforces 50/day limit
- Calculates remaining edits
- Throws RateLimitError when exceeded
- Pure function - reusable across controllers

**Methods**:
- `checkRateLimit(orgId: number): Promise<{ count: number; remaining: number }>`
- `getRemainingEdits(orgId: number): Promise<number>`

##### **media-context.service.ts** (30-40 LOC)
- Builds media context string for AI
- Fetches media from MediaModel
- Formats media items into markdown-style context
- Returns formatted string for prompt injection

**Methods**:
- `buildMediaContext(projectId: string): Promise<string>`

#### **controllers/user-website/user-website-utils/** (Utility Layer)

##### **validation.util.ts** (30-40 LOC)
- Input validation functions
- Validates required fields for edit request
- Validates organizationId presence
- Throws ValidationError with specific messages
- Pure functions (no side effects)

**Functions**:
- `validateEditInput(data: unknown): asserts data is EditInput`
- `validateOrganizationId(orgId: unknown): asserts orgId is number`

##### **tier-check.util.ts** (20-30 LOC)
- DFY tier validation helper
- Takes IOrganization object
- Returns boolean or throws TierError
- Reusable across user-tier routes

**Functions**:
- `requireDFYTier(org: IOrganization): void`
- `isDFYTier(org: IOrganization): boolean`

##### **storage-calculation.util.ts** (20-30 LOC)
- Storage calculation helpers
- Calculates total bytes from media array
- Calculates percentage
- Formats bytes for display
- Pure functions

**Functions**:
- `calculateStorageUsed(media: IMedia[]): number`
- `calculateStoragePercentage(used: number, limit: number): number`
- `getStorageLimit(): number` - Returns 1GB constant

##### **response-formatting.util.ts** (40-50 LOC)
- Response structure builders
- Formats website data response
- Formats edit response with remaining edits
- Formats PREPARING state response
- No business logic

**Functions**:
- `formatWebsiteResponse(data: WebsiteServiceResult): WebsiteResponse`
- `formatEditResponse(result: EditResult, remaining: number): EditResponse`
- `formatPreparingResponse(): PreparingResponse`

##### **error-handling.util.ts** (30-40 LOC)
- Custom error classes
- Error response formatting
- HTTP status code mapping
- Error logging with [User/Website] prefix

**Classes**:
- `TierError extends Error` - 403
- `RateLimitError extends Error` - 429
- `ValidationError extends Error` - 400
- `ReadOnlyError extends Error` - 403

**Functions**:
- `handleControllerError(error: Error, res: Response): void`
- `logError(operation: string, error: Error): void`

---

## 3. Model Enhancements Required

### OrganizationModel.ts
**Status**: Exists, sufficient methods available
- `findById(id: number)` - Already exists ✓
- No changes needed

### ProjectModel.ts
**Status**: Exists, needs enhancement
- `findByOrganizationId(orgId: number)` - Already exists ✓
- **ADD**: `findByOrganizationIdWithReadOnlyCheck(orgId: number): Promise<IProject | undefined>`
  - Returns project with explicit read-only field handling

### PageModel.ts
**Status**: Exists, needs enhancement
- `findById(id: string)` - Already exists ✓
- `findByProjectId(projectId: string, status?: string)` - Already exists ✓
- **ADD**: `findByIdAndProject(pageId: string, projectId: string): Promise<IPage | undefined>`
  - Verifies page ownership within project (lines 189-191 replacement)

### MediaModel.ts
**Status**: Exists, needs significant enhancement
- `getProjectStorageUsage(projectId: string)` - Already exists ✓ (but needs verification)
- **ADD**: `findAllByProjectId(projectId: string): Promise<IMedia[]>`
  - Non-paginated fetch for storage calculation and context building
- **ADD**: `findForAIContext(projectId: string): Promise<Pick<IMedia, "display_name" | "s3_url" | "alt_text" | "mime_type" | "width" | "height">[]>`
  - Optimized query for AI context with specific fields (lines 198-208 replacement)

### UserEditModel.ts
**Status**: Exists, needs minor enhancement
- `countTodayByOrg(orgId: number)` - Already exists ✓
- **ADD**: `logEdit(data: UserEditLogData): Promise<IUserEdit>`
  - Wrapper around create with required fields enforcement
  - Type-safe insertion (lines 243-255 replacement)

---

## 4. Detailed Mapping

### GET `/api/user/website` Mapping

| Current Location | Logic | Target Destination | Method/Function |
|------------------|-------|-------------------|-----------------|
| Lines 31-35 | Extract orgId, validate presence | Controller | `getUserWebsite` - input extraction |
| Lines 33-35 | Check orgId presence | Utils | `validation.util.ts::validateOrganizationId` |
| Line 38 | Fetch organization | Service | `website-fetch.service.ts` → `OrganizationModel.findById` |
| Lines 41-47 | Check DFY tier | Utils | `tier-check.util.ts::requireDFYTier` |
| Lines 50-52 | Fetch project | Service | `website-fetch.service.ts` → `ProjectModel.findByOrganizationId` |
| Lines 54-60 | PREPARING state logic | Service | `website-fetch.service.ts::handlePreparingState` |
| Lines 63-65 | Fetch published pages | Service | `website-fetch.service.ts` → `PageModel.findByProjectId(projectId, "published")` |
| Lines 68-70 | Fetch media | Service | `website-fetch.service.ts` → `MediaModel.findAllByProjectId` |
| Lines 73-77 | Calculate storage | Utils | `storage-calculation.util.ts::calculateStorageUsed` |
| Line 77 | Storage limit | Utils | `storage-calculation.util.ts::getStorageLimit()` |
| Line 105 | Storage percentage | Utils | `storage-calculation.util.ts::calculateStoragePercentage` |
| Lines 80-87 | Count today's edits | Service | `website-fetch.service.ts` → `UserEditModel.countTodayByOrg` |
| Lines 89-109 | Format response | Utils | `response-formatting.util.ts::formatWebsiteResponse` |
| Line 111 | Error handling | Utils | `error-handling.util.ts::handleControllerError` |

### POST `/pages/:pageId/edit` Mapping

| Current Location | Logic | Target Destination | Method/Function |
|------------------|-------|-------------------|-----------------|
| Lines 127-132 | Extract params + body | Controller | `editPageComponent` - input extraction |
| Lines 133-138 | Validate input fields | Utils | `validation.util.ts::validateEditInput` |
| Lines 140-142 | Validate orgId | Utils | `validation.util.ts::validateOrganizationId` |
| Line 145 | Fetch organization | Service | `page-edit.service.ts` → `OrganizationModel.findById` |
| Lines 146-148 | Check DFY tier | Utils | `tier-check.util.ts::requireDFYTier` |
| Lines 150-152 | Fetch project | Service | `page-edit.service.ts` → `ProjectModel.findByOrganizationId` |
| Lines 154-156 | Project not found | Service | `page-edit.service.ts` - throw NotFoundError |
| Lines 158-164 | Check read-only status | Service | `page-edit.service.ts::checkReadOnlyStatus` |
| Lines 166-186 | Rate limiting logic | Service | `rate-limiting.service.ts::checkRateLimit` |
| Lines 189-194 | Fetch & verify page | Service | `page-edit.service.ts` → `PageModel.findByIdAndProject` |
| Lines 198-208 | Fetch media for context | Service | `media-context.service.ts` → `MediaModel.findForAIContext` |
| Lines 210-221 | Build media context string | Service | `media-context.service.ts::buildMediaContext` |
| Lines 223-225 | Log edit request | Service | `page-edit.service.ts` - console.log |
| Lines 228-240 | Call AI service | Service | `page-edit.service.ts` - pageEditorService.editHtmlComponent |
| Lines 243-255 | Log edit to DB | Service | `page-edit.service.ts` → `UserEditModel.logEdit` |
| Line 257 | Log completion | Service | `page-edit.service.ts` - console.log |
| Lines 259-265 | Format success response | Utils | `response-formatting.util.ts::formatEditResponse` |
| Lines 266-272 | Error handling | Utils | `error-handling.util.ts::handleControllerError` |

---

## 5. Step-by-Step Migration Plan

### Phase 1: Model Enhancements (Foundation)
**Goal**: Ensure all required model methods exist before building services

#### Step 1.1: Enhance ProjectModel
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/ProjectModel.ts`
- **Changes**: Add `findByOrganizationIdWithReadOnlyCheck` method (optional - read_only field already in IProject)
- **Verification**: No change needed - `findByOrganizationId` returns full project including `is_read_only`

#### Step 1.2: Enhance PageModel
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/PageModel.ts`
- **Changes**: Add `findByIdAndProject(pageId: string, projectId: string)`
- **SQL Equivalent**: `WHERE id = pageId AND project_id = projectId`
- **Test**: Verify ownership check works correctly

#### Step 1.3: Enhance MediaModel
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/MediaModel.ts`
- **Changes**:
  1. Add `findAllByProjectId(projectId: string): Promise<IMedia[]>`
     - Non-paginated, ordered by `created_at DESC`
  2. Add `findForAIContext(projectId: string)` with specific field selection
     - Select only: display_name, s3_url, alt_text, mime_type, width, height
- **Test**: Verify storage calculation matches current behavior

#### Step 1.4: Enhance UserEditModel
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/UserEditModel.ts`
- **Changes**: Add `logEdit` method with typed parameters
- **Interface**:
  ```typescript
  interface UserEditLogData {
    organization_id: number;
    user_id: number;
    project_id: string;
    page_id: string;
    component_class: string;
    instruction: string;
    tokens_used: number;
    success: boolean;
    error_message: string | null;
  }
  ```
- **Test**: Verify audit log insertion

### Phase 2: Utility Functions (Pure Logic)
**Goal**: Extract pure functions first - easiest to test, no dependencies

#### Step 2.1: Create storage-calculation.util.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/storage-calculation.util.ts`
- **Extract from**: Lines 73-77, 105, 77
- **Functions**:
  ```typescript
  export const calculateStorageUsed = (media: IMedia[]): number
  export const getStorageLimit = (): number
  export const calculateStoragePercentage = (used: number, limit: number): number
  ```
- **Test**: Unit test with sample media arrays

#### Step 2.2: Create tier-check.util.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/tier-check.util.ts`
- **Extract from**: Lines 41-47, 146-148
- **Functions**:
  ```typescript
  export const requireDFYTier = (org: IOrganization): void
  export const isDFYTier = (org: IOrganization): boolean
  ```
- **Throws**: `TierError` with message
- **Test**: Test with DWY, DFY, null tiers

#### Step 2.3: Create validation.util.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/validation.util.ts`
- **Extract from**: Lines 33-35, 133-142
- **Functions**:
  ```typescript
  export const validateOrganizationId = (orgId: unknown): asserts orgId is number
  export const validateEditInput = (data: unknown): asserts data is EditInput
  ```
- **Throws**: `ValidationError`
- **Test**: Test with invalid inputs

#### Step 2.4: Create error-handling.util.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/error-handling.util.ts`
- **Extract from**: Lines 12-19, error responses throughout
- **Classes**: TierError, RateLimitError, ValidationError, ReadOnlyError, NotFoundError
- **Functions**: `handleControllerError`, `logError`
- **Test**: Test error mapping to status codes

#### Step 2.5: Create response-formatting.util.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/response-formatting.util.ts`
- **Extract from**: Lines 89-109, 259-265, 54-60
- **Functions**:
  ```typescript
  export const formatWebsiteResponse = (data: WebsiteServiceResult): WebsiteResponse
  export const formatEditResponse = (result: EditResult, remaining: number): EditResponse
  export const formatPreparingResponse = (): PreparingResponse
  ```
- **Test**: Test response structure consistency

### Phase 3: Service Layer (Business Logic)
**Goal**: Extract orchestration logic - depends on models and utils

#### Step 3.1: Create rate-limiting.service.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/rate-limiting.service.ts`
- **Extract from**: Lines 166-186
- **Dependencies**: UserEditModel
- **Functions**:
  ```typescript
  export const checkRateLimit = async (orgId: number): Promise<RateLimitResult>
  export const getRemainingEdits = async (orgId: number): Promise<number>
  ```
- **Constants**: DAILY_EDIT_LIMIT = 50
- **Test**: Test rate limit enforcement, reset at midnight

#### Step 3.2: Create media-context.service.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/media-context.service.ts`
- **Extract from**: Lines 198-221
- **Dependencies**: MediaModel
- **Functions**:
  ```typescript
  export const buildMediaContext = async (projectId: string): Promise<string>
  ```
- **Test**: Test markdown formatting, empty media library case

#### Step 3.3: Create website-fetch.service.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/website-fetch.service.ts`
- **Extract from**: Lines 38-109
- **Dependencies**: OrganizationModel, ProjectModel, PageModel, MediaModel, UserEditModel, tier-check.util, storage-calculation.util
- **Functions**:
  ```typescript
  export const fetchUserWebsiteData = async (orgId: number): Promise<WebsiteData | PreparingState>
  ```
- **Logic Flow**:
  1. Fetch organization → validate DFY tier
  2. Fetch project → return PREPARING if none
  3. Fetch pages (published only)
  4. Fetch media
  5. Calculate storage
  6. Count today's edits
  7. Return aggregated data
- **Test**: Test PREPARING state, full data state, DWY rejection

#### Step 3.4: Create page-edit.service.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/page-edit.service.ts`
- **Extract from**: Lines 145-265
- **Dependencies**:
  - Models: OrganizationModel, ProjectModel, PageModel, UserEditModel
  - Services: rate-limiting.service, media-context.service, pageEditorService (existing)
  - Utils: tier-check.util
- **Functions**:
  ```typescript
  export const editPageComponent = async (params: EditPageParams): Promise<EditResult>
  ```
- **Logic Flow**:
  1. Fetch organization → validate DFY tier
  2. Fetch project → check exists
  3. Check read-only status → throw if true
  4. Check rate limit → throw if exceeded
  5. Verify page exists and ownership
  6. Build media context
  7. Call AI service
  8. Log edit attempt
  9. Return result
- **Test**: Test rate limit, read-only, page not found, AI rejection

### Phase 4: Controller Layer (Request/Response Handling)
**Goal**: Thin controllers that delegate to services

#### Step 4.1: Create UserWebsiteController.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/UserWebsiteController.ts`
- **Extract from**: Lines 25-114, 121-274
- **Methods**:
  1. `getUserWebsite(req: RBACRequest, res: Response)` - GET handler
  2. `editPageComponent(req: RBACRequest, res: Response)` - POST handler
- **Structure** (per method):
  ```typescript
  public static async getUserWebsite(req: RBACRequest, res: Response) {
    try {
      // 1. Extract inputs
      // 2. Validate inputs
      // 3. Call service
      // 4. Format response
      // 5. Send response
    } catch (error) {
      handleControllerError(error, res);
    }
  }
  ```
- **Test**: Integration tests with mocked services

### Phase 5: Route Refactor (Final Step)
**Goal**: Thin route file that only registers routes

#### Step 5.1: Refactor routes/user/website.ts
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/user/website.ts`
- **Changes**:
  1. Remove all logic (lines 12-274)
  2. Import UserWebsiteController
  3. Register routes with controller methods
- **Final Structure** (~15 LOC):
  ```typescript
  import express from "express";
  import { tokenRefreshMiddleware } from "../../middleware/tokenRefresh";
  import { requireRole } from "../../middleware/rbac";
  import { UserWebsiteController } from "../../controllers/user-website/UserWebsiteController";

  const userWebsiteRoutes = express.Router();

  userWebsiteRoutes.get(
    "/",
    tokenRefreshMiddleware,
    requireRole("admin", "manager"),
    UserWebsiteController.getUserWebsite
  );

  userWebsiteRoutes.post(
    "/pages/:pageId/edit",
    tokenRefreshMiddleware,
    requireRole("admin", "manager"),
    UserWebsiteController.editPageComponent
  );

  export default userWebsiteRoutes;
  ```
- **Test**: Smoke test all endpoints still work

### Phase 6: Cleanup & Verification
**Goal**: Remove unused code, verify tests pass

#### Step 6.1: Remove unused imports
- Remove direct db() imports from route file
- Remove handleError helper
- Remove uuid import from route file (move to service)

#### Step 6.2: Update imports throughout
- Verify all cross-file imports are correct
- Check circular dependency issues

#### Step 6.3: Run tests
- Unit tests for utils (pure functions)
- Service tests (mocked models)
- Controller tests (mocked services)
- Integration tests (full stack)

---

## 6. Files to Create

### Controllers
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/UserWebsiteController.ts` (80-100 LOC)

### Services
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/website-fetch.service.ts` (60-80 LOC)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/page-edit.service.ts` (80-100 LOC)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/rate-limiting.service.ts` (40-50 LOC)
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-services/media-context.service.ts` (30-40 LOC)

### Utils
6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/validation.util.ts` (30-40 LOC)
7. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/tier-check.util.ts` (20-30 LOC)
8. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/storage-calculation.util.ts` (20-30 LOC)
9. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/response-formatting.util.ts` (40-50 LOC)
10. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/user-website/user-website-utils/error-handling.util.ts` (30-40 LOC)

**Total New Files**: 10
**Total New LOC**: ~430-520 (down from 276 LOC monolithic, but properly separated)

---

## 7. Files to Modify

### Models (Enhancements)
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/PageModel.ts`
   - Add `findByIdAndProject` method
   - ~10 LOC addition

2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/MediaModel.ts`
   - Add `findAllByProjectId` method
   - Add `findForAIContext` method
   - ~25 LOC addition

3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/UserEditModel.ts`
   - Add `logEdit` method
   - Add `UserEditLogData` interface
   - ~20 LOC addition

### Routes (Complete Refactor)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/user/website.ts`
   - **Before**: 276 LOC
   - **After**: ~15 LOC
   - **Change**: Remove all logic, keep only route registration

**Total Modified Files**: 4

---

## 8. Risk Assessment

### High Risk Areas

#### 1. Rate Limiting Logic (Lines 166-186)
**Risk Level**: HIGH
**Current Behavior**:
- Counts edits from midnight (00:00:00) of current day
- Enforces 50 edits/day limit
- Date boundary logic: `today.setHours(0, 0, 0, 0)`

**Migration Risk**:
- Date timezone handling must be preserved exactly
- Off-by-one errors could allow 51 edits or block at 49
- Race condition if multiple requests hit simultaneously near limit

**Mitigation**:
- Extract date logic to testable function
- Add explicit timezone handling (currently implicit)
- Consider database-level atomic counting
- Add comprehensive unit tests for boundary cases (49, 50, 51 edits)
- Test midnight rollover scenario

#### 2. Storage Calculation (Lines 73-77)
**Risk Level**: MEDIUM
**Current Behavior**:
- Sum all media file_size fields
- Assumes file_size is always a number
- Handles null with `|| 0` fallback

**Migration Risk**:
- Type coercion differences between reduce and sum()
- Null/undefined handling in different contexts
- Floating point precision issues

**Mitigation**:
- Verify MediaModel.getProjectStorageUsage() matches reduce behavior
- Add explicit null coalescing in model method
- Unit test with null file_size values
- Compare results before/after migration with real data

#### 3. Media Context Building (Lines 210-221)
**Risk Level**: MEDIUM
**Current Behavior**:
- Builds markdown-formatted string for AI prompt
- Specific format: "**Name**altText dimensions\n  URL: ...\n  Type: ...\n\n"
- Empty string if no media

**Migration Risk**:
- AI prompt changes could affect AI behavior
- String formatting differences (whitespace, newlines)
- Template literals vs concatenation differences

**Mitigation**:
- Preserve exact string format in new service
- Test with media context extractor
- Compare generated strings before/after migration
- AI regression testing if possible

#### 4. PREPARING State Logic (Lines 54-60)
**Risk Level**: LOW
**Current Behavior**:
- Returns early if no project found
- Specific JSON structure: `{ status: "PREPARING", message: "..." }`

**Migration Risk**:
- Frontend depends on this exact structure
- Early return vs exception flow

**Mitigation**:
- Document contract clearly in service
- Use typed response interfaces
- Test both project exists and not exists scenarios

#### 5. Page Ownership Verification (Lines 189-191)
**Risk Level**: HIGH
**Current Behavior**:
- Verifies page belongs to project: `WHERE id = pageId AND project_id = project.id`
- Returns 404 if not found
- Security boundary: prevents cross-project page access

**Migration Risk**:
- Authorization bypass if logic is wrong
- SQL injection if not parameterized (should be safe with Knex)
- Logic error could expose other org's pages

**Mitigation**:
- Security review of new PageModel method
- Integration tests with cross-org attempts
- Explicit security test: try to edit page from different org
- Code review required before deployment

### Medium Risk Areas

#### 6. Read-Only Status Check (Lines 158-164)
**Risk Level**: MEDIUM
**Current Behavior**:
- Checks `project.is_read_only` boolean
- Returns 403 if true
- Prevents any edits when frozen

**Migration Risk**:
- Type coercion (truthy vs true)
- Null handling if field is nullable

**Mitigation**:
- Explicit boolean check: `=== true`
- Test with null, undefined, false, true values

#### 7. AI Service Integration (Lines 228-240)
**Risk Level**: MEDIUM
**Current Behavior**:
- Lazy import of pageEditorService
- Passes promptType: "user" for stricter constraints
- Returns { editedHtml, message, rejected, debug }

**Migration Risk**:
- Import path changes
- Service contract changes
- Error handling from AI service

**Mitigation**:
- Keep AI service as external dependency
- Mock AI service in tests
- Document promptType importance

#### 8. Error Response Structure (Lines 12-19, various)
**Risk Level**: MEDIUM
**Current Behavior**:
- Specific error codes: DFY_TIER_REQUIRED, READ_ONLY, RATE_LIMIT_EXCEEDED, etc.
- Console logging with [User/Website] prefix
- Varied status codes: 400, 403, 404, 429, 500

**Migration Risk**:
- Frontend depends on specific error codes
- Logging format changes could break monitoring
- Status code changes could break client error handling

**Mitigation**:
- Maintain exact error code strings
- Preserve logging format
- Document all error response structures
- Integration tests for each error scenario

### Low Risk Areas

#### 9. Response Formatting (Lines 89-109, 259-265)
**Risk Level**: LOW
**Current Behavior**:
- Structured JSON responses with consistent shapes

**Migration Risk**:
- Field name typos
- Missing fields

**Mitigation**:
- Use TypeScript interfaces
- Integration tests verify response structure

#### 10. Input Validation (Lines 133-138)
**Risk Level**: LOW
**Current Behavior**:
- Checks required fields: alloroClass, currentHtml, instruction
- Returns 400 if missing

**Migration Risk**:
- Validation logic gets looser or stricter

**Mitigation**:
- Unit tests for validation functions
- Test required vs optional fields

### Deployment Risks

#### 11. Atomic Migration
**Risk**: Cannot do gradual rollout of route refactor
**Impact**: All-or-nothing deployment

**Mitigation**:
- Deploy model enhancements first (backward compatible)
- Deploy services and controllers (unused initially)
- Deploy route refactor last (breaking change)
- Rollback plan: revert route file only

#### 12. Import Path Changes
**Risk**: Runtime errors from incorrect imports
**Impact**: 500 errors on all requests

**Mitigation**:
- TypeScript compilation catches most issues
- Pre-deployment smoke tests
- Canary deployment if possible

#### 13. Database Query Performance
**Risk**: New queries perform differently
**Impact**: Slower response times

**Mitigation**:
- Compare query plans before/after
- Load testing with production-like data
- Monitor query times in staging

---

## 9. Testing Strategy

### Unit Tests

#### Utils (Pure Functions)
- `storage-calculation.util.ts`:
  - Test calculateStorageUsed with empty, single, multiple media items
  - Test with null file_size values
  - Test calculateStoragePercentage edge cases (0%, 100%, >100%)
  - Test getStorageLimit returns correct constant

- `tier-check.util.ts`:
  - Test requireDFYTier with DWY (should throw)
  - Test requireDFYTier with DFY (should pass)
  - Test requireDFYTier with null tier (should throw)
  - Test isDFYTier returns correct boolean

- `validation.util.ts`:
  - Test validateEditInput with missing fields (each field)
  - Test validateEditInput with valid input
  - Test validateOrganizationId with undefined, null, string, number

- `response-formatting.util.ts`:
  - Test formatWebsiteResponse with full data
  - Test formatPreparingResponse structure
  - Test formatEditResponse with various remaining counts

- `error-handling.util.ts`:
  - Test each error class creates correct status code
  - Test handleControllerError sends correct responses
  - Test logError formats correctly

### Service Tests (Mocked Models)

#### website-fetch.service.ts
- Mock OrganizationModel, ProjectModel, PageModel, MediaModel, UserEditModel
- Test PREPARING state returned when no project
- Test DWY tier rejected
- Test DFY tier with full data aggregation
- Test storage calculation integration
- Test edits count integration

#### page-edit.service.ts
- Mock all models and services
- Test rate limit exceeded scenario
- Test read-only project rejection
- Test page not found
- Test page ownership validation (cross-project attempt)
- Test AI rejection handling
- Test successful edit flow
- Test edit logging on success and failure

#### rate-limiting.service.ts
- Mock UserEditModel
- Test count below limit (should pass)
- Test count at limit (should block)
- Test remaining edits calculation
- Test midnight boundary (mock dates)

#### media-context.service.ts
- Mock MediaModel
- Test empty media library
- Test single media item formatting
- Test multiple media items
- Test with/without dimensions
- Test with/without alt text

### Controller Tests (Mocked Services)

#### UserWebsiteController.getUserWebsite
- Mock website-fetch.service
- Test successful response formatting
- Test PREPARING state handling
- Test error handling (service throws)
- Test validation error handling
- Test tier error handling

#### UserWebsiteController.editPageComponent
- Mock page-edit.service, rate-limiting.service
- Test successful edit
- Test validation errors
- Test rate limit errors
- Test read-only errors
- Test page not found errors
- Test AI rejection handling

### Integration Tests (Full Stack)

#### GET /api/user/website
- Test with DWY org (should 403)
- Test with DFY org, no project (should return PREPARING)
- Test with DFY org, full project (should return all data)
- Test with no org (should 400)
- Test storage calculation accuracy
- Test edit count accuracy

#### POST /api/user/website/pages/:pageId/edit
- Test successful edit (mock AI service)
- Test rate limit enforcement (49, 50, 51 edits)
- Test read-only project
- Test cross-org page access (security)
- Test invalid page ID
- Test missing required fields
- Test AI rejection
- Test edit logging

### Regression Tests
- **Before migration**: Capture all API responses for test scenarios
- **After migration**: Verify responses match exactly (except timing)
- **Key scenarios**:
  - GET with full project data
  - GET with PREPARING state
  - POST successful edit
  - POST rate limited
  - POST read-only

---

## 10. Rollback Plan

### Pre-Deployment Backup
1. Tag current commit: `git tag pre-user-website-refactor`
2. Document current route file location
3. Backup database schema (if migrations ran)

### Rollback Procedure

#### If caught in staging:
1. Revert last commit
2. Restart staging server
3. Run smoke tests

#### If caught in production:
**Immediate (< 5 minutes)**:
1. Revert route file only: `git checkout HEAD~1 src/routes/user/website.ts`
2. Hot reload application (if supported) or restart
3. Verify GET and POST endpoints functional

**Full Rollback (< 15 minutes)**:
1. `git revert <refactor-commit-sha>`
2. Deploy reverted code
3. Verify all endpoints functional
4. Monitor error rates

**Post-Rollback**:
1. Analyze failure cause
2. Fix in development
3. Re-test thoroughly
4. Re-deploy when stable

### Rollback Risk Assessment
- **Low Risk**: Route file is self-contained
- **No Database Changes**: No schema migrations in this refactor
- **No External Dependencies**: AI service unchanged
- **Backward Compatible Models**: Enhanced models don't break existing code

---

## 11. Performance Considerations

### Query Optimization

#### Current Query Count (GET endpoint)
1. Organizations (1 query)
2. Projects (1 query)
3. Pages (1 query)
4. Media (1 query)
5. User edits count (1 query)
**Total**: 5 queries

#### After Refactor (GET endpoint)
**Same**: 5 queries (no change)
**Optimization Opportunity**: Could combine org + project fetch
**Decision**: Keep separate for clarity, optimize later if needed

#### Current Query Count (POST endpoint)
1. Organizations (1 query)
2. Projects (1 query)
3. User edits count (1 query)
4. Pages (1 query)
5. Media (1 query)
6. User edits insert (1 query)
**Total**: 6 queries

#### After Refactor (POST endpoint)
**Same**: 6 queries (no change)

### Response Time Analysis
- **Current Average**: ~200-400ms (estimated, depends on AI service)
- **Expected After Refactor**: ~200-400ms (no significant change)
- **Breakdown**:
  - Database queries: ~50-100ms
  - AI service call: ~100-250ms (POST only)
  - Logic/formatting: ~10-20ms

### Caching Opportunities (Future)
- **Organization tier**: Cache for 1 hour (rarely changes)
- **Project metadata**: Cache for 5 minutes
- **Media library**: Cache for 1 minute
- **Edit count**: Don't cache (must be real-time)

---

## 12. Security Review Checklist

### Authorization Boundaries
- [x] Organization ID verified from JWT token (req.organizationId)
- [x] User ID verified from JWT token (req.userId)
- [x] Page ownership verified (page belongs to user's org's project)
- [x] Role requirement: "admin" or "manager" (via requireRole middleware)

### Input Validation
- [x] alloroClass: Required string (POST)
- [x] currentHtml: Required string (POST)
- [x] instruction: Required string (POST)
- [x] pageId: From URL params, validated in DB query (POST)
- [x] chatHistory: Optional array (POST)

### Rate Limiting
- [x] 50 edits/day per organization
- [x] Applied to all edit operations
- [x] Cannot be bypassed via client

### Data Exposure
- [x] Published pages only (GET) - correct for user tier
- [x] Own organization data only (GET)
- [x] Media library URLs exposed (expected - public S3 URLs)
- [x] No sensitive organization data exposed

### Injection Risks
- [x] SQL injection: Mitigated by Knex parameterization
- [x] HTML injection: AI service handles HTML sanitization (verify)
- [x] Prompt injection: AI service has guardrails (verify)

### Error Information Leakage
- [x] Generic error messages to client
- [x] Detailed errors only in server logs
- [x] No stack traces to client

---

## 13. Monitoring & Observability

### Metrics to Add
1. **Rate Limiting**:
   - Counter: `user_website_edits_total` (by org_id, success/failure)
   - Gauge: `user_website_edits_remaining` (by org_id)
   - Counter: `user_website_rate_limit_hits_total`

2. **API Performance**:
   - Histogram: `user_website_get_duration_seconds`
   - Histogram: `user_website_edit_duration_seconds`
   - Counter: `user_website_get_requests_total` (by status code)
   - Counter: `user_website_edit_requests_total` (by status code)

3. **AI Service**:
   - Counter: `page_editor_ai_calls_total` (by prompt_type, outcome)
   - Counter: `page_editor_ai_rejections_total`
   - Histogram: `page_editor_ai_duration_seconds`

4. **Storage**:
   - Gauge: `user_website_storage_used_bytes` (by org_id)
   - Counter: `user_website_storage_limit_exceeded_total`

### Logging Strategy
- **Current Format**: `[User/Website] <operation> Error:` or `✓ <operation> completed`
- **Preserve Prefix**: `[User/Website]` for easy log filtering
- **Add Structured Logging** (if not present):
  ```typescript
  logger.info("User website edit", {
    orgId,
    userId,
    pageId,
    component: alloroClass,
    success: true,
    tokensUsed: result.tokens,
    duration: endTime - startTime
  });
  ```

### Alerts to Configure
1. **Rate Limit Alert**: > 80% of orgs hitting daily limit
2. **Error Rate Alert**: > 5% error rate on edit endpoint
3. **AI Rejection Alert**: > 20% rejection rate from AI
4. **Response Time Alert**: p95 > 1 second

---

## 14. Documentation Requirements

### Code Documentation
1. **Service Layer**: JSDoc comments for each public function
2. **Utils**: JSDoc for exported functions
3. **Controller**: JSDoc for request/response shapes
4. **Models**: JSDoc for new methods

### API Documentation
- **OpenAPI/Swagger**: Update specs for both endpoints
- **Response Examples**: Document PREPARING state, error responses
- **Rate Limiting**: Document 50/day limit in API docs

### Internal Documentation
- **Architecture Diagram**: Show flow from route → controller → service → model
- **Rate Limiting Logic**: Document midnight reset behavior
- **Media Context Format**: Document exact markdown format for AI

---

## 15. Definition of Done

### Code Complete
- [ ] All 10 new files created
- [ ] All 4 model enhancements implemented
- [ ] Route file refactored to ~15 LOC
- [ ] All imports correct
- [ ] No linting errors
- [ ] TypeScript compiles without errors

### Testing Complete
- [ ] All unit tests pass (utils)
- [ ] All service tests pass (mocked models)
- [ ] All controller tests pass (mocked services)
- [ ] All integration tests pass (full stack)
- [ ] Regression tests pass (responses match)
- [ ] Security tests pass (cross-org access denied)

### Performance Verified
- [ ] Query count unchanged
- [ ] Response times within 10% of current
- [ ] No N+1 queries introduced
- [ ] Memory usage stable

### Documentation Complete
- [ ] JSDoc comments added
- [ ] API documentation updated
- [ ] Architecture diagram created
- [ ] Rate limiting documented

### Observability Complete
- [ ] Metrics added
- [ ] Structured logging implemented
- [ ] Alerts configured
- [ ] Dashboard updated

### Deployment Complete
- [ ] Staged in development environment
- [ ] Smoke tests pass in staging
- [ ] Load tests pass in staging
- [ ] Code review approved
- [ ] Deployed to production
- [ ] Post-deployment verification pass
- [ ] Rollback plan documented

### Post-Deployment
- [ ] Monitor error rates for 24 hours
- [ ] Monitor response times for 24 hours
- [ ] No increase in 500 errors
- [ ] No user complaints
- [ ] Old route file deleted (after 1 week stability)

---

## 16. Migration Checklist

### Pre-Migration
- [ ] Review plan with team
- [ ] Estimate: 6-8 hours development
- [ ] Schedule: Low-traffic deployment window
- [ ] Backup: Tag current commit

### Phase 1: Models (1-2 hours)
- [ ] Enhance PageModel
- [ ] Enhance MediaModel
- [ ] Enhance UserEditModel
- [ ] Test model methods in isolation
- [ ] Commit: "feat: enhance website builder models"

### Phase 2: Utils (1-2 hours)
- [ ] Create storage-calculation.util.ts
- [ ] Create tier-check.util.ts
- [ ] Create validation.util.ts
- [ ] Create error-handling.util.ts
- [ ] Create response-formatting.util.ts
- [ ] Unit test all utils
- [ ] Commit: "feat: add user-website utils"

### Phase 3: Services (2-3 hours)
- [ ] Create rate-limiting.service.ts
- [ ] Create media-context.service.ts
- [ ] Create website-fetch.service.ts
- [ ] Create page-edit.service.ts
- [ ] Test all services with mocked models
- [ ] Commit: "feat: add user-website services"

### Phase 4: Controller (1 hour)
- [ ] Create UserWebsiteController.ts
- [ ] Test controller with mocked services
- [ ] Commit: "feat: add UserWebsiteController"

### Phase 5: Route Refactor (30 minutes)
- [ ] Refactor routes/user/website.ts
- [ ] Remove all logic
- [ ] Wire up controller
- [ ] Test all endpoints
- [ ] Commit: "refactor: migrate user-website route to controller pattern"

### Phase 6: Verification (1 hour)
- [ ] Run full test suite
- [ ] Integration tests
- [ ] Regression tests
- [ ] Security tests
- [ ] Performance tests

### Deployment
- [ ] Deploy to staging
- [ ] Smoke test staging
- [ ] Deploy to production (off-peak)
- [ ] Monitor for 1 hour
- [ ] Verify metrics
- [ ] Mark complete

---

## 17. Alternatives Considered

### Alternative 1: Keep Route File As-Is
**Pros**:
- No migration risk
- No testing overhead
- Proven working code

**Cons**:
- Tech debt accumulates
- Harder to test
- Harder to maintain
- Inconsistent with new architecture

**Decision**: Rejected - Long-term maintainability more important

### Alternative 2: Microservice Split
**Pros**:
- Complete isolation
- Independent scaling
- Technology flexibility

**Cons**:
- Operational complexity
- Network latency
- Distributed tracing required
- Overkill for 2 endpoints

**Decision**: Rejected - Too complex for current scale

### Alternative 3: Gradual Migration (Feature Flags)
**Pros**:
- Lower deployment risk
- Gradual rollout
- Easy rollback

**Cons**:
- Code duplication during migration
- Feature flag complexity
- Longer migration timeline

**Decision**: Rejected - Clean cutover simpler for 2 endpoints

### Alternative 4: Single Service File (No Service Separation)
**Pros**:
- Fewer files
- Simpler imports
- Less overhead

**Cons**:
- Large service file (~200 LOC)
- Harder to test in isolation
- Mixing concerns (fetch vs edit vs rate limit)

**Decision**: Rejected - Separation of concerns more important

---

## 18. Success Metrics

### Immediate Success (Day 1)
- [ ] Zero increase in error rate
- [ ] Response times within 10% of baseline
- [ ] No user complaints
- [ ] All endpoints functional

### Short-Term Success (Week 1)
- [ ] Code review positive feedback
- [ ] Test coverage > 80%
- [ ] No production incidents
- [ ] Monitoring dashboards updated

### Long-Term Success (Month 1)
- [ ] Easier to add new features
- [ ] Faster bug fixes
- [ ] Improved test coverage
- [ ] Team velocity maintained or improved

### Quantitative Metrics
- **Code Quality**: Cyclomatic complexity reduced by 50%
- **Testability**: Test coverage increased from ~0% to >80%
- **Maintainability**: SLOC per feature reduced
- **Performance**: No degradation (within 5%)

---

## 19. Dependencies & Blockers

### Dependencies
- **None**: This refactor is self-contained
- **Optional**: Could wait for pageEditorService refactor, but not required

### Potential Blockers
1. **Team Availability**: Need code review bandwidth
2. **Deployment Window**: Need low-traffic period
3. **Test Infrastructure**: Need proper test harness for services
4. **AI Service Mocking**: Need reliable mock for integration tests

### Mitigations
1. Schedule refactor during sprint with test time
2. Deploy on weekend or off-peak hours
3. Set up test infrastructure first
4. Create AI service mock library

---

## 20. Lessons Learned (Post-Migration)

### What Went Well
- *(To be filled after migration)*

### What Could Be Improved
- *(To be filled after migration)*

### Recommendations for Next Route
- *(To be filled after migration)*

---

## Appendix A: Type Definitions

### WebsiteData Interface
```typescript
interface WebsiteData {
  project: {
    id: string;
    hostname: string | null;
    status: string;
    is_read_only: boolean;
    custom_domain: string | null;
    wrapper: any;
    header: any;
    footer: any;
  };
  pages: IPage[];
  media: IMedia[];
  usage: {
    storage_used: number;
    storage_limit: number;
    storage_percentage: number;
    edits_today: number;
    edits_limit: number;
  };
}
```

### EditPageParams Interface
```typescript
interface EditPageParams {
  orgId: number;
  userId: number;
  pageId: string;
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}
```

### EditResult Interface
```typescript
interface EditResult {
  editedHtml: string | null;
  message: string;
  rejected: boolean;
  editsRemaining: number;
}
```

---

## Appendix B: SQL Query Mapping

### GET Endpoint Queries

#### Query 1: Fetch Organization
**Current**:
```sql
SELECT * FROM organizations WHERE id = $1 LIMIT 1
```
**After**:
```typescript
OrganizationModel.findById(orgId)
```

#### Query 2: Fetch Project
**Current**:
```sql
SELECT * FROM website_builder.projects WHERE organization_id = $1 LIMIT 1
```
**After**:
```typescript
ProjectModel.findByOrganizationId(orgId)
```

#### Query 3: Fetch Published Pages
**Current**:
```sql
SELECT * FROM website_builder.pages
WHERE project_id = $1 AND status = 'published'
ORDER BY path
```
**After**:
```typescript
PageModel.findByProjectId(projectId, "published")
```

#### Query 4: Fetch Media
**Current**:
```sql
SELECT * FROM website_builder.media
WHERE project_id = $1
ORDER BY created_at DESC
```
**After**:
```typescript
MediaModel.findAllByProjectId(projectId)
```

#### Query 5: Count Today's Edits
**Current**:
```sql
SELECT COUNT(*) as count FROM website_builder.user_edits
WHERE organization_id = $1 AND created_at >= $2
```
**After**:
```typescript
UserEditModel.countTodayByOrg(orgId)
```

### POST Endpoint Queries

#### Query 1-3: Same as GET (Organization, Project, Edit Count)

#### Query 4: Verify Page Ownership
**Current**:
```sql
SELECT * FROM website_builder.pages
WHERE id = $1 AND project_id = $2
LIMIT 1
```
**After**:
```typescript
PageModel.findByIdAndProject(pageId, projectId)
```

#### Query 5: Fetch Media for AI Context
**Current**:
```sql
SELECT display_name, s3_url, alt_text, mime_type, width, height
FROM website_builder.media
WHERE project_id = $1
ORDER BY created_at DESC
```
**After**:
```typescript
MediaModel.findForAIContext(projectId)
```

#### Query 6: Log Edit
**Current**:
```sql
INSERT INTO website_builder.user_edits (...) VALUES (...)
```
**After**:
```typescript
UserEditModel.logEdit(editData)
```

---

## End of Plan
