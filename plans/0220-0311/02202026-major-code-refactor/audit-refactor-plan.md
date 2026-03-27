# Audit Route Refactor Plan

## Current State

### Overview
- **File**: `/signalsai-backend/src/routes/audit.ts`
- **LOC**: 327 lines
- **Endpoints**: 4
  - `POST /api/audit/start` - Trigger n8n workflow, receive audit_id (lines 91-158)
  - `GET /api/audit/:auditId/status` - Poll audit status with normalized data (lines 164-214)
  - `GET /api/audit/:auditId` - Get full audit details (lines 220-266)
  - `PATCH /api/audit/:auditId` - Update audit step data from n8n (lines 272-325)

### Current Dependencies
- `express` - Router and types
- `../database/connection` - Direct database access via `db()`
- `process.env.WEB_SCRAPING_TOOL_AGENT_WEBHOOK` - n8n webhook URL

### Current Responsibilities
The route file currently handles:
1. Route definition
2. Request validation (body params, URL params)
3. Direct database queries (3 endpoints use `db("audit_processes")`)
4. Business logic (normalization, filtering, data transformation)
5. External service orchestration (n8n webhook calls)
6. Error handling and response formatting
7. Console logging
8. Data normalization (5 helper functions)
9. Location calculation logic (fallback coordinates, offset generation)
10. Field filtering for PATCH operations

### Database Calls
**3 endpoints with direct database access**:
1. **GET /:auditId/status** (line 175): `db("audit_processes").where("id", auditId).first()`
2. **GET /:auditId** (line 231): `db("audit_processes").where("id", auditId).first()`
3. **PATCH /:auditId** (line 312): `db("audit_processes").where("id", auditId).update(filteredData)`

### Normalization Helpers (Lines 12-84)
5 pure utility functions for data transformation:
1. **normalizeWebsiteAnalysis** (lines 12-22): Converts scores to numbers, maps pillars
2. **normalizeSelfGBP** (lines 24-30): Handles totalScore fallback (totalScore || averageStarRating || 0)
3. **normalizeCompetitors** (lines 32-45): Filters self from competitors, ensures lat/lng, maps totalScore
4. **ensureLatLng** (lines 47-72): Provides fallback coordinates with offsets for competitors
5. **normalizeGBPAnalysis** (lines 74-84): Converts gbp_readiness_score to number, maps pillars

---

## Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── audit.ts                           # Route definitions only
├── controllers/
│   └── audit/
│       ├── AuditController.ts             # Main controller entry point
│       ├── audit-services/
│       │   ├── auditWorkflowService.ts    # n8n workflow orchestration
│       │   ├── auditRetrievalService.ts   # Audit data retrieval & processing
│       │   └── auditUpdateService.ts      # Audit data updates
│       └── audit-utils/
│           ├── validationUtils.ts         # Request validation utilities
│           ├── normalizationUtils.ts      # Data normalization functions
│           └── locationUtils.ts           # Location/coordinate utilities
├── models/
│   └── AuditProcessModel.ts               # Enhanced model with domain methods
```

---

## Mapping

### Route File (`routes/audit.ts`)
**Keeps**:
- Route definitions (4 routes)
- Router setup and export
- Middleware attachment (if any)

**Removes**:
- All validation logic
- All business logic
- All database calls
- All normalization helpers
- All service calls (n8n fetch)
- All error handling beyond basic Express error propagation
- All console logging

**After refactor**:
- Lines 91-158 → controller call: `AuditController.startAudit`
- Lines 164-214 → controller call: `AuditController.getAuditStatus`
- Lines 220-266 → controller call: `AuditController.getAuditDetails`
- Lines 272-325 → controller call: `AuditController.updateAudit`

---

### Controller (`controllers/audit/AuditController.ts`)
**Responsibilities**:
- Request/response orchestration
- Call validation utils
- Call appropriate service layer
- Format responses
- Handle errors at controller level
- Return appropriate HTTP status codes

**Methods**:
```typescript
startAudit(req: Request, res: Response): Promise<Response>
getAuditStatus(req: Request, res: Response): Promise<Response>
getAuditDetails(req: Request, res: Response): Promise<Response>
updateAudit(req: Request, res: Response): Promise<Response>
```

**Receives from routes/audit.ts**:
- Lines 93-100: Request body extraction & validation (startAudit)
- Lines 166-173: URL param extraction & validation (getAuditStatus)
- Lines 222-229: URL param extraction & validation (getAuditDetails)
- Lines 274-308: URL param + body extraction + field filtering (updateAudit)
- All error handling blocks (try/catch)
- All response formatting

---

### Audit Workflow Service (`controllers/audit/audit-services/auditWorkflowService.ts`)
**Responsibilities**:
- n8n webhook orchestration
- External service communication
- Workflow initiation logic
- Business logging for workflow events

**Methods**:
```typescript
triggerAuditWorkflow(domain: string, practiceSearchString: string): Promise<{ auditId: string; createdAt: string }>
```

**Receives from routes/audit.ts**:
- Lines 104-109: n8n webhook URL validation
- Lines 111-130: Fetch call to n8n webhook
- Lines 132-144: n8n response parsing and validation
- Lines 102-103, 124-125, 136-137, 143-144: Console logging

**Logic**:
1. Validate n8n webhook URL configured
2. Make POST request to n8n
3. Parse response and extract audit_id
4. Return structured result or throw error

---

### Audit Retrieval Service (`controllers/audit/audit-services/auditRetrievalService.ts`)
**Responsibilities**:
- Fetch audit data from database (via model)
- Process and normalize audit data
- Apply business rules for data transformation
- Return structured audit information

**Methods**:
```typescript
getAuditByIdWithStatus(auditId: string): Promise<AuditStatusResponse>
getAuditById(auditId: string): Promise<AuditDetailsResponse>
```

**Receives from routes/audit.ts**:
- Lines 175-183: Database query + null check (status endpoint)
- Lines 231-238: Database query + null check (details endpoint)
- Lines 184-204: Data processing and normalization (status endpoint)
- Lines 240-258: Data structuring (details endpoint)

**Logic**:
- **getAuditByIdWithStatus**:
  1. Fetch audit via AuditProcessModel
  2. If not found, throw NotFoundError
  3. Normalize all step data (website_analysis, self_gbp, competitors, gbp_analysis)
  4. Determine success flag based on error_message
  5. Return formatted response

- **getAuditById**:
  1. Fetch audit via AuditProcessModel
  2. If not found, throw NotFoundError
  3. Determine success flag based on error_message
  4. Return raw audit data with metadata

---

### Audit Update Service (`controllers/audit/audit-services/auditUpdateService.ts`)
**Responsibilities**:
- Update audit records
- Field validation for updates
- Business rules for allowed fields
- Database update orchestration

**Methods**:
```typescript
updateAuditFields(auditId: string, updateData: Record<string, any>): Promise<{ updatedFields: string[] }>
```

**Receives from routes/audit.ts**:
- Lines 284-308: Allowed fields validation and filtering
- Lines 310: Console logging for update
- Line 312: Database update call

**Logic**:
1. Define allowed update fields (status, realtime_status, error_message, step_*)
2. Filter incoming data to only allowed fields
3. If no valid fields, throw ValidationError
4. Update via AuditProcessModel
5. Return list of updated fields

---

### Validation Utils (`controllers/audit/audit-utils/validationUtils.ts`)
**Responsibilities**:
- Request validation rules
- Parameter extraction
- Type checking
- Return structured validation results

**Functions**:
```typescript
validateStartAuditInput(body: any): { domain: string; practice_search_string: string } | ValidationError
validateAuditIdParam(params: any): { auditId: string } | ValidationError
validateUpdateFields(body: any): Record<string, any> | ValidationError
```

**Receives from routes/audit.ts**:
- Lines 93-100: Domain and practice_search_string validation
- Lines 168-173: auditId param validation
- Lines 224-229: auditId param validation
- Lines 274-282: auditId param validation
- Lines 284-308: Update field validation and filtering

---

### Normalization Utils (`controllers/audit/audit-utils/normalizationUtils.ts`)
**Responsibilities**:
- Data transformation and normalization
- Score type conversions
- Field mapping and defaults
- Competitor filtering

**Functions**:
```typescript
normalizeWebsiteAnalysis(data: any): NormalizedWebsiteAnalysis | null
normalizeSelfGBP(data: any): NormalizedSelfGBP | null
normalizeCompetitors(competitorsData: any, selfGbpData: any): NormalizedCompetitor[] | null
normalizeGBPAnalysis(data: any): NormalizedGBPAnalysis | null
```

**Receives from routes/audit.ts**:
- Lines 12-22: normalizeWebsiteAnalysis
- Lines 24-30: normalizeSelfGBP
- Lines 32-45: normalizeCompetitors
- Lines 74-84: normalizeGBPAnalysis

**All functions are pure utility functions with no side effects.**

---

### Location Utils (`controllers/audit/audit-utils/locationUtils.ts`)
**Responsibilities**:
- Coordinate fallback logic
- Competitor location offset generation
- Lat/lng validation and defaults

**Functions**:
```typescript
ensureLatLng(location: any, selfLocation: any, index: number): { lat: number; lng: number }
```

**Receives from routes/audit.ts**:
- Lines 47-72: ensureLatLng function
- Hardcoded West Orange, NJ fallback coordinates: `{ lat: 40.7964763, lng: -74.2613414 }`
- Predefined competitor offset array (6 offsets for ~2 mile radius spread)

---

## Model Replacements

### Current Model (`models/AuditProcessModel.ts`)
**Existing methods**:
- `findById(id: number)` - Basic find by ID
- `updateById(id: number, data: Record<string, unknown>)` - Basic update

**Required additions**:
```typescript
// Find by UUID string (audit records use UUID, not integer IDs)
static async findByUuid(id: string, trx?: QueryContext): Promise<IAuditProcess | undefined>

