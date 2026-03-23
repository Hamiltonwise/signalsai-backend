# App Logs Route Refactor Plan

## Current State

### Overview
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/appLogs.ts`
- **Lines of Code**: 153 LOC
- **Endpoints**: 2
  - `GET /api/admin/app-logs` — Read latest N lines from log files
  - `DELETE /api/admin/app-logs` — Clear log file contents
- **Data Source**: Filesystem (no database)
- **Dependencies**:
  - `express` (Request, Response)
  - `fs` (filesystem operations)
  - `path` (file path resolution)
  - `util.promisify` (async file operations)

### Current Responsibilities (Mixed in Route File)
1. Route definitions
2. Request validation (log type, query params)
3. File existence checks
4. File reading logic (with line limiting)
5. File clearing logic
6. Response formatting
7. Error handling
8. Configuration (log file path mapping)

### Log File Configuration
```typescript
const LOG_FILES: Record<string, string> = {
  "agent-run": path.join(__dirname, "../logs/agent-run.log"),
  email: path.join(__dirname, "../logs/email.log"),
  "scraping-tool": path.join(__dirname, "../logs/scraping-tool.log"),
  "website-scrape": path.join(__dirname, "../logs/website-scrape.log"),
};
```

---

## Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── appLogs.ts                    # THIN: only route definitions
├── controllers/
│   └── appLogs/
│       ├── appLogsController.ts      # Main controller (orchestration)
│       ├── feature-services/
│       │   └── logFileService.ts     # Core business logic
│       └── feature-utils/
│           ├── logFileConfig.ts      # Configuration & constants
│           └── logFileValidator.ts   # Validation logic
```

### Separation of Concerns

**Route Layer** (`routes/appLogs.ts`):
- Route definitions only
- Delegates to controller methods
- ~15-25 LOC

**Controller Layer** (`controllers/appLogs/appLogsController.ts`):
- Request orchestration
- Calls service layer
- Response formatting
- HTTP-specific error handling

**Service Layer** (`controllers/appLogs/feature-services/logFileService.ts`):
- Core file operations (read, clear)
- File existence checks
- Line parsing and limiting
- Business logic errors (not HTTP)

**Utils Layer** (`controllers/appLogs/feature-utils/`):
- `logFileConfig.ts`: Log file path mapping, constants
- `logFileValidator.ts`: Input validation (log type, line count)

---

## Code Mapping

### What Goes Where

#### 1. **logFileConfig.ts** (Configuration)
```
Lines 16-25 → LOG_FILES mapping
             → VALID_LOG_TYPES
             → Default values (DEFAULT_LOG_TYPE, DEFAULT_MAX_LINES)
```
**Responsibilities**:
- Log file path mapping
- Valid log type list
- Default configuration constants
- Path resolution logic

---

#### 2. **logFileValidator.ts** (Validation)
```
Lines 44-54 → validateLogType()
Lines 45    → parseMaxLines()
Lines 112-121 → (duplicate validation — consolidate)
```
**Responsibilities**:
- Validate log type against whitelist
- Parse and validate line count parameter
- Return typed validation results

---

#### 3. **logFileService.ts** (Core Business Logic)
```
Lines 56-77 → readLogFile(logType, maxLines)
Lines 73-77 → (line slicing logic)
Lines 59-70 → (file existence handling)
Lines 123-134 → clearLogFile(logType)
Lines 126-131 → (file existence handling for delete)
```
**Responsibilities**:
- Read log file with line limiting
- Clear log file contents
- Check file existence
- Return structured data (not HTTP responses)
- Throw business logic errors

---

#### 4. **appLogsController.ts** (Orchestration)
```
Lines 42-96 → getLogFile() controller
Lines 110-151 → clearLogFile() controller
Lines 79-87 → Response formatting
Lines 88-95 → HTTP error handling
Lines 138-142 → Response formatting
Lines 143-150 → HTTP error handling
```
**Responsibilities**:
- Extract query parameters from request
- Call validators
- Call service layer
- Format HTTP responses
- Convert service errors to HTTP status codes
- Log HTTP-level events

