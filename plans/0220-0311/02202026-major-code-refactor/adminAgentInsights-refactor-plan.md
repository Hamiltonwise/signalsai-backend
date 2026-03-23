# Admin Agent Insights Route Refactor Plan

## Current State

### Overview
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/adminAgentInsights.ts`
- **Lines of Code**: 697 LOC
- **Endpoints**: 8
  - `GET /api/admin/agent-insights/summary` — Summary stats per agent with recommendations
  - `GET /api/admin/agent-insights/:agentType/recommendations` — All recommendations for specific agent
  - `PATCH /api/admin/agent-insights/recommendations/:id` — Update recommendation status
  - `PATCH /api/admin/agent-insights/:agentType/recommendations/mark-all-pass` — Bulk mark as PASS
  - `DELETE /api/admin/agent-insights/recommendations/bulk-delete` — Bulk delete by IDs
  - `DELETE /api/admin/agent-insights/clear-month-data` — Clear Guardian/Governance data for month
  - `GET /api/admin/agent-insights/:agentType/governance-ids` — Get PASS/REJECT IDs for agent
  - `POST /api/admin/agent-insights/by-ids` — Get recommendation details by IDs
- **Data Sources**:
  - Primary: `agent_recommendations` table
  - Secondary: `agent_results` table (only for clear-month-data endpoint)
- **Dependencies**:
  - `express` (Request, Response)
  - `db` (Knex connection from `../database/connection`)

### Current Responsibilities (Mixed in Route File)
1. Route definitions
2. Request validation (query params, body, path params)
3. Date range calculation logic (month filtering, current month defaults)
4. Complex aggregation queries (CASE WHEN for pass/fail counts)
5. Pagination logic (offset calculation, total pages)
6. Query building with filters (source, status, month)
7. Data transformation (parsing JSON fields, formatting responses)
8. Response formatting (pagination metadata, success/error structure)
9. Error handling (try/catch with status codes)
10. Database transaction management (direct db() calls)
11. Business logic (IGNORE → NULL conversion, completed_at timestamps)

### Existing Model
**AgentRecommendationModel** (`src/models/AgentRecommendationModel.ts`):
- `bulkInsert()` — Insert multiple recommendations
- `findByAgentResultId()` — Get by agent_result_id
- `updateStatus()` — Update status by ID
- `deleteByIds()` — Bulk delete
- `deleteByAgentResultId()` — Delete by agent_result_id
- `getSummaryByAgent()` — Get summary with pagination
- `getDetailsByAgent()` — Get details with filters and pagination

### Complex Query Patterns
**Summary Endpoint** (Lines 65-88):
```sql
SELECT
  agent_under_test,
  COUNT(*) as total_recommendations,
  SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as pass_count,
  SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
  SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) as fixed_count,
  AVG(confidence) as avg_confidence
FROM agent_recommendations
WHERE created_at >= ? AND created_at <= ?
  AND agent_under_test IS NOT NULL
GROUP BY agent_under_test
ORDER BY agent_under_test
```

**Recommendations Endpoint** (Lines 197-239):
- Dynamic filter building (month, source, status)
- Query cloning for count
- Pagination with offset/limit
- JSON field parsing (evidence_links)

**Status Update Logic** (Lines 290-356):
- IGNORE → NULL conversion
- Conditional completed_at timestamp
- Clear completed_at for REJECT/IGNORE

---

## Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── adminAgentInsights.ts                    # THIN: only route definitions
├── controllers/
│   └── admin-agent-insights/
│       ├── AdminAgentInsightsController.ts      # Main controller (orchestration)
│       ├── feature-services/
│       │   ├── summaryService.ts                # Summary stats aggregation
│       │   ├── recommendationService.ts         # Recommendation CRUD operations
│       │   └── governanceService.ts             # Governance ID operations
│       └── feature-utils/
│           ├── dateRangeBuilder.ts              # Date range calculation logic
│           ├── paginationHelper.ts              # Pagination offset/metadata calc
│           ├── statusMapper.ts                  # Status conversion (IGNORE → NULL)
│           └── recommendationFormatter.ts       # Response formatting & JSON parsing
├── models/
│   └── AgentRecommendationModel.ts              # Extended with new methods
```

### Separation of Concerns

**Route Layer** (`routes/adminAgentInsights.ts`):
- Route definitions only
- Delegates to controller methods
- ~40-60 LOC (8 endpoints × 5-7 LOC each)

**Controller Layer** (`controllers/admin-agent-insights/AdminAgentInsightsController.ts`):
- Request orchestration
- Extract and validate parameters
- Call service layer
- Format HTTP responses
- Convert service errors to HTTP status codes
- HTTP-level logging