// Update by UUID string
static async updateByUuid(id: string, data: Record<string, unknown>, trx?: QueryContext): Promise<number>

// Create audit record (if n8n responsibility moves to backend later)
static async create(data: Partial<IAuditProcess>, trx?: QueryContext): Promise<IAuditProcess>
```

**Interface enhancement**:
```typescript
export interface IAuditProcess {
  id: string; // UUID, not number
  domain: string;
  practice_search_string: string;
  status: string;
  realtime_status: string | null;
  error_message: string | null;
  step_screenshots: any | null;
  step_website_analysis: any | null;
  step_self_gbp: any | null;
  step_competitors: any | null;
  step_gbp_analysis: any | null;
  created_at: Date;
  updated_at: Date;
}
```

### Database Call Migrations
**Before**:
```typescript
// Line 175
const audit = await db("audit_processes").where("id", auditId).first();

// Line 231
const audit = await db("audit_processes").where("id", auditId).first();

// Line 312
await db("audit_processes").where("id", auditId).update(filteredData);
```

**After**:
```typescript
// In services
const audit = await AuditProcessModel.findByUuid(auditId);

const audit = await AuditProcessModel.findByUuid(auditId);

await AuditProcessModel.updateByUuid(auditId, filteredData);
```

---

## Files to Create

### 1. `/signalsai-backend/src/controllers/audit/AuditController.ts`
**Purpose**: Main controller entry point

**Exports**:
- `startAudit(req: Request, res: Response): Promise<Response>`
- `getAuditStatus(req: Request, res: Response): Promise<Response>`
- `getAuditDetails(req: Request, res: Response): Promise<Response>`
- `updateAudit(req: Request, res: Response): Promise<Response>`

**Dependencies**:
- `./audit-utils/validationUtils`
- `./audit-services/auditWorkflowService`
- `./audit-services/auditRetrievalService`
- `./audit-services/auditUpdateService`
- Express types

**Logic Flow**:

**startAudit**:
1. Extract and validate body fields (domain, practice_search_string)
2. If validation fails → return 400 with error
3. Call auditWorkflowService.triggerAuditWorkflow()
4. If workflow fails → return 500 or 502 with error
5. Return 200 with audit_id and created_at

**getAuditStatus**:
1. Extract and validate auditId from params
2. If validation fails → return 400 with error
3. Call auditRetrievalService.getAuditByIdWithStatus()
4. If not found → return 404
5. Return 200 with normalized status data

**getAuditDetails**:
1. Extract and validate auditId from params
2. If validation fails → return 400 with error
3. Call auditRetrievalService.getAuditById()
4. If not found → return 404
5. Return 200 with full audit details

**updateAudit**:
1. Extract and validate auditId from params
2. Extract and validate update fields from body
3. If validation fails → return 400 with error
4. Call auditUpdateService.updateAuditFields()
5. If update fails → return 500 with error
6. Return 200 with list of updated fields

---

### 2. `/signalsai-backend/src/controllers/audit/audit-services/auditWorkflowService.ts`
**Purpose**: n8n workflow orchestration

**Exports**:
- `triggerAuditWorkflow(domain: string, practiceSearchString: string): Promise<{ auditId: string; createdAt: string }>`

**Dependencies**:
- `process.env.WEB_SCRAPING_TOOL_AGENT_WEBHOOK`
- node-fetch (or built-in fetch)

**Logic**:
1. Validate n8n webhook URL is configured
2. Make POST request to n8n with domain and practice_search_string
3. Check response status
4. Parse JSON response
5. Validate audit_id is present
6. Log workflow initiation
7. Return audit_id and timestamp
8. Throw specific errors for different failure modes

**Error cases**:
- Webhook URL not configured → ConfigurationError
- n8n returns non-200 → ExternalServiceError
- Response missing audit_id → ExternalServiceError

---

### 3. `/signalsai-backend/src/controllers/audit/audit-services/auditRetrievalService.ts`
**Purpose**: Audit data retrieval and processing

**Exports**:
- `getAuditByIdWithStatus(auditId: string): Promise<AuditStatusResponse>`
- `getAuditById(auditId: string): Promise<AuditDetailsResponse>`

**Dependencies**:
- `../../../models/AuditProcessModel`
- `../audit-utils/normalizationUtils`

**Logic**:

**getAuditByIdWithStatus**:
1. Fetch audit via AuditProcessModel.findByUuid()
2. If not found, throw NotFoundError
3. Normalize step data using normalization utils
4. Calculate success flag (based on error_message)
5. Return formatted status response

**getAuditById**:
1. Fetch audit via AuditProcessModel.findByUuid()
2. If not found, throw NotFoundError
3. Calculate success flag (based on error_message)
4. Return full audit object with metadata

**Response types**:
```typescript
interface AuditStatusResponse {
  success: boolean;
  id: string;
  status: string;
  realtime_status: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  screenshots: any | null;
  website_analysis: NormalizedWebsiteAnalysis | null;
  self_gbp: NormalizedSelfGBP | null;
  competitors: NormalizedCompetitor[] | null;
  gbp_analysis: NormalizedGBPAnalysis | null;
}