---

#### 5. **appLogs.ts** (Route Definitions)
```
Lines 42 → router.get("/", appLogsController.getLogFile)
Lines 110 → router.delete("/", appLogsController.clearLogFile)
Lines 1-5 → JSDoc (keep minimal version)
```
**Responsibilities**:
- Define routes
- Wire routes to controller methods
- Export router

---

## Step-by-Step Migration

### Step 1: Create Folder Structure
```bash
mkdir -p src/controllers/appLogs/feature-services
mkdir -p src/controllers/appLogs/feature-utils
```

### Step 2: Create Configuration File
**File**: `src/controllers/appLogs/feature-utils/logFileConfig.ts`

**Extract**:
- LOG_FILES mapping (lines 16-22)
- VALID_LOG_TYPES (line 25)
- Add: DEFAULT_LOG_TYPE = "agent-run"
- Add: DEFAULT_MAX_LINES = 500

**Export**:
- LOG_FILES
- VALID_LOG_TYPES
- DEFAULT_LOG_TYPE
- DEFAULT_MAX_LINES
- Helper: getLogFilePath(logType: string): string

### Step 3: Create Validator File
**File**: `src/controllers/appLogs/feature-utils/logFileValidator.ts`

**Extract**:
- Validation logic from lines 44-54 & 112-121 (consolidate duplicates)

**Functions**:
- `validateLogType(logType: string): { isValid: boolean; error?: string }`
- `parseMaxLines(linesParam: string | undefined, defaultValue: number): number`

**Dependencies**:
- Import VALID_LOG_TYPES from logFileConfig.ts

### Step 4: Create Service File
**File**: `src/controllers/appLogs/feature-services/logFileService.ts`

**Extract**:
- Core file operations from lines 56-77 (read logic)
- Core file operations from lines 123-134 (clear logic)

**Functions**:
```typescript
// Read log file with line limiting
readLogFile(logType: string, maxLines: number): Promise<{
  logs: string[];
  total_lines: number;
  log_type: string;
}>

// Clear log file contents
clearLogFile(logType: string): Promise<void>
```

**Dependencies**:
- Import fs, path, promisify
- Import getLogFilePath from logFileConfig.ts
- Define custom error types: LogFileNotFoundError, LogFileReadError, LogFileClearError

**Error Handling**:
- Return empty logs array if file doesn't exist (read)
- Silently succeed if file doesn't exist (clear)
- Throw typed errors for actual failures

### Step 5: Create Controller File
**File**: `src/controllers/appLogs/appLogsController.ts`

**Extract**:
- Request handling from lines 42-96 (GET endpoint logic)
- Request handling from lines 110-151 (DELETE endpoint logic)

**Functions**:
```typescript
// GET handler
getLogFile(req: Request, res: Response): Promise<Response>

// DELETE handler
clearLogFile(req: Request, res: Response): Promise<Response>
```

**Dependencies**:
- Import { Request, Response } from express
- Import * as logFileService from feature-services/logFileService
- Import * as validator from feature-utils/logFileValidator
- Import { DEFAULT_LOG_TYPE, DEFAULT_MAX_LINES } from feature-utils/logFileConfig

**Responsibilities**:
- Parse query parameters
- Call validators
- Call service layer
- Format success responses
- Catch service errors and return appropriate HTTP status codes
- Console logging for HTTP events

### Step 6: Refactor Route File
**File**: `src/routes/appLogs.ts`

**New Structure**:
```typescript
import express from "express";
import * as appLogsController from "../controllers/appLogs/appLogsController";

const router = express.Router();

/**
 * GET /api/admin/app-logs
 * Returns latest lines from specified log file
 */
router.get("/", appLogsController.getLogFile);

/**
 * DELETE /api/admin/app-logs
 * Clears specified log file
 */
router.delete("/", appLogsController.clearLogFile);

export default router;
```

