# GSC Route Refactor Plan

## 1. Current State

### Overview
- **File Location**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/gsc.ts`
- **Lines of Code**: 363 LOC
- **Endpoints**: 4
  - `POST /api/gsc/getKeyData` - Fetch current & previous month GSC metrics with trend score
  - `POST /api/gsc/getAIReadyData` - Comprehensive GSC data for AI analysis (queries, pages, devices, geo, opportunities)
  - `GET /api/gsc/diag/sites` - Diagnostic endpoint listing sites with permissions
  - `GET /api/gsc/sites/get` - Get available site URLs
- **Exported Function**: `getGSCAIReadyData()` - Direct programmatic access (bypasses HTTP, used by other modules)

### Current Architecture
- Route file contains all logic: Google API calls, data processing, calculations, error handling
- No database access (pure Google API proxy)
- 6 helper functions embedded in route file:
  1. `createSearchConsoleClient()` (lines 14-19) - OAuth2 client factory
  2. `handleError()` (lines 22-30) - Error handling
  3. `getDateRanges()` (lines 33-58) - Date range calculation
  4. `fetchGSCData()` (lines 61-94) - Google Search Console API wrapper
  5. `processDeviceData()` (lines 97-110) - Device data transformation
  6. `calculateOpportunities()` (lines 113-145) - Business logic for opportunity detection
  7. `calculateTrendScore()` (lines 148-175) - Weighted trend calculation
- Middleware: `tokenRefreshMiddleware` (applied globally to all routes)

### Dependencies
- `express` - Router
- `googleapis` - Google Search Console API client
- `../middleware/tokenRefresh` - OAuth2 token management and refresh
- **No model usage** - Direct Google API integration
- **No database operations** - Pure API proxy

### Current API Operations

#### 1. `POST /getKeyData` (lines 177-228)
- Accepts: `domainProperty` (required)
- Returns: Impressions, avgPosition, clicks (current & previous month), trendScore
- Logic flow:
  1. Validate domainProperty presence
  2. Create Search Console client
  3. Calculate date ranges (current & previous month)
  4. Parallel fetch GSC data for both months
  5. Calculate weighted trend score
  6. Return comparison metrics

#### 2. `POST /getAIReadyData` (lines 303-329)
- Accepts: `domainProperty` (required), `startDate` (optional), `endDate` (optional)
- Returns: Comprehensive AI-ready dataset
- Delegates to `getGSCAIReadyData()` function
- Logic flow:
  1. Validate domainProperty
  2. Determine date range (default: current month)
  3. Call exported function
  4. Return AI-structured data

#### 3. Exported Function `getGSCAIReadyData()` (lines 231-301)
- Direct programmatic access (bypasses Express)
- Accepts: `oauth2Client`, `domainProperty`, `startDate?`, `endDate?`
- Returns: Structured AI-ready data object
- Logic flow:
  1. Create Search Console client
  2. Parallel fetch 5 data types:
     - Overview (aggregated)
     - Top 25 queries
     - Top 50 pages
     - Device breakdown
     - Top 10 countries
  3. Process and structure for AI consumption
  4. Calculate opportunities (low CTR queries, ranking opportunities)
  5. Return comprehensive dataset

#### 4. `GET /diag/sites` (lines 332-347)
- No parameters (uses authenticated user from middleware)
- Returns: Array of sites with `siteUrl` and `permissionLevel`
- Logic: Direct pass-through to Google API

#### 5. `GET /sites/get` (lines 349-361)
- No parameters (uses authenticated user from middleware)
- Returns: Array of site URL strings
- Logic: Extract and filter siteUrl values from Google API response

### Business Logic Present
- **Date Range Calculation** (lines 33-58):
  - Current month: Previous month relative to now
  - Previous month: Two months before now
  - ISO date formatting
- **Weighted Trend Score** (lines 148-175):
  - Clicks: 40% weight
  - Impressions: 35% weight
  - Position: 25% weight (inverted, lower is better)
  - Handles division by zero
  - Rounds to 2 decimal places
- **Opportunity Detection** (lines 113-145):
  - Low CTR queries: >100 impressions, <2% CTR, top 5
  - Ranking opportunities: Position 4-10, >10 clicks, top 5
- **Device Data Processing** (lines 97-110):
  - Transform array to keyed object structure
  - Preserve clicks, impressions, CTR, position
- **GSC Data Fetching** (lines 61-94):
  - Configurable dimensions and row limits
  - Handles aggregated (no dimensions) vs dimensional queries
  - Structured response normalization
- **Error Handling** (lines 22-30):
  - Logs error details (response data, message, raw error)
  - Returns 500 with generic message

### External API Integration
- **Google Search Console API**:
  - `searchanalytics.query()` - Core data fetching
  - `sites.list()` - Site enumeration
- **Authentication**: OAuth2 via `req.oauth2Client` (injected by middleware)
- **Token Management**: Handled by `tokenRefreshMiddleware`

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── gsc.ts                                    # Route definitions only (20-30 LOC)
├── controllers/
│   └── gsc/
│       ├── GscController.ts                      # Main controller (100-120 LOC)
│       ├── feature-services/
│       │   ├── service.search-console-api.ts     # Google API client wrapper (80-100 LOC)
│       │   ├── service.key-metrics.ts            # Key data orchestration (40-50 LOC)
│       │   ├── service.ai-ready-data.ts          # AI data orchestration (60-80 LOC)
│       │   └── service.sites.ts                  # Site listing logic (30-40 LOC)
│       └── feature-utils/
│           ├── util.date-ranges.ts               # Date range calculation (30-40 LOC)
│           ├── util.trend-score.ts               # Trend score calculation (30-40 LOC)
│           ├── util.opportunities.ts             # Opportunity detection (40-50 LOC)
│           ├── util.device-data.ts               # Device data transformation (20-30 LOC)
│           ├── util.validation.ts                # Input validation (20-30 LOC)
│           └── util.error-handler.ts             # Error handling utilities (20-30 LOC)
└── (no models - pure API proxy)
```

