# Clarity Route Refactor Plan

## Current State Analysis

### File Overview
- **File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/clarity.ts`
- **Total LOC**: 337 lines
- **Endpoints**: 5 routes
- **External Dependencies**: Microsoft Clarity REST API
- **Internal Dependencies**:
  - `db` (direct Knex usage)
  - `domainMappings` utility
  - `axios` for HTTP requests
  - `express.Router()`

### Current Endpoints

| Route | Method | LOC Range | Purpose |
|-------|--------|-----------|---------|
| `/diag/projects` | GET | 151-153 | Returns domain mappings diagnostic info |
| `/fetch` | POST | 158-203 | Fetches live insights from Clarity API and stores |
| `/getKeyData` | POST | 209-296 | Returns aggregated KPI metrics with trend analysis |
| `/getAIReadyData` | POST | 302-335 | Returns raw daily data for AI processing |

### Current Helper Functions (Lines 15-147)

| Function | LOC | Category | Purpose |
|----------|-----|----------|---------|
| `fetchClarityLiveInsights` | 19-44 | API Client | Calls Clarity Export API with auth & params |
| `storeClarityData` | 49-65 | Data Access | Direct db() insert/upsert to clarity_data_store |
| `extractMetrics` | 70-83 | Business Logic | Parses Clarity JSON for KPIs |
| `calculateTrendScore` | 88-109 | Business Logic | Calculates weighted trend score from metrics |
| `getMonthRanges` | 116-147 | Utility | Date range calculation for month comparisons |

### Configuration & Constants
- **Lines 8-12**: Global config
  - `CLARITY_API_TOKEN` (env var)
  - `USE_COMPLETE_MONTHS_ONLY` (feature flag)

### Direct Database Calls
1. **Line 54**: `db("clarity_data_store").insert(...).onConflict(...).merge(...)`
2. **Line 218**: `db("clarity_data_store").where(...).andWhereBetween(...)`
3. **Line 311**: `db("clarity_data_store").where(...).andWhereBetween(...)`

### Dependencies Analysis
```typescript
// External
import express from "express";
import axios from "axios";

// Internal - Database
import db from "../database/connection";

// Internal - Utilities
import { domainMappings } from "../utils/domainMappings";
```

---

## Target Architecture

### Folder Structure
```
src/
├── controllers/
│   └── clarity/
│       ├── ClarityController.ts          # Route handlers
│       ├── feature-services/
│       │   ├── service.clarity-api.ts    # External API client
│       │   ├── service.clarity-data.ts   # Data access layer
│       │   └── service.clarity-metrics.ts # Business logic
│       └── feature-utils/
│           ├── util.clarity-date-ranges.ts   # Date range calculations
│           ├── util.clarity-metrics-extraction.ts # Metric parsing
│           └── util.clarity-domain-mapping.ts    # Domain lookup logic
├── models/
│   └── ClarityDataModel.ts               # Already exists - enhanced
├── routes/
│   └── clarity.ts                         # Thin route definitions only
└── utils/
    └── domainMappings.ts                  # Keep as-is (shared)