**Service Layer** (`controllers/admin-agent-insights/feature-services/`):
- **summaryService.ts**: Summary aggregation logic, model calls for summary stats
- **recommendationService.ts**: Recommendation CRUD (get, update, delete, bulk ops), model calls
- **governanceService.ts**: Governance ID retrieval, by-IDs lookup, model calls
- Business logic (not HTTP)
- Model method orchestration
- Return structured data

**Utils Layer** (`controllers/admin-agent-insights/feature-utils/`):
- **dateRangeBuilder.ts**: Parse month param, calculate start/end dates, default to current month
- **paginationHelper.ts**: Calculate offset, validate page/limit, build pagination metadata
- **statusMapper.ts**: IGNORE → NULL conversion, completed_at logic
- **recommendationFormatter.ts**: Parse JSON fields, format response structure

**Model Layer** (`models/AgentRecommendationModel.ts`):
- Extended with new methods for admin insights
- Type-safe database queries
- JSON field serialization/deserialization
- Transaction support

---

## Code Mapping

### What Goes Where

#### 1. **dateRangeBuilder.ts** (Date Range Utilities)
```
Lines 39-57  → buildDateRange(month?: string)
Lines 40-54  → calculateMonthRange(month: string)
Lines 203-211 → (duplicate logic — consolidate)
Lines 490-508 → (duplicate logic — consolidate)
```
**Responsibilities**:
- Parse YYYY-MM month parameter
- Calculate start date (first day of month)
- Calculate end date (last day of month + time)
- Default to current month if not provided
- Return { startDate, endDate, endDateTime } tuple

**Exported Functions**:
- `buildDateRange(month?: string): DateRange`
- `getCurrentMonthRange(): DateRange`

---

#### 2. **paginationHelper.ts** (Pagination Utilities)
```
Lines 34-37  → parsePagination(page, limit)
Lines 129-132 → calculatePagination(total, page, limit)
Lines 188-189 → (duplicate offset calc — consolidate)
```
**Responsibilities**:
- Parse and validate page/limit parameters
- Calculate offset from page/limit
- Calculate total pages
- Build pagination metadata object
- Handle edge cases (page < 1, limit < 1)

**Exported Functions**:
- `parsePaginationParams(page?: string, limit?: string): PaginationParams`
- `calculatePaginationMeta(total: number, page: number, limit: number): PaginationMetadata`

---

#### 3. **statusMapper.ts** (Status Conversion Logic)
```
Lines 293-305 → validateAndMapStatus(status: string)
Lines 321-333 → buildUpdatePayload(status: string)
Lines 328-333 → (completed_at timestamp logic)
```
**Responsibilities**:
- Validate status values (PASS/REJECT/IGNORE)
- Convert IGNORE to NULL for database
- Determine completed_at timestamp based on status
  - PASS → set to new Date()
  - REJECT/IGNORE → set to null
- Return update payload object

**Exported Functions**:
- `validateStatus(status: string): boolean`
- `mapStatusToDb(status: string): string | null`
- `buildStatusUpdatePayload(status: string): { status: string | null, completed_at: Date | null, updated_at: Date }`

---

#### 4. **recommendationFormatter.ts** (Response Formatting)
```
Lines 113-126 → formatSummaryData(row)
Lines 242-248 → parseJsonFields(recommendations)
Lines 242-248 → (evidence_links JSON parsing)
```
**Responsibilities**:
- Format summary row data (calculate pass_rate, parse counts)
- Parse JSON string fields (evidence_links)
- Transform database rows to API response shape
- Handle null/undefined values safely

**Exported Functions**:
- `formatSummaryRow(row: any): SummaryResponse`
- `parseRecommendationJson(recommendations: any[]): IAgentRecommendation[]`
- `formatRecommendationResponse(rec: any): FormattedRecommendation`

---

#### 5. **summaryService.ts** (Summary Aggregation)
```
Lines 59-155 → getSummary(month?, page, limit)
  Lines 65-88  → Model method: getSummaryWithCounts()
  Lines 113-126 → formatSummaryData() — move to formatter
  Lines 129-132 → pagination calc — move to helper
```
**Responsibilities**:
- Orchestrate summary retrieval with filters
- Call model for aggregation query
- Apply pagination
- Return structured data (not HTTP response)

**Exported Functions**:
- `getAgentSummary(month?: string, page?: string, limit?: string): Promise<SummaryResult>`

**Model Method Calls**:
- `AgentRecommendationModel.getSummaryWithCounts(startDate, endDate, pagination)`

---

