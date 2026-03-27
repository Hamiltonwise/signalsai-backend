# Admin Imports Route Refactor Plan

**Route**: `/api/admin/imports`
**Current File**: `signalsai-backend/src/routes/admin/imports.ts`
**Date**: 2026-02-18
**Lines of Code**: 460

---

## 1. Current State

### Overview
Admin API for managing website_builder.alloro_imports — self-hosted CSS, JS, images, and other assets that templates can reference via URL. Supports versioning (edits create new versions) and status management (published, active, deprecated).

### Endpoints (6 Total)
- **GET** `/api/admin/imports` — List all imports with filtering and grouping
- **POST** `/api/admin/imports` — Create new import (first version)
- **GET** `/api/admin/imports/:id` — Get single import with all versions
- **POST** `/api/admin/imports/:id/new-version` — Upload new version of existing import
- **PATCH** `/api/admin/imports/:id/status` — Change version status (published/active/deprecated)
- **DELETE** `/api/admin/imports/:id` — Delete all versions of an import

### Responsibilities (Current)
1. **File upload handling** (multer middleware)
2. **MIME type categorization** (css/javascript/image/font/file)
3. **Text type detection** (css/javascript are text-editable)
4. **S3 operations** (upload, delete, key building)
5. **Versioning logic** (increment version, find latest)
6. **Status transitions** (published → active when new version published)
7. **Content hashing** (SHA-256 for deduplication)
8. **Text content storage** (for text-editable types)
9. **Grouping by filename** (for list view)
10. **Filename uniqueness validation**
11. **Cascade deletion** (all versions + S3 objects)
12. **Error handling and logging**

### Dependencies
- `express` (Request, Response)
- `multer` (file upload middleware)
- `crypto` (SHA-256 hashing)
- `db` (direct Knex queries)
- `s3` service (`uploadToS3`, `deleteFromS3`, `buildS3Key`, `bucket`)
- **AlloroImportModel** available but **NOT used**

### Current Architecture Issues
- Route file contains all business logic (460 LOC)
- Direct `db()` calls throughout instead of using `AlloroImportModel`
- Helper functions (`categorizeType`, `isTextType`) tightly coupled to route
- Complex grouping logic inline in route handler
- S3 operations scattered across handlers
- Version management logic duplicated across endpoints
- Status transition logic embedded in handlers
- No separation between HTTP handling and business logic
- Testing requires mocking entire route + db + S3
- Difficult to locate specific concerns (versioning, S3, status management)

### Direct DB Queries to Replace (11 Total)
1. **Line 66**: `db(IMPORTS_TABLE).select("*")` — list all with filters
2. **Line 158**: `db(IMPORTS_TABLE).where("filename", filename).first()` — check duplicate
3. **Line 176**: `db(IMPORTS_TABLE).insert({...}).returning("*")` — create import
4. **Line 215**: `db(IMPORTS_TABLE).where("id", id).first()` — get by ID
5. **Line 226**: `db(IMPORTS_TABLE).where("filename", record.filename)` — get all versions
6. **Line 266**: `db(IMPORTS_TABLE).where("id", id).first()` — get existing for new version
7. **Line 276**: `db(IMPORTS_TABLE).where("filename", existing.filename).max("version")` — get latest version
8. **Line 297**: `db(IMPORTS_TABLE).where({filename, status: "published"}).update({...})` — downgrade published
9. **Line 301**: `db(IMPORTS_TABLE).insert({...}).returning("*")` — create new version
10. **Line 352**: `db(IMPORTS_TABLE).where("id", id).first()` — get for status change
11. **Line 410**: `db(IMPORTS_TABLE).where("id", id).first()` — get for delete

---