```

### Layer Responsibilities

#### Routes Layer (`routes/clarity.ts`)
- **Responsibility**: Route registration only
- **No Business Logic**
- **No Database Access**
- **Format**:
  ```typescript
  router.post('/fetch', ClarityController.fetch);
  router.post('/getKeyData', ClarityController.getKeyData);
  ```

#### Controller Layer (`controllers/clarity/ClarityController.ts`)
- **Responsibility**: Request/response handling, orchestration
- **Handles**: Input validation, error formatting, HTTP status codes
- **Calls**: Services for business logic
- **No Direct DB Access**
- **No External API Calls**

#### Service Layer (`controllers/clarity/feature-services/`)
- **service.clarity-api.ts**: External Clarity API client
- **service.clarity-data.ts**: Data access through models
- **service.clarity-metrics.ts**: Business logic (trend calculation, aggregation)

#### Utils Layer (`controllers/clarity/feature-utils/`)
- **Pure functions only**
- **No side effects**
- **No database access**
- **No API calls**

---

## Detailed Migration Mapping

### Route 1: `GET /diag/projects` (Lines 151-153)

**Current Implementation:**
```typescript
clarityRoutes.get("/diag/projects", (_req, res) => {
  return res.json(domainMappings);
});
```

**Target Mapping:**
- **Route**: Call `ClarityController.getDiagProjects`
- **Controller**: `ClarityController.getDiagProjects()` → returns `domainMappings`
- **Service**: None needed (simple data return)
- **Model**: None

**Complexity**: Low
**Risk**: None

---

### Route 2: `POST /fetch` (Lines 158-203)

**Current Implementation Breakdown:**
1. Extract `clientId`, `numOfDays`, `dimensions` from body (160)
2. Validate `clientId` presence (161-163)
3. Validate `numOfDays` range (164-168)
4. Lookup domain mapping (170-175)
5. Log fetch operation (177-179)
6. Call `fetchClarityLiveInsights()` (181-185)
7. Call `storeClarityData()` (187-188)
8. Return success response (190-196)
9. Error handling (197-202)

**Target Mapping:**

| Current Logic | Target Location | Method/Function |
|---------------|-----------------|-----------------|
| Input validation | Controller | `ClarityController.fetch()` |
| Domain lookup | Util | `util.clarity-domain-mapping.findMappingByClientId()` |
| Logging | Controller | Keep in controller |
| API call | Service | `ClarityApiService.fetchLiveInsights()` |
| Data storage | Service | `ClarityDataService.storeData()` |
| Response formatting | Controller | `ClarityController.fetch()` |
| Error handling | Controller | `ClarityController.fetch()` |

**Detailed Breakdown:**

**Controller**: `ClarityController.fetch(req, res)`
```typescript
- Validate req.body (clientId, numOfDays, dimensions)
- Call: findMappingByClientId(clientId) → mapping
- Validate mapping exists
- Log operation
- Call: ClarityApiService.fetchLiveInsights(mapping.clarity_projectId, numOfDays, dimensions)
- Call: ClarityDataService.storeData(mapping.domain, today, rawData)
- Return JSON response
- Catch errors, format 500 response
```

**Service** (`service.clarity-api.ts`): `ClarityApiService.fetchLiveInsights()`
```typescript
- Build headers with CLARITY_API_TOKEN
- Build params object
- Call axios.get(url, { headers, params })
- Return response.data
- Throw on API errors
```

**Service** (`service.clarity-data.ts`): `ClarityDataService.storeData()`
```typescript
- Call: ClarityDataModel.upsert(domain, reportDate, data)
- Return void
```

**Util** (`util.clarity-domain-mapping.ts`): `findMappingByClientId()`
```typescript
- Search domainMappings array by domain or gsc_domainkey
- Return mapping or null
- Pure function
```

**Model**: Use existing `ClarityDataModel.upsert()` (already implemented)

**Complexity**: Medium
**Risk**: Low (straightforward extraction)

---

### Route 3: `POST /getKeyData` (Lines 209-296)

**Current Implementation Breakdown:**
1. Extract `clientId` from body (211)
2. Validate `clientId` presence (212-214)
3. Calculate date ranges via `getMonthRanges()` (216)
4. Query database with date range (218-223)
5. Filter rows into `prevMonth` and `currMonth` buckets (226-247)
6. Define aggregation function `agg()` (249-268)
7. Aggregate both month datasets (270-271)
8. Calculate trend score (273)
9. Return structured JSON (275-289)
10. Error handling (290-295)

**Target Mapping:**

| Current Logic | Target Location | Method/Function |
|---------------|-----------------|-----------------|
| Input validation | Controller | `ClarityController.getKeyData()` |
| Date range calculation | Util | `util.clarity-date-ranges.getMonthRanges()` |
| Database query | Service | `ClarityDataService.getDataByDateRange()` |
| Row filtering by month | Service | `ClarityMetricsService.splitRowsByMonthRanges()` |
| Metric extraction | Util | `util.clarity-metrics-extraction.extractMetrics()` |
| Aggregation logic | Service | `ClarityMetricsService.aggregateMetrics()` |
| Trend calculation | Service | `ClarityMetricsService.calculateTrendScore()` |
| Response formatting | Controller | `ClarityController.getKeyData()` |
| Error handling | Controller | `ClarityController.getKeyData()` |

**Detailed Breakdown:**

**Controller**: `ClarityController.getKeyData(req, res)`
```typescript
- Validate req.body.clientId
- Call: ClarityDataService.getKeyDataForClient(clientId)
- Return JSON response
- Catch errors, format 500 response
```

**Service** (`service.clarity-data.ts`): `ClarityDataService.getKeyDataForClient()`
```typescript
- Call: getMonthRanges() → ranges
- Call: ClarityDataModel.findByDomainAndDateRange(clientId, ranges.prevMonth.start, ranges.currMonth.end)
- Call: ClarityMetricsService.processKeyData(rows, ranges)
- Return result
```

**Service** (`service.clarity-metrics.ts`): `ClarityMetricsService.processKeyData()`
```typescript
- Call: splitRowsByMonthRanges(rows, ranges) → { prevMonthRows, currMonthRows }
- Call: aggregateMetrics(prevMonthRows) → prevMonthData
- Call: aggregateMetrics(currMonthRows) → currMonthData
- Call: calculateTrendScore(currMonthData, prevMonthData) → trendScore
- Return structured object
```

**Service** (`service.clarity-metrics.ts`): `ClarityMetricsService.splitRowsByMonthRanges()`
```typescript
- Filter rows into prevMonth and currMonth buckets based on report_date
- Handle date type (string vs Date object)
- Return { prevMonthRows, currMonthRows }
```

**Service** (`service.clarity-metrics.ts`): `ClarityMetricsService.aggregateMetrics()`
```typescript
- Loop through rows
- For each row: parse JSON data, call extractMetrics()
- Sum sessions, deadClicks
- Collect bounceRates, calculate average
- Return { sessions, deadClicks, bounceRate }
```

**Service** (`service.clarity-metrics.ts`): `ClarityMetricsService.calculateTrendScore()`
```typescript
- Calculate percentage changes for sessions, bounce, deadClicks
- Apply weighted formula
- Return rounded score
```

**Util** (`util.clarity-date-ranges.ts`): `getMonthRanges()`
```typescript
- Read USE_COMPLETE_MONTHS_ONLY config
- Calculate date ranges based on config
- Return { currMonth: { start, end }, prevMonth: { start, end } }
```

**Util** (`util.clarity-metrics-extraction.ts`): `extractMetrics()`
```typescript
- Parse Clarity JSON structure
- Extract Traffic, DeadClickCount, QuickbackClick metrics
- Return { sessions, deadClicks, bounceRate }
```

**Model**: Use existing `ClarityDataModel.findByDomainAndDateRange()` (already implemented)

**Complexity**: High (complex business logic)
**Risk**: Medium (must preserve calculation logic exactly)

---

### Route 4: `POST /getAIReadyData` (Lines 302-335)

**Current Implementation Breakdown:**
1. Extract `clientId` from body (304)
2. Validate `clientId` presence (305-307)
3. Calculate date ranges via `getMonthRanges()` (309)
4. Query database for current month only (311-316)
5. Map rows to daily data format (318-321)
6. Return structured JSON (323-328)
7. Error handling (329-334)

**Target Mapping:**

| Current Logic | Target Location | Method/Function |
|---------------|-----------------|-----------------|
| Input validation | Controller | `ClarityController.getAIReadyData()` |
| Date range calculation | Util | `util.clarity-date-ranges.getMonthRanges()` |
| Database query | Service | `ClarityDataService.getDataByDateRange()` |
| Data transformation | Service | `ClarityDataService.formatForAI()` |
| Response formatting | Controller | `ClarityController.getAIReadyData()` |
| Error handling | Controller | `ClarityController.getAIReadyData()` |

**Detailed Breakdown:**

**Controller**: `ClarityController.getAIReadyData(req, res)`
```typescript
- Validate req.body.clientId
- Call: ClarityDataService.getAIReadyDataForClient(clientId)
- Return JSON response
- Catch errors, format 500 response
```

**Service** (`service.clarity-data.ts`): `ClarityDataService.getAIReadyDataForClient()`
```typescript
- Call: getMonthRanges() → ranges
- Call: ClarityDataModel.findByDomainAndDateRange(clientId, ranges.currMonth.start, ranges.currMonth.end)
- Call: formatForAI(rows, clientId, ranges)
- Return result
```

**Service** (`service.clarity-data.ts`): `ClarityDataService.formatForAI()`
```typescript
- Map rows to { report_date, data } format
- Parse JSON data if needed
- Return structured object with metadata
```

**Util** (`util.clarity-date-ranges.ts`): `getMonthRanges()`
```typescript
- Already defined above
```

**Model**: Use existing `ClarityDataModel.findByDomainAndDateRange()` (already implemented)

**Complexity**: Low
**Risk**: Low

---

## Model Layer Enhancement

### Current Model: `ClarityDataModel`
**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/ClarityDataModel.ts`