#### 6. **recommendationService.ts** (Recommendation CRUD)
```
Lines 174-276 → getRecommendations(agentType, filters, pagination)
  Lines 197-239 → Query building — move to model
  Lines 242-248 → JSON parsing — move to formatter

Lines 290-356 → updateRecommendationStatus(id, status)
  Lines 311-319 → Existence check — model method
  Lines 321-336 → Update with status logic

Lines 370-417 → markAllAsPass(agentType, source?)
  Lines 383-397 → Bulk update query — move to model

Lines 428-473 → bulkDeleteRecommendations(ids[])
  Lines 448-450 → Bulk delete — already in model

Lines 486-547 → clearMonthData(month?)
  Lines 515-525 → Delete recommendations for month — model method
  Lines 521-525 → Delete agent_results — model method
```
**Responsibilities**:
- Orchestrate recommendation retrieval with filters
- Update recommendation status with business logic
- Bulk operations (mark-all-pass, bulk-delete)
- Clear month data (recommendations + agent_results)
- Call model methods for database operations

**Exported Functions**:
- `getRecommendationsByAgent(agentType, month?, source?, status?, page?, limit?): Promise<RecommendationResult>`
- `updateStatus(id, status): Promise<UpdateResult>`
- `markAllAsPass(agentType, source?): Promise<BulkUpdateResult>`
- `bulkDelete(ids): Promise<DeleteResult>`
- `clearMonthData(month?): Promise<ClearResult>`

**Model Method Calls**:
- `AgentRecommendationModel.findByAgentWithFilters(agentType, dateRange, filters, pagination)`
- `AgentRecommendationModel.findById(id)`
- `AgentRecommendationModel.updateWithStatusLogic(id, statusPayload)`
- `AgentRecommendationModel.markAllAsPassForAgent(agentType, source?)`
- `AgentRecommendationModel.deleteByIds(ids)`
- `AgentRecommendationModel.deleteByDateRange(startDate, endDate)`
- `AgentResultModel.deleteByAgentTypesAndDateRange(['guardian', 'governance_sentinel'], startDate, endDate)`

---

#### 7. **governanceService.ts** (Governance ID Operations)
```
Lines 563-614 → getGovernanceIds(agentType)
  Lines 574-583 → Get PASS IDs — model method
  Lines 580-583 → Get REJECT IDs — model method
  Lines 585-586 → Map to ID arrays

Lines 631-691 → getRecommendationsByIds(passed[], rejected[])
  Lines 652-657 → Get passed recs — model method
  Lines 660-665 → Get rejected recs — model method
```
**Responsibilities**:
- Get PASS/REJECT recommendation IDs for agent
- Get recommendation details by ID arrays
- Map results to governance structure

**Exported Functions**:
- `getGovernanceIdsByAgent(agentType): Promise<GovernanceIdsResult>`
- `getRecommendationsByIds(passedIds?, rejectedIds?): Promise<RecommendationsByIdsResult>`

**Model Method Calls**:
- `AgentRecommendationModel.findIdsByAgentAndStatus(agentType, 'PASS')`
- `AgentRecommendationModel.findIdsByAgentAndStatus(agentType, 'REJECT')`
- `AgentRecommendationModel.findByIds(ids, columns)`

---

#### 8. **AdminAgentInsightsController.ts** (Main Controller)
```
Lines 32-156  → getSummary(req, res)
Lines 174-276 → getRecommendations(req, res)
Lines 290-356 → updateRecommendationStatus(req, res)
Lines 370-417 → markAllAsPass(req, res)
Lines 428-473 → bulkDelete(req, res)
Lines 486-547 → clearMonthData(req, res)
Lines 563-614 → getGovernanceIds(req, res)
Lines 631-691 → getRecommendationsByIds(req, res)
```
**Responsibilities**:
- Extract request parameters (query, body, params)
- Basic validation (required fields, types)
- Call appropriate service methods
- Format HTTP responses (success/error)
- Set appropriate HTTP status codes
- HTTP-level error logging

**Exported Methods**:
- `getSummary(req: Request, res: Response): Promise<Response>`
- `getRecommendations(req: Request, res: Response): Promise<Response>`
- `updateRecommendationStatus(req: Request, res: Response): Promise<Response>`
- `markAllAsPass(req: Request, res: Response): Promise<Response>`
- `bulkDelete(req: Request, res: Response): Promise<Response>`
- `clearMonthData(req: Request, res: Response): Promise<Response>`
- `getGovernanceIds(req: Request, res: Response): Promise<Response>`
- `getRecommendationsByIds(req: Request, res: Response): Promise<Response>`

---

