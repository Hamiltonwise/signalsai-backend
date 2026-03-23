# PMS Route Refactor Plan

**Route File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/pms.ts`
**Current LOC:** 1,652 lines
**Endpoint Count:** 17 endpoints
**Target Pattern:** Route → Controller → Feature Services → Model

---

## 1. Current State

### Overview
Massive route file managing PMS (Practice Management System) integrations for dental practices. Handles file uploads (CSV, XLS, XLSX), manual data entry, AI parsing via n8n webhooks, admin/client approval workflows, automation state tracking, data aggregation, and monthly agent orchestration. High complexity due to state machine logic, external integrations, and multi-vendor PMS data normalization.

### Endpoints (17 Total)

#### Data Upload & Processing
1. **POST /pms/upload** (Lines 175-453, ~278 LOC)
   - Accepts file uploads (CSV, XLS, XLSX, TXT) or manual JSON data
   - Handles two distinct paths:
     - **Manual Entry Path:** Direct data entry, skips parsing/approvals, auto-triggers monthly agents
     - **File Upload Path:** Converts files to CSV → JSON, sends to n8n webhook for AI parsing
   - Uses multer for file handling (10MB limit)
   - Creates PMS job records with automation status tracking
   - Initializes automation workflow state machine
   - Triggers external webhook: `https://n8napp.getalloro.com/webhook/parse-csv`

2. **POST /pms/summary** (Lines 459-492, ~33 LOC)
   - Placeholder endpoint (returns zeros)
   - Intended for PMS data summaries by clientId
   - Currently not implemented (returns mock data)

#### Data Retrieval
3. **GET /pms/keyData** (Lines 498-632, ~134 LOC)
   - Aggregates PMS metrics across all approved jobs for a domain
   - Uses `aggregatePmsData()` utility for smart deduplication
   - Returns months, sources, totals, stats, and latest raw job data
   - Normalizes boolean approval flags (handles 0/1/true/false)
   - Defaults to `artfulorthodontics.com` if no domain provided

4. **GET /pms/jobs** (Lines 638-750, ~112 LOC)
   - Paginated job listing with filters (status, isApproved, domain)
   - Supports multiple status filtering via comma-separated values
   - Parses `automation_status_detail` JSON field
   - Returns pagination metadata (page, perPage, total, totalPages, hasNextPage)
   - PAGE_SIZE constant: 10

#### Admin & Client Approval Workflows
5. **PATCH /pms/jobs/:id/approval** (Lines 756-896, ~140 LOC)
   - Admin approval endpoint (cannot revert once enabled)
   - Updates `is_approved` flag and job `status` to "approved"
   - Advances automation: `pms_parser` → `admin_approval` → `client_approval`
   - Creates notification for domain: "PMS Data Approved"
   - Prevents approval status reversion (throws 400 error)