**Existing Methods:**
1. `upsert(domain, reportDate, data, trx?)` - Already implemented
2. `findByDomainAndDateRange(domain, startDate, endDate, trx?)` - Already implemented

**Required Enhancements:**
None - existing model methods are sufficient for all routes.

**Assessment**: Model layer is already well-designed for this refactor.

---

## Files to Create

### 1. Controller File
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/ClarityController.ts`

**Methods:**
- `getDiagProjects(req, res)` - Route 1
- `fetch(req, res)` - Route 2
- `getKeyData(req, res)` - Route 3
- `getAIReadyData(req, res)` - Route 4

**Estimated LOC**: ~150 lines

---

### 2. Service: Clarity API Client
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-services/service.clarity-api.ts`

**Class**: `ClarityApiService`

**Methods:**
- `fetchLiveInsights(projectId, numOfDays, dimensions?)` - Extracted from `fetchClarityLiveInsights()`

**Dependencies:**
- `axios`
- `process.env.CLARITY_API_TOKEN`

**Estimated LOC**: ~40 lines

---

### 3. Service: Clarity Data Access
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-services/service.clarity-data.ts`

**Class**: `ClarityDataService`

**Methods:**
- `storeData(domain, reportDate, data)` - Wraps `ClarityDataModel.upsert()`
- `getDataByDateRange(domain, startDate, endDate)` - Wraps `ClarityDataModel.findByDomainAndDateRange()`
- `getKeyDataForClient(clientId)` - Orchestrates Route 3 logic
- `getAIReadyDataForClient(clientId)` - Orchestrates Route 4 logic
- `formatForAI(rows, domain, ranges)` - Formats data for AI endpoint

**Dependencies:**
- `ClarityDataModel`
- `ClarityMetricsService`
- `getMonthRanges` util

**Estimated LOC**: ~80 lines

---

### 4. Service: Clarity Metrics Business Logic
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-services/service.clarity-metrics.ts`