interface AuditDetailsResponse {
  success: boolean;
  audit: IAuditProcess;
}
```

---

### 4. `/signalsai-backend/src/controllers/audit/audit-services/auditUpdateService.ts`
**Purpose**: Audit data updates

**Exports**:
- `updateAuditFields(auditId: string, updateData: Record<string, any>): Promise<{ updatedFields: string[] }>`

**Dependencies**:
- `../../../models/AuditProcessModel`

**Logic**:
1. Define allowed update fields constant
2. Filter updateData to only allowed fields
3. If no valid fields, throw ValidationError
4. Log update operation (audit ID + field names)
5. Call AuditProcessModel.updateByUuid()
6. Return list of updated field names

**Allowed fields**:
```typescript
const ALLOWED_UPDATE_FIELDS = [
  'status',
  'realtime_status',
  'error_message',
  'step_screenshots',
  'step_website_analysis',
  'step_self_gbp',
  'step_competitors',
  'step_gbp_analysis',
];
```

---

### 5. `/signalsai-backend/src/controllers/audit/audit-utils/validationUtils.ts`
**Purpose**: Request validation

**Exports**:
- `validateStartAuditInput(body: any)`
- `validateAuditIdParam(params: any)`
- `validateUpdateFields(body: any)`

**Logic**:

**validateStartAuditInput**:
1. Check domain is present and non-empty string
2. Check practice_search_string is present and non-empty string
3. Return validated object or throw ValidationError

**validateAuditIdParam**:
1. Check auditId is present and non-empty string
2. Optionally validate UUID format
3. Return validated object or throw ValidationError

**validateUpdateFields**:
1. Check body is non-empty object
2. Return body or throw ValidationError
3. (Field filtering happens in service layer)

---

### 6. `/signalsai-backend/src/controllers/audit/audit-utils/normalizationUtils.ts`
**Purpose**: Data transformation and normalization

**Exports**:
- `normalizeWebsiteAnalysis(data: any): NormalizedWebsiteAnalysis | null`
- `normalizeSelfGBP(data: any): NormalizedSelfGBP | null`
- `normalizeCompetitors(competitorsData: any, selfGbpData: any): NormalizedCompetitor[] | null`
- `normalizeGBPAnalysis(data: any): NormalizedGBPAnalysis | null`

**Dependencies**:
- `./locationUtils` (for ensureLatLng)

**Logic**: Direct copy of existing functions (lines 12-22, 24-30, 32-45, 74-84) with type annotations added.

**Types to define**:
```typescript
interface NormalizedWebsiteAnalysis {
  overall_score: number;
  overall_grade: string;
  pillars: Array<{ score: number; [key: string]: any }>;
}