6. **PATCH /pms/jobs/:id/client-approval** (Lines 902-1053, ~151 LOC)
   - Client approval endpoint
   - Updates `is_client_approved` flag
   - Advances automation: `client_approval` → `monthly_agents`
   - Triggers monthly agents via internal API call: `/api/agents/monthly-agents-run`
   - Async axios call (doesn't wait for completion)
   - Returns special `toastMessage` for frontend notifications

#### Data Management
7. **PATCH /pms/jobs/:id/response** (Lines 1059-1167, ~108 LOC)
   - Updates `response_log` JSON field (parsed PMS data)
   - Validates JSON serialization
   - Normalizes string/object inputs (accepts both)
   - Handles null/empty values

8. **DELETE /pms/jobs/:id** (Lines 1173-1210, ~37 LOC)
   - Hard deletes PMS job record
   - No soft delete, permanent removal
   - Returns 404 if job not found

#### Automation Monitoring & Control
9. **GET /pms/jobs/:id/automation-status** (Lines 1216-1324, ~108 LOC)
   - Polling endpoint for real-time automation progress
   - Auto-advances state machine if job status is "completed" but parser still "processing"
   - Sends admin email notification when parser completes (via `notifyAdmins()`)
   - Returns full automation status detail with step-by-step progress

10. **GET /pms/automation/active** (Lines 1330-1394, ~64 LOC)
    - Dashboard view of all active (non-completed) automation jobs
    - Filters by automation status: `pending`, `processing`, `awaiting_approval`
    - Optional domain filtering
    - Uses JSONB query: `automation_status_detail::jsonb->>'status' IN (...)`

11. **POST /pms/jobs/:id/retry** (Lines 1400-1650, ~250 LOC)
    - Retry failed automation steps: `pms_parser` or `monthly_agents`
    - **PMS Parser Retry:**
      - Requires `raw_input_data` (saved during upload)
      - Resets automation to `pms_parser` step
      - Clears approvals, resets status to "pending"
      - Resends data to n8n webhook
    - **Monthly Agents Retry:**
      - Requires domain, google account, and parsed PMS data
      - Resets automation to `monthly_agents` step
      - Triggers `/api/agents/monthly-agents-run` endpoint
    - Uses `resetToStep()` utility to clear subsequent steps

### Current Dependencies

#### NPM Packages
- `express` (Router, Request, Response)
- `multer` (File uploads with memory storage)
- `xlsx` (Excel file parsing)
- `csvtojson` (CSV to JSON conversion)
- `axios` (External webhook calls, internal API triggers)

#### Internal Modules
- `../database/connection` (Knex `db` instance)
- `../utils/pmsAggregator` (`aggregatePmsData()`)
- `../utils/notificationHelper` (`createNotification()`, `notifyAdmins()`)
- `../utils/pmsAutomationStatus` (State machine utilities):
  - `initializeAutomationStatus()`
  - `updateAutomationStatus()`
  - `completeStep()`
  - `setAwaitingApproval()`
  - `getAutomationStatus()`
  - `resetToStep()`
  - Types: `AutomationStatusDetail`, `PmsStatus`

#### Environment Variables
- `APP_URL` (Conditional: production = `https://app.getalloro.com`, dev = `http://localhost:5174`)
- `process.env.PORT` (Defaults to 3000 for internal API calls)

### Current Responsibilities (All in Route File)

#### Route Layer (Should Stay)
- Route definitions
- Middleware registration (multer upload)

#### Controller Layer (Should Move)
- Request validation
- Parameter extraction/parsing
- Response formatting
- Error handling (try/catch blocks)
- HTTP status code decisions
- Business orchestration

#### Service Layer (Should Move)
- File conversion logic (Excel → CSV → JSON)
- Data normalization (boolean coercion, number parsing)
- Manual vs file upload path branching
- Automation state machine orchestration
- External webhook triggering
- Notification creation

#### Utility Layer (Already Extracted, Keep)
- Data aggregation (`pmsAggregator`)
- Automation status tracking (`pmsAutomationStatus`)
- Notification helpers (`notificationHelper`)

#### Model Layer (Should Move)
- **All direct `db()` calls should use PmsJobModel or GoogleAccountModel:**
  - 39 direct database queries in current file
  - Mix of inserts, updates, selects, deletes
  - Raw JSONB queries for automation status filtering

### Key Business Logic

#### Multer Configuration (Lines 141-165)
- Memory storage (in-memory buffer)
- 10MB file size limit
- Allowed MIME types: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/plain`
- Allowed extensions: `.csv`, `.xls`, `.xlsx`, `.txt`
- Custom fileFilter validation

#### Type Coercion Helpers (Lines 28-98)
- `coerceBoolean()`: Handles 1/0, true/false, "yes"/"no", "1"/"0"
- `parseResponseLog()`: Parses JSON strings, handles malformed data
- `toNumber()`: Cleans currency strings, handles NaN
- `ensureArray()`: Type-safe array wrapper
- `extractMonthEntriesFromResponse()`: Extracts `monthly_rollup` or `report_data` from nested JSON

#### Automation State Machine
**Steps (in order):**
1. `file_upload` → File received, parsed to JSON
2. `pms_parser` → Sent to n8n webhook for AI parsing
3. `admin_approval` → Awaiting admin review/approval
4. `client_approval` → Awaiting client confirmation
5. `monthly_agents` → Running 4 sub-agents (summary, referral, opportunity, CRO)
6. `task_creation` → Creating action items
7. `complete` → Automation finished

**Auto-Advancement Logic:**
- Manual entry skips steps 2-4 (parser, admin, client approval)
- Admin approval auto-advances parser if still "processing"
- Client approval triggers monthly agents immediately
- Automation status polling auto-advances when job status = "completed"

### Issues with Current Architecture

#### Maintainability
- 1,652 LOC in single file makes navigation/debugging difficult
- Mixed concerns: file handling, validation, DB queries, external calls, state machine logic
- Duplicate error handling patterns across 17 endpoints
- Difficult to locate specific business logic

#### Testability
- Cannot unit test individual handlers without full Express setup
- Cannot mock external dependencies (axios, multer) easily
- State machine logic tightly coupled to route handlers
- No clear separation of pure vs impure functions

#### Reusability
- File conversion logic (XLSX → CSV) buried in upload handler
- Boolean normalization logic duplicated (lines 537-554)
- Response log parsing logic repeated multiple times
- Automation orchestration scattered across multiple endpoints

#### Consistency
- Some endpoints use `res.json()`, others `return res.json()`
- Error messages vary: some use `error.message`, others hardcode strings
- Inconsistent logging: `console.log` vs `console.error` placement
- Mixed parameter validation styles (some throw, some return early)

#### Database Layer Violations
- 39 direct `db()` calls bypass model layer
- No transaction support for multi-step operations
- Raw SQL fragments (`whereRaw`, `whereNotNull`) in route file
- JSON field parsing logic duplicated across endpoints

#### External Integration Fragility
- Hardcoded webhook URLs (n8n, monthly agents)
- No retry logic for failed axios calls (only in retry endpoint)
- Async fire-and-forget axios calls (no error propagation)
- No timeout configuration for external calls

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── pms.ts                                  # Route definitions only (~80 LOC)
├── controllers/
│   └── pms/
│       ├── pms.controller.ts                   # Main controller (~350 LOC)
│       ├── services/
│       │   ├── pms-upload.service.ts           # File upload & manual entry (~180 LOC)
│       │   ├── pms-approval.service.ts         # Admin & client approval workflows (~140 LOC)
│       │   ├── pms-automation.service.ts       # Automation state machine orchestration (~120 LOC)
│       │   ├── pms-data.service.ts             # Data retrieval & aggregation (~100 LOC)
│       │   └── pms-retry.service.ts            # Retry logic for failed steps (~90 LOC)
│       └── utils/
│           ├── file-converter.util.ts          # XLSX/CSV conversion (~50 LOC)
│           ├── pms-validator.util.ts           # Input validation & type coercion (~80 LOC)
│           ├── pms-normalizer.util.ts          # Data normalization helpers (~60 LOC)
│           └── pms-constants.ts                # Constants (PAGE_SIZE, APP_URL, etc.) (~20 LOC)
├── models/
│   ├── PmsJobModel.ts                          # Already exists (enhanced with new methods)
│   └── GoogleAccountModel.ts                   # Already exists (no changes)
├── utils/
│   ├── pmsAggregator.ts                        # Already exists (keep as-is)
│   ├── pmsAutomationStatus.ts                  # Already exists (keep as-is)
│   └── notificationHelper.ts                   # Already exists (keep as-is)
```

### Layer Responsibilities

#### Route Layer (`routes/pms.ts`)
- Route definitions only
- Multer middleware registration
- Maps HTTP endpoints to controller methods
- No business logic
- No error handling (delegated to controller)

#### Controller Layer (`controllers/pms/pms.controller.ts`)
- Request/response orchestration
- Parameter extraction and validation
- Service method invocation
- Error handling and response formatting
- HTTP status code decisions
- Logging coordination

#### Service Layer (`controllers/pms/services/*.service.ts`)
**5 Feature Services:**

1. **pms-upload.service.ts**
   - File upload processing (manual vs file paths)
   - File conversion orchestration
   - PMS job creation
   - Automation initialization
   - External webhook triggering (n8n)

2. **pms-approval.service.ts**
   - Admin approval workflow
   - Client approval workflow
   - Automation step advancement
   - Notification creation
   - Monthly agent triggering

3. **pms-automation.service.ts**
   - Automation status retrieval
   - Active automation listing
   - Auto-advancement logic
   - State machine transitions
   - Admin email notifications

4. **pms-data.service.ts**
   - Key data aggregation
   - Job listing with pagination
   - Response log parsing
   - Data transformation

5. **pms-retry.service.ts**
   - Parser retry logic
   - Monthly agents retry logic
   - Automation reset orchestration
   - Retry validation

#### Utility Layer (`controllers/pms/utils/*.util.ts`)
**4 Utility Modules:**

1. **file-converter.util.ts**
   - XLSX → CSV conversion
   - CSV → JSON conversion
   - File type detection
   - Buffer handling

2. **pms-validator.util.ts**
   - Request validation
   - Type coercion (`coerceBoolean`, `toNumber`)
   - Parameter validation
   - Input sanitization

3. **pms-normalizer.util.ts**
   - Response log parsing (`parseResponseLog`)
   - Month entry extraction (`extractMonthEntriesFromResponse`)
   - Boolean normalization
   - Array coercion (`ensureArray`)

4. **pms-constants.ts**
   - PAGE_SIZE constant
   - APP_URL logic
   - Allowed file types/extensions
   - Multer configuration constants

#### Model Layer (Enhanced)
**PmsJobModel.ts** (add new methods):
- `createWithRawData(data, rawInputData)` - Insert job with raw_input_data
- `updateResponseLog(id, responseLog)` - Update response_log field
- `updateApprovals(id, { isApproved, isClientApproved, status })` - Batch approval update
- `findWithAutomationStatus(filters)` - Find jobs with JSONB automation filtering
- `updateJobStatus(id, status)` - Update job status field

**GoogleAccountModel.ts** (no changes needed)
- Already has `findByDomain()` method

---

## 3. Code Mapping

### Endpoint → Controller Method Mapping

| Endpoint | Current Lines | Controller Method | Service Call |
|----------|--------------|-------------------|--------------|
| POST /pms/upload | 175-453 | `PmsController.uploadPmsData()` | `PmsUploadService.processUpload()` |
| POST /pms/summary | 459-492 | `PmsController.getSummary()` | (Placeholder, no service) |
| GET /pms/keyData | 498-632 | `PmsController.getKeyData()` | `PmsDataService.aggregateKeyData()` |
| GET /pms/jobs | 638-750 | `PmsController.listJobs()` | `PmsDataService.listJobsPaginated()` |
| PATCH /pms/jobs/:id/approval | 756-896 | `PmsController.updateAdminApproval()` | `PmsApprovalService.approveByAdmin()` |
| PATCH /pms/jobs/:id/client-approval | 902-1053 | `PmsController.updateClientApproval()` | `PmsApprovalService.approveByClient()` |
| PATCH /pms/jobs/:id/response | 1059-1167 | `PmsController.updateResponseLog()` | `PmsDataService.updateJobResponse()` |
| DELETE /pms/jobs/:id | 1173-1210 | `PmsController.deleteJob()` | `PmsDataService.deleteJobById()` |
| GET /pms/jobs/:id/automation-status | 1216-1324 | `PmsController.getAutomationStatus()` | `PmsAutomationService.getJobAutomationStatus()` |
| GET /pms/automation/active | 1330-1394 | `PmsController.getActiveAutomations()` | `PmsAutomationService.getActiveJobs()` |
| POST /pms/jobs/:id/retry | 1400-1650 | `PmsController.retryStep()` | `PmsRetryService.retryFailedStep()` |

### Database Calls → Model Method Mapping

#### PmsJobModel Replacements (39 total db() calls)

| Current DB Call | Lines | Model Method Replacement |
|----------------|-------|-------------------------|
| `db("pms_jobs").insert({...}).returning("id")` | 218-230, 345-352 | `PmsJobModel.create({ domain, status, response_log, ... })` |
| `db("pms_jobs").where({id}).update({raw_input_data})` | 403-405 | `PmsJobModel.updateById(id, { raw_input_data })` |
| `db("pms_jobs").select(...).where({domain})` | 510-520 | `PmsJobModel.listByDomain(domain, pagination)` |
| `db("pms_jobs").select(...).where({domain}).first()` | 523-534 | `PmsJobModel.findLatestByDomain(domain)` |
| `db("pms_jobs").count()...whereIn/where` | 664-675 | `PmsJobModel.listAdmin(filters, pagination)` (count included) |
| `db("pms_jobs").where({id}).select(...).first()` | 776-786 | `PmsJobModel.findById(id)` |
| `db("pms_jobs").where({id}).update({is_approved, status})` | 835 | `PmsJobModel.updateApprovals(id, { isApproved, status })` |
| `db("pms_jobs").where({id}).update({is_client_approved})` | 942-944 | `PmsJobModel.updateClientApproval(id, isClientApproved)` |
| `db("pms_jobs").where({id}).update({response_log})` | 1123-1125 | `PmsJobModel.updateResponseLog(id, responseLog)` |
| `db("pms_jobs").where({id}).delete()` | 1196 | `PmsJobModel.deleteById(id)` |
| `db("pms_jobs").whereNotNull("automation_status_detail").whereRaw(...)` | 1334-1348 | `PmsJobModel.findActiveAutomation(domain)` (existing method) + new filter variant |
| `db("pms_jobs").where({id}).update({status, response_log, is_approved, is_client_approved})` | 1483-1488 | `PmsJobModel.updateById(id, { status, response_log, ... })` |

#### GoogleAccountModel Calls (5 total)

| Current DB Call | Lines | Model Method Replacement |
|----------------|-------|-------------------------|
| `db("google_accounts").where({domain_name}).first()` | 276-278, 980-982, 1567-1569 | `GoogleAccountModel.findByDomain(domain)` |

**Note:** GoogleAccountModel already has `findByDomain()` method, no changes needed.

### Logic Extraction → Service Methods

#### PmsUploadService (Lines 175-453)

| Logic | Lines | Service Method |
|-------|-------|---------------|
| Manual entry path (skip parsing, auto-approve) | 190-330 | `processManualEntry(domain, manualData, jobId)` |
| File upload path (convert, parse, webhook) | 335-445 | `processFileUpload(file, domain, jobId)` |
| File conversion (XLSX/CSV → JSON) | 370-394 | `FileConverterUtil.convertToJson(file)` (utility) |

#### PmsApprovalService (Lines 756-1053)

| Logic | Lines | Service Method |
|-------|-------|---------------|
| Admin approval logic | 776-856 | `approveByAdmin(jobId, isApproved)` |
| Client approval + monthly agent trigger | 922-1019 | `approveByClient(jobId, isClientApproved)` |
| Monthly agent triggering | 986-1008 | `triggerMonthlyAgents(account, domain, jobId)` |

#### PmsAutomationService (Lines 1216-1394)

| Logic | Lines | Service Method |
|-------|-------|---------------|
| Automation status with auto-advancement | 1228-1299 | `getJobAutomationStatus(jobId)` |
| Auto-advance parser → admin approval | 1260-1287 | `autoAdvanceIfParserComplete(job)` |
| Active automation listing | 1334-1375 | `getActiveJobs(domain?)` |

#### PmsDataService (Lines 498-750, 1059-1210)

| Logic | Lines | Service Method |
|-------|-------|---------------|
| Key data aggregation | 509-624 | `aggregateKeyData(domain)` |
| Job listing with pagination | 640-742 | `listJobsPaginated(filters, page)` |
| Response log update | 1070-1156 | `updateJobResponse(jobId, responseLog)` |
| Job deletion | 1184-1202 | `deleteJobById(jobId)` |

#### PmsRetryService (Lines 1400-1650)

| Logic | Lines | Service Method |
|-------|-------|---------------|
| PMS parser retry | 1455-1543 | `retryPmsParser(jobId)` |
| Monthly agents retry | 1547-1634 | `retryMonthlyAgents(jobId)` |
| Validation & orchestration | 1411-1453 | `retryFailedStep(jobId, stepToRetry)` |

### Utility Extractions

#### FileConverterUtil (Lines 370-394)

| Logic | Lines | Utility Method |
|-------|-------|---------------|
| XLSX/XLS → CSV conversion | 373-384 | `convertExcelToCsv(buffer: Buffer): string` |
| CSV/TXT → JSON conversion | 370-372, 392-394 | `convertCsvToJson(csvData: string): Promise<any[]>` |

#### PmsValidatorUtil (Lines 28-98)

| Logic | Lines | Utility Method |
|-------|-------|---------------|
| Boolean coercion | 28-46 | `coerceBoolean(value: unknown): boolean \| undefined` |
| Number parsing | 81-91 | `toNumber(value: unknown): number` |
| Array coercion | 93-98 | `ensureArray<T>(value: unknown): T[]` |

#### PmsNormalizerUtil (Lines 48-136)

| Logic | Lines | Utility Method |
|-------|-------|---------------|
| Response log parsing | 48-63 | `parseResponseLog(value: unknown): any` |
| Month entry extraction | 100-136 | `extractMonthEntriesFromResponse(responseLog: unknown): RawPmsMonthEntry[]` |

#### PmsConstants (Various)

| Constant | Lines | Constant Name |
|----------|-------|--------------|
| Page size | 26 | `PAGE_SIZE = 10` |
| App URL logic | 19-22 | `APP_URL` (computed) |
| Multer config | 141-165 | `MULTER_CONFIG` (object) |

---

## 4. Step-by-Step Migration

### Phase 1: Utilities (Foundation)

#### Step 1.1: Create PmsConstants
**File:** `src/controllers/pms/utils/pms-constants.ts`

**Extract:**
- Lines 19-22: `APP_URL` logic
- Line 26: `PAGE_SIZE = 10`
- Lines 147-157: Allowed file types/extensions
- Multer size limit (10MB)

**Exports:**
```typescript
export const PAGE_SIZE = 10;
export const APP_URL = process.env.NODE_ENV === "production"
  ? "https://app.getalloro.com"
  : "http://localhost:5174";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [...];
export const ALLOWED_EXTENSIONS = [...];
```

**Dependencies:** None
**Estimated LOC:** 20

---

#### Step 1.2: Create PmsValidatorUtil
**File:** `src/controllers/pms/utils/pms-validator.util.ts`

**Extract:**
- Lines 28-46: `coerceBoolean()` function
- Lines 81-91: `toNumber()` function
- Lines 93-98: `ensureArray()` function
- Add: `validateJobId(id: any)` - checks if valid positive integer
- Add: `validateDomain(domain: any)` - checks if non-empty string

**Exports:**
```typescript
export class PmsValidator {
  static coerceBoolean(value: unknown): boolean | undefined
  static toNumber(value: unknown): number
  static ensureArray<T>(value: unknown): T[]
  static validateJobId(id: any): { valid: boolean; error?: string }
  static validateDomain(domain: any): { valid: boolean; error?: string }
}
```

**Dependencies:** None
**Estimated LOC:** 80

---

#### Step 1.3: Create PmsNormalizerUtil
**File:** `src/controllers/pms/utils/pms-normalizer.util.ts`

**Extract:**
- Lines 48-63: `parseResponseLog()` function
- Lines 65-79: `RawPmsSource`, `RawPmsMonthEntry` types
- Lines 100-136: `extractMonthEntriesFromResponse()` function
- Lines 537-554: `normalizeApproval()` and `normalizeClientApproval()` (de-duplicate)

**Exports:**
```typescript
export type RawPmsSource = {...};
export type RawPmsMonthEntry = {...};

export class PmsNormalizer {
  static parseResponseLog(value: unknown): any
  static extractMonthEntriesFromResponse(responseLog: unknown): RawPmsMonthEntry[]
  static normalizeBoolean(value: any): boolean | null
}
```

**Dependencies:** None
**Estimated LOC:** 60

---

#### Step 1.4: Create FileConverterUtil
**File:** `src/controllers/pms/utils/file-converter.util.ts`

**Extract:**
- Lines 373-384: Excel conversion logic
- Lines 370-372, 392-394: CSV parsing logic

**Exports:**
```typescript
export class FileConverter {
  static async convertExcelToCsv(buffer: Buffer): Promise<string>
  static async convertCsvToJson(csvData: string): Promise<any[]>
  static async convertFileToJson(file: Express.Multer.File): Promise<any[]>
}
```

**Dependencies:**
- `xlsx` (Excel parsing)
- `csvtojson` (CSV parsing)

**Estimated LOC:** 50

---

### Phase 2: Model Enhancements

#### Step 2.1: Enhance PmsJobModel
**File:** `src/models/PmsJobModel.ts`

**Add Methods:**

1. **`createWithRawData(data, rawInputData)`**
   - Combines job creation + raw_input_data in single operation
   - Replaces lines 218-230, 345-352, 403-405

2. **`updateResponseLog(id, responseLog)`**
   - Dedicated method for response_log updates
   - Replaces lines 1123-1125

3. **`updateApprovals(id, updates)`**
   - Batch update for approval flags + status
   - Replaces lines 835, 942-944
   - Signature: `{ isApproved?, isClientApproved?, status? }`

4. **`findActiveAutomationJobs(domain?)`**
   - Returns all active automation jobs (not completed/failed)
   - Uses JSONB query: `automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')`
   - Replaces lines 1334-1354

5. **`updateJobStatus(id, status)`**
   - Simple status update
   - Replaces lines 1483-1488 (partial)

**Estimated LOC Added:** 60-80

---

### Phase 3: Services (Business Logic)

#### Step 3.1: Create PmsUploadService
**File:** `src/controllers/pms/services/pms-upload.service.ts`

**Methods:**

1. **`processUpload(req, domain, pmsType, entryType, manualData)`**
   - Main entry point, routes to manual vs file path
   - Lines 175-453

2. **`processManualEntry(domain, parsedManualData)`**
   - Manual entry path logic
   - Lines 190-330
   - Auto-creates job with approved status
   - Initializes automation, skips parser/approval steps
   - Triggers monthly agents

3. **`processFileUpload(file, domain)`**
   - File upload path logic
   - Lines 335-453
   - Converts file to JSON
   - Creates job, initializes automation
   - Sends to n8n webhook

4. **`triggerPmsParser(jsonData, jobId)`**
   - External webhook call to n8n
   - Lines 417-428

**Dependencies:**
- `PmsJobModel`
- `GoogleAccountModel`
- `FileConverter` (utility)
- `axios` (external calls)
- `initializeAutomationStatus()`, `updateAutomationStatus()`, `completeStep()` (from pmsAutomationStatus)

**Estimated LOC:** 180

---

#### Step 3.2: Create PmsApprovalService
**File:** `src/controllers/pms/services/pms-approval.service.ts`

**Methods:**

1. **`approveByAdmin(jobId, isApproved)`**
   - Admin approval workflow
   - Lines 776-856
   - Validates approval status cannot be reverted
   - Updates job status to "approved"
   - Advances automation: `pms_parser` → `admin_approval` → `client_approval`
   - Creates notification

2. **`approveByClient(jobId, isClientApproved)`**
   - Client approval workflow
   - Lines 922-1019
   - Updates `is_client_approved` flag
   - Advances automation: `client_approval` → `monthly_agents`
   - Triggers monthly agents

3. **`triggerMonthlyAgents(googleAccountId, domain, jobId)`**
   - Internal API call to `/api/agents/monthly-agents-run`
   - Lines 986-1008, 275-308 (similar logic)
   - Async fire-and-forget axios call

**Dependencies:**
- `PmsJobModel`
- `GoogleAccountModel`
- `axios` (internal API calls)
- `createNotification()` (from notificationHelper)
- `completeStep()`, `updateAutomationStatus()`, `setAwaitingApproval()` (from pmsAutomationStatus)

**Estimated LOC:** 140

---

#### Step 3.3: Create PmsAutomationService
**File:** `src/controllers/pms/services/pms-automation.service.ts`

**Methods:**

1. **`getJobAutomationStatus(jobId)`**
   - Retrieves automation status with auto-advancement
   - Lines 1228-1299
   - Auto-advances parser → admin approval if job status = "completed"
   - Sends admin email notification

2. **`autoAdvanceIfParserComplete(job)`**
   - Auto-advancement logic
   - Lines 1260-1287
   - Checks if parser finished but status not updated
   - Calls `completeStep()`, `setAwaitingApproval()`

3. **`getActiveJobs(domain?)`**
   - Lists all active automation jobs
   - Lines 1334-1375
   - Filters by domain (optional)
   - Returns formatted job list

**Dependencies:**
- `PmsJobModel`
- `notifyAdmins()` (from notificationHelper)
- `completeStep()`, `setAwaitingApproval()` (from pmsAutomationStatus)

**Estimated LOC:** 120

---

#### Step 3.4: Create PmsDataService
**File:** `src/controllers/pms/services/pms-data.service.ts`

**Methods:**

1. **`aggregateKeyData(domain)`**
   - Key data aggregation
   - Lines 509-624
   - Fetches jobs, uses `aggregatePmsData()` utility
   - Normalizes approval flags
   - Returns months, sources, totals, stats

2. **`listJobsPaginated(filters, page)`**
   - Paginated job listing
   - Lines 640-742
   - Handles status, isApproved, domain filters
   - Parses automation_status_detail
   - Returns pagination metadata

3. **`updateJobResponse(jobId, responseLog)`**
   - Updates response_log field
   - Lines 1070-1156
   - Validates JSON serialization

4. **`deleteJobById(jobId)`**
   - Hard deletes job
   - Lines 1184-1202

**Dependencies:**
- `PmsJobModel`
- `aggregatePmsData()` (from pmsAggregator)
- `PmsNormalizer` (utility)
- `PAGE_SIZE` (from pms-constants)

**Estimated LOC:** 100

---

#### Step 3.5: Create PmsRetryService
**File:** `src/controllers/pms/services/pms-retry.service.ts`

**Methods:**

1. **`retryFailedStep(jobId, stepToRetry)`**
   - Main entry point, validates step
   - Lines 1411-1453
   - Routes to parser or monthly agents retry

2. **`retryPmsParser(job)`**
   - Parser retry logic
   - Lines 1455-1543
   - Validates raw_input_data exists
   - Resets automation, clears approvals
   - Resends to n8n webhook

3. **`retryMonthlyAgents(job)`**
   - Monthly agents retry logic
   - Lines 1547-1634
   - Validates domain, google account, parsed data
   - Resets automation
   - Triggers `/api/agents/monthly-agents-run`

**Dependencies:**
- `PmsJobModel`
- `GoogleAccountModel`
- `axios` (external/internal API calls)
- `resetToStep()`, `updateAutomationStatus()` (from pmsAutomationStatus)

**Estimated LOC:** 90

---

### Phase 4: Controller (Orchestration)

#### Step 4.1: Create PmsController
**File:** `src/controllers/pms/pms.controller.ts`

**Methods (11 total):**

1. **`uploadPmsData(req, res)`**
   - Calls `PmsUploadService.processUpload()`
   - Lines 175-453 orchestration

2. **`getSummary(req, res)`**
   - Placeholder (lines 459-492)

3. **`getKeyData(req, res)`**
   - Calls `PmsDataService.aggregateKeyData()`
   - Lines 498-632 orchestration

4. **`listJobs(req, res)`**
   - Calls `PmsDataService.listJobsPaginated()`
   - Lines 638-750 orchestration

5. **`updateAdminApproval(req, res)`**
   - Calls `PmsApprovalService.approveByAdmin()`
   - Lines 756-896 orchestration

6. **`updateClientApproval(req, res)`**
   - Calls `PmsApprovalService.approveByClient()`
   - Lines 902-1053 orchestration

7. **`updateResponseLog(req, res)`**
   - Calls `PmsDataService.updateJobResponse()`
   - Lines 1059-1167 orchestration

8. **`deleteJob(req, res)`**
   - Calls `PmsDataService.deleteJobById()`
   - Lines 1173-1210 orchestration

9. **`getAutomationStatus(req, res)`**
   - Calls `PmsAutomationService.getJobAutomationStatus()`
   - Lines 1216-1324 orchestration

10. **`getActiveAutomations(req, res)`**
    - Calls `PmsAutomationService.getActiveJobs()`
    - Lines 1330-1394 orchestration

11. **`retryStep(req, res)`**
    - Calls `PmsRetryService.retryFailedStep()`
    - Lines 1400-1650 orchestration

**Responsibilities:**
- Extract parameters from `req.params`, `req.query`, `req.body`, `req.file`
- Validate inputs using `PmsValidator`
- Call service methods
- Format responses
- Handle errors with proper status codes
- Logging

**Dependencies:**
- All 5 services
- `PmsValidator` (utility)
- `express` (Request, Response)

**Estimated LOC:** 350

---

### Phase 5: Route Refactor

#### Step 5.1: Refactor Route File
**File:** `src/routes/pms.ts`

**New Content:**
- Import `PmsController`
- Import multer and configure (move config to utils/pms-constants.ts)
- Define 11 routes mapping to controller methods
- Export router

**Example:**
```typescript
import express from "express";
import multer from "multer";
import { PmsController } from "../controllers/pms/pms.controller";
import { MULTER_CONFIG } from "../controllers/pms/utils/pms-constants";

const pmsRoutes = express.Router();
const upload = multer(MULTER_CONFIG);

pmsRoutes.post("/upload", upload.single("csvFile"), PmsController.uploadPmsData);
pmsRoutes.post("/summary", PmsController.getSummary);
pmsRoutes.get("/keyData", PmsController.getKeyData);
pmsRoutes.get("/jobs", PmsController.listJobs);
pmsRoutes.patch("/jobs/:id/approval", PmsController.updateAdminApproval);
pmsRoutes.patch("/jobs/:id/client-approval", PmsController.updateClientApproval);
pmsRoutes.patch("/jobs/:id/response", PmsController.updateResponseLog);
pmsRoutes.delete("/jobs/:id", PmsController.deleteJob);
pmsRoutes.get("/jobs/:id/automation-status", PmsController.getAutomationStatus);
pmsRoutes.get("/automation/active", PmsController.getActiveAutomations);
pmsRoutes.post("/jobs/:id/retry", PmsController.retryStep);

export default pmsRoutes;
```

**Remove:**
- All handler logic (lines 175-1650)
- All type definitions (lines 24-136)
- Direct `db` import
- `axios` import (move to services)
- `XLSX`, `csv`, utility imports (move to services)

**Expected LOC After Refactor:** ~80 lines

---

### Phase 6: Testing & Validation

#### Step 6.1: Manual Testing Checklist
- [ ] POST /pms/upload with CSV file
- [ ] POST /pms/upload with XLSX file
- [ ] POST /pms/upload with manual data (JSON)
- [ ] POST /pms/upload with invalid file type (should fail)
- [ ] GET /pms/keyData with domain parameter
- [ ] GET /pms/keyData without domain (defaults to artfulorthodontics.com)
- [ ] GET /pms/jobs with pagination
- [ ] GET /pms/jobs with status filter
- [ ] GET /pms/jobs with domain filter
- [ ] PATCH /pms/jobs/:id/approval (approve)
- [ ] PATCH /pms/jobs/:id/approval (attempt to revert - should fail)
- [ ] PATCH /pms/jobs/:id/client-approval (approve)
- [ ] PATCH /pms/jobs/:id/response (update response_log)
- [ ] DELETE /pms/jobs/:id
- [ ] GET /pms/jobs/:id/automation-status (verify auto-advancement)
- [ ] GET /pms/automation/active (with and without domain filter)
- [ ] POST /pms/jobs/:id/retry (pms_parser)
- [ ] POST /pms/jobs/:id/retry (monthly_agents)
- [ ] POST /pms/jobs/:id/retry (invalid step - should fail)

#### Step 6.2: Integration Testing
- [ ] Verify n8n webhook receives data correctly
- [ ] Verify monthly agents API receives triggers
- [ ] Verify admin email notifications sent
- [ ] Verify client notifications created
- [ ] Verify automation status updates throughout workflow

#### Step 6.3: Edge Case Testing
- [ ] Large file upload (near 10MB limit)
- [ ] Malformed CSV/Excel files
- [ ] Invalid JSON in response_log
- [ ] Missing raw_input_data during parser retry
- [ ] Missing domain during monthly agent retry
- [ ] Concurrent approval requests
- [ ] Null/undefined values in manual entry

---

## 5. Model Replacements (Detailed)

### PmsJobModel Method Enhancements

#### Enhancement 1: createWithRawData()
**Purpose:** Combine job creation + raw_input_data in single call

**Current Pattern (Lines 345-405):**
```typescript
const [result] = await db("pms_jobs")
  .insert({
    time_elapsed: 0,
    status: "pending",
    response_log: null,
    domain: domain,
  })
  .returning("id");

const jobId = result?.id;

// Later...
await db("pms_jobs")
  .where({ id: jobId })
  .update({ raw_input_data: JSON.stringify(jsonData) });
```

**Replacement:**
```typescript
const job = await PmsJobModel.createWithRawData(
  {
    domain,
    status: "pending",
    time_elapsed: 0,
  },
  jsonData
);
const jobId = job.id;
```

**Model Implementation:**
```typescript
static async createWithRawData(
  data: Partial<IPmsJob>,
  rawInputData: any,
  trx?: QueryContext
): Promise<IPmsJob> {
  const job = await super.create(
    {
      ...data,
      raw_input_data: rawInputData,
    },
    trx
  );
  return job;
}
```

**Benefits:**
- Eliminates second query
- Atomic operation
- Cleaner service code

---

#### Enhancement 2: updateResponseLog()
**Purpose:** Dedicated method for response_log updates

**Current Pattern (Lines 1123-1125):**
```typescript
await db("pms_jobs")
  .where({ id: jobId })
  .update({ response_log: responseValue });
```

**Replacement:**
```typescript
await PmsJobModel.updateResponseLog(jobId, normalizedResponse);
```

**Model Implementation:**
```typescript
static async updateResponseLog(
  id: number,
  responseLog: any,
  trx?: QueryContext
): Promise<number> {
  return super.updateById(id, { response_log: responseLog }, trx);
}
```

**Benefits:**
- Clear intent
- Type safety
- Reusable

---

#### Enhancement 3: updateApprovals()
**Purpose:** Batch update approval flags + status

**Current Pattern (Lines 835, 942-944):**
```typescript
const updatePayload: Record<string, any> = {
  is_approved: nextApprovalValue,
};
if (nextApprovalValue === 1 && !alreadyHasApprovedStatus) {
  updatePayload.status = "approved";
}
await db("pms_jobs").where({ id: jobId }).update(updatePayload);

// Or:
await db("pms_jobs")
  .where({ id: jobId })
  .update({ is_client_approved: clientApproval ? 1 : 0 });
```

**Replacement:**
```typescript
await PmsJobModel.updateApprovals(jobId, {
  isApproved: true,
  status: "approved"
});

// Or:
await PmsJobModel.updateApprovals(jobId, {
  isClientApproved: true
});
```

**Model Implementation:**
```typescript
static async updateApprovals(
  id: number,
  updates: {
    isApproved?: boolean;
    isClientApproved?: boolean;
    status?: string;
  },
  trx?: QueryContext
): Promise<number> {
  const payload: Record<string, any> = {};

  if (updates.isApproved !== undefined) {
    payload.is_approved = updates.isApproved;
  }
  if (updates.isClientApproved !== undefined) {
    payload.is_client_approved = updates.isClientApproved;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  return super.updateById(id, payload, trx);
}
```

**Benefits:**
- Single query for multiple fields
- Type-safe interface
- Business logic encapsulated

---

#### Enhancement 4: findActiveAutomationJobs()
**Purpose:** Find all active automation jobs (not completed/failed)

**Current Pattern (Lines 1334-1354):**
```typescript
let query = db("pms_jobs")
  .whereNotNull("automation_status_detail")
  .whereRaw(
    "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
  )
  .select(
    "id",
    "domain",
    "status",
    "is_approved",
    "is_client_approved",
    "automation_status_detail",
    "timestamp"
  )
  .orderBy("timestamp", "desc");

if (domain && typeof domain === "string") {
  query = query.where("domain", domain);
}

const jobs = await query;
```

**Replacement:**
```typescript
const jobs = await PmsJobModel.findActiveAutomationJobs(domain);
```

**Model Implementation:**
```typescript
static async findActiveAutomationJobs(
  domain?: string,
  trx?: QueryContext
): Promise<IPmsJob[]> {
  let query = this.table(trx)
    .whereNotNull("automation_status_detail")
    .whereRaw(
      "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
    )
    .orderBy("created_at", "desc");

  if (domain) {
    query = query.where("domain", domain);
  }

  const rows = await query;
  return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
}
```

**Benefits:**
- Encapsulates JSONB query logic
- Reusable across services
- Clean service code

---

#### Enhancement 5: updateJobStatus()
**Purpose:** Simple status update

**Current Pattern (Lines 1483-1488):**
```typescript
await db("pms_jobs").where({ id: jobId }).update({
  status: "pending",
  response_log: null,
  is_approved: 0,
  is_client_approved: 0,
});
```

**Replacement:**
```typescript
await PmsJobModel.updateJobStatus(jobId, "pending");
// For multiple fields, use updateById() directly
await PmsJobModel.updateById(jobId, {
  status: "pending",
  response_log: null,
  is_approved: false,
  is_client_approved: false,
});
```

**Model Implementation:**
```typescript
static async updateJobStatus(
  id: number,
  status: string,
  trx?: QueryContext
): Promise<number> {
  return super.updateById(id, { status }, trx);
}
```

**Benefits:**
- Single-purpose method
- Clear intent

---

### GoogleAccountModel (No Changes)

**Existing Method Usage:**
```typescript
// Already works perfectly:
const account = await GoogleAccountModel.findByDomain(domain);
```

**Current Calls:**
- Lines 276-278: Manual entry monthly agent trigger
- Lines 980-982: Client approval monthly agent trigger
- Lines 1567-1569: Retry monthly agents

**No changes needed.** Model already provides required functionality.

---

## 6. Files to Create

### 6.1 Controller
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/pms.controller.ts`

**Responsibilities:**
- Request/response orchestration
- Parameter extraction and validation
- Service method invocation
- Error handling and response formatting
- HTTP status code decisions
- Logging coordination

**Exports:**
- `PmsController` class with 11 static methods

**Estimated LOC:** 350

---

### 6.2 Services (5 files)

#### 6.2.1 PmsUploadService
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/services/pms-upload.service.ts`

**Responsibilities:**
- File upload processing (manual vs file paths)
- File conversion orchestration
- PMS job creation
- Automation initialization
- External webhook triggering (n8n)

**Exports:**
- `PmsUploadService` class with 4 static methods:
  - `processUpload()`
  - `processManualEntry()`
  - `processFileUpload()`
  - `triggerPmsParser()`

**Estimated LOC:** 180

---

#### 6.2.2 PmsApprovalService
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/services/pms-approval.service.ts`

**Responsibilities:**
- Admin approval workflow
- Client approval workflow
- Automation step advancement
- Notification creation
- Monthly agent triggering

**Exports:**
- `PmsApprovalService` class with 3 static methods:
  - `approveByAdmin()`
  - `approveByClient()`
  - `triggerMonthlyAgents()`

**Estimated LOC:** 140

---

#### 6.2.3 PmsAutomationService
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/services/pms-automation.service.ts`

**Responsibilities:**
- Automation status retrieval
- Active automation listing
- Auto-advancement logic
- State machine transitions
- Admin email notifications

**Exports:**
- `PmsAutomationService` class with 3 static methods:
  - `getJobAutomationStatus()`
  - `autoAdvanceIfParserComplete()`
  - `getActiveJobs()`

**Estimated LOC:** 120

---

#### 6.2.4 PmsDataService
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/services/pms-data.service.ts`

**Responsibilities:**
- Key data aggregation
- Job listing with pagination
- Response log parsing
- Data transformation
- Job deletion

**Exports:**
- `PmsDataService` class with 4 static methods:
  - `aggregateKeyData()`
  - `listJobsPaginated()`
  - `updateJobResponse()`
  - `deleteJobById()`

**Estimated LOC:** 100

---

#### 6.2.5 PmsRetryService
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/services/pms-retry.service.ts`

**Responsibilities:**
- Parser retry logic
- Monthly agents retry logic
- Automation reset orchestration
- Retry validation

**Exports:**
- `PmsRetryService` class with 3 static methods:
  - `retryFailedStep()`
  - `retryPmsParser()`
  - `retryMonthlyAgents()`

**Estimated LOC:** 90

---

### 6.3 Utils (4 files)

#### 6.3.1 PmsConstants
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/utils/pms-constants.ts`

**Exports:** Constants only

**Estimated LOC:** 20

---

#### 6.3.2 PmsValidator
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/utils/pms-validator.util.ts`

**Exports:** `PmsValidator` class with 5 static methods

**Estimated LOC:** 80

---

#### 6.3.3 PmsNormalizer
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/utils/pms-normalizer.util.ts`

**Exports:** `PmsNormalizer` class with 3 static methods + 2 types

**Estimated LOC:** 60

---

#### 6.3.4 FileConverter
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/pms/utils/file-converter.util.ts`

**Exports:** `FileConverter` class with 3 static methods

**Estimated LOC:** 50

---

## 7. Files to Modify

### 7.1 Route File
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/pms.ts`

**Changes:**
- Remove all handler logic (lines 175-1650)
- Remove type definitions (lines 24-136)
- Remove helper functions (lines 28-136)
- Remove direct database, axios, xlsx, csv imports
- Add controller import
- Refactor multer config (move to constants)
- Replace route handlers with controller method references

**Before LOC:** 1,652
**After LOC:** ~80

**Diff Summary:**
- Removed: ~1,572 lines (all handlers, types, helpers)
- Added: ~10 lines (controller import + route mappings)

---

### 7.2 PmsJobModel
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/PmsJobModel.ts`

**Changes:**
- Add 5 new methods:
  - `createWithRawData()`
  - `updateResponseLog()`
  - `updateApprovals()`
  - `findActiveAutomationJobs()`
  - `updateJobStatus()`

**Before LOC:** 150
**After LOC:** ~220

**Diff Summary:**
- Added: ~70 lines (5 new methods)

---

## 8. Risk Assessment

### Low Risk Items ✅

#### 1. Utilities are Pure Functions
- File converter, validator, normalizer are all pure functions
- No side effects, easy to test
- Logic is straightforward (already works in current code)

#### 2. Model Methods are Thin Wrappers
- Most new model methods are simple wrappers around existing BaseModel methods
- No complex business logic in model layer
- Clear single responsibility

#### 3. No API Contract Changes
- Request/response formats stay identical
- No breaking changes for frontend
- All endpoints preserve existing behavior

#### 4. No Database Schema Changes
- No migrations required
- Existing data remains compatible
- JSONB queries unchanged

#### 5. External Integrations Preserved
- n8n webhook URL unchanged
- Monthly agents API call unchanged
- Notification system unchanged

---

### Medium Risk Items ⚠️

#### 1. Multer Middleware Configuration
**Risk:** Multer config extracted to constants, possible misconfiguration

**Mitigation:**
- Copy exact config from lines 141-165
- Test file upload limits (10MB)
- Test file type validation
- Verify error messages preserved

#### 2. Async Fire-and-Forget Axios Calls
**Risk:** Monthly agent triggers fail silently (lines 286-308, 986-1008)

**Current Behavior:**
- Axios calls are fire-and-forget (`.then()/.catch()` but no await)
- Errors logged but not propagated to response

**Mitigation:**
- Preserve exact async behavior in service
- Document intentional fire-and-forget pattern
- Keep error logging
- Consider adding retry queue in future (out of scope)

#### 3. Boolean Normalization Consistency
**Risk:** Coercion logic has edge cases (null, undefined, string "0", "1")

**Mitigation:**
- Extract exact logic from lines 28-46, 537-554
- Unit test coerceBoolean() with all edge cases
- Document expected behavior

#### 4. Response Log JSON Parsing
**Risk:** Malformed JSON handling (lines 48-63, 100-136)

**Current Behavior:**
- Tries JSON.parse(), falls back to raw string
- Handles nested structures (monthly_rollup, report_data)

**Mitigation:**
- Preserve exact parsing logic in normalizer
- Test with malformed JSON
- Test with deeply nested objects
- Verify backward compatibility

#### 5. Automation Auto-Advancement Logic
**Risk:** State machine transitions have race conditions (lines 1260-1287)

**Current Behavior:**
- Polling endpoint checks job status = "completed" + parser status = "processing"
- Auto-advances to admin approval
- Sends email notification

**Mitigation:**
- Preserve exact conditional logic
- Test concurrent polling requests
- Verify idempotency (multiple calls don't duplicate emails)
- Consider adding database lock in future (out of scope)

---

### High Risk Items 🔴

#### 1. Complex State Machine Orchestration
**Risk:** Automation status updates scattered across multiple endpoints

**Complexity:**
- 7-step workflow (file_upload → complete)
- Manual entry skips 3 steps
- Auto-advancement logic in polling endpoint
- Retry logic resets state machine

**Mitigation:**
- Centralize all automation updates in PmsAutomationService
- Document state machine transitions clearly
- Test all paths:
  - Manual entry (skipped steps)
  - File upload (full workflow)
  - Parser retry (reset + replay)
  - Monthly agents retry (reset + replay)
- Verify idempotency of all status updates

#### 2. Two Upload Paths with Different Workflows
**Risk:** Manual entry vs file upload have completely different logic

**Differences:**
- Manual entry: skip parser, skip approvals, auto-trigger agents
- File upload: full workflow with parser, admin, client approvals

**Mitigation:**
- Clearly separate logic in PmsUploadService:
  - `processManualEntry()`
  - `processFileUpload()`
- Document decision tree
- Test both paths independently
- Verify automation status initialized correctly for each path

#### 3. External Webhook Dependencies
**Risk:** n8n webhook failure breaks upload flow

**Current Behavior:**
- POST /pms/upload sends data to n8n (line 417-428)
- No timeout configured
- No retry logic (only manual retry endpoint)
- Job stays in "processing" state if webhook fails

**Mitigation:**
- Preserve exact axios call behavior
- Add timeout to axios call (5 seconds recommended)
- Document webhook failure recovery (manual retry)
- Consider dead letter queue in future (out of scope)
- Test webhook timeout scenario

#### 4. Multiple Database Queries in Single Endpoint
**Risk:** No transaction support, partial updates possible

**Example (Admin Approval, Lines 835-856):**
1. Update job (is_approved, status)
2. Complete automation step (pms_parser)
3. Advance to next step (admin_approval → client_approval)
4. Create notification

**Failure Scenario:**
- Step 1 succeeds, step 3 fails → job approved but automation stuck

**Mitigation:**
- Add transaction support to service methods (future enhancement)
- For now, preserve current behavior (no transactions)
- Document known limitation
- Consider adding transaction wrapper in Phase 2 (out of scope)
- Test error scenarios (DB connection loss mid-operation)

#### 5. Pagination Logic Complexity
**Risk:** Count query + data query must stay synchronized

**Current Pattern (Lines 664-691):**
- Build count query with filters
- Execute count
- Build data query with same filters
- Execute data query with LIMIT/OFFSET

**Failure Scenario:**
- Filters diverge between count and data queries → pagination metadata wrong

**Mitigation:**
- Use `PmsJobModel.listAdmin()` which already handles pagination atomically
- Ensure filters applied consistently
- Test pagination with various filter combinations
- Verify totalPages calculation matches data

---

### What Could Go Wrong

#### Scenario 1: Multer Middleware Not Applied
**Symptom:** File upload returns 400 "No file provided"

**Cause:** Multer middleware not registered on route

**Fix:**
```typescript
// Correct:
pmsRoutes.post("/upload", upload.single("csvFile"), PmsController.uploadPmsData);

// Wrong:
pmsRoutes.post("/upload", PmsController.uploadPmsData); // Missing multer
```

---

#### Scenario 2: Model Method Returns Wrong Type
**Symptom:** `job.id` is undefined, code crashes

**Cause:** Model method returns array instead of object (destructuring error)

**Example:**
```typescript
// Current code (lines 218-232):
const [result] = await db("pms_jobs").insert(...).returning("id");
const jobId = result?.id;

// Wrong model usage:
const [job] = await PmsJobModel.create(...); // Model returns object, not array

// Correct model usage:
const job = await PmsJobModel.create(...);
const jobId = job.id;
```

**Fix:** Read model implementation carefully, adjust service code accordingly

---

#### Scenario 3: Automation Status Not Initialized
**Symptom:** Automation polling returns null, frontend stuck

**Cause:** Forgot to call `initializeAutomationStatus(jobId)` after job creation

**Fix:** Ensure every job creation calls initialization:
```typescript
const job = await PmsJobModel.create(...);
await initializeAutomationStatus(job.id);
```

---

#### Scenario 4: Monthly Agent Trigger Fails Silently
**Symptom:** Client approves PMS, but monthly agents never run

**Cause:** Async axios call fires but fails (wrong port, API down)

**Current Behavior:** Error logged but not returned to client

**Fix:**
- Check console logs for axios errors
- Verify internal API endpoint exists: `/api/agents/monthly-agents-run`
- Verify PORT env variable set correctly
- Use manual retry endpoint if needed

---

#### Scenario 5: Response Log JSON Parse Error
**Symptom:** GET /pms/keyData returns empty months array

**Cause:** Response log parsing fails, returns []

**Debug Steps:**
1. Check if `response_log` is null in database
2. Check if `monthly_rollup` or `report_data` exists in JSON
3. Verify JSON structure matches `RawPmsMonthEntry[]` type

**Fix:** Ensure `parseResponseLog()` and `extractMonthEntriesFromResponse()` handle all edge cases

---

#### Scenario 6: Boolean Coercion Regression
**Symptom:** `is_approved` shows as false when it's actually 1 in database

**Cause:** Boolean normalization logic changed

**Current Logic (Lines 537-554):**
```typescript
if (value === 1 || value === true || value === "1") return true;
if (value === 0 || value === false || value === "0") return false;
return null;
```

**Fix:** Use exact same logic in `PmsNormalizer.normalizeBoolean()`

---

#### Scenario 7: Pagination Metadata Wrong
**Symptom:** Frontend says "Page 1 of 5" but only 2 pages exist

**Cause:** Count query and data query use different filters

**Fix:** Ensure filters applied consistently:
```typescript
// Build filters once:
const filters = { status, isApproved, domain };

// Use same filters for count and data:
const { data, pagination } = await PmsJobModel.listAdmin(filters, { page, limit });
```

---

#### Scenario 8: File Conversion Fails for Large Excel Files
**Symptom:** 413 error or timeout for large files

**Cause:** XLSX library memory usage or timeout

**Current Limit:** 10MB

**Fix:**
- Verify file size check in multer (lines 143-145)
- Test with 9MB file (should work)
- Test with 11MB file (should fail with clear error)
- Consider streaming parser in future (out of scope)

---

#### Scenario 9: Auto-Advancement Race Condition
**Symptom:** Admin email sent multiple times for same job

**Cause:** Multiple concurrent polling requests trigger auto-advancement

**Current Behavior:** No locking mechanism

**Fix (Temporary):**
- Check if admin email already sent before sending (add flag)
- Use database-level locking in future (out of scope)

**Workaround:**
```typescript
// Check if already advanced:
if (job.status === "completed" && automationStatus?.steps?.pms_parser?.status === "processing" && !job.is_approved) {
  // Only advance if not already approved
}
```

---

## 9. Testing Strategy

### Unit Testing Opportunities (Future)

#### Utilities (Easy to Test - Pure Functions)
- [ ] `PmsValidator.coerceBoolean()` - test all edge cases
- [ ] `PmsValidator.toNumber()` - test currency strings, NaN handling
- [ ] `PmsValidator.ensureArray()` - test null, undefined, arrays
- [ ] `PmsNormalizer.parseResponseLog()` - test JSON strings, objects, malformed
- [ ] `PmsNormalizer.extractMonthEntriesFromResponse()` - test nested structures
- [ ] `PmsNormalizer.normalizeBoolean()` - test 0/1, true/false, strings
- [ ] `FileConverter.convertExcelToCsv()` - test XLSX/XLS files
- [ ] `FileConverter.convertCsvToJson()` - test various CSV formats

#### Services (Medium Complexity - Mock Dependencies)
- [ ] `PmsUploadService.processManualEntry()` - mock PmsJobModel, test workflow
- [ ] `PmsUploadService.processFileUpload()` - mock FileConverter, axios
- [ ] `PmsApprovalService.approveByAdmin()` - mock PmsJobModel, test state transitions
- [ ] `PmsApprovalService.approveByClient()` - mock axios, test async triggers
- [ ] `PmsDataService.listJobsPaginated()` - mock PmsJobModel, test pagination
- [ ] `PmsRetryService.retryPmsParser()` - mock axios, test reset logic
- [ ] `PmsRetryService.retryMonthlyAgents()` - mock axios, test reset logic

#### Controller (Integration-Style - Mock Services)
- [ ] `PmsController.uploadPmsData()` - mock PmsUploadService, test error handling
- [ ] `PmsController.updateAdminApproval()` - mock PmsApprovalService, test validation
- [ ] `PmsController.listJobs()` - mock PmsDataService, test response formatting

---

### Manual Testing Checklist

#### File Upload Flows
- [ ] **CSV Upload** - Valid CSV file, verify job created, automation initialized
- [ ] **XLSX Upload** - Valid Excel file, verify conversion to CSV, parser triggered
- [ ] **XLS Upload** - Legacy Excel file, verify conversion works
- [ ] **TXT Upload** - Plain text CSV, verify accepted
- [ ] **Invalid File Type** - Upload .pdf, verify 400 error with clear message
- [ ] **Large File** - Upload 9MB file, verify success
- [ ] **Oversized File** - Upload 11MB file, verify 413 error
- [ ] **Manual Entry** - JSON body with entryType=manual, verify skipped steps
- [ ] **Manual Entry Invalid JSON** - Malformed JSON, verify 400 error
- [ ] **Manual Entry Empty Array** - Empty months array, verify 400 error

#### Data Retrieval
- [ ] **GET /pms/keyData** - With domain, verify aggregated data
- [ ] **GET /pms/keyData** - Without domain, verify defaults to artfulorthodontics.com
- [ ] **GET /pms/keyData** - Domain with no jobs, verify empty arrays
- [ ] **GET /pms/jobs** - No filters, verify pagination
- [ ] **GET /pms/jobs** - Status filter (pending), verify filtered results
- [ ] **GET /pms/jobs** - Multiple status filter (pending,completed), verify filtered
- [ ] **GET /pms/jobs** - isApproved filter (true), verify filtered
- [ ] **GET /pms/jobs** - Domain filter, verify filtered
- [ ] **GET /pms/jobs** - Page 2, verify offset works
- [ ] **GET /pms/jobs** - Last page, verify hasNextPage = false

#### Approval Workflows
- [ ] **Admin Approve** - Approve job, verify status = "approved", automation advanced
- [ ] **Admin Approve Again** - Approve already approved job, verify idempotent
- [ ] **Admin Reject** - Try to revert approval, verify 400 error
- [ ] **Admin Approve Invalid Job** - Non-existent jobId, verify 404 error
- [ ] **Client Approve** - Approve job, verify monthly agents triggered
- [ ] **Client Approve Invalid Job** - Non-existent jobId, verify 404 error
- [ ] **Client Approve Without Admin** - Client approves before admin, verify works

#### Data Management
- [ ] **Update Response Log** - Valid JSON, verify updated
- [ ] **Update Response Log Null** - Null value, verify set to null
- [ ] **Update Response Log Invalid** - Malformed JSON, verify 400 error
- [ ] **Update Response Log Invalid Job** - Non-existent jobId, verify 404 error
- [ ] **Delete Job** - Valid jobId, verify deleted
- [ ] **Delete Job Invalid** - Non-existent jobId, verify 404 error
- [ ] **Delete Job Twice** - Delete same job twice, verify 404 on second call

#### Automation Monitoring
- [ ] **Get Automation Status** - Valid jobId, verify status returned
- [ ] **Get Automation Status Auto-Advance** - Job completed but parser processing, verify auto-advanced
- [ ] **Get Automation Status Invalid Job** - Non-existent jobId, verify 404 error
- [ ] **Get Active Automations** - No filter, verify all active jobs returned
- [ ] **Get Active Automations With Domain** - Domain filter, verify filtered
- [ ] **Get Active Automations Empty** - No active jobs, verify empty array

#### Retry Logic
- [ ] **Retry Parser** - Failed parser job, verify reset + webhook triggered
- [ ] **Retry Parser No Raw Data** - Job without raw_input_data, verify 400 error
- [ ] **Retry Parser Invalid Job** - Non-existent jobId, verify 404 error
- [ ] **Retry Monthly Agents** - Failed agents job, verify reset + trigger
- [ ] **Retry Monthly Agents No Response Log** - Job without response_log, verify 400 error
- [ ] **Retry Monthly Agents Invalid Step** - stepToRetry = "invalid", verify 400 error

#### External Integration Testing
- [ ] **n8n Webhook** - Upload file, verify webhook receives data
- [ ] **n8n Webhook Timeout** - Webhook takes >5s, verify timeout error
- [ ] **n8n Webhook Down** - Webhook returns 500, verify error logged
- [ ] **Monthly Agents API** - Client approves, verify internal API called
- [ ] **Monthly Agents API Down** - API returns 500, verify error logged
- [ ] **Admin Email Notification** - Parser completes, verify email sent

#### Edge Cases
- [ ] **Null Values** - Request with null parameters, verify validation
- [ ] **Undefined Values** - Request with undefined parameters, verify defaults
- [ ] **Empty Strings** - Request with empty string domain, verify validation
- [ ] **Special Characters** - Domain with special chars, verify sanitization
- [ ] **Concurrent Requests** - Multiple approve requests, verify race condition handling
- [ ] **Database Connection Loss** - Simulate DB down, verify 500 error + logging

---

## 10. Rollback Plan

### Immediate Rollback (If Critical Issues)

#### Option 1: Git Revert
```bash
git revert <commit-hash>
git push origin main
```

**Time:** < 5 minutes
**Risk:** None (pure rollback)

---

#### Option 2: Redeploy Previous Version
```bash
git checkout <previous-commit>
npm run build
npm run deploy
```

**Time:** < 10 minutes
**Risk:** Low

---

### Partial Rollback (If Specific Endpoint Fails)

**Scenario:** Upload endpoint works, but approval endpoint broken

**Strategy:**
1. Keep new utilities (low risk)
2. Revert specific controller method
3. Revert specific service

**Example:**
```typescript
// Temporarily restore old approval handler in route file:
pmsRoutes.patch("/jobs/:id/approval", async (req, res) => {
  // Old logic from lines 756-896
});

// Keep new upload logic:
pmsRoutes.post("/upload", upload.single("csvFile"), PmsController.uploadPmsData);
```

**Time:** 15-30 minutes
**Risk:** Medium (introduces temporary inconsistency)

---

### Incremental Rollout Strategy

#### Phase 1: Deploy to Staging
- Deploy refactored code to staging environment
- Run full test suite
- Monitor logs for errors
- Test all 17 endpoints manually
- Leave in staging for 24 hours

#### Phase 2: Canary Deployment (If Available)
- Deploy to 10% of production traffic
- Monitor error rates
- Compare response times (before/after)
- If error rate increases, rollback immediately

#### Phase 3: Full Production
- Deploy to 100% of traffic
- Monitor closely for 1 hour
- Check error logs, response times, external integrations
- Keep rollback plan ready

---

### Database Safety

**No Schema Changes = No Database Rollback Needed**

- All tables unchanged
- All columns unchanged
- All JSONB structures unchanged
- Data remains compatible with old and new code

**Rollback Impact:**
- Zero data loss
- Zero migration rollback
- Code-only rollback

---

### Monitoring During Rollout

#### Key Metrics to Watch

1. **Error Rate**
   - Baseline: Current 500 error rate
   - Alert: >10% increase

2. **Response Time**
   - Baseline: Current p99 response time
   - Alert: >50% increase

3. **External Integration Success Rate**
   - n8n webhook success rate
   - Monthly agents API success rate
   - Alert: <95% success

4. **Database Query Performance**
   - Monitor slow query log
   - Alert: New queries >1s

5. **Log Volume**
   - Check for excessive error logging
   - Alert: >100 errors/minute

---

## 11. Definition of Done

### Code Quality
- [ ] All 10 files created (1 controller, 5 services, 4 utils)
- [ ] Route file refactored to ~80 lines (route definitions only)
- [ ] All 39 direct `db()` calls replaced with model methods
- [ ] 5 new model methods added to PmsJobModel
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings
- [ ] Code follows existing project conventions
- [ ] All imports use correct paths

### Functionality
- [ ] All 17 endpoints return identical response formats
- [ ] All error codes and messages preserved
- [ ] All console logging preserved
- [ ] Manual testing checklist 100% passed
- [ ] File upload limits work (10MB)
- [ ] File type validation works
- [ ] Multer middleware registered correctly

### Business Logic
- [ ] Manual entry path skips correct steps (parser, approvals)
- [ ] File upload path follows full workflow
- [ ] Admin approval advances automation correctly
- [ ] Client approval triggers monthly agents
- [ ] Automation auto-advancement works (polling endpoint)
- [ ] Retry logic resets state machine correctly
- [ ] Notifications created at correct times

### External Integrations
- [ ] n8n webhook receives data correctly
- [ ] Monthly agents API receives triggers
- [ ] Admin email notifications sent
- [ ] Axios calls have timeouts configured
- [ ] Async fire-and-forget behavior preserved

### Documentation
- [ ] All services have JSDoc comments
- [ ] All controller methods documented
- [ ] State machine transitions documented
- [ ] Known limitations documented
- [ ] TODO comments for future improvements

### Testing
- [ ] Unit tests written for utilities (future)
- [ ] Integration tests planned (future)
- [ ] Manual testing checklist completed
- [ ] Edge cases tested
- [ ] Error scenarios tested

### Deployment
- [ ] Deployed to staging first
- [ ] Smoke tests passed in staging
- [ ] Logs monitored in staging (no errors)
- [ ] Performance baseline established
- [ ] Rollback plan documented and tested

---

## 12. Future Improvements (Out of Scope)

### Phase 2 Enhancements (After Refactor Stabilizes)

#### 1. Transaction Support
- Wrap multi-step operations (approval + automation update) in transactions
- Prevents partial updates on failure
- Estimated effort: 2-3 hours

#### 2. Request Schema Validation
- Add Zod or Joi schemas for all endpoints
- Validate request bodies before processing
- Generate TypeScript types from schemas
- Estimated effort: 4-6 hours

#### 3. Unit Test Suite
- Add Jest/Vitest tests for utilities (pure functions)
- Add tests for services (mock dependencies)
- Add tests for controller (mock services)
- Target: 80% code coverage
- Estimated effort: 8-12 hours

#### 4. Integration Test Suite
- Add end-to-end tests for full workflows
- Test manual entry → monthly agents
- Test file upload → parser → approvals → agents
- Test retry logic
- Estimated effort: 6-8 hours

#### 5. External Integration Improvements
- Add retry logic with exponential backoff for n8n webhook
- Add timeout configuration for all axios calls
- Add circuit breaker for monthly agents API
- Add dead letter queue for failed webhooks
- Estimated effort: 4-6 hours

#### 6. Observability
- Add structured logging (Winston, Pino)
- Add tracing (OpenTelemetry)
- Add metrics (Prometheus)
- Add dashboards (Grafana)
- Estimated effort: 8-12 hours

#### 7. Performance Optimization
- Add Redis caching for aggregated data
- Add database connection pooling
- Add query optimization (indexes, denormalization)
- Add response compression
- Estimated effort: 4-6 hours

#### 8. Security Hardening
- Add rate limiting (express-rate-limit)
- Add input sanitization (DOMPurify)
- Add CSRF protection
- Add audit logging (who did what when)
- Estimated effort: 4-6 hours

#### 9. API Documentation
- Add Swagger/OpenAPI spec
- Generate interactive API docs
- Add request/response examples
- Estimated effort: 2-3 hours

#### 10. Refactor Remaining Routes
- Apply same pattern to other large route files
- Create controllers/services for:
  - Agents routes
  - Analytics routes
  - Billing routes
- Estimated effort: 20-40 hours (depending on complexity)

---

## 13. Summary

### Before Refactor
- **Single file:** 1,652 LOC
- **Endpoints:** 17
- **Direct DB calls:** 39
- **Responsibilities:** Everything (routes, validation, business logic, DB access, external calls)
- **Testability:** Low (tightly coupled)
- **Maintainability:** Very difficult (navigation, debugging)

### After Refactor
- **Route file:** ~80 LOC (route definitions only)
- **Controller:** ~350 LOC (orchestration)
- **Services:** ~630 LOC (5 services, business logic)
- **Utils:** ~210 LOC (4 utils, pure functions)
- **Model enhancements:** ~70 LOC (5 new methods)
- **Total new LOC:** ~1,340 LOC

**Net change:** -312 LOC (19% reduction)
**File count:** 1 → 11 files (better organization)

### Architecture Benefits

#### Separation of Concerns
- **Routes:** Route definitions only
- **Controller:** Request/response orchestration
- **Services:** Business logic, external integrations
- **Utils:** Pure functions, validation, normalization
- **Models:** Database access abstraction

#### Testability
- **Utilities:** Pure functions, easy unit tests
- **Services:** Mockable dependencies, integration tests
- **Controller:** Mockable services, response formatting tests

#### Maintainability
- **Feature isolation:** Each service handles one domain
- **Clear responsibilities:** Each layer has single purpose
- **Easy navigation:** Related code grouped together
- **Reduced duplication:** Shared logic in utils

#### Reusability
- **File converter:** Reusable across other file upload endpoints
- **Validators:** Reusable across other endpoints
- **Normalizers:** Reusable for other PMS integrations
- **Services:** Reusable for CLI scripts, background jobs

---

### Risk Level: **High** (Due to Complexity)

**Why High Risk:**
- Large file (1,652 LOC)
- Complex state machine (7 steps)
- External integrations (n8n, monthly agents)
- Two upload paths (manual vs file)
- No existing tests
- Async fire-and-forget patterns
- Auto-advancement logic

**Mitigation:**
- Incremental rollout (staging → canary → production)
- Extensive manual testing
- Monitoring during rollout
- Quick rollback plan
- Preserve exact behavior (no "improvements" during refactor)

---

### Execution Time Estimate: **8-12 hours**

**Breakdown:**
- Create 4 utils (foundation): 2 hours
- Enhance PmsJobModel: 1 hour
- Create 5 services: 4 hours
- Create controller: 2 hours
- Refactor route file: 0.5 hour
- Manual testing: 2 hours
- Bug fixes: 0.5-1.5 hours

**Recommended Approach:**
1. Create utilities first (low risk, foundation)
2. Enhance model next (needed by services)
3. Create services one at a time (test each)
4. Create controller (orchestration)
5. Refactor route file last (final integration)
6. Manual test after each major step

---

## 14. Execution Checklist

### Pre-Flight
- [ ] Read entire plan
- [ ] Understand current code flow (manual vs file upload)
- [ ] Understand automation state machine (7 steps)
- [ ] Backup current routes/pms.ts file
- [ ] Create feature branch: `refactor/pms-routes`
- [ ] Notify team of refactor (potential staging downtime)

### Phase 1: Utilities (2 hours)
- [ ] Create `pms-constants.ts` (20 LOC)
- [ ] Create `pms-validator.util.ts` (80 LOC)
- [ ] Create `pms-normalizer.util.ts` (60 LOC)
- [ ] Create `file-converter.util.ts` (50 LOC)
- [ ] Compile TypeScript, fix imports
- [ ] Commit: "feat(pms): extract utilities"

### Phase 2: Model (1 hour)
- [ ] Add `createWithRawData()` method
- [ ] Add `updateResponseLog()` method
- [ ] Add `updateApprovals()` method
- [ ] Add `findActiveAutomationJobs()` method
- [ ] Add `updateJobStatus()` method
- [ ] Compile TypeScript, fix imports
- [ ] Commit: "feat(pms): enhance PmsJobModel with new methods"

### Phase 3: Services (4 hours)
- [ ] Create `pms-upload.service.ts` (180 LOC)
- [ ] Create `pms-approval.service.ts` (140 LOC)
- [ ] Create `pms-automation.service.ts` (120 LOC)
- [ ] Create `pms-data.service.ts` (100 LOC)
- [ ] Create `pms-retry.service.ts` (90 LOC)
- [ ] Compile TypeScript, fix imports
- [ ] Commit: "feat(pms): create feature services"

### Phase 4: Controller (2 hours)
- [ ] Create `pms.controller.ts` (350 LOC)
- [ ] Implement all 11 controller methods
- [ ] Compile TypeScript, fix imports
- [ ] Commit: "feat(pms): create PmsController"

### Phase 5: Route Refactor (0.5 hour)
- [ ] Refactor `routes/pms.ts` to ~80 LOC
- [ ] Remove all handler logic
- [ ] Import controller
- [ ] Map routes to controller methods
- [ ] Compile TypeScript, fix imports
- [ ] Commit: "refactor(pms): extract logic to controller/services"

### Phase 6: Testing (2 hours)
- [ ] Run compiler, fix any errors
- [ ] Start local server
- [ ] Test file upload endpoints (CSV, XLSX, manual)
- [ ] Test data retrieval endpoints (keyData, jobs)
- [ ] Test approval workflows (admin, client)
- [ ] Test automation monitoring (status, active)
- [ ] Test retry logic (parser, agents)
- [ ] Test edge cases (invalid inputs, missing data)
- [ ] Review logs for errors
- [ ] Fix bugs, test again

### Phase 7: Deployment (1 hour)
- [ ] Create PR with full description
- [ ] Code review (optional)
- [ ] Merge to main
- [ ] Deploy to staging
- [ ] Run smoke tests in staging
- [ ] Monitor logs for 30 minutes
- [ ] Deploy to production (if canary available)
- [ ] Monitor production for 1 hour
- [ ] Mark as complete

### Post-Deployment
- [ ] Document any issues found
- [ ] Update TODO list for Phase 2 improvements
- [ ] Share learnings with team
- [ ] Plan next route refactor

---

**END OF PLAN**