**Result**: ~20 LOC (down from 153 LOC)

### Step 7: Update Imports
Ensure all new files have correct imports:
- Relative path imports for local modules
- Proper type imports from express

### Step 8: Test Integration
- Verify routes still work
- Test GET endpoint with different log types
- Test GET endpoint with line limiting
- Test DELETE endpoint
- Verify error cases (invalid log type, missing files)
- Check console logs still output correctly

---

## Files to Create

### 1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/appLogs/feature-utils/logFileConfig.ts`
**Responsibilities**:
- Log file path mapping (LOG_FILES)
- Valid log types list (VALID_LOG_TYPES)
- Default constants (DEFAULT_LOG_TYPE, DEFAULT_MAX_LINES)
- Helper function: getLogFilePath(logType: string)

**Exports**:
```typescript
export const LOG_FILES: Record<string, string>
export const VALID_LOG_TYPES: string[]
export const DEFAULT_LOG_TYPE: string
export const DEFAULT_MAX_LINES: number
export function getLogFilePath(logType: string): string
```

---

### 2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/appLogs/feature-utils/logFileValidator.ts`
**Responsibilities**:
- Validate log type parameter
- Parse and validate line count parameter
- Return structured validation results

**Exports**:
```typescript
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateLogType(logType: string): ValidationResult
export function parseMaxLines(linesParam: string | undefined, defaultValue: number): number
```

---

### 3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/appLogs/feature-services/logFileService.ts`
**Responsibilities**:
- Read log files with line limiting
- Clear log file contents
- Handle file existence checks
- Return structured data (not HTTP responses)

**Exports**:
```typescript
export interface LogFileData {
  logs: string[];
  total_lines: number;
  log_type: string;
}

export async function readLogFile(logType: string, maxLines: number): Promise<LogFileData>
export async function clearLogFile(logType: string): Promise<void>
```

**Error Types**:
```typescript
export class LogFileError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "LogFileError";
  }
}
```

---

### 4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/appLogs/appLogsController.ts`
**Responsibilities**:
- HTTP request orchestration
- Query parameter extraction
- Validation delegation
- Service layer calls
- HTTP response formatting
- Error-to-status-code mapping

**Exports**:
```typescript
export async function getLogFile(req: Request, res: Response): Promise<Response>
export async function clearLogFile(req: Request, res: Response): Promise<Response>
```

---

## Files to Modify

### `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/appLogs.ts`
**Before**: 153 LOC with mixed concerns
**After**: ~20 LOC with only route definitions

**Changes**:
- Remove all implementation logic
- Remove fs, path, util imports
- Add controller import
- Replace inline handlers with controller method references
- Keep minimal JSDoc comments for API documentation

**Result**:
```typescript
import express from "express";
import * as appLogsController from "../controllers/appLogs/appLogsController";

const router = express.Router();

router.get("/", appLogsController.getLogFile);
router.delete("/", appLogsController.clearLogFile);

export default router;
```

---

## Risk Assessment

### Low Risk
- **No database operations**: Reduces risk of data corruption
- **Simple file I/O**: Well-understood operations
- **No external service calls**: No network-related edge cases
- **Clear boundaries**: Each layer has distinct responsibilities

### Medium Risk
- **File path resolution**: Ensure `__dirname` behavior is preserved when moving code
  - **Mitigation**: Use absolute paths or environment-based config
  - **Test**: Verify log file paths resolve correctly in all environments

- **Import path changes**: Route file will have new import paths
  - **Mitigation**: Use TypeScript compiler to catch import errors
  - **Test**: Verify application builds without errors

- **Error handling changes**: Service layer throws errors, controller catches them
  - **Mitigation**: Ensure all service errors are caught and mapped to HTTP responses
  - **Test**: Verify error responses match original behavior (status codes, messages)

### Potential Issues