interface NormalizedSelfGBP {
  totalScore: number;
  [key: string]: any;
}

interface NormalizedCompetitor {
  location: { lat: number; lng: number };
  totalScore: number;
  [key: string]: any;
}

interface NormalizedGBPAnalysis {
  gbp_readiness_score: number;
  pillars: Array<{ score: number; [key: string]: any }>;
  [key: string]: any;
}
```

---

### 7. `/signalsai-backend/src/controllers/audit/audit-utils/locationUtils.ts`
**Purpose**: Location and coordinate utilities

**Exports**:
- `ensureLatLng(location: any, selfLocation: any, index: number): { lat: number; lng: number }`

**Dependencies**: None

**Logic**: Direct copy of existing function (lines 47-72) with type annotations.

**Constants**:
```typescript
const DEFAULT_LOCATION = { lat: 40.7964763, lng: -74.2613414 }; // West Orange, NJ

const COMPETITOR_OFFSETS = [
  { lat: 0.015, lng: -0.01 },
  { lat: -0.02, lng: 0.008 },
  { lat: 0.01, lng: 0.015 },
  { lat: -0.008, lng: -0.02 },
  { lat: 0.025, lng: 0.005 },
  { lat: -0.015, lng: 0.012 },
];
```

---

## Files to Modify

### 1. `/signalsai-backend/src/routes/audit.ts`
**Changes**:
- Remove all helper functions (lines 12-84)
- Remove all handler logic from route definitions
- Import AuditController
- Replace inline handlers with controller method calls
- Keep route definitions and router export

**Before**:
```typescript
auditRoutes.post("/start", async (req, res) => {
  // 67 lines of logic
});
```

**After**:
```typescript
import { AuditController } from "../controllers/audit/AuditController";