## 2. Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── admin/
│       └── imports.ts                              # Route definitions only (~30 LOC)
├── controllers/
│   └── admin-imports/
│       ├── AdminImportsController.ts               # Main controller (~120 LOC)
│       ├── admin-imports-services/
│       │   ├── ImportVersionService.ts             # Version management (~60 LOC)
│       │   ├── ImportStatusService.ts              # Status transitions (~40 LOC)
│       │   └── ImportS3Service.ts                  # S3 operations (~50 LOC)
│       └── admin-imports-utils/
│           ├── mimeTypeUtils.ts                    # MIME categorization (~20 LOC)
│           ├── importGrouper.ts                    # List grouping logic (~40 LOC)
│           └── fileUploadConfig.ts                 # Multer config (~15 LOC)
└── models/
    └── website-builder/
        └── AlloroImportModel.ts                    # Extended model methods
```

### Layer Responsibilities

**Route Layer** (`routes/admin/imports.ts`)
- Express router setup
- Endpoint definitions (6 routes)
- Multer middleware attachment
- Delegate to controller methods

**Controller Layer** (`AdminImportsController.ts`)
- Request/response handling
- Input validation
- Orchestration of services and model calls
- Error response formatting
- HTTP status codes
- Top-level try/catch

**Service Layer** (`admin-imports-services/`)
- **ImportVersionService.ts**: Version incrementing, latest version lookup, version creation
- **ImportStatusService.ts**: Status transition logic, published → active demotion
- **ImportS3Service.ts**: S3 upload/delete orchestration, key building, cascade deletion

**Utility Layer** (`admin-imports-utils/`)
- **mimeTypeUtils.ts**: Pure functions for MIME type categorization and text type detection
- **importGrouper.ts**: Pure function for grouping imports by filename
- **fileUploadConfig.ts**: Multer configuration export

**Model Layer** (`AlloroImportModel.ts`)
- All database queries
- Data retrieval and persistence
- Query building with filters

---

## 3. Code Mapping

### Route File (Target: ~30 LOC)
```typescript
import express from "express";
import { AdminImportsController } from "../../controllers/admin-imports/AdminImportsController";
import { upload } from "../../controllers/admin-imports/admin-imports-utils/fileUploadConfig";

const router = express.Router();
const controller = new AdminImportsController();

router.get("/", controller.listImports);
router.post("/", upload.single("file"), controller.createImport);
router.get("/:id", controller.getImport);
router.post("/:id/new-version", upload.single("file"), controller.createNewVersion);
router.patch("/:id/status", controller.updateStatus);
router.delete("/:id", controller.deleteImport);

export default router;
```

### Controller (`AdminImportsController.ts`)
**Responsibilities:**
- Extract and validate request parameters
- Orchestrate model, service, and utility calls
- Format responses
- Handle errors with appropriate HTTP status codes

**Methods:**
```typescript
class AdminImportsController {
  async listImports(req: Request, res: Response): Promise<Response>
  async createImport(req: Request, res: Response): Promise<Response>
  async getImport(req: Request, res: Response): Promise<Response>
  async createNewVersion(req: Request, res: Response): Promise<Response>
  async updateStatus(req: Request, res: Response): Promise<Response>
  async deleteImport(req: Request, res: Response): Promise<Response>
}
```

**Current lines to move here:**
- Lines 60-131 → `listImports` method
- Lines 137-203 → `createImport` method
- Lines 209-242 → `getImport` method
- Lines 248-333 → `createNewVersion` method
- Lines 339-400 → `updateStatus` method
- Lines 406-458 → `deleteImport` method

---

### Service: `ImportVersionService.ts`
**Responsibilities:**
- Create new version records
- Get latest version number for filename
- Handle version incrementing logic
- Coordinate status demotion when new version published

**Function signatures:**
```typescript
export class ImportVersionService {
  async createFirstVersion(data: CreateImportData): Promise<IAlloroImport>
  async createNextVersion(filename: string, data: CreateVersionData): Promise<IAlloroImport>
  async getLatestVersionNumber(filename: string): Promise<number>
  async demotePublishedVersion(filename: string): Promise<void>
}

interface CreateImportData {
  filename: string;
  display_name: string;
  type: string;
  mime_type: string;
  file_size: number;
  s3_key: string;
  s3_bucket: string;
  content_hash: string;
  text_content: string | null;
}