#### 1. **Path Resolution**
**Issue**: `path.join(__dirname, "../logs/...")` may break when code moves
**Solution**:
- Use root-relative paths
- Or move log path configuration to environment variables
- Or create a dedicated log directory resolver utility

#### 2. **Error Message Consistency**
**Issue**: Error messages might change during refactor
**Solution**:
- Document original error messages
- Ensure controller preserves exact error codes and messages
- Write tests that verify error responses

#### 3. **Default Value Handling**
**Issue**: Default values scattered in code (lines 44, 45, 112)
**Solution**:
- Centralize in logFileConfig.ts
- Ensure controller uses config constants

#### 4. **Response Format Changes**
**Issue**: Refactor might accidentally alter response structure
**Solution**:
- Document original response schemas
- Verify exact JSON structure is preserved
- Test response fields: success, data, error, message, timestamp

#### 5. **Console Logging**
**Issue**: Console logs on lines 89, 136, 144 might be missed
**Solution**:
- Keep HTTP-level logging in controller
- Add service-level logging if needed
- Maintain `[App Logs]` prefix for consistency

### Testing Checklist
- [ ] GET /api/admin/app-logs (default params)
- [ ] GET /api/admin/app-logs?type=email
- [ ] GET /api/admin/app-logs?lines=100
- [ ] GET /api/admin/app-logs?type=invalid (expect 400)
- [ ] GET /api/admin/app-logs?type=agent-run&lines=1000
- [ ] GET when log file doesn't exist (expect empty array, 200 OK)
- [ ] DELETE /api/admin/app-logs
- [ ] DELETE /api/admin/app-logs?type=email
- [ ] DELETE /api/admin/app-logs?type=invalid (expect 400)
- [ ] DELETE when log file doesn't exist (expect success)
- [ ] Verify error responses match original format
- [ ] Verify console logs still appear
- [ ] Verify TypeScript compilation succeeds
- [ ] Verify no runtime errors on server start

---

## Migration Execution Order

**Critical**: Follow this order to avoid breaking changes:

1. **Create all new files** (Steps 2-5)
   - logFileConfig.ts
   - logFileValidator.ts
   - logFileService.ts
   - appLogsController.ts

2. **Verify new files compile** without errors

3. **Update route file** (Step 6)
   - Import controller
   - Replace inline handlers

4. **Test all endpoints** (Step 8)

5. **Delete commented-out code** from route file (if any)

**Why this order?**
- New files can be created without breaking existing routes
- Route file is modified last, minimizing downtime
- Compilation errors caught before switching over
- Easy rollback: just revert route file changes

---

## Definition of Done

- [ ] All 4 new files created with correct exports
- [ ] Route file reduced to ~20 LOC (route definitions only)
- [ ] TypeScript compilation succeeds
- [ ] Server starts without errors
- [ ] All GET endpoint tests pass
- [ ] All DELETE endpoint tests pass
- [ ] All error cases return correct status codes
- [ ] Console logs still output with `[App Logs]` prefix
- [ ] Response JSON structure matches original exactly
- [ ] File paths resolve correctly in development and production
- [ ] No hardcoded values in controller (use config constants)
- [ ] Import paths use relative imports correctly
- [ ] JSDoc comments preserved where valuable (route-level API docs)
- [ ] No duplicate validation logic (consolidated in validator)

---

## Post-Refactor Benefits

**Maintainability**:
- Clear separation of concerns
- Easy to locate file operation logic (in service layer)
- Easy to locate validation rules (in validator)
- Easy to update log file paths (in config)

**Testability**:
- Service layer can be unit tested without HTTP mocks
- Validators can be tested independently
- Controller can be tested with mocked services

**Consistency**:
- Matches target architecture pattern
- Other routes can follow this structure
- Establishes precedent for future route refactors

**Future Extensions**:
- Add pagination support (modify service layer only)
- Add log filtering (modify service layer only)
- Add log rotation (add to service layer)
- Add new log types (update config only)
- Add authentication (middleware on routes, no controller changes)
