# Admin Media Route Refactor Plan

**Target Route:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/media.ts`
**Lines of Code:** 532 LOC
**Endpoints:** 4
**Refactor Tier:** Structural Feature
**Date:** 2026-02-18

---

## Current State

### Route Overview
- **File:** `src/routes/admin/media.ts`
- **LOC:** 532 lines (including comments and spacing)
- **Purpose:** Media asset management for website builder projects
- **Features:**
  - Bulk file uploads (up to 20 files)
  - Image processing (WebP conversion, thumbnail generation)
  - Video/PDF uploads (no processing)
  - 5 GB quota enforcement per project
  - Usage tracking (which pages reference media)
  - Pagination (50 items per page)
  - MIME type validation

### Endpoints (4)

| Method | Path | Handler Lines | Description |
|--------|------|---------------|-------------|
| POST | `/` | 163 lines (148-310) | Bulk media upload with quota check |
| GET | `/` | 89 lines (317-405) | List media with pagination, filters, usage tracking |
| PATCH | `/:mediaId` | 44 lines (411-453) | Update media metadata (display_name, alt_text) |
| DELETE | `/:mediaId` | 72 lines (459-530) | Delete media with S3 cleanup and usage check |

### Dependencies

**External Libraries:**
- `express` - routing
- `multer` - file upload middleware (memory storage, 25 MB limit)
- `uuid` - unique ID generation

**Internal Services:**
- `../../database/connection` → `db` (Knex instance)
- `../../services/s3` → `uploadToS3`, `deleteFromS3`, `bucket`
- `../../services/mediaProcessor` → `processImage`, `isProcessableImage`, `isVideo`, `isPDF`

**Models Referenced (but not imported):**
- None - all DB access via raw `db()` calls

**Database Tables:**
- `website_builder.media` (primary)
- `website_builder.pages` (for usage tracking)
- `website_builder.projects` (for existence validation)

### Constants

```typescript
MEDIA_TABLE = "website_builder.media"
PAGES_TABLE = "website_builder.pages"
PROJECTS_TABLE = "website_builder.projects"
PROJECT_STORAGE_LIMIT = 5 GB (5 * 1024 * 1024 * 1024)
ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4", "application/pdf"]
```

### Helper Functions (6)

| Function | Lines | Purpose | Concerns |
|----------|-------|---------|----------|
| `validateMimeType()` | 60-62 | MIME type whitelist check | Simple, reusable |
| `checkProjectQuota()` | 67-84 | Query current storage usage, check against limit | Direct DB access |
| `buildMediaS3Key()` | 89-104 | Generate S3 key with project/file structure | Pure logic |
| `buildS3Url()` | 109-113 | Construct public S3 URL from key | Pure logic |
| `findMediaUsage()` | 118-142 | Find pages referencing a media URL | Direct DB access, O(n*m) complexity |
| Multer config | 36-39 | File upload middleware configuration | Inline constant |

### Direct `db()` Calls

**POST `/` (Upload):**
1. Line 167: `db(PROJECTS_TABLE).where('id', projectId).first()` - project existence check
2. Line 71-74: `db(MEDIA_TABLE).where({ project_id }).sum('file_size as total').first()` - quota check
3. Line 252-268: `db(MEDIA_TABLE).insert({...}).returning('*')` - insert media record
4. Line 290: `checkProjectQuota(projectId, 0)` - final quota (calls db internally)

**GET `/` (List):**
1. Line 329: `db(MEDIA_TABLE).where({ project_id })` - base query
2. Line 354: `baseQuery.clone().count('* as count').first()` - count query
3. Line 357-361: `baseQuery.clone().orderBy(...).limit(...).offset(...)` - data query
4. Line 122-124: `db(PAGES_TABLE).where({ project_id }).select('path', 'sections')` - usage tracking (per item)
5. Line 380: `checkProjectQuota(projectId, 0)` - quota info

**PATCH `/:mediaId` (Update):**
1. Line 419-421: `db(MEDIA_TABLE).where({ id: mediaId, project_id }).first()` - verify ownership
2. Line 436-439: `db(MEDIA_TABLE).where({ id: mediaId }).update(updates).returning('*')` - update record

**DELETE `/:mediaId` (Delete):**
1. Line 467-469: `db(MEDIA_TABLE).where({ id: mediaId, project_id }).first()` - verify ownership
2. Line 481: `findMediaUsage(projectId, media.s3_url)` - usage check (calls db internally)
3. Line 514: `db(MEDIA_TABLE).where({ id: mediaId }).del()` - delete record

### Business Logic in Route Layer

**Concerns:**
- Image processing orchestration (lines 216-241)
- S3 key generation logic
- Parallel upload Promise.all handling
- Quota calculation and enforcement
- Usage tracking (scanning page sections for URL references)
- Error aggregation (success/failure separation)
- Response formatting (quota percentages, pagination metadata)

---

## Target Architecture

### Folder Structure

```
src/
├── controllers/
│   └── admin-media/
│       ├── AdminMediaController.ts            # Main controller (thin, route delegation)
│       ├── feature-services/
│       │   ├── service.media-upload.ts        # Upload orchestration
│       │   ├── service.media-list.ts          # List with pagination/filters
│       │   ├── service.media-update.ts        # Metadata updates
│       │   ├── service.media-delete.ts        # Deletion with S3 cleanup
│       │   ├── service.media-quota.ts         # Quota checking/calculation
│       │   └── service.media-usage.ts         # Usage tracking (page references)
│       └── feature-utils/
│           ├── util.s3-helpers.ts             # S3 key/URL builders
│           ├── util.validation.ts             # MIME type, file validation
│           └── util.constants.ts              # Constants (limits, allowed types)
├── models/
│   └── website-builder/
│       ├── MediaModel.ts                      # Media CRUD operations
│       ├── ProjectModel.ts                    # Project queries (exists, etc.)
│       └── PageModel.ts                       # Page queries (for usage tracking)
└── routes/
    └── admin/
        └── media.ts                           # Thin route definitions only