#### 9. **adminAgentInsights.ts** (Route Definitions)
```
Lines 32-156  → router.get("/summary", ...)
Lines 174-276 → router.get("/:agentType/recommendations", ...)
Lines 290-356 → router.patch("/recommendations/:id", ...)
Lines 370-417 → router.patch("/:agentType/recommendations/mark-all-pass", ...)
Lines 428-473 → router.delete("/recommendations/bulk-delete", ...)
Lines 486-547 → router.delete("/clear-month-data", ...)
Lines 563-614 → router.get("/:agentType/governance-ids", ...)
Lines 631-691 → router.post("/by-ids", ...)
```
**New Structure** (~40-60 LOC):
```typescript
import express from "express";
import AdminAgentInsightsController from "../controllers/admin-agent-insights/AdminAgentInsightsController";

const router = express.Router();

router.get("/summary", AdminAgentInsightsController.getSummary);
router.get("/:agentType/recommendations", AdminAgentInsightsController.getRecommendations);
router.patch("/recommendations/:id", AdminAgentInsightsController.updateRecommendationStatus);
router.patch("/:agentType/recommendations/mark-all-pass", AdminAgentInsightsController.markAllAsPass);
router.delete("/recommendations/bulk-delete", AdminAgentInsightsController.bulkDelete);
router.delete("/clear-month-data", AdminAgentInsightsController.clearMonthData);
router.get("/:agentType/governance-ids", AdminAgentInsightsController.getGovernanceIds);
router.post("/by-ids", AdminAgentInsightsController.getRecommendationsByIds);

export default router;
```

---

## Model Extensions

### New Methods to Add to AgentRecommendationModel

#### 1. **getSummaryWithCounts()**
```typescript
static async getSummaryWithCounts(
  startDate: string,
  endDate: string,
  pagination: PaginationParams,
  trx?: QueryContext
): Promise<PaginatedResult<AgentSummaryWithCounts>>
```
**Current equivalent**: Lines 65-88
**Adds**: `fixed_count` (SUM(CASE WHEN status = 'PASS'))

---

#### 2. **findByAgentWithFilters()**
```typescript
static async findByAgentWithFilters(
  agentType: string,
  dateRange: DateRange | null,
  filters: RecommendationFilters,
  pagination: PaginationParams,
  trx?: QueryContext
): Promise<PaginatedResult<IAgentRecommendation>>
```
**Current equivalent**: Lines 197-239
**Features**:
- Optional month filtering
- Source filter (source_agent_type)
- Status filter
- Pagination
- JSON field parsing

---

#### 3. **updateWithStatusLogic()**
```typescript
static async updateWithStatusLogic(
  id: number,
  statusPayload: StatusUpdatePayload,
  trx?: QueryContext
): Promise<number>
```
**Current equivalent**: Lines 336
**Features**: Updates status, completed_at, and updated_at in one call

---

#### 4. **markAllAsPassForAgent()**
```typescript
static async markAllAsPassForAgent(
  agentType: string,
  sourceFilter?: string,
  trx?: QueryContext
): Promise<number>
```
**Current equivalent**: Lines 383-397
**Features**:
- Updates only REJECT → PASS
- Optional source_agent_type filter
- Sets completed_at and updated_at

---

#### 5. **deleteByDateRange()**
```typescript
static async deleteByDateRange(
  startDate: string,
  endDate: string,
  trx?: QueryContext
): Promise<number>
```
**Current equivalent**: Lines 515-518
**Features**: Delete all recommendations within date range

---

#### 6. **findIdsByAgentAndStatus()**
```typescript
static async findIdsByAgentAndStatus(
  agentType: string,
  status: 'PASS' | 'REJECT',
  trx?: QueryContext
): Promise<number[]>
```
**Current equivalent**: Lines 574-586
**Features**: Returns array of IDs (not full objects)

---

#### 7. **findByIds()**
```typescript
static async findByIds(
  ids: number[],
  columns?: string[],
  trx?: QueryContext
): Promise<IAgentRecommendation[]>
```
**Current equivalent**: Lines 654-665
**Features**:
- Get recommendations by ID array
- Optional column selection
- Default: id, title, explanation, status

---

### AgentResultModel Extension

**New method needed** for `clearMonthData`:
```typescript
static async deleteByAgentTypesAndDateRange(
  agentTypes: string[],
  startDate: string,
  endDate: string,
  trx?: QueryContext
): Promise<number>
```
**Current equivalent**: Lines 521-525
**Features**: Delete agent_results by agent_type array + date range

---

## Step-by-Step Migration

### Phase 1: Model Layer Extension
**Goal**: Add new methods to models before extracting from route

1. **Extend AgentRecommendationModel** (`src/models/AgentRecommendationModel.ts`)
   - Add `getSummaryWithCounts()` method
   - Add `findByAgentWithFilters()` method
   - Add `updateWithStatusLogic()` method
   - Add `markAllAsPassForAgent()` method
   - Add `deleteByDateRange()` method
   - Add `findIdsByAgentAndStatus()` method
   - Add `findByIds()` method
   - Add type interfaces:
     - `AgentSummaryWithCounts` (extends AgentSummary with fixed_count)
     - `RecommendationFilters` (month, source, status)
     - `StatusUpdatePayload` (status, completed_at, updated_at)
     - `DateRange` (startDate, endDate, endDateTime)