**Class**: `ClarityMetricsService`

**Methods:**
- `processKeyData(rows, ranges)` - Main orchestrator for Route 3
- `splitRowsByMonthRanges(rows, ranges)` - Filters rows by month
- `aggregateMetrics(rows)` - Aggregates metrics across rows
- `calculateTrendScore(currData, prevData)` - Weighted trend calculation

**Dependencies:**
- `extractMetrics` util

**Estimated LOC**: ~100 lines

---

### 5. Util: Date Range Calculations
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-utils/util.clarity-date-ranges.ts`

**Functions:**
- `getMonthRanges()` - Pure function, extracted from current implementation

**Dependencies:**
- `USE_COMPLETE_MONTHS_ONLY` config (needs to be imported or passed as param)

**Estimated LOC**: ~40 lines

---

### 6. Util: Metrics Extraction
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-utils/util.clarity-metrics-extraction.ts`

**Functions:**
- `extractMetrics(data)` - Pure function, extracted from current implementation

**Dependencies**: None

**Estimated LOC**: ~20 lines

---

### 7. Util: Domain Mapping Lookup
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/clarity/feature-utils/util.clarity-domain-mapping.ts`

**Functions:**
- `findMappingByClientId(clientId)` - Search domainMappings
- `validateMapping(mapping)` - Check if clarity_projectId exists

**Dependencies:**
- `domainMappings` (import from `src/utils/domainMappings`)

**Estimated LOC**: ~20 lines

---

## Files to Modify

### 1. Routes File
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/clarity.ts`

**Changes:**
- Remove all helper functions (lines 15-147)
- Remove all handler logic (lines 151-335)
- Import `ClarityController`
- Replace handlers with controller method calls
- Keep router setup and export

**Before LOC**: 337 lines
**After LOC**: ~20 lines

**Example Structure:**
```typescript
import express from "express";
import ClarityController from "../controllers/clarity/ClarityController";

const clarityRoutes = express.Router();

clarityRoutes.get("/diag/projects", ClarityController.getDiagProjects);
clarityRoutes.post("/fetch", ClarityController.fetch);
clarityRoutes.post("/getKeyData", ClarityController.getKeyData);
clarityRoutes.post("/getAIReadyData", ClarityController.getAIReadyData);

export default clarityRoutes;
```

