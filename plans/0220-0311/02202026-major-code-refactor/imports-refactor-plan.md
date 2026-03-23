# Imports Route Refactor Plan

## 1. Current State

### Overview
The imports route serves public import files from the `website_builder.alloro_imports` table via two GET endpoints.

**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/imports.ts`
**LOC**: 159 lines
**Endpoints**: 2

### Endpoints
1. `GET /api/imports/:filename` — Serves the published version of an import
2. `GET /api/imports/:filename/v/:version` — Serves a specific version of an import

### Current Dependencies
- `express` — Router, Request, Response types
- `stream` (Readable) — For streaming S3 content
- `../database/connection` (db) — Direct database access via Knex
- `../services/s3` (getFromS3) — S3 file retrieval

### What It Does
- **Published Version Endpoint**: Fetches a record with `status: "published"` and serves the file
- **Versioned Endpoint**: Fetches a specific version by filename + version number, enforces deprecation policy (410 Gone for deprecated)
- **Content Serving**: Serves text content directly from DB or streams binary content from S3
- **HTTP Headers**: Sets Content-Type, Content-Length, Cache-Control, ETag, X-Import-Version
- **Error Handling**: Returns 404, 400, 410, 500 with structured JSON errors

### Direct Database Access
- Line 28-30: `db(IMPORTS_TABLE).where({ filename, status: "published" }).first()`
- Line 96-98: `db(IMPORTS_TABLE).where({ filename, version: versionNum }).first()`

---

## 2. Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── imports.ts                    # Route definitions only (stripped to ~30 LOC)
├── controllers/
│   └── imports/
│       ├── importsController.ts      # Main controller, orchestrates services
│       ├── feature-services/
│       │   └── importsService.ts     # Business logic: fetch import, validate version, handle deprecation
│       └── feature-utils/
│           ├── responseHeaders.ts    # Utility: setImportResponseHeaders()
│           └── streamingUtils.ts     # Utility: streamFromS3(), streamTextContent()
```

### Responsibilities

**routes/imports.ts**
- Route definitions only
- Parameter extraction
- Delegates to controller functions
- No business logic, no direct DB calls

**controllers/imports/importsController.ts**
- Orchestration layer
- Calls service layer for data retrieval
- Calls utils for response formatting
- Error handling and HTTP status codes

**feature-services/importsService.ts**
- Business logic
- Calls AlloroImportModel for data access
- Validates version numbers
- Enforces deprecation policy
- Returns domain objects or errors

**feature-utils/responseHeaders.ts**
- Pure utility for setting HTTP headers
- Accepts import record, sets Content-Type, ETag, Cache-Control, etc.

**feature-utils/streamingUtils.ts**
- Pure utility for streaming content
- Handles both text content and S3 streaming
- Abstracts Readable vs ReadableStream logic

---

## 3. Code Mapping

### Route File (imports.ts)
**Before**: 159 lines with inline business logic
**After**: ~30 lines, pure route definitions

**Keeps**:
- Express router setup
- Route definitions with path parameters
- Controller function calls

**Removes**:
- All db() calls
- All business logic
- All streaming logic
- All header setting logic
- All error formatting (moves to controller)

### Controller (importsController.ts)
**Creates**: ~80-100 lines

**Responsibilities**:
- `servePublishedImport(req, res)` — GET /:filename handler
- `serveVersionedImport(req, res)` — GET /:filename/v/:version handler
- Orchestrates: service calls → utils → response
- HTTP status codes (404, 400, 410, 500)
- Error response formatting

### Service (importsService.ts)
**Creates**: ~60-80 lines

**Responsibilities**:
- `getPublishedImport(filename)` — Fetches published import record
- `getImportByVersion(filename, version)` — Fetches specific version
- `validateVersion(version)` — Validates version number format
- Returns typed results: `{ success: true, data }` or `{ success: false, error }`

### Utility: responseHeaders.ts
**Creates**: ~40 lines

**Responsibilities**:
- `setImportResponseHeaders(res, record)` — Sets all HTTP headers
- Pure function, no side effects beyond res.setHeader()

### Utility: streamingUtils.ts
**Creates**: ~60 lines

**Responsibilities**:
- `streamTextContent(res, textContent)` — Sends text directly
- `streamFromS3(res, s3Key)` — Streams from S3, handles Readable vs ReadableStream
- Encapsulates pump logic for ReadableStream

---

## 4. Model Replacements

### Direct DB Call → Model Method Mapping

**Route Line 28-30**:
```typescript
// BEFORE
const record = await db(IMPORTS_TABLE)
  .where({ filename, status: "published" })
  .first();
```