```

### Architectural Principles

1. **Routes:** Only route definitions + middleware + controller method calls
2. **Controller:** Orchestration layer - calls services, formats responses
3. **Services:** Business logic, multi-step workflows, external service coordination
4. **Utils:** Pure functions (S3 key building, MIME validation)
5. **Models:** All database access (no raw `db()` in services/controllers)

---

## Detailed Mapping

### 1. POST `/` → Upload Handler

**Current:** Lines 148-310 (163 lines)

**Target Flow:**
```
Route (media.ts)
  → AdminMediaController.uploadMedia()
    → MediaUploadService.uploadBulk()
      → ValidationUtil.validateMimeType() (per file)
      → MediaQuotaService.checkQuota()
      → ProjectModel.findById() (existence check)
      → MediaUploadService._processFile() (per file)
        → S3HelpersUtil.buildMediaS3Key()
        → [if image] mediaProcessor.processImage()
        → s3.uploadToS3()
        → MediaModel.create()
      → MediaQuotaService.getCurrentUsage()
```

**Model Methods Needed:**
- `ProjectModel.findById(projectId)` → replaces line 167
- `MediaModel.getTotalStorageByProject(projectId)` → replaces lines 71-74
- `MediaModel.create(data)` → replaces lines 252-268

**Service Methods:**
- `MediaUploadService.uploadBulk(projectId, files)` → orchestrates entire upload flow
- `MediaQuotaService.checkQuota(projectId, additionalSize)` → replaces checkProjectQuota()
- `MediaQuotaService.getCurrentUsage(projectId)` → final quota response

**Utils:**
- `ValidationUtil.validateMimeType(mimeType)` → lines 60-62
- `S3HelpersUtil.buildMediaS3Key(projectId, filename, isThumb)` → lines 89-104
- `S3HelpersUtil.buildS3Url(s3Key)` → lines 109-113
- `Constants.ALLOWED_MIME_TYPES`, `Constants.PROJECT_STORAGE_LIMIT`

### 2. GET `/` → List Handler

**Current:** Lines 317-405 (89 lines)

**Target Flow:**
```
Route (media.ts)
  → AdminMediaController.listMedia()
    → MediaListService.list(projectId, filters, pagination)
      → MediaModel.findByProjectWithFilters(projectId, filters, pagination)
      → [for each item] MediaUsageService.findUsageByUrl(projectId, s3Url)
        → PageModel.findByProject(projectId)
        → PageModel.scanSectionsForUrl() (internal method)
      → MediaQuotaService.getCurrentUsage(projectId)