---

### 2. Model File (Optional Enhancement)
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/ClarityDataModel.ts`

**Changes**: None required (model is already well-designed)

**Optional**: Add JSDoc comments for better documentation

---

## Configuration Management

### Current Config (Lines 8-12)
```typescript
const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN!;
const USE_COMPLETE_MONTHS_ONLY = true;
```

### Target Location

**Option A** (Recommended): Environment-based config
- Move to `src/config/clarity.config.ts`
- Import in services/utils as needed
- Allows for easier testing and environment-specific overrides

**Option B**: Keep in-line
- Define in `service.clarity-api.ts` for `CLARITY_API_TOKEN`
- Define in `util.clarity-date-ranges.ts` for `USE_COMPLETE_MONTHS_ONLY`

**Recommendation**: Option A for better configuration management

**New File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/config/clarity.config.ts`
```typescript
export const CLARITY_CONFIG = {
  apiToken: process.env.CLARITY_API_TOKEN!,
  apiBaseUrl: "https://www.clarity.ms/export-data/api/v1",
  useCompleteMonthsOnly: true, // Can be moved to env var later
};
```

---

## Step-by-Step Migration Plan

### Phase 1: Setup Structure (No Code Changes)
1. Create directory structure:
   ```bash
   mkdir -p src/controllers/clarity/feature-services
   mkdir -p src/controllers/clarity/feature-utils
   mkdir -p src/config
   ```
2. Create empty files with TODO comments

**Risk**: None
**Time**: 5 minutes

---

### Phase 2: Extract Pure Utilities (Low Risk)
**Order**: Bottom-up (dependencies first)

1. **Create `util.clarity-metrics-extraction.ts`**
   - Copy `extractMetrics()` function (lines 70-83)
   - Export as named function
   - Add TypeScript types
   - Add unit tests

2. **Create `util.clarity-domain-mapping.ts`**
   - Implement `findMappingByClientId()`
   - Import `domainMappings`
   - Add unit tests

3. **Create `clarity.config.ts`**
   - Extract config constants
   - Export structured config object

4. **Create `util.clarity-date-ranges.ts`**
   - Copy `getMonthRanges()` function (lines 116-147)
   - Import config for `USE_COMPLETE_MONTHS_ONLY`
   - Add unit tests

**Risk**: Low (pure functions, no side effects)
**Time**: 1 hour
**Tests**: Unit tests for each util function

---

### Phase 3: Extract Services (Medium Risk)
**Order**: Data layer → Business logic → API client

1. **Create `service.clarity-api.ts`**
   - Copy `fetchClarityLiveInsights()` (lines 19-44)
   - Wrap in `ClarityApiService` class
   - Import config
   - Add error handling
   - Add integration tests (can mock axios)

2. **Create `service.clarity-data.ts`**
   - Implement `storeData()` - wraps `ClarityDataModel.upsert()`
   - Implement `getDataByDateRange()` - wraps `ClarityDataModel.findByDomainAndDateRange()`
   - Implement `formatForAI()`
   - Add integration tests (can use in-memory test DB)

3. **Create `service.clarity-metrics.ts`**
   - Copy `calculateTrendScore()` (lines 88-109)
   - Implement `aggregateMetrics()` (extracted from lines 249-268)
   - Implement `splitRowsByMonthRanges()` (extracted from lines 226-247)
   - Implement `processKeyData()` orchestrator
   - Add unit tests

**Risk**: Medium (business logic must be preserved exactly)
**Time**: 2-3 hours
**Tests**: Unit + integration tests

---

### Phase 4: Create Controller (Medium Risk)
1. **Create `ClarityController.ts`**
   - Implement `getDiagProjects()`
   - Implement `fetch()`
   - Implement `getKeyData()`
   - Implement `getAIReadyData()`
   - Import all services
   - Add error handling
   - Add request/response type annotations

**Risk**: Medium (orchestration layer)
**Time**: 2 hours
**Tests**: Integration tests (can mock services)

---

### Phase 5: Refactor Routes File (Low Risk)
1. **Modify `routes/clarity.ts`**
   - Remove all helper functions
   - Remove all inline handlers
   - Import `ClarityController`
   - Replace handlers with controller method calls
   - Keep router setup