2. **Create AgentResultModel** (if doesn't exist) or extend existing
   - Add `deleteByAgentTypesAndDateRange()` method

**Risk Level**: Low
**Testing**: Unit tests for each new model method

---

### Phase 2: Utils Layer Creation
**Goal**: Extract pure functions with no dependencies

3. **Create `dateRangeBuilder.ts`**
   - Extract date calculation logic
   - Create `buildDateRange(month?: string)`
   - Create `getCurrentMonthRange()`
   - No dependencies on request/response

4. **Create `paginationHelper.ts`**
   - Extract pagination calculation
   - Create `parsePaginationParams(page, limit)`
   - Create `calculatePaginationMeta(total, page, limit)`

5. **Create `statusMapper.ts`**
   - Extract status conversion logic
   - Create `validateStatus(status)`
   - Create `mapStatusToDb(status)`
   - Create `buildStatusUpdatePayload(status)`

6. **Create `recommendationFormatter.ts`**
   - Extract response formatting
   - Create `formatSummaryRow(row)`
   - Create `parseRecommendationJson(recommendations)`

**Risk Level**: Low
**Testing**: Unit tests for each utility function

---

### Phase 3: Service Layer Creation
**Goal**: Extract business logic and model orchestration

7. **Create `summaryService.ts`**
   - Extract `getAgentSummary()` method
   - Use `dateRangeBuilder`, `paginationHelper`, `recommendationFormatter`
   - Call `AgentRecommendationModel.getSummaryWithCounts()`

8. **Create `recommendationService.ts`**
   - Extract `getRecommendationsByAgent()` method
   - Extract `updateStatus()` method
   - Extract `markAllAsPass()` method
   - Extract `bulkDelete()` method
   - Extract `clearMonthData()` method
   - Use utils and model methods

9. **Create `governanceService.ts`**
   - Extract `getGovernanceIdsByAgent()` method
   - Extract `getRecommendationsByIds()` method
   - Call model methods for ID retrieval

**Risk Level**: Medium
**Testing**: Integration tests calling services with test database

---

### Phase 4: Controller Layer Creation
**Goal**: HTTP orchestration layer

10. **Create `AdminAgentInsightsController.ts`**
    - Create class with 8 static controller methods
    - Each method:
      - Extracts req parameters
      - Validates basic input
      - Calls service layer
      - Formats HTTP response
      - Handles errors with appropriate status codes
    - Use try/catch for all methods
    - Standardized response format:
      ```typescript
      { success: true, data: ..., pagination?: ..., message?: ... }
      { success: false, error: "ERROR_CODE", message: "..." }
      ```

**Risk Level**: Medium
**Testing**: Controller tests with mocked services

---

### Phase 5: Route Layer Refactor
**Goal**: Thin route definitions

11. **Refactor `routes/adminAgentInsights.ts`**
    - Replace all inline handlers with controller method references
    - Remove all business logic
    - Keep only route definitions
    - Import controller
    - Should reduce from 697 LOC → ~40-60 LOC

**Risk Level**: Low (if previous phases tested)
**Testing**: E2E tests to ensure endpoints still work

---

### Phase 6: Cleanup & Validation
**Goal**: Remove duplication, validate correctness

12. **Remove database/connection imports from routes**
    - Verify `db` import removed from route file
    - Verify all db() calls moved to models/services

13. **Consolidate duplicate logic**
    - Date range calculation appears in 3 places (summary, recommendations, clear-month)
    - Pagination logic appears in multiple places
    - Ensure all use centralized utils

14. **Type Safety Validation**
    - Ensure all model methods return typed interfaces
    - Ensure services return typed results
    - Ensure controller properly types req/res

**Risk Level**: Low
**Testing**: Full regression test suite

---

## Files to Create

### Controllers
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/AdminAgentInsightsController.ts` (~250-300 LOC)

### Services
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-services/summaryService.ts` (~80-100 LOC)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-services/recommendationService.ts` (~200-250 LOC)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-services/governanceService.ts` (~80-100 LOC)

### Utils
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-utils/dateRangeBuilder.ts` (~60-80 LOC)
6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-utils/paginationHelper.ts` (~50-70 LOC)
7. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-utils/statusMapper.ts` (~60-80 LOC)
8. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/admin-agent-insights/feature-utils/recommendationFormatter.ts` (~70-90 LOC)

**Total New Files**: 8
**Estimated Total LOC**: ~850-1070 (slightly more than original due to separation, typing, error handling)

---

## Files to Modify

### Routes
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/adminAgentInsights.ts`
   - **Current**: 697 LOC
   - **Target**: ~40-60 LOC
   - **Change**: Remove all business logic, keep only route definitions

### Models
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/AgentRecommendationModel.ts`
   - **Current**: ~170 LOC
   - **Target**: ~350-400 LOC
   - **Change**: Add 7 new methods + type interfaces

3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/AgentResultModel.ts` (if exists)
   - **Change**: Add `deleteByAgentTypesAndDateRange()` method
   - **Estimate**: +20-30 LOC

---

## Risk Assessment

### High-Risk Areas

#### 1. **Date Range Calculation**
**Risk**: Boundary bugs (off-by-one for end-of-month)
- Current implementation uses `T23:59:59.999Z` for inclusive end date
- Must preserve exact logic when extracting

**Mitigation**:
- Comprehensive unit tests with edge cases:
  - February (leap year and non-leap year)
  - 30-day and 31-day months
  - Current month calculation
  - YYYY-MM parsing validation
- Test timezone handling (UTC vs local)

---

#### 2. **Pagination Logic**
**Risk**: Off-by-one errors in offset calculation or total pages
- Current: `offset = (pageNum - 1) * limitNum`
- Current: `totalPages = Math.ceil(total / limitNum)`

**Mitigation**:
- Unit tests with boundary cases:
  - page=1, limit=50, total=0
  - page=1, limit=50, total=49
  - page=1, limit=50, total=50
  - page=1, limit=50, total=51
  - page=2, limit=50, total=100
- Validate page < 1 handling
- Validate limit < 1 handling

---

#### 3. **Status Update Logic**
**Risk**: completed_at timestamp logic error
- PASS: Set completed_at = new Date()
- REJECT/IGNORE: Clear completed_at = null
- IGNORE: Convert status to NULL in database

**Current Logic** (Lines 321-333):
```typescript
if (status === "PASS") {
  updates.completed_at = new Date();
} else {
  updates.completed_at = null;
}
```

**Mitigation**:
- Integration tests verifying:
  - NULL → PASS: status=PASS, completed_at set
  - PASS → REJECT: status=REJECT, completed_at=null
  - REJECT → PASS: status=PASS, completed_at set
  - Any → IGNORE: status=NULL, completed_at=null
- Ensure timestamps are UTC

---

#### 4. **JSON Field Parsing**
**Risk**: evidence_links already parsed vs string
- Current check: `typeof rec.evidence_links === "string"`
- Model auto-deserializes JSON fields

**Mitigation**:
- Verify BaseModel JSON deserialization
- Test both scenarios:
  - Fresh from DB (may be string)
  - After model deserialize (already array)
- Add defensive parsing in formatter

---

#### 5. **Query Filter Application Order**
**Risk**: Knex query builder cloning issues
- Current: `const countQuery = query.clone()`
- Must preserve filters when counting

**Mitigation**:
- Integration tests verifying count matches filtered results
- Test all filter combinations:
  - month only
  - source only
  - status only
  - month + source
  - month + status
  - source + status
  - all three

---

#### 6. **Bulk Operations Race Conditions**
**Risk**: mark-all-pass and bulk-delete on same data
- No transaction boundaries in current implementation
- No optimistic locking

**Mitigation**:
- Document non-transactional nature
- Consider adding transaction support to service methods
- Add `trx?` parameter to all model methods
- Client-side handling for concurrent edits

---

#### 7. **Clear Month Data Multi-Table Delete**
**Risk**: Partial deletes (recommendations deleted, agent_results fail)
- Deletes from 2 tables: agent_recommendations, agent_results
- No transaction wrapping in current code

**Mitigation**:
- Wrap in transaction at service layer
- Return counts for both deletes
- Add rollback on partial failure
- Consider foreign key constraints (if not exist)

---

### Medium-Risk Areas

#### 8. **Source Filter Validation**
**Risk**: Invalid source values not validated
- Current: Direct passthrough of `source` query param
- Expected values: 'guardian', 'governance_sentinel', 'all'

**Mitigation**:
- Add validation in utils or controller
- Return 400 for invalid source values
- Whitelist approach

---

#### 9. **Agent Type Path Param**
**Risk**: SQL injection or invalid agent types
- Current: Direct passthrough from `:agentType`
- No validation against known agent types

**Mitigation**:
- Add agent type whitelist validation
- Sanitize path param in controller
- Consider enum or database lookup

---

#### 10. **Console.log Statements**
**Risk**: Production logging bloat
- Current: Many console.log statements (lines 59, 91, 108, 133, etc.)

**Mitigation**:
- Replace with structured logger
- Use log levels (debug, info, warn, error)
- Consider removing verbose logs in production

---

### Low-Risk Areas

#### 11. **Express Request/Response Types**
**Current**: Using Express types correctly
**Risk**: None (types are stable)

---

#### 12. **Error Response Format**
**Current**: Consistent structure
```typescript
{ success: false, error: "ERROR_CODE", message: "..." }
```
**Risk**: Low (maintain consistency in controller)

---

## Testing Strategy

### Unit Tests

#### Utils Layer (High Priority)
- **dateRangeBuilder.ts**: 15-20 test cases
  - Current month calculation
  - YYYY-MM parsing
  - Leap year February
  - Month boundaries (Jan, Dec)
  - Invalid input handling

- **paginationHelper.ts**: 10-15 test cases
  - Offset calculation
  - Total pages calculation
  - Edge cases (total=0, page=1)
  - Invalid input (page<1, limit<1)

- **statusMapper.ts**: 8-10 test cases
  - PASS → { status: PASS, completed_at: Date }
  - REJECT → { status: REJECT, completed_at: null }
  - IGNORE → { status: null, completed_at: null }
  - Invalid status → throw error

- **recommendationFormatter.ts**: 8-10 test cases
  - Summary row formatting
  - JSON parsing (string vs already parsed)
  - Null value handling
  - Type coercion (string to number)

---

### Integration Tests

#### Model Layer (High Priority)
- **AgentRecommendationModel**: 20-25 test cases
  - `getSummaryWithCounts()` with date filtering
  - `findByAgentWithFilters()` with all filter combinations
  - `updateWithStatusLogic()` with status transitions
  - `markAllAsPassForAgent()` with source filter
  - `deleteByDateRange()` boundary testing
  - `findIdsByAgentAndStatus()` correctness
  - `findByIds()` with column selection

#### Service Layer (High Priority)
- **summaryService.ts**: 8-10 test cases
  - Month filtering
  - Pagination
  - Empty results
  - Date range edge cases

- **recommendationService.ts**: 15-20 test cases
  - Filter combinations
  - Status updates with completed_at
  - Bulk operations
  - Clear month data transaction
  - 404 handling (non-existent IDs)

- **governanceService.ts**: 6-8 test cases
  - ID retrieval by status
  - By-IDs lookup
  - Empty results

---

### E2E Tests

#### API Endpoints (Critical)
Test all 8 endpoints with:
- Happy path (200/201)
- Validation errors (400)
- Not found errors (404)
- Server errors (500 simulation)
- Pagination edge cases
- Filter combinations
- Empty result sets

**Priority Endpoints**:
1. `GET /summary` (most complex query)
2. `PATCH /recommendations/:id` (status logic)
3. `DELETE /clear-month-data` (multi-table delete)

---

## Performance Considerations

### Query Optimization

#### 1. **Summary Query Aggregation**
**Current**: Aggregates per agent_under_test
- Potential N+1 if frontend fetches each agent separately
- Single query good performance

**Recommendation**:
- Add index on `(created_at, agent_under_test)` if not exists
- Consider materialized view for frequently accessed summaries

---

#### 2. **Recommendations Listing**
**Current**: Filters + pagination + JSON parsing
- Query cloning for count may be inefficient for large datasets
- JSON parsing in application layer (not database)

**Recommendation**:
- Add composite index on `(agent_under_test, created_at, source_agent_type, status)`
- Consider cursor-based pagination for very large datasets (>100k rows)
- Profile with EXPLAIN ANALYZE

---

#### 3. **Bulk Operations**
**Current**: No batch size limits
- `mark-all-pass` could update thousands of rows
- `bulk-delete` accepts unbounded array of IDs

**Recommendation**:
- Add batch size limits (e.g., max 1000 IDs per bulk-delete)
- Consider background job for large mark-all-pass operations
- Add progress tracking for async operations

---

### Memory Considerations

#### 1. **JSON Parsing**
**Current**: Parses all recommendations in memory
- For 1000 recs with evidence_links, could be significant

**Recommendation**:
- Stream processing for large result sets (if pagination not sufficient)
- Benchmark with realistic data volumes

---

#### 2. **In-Memory Pagination**
**Current**: `/summary` endpoint loads all agents, then slices in memory (lines 129-131)

**Recommendation**:
- **HIGH PRIORITY**: Move pagination to SQL query
- Current model `getSummaryByAgent()` already supports SQL pagination
- Route handler reimplements in-memory pagination (redundant)
- Remove in-memory slice, use model's pagination

---

## Migration Checklist

### Pre-Migration
- [ ] Review existing tests for route file
- [ ] Document current API contract (request/response schemas)
- [ ] Create feature branch: `refactor/admin-agent-insights-route`
- [ ] Set up test database with realistic data volume

### Phase 1: Models
- [ ] Add 7 new methods to AgentRecommendationModel
- [ ] Add type interfaces to model file
- [ ] Write unit tests for each new model method
- [ ] Verify all tests pass
- [ ] Code review model extensions

### Phase 2: Utils
- [ ] Create dateRangeBuilder.ts + tests
- [ ] Create paginationHelper.ts + tests
- [ ] Create statusMapper.ts + tests
- [ ] Create recommendationFormatter.ts + tests
- [ ] Verify all util tests pass
- [ ] Code review utils

### Phase 3: Services
- [ ] Create summaryService.ts + tests
- [ ] Create recommendationService.ts + tests
- [ ] Create governanceService.ts + tests
- [ ] Verify all service integration tests pass
- [ ] Code review services

### Phase 4: Controller
- [ ] Create AdminAgentInsightsController.ts
- [ ] Write controller tests (with mocked services)
- [ ] Verify all controller tests pass
- [ ] Code review controller

### Phase 5: Routes
- [ ] Refactor adminAgentInsights.ts route file
- [ ] Run full E2E test suite
- [ ] Verify all endpoints return identical responses
- [ ] Performance test (compare before/after)
- [ ] Code review route changes

### Phase 6: Cleanup
- [ ] Remove unused imports from route file
- [ ] Remove console.log statements (or replace with logger)
- [ ] Update API documentation (if changed)
- [ ] Run linter and fix issues
- [ ] Final code review

### Post-Migration
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Monitor error rates and response times
- [ ] Merge to main branch
- [ ] Deploy to production
- [ ] Monitor production metrics for 24-48 hours

---

## Success Metrics

### Code Quality
- [ ] Route file reduced from 697 LOC → ~40-60 LOC (>90% reduction)
- [ ] No direct db() calls in route file
- [ ] All business logic in service layer
- [ ] All database queries in model layer
- [ ] 100% test coverage for utils
- [ ] >90% test coverage for services
- [ ] >85% test coverage for controller

### Functionality
- [ ] All 8 endpoints return identical responses (byte-for-byte comparison)
- [ ] All query filters work correctly
- [ ] All pagination works correctly
- [ ] All status updates work correctly
- [ ] All bulk operations work correctly
- [ ] All error cases handled correctly (400, 404, 500)

### Performance
- [ ] Response times within 5% of baseline (ideally faster)
- [ ] Memory usage stable
- [ ] Database query count unchanged or reduced
- [ ] No N+1 query issues introduced

### Maintainability
- [ ] Clear separation of concerns (route/controller/service/model)
- [ ] Reusable utilities extracted
- [ ] Type-safe interfaces throughout
- [ ] Consistent error handling patterns
- [ ] Documented service layer contracts
- [ ] Easy to add new endpoints (just add controller method + route)

---

## Rollback Plan

### If Critical Issues Found

1. **Revert Commits**
   - Route file changes (Phase 5)
   - Controller creation (Phase 4)
   - Service creation (Phase 3)

2. **Keep Safe Changes**
   - Model extensions (Phase 1) - **KEEP** (backward compatible)
   - Utils (Phase 2) - **KEEP** (unused, no side effects)

3. **Fast Rollback**
   - Git revert merge commit
   - Redeploy previous version
   - Restore route file from `main` branch

### Partial Rollback Strategy
If only specific endpoints have issues:
- Rollback route file to original
- Keep model/service/utils for future use
- Debug specific endpoint offline
- Re-deploy once fixed

---

## Dependencies & Imports

### Route File (After Refactor)
```typescript
import express from "express";
import AdminAgentInsightsController from "../controllers/admin-agent-insights/AdminAgentInsightsController";
```

### Controller File
```typescript
import { Request, Response } from "express";
import * as summaryService from "./feature-services/summaryService";
import * as recommendationService from "./feature-services/recommendationService";
import * as governanceService from "./feature-services/governanceService";
```

### Service Files
```typescript
import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";
import { AgentResultModel } from "../../../models/AgentResultModel";
import * as dateRangeBuilder from "../feature-utils/dateRangeBuilder";
import * as paginationHelper from "../feature-utils/paginationHelper";
import * as statusMapper from "../feature-utils/statusMapper";
import * as recommendationFormatter from "../feature-utils/recommendationFormatter";
```

### Model Files
```typescript
import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";
```

---

## Open Questions

1. **AgentResultModel**: Does it already exist? Need to verify before adding method.

2. **Transaction Support**: Should `clearMonthData` be wrapped in transaction? (Recommended: YES)

3. **Logger**: Replace console.log with structured logger? (Recommended: YES, use existing logger if available)

4. **Validation Library**: Use Zod/Joi for request validation or keep inline? (Recommended: Consider for future, not in this refactor)

5. **Rate Limiting**: Should bulk operations have rate limits? (Recommended: Consider for future)

6. **Caching**: Should summary endpoint be cached? (Recommended: Consider for future, profile first)

7. **Frontend Impact**: Are there frontend clients relying on exact response format? (Assumption: YES, maintain exact format)

---

## Conclusion

This refactor plan transforms a 697-line route file with mixed concerns into a well-structured, maintainable architecture:

- **8 new files** (controller + 3 services + 4 utils)
- **3 modified files** (route + 2 models)
- **~90% LOC reduction** in route file
- **Improved testability** (unit tests for utils, integration tests for services)
- **Type safety** throughout
- **Separation of concerns** (route/controller/service/model/utils)

The phased approach minimizes risk by validating each layer before proceeding. The route file becomes thin and declarative, while business logic lives in testable services backed by type-safe model methods.