```

**Model Methods Needed:**
- `MediaModel.findByProjectWithFilters(projectId, { type?, search?, page, limit })` → replaces lines 329-361
- `MediaModel.countByProjectWithFilters(projectId, filters)` → count query (line 354)
- `PageModel.findByProject(projectId, { fields: ['path', 'sections'] })` → replaces lines 122-124

**Service Methods:**
- `MediaListService.list(projectId, options)` → orchestrates list + usage tracking
- `MediaUsageService.findUsageByUrl(projectId, s3Url)` → replaces findMediaUsage() (lines 118-142)
- `MediaQuotaService.getCurrentUsage(projectId)`

**Performance Consideration:**
- Current usage tracking is O(n*m) - queries all pages for EACH media item
- **Optimization:** Fetch all pages once, then scan in-memory for all media items

### 3. PATCH `/:mediaId` → Update Handler

**Current:** Lines 411-453 (44 lines)

**Target Flow:**
```
Route (media.ts)
  → AdminMediaController.updateMedia()
    → MediaUpdateService.updateMetadata(projectId, mediaId, updates)
      → MediaModel.findByIdAndProject(mediaId, projectId)
      → MediaModel.updateMetadata(mediaId, { display_name?, alt_text? })
```

**Model Methods Needed:**
- `MediaModel.findByIdAndProject(mediaId, projectId)` → replaces lines 419-421
- `MediaModel.updateMetadata(mediaId, updates)` → replaces lines 436-439

**Service Methods:**
- `MediaUpdateService.updateMetadata(projectId, mediaId, updates)` → thin wrapper, validation

### 4. DELETE `/:mediaId` → Delete Handler

**Current:** Lines 459-530 (72 lines)

**Target Flow:**
```
Route (media.ts)
  → AdminMediaController.deleteMedia()
    → MediaDeleteService.delete(projectId, mediaId, force)
      → MediaModel.findByIdAndProject(mediaId, projectId)
      → [if !force] MediaUsageService.findUsageByUrl(projectId, s3Url)
      → s3.deleteFromS3(s3Key)
      → [if thumbnail] s3.deleteFromS3(thumbnailS3Key)
      → MediaModel.deleteById(mediaId)