**Risk**: Low (simple replacement)
**Time**: 30 minutes
**Tests**: Integration tests (full route tests)

---

### Phase 6: Testing & Validation (Critical)
1. **Run full test suite**
   - Unit tests for utils
   - Unit tests for services
   - Integration tests for controller
   - E2E tests for routes

2. **Manual API testing**
   - Test all 4 endpoints with Postman/curl
   - Verify exact response format matches original
   - Test error cases

3. **Compare behavior**
   - Test with production-like data
   - Verify trend calculations match
   - Verify date range logic matches

**Risk**: Critical validation phase
**Time**: 1-2 hours

---

### Phase 7: Cleanup (Low Risk)
1. Remove old commented-out code
2. Remove unused imports
3. Add JSDoc comments
4. Update documentation

**Risk**: Low
**Time**: 30 minutes

---

## Risk Assessment

### High Risks

#### 1. Trend Calculation Logic Preservation
**Risk**: Weighted formula in `calculateTrendScore()` is business-critical. Any deviation breaks KPI reporting.

**Lines**: 88-109
```typescript
const trendScore =
  sessionsChange * 0.4 + -bounceChange * 0.35 + -deadClickChange * 0.25;
```

**Mitigation**:
- Extract function exactly as-is
- Add comprehensive unit tests with known inputs/outputs
- Test with production data before deployment
- Document formula with business context

---

#### 2. Date Range Logic Complexity
**Risk**: Date range calculation has two modes (`USE_COMPLETE_MONTHS_ONLY`). Off-by-one errors could corrupt historical comparisons.

**Lines**: 116-147

**Mitigation**:
- Extract function exactly as-is
- Add unit tests for both modes
- Test with fixed dates (avoid timezone issues)
- Add comments explaining modes

---

#### 3. Metric Extraction from Clarity JSON
**Risk**: Clarity API response structure is external. Field paths must be exact.

**Lines**: 70-83
```typescript
const findMetric = (name: string) =>
  data.find((m) => m.metricName === name)?.information?.[0] || {};
```

**Mitigation**:
- Extract function exactly as-is
- Add tests with real Clarity API response samples
- Document expected JSON structure
- Add error handling for malformed responses

---

### Medium Risks

#### 4. Database Query Date Filtering
**Risk**: Date filtering logic (lines 226-247) handles both string and Date types. Must preserve this flexibility.

**Mitigation**:
- Keep type handling in service layer
- Add tests for both date formats
- Document why both types exist

---

#### 5. Environment Variable Dependencies
**Risk**: `CLARITY_API_TOKEN` is required. Missing env var breaks all routes.

**Mitigation**:
- Add validation on service initialization
- Fail fast with clear error message
- Document required env vars

---

### Low Risks

#### 6. Domain Mapping Lookup
**Risk**: Domain lookup logic is simple. Low risk of breaking.

**Mitigation**:
- Add tests with known domains
- Test both `domain` and `gsc_domainkey` lookup paths

---

#### 7. Response Format Changes
**Risk**: Frontend depends on exact response structure. Field name changes break UI.

**Mitigation**:
- Preserve exact response structure
- Add integration tests that assert response shape
- Use TypeScript interfaces to enforce shape

---

## Database Model Replacement Summary

### Before (Direct Knex Calls)

| Route | Current Database Call | Lines |
|-------|----------------------|-------|
| `/fetch` | `db("clarity_data_store").insert(...).onConflict(...).merge(...)` | 54-64 |
| `/getKeyData` | `db("clarity_data_store").where(...).andWhereBetween(...)` | 218-223 |
| `/getAIReadyData` | `db("clarity_data_store").where(...).andWhereBetween(...)` | 311-316 |

### After (Model Methods)

| Route | New Model Call | Method Location |
|-------|---------------|-----------------|
| `/fetch` | `ClarityDataModel.upsert(domain, reportDate, data)` | Already exists |
| `/getKeyData` | `ClarityDataModel.findByDomainAndDateRange(domain, start, end)` | Already exists |
| `/getAIReadyData` | `ClarityDataModel.findByDomainAndDateRange(domain, start, end)` | Already exists |

**Assessment**: Model layer is already complete. No new model methods needed.

---

## Testing Strategy

### Unit Tests (Required)

#### Utils
- `util.clarity-metrics-extraction.extractMetrics()`
  - Test with sample Clarity JSON
  - Test with missing fields
  - Test with malformed data