auditRoutes.post("/start", AuditController.startAudit);
auditRoutes.get("/:auditId/status", AuditController.getAuditStatus);
auditRoutes.get("/:auditId", AuditController.getAuditDetails);
auditRoutes.patch("/:auditId", AuditController.updateAudit);
```

**Expected final LOC**: ~15-20 lines (down from 327)

---

### 2. `/signalsai-backend/src/models/AuditProcessModel.ts`
**Changes**:
- Update IAuditProcess interface with complete field definitions
- Change id type from `number` to `string` (UUID)
- Add `findByUuid()` method
- Add `updateByUuid()` method
- Add `create()` method (for future use)
- Keep existing methods for backward compatibility

**New methods**:
```typescript
static async findByUuid(id: string, trx?: QueryContext): Promise<IAuditProcess | undefined> {
  const result = await this.query(trx).where('id', id).first();
  return result as IAuditProcess | undefined;
}

static async updateByUuid(id: string, data: Record<string, unknown>, trx?: QueryContext): Promise<number> {
  return this.query(trx).where('id', id).update(data);
}

static async create(data: Partial<IAuditProcess>, trx?: QueryContext): Promise<IAuditProcess> {
  const [result] = await this.query(trx).insert(data).returning('*');
  return result as IAuditProcess;
}
```

---

## Step-by-Step Migration

### Phase 1: Model Enhancement
**Goal**: Prepare data access layer

**Steps**:
1. Update `/signalsai-backend/src/models/AuditProcessModel.ts`
   - Enhance IAuditProcess interface with all fields
   - Change id type to string (UUID)
   - Add findByUuid() method
   - Add updateByUuid() method
   - Add create() method
2. Test model methods in isolation
3. Commit: "feat(models): enhance AuditProcessModel with UUID support and complete interface"

**Risk**: Low - Additive changes, existing methods unchanged

---

### Phase 2: Utility Layer
**Goal**: Extract pure functions with no dependencies

**Steps**:
1. Create `/signalsai-backend/src/controllers/audit/audit-utils/` directory
2. Create `locationUtils.ts`
   - Copy ensureLatLng function (lines 47-72)
   - Add type annotations
   - Export function and constants
3. Create `normalizationUtils.ts`
   - Copy all 4 normalization functions (lines 12-22, 24-30, 32-45, 74-84)
   - Import ensureLatLng from locationUtils
   - Add type annotations and interfaces
   - Export all functions
4. Create `validationUtils.ts`
   - Extract validation logic from all 4 endpoints
   - Add validation functions
   - Export validation functions
5. Unit test all utility functions
6. Commit: "feat(audit): extract normalization, location, and validation utilities"

**Risk**: Very Low - Pure functions, easy to test in isolation

---

### Phase 3: Service Layer
**Goal**: Extract business logic and external service calls

**Steps**:
1. Create `/signalsai-backend/src/controllers/audit/audit-services/` directory
2. Create `auditWorkflowService.ts`
   - Extract n8n webhook logic (lines 104-144)
   - Import AuditProcessModel (for future use)
   - Add triggerAuditWorkflow function
   - Add error handling
3. Create `auditRetrievalService.ts`
   - Extract audit retrieval logic (lines 175-204, 231-258)
   - Import AuditProcessModel
   - Import normalizationUtils
   - Add getAuditByIdWithStatus function
   - Add getAuditById function
4. Create `auditUpdateService.ts`
   - Extract update logic (lines 284-312)
   - Import AuditProcessModel
   - Add updateAuditFields function
   - Define ALLOWED_UPDATE_FIELDS constant
5. Unit test all service functions
6. Commit: "feat(audit): extract workflow, retrieval, and update services"

**Risk**: Low-Medium - Services have external dependencies (DB, n8n), but logic is isolated

---

### Phase 4: Controller Layer
**Goal**: Create controller orchestration

**Steps**:
1. Create `/signalsai-backend/src/controllers/audit/` directory
2. Create `AuditController.ts`
   - Import all validation utils
   - Import all services
   - Implement startAudit method
   - Implement getAuditStatus method
   - Implement getAuditDetails method
   - Implement updateAudit method
   - Add error handling and response formatting
3. Integration test controller methods
4. Commit: "feat(audit): create AuditController with request orchestration"

**Risk**: Low - Controller just orchestrates, logic already tested

---

### Phase 5: Route Refactor
**Goal**: Simplify routes to delegation only

**Steps**:
1. Update `/signalsai-backend/src/routes/audit.ts`
   - Remove all helper functions (lines 12-84)
   - Remove all inline handler logic
   - Import AuditController
   - Replace handlers with controller method calls
   - Keep only route definitions and router export
2. Integration test all 4 endpoints
3. Manual smoke test via Postman/curl
4. Commit: "refactor(audit): simplify routes to delegate to AuditController"

**Risk**: Medium - Route changes affect API contract, requires thorough testing

---

### Phase 6: Cleanup and Documentation
**Goal**: Polish and document

**Steps**:
1. Remove unused imports from audit route
2. Add JSDoc comments to all new files
3. Update API documentation (if exists)
4. Remove dead code
5. Commit: "docs(audit): add JSDoc and clean up refactored code"

**Risk**: Very Low - Documentation only

---

## Risk Assessment

### Low Risk Areas
1. **Utility functions** - Pure functions, no side effects, easy to test
2. **Model enhancements** - Additive changes, backward compatible
3. **Location logic** - Isolated, deterministic, no external dependencies

### Medium Risk Areas
1. **Service layer** - External dependencies (database, n8n webhook)
   - **Mitigation**: Mock dependencies in tests, add integration tests
2. **Controller layer** - Request/response orchestration
   - **Mitigation**: Integration tests with real Express request/response mocks
3. **Route refactor** - Changes API behavior surface
   - **Mitigation**: Thorough integration testing, manual smoke tests

### High Risk Areas
**None** - This is a straightforward refactor with no architectural changes

### Failure Modes

#### 1. n8n webhook failure
**Current handling**: Returns 502 with error message
**After refactor**: Same behavior preserved in auditWorkflowService
**No change in failure mode**

#### 2. Audit not found
**Current handling**: Returns 404 with error message
**After refactor**: Same behavior preserved via NotFoundError in services
**No change in failure mode**

#### 3. Invalid input
**Current handling**: Returns 400 with error message
**After refactor**: Same behavior preserved via validation utils
**No change in failure mode**

#### 4. Database failure
**Current handling**: Returns 500 with generic error
**After refactor**: Same behavior preserved via try/catch in controller
**No change in failure mode**

### Data Integrity Risks
**None** - No schema changes, no data migration, read/write patterns unchanged

### Performance Risks
**None** - Same queries, same data flow, minimal additional function call overhead

---

## Testing Strategy

### Unit Tests
1. **locationUtils.ensureLatLng**
   - Test with valid location
   - Test with missing lat/lng
   - Test with null selfLocation
   - Test offset cycling (index modulo)

2. **normalizationUtils (all 4 functions)**
   - Test with valid data
   - Test with null input
   - Test with missing fields
   - Test with type coercion (string → number)

3. **validationUtils (all 3 functions)**
   - Test with valid input
   - Test with missing fields
   - Test with empty strings
   - Test with wrong types

4. **auditWorkflowService.triggerAuditWorkflow**
   - Mock fetch, test successful response
   - Mock fetch, test non-200 response
   - Mock fetch, test missing audit_id
   - Test with undefined webhook URL

5. **auditRetrievalService (both methods)**
   - Mock model, test successful retrieval
   - Mock model, test audit not found
   - Test normalization applied correctly
   - Test success flag logic

6. **auditUpdateService.updateAuditFields**
   - Test with valid fields
   - Test with invalid fields filtered out
   - Test with no valid fields
   - Test with mixed valid/invalid fields

### Integration Tests
1. **Controller methods**
   - Test startAudit with valid input
   - Test startAudit with missing fields
   - Test getAuditStatus with valid ID
   - Test getAuditStatus with invalid ID
   - Test getAuditDetails with valid ID
   - Test getAuditDetails with invalid ID
   - Test updateAudit with valid fields
   - Test updateAudit with no valid fields

2. **Route endpoints**
   - Test POST /api/audit/start (full flow)
   - Test GET /api/audit/:auditId/status (full flow)
   - Test GET /api/audit/:auditId (full flow)
   - Test PATCH /api/audit/:auditId (full flow)

### Manual Testing
1. **Smoke test via Postman/curl**
   - Trigger audit start
   - Poll status endpoint
   - Get full audit details
   - Update audit fields (simulate n8n callback)

2. **End-to-end test**
   - Start audit → poll → verify data normalization
   - Verify competitor filtering works
   - Verify location fallback works
   - Verify error_message affects success flag

---

## Definition of Done

- [ ] All 7 new files created
- [ ] AuditProcessModel enhanced with UUID methods
- [ ] Route file simplified to ~15-20 lines
- [ ] All database calls replaced with model methods
- [ ] All 5 normalization helpers moved to utils
- [ ] All 4 endpoints functional (same behavior as before)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual smoke test completed
- [ ] No regressions in API behavior
- [ ] Code review completed
- [ ] Documentation updated (if applicable)

---

## Migration Rollback Plan

If issues arise during migration:

1. **Revert to previous route file** - Single file rollback
2. **Keep new controller/service/util files** - Available for future use
3. **Rollback model changes** - Restore previous AuditProcessModel version

**Rollback risk**: Very Low - Route file is single point of integration

---

## Future Enhancements (Out of Scope)

1. **Move audit creation to backend** - Currently n8n creates DB record, could be handled by auditWorkflowService
2. **Add retry logic for n8n webhook** - Currently fails immediately on webhook error
3. **Add audit status enum** - Replace string status with enum type
4. **Add structured error types** - Custom error classes for better error handling
5. **Add audit caching** - Cache frequently accessed audits to reduce DB load
6. **Add audit pagination** - List endpoint for multiple audits
7. **Add audit search/filter** - Query audits by domain, status, date range
8. **Add audit analytics** - Track audit success rates, completion times, failure reasons

---

## Dependencies

### External Dependencies (Unchanged)
- `express` - Router and types
- `node-fetch` or built-in fetch - For n8n webhook calls
- Database connection via Knex (through BaseModel)

### Internal Dependencies (New)
- `AuditProcessModel` - Enhanced with UUID methods
- Normalization utils - Pure functions for data transformation
- Location utils - Pure functions for coordinate calculations
- Validation utils - Pure functions for request validation

### Environment Variables
- `WEB_SCRAPING_TOOL_AGENT_WEBHOOK` - n8n webhook URL (existing, unchanged)

---

## Notes

1. **No breaking changes** - API contract remains identical
2. **No schema changes** - Database structure unchanged
3. **No new dependencies** - Uses existing packages
4. **Backward compatible** - Existing model methods still work
5. **Testable** - All layers can be tested in isolation
6. **Maintainable** - Clear separation of concerns
7. **Scalable** - Easy to add new endpoints or features

---

## Estimated Effort

- **Phase 1 (Model)**: 1 hour
- **Phase 2 (Utils)**: 2 hours
- **Phase 3 (Services)**: 3 hours
- **Phase 4 (Controller)**: 2 hours
- **Phase 5 (Route)**: 1 hour
- **Phase 6 (Cleanup)**: 1 hour
- **Testing**: 3 hours
- **Total**: ~13 hours

---

## Summary

This refactor transforms a 327-line route file with mixed concerns into a clean, layered architecture:

- **Routes**: Route definitions only (~15-20 lines)
- **Controller**: Request orchestration (4 methods)
- **Services**: Business logic (3 services, 5 methods)
- **Utils**: Pure functions (3 utilities, 9 functions)
- **Model**: Enhanced data access (3 new methods)

**Benefits**:
- Easier to test (unit tests for each layer)
- Easier to maintain (clear separation of concerns)
- Easier to extend (add new features without touching route file)
- Easier to understand (each file has single responsibility)

**Risks**: Low - No breaking changes, thorough testing strategy, simple rollback plan