interface CreateVersionData {
  version: number;
  mime_type: string;
  file_size: number;
  s3_key: string;
  content_hash: string;
  text_content: string | null;
}
```

**Current lines to move here:**
- Lines 276-281 (latest version calculation)
- Lines 297-299 (downgrade published logic)
- Lines 301-317 (new version creation)

**Model methods to use:**
- `AlloroImportModel.getLatestVersion(filename)`
- `AlloroImportModel.updateStatusByFilename(filename, "published", "active")`
- `AlloroImportModel.create(data)`

---

### Service: `ImportStatusService.ts`
**Responsibilities:**
- Validate status transitions
- Handle published version uniqueness (one per filename)
- Coordinate demotion of previous published version

**Function signatures:**
```typescript
export class ImportStatusService {
  async changeStatus(id: number, newStatus: string): Promise<StatusChangeResult>
  validateStatus(status: string): boolean
}

interface StatusChangeResult {
  updated: IAlloroImport;
  previouslyPublished: { id: number; version: number } | null;
}
```

**Current lines to move here:**
- Lines 344-350 (status validation)
- Lines 362-374 (published version check and demotion)
- Lines 376-379 (status update)

**Model methods to use:**
- `AlloroImportModel.findById(id)`
- `AlloroImportModel.findByFilenameAndStatus(filename, "published")`
- `AlloroImportModel.updateStatus(id, status)`

---

### Service: `ImportS3Service.ts`
**Responsibilities:**
- Upload files to S3 (wraps s3 service)
- Delete files from S3
- Build S3 keys
- Cascade delete all versions' S3 objects
- Hash file content (SHA-256)

**Function signatures:**
```typescript
export class ImportS3Service {
  async uploadImport(filename: string, version: number, originalFilename: string, buffer: Buffer, mimeType: string): Promise<S3UploadResult>
  async deleteImport(s3Key: string): Promise<void>
  async deleteAllVersions(versions: Array<{ s3_key: string | null }>): Promise<void>
  hashContent(buffer: Buffer): string
}

interface S3UploadResult {
  s3_key: string;
  s3_bucket: string;
  content_hash: string;
}
```

**Current lines to move here:**
- Lines 168-172 (hash + key building + upload for create)
- Lines 284-290 (hash + key building + upload for new version)
- Lines 424-436 (cascade S3 deletion)

**External dependencies:**
- `uploadToS3(key, buffer, mimeType)` from `../../services/s3`
- `deleteFromS3(key)` from `../../services/s3`
- `buildS3Key(filename, version, originalFilename)` from `../../services/s3`
- `bucket` from `../../services/s3`

---

### Utility: `mimeTypeUtils.ts`
**Responsibilities:**
- Categorize MIME type into type categories (css/javascript/image/font/file)
- Determine if type is text-editable
- Pure functions (no side effects)

**Function signatures:**
```typescript
export function categorizeType(mimeType: string): string
export function isTextType(type: string): boolean
```

**Current lines to move here:**
- Lines 31-49 (`categorizeType` function)
- Lines 52-54 (`isTextType` function)

---

### Utility: `importGrouper.ts`
**Responsibilities:**
- Group imports by filename for list view
- Extract published/latest version metadata
- Pure function

**Function signature:**
```typescript
export function groupImportsByFilename(imports: IAlloroImport[]): GroupedImport[]