- `util.clarity-domain-mapping.findMappingByClientId()`
  - Test with valid domain
  - Test with valid gsc_domainkey
  - Test with invalid clientId

- `util.clarity-date-ranges.getMonthRanges()`
  - Test with `USE_COMPLETE_MONTHS_ONLY = true`
  - Test with `USE_COMPLETE_MONTHS_ONLY = false`
  - Test at month boundaries (edge cases)

#### Services
- `ClarityMetricsService.calculateTrendScore()`
  - Test with known values
  - Test with zero denominators
  - Test with negative changes

- `ClarityMetricsService.aggregateMetrics()`
  - Test with multiple rows
  - Test with empty rows
  - Test with zero bounce rates

- `ClarityMetricsService.splitRowsByMonthRanges()`
  - Test with rows spanning both months
  - Test with string dates
  - Test with Date objects

---

### Integration Tests (Required)

#### Services
- `ClarityApiService.fetchLiveInsights()`
  - Mock axios
  - Test successful response
  - Test API errors (401, 429, 500)
  - Test network timeout

- `ClarityDataService.storeData()`
  - Use test database
  - Test upsert on new record
  - Test upsert on existing record
  - Test conflict resolution

- `ClarityDataService.getKeyDataForClient()`
  - Use test database with sample data
  - Test with valid clientId
  - Test with invalid clientId
  - Verify calculation results

---

### E2E Tests (Required)

#### Routes
- `GET /diag/projects`
  - Test returns domainMappings

- `POST /fetch`
  - Mock Clarity API
  - Test successful fetch and storage
  - Test missing clientId
  - Test invalid numOfDays
  - Test missing mapping

- `POST /getKeyData`
  - Seed test database
  - Test successful calculation
  - Test missing clientId
  - Verify response structure

- `POST /getAIReadyData`
  - Seed test database
  - Test successful data return
  - Test missing clientId
  - Verify response structure

---

## Rollback Plan

### If Issues Arise During Refactor

1. **Revert commit**: `git revert <commit-hash>`
2. **Restore original route file**: `git checkout <previous-commit> -- src/routes/clarity.ts`
3. **Remove new files**: Delete controller/services/utils directories
4. **Restart services**: Ensure original code is deployed

### Backup Strategy

1. Create feature branch: `feature/clarity-refactor`
2. Keep original file as `clarity.ts.backup` until validation complete
3. Do NOT delete original until:
   - All tests pass
   - Manual testing complete
   - Production deployment verified

---

## Definition of Done

### Code Completion
- [ ] All 7 new files created
- [ ] `routes/clarity.ts` refactored to <25 LOC
- [ ] All helper functions extracted to services/utils
- [ ] All direct `db()` calls replaced with model methods
- [ ] TypeScript types added to all functions
- [ ] JSDoc comments added to public methods

### Testing
- [ ] Unit tests written for all utils (>90% coverage)
- [ ] Unit tests written for all services (>90% coverage)
- [ ] Integration tests written for controller
- [ ] E2E tests written for all routes
- [ ] All tests passing
- [ ] Manual API testing completed

### Validation
- [ ] Response formats match original exactly
- [ ] Trend calculations produce identical results
- [ ] Date range logic behaves identically
- [ ] Error handling preserved
- [ ] Logging preserved

### Documentation
- [ ] Architecture diagram updated
- [ ] API documentation updated (if exists)
- [ ] README updated with new structure
- [ ] Migration notes documented

### Deployment
- [ ] Code reviewed by peer
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Monitoring alerts configured
- [ ] Rollback plan tested

---

## Estimated Effort

| Phase | Time | Risk |
|-------|------|------|
| Phase 1: Setup | 0.5h | None |
| Phase 2: Extract utils | 1h | Low |
| Phase 3: Extract services | 3h | Medium |
| Phase 4: Create controller | 2h | Medium |
| Phase 5: Refactor routes | 0.5h | Low |
| Phase 6: Testing & validation | 2h | Critical |
| Phase 7: Cleanup | 0.5h | Low |
| **Total** | **9-10 hours** | **Medium** |

---

## Success Metrics

### Code Quality
- **LOC Reduction**: `routes/clarity.ts` from 337 → ~20 lines (94% reduction)
- **Separation of Concerns**: 1 file → 8 files (proper layering)
- **Test Coverage**: 0% → >90% for business logic
- **Maintainability**: Isolated concerns, easier to modify