### Layer Responsibilities

#### **routes/gsc.ts** (20-30 LOC)
- Route definitions only
- Middleware attachment (`tokenRefreshMiddleware`)
- Controller function delegation
- No logic, no validation, no error handling
- Export route

#### **controllers/gsc/GscController.ts** (100-120 LOC)
- Request extraction (`req.body`, `req.oauth2Client`)
- Call validation utils
- Call service layer
- Error handling wrapper (try/catch)
- Response formatting
- No business logic
- No direct API calls
- Controller methods:
  - `getKeyData(req, res)`
  - `getAIReadyData(req, res)`
  - `getDiagSites(req, res)`
  - `getSites(req, res)`

#### **feature-services/service.search-console-api.ts** (80-100 LOC)
- Google Search Console API client management
- Core API interaction layer
- OAuth2 client integration
- Exported functions:
  - `createSearchConsoleClient(oauth2Client)` - Client factory
  - `fetchGSCData(client, domainProperty, startDate, endDate, dimensions?, rowLimit?)` - Generic data fetcher
  - `fetchSitesList(client)` - Sites enumeration
- Returns raw API responses (minimal transformation)
- Throws errors on API failures
- No req/res objects
- No business logic

#### **feature-services/service.key-metrics.ts** (40-50 LOC)
- Orchestrates key data endpoint logic
- Calls search-console-api service
- Calls date-ranges and trend-score utils
- Exported function:
  - `getKeyMetrics(oauth2Client, domainProperty)`
- Returns structured comparison data
- No req/res objects
- No direct API calls

#### **feature-services/service.ai-ready-data.ts** (60-80 LOC)
- Orchestrates AI-ready data endpoint logic
- Calls search-console-api service
- Calls opportunity detection utils
- Calls device data utils
- Exported function:
  - `getGSCAIReadyData(oauth2Client, domainProperty, startDate?, endDate?)` (replaces current exported function)
- Returns comprehensive AI-structured dataset
- No req/res objects
- No direct API calls

#### **feature-services/service.sites.ts** (30-40 LOC)
- Site listing business logic
- Calls search-console-api service
- Exported functions:
  - `getSitesWithPermissions(oauth2Client)` - Full site objects
  - `getSiteUrls(oauth2Client)` - URL strings only
- Data transformation from API response
- No req/res objects

#### **feature-utils/util.date-ranges.ts** (30-40 LOC)
- Pure date calculation functions
- Exported function:
  - `getDateRanges()` - Returns current & previous month ranges
- ISO date formatting
- No dependencies
- Fully testable