interface GroupedImport {
  filename: string;
  display_name: string;
  type: string;
  published_version: number | null;
  latest_version: number;
  version_count: number;
  status: string;
  updated_at: Date;
  created_at: Date;
  id: number;
}
```

**Current lines to move here:**
- Lines 86-118 (grouping logic)

---

### Utility: `fileUploadConfig.ts`
**Responsibilities:**
- Export configured multer instance
- Define upload limits and storage

**Export:**
```typescript
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
```

**Current lines to move here:**
- Lines 22-25 (multer configuration)

---

## 4. Model Enhancements

### AlloroImportModel.ts — Methods to Add

Current model has some methods but is missing several needed by the refactor:

**Already exists (use as-is):**
- ✅ `findById(id)`
- ✅ `findByFilename(filename)`
- ✅ `findByFilenameAndStatus(filename, status)`
- ✅ `create(data)`
- ✅ `updateStatus(id, status)`
- ✅ `updateStatusByFilename(filename, fromStatus, toStatus)`
- ✅ `deleteByFilename(filename)`
- ✅ `getLatestVersion(filename)`

**Missing (need to add):**

```typescript
// List with filters (type, status, search)
static async listWithFilters(
  filters: {
    type?: string;
    status?: string;
    search?: string;
  },
  trx?: QueryContext
): Promise<IAlloroImport[]> {
  let query = this.table(trx).select("*");

  if (filters.type && filters.type !== "all") {
    query = query.where("type", filters.type);
  }
  if (filters.status && filters.status !== "all") {
    query = query.where("status", filters.status);
  }
  if (filters.search) {
    query = query.where(function () {
      this.where("filename", "ilike", `%${filters.search}%`)
        .orWhere("display_name", "ilike", `%${filters.search}%`);
    });
  }

  return query.orderBy("filename", "asc").orderBy("version", "desc");
}

// Get all versions with S3 keys (for cascade deletion)
static async findVersionsForDeletion(
  filename: string,
  trx?: QueryContext
): Promise<Array<{ id: number; s3_key: string | null; version: number }>> {
  return this.table(trx)
    .where("filename", filename)
    .select("id", "s3_key", "version");
}