**REPLACE WITH** (in service):
```typescript
// AFTER
const record = await AlloroImportModel.findByFilenameAndStatus(
  filename,
  "published"
);
```

**Route Line 96-98**:
```typescript
// BEFORE
const record = await db(IMPORTS_TABLE)
  .where({ filename, version: versionNum })
  .first();
```

**REPLACE WITH** (in service):
```typescript
// AFTER — needs new model method
const record = await AlloroImportModel.findByFilenameAndVersion(
  filename,
  versionNum
);
```

### New Model Method Required

Add to `AlloroImportModel.ts`:

```typescript
static async findByFilenameAndVersion(
  filename: string,
  version: number,
  trx?: QueryContext
): Promise<IAlloroImport | undefined> {
  return this.table(trx).where({ filename, version }).first();
}
```

---

## 5. Step-by-Step Migration

### Step 1: Add Missing Model Method
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/AlloroImportModel.ts`

Add `findByFilenameAndVersion()` method after line 47.

### Step 2: Create Controller Directory Structure
```bash
mkdir -p signalsai-backend/src/controllers/imports/feature-services
mkdir -p signalsai-backend/src/controllers/imports/feature-utils
```

### Step 3: Create Utility — responseHeaders.ts
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-utils/responseHeaders.ts`

**Exports**:
- `setImportResponseHeaders(res: Response, record: IAlloroImport, includeStatus?: boolean)`

**Sets**:
- Content-Type
- Content-Length
- Cache-Control
- X-Import-Version
- X-Import-Status (if includeStatus)
- ETag (if content_hash exists)

### Step 4: Create Utility — streamingUtils.ts
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-utils/streamingUtils.ts`

**Exports**:
- `streamTextContent(res: Response, textContent: string): void`
- `streamFromS3(res: Response, s3Key: string): Promise<void>`

**Logic**:
- streamTextContent: `res.send(textContent)`
- streamFromS3: Calls getFromS3(), handles Readable vs ReadableStream, pipes to res

### Step 5: Create Service — importsService.ts
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-services/importsService.ts`

**Exports**:
- `getPublishedImport(filename: string)`
- `getImportByVersion(filename: string, version: number)`
- `validateVersionNumber(version: string): { valid: boolean; value?: number; error?: string }`

**Logic**:
- Uses AlloroImportModel methods
- Returns result objects: `{ success: true, data: IAlloroImport }` or `{ success: false, error: string, code: string }`

### Step 6: Create Controller — importsController.ts
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/importsController.ts`

**Exports**:
- `servePublishedImport(req: Request, res: Response)`
- `serveVersionedImport(req: Request, res: Response)`

**Logic**:
- Extract params
- Call service methods
- Handle service errors → HTTP status codes
- Call utils for headers + streaming
- try/catch → 500 error

### Step 7: Refactor Route File — imports.ts
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/imports.ts`

**Remove**:
- All inline logic
- db import
- IMPORTS_TABLE constant
- Streaming logic

**Keep**:
- Express router
- Route definitions

**Replace**:
```typescript
router.get("/:filename", importsController.servePublishedImport);
router.get("/:filename/v/:version", importsController.serveVersionedImport);
```

### Step 8: Test Each Endpoint
- Test published import: `GET /api/imports/main.css`
- Test versioned import: `GET /api/imports/main.css/v/2`
- Test deprecated version: `GET /api/imports/old.js/v/1` (should return 410)
- Test invalid version: `GET /api/imports/main.css/v/abc` (should return 400)
- Test not found: `GET /api/imports/nonexistent.css` (should return 404)
- Test S3 streaming (binary files)
- Test text content (CSS/JS served from DB)

### Step 9: Remove Old Imports
Remove from route file:
- `import { db } from "../database/connection";`
- `const IMPORTS_TABLE = "website_builder.alloro_imports";`

---

## 6. Files to Create

### New Files (5 total)

1. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/importsController.ts`**
   - 80-100 LOC
   - Exports: `servePublishedImport`, `serveVersionedImport`

2. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-services/importsService.ts`**
   - 60-80 LOC
   - Exports: `getPublishedImport`, `getImportByVersion`, `validateVersionNumber`

3. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-utils/responseHeaders.ts`**
   - 40 LOC
   - Exports: `setImportResponseHeaders`

4. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/imports/feature-utils/streamingUtils.ts`**
   - 60 LOC
   - Exports: `streamTextContent`, `streamFromS3`

5. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/AlloroImportModel.ts` (modification)**
   - Add 1 new method: `findByFilenameAndVersion`

---

## 7. Files to Modify

### Modified Files (2 total)

1. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/imports.ts`**
   - **Before**: 159 LOC
   - **After**: ~30 LOC
   - Strip all inline logic
   - Keep route definitions only
   - Import controller functions