#### **feature-utils/util.trend-score.ts** (30-40 LOC)
- Pure calculation function
- Exported function:
  - `calculateTrendScore(currentData, previousData)` - Returns weighted score
- Handles division by zero
- No side effects
- Fully testable

#### **feature-utils/util.opportunities.ts** (40-50 LOC)
- Pure business logic for opportunity detection
- Exported function:
  - `calculateOpportunities(queryRows, pageRows)` - Returns opportunity array
- Configurable thresholds (constants at top)
- No side effects
- Fully testable

#### **feature-utils/util.device-data.ts** (20-30 LOC)
- Pure transformation function
- Exported function:
  - `processDeviceData(deviceRows)` - Returns keyed object
- No side effects
- Fully testable

#### **feature-utils/util.validation.ts** (20-30 LOC)
- Input validation functions
- Exported functions:
  - `validateDomainProperty(domainProperty)` - Throws error if invalid
  - `validateOAuth2Client(oauth2Client)` - Throws error if missing
- Throws errors with specific messages
- Pure functions

#### **feature-utils/util.error-handler.ts** (20-30 LOC)
- Error handling utilities
- Exported functions:
  - `logGscError(error, operation)` - Structured error logging
  - `createErrorResponse(operation)` - Returns error object
- No Express response handling (moved to controller)
- Reusable across services

---

## 3. Endpoint → Controller → Service → Util Mapping

### Endpoint 1: `POST /getKeyData`

**Route** (`routes/gsc.ts`):
```
router.post("/getKeyData", GscController.getKeyData)
```

**Controller** (`controllers/gsc/GscController.ts`):
- Extract `domainProperty` from `req.body`
- Extract `oauth2Client` from `req.oauth2Client`
- Call `validateDomainProperty()` util
- Call `validateOAuth2Client()` util
- Call `getKeyMetrics()` service
- Return JSON response
- Catch errors, log, return error response

**Service** (`feature-services/service.key-metrics.ts`):
- Call `getDateRanges()` util
- Call `fetchGSCData()` (search-console-api) twice (parallel) for current & previous month
- Call `calculateTrendScore()` util with both datasets
- Return structured comparison object

**Utils Used**:
- `util.validation.ts` - Input validation
- `util.date-ranges.ts` - Date calculation
- `util.trend-score.ts` - Trend calculation
- `service.search-console-api.ts` - API calls
- `util.error-handler.ts` - Error logging

---

### Endpoint 2: `POST /getAIReadyData`

**Route** (`routes/gsc.ts`):
```
router.post("/getAIReadyData", GscController.getAIReadyData)
```

**Controller** (`controllers/gsc/GscController.ts`):
- Extract `domainProperty`, `startDate`, `endDate` from `req.body`
- Extract `oauth2Client` from `req.oauth2Client`
- Call `validateDomainProperty()` util
- Call `validateOAuth2Client()` util
- Call `getGSCAIReadyData()` service with params
- Return JSON response
- Catch errors, log, return error response

**Service** (`feature-services/service.ai-ready-data.ts`):
- Call `getDateRanges()` util (if dates not provided)
- Call `fetchGSCData()` (search-console-api) 5 times in parallel:
  - Overview (no dimensions)
  - Queries (dimension: "query", limit: 25)
  - Pages (dimension: "page", limit: 50)
  - Devices (dimension: "device")
  - Countries (dimension: "country", limit: 10)
- Call `processDeviceData()` util
- Call `calculateOpportunities()` util
- Return structured AI-ready object

**Utils Used**:
- `util.validation.ts` - Input validation
- `util.date-ranges.ts` - Date calculation
- `util.device-data.ts` - Device transformation
- `util.opportunities.ts` - Opportunity detection
- `service.search-console-api.ts` - API calls
- `util.error-handler.ts` - Error logging

---

### Endpoint 3: `GET /diag/sites`

**Route** (`routes/gsc.ts`):
```
router.get("/diag/sites", GscController.getDiagSites)
```

**Controller** (`controllers/gsc/GscController.ts`):
- Extract `oauth2Client` from `req.oauth2Client`
- Call `validateOAuth2Client()` util
- Call `getSitesWithPermissions()` service
- Return JSON response: `{ sites: [...] }`
- Catch errors, log, return error response