// Find published version for filename (excluding specific ID)
static async findPublishedVersionExcludingId(
  filename: string,
  excludeId: number,
  trx?: QueryContext
): Promise<IAlloroImport | undefined> {
  return this.table(trx)
    .where({ filename, status: "published" })
    .whereNot("id", excludeId)
    .first();
}
```

---

## 5. Step-by-Step Migration

### Prerequisites
- [ ] Ensure AlloroImportModel is imported and working
- [ ] Verify S3 service functions are accessible
- [ ] Check environment variables for S3 bucket

### Step 1: Create Directory Structure
```bash
mkdir -p signalsai-backend/src/controllers/admin-imports/admin-imports-services
mkdir -p signalsai-backend/src/controllers/admin-imports/admin-imports-utils
```

### Step 2: Extend AlloroImportModel
**Order matters: model must be extended first**

1. Open `src/models/website-builder/AlloroImportModel.ts`
2. Add `listWithFilters` method (replaces lines 66-84 logic)
3. Add `findVersionsForDeletion` method (replaces lines 420-422 logic)
4. Add `findPublishedVersionExcludingId` method (replaces lines 364-367 logic)
5. Verify TypeScript compiles

### Step 3: Extract Utilities (Pure Functions)
**Order matters: utilities have no dependencies**

1. Create `fileUploadConfig.ts`
   - Copy lines 22-25 (multer config)
   - Import multer
   - Export `upload` constant
   - Add JSDoc comment

2. Create `mimeTypeUtils.ts`
   - Copy lines 31-49 (`categorizeType`)
   - Copy lines 52-54 (`isTextType`)
   - Add TypeScript exports
   - Add JSDoc comments

3. Create `importGrouper.ts`
   - Copy lines 86-118 (grouping logic)
   - Define `GroupedImport` interface
   - Add TypeScript export
   - Add JSDoc comment
   - Import `IAlloroImport` type

### Step 4: Extract Services (Business Logic)

4. Create `ImportS3Service.ts`
   - Import S3 service functions
   - Import crypto
   - Create `uploadImport` method (lines 168-172 + 284-290 logic)
   - Create `deleteImport` method (wrapper for `deleteFromS3`)
   - Create `deleteAllVersions` method (lines 424-436 logic)
   - Create `hashContent` method (SHA-256 hashing)
   - Define `S3UploadResult` interface
   - Add error handling
   - Add JSDoc comments

5. Create `ImportVersionService.ts`
   - Import `AlloroImportModel`
   - Import `ImportS3Service`
   - Create `createFirstVersion` method (lines 176-190 logic)
   - Create `createNextVersion` method (lines 301-317 logic)
   - Create `getLatestVersionNumber` method (wrapper for model method)
   - Create `demotePublishedVersion` method (lines 297-299 logic)
   - Define `CreateImportData` and `CreateVersionData` interfaces
   - Replace db() calls with model methods
   - Add JSDoc comments

6. Create `ImportStatusService.ts`
   - Import `AlloroImportModel`
   - Create `validateStatus` method (lines 344-350 logic)
   - Create `changeStatus` method (lines 362-379 logic)
   - Define `StatusChangeResult` interface
   - Replace db() calls with model methods
   - Add JSDoc comments

### Step 5: Create Controller

7. Create `AdminImportsController.ts`
   - Import utilities from `./admin-imports-utils/`
   - Import services from `./admin-imports-services/`
   - Import `AlloroImportModel`
   - Import types from model
   - Create class `AdminImportsController`
   - Create method `listImports` (lines 60-131)
     - Use `AlloroImportModel.listWithFilters()`
     - Use `groupImportsByFilename()` utility
   - Create method `createImport` (lines 137-203)
     - Validate input (file or text_content)
     - Use `categorizeType()` and `isTextType()` utilities
     - Check duplicate with `AlloroImportModel.findByFilename()`
     - Use `ImportS3Service.uploadImport()`
     - Use `ImportVersionService.createFirstVersion()`
   - Create method `getImport` (lines 209-242)
     - Use `AlloroImportModel.findById()`
     - Use `AlloroImportModel.findByFilename()`
   - Create method `createNewVersion` (lines 248-333)
     - Validate input
     - Use `AlloroImportModel.findById()`
     - Use `ImportVersionService.getLatestVersionNumber()`
     - Use `ImportS3Service.uploadImport()`
     - Use `ImportVersionService.createNextVersion()`
   - Create method `updateStatus` (lines 339-400)
     - Use `ImportStatusService.validateStatus()`
     - Use `ImportStatusService.changeStatus()`
   - Create method `deleteImport` (lines 406-458)
     - Use `AlloroImportModel.findById()`
     - Use `AlloroImportModel.findVersionsForDeletion()`
     - Use `ImportS3Service.deleteAllVersions()`
     - Use `AlloroImportModel.deleteByFilename()`
   - Keep validation logic inline (simple checks)
   - Maintain try/catch with proper error responses
   - Preserve all console.log statements
   - Bind methods in constructor (for proper `this` context)

### Step 6: Refactor Route File

8. Modify `routes/admin/imports.ts`
   - Remove IMPORTS_TABLE constant
   - Remove multer configuration
   - Remove helper functions (lines 31-54)
   - Remove all route handlers (lines 60-458)
   - Import `AdminImportsController`
   - Import `upload` from utils
   - Instantiate controller
   - Define 6 routes calling controller methods
   - Keep JSDoc file header comment

### Step 7: Verification

9. Manual verification steps:
   - [ ] Check all imports resolve correctly
   - [ ] Run TypeScript compiler: `npm run build` or `tsc --noEmit`
   - [ ] Run linter: `npm run lint`
   - [ ] Start server and verify all endpoints respond
   - [ ] Test LIST endpoint with filters (type, status, search)
   - [ ] Test CREATE endpoint with file upload
   - [ ] Test CREATE endpoint with text_content
   - [ ] Test GET endpoint for single import
   - [ ] Test NEW-VERSION endpoint
   - [ ] Test STATUS update endpoint (all transitions)
   - [ ] Test DELETE endpoint (verify S3 cleanup)
   - [ ] Check error cases:
     - Missing file/text_content
     - Duplicate filename
     - Invalid status value
     - Non-existent import ID

10. Test coverage:
    - [ ] Add unit tests for utilities (categorizeType, isTextType, groupImportsByFilename)
    - [ ] Add unit tests for services (mock model and S3 calls)
    - [ ] Add integration test for controller
    - [ ] Verify model methods work correctly
    - [ ] Ensure existing route tests still pass

---

## 6. Files to Create

| File Path | Responsibility | LOC (Est.) |
|-----------|---------------|------------|
| `controllers/admin-imports/AdminImportsController.ts` | HTTP handling, orchestration | ~120 |
| `controllers/admin-imports/admin-imports-services/ImportVersionService.ts` | Version management | ~60 |
| `controllers/admin-imports/admin-imports-services/ImportStatusService.ts` | Status transitions | ~40 |
| `controllers/admin-imports/admin-imports-services/ImportS3Service.ts` | S3 operations | ~50 |
| `controllers/admin-imports/admin-imports-utils/mimeTypeUtils.ts` | MIME categorization | ~20 |
| `controllers/admin-imports/admin-imports-utils/importGrouper.ts` | List grouping | ~40 |
| `controllers/admin-imports/admin-imports-utils/fileUploadConfig.ts` | Multer config | ~15 |

**Total new LOC:** ~345 (includes type definitions, JSDoc comments, error handling)

---

## 7. Files to Modify

### `routes/admin/imports.ts`
**Before:** 460 LOC
**After:** ~30 LOC

**Changes:**
- Remove IMPORTS_TABLE constant (line 19)
- Remove multer configuration (lines 22-25)
- Remove helper functions (lines 31-54)
- Remove all route handlers (lines 60-458)
- Import AdminImportsController
- Import upload config
- Define 6 routes with controller methods

**Remaining content:**
- File header JSDoc comment (lines 1-9)
- Import statements
- Router setup
- 6 route definitions
- Export statement

### `models/website-builder/AlloroImportModel.ts`
**Before:** 103 LOC
**After:** ~160 LOC

**Changes:**
- Add `listWithFilters` method
- Add `findVersionsForDeletion` method
- Add `findPublishedVersionExcludingId` method
- Update `ImportFilters` interface to include `status` and `search`

**Remaining content:**
- All existing methods (unchanged)
- All existing interfaces (enhanced)
- All existing types

---

## 8. Risk Assessment

### Low Risk
- **Pure utilities**: `mimeTypeUtils`, `importGrouper` are pure functions. Easy to test.
- **No authentication changes**: Admin routes remain protected by existing middleware.
- **No external API changes**: Only internal restructuring.
- **Model already exists**: `AlloroImportModel` is established and tested.

### Medium Risk
- **Model extension**: Adding new methods to `AlloroImportModel`. Must ensure backward compatibility.
- **S3 service integration**: Services wrap existing S3 functions. Must preserve error handling.
- **Version management logic**: Complex logic around published → active transitions. Must test all scenarios.
- **File upload handling**: Multer middleware must be correctly attached to routes.

### High Risk
- **Status transition logic**: Publishing a version must demote previous published version. Race conditions possible.
- **Cascade deletion**: Deleting all versions + S3 objects. Partial failures could leave orphaned data.
- **Filename uniqueness**: Validation must prevent duplicates. Concurrency issues possible.

### Potential Issues

#### 1. Status Transition Race Conditions
**Symptom:** Two versions published simultaneously for same filename
**Mitigation:**
- Use database transactions for status changes
- Add unique constraint on `(filename, status)` where `status = 'published'` (DB schema)
- Wrap `changeStatus` in try/catch and retry on conflict

#### 2. S3 Deletion Failures
**Symptom:** Database record deleted but S3 objects remain (orphaned data)
**Mitigation:**
- Log all S3 deletion failures (already in place, lines 430-434)
- Consider transaction-like behavior: delete S3 first, then DB
- Add cleanup job to find orphaned S3 objects

#### 3. Missing Model Methods
**Symptom:** TypeScript compilation fails due to missing model methods
**Mitigation:**
- Add all 3 new methods to model FIRST before creating services
- Verify model methods work independently
- Write unit tests for new model methods

#### 4. Import Path Errors
**Symptom:** TypeScript compilation fails due to incorrect imports
**Mitigation:**
- Use absolute imports or tsconfig path aliases
- Verify all imports resolve before testing
- Run `tsc --noEmit` after each file creation

#### 5. Multer Middleware Attachment
**Symptom:** File uploads fail with "Unexpected field" error
**Mitigation:**
- Ensure `upload.single("file")` is correctly attached to POST routes
- Test file upload endpoints explicitly
- Verify `req.file` is accessible in controller

#### 6. Versioning Logic Errors
**Symptom:** Version numbers incorrect or duplicate versions created
**Mitigation:**
- Use `getLatestVersion` model method consistently
- Test version incrementing with concurrent requests
- Add database constraint: unique `(filename, version)`

#### 7. Text Content Not Saved
**Symptom:** Text-editable files (CSS/JS) don't save `text_content` field
**Mitigation:**
- Ensure `isTextType()` is called before saving
- Test CSS and JS uploads explicitly
- Verify `text_content` field is populated

#### 8. Controller Method Binding
**Symptom:** `this` is undefined in controller methods
**Mitigation:**
- Bind methods in constructor: `this.listImports = this.listImports.bind(this)`
- Or use arrow functions for method definitions
- Or use explicit binding in route definitions

#### 9. Error Response Format Changes
**Symptom:** Frontend receives different error responses
**Mitigation:**
- Preserve exact error format: `{ success: false, error: string, message: string }`
- Preserve exact HTTP status codes (400, 404, 409, 500)
- Test all error paths

#### 10. Lost Logging Context
**Symptom:** Logs don't include import details
**Mitigation:**
- Preserve all `console.log` statements with `[Admin Imports]` prefix
- Pass import context through service methods
- Maintain consistency with current logging patterns

### Testing Strategy

**Before refactor:**
1. Document current behavior (manual test or integration test)
2. Capture all endpoints' success cases:
   - List with various filters
   - Create with file upload
   - Create with text_content
   - Get single import
   - Create new version
   - Change status (all transitions)
   - Delete all versions
3. Capture error cases:
   - Missing file/text_content
   - Duplicate filename
   - Invalid status
   - Non-existent ID
   - S3 failure simulation

**After refactor:**
1. Unit test each utility function
2. Unit test each service method (mock model and S3)
3. Unit test new model methods
4. Integration test controller (mock services)
5. End-to-end test all 6 endpoints
6. Test concurrent operations (version creation, status changes)
7. Compare behavior with documented pre-refactor behavior

### Rollback Plan

**If issues are detected in production:**

1. **Immediate rollback**: Revert the refactor commit
2. **Quick fix**: Route file is self-contained in current state
3. **No schema changes**: No migrations to reverse (unless unique constraints added)
4. **No config changes**: Environment variables unchanged

**Rollback is low-risk** because:
- No database schema changes (only added model methods)
- No external API contract changes
- No authentication/authorization changes
- Endpoint behavior remains identical
- Model methods are backward compatible

**If partial rollback needed:**
- Can revert route changes but keep model enhancements
- Can revert services but keep utilities
- Granular rollback possible due to layer separation

---

## 9. Definition of Done

- [ ] All 7 new files created with proper TypeScript types
- [ ] 3 new methods added to `AlloroImportModel`
- [ ] Route file reduced to ~30 LOC
- [ ] All imports resolve correctly
- [ ] TypeScript compiles without errors
- [ ] Linter passes
- [ ] Unit tests written for utilities
- [ ] Unit tests written for services
- [ ] Unit tests written for new model methods
- [ ] Integration test passes for controller
- [ ] Manual testing confirms:
  - [ ] List endpoint with filters works
  - [ ] Create endpoint with file upload works
  - [ ] Create endpoint with text_content works
  - [ ] Get endpoint returns import with versions
  - [ ] New version endpoint increments correctly
  - [ ] Status update handles published demotion
  - [ ] Delete endpoint removes all versions + S3 objects
  - [ ] Error cases handled correctly (400, 404, 409, 500)
- [ ] Concurrent operations tested (no race conditions)
- [ ] No console errors in server logs
- [ ] All S3 operations confirmed (uploads/deletes)
- [ ] Code review completed
- [ ] Documentation updated (if README or API docs exist)

---

## 10. Architectural Benefits

### Maintainability
- **Single Responsibility Principle**: Each file has one clear purpose
- **Easier to locate logic**: Version management, status transitions, S3 operations all separated
- **Reduced cognitive load**: Route file shows only endpoints, not implementation
- **Model-driven**: All DB queries go through `AlloroImportModel`

### Testability
- **Pure utilities**: Trivial to test (no mocks needed)
- **Service isolation**: Services can be unit tested with model/S3 mocks
- **Controller testability**: Controller can be tested with service mocks
- **Model testability**: Model methods can be tested independently
- **Existing tests remain valid**: Integration tests unchanged

### Reusability
- **Utilities reusable**: MIME type categorization, grouping logic can be used elsewhere
- **Services reusable**: Version management, status transitions can be shared
- **Model methods reusable**: Other routes can use enhanced model
- **S3 service wrapper**: Consistent S3 operations across codebase

### Consistency
- **Establishes pattern**: Sets standard for future admin route refactors
- **Clear separation of concerns**: HTTP → Controller → Service → Model
- **Predictable file structure**: Easy to navigate for new developers
- **Model-first approach**: All DB access through models

### Observability
- **Service-level logging**: Easier to add structured logging
- **Error boundaries clearer**: Can add monitoring at each layer
- **Performance tracking**: Can measure service/model call times
- **S3 operation visibility**: Isolated S3 calls easier to monitor

### Performance
- **No performance degradation**: Same queries, just organized differently
- **Transaction support ready**: Services can accept trx parameter
- **Caching opportunities**: Model methods can be cached if needed
- **Batch operations possible**: Services can be extended for bulk operations

---

## 11. Future Improvements (Out of Scope)

These are **not** part of this refactor but may be considered later:

- [ ] Add request validation library (e.g., zod, joi) for file upload validation
- [ ] Add transaction support for status changes (prevent race conditions)
- [ ] Add database unique constraint: `(filename, status='published')`
- [ ] Add database unique constraint: `(filename, version)`
- [ ] Add rate limiting middleware for file uploads
- [ ] Add content deduplication check (using `content_hash`)
- [ ] Replace `console.log/error` with structured logging library
- [ ] Add metrics/monitoring for:
  - Upload success/failure rate
  - S3 operation latency
  - Version creation frequency
  - Orphaned S3 object detection
- [ ] Add cleanup job for orphaned S3 objects
- [ ] Add CDN cache invalidation on publish
- [ ] Add preview URL generation for unpublished versions
- [ ] Add version diffing for text-editable types
- [ ] Add bulk operations (delete multiple, publish multiple)
- [ ] Add import/export functionality (backup/restore)
- [ ] Add audit logging for all operations
- [ ] Add webhooks for status changes (notify templates)
- [ ] Add file size limits per type (different for images vs CSS)
- [ ] Add MIME type whitelist validation
- [ ] Add virus scanning for uploaded files

---

## 12. Migration Dependencies

### Must be completed first:
- None (self-contained refactor)

### Blocks:
- None (other routes can be refactored independently)

### Synergies with other refactors:
- If other admin routes use similar patterns (file upload, versioning), this refactor establishes the template
- If S3 service is refactored, ensure compatibility with `ImportS3Service`
- If logging is standardized, update service logging accordingly

---

## 13. Approval Required

This plan requires explicit approval before execution.

**Review checklist for approver:**
- [ ] Target architecture aligns with project standards
- [ ] Model extension is justified and backward compatible
- [ ] Service layer separation is appropriate
- [ ] Risk assessment is accurate (especially status transitions and S3 deletion)
- [ ] Testing strategy is sufficient (includes concurrency tests)
- [ ] Rollback plan is acceptable
- [ ] Scope is clear (no hidden work)
- [ ] Definition of Done is comprehensive
- [ ] Future improvements are reasonable and documented