### Functional Parity
- **API Behavior**: 100% identical to original
- **Response Format**: 100% identical to original
- **Calculation Results**: 100% identical to original
- **Error Handling**: 100% preserved

### Architecture Alignment
- **Pattern Consistency**: Matches target architecture
- **Model Usage**: 100% database access through models
- **Layer Boundaries**: No violations (routes → controller → service → model)
- **Reusability**: Services/utils can be used by other features

---

## Open Questions

### 1. Configuration Management
**Question**: Should `USE_COMPLETE_MONTHS_ONLY` become an environment variable for runtime configuration?

**Current**: Hardcoded `true`
**Recommendation**: Keep hardcoded for now, but document as potential feature flag

---

### 2. API Token per Project
**Question**: `domainMappings` includes per-project `clarity_apiToken`. Should we use these instead of global `CLARITY_API_TOKEN`?

**Current**: Global token from env var
**Observation**: `domainMappings` has project-specific tokens
**Recommendation**: Investigate if global token has access to all projects. If not, need to use per-project tokens.

---

### 3. Error Response Standardization
**Question**: Should error responses follow a standard format across all routes?

**Current**: Inconsistent error messages
**Recommendation**: Standardize in controller layer (out of scope for this refactor, but note for future)

---

### 4. Logging Strategy
**Question**: Should we use a structured logger instead of `console.log`/`console.error`?

**Current**: Console logging with emoji prefixes
**Recommendation**: Out of scope for this refactor, but note for future improvement

---

## Notes for Implementation

### Critical Preservation Points
1. **DO NOT** change the trend score formula
2. **DO NOT** change date range calculation logic
3. **DO NOT** change metric extraction field paths
4. **DO NOT** change response structure
5. **DO NOT** change error status codes

### Testing First Approach
1. Write tests for current behavior BEFORE refactoring
2. Use tests to validate new implementation
3. Compare outputs side-by-side during development

### Gradual Migration Option
If risk tolerance is low, consider:
1. Create new controller/services alongside old routes
2. Add feature flag to toggle between old/new implementation
3. Deploy with flag OFF
4. Test in production with flag ON for small percentage
5. Gradually increase percentage
6. Remove old code after validation

**Trade-off**: More complex, but safer for critical systems

---

## Appendix: Type Definitions

### Request/Response Types

```typescript
// Request bodies
interface FetchRequest {
  clientId: string;
  numOfDays?: 1 | 2 | 3;
  dimensions?: string[];
}

interface GetKeyDataRequest {
  clientId: string;
}

interface GetAIReadyDataRequest {
  clientId: string;
}

// Response types
interface FetchResponse {
  success: boolean;
  domain: string;
  report_date: string;
  data: any; // Clarity API response
  message: string;
}

interface GetKeyDataResponse {
  sessions: {
    prevMonth: number;
    currMonth: number;
  };
  bounceRate: {
    prevMonth: number;
    currMonth: number;
  };
  deadClicks: {
    prevMonth: number;
    currMonth: number;
  };
  trendScore: number;
}

interface GetAIReadyDataResponse {
  success: boolean;
  domain: string;
  month: string;
  days: Array<{
    report_date: string | Date;
    data: any;
  }>;
}
```

### Internal Types

```typescript
interface ClarityMetrics {
  sessions: number;
  deadClicks: number;
  bounceRate: number; // 0-1 range
}

interface DateRanges {
  currMonth: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
  prevMonth: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
}

interface DomainMapping {
  displayName: string;
  domain: string;
  gsc_domainkey: string;
  ga4_propertyId: string;
  gbp_accountId: string;
  gbp_locationId: string | string[];
  clarity_projectId: string;
  clarity_apiToken?: string;
  completed: boolean;
}
```

---

## End of Plan

This refactor plan provides a complete blueprint for migrating the Clarity route from a monolithic structure to a clean, layered architecture following the target pattern. The plan prioritizes:

1. **Safety**: Comprehensive testing and validation
2. **Clarity**: Detailed mapping of every function
3. **Maintainability**: Proper separation of concerns
4. **Risk Management**: Identified risks with mitigations

The refactor can be executed in phases with clear checkpoints, allowing for incremental validation and rollback if needed.