**Service** (`feature-services/service.sites.ts`):
- Call `fetchSitesList()` (search-console-api)
- Map response to `{ siteUrl, permissionLevel }[]`
- Return array

**Utils Used**:
- `util.validation.ts` - OAuth2 validation
- `service.search-console-api.ts` - API calls
- `util.error-handler.ts` - Error logging

---

### Endpoint 4: `GET /sites/get`

**Route** (`routes/gsc.ts`):
```
router.get("/sites/get", GscController.getSites)
```

**Controller** (`controllers/gsc/GscController.ts`):
- Extract `oauth2Client` from `req.oauth2Client`
- Call `validateOAuth2Client()` util
- Call `getSiteUrls()` service
- Return JSON response (array of strings)
- Catch errors, log, return error response

**Service** (`feature-services/service.sites.ts`):
- Call `fetchSitesList()` (search-console-api)
- Map response to string array (siteUrl only)
- Filter out null/undefined
- Return array

**Utils Used**:
- `util.validation.ts` - OAuth2 validation
- `service.search-console-api.ts` - API calls
- `util.error-handler.ts` - Error logging

---

### Exported Function: `getGSCAIReadyData()`

**Current State**:
- Exported directly from route file (lines 231-301)
- Used by other modules for programmatic access

**Target State**:
- Re-export from `feature-services/service.ai-ready-data.ts`
- Implementation moved to service layer
- Route file imports and re-exports:
  ```typescript
  export { getGSCAIReadyData } from "../controllers/gsc/feature-services/service.ai-ready-data";
  ```

---

## 4. Step-by-Step Migration Plan

### Phase 1: Create Utilities (No Dependencies)

**Step 1.1**: Create `util.date-ranges.ts`
- Extract `getDateRanges()` function (lines 33-58)
- Make pure function (no external dependencies)
- Export as default

**Step 1.2**: Create `util.trend-score.ts`
- Extract `calculateTrendScore()` function (lines 148-175)
- Make pure function
- Export as default

**Step 1.3**: Create `util.opportunities.ts`
- Extract `calculateOpportunities()` function (lines 113-145)
- Define threshold constants at top
- Make pure function
- Export as default

**Step 1.4**: Create `util.device-data.ts`
- Extract `processDeviceData()` function (lines 97-110)
- Make pure function
- Export as default

**Step 1.5**: Create `util.validation.ts`
- Create `validateDomainProperty()` function
- Create `validateOAuth2Client()` function
- Throw errors with specific messages
- Export both

**Step 1.6**: Create `util.error-handler.ts`
- Extract `handleError()` logic (lines 22-30)
- Split into `logGscError()` and `createErrorResponse()`
- Remove Express response handling
- Export both

---

### Phase 2: Create API Service Layer

**Step 2.1**: Create `service.search-console-api.ts`
- Extract `createSearchConsoleClient()` function (lines 14-19)
- Extract `fetchGSCData()` function (lines 61-94)
- Create `fetchSitesList()` function (from lines 335, 352)
- Import `googleapis`
- Export all three functions

---

### Phase 3: Create Business Logic Services

**Step 3.1**: Create `service.key-metrics.ts`
- Import date-ranges, trend-score utils
- Import search-console-api service
- Implement `getKeyMetrics(oauth2Client, domainProperty)` function
- Extract logic from lines 188-224
- Export function

**Step 3.2**: Create `service.ai-ready-data.ts`
- Import date-ranges, device-data, opportunities utils
- Import search-console-api service
- Implement `getGSCAIReadyData()` function
- Extract logic from lines 236-301
- Export function

**Step 3.3**: Create `service.sites.ts`
- Import search-console-api service
- Implement `getSitesWithPermissions()` function (from lines 334-343)
- Implement `getSiteUrls()` function (from lines 351-357)
- Export both functions

---

### Phase 4: Create Controller

**Step 4.1**: Create `GscController.ts`
- Import Express types
- Import all validation utils
- Import all services
- Import error-handler util
- Implement controller methods:
  - `getKeyData(req: AuthenticatedRequest, res: Response)`
  - `getAIReadyData(req: AuthenticatedRequest, res: Response)`
  - `getDiagSites(req: AuthenticatedRequest, res: Response)`
  - `getSites(req: AuthenticatedRequest, res: Response)`
- Export all methods as named exports

---

### Phase 5: Update Route File