2. **`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/website-builder/AlloroImportModel.ts`**
   - Add `findByFilenameAndVersion()` static method

---

## 8. Risk Assessment

### High Risk
**None**. This is a read-only route with no auth, no mutations, no side effects.

### Medium Risk

1. **S3 Streaming Logic**
   - **Risk**: Improper handling of Readable vs ReadableStream could break binary file serving
   - **Mitigation**: Test thoroughly with both text and binary imports, preserve exact streaming logic from original

2. **Header Setting Order**
   - **Risk**: Headers must be set before streaming begins
   - **Mitigation**: Call `setImportResponseHeaders()` before calling streaming utils

3. **Error Response Format Changes**
   - **Risk**: Clients may depend on exact error response structure
   - **Mitigation**: Preserve exact error response format: `{ error: string, message: string }`

### Low Risk

1. **Version Validation Logic**
   - **Risk**: Version parsing logic could change behavior
   - **Mitigation**: Extract exact logic from line 89-94, no changes

2. **Cache-Control Headers**
   - **Risk**: Changing cache headers could impact CDN behavior
   - **Mitigation**: Preserve exact header values: `public, max-age=3600`

3. **Import Path Changes**
   - **Risk**: Breaking imports if controller path is wrong
   - **Mitigation**: Use absolute imports, verify with TypeScript compiler

### Edge Cases to Test

- **Deprecated Version**: Returns 410 with exact error structure
- **Invalid Version**: Non-numeric version returns 400
- **Version 0 or Negative**: Returns 400
- **Empty text_content**: Should fall through to S3 streaming
- **Missing s3_key**: Will fail in getFromS3(), caught by try/catch → 500
- **S3 Service Failure**: Caught by try/catch → 500
- **Missing content_hash**: Headers still set correctly (no ETag)
- **Large Files**: Streaming should not buffer in memory

### Failure Modes

**What could go wrong?**

1. **S3 stream not piped correctly** → File download hangs or fails
   - **Detection**: Test binary file downloads
   - **Fix**: Preserve exact pump() logic for ReadableStream

2. **Headers set after streaming starts** → Headers ignored, response malformed
   - **Detection**: Missing Content-Type or Cache-Control headers
   - **Fix**: Ensure headers are set before streaming

3. **Model method returns wrong shape** → TypeScript errors or runtime crashes
   - **Detection**: Compile-time TypeScript error
   - **Fix**: Model method returns `IAlloroImport | undefined`

4. **Error responses don't match client expectations** → Client-side errors
   - **Detection**: Test with existing client code
   - **Fix**: Match exact error format from current implementation

5. **Version validation differs from original** → Different 400 error behavior
   - **Detection**: Test version validation edge cases
   - **Fix**: Extract exact validation logic (lines 89-94)

---

## 9. Validation Checklist

Before marking this refactor complete:

- [ ] All tests pass (if tests exist)
- [ ] TypeScript compiles with no errors
- [ ] Manual testing: published import returns 200 with correct headers
- [ ] Manual testing: versioned import returns 200 with correct headers
- [ ] Manual testing: deprecated version returns 410
- [ ] Manual testing: invalid version returns 400
- [ ] Manual testing: not found returns 404
- [ ] Manual testing: text content served correctly
- [ ] Manual testing: binary content streamed correctly
- [ ] ETag header present when content_hash exists
- [ ] Cache-Control header set correctly
- [ ] X-Import-Version header set correctly
- [ ] No direct db() calls remain in route file
- [ ] Route file is ~30 LOC
- [ ] Controller functions are properly exported
- [ ] Service functions return consistent result shapes
- [ ] Utils are pure functions with no hidden side effects

---

## 10. Definition of Done

This refactor is complete when:

1. **All new files created** with correct responsibilities
2. **Route file stripped down** to route definitions only (~30 LOC)
3. **All db() calls replaced** with AlloroImportModel methods
4. **All endpoints tested** and return correct responses
5. **No behavior changes** from user perspective (exact same HTTP responses)
6. **TypeScript compiles** with no errors
7. **Code review passed** (if applicable)
8. **Documentation updated** (if this route is documented elsewhere)

---

## Notes

- This is a **behavior-preserving refactor** — no new features, no logic changes
- The refactor improves **maintainability** and **testability** without altering functionality
- The controller layer enables **future testing** via dependency injection (mocking service layer)
- The service layer enables **reusability** if import logic is needed elsewhere
- The utils layer enables **testability** of streaming and header logic in isolation