```

**Model Methods Needed:**
- `MediaModel.findByIdAndProject(mediaId, projectId)` → replaces lines 467-469
- `MediaModel.deleteById(mediaId)` → replaces line 514

**Service Methods:**
- `MediaDeleteService.delete(projectId, mediaId, force)` → orchestrates S3 cleanup + DB delete
- `MediaUsageService.findUsageByUrl(projectId, s3Url)` → usage check

---

## Step-by-Step Migration Plan

### Phase 1: Create Constants & Utils (No Breaking Changes)

**Files to Create:**
1. `src/controllers/admin-media/feature-utils/util.constants.ts`
   - Export `ALLOWED_MIME_TYPES`, `PROJECT_STORAGE_LIMIT`
   - Export table names: `MEDIA_TABLE`, `PAGES_TABLE`, `PROJECTS_TABLE`

2. `src/controllers/admin-media/feature-utils/util.validation.ts`
   - `validateMimeType(mimeType: string): boolean`

3. `src/controllers/admin-media/feature-utils/util.s3-helpers.ts`
   - `buildMediaS3Key(projectId, filename, isThumb?): string`
   - `buildS3Url(s3Key: string): string`

**No route changes yet** - these are additive.

### Phase 2: Create/Extend Models (No Breaking Changes)

**Files to Create/Modify:**

1. **Check if exists:** `src/models/website-builder/MediaModel.ts`
   - If not exists: Create with full CRUD
   - If exists: Extend with missing methods

**Methods to Add:**
```typescript
// MediaModel.ts
static async findById(id: string): Promise<Media | null>
static async findByIdAndProject(id: string, projectId: string): Promise<Media | null>
static async findByProjectWithFilters(projectId: string, filters: MediaFilters, pagination: Pagination): Promise<Media[]>
static async countByProjectWithFilters(projectId: string, filters: MediaFilters): Promise<number>
static async create(data: CreateMediaInput): Promise<Media>
static async updateMetadata(id: string, updates: MetadataUpdate): Promise<Media>
static async deleteById(id: string): Promise<void>
static async getTotalStorageByProject(projectId: string): Promise<number>
```

2. **Check if exists:** `src/models/website-builder/ProjectModel.ts`
   - If not exists: Create basic model
   - If exists: Verify `findById()` exists

**Method to Add:**
```typescript
// ProjectModel.ts
static async findById(id: string): Promise<Project | null>
```

3. **Check if exists:** `src/models/website-builder/PageModel.ts`
   - If not exists: Create basic model

**Method to Add:**
```typescript
// PageModel.ts
static async findByProject(projectId: string, options?: { fields?: string[] }): Promise<Page[]>
```

**No route changes yet** - models are additive.

### Phase 3: Create Services (No Breaking Changes)

**Files to Create:**

1. `src/controllers/admin-media/feature-services/service.media-quota.ts`
   - `checkQuota(projectId, additionalSize): Promise<QuotaCheckResult>`
   - `getCurrentUsage(projectId): Promise<QuotaInfo>`

2. `src/controllers/admin-media/feature-services/service.media-usage.ts`
   - `findUsageByUrl(projectId, s3Url): Promise<string[]>`
   - `findUsageForMultiple(projectId, items[]): Promise<Map<string, string[]>>` (optimized)

3. `src/controllers/admin-media/feature-services/service.media-upload.ts`
   - `uploadBulk(projectId, files): Promise<UploadResult>`

4. `src/controllers/admin-media/feature-services/service.media-list.ts`
   - `list(projectId, options): Promise<MediaListResult>`

5. `src/controllers/admin-media/feature-services/service.media-update.ts`
   - `updateMetadata(projectId, mediaId, updates): Promise<Media>`

6. `src/controllers/admin-media/feature-services/service.media-delete.ts`
   - `delete(projectId, mediaId, force): Promise<void>`

**No route changes yet** - services are additive.

### Phase 4: Create Controller (No Breaking Changes)

**File to Create:**
`src/controllers/admin-media/AdminMediaController.ts`

**Methods:**
```typescript
class AdminMediaController {
  static async uploadMedia(req: Request, res: Response): Promise<Response>
  static async listMedia(req: Request, res: Response): Promise<Response>
  static async updateMedia(req: Request, res: Response): Promise<Response>
  static async deleteMedia(req: Request, res: Response): Promise<Response>
}
```

Each method handles:
- Request parsing
- Input validation (basic)
- Service orchestration
- Response formatting
- Error handling (try/catch with proper status codes)

**No route changes yet** - controller is additive.

### Phase 5: Refactor Route File (BREAKING CHANGE)

**File to Modify:** `src/routes/admin/media.ts`

**Changes:**
1. Remove all helper functions (lines 60-142)
2. Remove all inline business logic from handlers
3. Replace handler bodies with controller method calls
4. Keep multer configuration inline (or import from constants)
5. Reduce file from 532 LOC to ~50 LOC

**New Route Structure:**
```typescript
import express from "express";
import multer from "multer";
import { AdminMediaController } from "../../controllers/admin-media/AdminMediaController";

const router = express.Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

router.post("/", upload.array("files", 20), AdminMediaController.uploadMedia);
router.get("/", AdminMediaController.listMedia);
router.patch("/:mediaId", AdminMediaController.updateMedia);
router.delete("/:mediaId", AdminMediaController.deleteMedia);

export default router;
```

### Phase 6: Testing & Validation

**Test Coverage:**
1. All endpoints return same responses (contract testing)
2. Quota enforcement still works
3. Usage tracking still works
4. S3 cleanup on delete still works
5. Error codes unchanged (400, 404, 500, 507)
6. Pagination works identically
7. File type filters work
8. Search works
9. Bulk upload success/failure separation works

**Manual Validation:**
- Upload 20 files → verify parallel processing
- Upload exceeding quota → verify 507 response
- Delete media in use → verify 400 with pages list
- Delete with force=true → verify deletion
- List with filters → verify results
- Update metadata → verify persistence

---

## Model Method Specifications

### MediaModel

```typescript
interface MediaFilters {
  type?: "all" | "image" | "video" | "pdf";
  search?: string;
}

interface Pagination {
  page: number;
  limit: number;
}

interface CreateMediaInput {
  project_id: string;
  filename: string;
  display_name: string;
  s3_key: string;
  s3_url: string;
  file_size: number;
  mime_type: string;
  width?: number | null;
  height?: number | null;
  thumbnail_s3_key?: string | null;
  thumbnail_s3_url?: string | null;
  original_mime_type?: string | null;
  compressed?: boolean;
}