**Step 5.1**: Refactor `routes/gsc.ts`
- Remove all helper functions
- Remove all embedded logic
- Import `GscController`
- Update route definitions to call controller methods
- Re-export `getGSCAIReadyData` from service layer
- Maintain middleware chain
- Keep exports

**Before** (363 LOC):
```typescript
gscRoutes.post("/getKeyData", async (req, res) => { /* 50 lines */ });
```

**After** (20-30 LOC):
```typescript
gscRoutes.post("/getKeyData", GscController.getKeyData);
```

---

### Phase 6: Update Dependent Modules

**Step 6.1**: Find and update imports
- Search for imports of `getGSCAIReadyData` from route file
- Update import paths to service layer
- Verify functionality unchanged

**Step 6.2**: Test integration
- Ensure middleware still applied correctly
- Verify OAuth2 client injection works
- Test all endpoints

---

## 5. Files to Create

### Controllers
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/GscController.ts` (100-120 LOC)

### Services
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-services/service.search-console-api.ts` (80-100 LOC)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-services/service.key-metrics.ts` (40-50 LOC)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-services/service.ai-ready-data.ts` (60-80 LOC)
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-services/service.sites.ts` (30-40 LOC)

### Utils
6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.date-ranges.ts` (30-40 LOC)
7. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.trend-score.ts` (30-40 LOC)
8. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.opportunities.ts` (40-50 LOC)
9. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.device-data.ts` (20-30 LOC)
10. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.validation.ts` (20-30 LOC)
11. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/gsc/feature-utils/util.error-handler.ts` (20-30 LOC)

**Total New Files**: 11
**Total New LOC**: ~470-590 LOC

---

## 6. Files to Modify

1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/gsc.ts`
   - **Current**: 363 LOC with all logic embedded
   - **Target**: 20-30 LOC with route definitions only
   - **Reduction**: ~333 LOC removed (extracted to controllers/services/utils)

2. **File importing `getGSCAIReadyData`**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/services/dataAggregator.ts`
   - **Current import**: `import { getGSCAIReadyData } from "../routes/gsc";`
   - **New import**: `import { getGSCAIReadyData } from "../controllers/gsc/feature-services/service.ai-ready-data";`
   - Update import path from route to service layer
   - No functionality changes
   - Test dataAggregator service after refactor

---

## 7. Risk Assessment

### Risk Level: **LOW-MEDIUM**

### Why Low-Medium?
- No database operations (pure API proxy)
- No authentication/authorization logic changes (middleware unchanged)
- No external dependencies added (only reorganization)
- Clear layer boundaries
- No data model changes
- Exported function can be re-exported maintaining backward compatibility

### Specific Risks

#### Risk 1: Broken Imports of `getGSCAIReadyData()`
**Severity**: Medium
**Likelihood**: Medium
**Impact**: Other modules calling this function will break

**Mitigation**:
1. Search codebase for all imports: `grep -r "getGSCAIReadyData" --include="*.ts"`
2. Update import paths before removing from route file
3. Add deprecation notice if re-exporting from route file temporarily
4. Test all dependent modules

#### Risk 2: Middleware Chain Disruption
**Severity**: Medium
**Likelihood**: Low
**Impact**: OAuth2 client not injected, authentication failures

**Mitigation**:
1. Keep `tokenRefreshMiddleware` application unchanged
2. Test `req.oauth2Client` injection in controller
3. Add validation for OAuth2 client in controller methods
4. Verify middleware order preserved

#### Risk 3: Error Response Format Changes
**Severity**: Low
**Likelihood**: Low
**Impact**: Frontend expecting specific error shape breaks

**Mitigation**:
1. Document current error response format
2. Preserve exact error response structure in controller
3. Test error handling for each endpoint
4. Keep `handleError` logic semantically identical

#### Risk 4: Date Range Calculation Edge Cases
**Severity**: Low
**Likelihood**: Low
**Impact**: Incorrect date ranges returned

**Mitigation**:
1. Extract `getDateRanges()` function as-is (no changes)
2. Add unit tests for edge cases (month boundaries, year boundaries)
3. Test with current date and future dates
4. Document timezone assumptions

#### Risk 5: Parallel Fetch Logic Regression
**Severity**: Medium
**Likelihood**: Low
**Impact**: Performance degradation, sequential API calls instead of parallel

**Mitigation**:
1. Preserve `Promise.all()` usage in services
2. Test response times before and after refactor
3. Add performance logging to service layer
4. Monitor API call patterns in production

#### Risk 6: OAuth2 Client Scope Issues
**Severity**: Low
**Likelihood**: Low
**Impact**: Google API permissions errors

**Mitigation**:
1. OAuth2 client creation logic unchanged
2. No changes to authentication flow
3. Test with multiple user accounts
4. Verify scope inheritance from middleware

---

## 8. Testing Strategy

### Unit Tests (New)

**Utils** (High Priority):
- `util.date-ranges.ts`:
  - Test current month calculation
  - Test previous month calculation
  - Test month/year boundaries (Dec → Jan)
  - Test leap years
- `util.trend-score.ts`:
  - Test positive trends
  - Test negative trends
  - Test division by zero handling
  - Test weight distribution (40/35/25)
  - Test position inversion logic
- `util.opportunities.ts`:
  - Test low CTR query detection
  - Test ranking opportunity detection
  - Test threshold filtering
  - Test empty input handling
- `util.device-data.ts`:
  - Test array → object transformation
  - Test null/undefined handling
  - Test key extraction
- `util.validation.ts`:
  - Test domain property validation (null, undefined, empty string)
  - Test OAuth2 client validation

**Services** (Medium Priority):
- Mock Google API responses
- Test service orchestration logic
- Test data transformation
- Test error propagation

### Integration Tests

**Endpoints** (High Priority):
1. `POST /getKeyData`:
   - Test successful response with valid domain
   - Test error handling with missing domain
   - Test OAuth2 failure handling
   - Test trend score calculation accuracy
2. `POST /getAIReadyData`:
   - Test successful response with valid domain
   - Test date range defaults
   - Test custom date ranges
   - Test opportunity detection
   - Test device data processing
3. `GET /diag/sites`:
   - Test successful site listing
   - Test permission level inclusion
4. `GET /sites/get`:
   - Test successful site URL extraction
   - Test empty site list handling

**Exported Function**:
- Test `getGSCAIReadyData()` direct invocation
- Test backward compatibility with existing callers

### Manual Testing

**OAuth2 Flow**:
1. Test with expired token (middleware refresh)
2. Test with invalid token
3. Test with revoked permissions

**Google API Integration**:
1. Test with real Google Search Console account
2. Test with multiple domains
3. Test with domains lacking data
4. Test API rate limiting behavior

---

## 9. Definition of Done

### Code Quality
- [ ] All 11 new files created
- [ ] `routes/gsc.ts` reduced to 20-30 LOC
- [ ] No business logic in route file
- [ ] No direct API calls in controller
- [ ] Pure functions in utils (no side effects)
- [ ] TypeScript strict mode compliance
- [ ] No `any` types (except Google API responses if unavoidable)
- [ ] Consistent naming conventions
- [ ] JSDoc comments on all exported functions

### Functionality
- [ ] All 4 endpoints working identically
- [ ] `getGSCAIReadyData()` exported function working
- [ ] Error responses unchanged
- [ ] Middleware chain unchanged
- [ ] OAuth2 token refresh working
- [ ] Parallel API calls preserved (performance unchanged)

### Testing
- [ ] Unit tests for all utils (>80% coverage)
- [ ] Integration tests for all endpoints
- [ ] Manual OAuth2 flow testing
- [ ] Manual Google API integration testing
- [ ] Performance benchmarking (before/after)

### Documentation
- [ ] JSDoc on all services
- [ ] JSDoc on all utils
- [ ] README.md in `controllers/gsc/` explaining folder structure
- [ ] Update any API documentation referencing route file

### Dependencies
- [ ] All imports of `getGSCAIReadyData()` updated
- [ ] No broken imports
- [ ] No circular dependencies

### Deployment
- [ ] Code review completed
- [ ] Manual testing in staging environment
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured (if applicable)

---

## 10. Migration Execution Notes

### Pre-Migration Checklist
- [ ] Search for all usages of `getGSCAIReadyData()` in codebase
- [ ] Document current error response format for each endpoint
- [ ] Baseline performance metrics (API call timing)
- [ ] Create feature branch: `refactor/gsc-route-layer-separation`

### Migration Order (Critical)
1. **Utils first** (no dependencies)
2. **API service** (depends on utils)
3. **Business services** (depend on API service and utils)
4. **Controller** (depends on all services)
5. **Route file** (last, depends on controller)
6. **Update dependent modules** (after route file updated)

### Rollback Plan
If issues arise:
1. Revert route file changes
2. Keep new files (no harm)
3. Restore original route logic
4. Investigate failures
5. Fix and re-deploy

### Post-Migration Monitoring
- Monitor error rates for GSC endpoints
- Monitor API response times
- Monitor OAuth2 token refresh failures
- Check logs for any new error patterns

---

## 11. Architectural Notes

### Why This Refactor?

**Current Pain Points**:
1. 363 LOC route file is difficult to navigate
2. Helper functions embedded in route file not reusable
3. No clear separation of concerns
4. Business logic mixed with HTTP handling
5. Difficult to unit test individual functions
6. Exported function lives in route file (odd)

**Benefits**:
1. **Testability**: Pure utils can be tested in isolation
2. **Reusability**: Services can be used by other modules
3. **Maintainability**: Clear layer boundaries, easier to modify
4. **Readability**: Route file becomes self-documenting
5. **Consistency**: Aligns with other refactored routes
6. **Separation of Concerns**: HTTP → Controller → Service → Utils → API

### Unique Characteristics of GSC Route

**No Database Access**:
- Unlike other routes, GSC is a pure API proxy
- No model layer needed
- Services interact directly with Google API

**Exported Function**:
- `getGSCAIReadyData()` used programmatically by other modules
- Must maintain backward compatibility
- Moving to service layer is architecturally correct

**Complex Business Logic**:
- Trend score calculation (weighted metrics)
- Opportunity detection (multi-criteria filtering)
- Device data transformation
- Date range calculations
- All are candidates for unit testing

**Parallel API Calls**:
- Performance-critical: 5 parallel Google API calls
- Must preserve `Promise.all()` pattern
- Service layer responsible for orchestration

### Alignment with Target Architecture

This refactor aligns with:
1. **Routes layer**: Only route definitions
2. **Controllers layer**: HTTP handling, validation, response formatting
3. **Services layer**: Business logic orchestration, API calls
4. **Utils layer**: Pure functions, calculations, transformations

No model layer needed (pure API proxy).

---

## 12. Open Questions

1. **✓ Confirmed: Only one module imports `getGSCAIReadyData()`**
   - **File**: `src/services/dataAggregator.ts` (line 9)
   - **Usage**: Called on line 195 to fetch GSC data for aggregation
   - **Action Required**: Update import path during Phase 6
   - **Test Required**: Verify dataAggregator service still works after refactor

2. **Should we add caching for Google API responses?**
   - GSC data changes slowly (daily updates)
   - Caching could reduce API quota usage
   - Out of scope for this refactor (future enhancement)

3. **Should opportunity detection thresholds be configurable?**
   - Currently hardcoded (>100 impressions, <2% CTR, position 4-10)
   - Could move to config file or database
   - Out of scope for this refactor (future enhancement)

4. **Should we add request/response logging?**
   - Helpful for debugging API issues
   - Could add to controller layer
   - Consider privacy implications (domain properties are sensitive)
   - Out of scope for this refactor (future enhancement)

5. **Error response format standardization?**
   - Current format: `{ error: "Failed to..." }`
   - Should we standardize across all routes?
   - Out of scope for this refactor (maintain current format)

---

## 13. Success Metrics

### Quantitative
- Route file LOC: 363 → 20-30 (92% reduction)
- Number of files: 1 → 12 (better organization)
- Test coverage: 0% → >80% (unit tests for utils)
- Performance: No degradation (same API call patterns)

### Qualitative
- Code readability improved (clear layer boundaries)
- Maintainability improved (pure functions, no side effects)
- Testability improved (unit tests possible)
- Reusability improved (services/utils can be imported elsewhere)
- Consistency improved (aligns with other refactored routes)

---

## End of Plan

**Estimated Effort**: 4-6 hours
**Complexity**: Medium
**Risk Level**: Low-Medium
**Priority**: Medium (part of systematic route refactoring)

**Next Steps**:
1. Review this plan
2. Search for `getGSCAIReadyData()` usages
3. Create feature branch
4. Begin Phase 1 (create utils)