interface MetadataUpdate {
  display_name?: string;
  alt_text?: string;
}
```

**Methods:**

| Method | Query Replaced | Line Reference |
|--------|----------------|----------------|
| `findById(id)` | `db(MEDIA_TABLE).where('id', id).first()` | N/A (not used) |
| `findByIdAndProject(id, projectId)` | `db(MEDIA_TABLE).where({ id, project_id }).first()` | 419-421, 467-469 |
| `findByProjectWithFilters(projectId, filters, pagination)` | Complex query with type/search filters + pagination | 329-361 |
| `countByProjectWithFilters(projectId, filters)` | Count query with same filters | 354 |
| `create(data)` | `db(MEDIA_TABLE).insert(data).returning('*')` | 252-268 |
| `updateMetadata(id, updates)` | `db(MEDIA_TABLE).where({ id }).update(updates).returning('*')` | 436-439 |
| `deleteById(id)` | `db(MEDIA_TABLE).where({ id }).del()` | 514 |
| `getTotalStorageByProject(projectId)` | `db(MEDIA_TABLE).where({ project_id }).sum('file_size as total').first()` | 71-74 |

### ProjectModel

| Method | Query Replaced | Line Reference |
|--------|----------------|----------------|
| `findById(id)` | `db(PROJECTS_TABLE).where('id', id).first()` | 167 |

### PageModel

| Method | Query Replaced | Line Reference |
|--------|----------------|----------------|
| `findByProject(projectId, options)` | `db(PAGES_TABLE).where({ project_id }).select(options.fields)` | 122-124 |

---

## Files to Create (12 new files)

```
src/controllers/admin-media/
├── AdminMediaController.ts                    [~250 LOC]
├── feature-services/
│   ├── service.media-upload.ts                [~180 LOC]
│   ├── service.media-list.ts                  [~80 LOC]
│   ├── service.media-update.ts                [~40 LOC]
│   ├── service.media-delete.ts                [~70 LOC]
│   ├── service.media-quota.ts                 [~50 LOC]
│   └── service.media-usage.ts                 [~70 LOC]
└── feature-utils/
    ├── util.constants.ts                      [~20 LOC]
    ├── util.validation.ts                     [~15 LOC]
    └── util.s3-helpers.ts                     [~30 LOC]
```

**Estimated Total New Code:** ~805 LOC (vs. current 532 LOC in single file)

**LOC Increase Justification:**
- Type definitions (~80 LOC)
- Error handling improvements (~50 LOC)
- Proper separation of concerns (overhead ~100 LOC)
- Comments and documentation (~60 LOC)
- **Net benefit:** Testability, maintainability, reusability

---

## Files to Modify (4 files)

### 1. `src/routes/admin/media.ts`
**Changes:**
- Remove lines 30-142 (helpers, constants)
- Replace lines 148-530 (all handlers) with controller calls
- Add controller import
- **Final LOC:** ~50 (from 532) → **90% reduction**

### 2. `src/models/website-builder/MediaModel.ts`
**Status:** Check if exists
- If exists: Add missing methods
- If not exists: Create entire model

### 3. `src/models/website-builder/ProjectModel.ts`
**Status:** Check if exists
- If exists: Verify `findById()` exists
- If not exists: Create basic model

### 4. `src/models/website-builder/PageModel.ts`
**Status:** Check if exists (likely doesn't)
- Create new model with `findByProject()` method

---

## Risk Assessment

### High Risk Areas

#### 1. Parallel Upload Processing (Lines 194-283)
**Current Implementation:**
- Uses `Promise.all()` with `files.map(async (file) => {...})`
- Individual file failures caught, don't abort entire batch
- Returns `{ succeeded: [], failed: [] }`

**Risk:** New service must preserve exact same behavior.

**Mitigation:**
- Service must use same `Promise.all()` pattern
- Must catch errors per file, not globally
- Contract test: upload 5 files (3 valid, 2 invalid) → verify partial success response

#### 2. Usage Tracking Performance (Lines 369-377)
**Current Implementation:**
- Loops through each media item
- For each, queries ALL pages and scans sections
- O(n * m) where n = media count, m = page count
- **Example:** 50 media items × 100 pages = 5,000 iterations

**Risk:** N+1 query problem on large projects.

**Mitigation Options:**
1. **Short-term (preserve behavior):** Keep same logic in service
2. **Long-term optimization:**
   - Fetch all pages once
   - Build in-memory map of URL → pages
   - Scan all media items against map
   - Reduces to O(n + m)

**Decision:** Start with same logic, optimize later (separate plan).

#### 3. Quota Enforcement Race Condition
**Current Implementation:**
- Check quota BEFORE uploads (line 178)
- Multiple files uploaded in parallel
- Race condition possible if two bulk uploads start simultaneously

**Risk:** Could exceed quota between check and insert.

**Existing Behavior:** Not handled (race exists in current code).

**Decision:** Preserve existing behavior (don't introduce new transaction logic).

#### 4. S3 Deletion Non-Blocking (Lines 494-510)
**Current Implementation:**
- Try to delete from S3
- If fails, log warning and continue
- Still delete from DB

**Risk:** Orphaned S3 objects if delete fails.

**Existing Behavior:** Non-blocking (intentional for data consistency).

**Decision:** Preserve same behavior in service.

### Medium Risk Areas

#### 5. MIME Type After Processing
**Current Logic:**
- Images uploaded as JPG/PNG → converted to WebP
- Original MIME stored in `original_mime_type`
- Final MIME stored in `mime_type` (always `image/webp`)
- S3 key gets `.webp` extension appended

**Risk:** Service must replicate exact MIME handling.

**Mitigation:** Extract to util, test with all 6 allowed types.

#### 6. Thumbnail Generation
**Current Logic:**
- Only for processable images (JPG, PNG)
- Not for WebP input (already optimized)
- Not for videos or PDFs
- Stored with separate S3 key (`/thumbs/` folder)

**Risk:** Service must preserve same conditional logic.

**Mitigation:** Document in service, add tests.

### Low Risk Areas

#### 7. Pagination Metadata
**Current Response:**
```json
{
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 127,
    "hasMore": true
  }
}
```

**Risk:** Must calculate `hasMore` identically.

**Mitigation:** Copy logic exactly: `offset + media.length < total`

#### 8. Error Response Format
**Current Format:**
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

**Risk:** Client may depend on specific error codes.

**Known Codes:**
- `NO_FILES`
- `PROJECT_NOT_FOUND`
- `QUOTA_EXCEEDED`
- `MEDIA_IN_USE`
- `NOT_FOUND`
- `UPLOAD_ERROR`
- `FETCH_ERROR`
- `UPDATE_ERROR`
- `DELETE_ERROR`

**Mitigation:** Preserve all error codes exactly.

---

## Architectural Concerns

### Concern 1: Multer Configuration in Route
**Current:** Inline in route file (lines 36-39)
**Decision:** Keep inline (acceptable) OR move to constants
**Reason:** Multer middleware must be in route layer

### Concern 2: Service Interdependencies
**Dependencies:**
- `MediaUploadService` depends on `MediaQuotaService`
- `MediaDeleteService` depends on `MediaUsageService`
- `MediaListService` depends on both `MediaUsageService` and `MediaQuotaService`

**Pattern:** Services can depend on other services (not circular).

**Validation:** No circular dependencies detected.

### Concern 3: Usage Tracking Belongs in Service?
**Question:** Should `findMediaUsage()` be in:
- PageModel? (it queries pages)
- MediaModel? (it's about media usage)
- Separate service? ✓

**Decision:** Separate `MediaUsageService` (domain logic, not pure data access).

### Concern 4: Error Handling Depth
**Current:** All errors caught at route level, generic 500 responses.

**Opportunity:** Services can throw typed errors:
- `QuotaExceededError`
- `MediaNotFoundError`
- `MediaInUseError`

**Decision:** Phase 1 preserves current error handling. Phase 2 (future) adds typed errors.

---

## Performance Considerations

### Database Query Optimization

**Current Queries:**
- Upload: 2-3 queries per request (project check, quota check, inserts)
- List: 2 base queries + N usage checks (N = media count)
- Update: 2 queries (fetch, update)
- Delete: 2 queries (fetch, delete) + 1 usage check

**No degradation expected** - same queries move to models.

### Memory Usage

**Upload Handler:**
- Multer stores files in memory (25 MB limit per file, 20 files max)
- Max memory: 500 MB per request (20 × 25 MB)
- Sharp processing creates additional buffers (temporary)

**Risk:** Large bulk uploads could spike memory.

**Current Behavior:** Already exists (not introduced by refactor).

**Mitigation:** Document in service, consider streaming in future.

### S3 Upload Parallelization

**Current:** All files uploaded in parallel via `Promise.all()`.

**Decision:** Preserve same parallelization in service.

**Future Optimization:** Rate-limit parallel uploads (e.g., 5 at a time) to reduce memory.

---

## Security Considerations

### 1. Project Ownership Validation
**Current:** All endpoints check `project_id` in params matches media's `project_id`.

**Critical:** Must preserve in controller/service layer.

**Pattern:**
```typescript
// Every endpoint
const media = await MediaModel.findByIdAndProject(mediaId, projectId);
if (!media) throw new NotFoundError();
```

### 2. MIME Type Validation
**Current:** Whitelist of 6 types, validated before upload.

**Critical:** Must happen BEFORE S3 upload.

**Service Responsibility:** `MediaUploadService` must call `validateMimeType()` early.

### 3. Quota Enforcement
**Current:** Checked before upload, but not transactionally enforced.

**Existing Weakness:** Race condition (2+ bulk uploads simultaneously).

**Decision:** Preserve existing behavior (don't introduce DB transactions in refactor).

### 4. Force Delete Parameter
**Current:** `force=true` bypasses usage check, allows deleting media in use.

**Risk:** Could break page content.

**Existing Behavior:** Intentional backdoor for admins.

**Decision:** Preserve same logic in service.

---

## Testing Strategy

### Unit Tests (Per Service/Util)

**Utils:**
- `util.validation.validateMimeType()` → test all 6 valid types + invalid
- `util.s3-helpers.buildMediaS3Key()` → test sanitization, uniqueness, thumb variant
- `util.s3-helpers.buildS3Url()` → test URL construction

**Models:**
- `MediaModel.getTotalStorageByProject()` → mock db, verify query
- `MediaModel.findByProjectWithFilters()` → test type filters, search, pagination
- `MediaModel.create()` → verify insert + returning

**Services:**
- `MediaQuotaService.checkQuota()` → test under limit, at limit, over limit
- `MediaUsageService.findUsageByUrl()` → test URL found, not found, multiple pages
- `MediaUploadService.uploadBulk()` → test partial failures, quota enforcement

### Integration Tests (Controller → DB)

**Test Cases:**
1. Upload single image → verify WebP conversion, thumbnail, DB record
2. Upload bulk mixed types → verify JPG, PNG, MP4, PDF handling
3. Upload exceeding quota → verify 507 response
4. List with type=image filter → verify only images returned
5. List with search → verify filename matching
6. Update display_name → verify persistence
7. Delete unused media → verify S3 + DB deletion
8. Delete media in use (no force) → verify 400 with pages list
9. Delete media in use (force=true) → verify deletion

### Contract Tests (API Response Format)

**Validate:**
- Response structure unchanged
- Error codes unchanged
- Pagination metadata format
- Quota response format
- Success/failure arrays in bulk upload

---

## Migration Rollback Plan

### Rollback Strategy

**Scenario:** Refactored code deployed, critical bug found.

**Steps:**
1. Revert `src/routes/admin/media.ts` to pre-refactor version (git)
2. No database changes (schema unchanged)
3. No API contract changes (responses identical)
4. New controller/service files ignored (not imported)

**Rollback Time:** < 5 minutes (single file revert).

**Risk Level:** Low (no schema changes, no breaking API changes).

### Incremental Rollout Option

**Alternative Approach:**
1. Deploy new controller/services/models (no route changes)
2. Add feature flag: `USE_REFACTORED_MEDIA_ROUTES`
3. Conditional import in route file:
   ```typescript
   if (process.env.USE_REFACTORED_MEDIA_ROUTES === 'true') {
     router.post("/", upload.array("files", 20), AdminMediaController.uploadMedia);
   } else {
     router.post("/", upload.array("files", 20), legacyUploadHandler);
   }
   ```
4. Test in staging with flag enabled
5. Gradually enable in production
6. Remove flag + legacy code after validation

**Effort:** Medium (requires flag logic).

**Benefit:** Zero-downtime rollback.

---

## Definition of Done

### Code Complete
- [ ] All 12 new files created
- [ ] All 3 model files extended/created
- [ ] Route file refactored (532 LOC → ~50 LOC)
- [ ] All TypeScript types defined
- [ ] All imports corrected
- [ ] No linting errors
- [ ] No TypeScript compilation errors

### Testing Complete
- [ ] Unit tests for all utils (3 files)
- [ ] Unit tests for all services (6 files)
- [ ] Integration tests for all 4 endpoints
- [ ] Contract tests for response formats
- [ ] Manual testing of bulk upload (20 files)
- [ ] Manual testing of quota enforcement
- [ ] Manual testing of usage tracking
- [ ] Manual testing of force delete

### Documentation Complete
- [ ] JSDoc comments in all services
- [ ] README in `src/controllers/admin-media/` (architecture overview)
- [ ] Update main API documentation (if exists)
- [ ] Migration notes in this plan (any deviations)

### Validation Complete
- [ ] All endpoints return same status codes
- [ ] All error codes preserved
- [ ] Pagination works identically
- [ ] Quota calculation matches
- [ ] S3 keys match old format (no orphaned files)
- [ ] Performance unchanged (query count same)
- [ ] Memory usage unchanged

### Deployment Ready
- [ ] Code reviewed (PR approved)
- [ ] Tests passing in CI
- [ ] Staging environment validated
- [ ] Rollback plan documented
- [ ] On-call engineer briefed

---

## Open Questions

### 1. Model Existence
**Question:** Do MediaModel, ProjectModel, PageModel already exist?
**Action:** Check `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/` before starting Phase 2.

### 2. Usage Tracking Optimization
**Question:** Should we optimize `findMediaUsage()` from O(n*m) to O(n+m) now or later?
**Recommendation:** Later (separate plan). Preserve current behavior first.

### 3. Error Types
**Question:** Introduce typed errors (QuotaExceededError, etc.) or preserve string codes?
**Recommendation:** Preserve string codes for now. Phase 2 can add typed errors.

### 4. Multer Config Location
**Question:** Move multer config to constants or keep inline?
**Recommendation:** Keep inline (middleware configuration belongs in route layer).

### 5. Feature Flag Rollout
**Question:** Use feature flag for incremental rollout?
**Recommendation:** Optional. Depends on deployment risk tolerance. Not required if tests pass.

---

## Alternatives Considered

### Alternative 1: Keep Helpers in Route File
**Approach:** Only move business logic to services, keep pure functions (S3 builders, validators) in route file.

**Pros:**
- Less files to create
- Simpler structure

**Cons:**
- Route file still 200+ LOC
- Helpers not reusable by other routes
- Violates "thin routes" principle

**Decision:** Rejected. Move helpers to utils.

### Alternative 2: Single Service File
**Approach:** Create one `MediaService.ts` with all methods instead of 6 service files.

**Pros:**
- Fewer files
- Simpler imports

**Cons:**
- Large file (400+ LOC)
- Harder to test individual features
- Violates single responsibility

**Decision:** Rejected. Use feature-services pattern.

### Alternative 3: Keep Usage Tracking in MediaModel
**Approach:** Add `MediaModel.findUsageByUrl()` instead of separate service.

**Pros:**
- Fewer service files

**Cons:**
- Model queries pages table (cross-model concern)
- Domain logic (section scanning) in data layer
- Harder to optimize later

**Decision:** Rejected. Use separate service (cross-cutting concern).

---

## Success Metrics

### Code Quality
- Route file LOC: 532 → ~50 (90% reduction)
- Testability: 0 unit tests → 50+ unit tests possible
- Reusability: 6 helpers locked in route → 6 utils reusable across codebase

### Performance
- Query count: unchanged
- Response time: unchanged (±5%)
- Memory usage: unchanged

### Maintainability
- Add new media type: 1 file change (constants) vs. 3 locations in route
- Add new endpoint: 1 route line + 1 controller method vs. 100+ LOC in route
- Fix bug in quota logic: 1 service file vs. 2 locations in route

---

## Timeline Estimate

**Phase 1 (Utils):** 2 hours
**Phase 2 (Models):** 4 hours (depends on existing state)
**Phase 3 (Services):** 8 hours
**Phase 4 (Controller):** 4 hours
**Phase 5 (Route Refactor):** 2 hours
**Phase 6 (Testing):** 6 hours

**Total:** ~26 hours (3-4 days)

**Assumptions:**
- Models don't exist (worst case)
- No blockers
- Tests written alongside code

---

## Related Refactors

This refactor pattern should be applied to:
1. Other admin routes (`/admin/websites/:projectId/*`)
2. Public API routes
3. Authentication routes

**Recommendation:** Use this plan as template for other route refactors.

---

**Plan Status:** Ready for Approval
**Next Step:** Review plan → Execute Phase 1 → Iterative implementation
