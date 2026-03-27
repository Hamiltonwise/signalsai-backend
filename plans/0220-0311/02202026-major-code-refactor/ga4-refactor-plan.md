# GA4 Route Refactor Plan

## 1. Current State

### Overview
- **File Location**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/ga4.ts`
- **Lines of Code**: 856 LOC
- **Endpoints**: 4
  - `POST /api/ga4/getKeyData` - Fetch GA4 key metrics with trend score
  - `GET /api/ga4/diag/properties` - List all available GA4 properties (diagnostic)
  - `GET /api/ga4/properties/get` - List available properties with domain names
  - `POST /api/ga4/getAIReadyData` - Comprehensive AI-ready data export
- **Exported Function**: 1
  - `getGA4AIReadyData()` - Direct function for bypassing HTTP (used by other modules)

### Current Architecture
- **Pure Google API Proxy**: No direct database calls
- **All logic in route file**: Client creation, data fetching, transformations, calculations, response formatting
- **Helper functions** (9 total):
  - `createAnalyticsDataClient()` (lines 14-19)
  - `createAnalyticsAdminClient()` (lines 22-27)
  - `handleError()` (lines 30-38)
  - `getDateRanges()` (lines 41-66)
  - `fetchGA4Data()` (lines 69-114)
  - `fetchGA4DataWithDimensions()` (lines 117-211)
  - `processAcquisitionData()` (lines 214-237)
  - `processAudienceData()` (lines 240-257)
  - `processBehaviorData()` (lines 260-277)
  - `processEcommerceData()` (lines 280-314)
  - `calculateGA4Opportunities()` (lines 317-353)
  - `calculateTrendScore()` (lines 356-385)
- **Middleware chain**: `tokenRefreshMiddleware` (applied to all routes)

### Dependencies
- `express` - Router
- `googleapis` - Google Analytics Admin API and Analytics Data API
- `../middleware/tokenRefresh` - OAuth2 token refresh and authentication
- **External APIs**:
  - `@googleapis/analyticsadmin` - For listing accounts, properties, data streams
  - `@googleapis/analyticsdata` - For fetching analytics reports
- **No database models** - Pure external API integration

### Current Endpoint Breakdown

#### 1. POST `/getKeyData` (lines 388-444)
**Purpose**: Fetch key GA4 metrics for 2 months and calculate trend score

**Operations**:
- Validate `propertyId` presence
- Format `propertyId` to `properties/{id}` format
- Get date ranges (current month, previous month)
- Parallel fetch data for both months
- Calculate trend score using weighted formula
- Return structured response with month-over-month comparison

**Response Structure**:
```json
{
  "activeUsers": { "prevMonth": 1234, "currMonth": 1456 },
  "engagementRate": { "prevMonth": 0.45, "currMonth": 0.52 },
  "conversions": { "prevMonth": 23, "currMonth": 31 },
  "trendScore": 15.67
}
```

#### 2. GET `/diag/properties` (lines 447-491)
**Purpose**: Diagnostic endpoint to list all GA4 properties with full details

**Operations**:
- List all GA4 accounts
- For each account, fetch properties
- Return array with property metadata (propertyId, displayName, timeZone, currencyCode, accountId, accountDisplayName)

**Response Structure**:
```json
{
  "properties": [
    {
      "propertyId": "properties/123456789",
      "displayName": "My Website",
      "timeZone": "America/New_York",
      "currencyCode": "USD",
      "accountId": "accounts/987654321",
      "accountDisplayName": "My Account"
    }
  ]
}
```

#### 3. GET `/properties/get` (lines 494-593)
**Purpose**: List available properties with extracted domain names

**Operations**:
- List all GA4 accounts
- For each account, fetch properties
- For each property, fetch data streams
- Extract domain from web stream URLs
- Remove `www.` prefix from domains
- Fallback to display name if URL parsing fails
- Return simplified array of `{ propertyId, domain }`

**Response Structure**:
```json
[
  { "propertyId": "properties/123456789", "domain": "example.com" },
  { "propertyId": "properties/987654321", "domain": "another-site.com" }
]
```

**Special Logic**:
- URL parsing with try/catch fallback
- `www.` prefix removal
- Fallback chain: stream URL → display name → "Unknown Domain"

#### 4. POST `/getAIReadyData` (lines 828-854)
**Purpose**: Comprehensive data export for AI analysis

**Operations**:
- Validate `propertyId` presence
- Get date ranges (supports custom dates via `req.body.startDate/endDate`)
- Call exported `getGA4AIReadyData()` function
- Return structured AI-ready data

**Delegates to**: `getGA4AIReadyData()` function (lines 596-825)

### Exported Function: `getGA4AIReadyData()` (lines 596-825)

**Purpose**: Core data aggregation function used both by HTTP endpoint and direct calls

**Parameters**:
- `oauth2Client` - Google OAuth2 client
- `propertyId` - GA4 property ID
- `startDate?` - Optional start date (defaults to current month)
- `endDate?` - Optional end date (defaults to current month)

**Operations** (8 parallel API calls):
1. Traffic Overview - sessions, users, pageviews, engagement, session duration, bounce rate
2. Acquisition Data - by source/medium with conversion tracking
3. Audience Geographic - by country
4. Audience Technology - by device category
5. Behavior Pages - top pages with engagement metrics
6. Behavior Events - top events by count
7. Lead Submit Total - filter `lead_submit` event count
8. Lead Submit by Source - filter `lead_submit` by source/medium

**Data Processing**:
- Calls `processAcquisitionData()` - merges lead submissions with source data
- Calls `processAudienceData()` - structures geographic and device data
- Calls `processBehaviorData()` - formats page and event data
- Calls `calculateGA4Opportunities()` - detects high bounce pages and low engagement sources

**Response Structure**:
```json
{
  "overview": { "sessions": 0, "users": 0, "pageviews": 0, "engagementRate": 0, "avgSessionDuration": 0, "bounceRate": 0, "leadSubmissions": 0, "dateRange": {} },
  "acquisition": { "bySource": [ /* top 10 sources with medium, users, sessions, engagement, conversions, leadSubmissions */ ] },
  "audience": { "geographic": [ /* top 10 countries */ ], "technology": [ /* device breakdown */ ] },
  "behavior": { "topPages": [ /* top 20 pages */ ], "topEvents": [ /* top 15 events */ ] },
  "ecommerce": { "revenue": {}, "products": [] },
  "realTime": { "activeUsers": 0, "popularPages": [] },
  "opportunities": [ /* high bounce pages, low engagement sources */ ]
}
```

### Business Logic Present

#### Date Range Calculation (`getDateRanges()`)
- Calculates current month: 1st day to last day of previous calendar month (not literal "current month")
- Calculates previous month: 1st day to last day of 2 months ago
- Uses `new Date(currentYear, currentMonth - 1, 1)` pattern
- **Logic quirk**: `currentMonth = now.getMonth() - 1` (line 44), so "current month" is actually previous month

#### Trend Score Calculation (`calculateTrendScore()`)
- Weighted formula: `(conversions × 40%) + (engagementRate × 35%) + (activeUsers × 25%)`
- Percentage change calculation: `((current - previous) / previous) × 100`
- Handles division by zero (returns 0 if previous value is 0)
- Rounds to 2 decimal places

#### Opportunity Detection (`calculateGA4Opportunities()`)
- **High Bounce Pages**: Pages with >70% bounce rate and >50 sessions
- **Low Engagement Sources**: Sources with <30% engagement rate and >100 users
- Returns top 5 of each type
- Bounce rate calculated as: `1 - (engagedSessions / sessions)`

#### Data Processing Patterns
- **Acquisition**: Top 10 sources, merges lead submissions by matching source/medium
- **Audience Geographic**: Top 10 countries by users
- **Audience Technology**: All device categories (typically 3: desktop, mobile, tablet)
- **Behavior Pages**: Top 20 pages, calculates bounce rate inline
- **Behavior Events**: Top 15 events by count
- **E-commerce**: Currently returns zero values (incompatible metrics commented out)

#### Error Handling
- Centralized `handleError()` function (lines 30-38)
- Logs full error object: `error?.response?.data || error?.message || error`
- Returns generic 500 status with operation name
- No granular error types (all 500s)

#### Logging Patterns
- Extensive console logging in `fetchGA4DataWithDimensions()` (lines 138-210)
- Logs: API call details, success confirmation, row counts, failure details with stack traces
- Prefix pattern: `[GA4 API]` for API calls, `[GA4 Core]` for orchestration

#### Property ID Formatting
- Used in multiple places: lines 400-402, 602-605
- Pattern: `propertyId.startsWith("properties/") ? propertyId : properties/${propertyId}`
- Ensures correct Google API format

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── ga4.ts                                  # Route definitions only (30-40 LOC)
├── controllers/
│   └── ga4/
│       ├── Ga4Controller.ts                    # Main controller (100-120 LOC)
│       ├── feature-services/
│       │   ├── service.analytics-api.ts        # Google API client wrapper (100-120 LOC)
│       │   ├── service.data-fetcher.ts         # Data fetching orchestration (200-250 LOC)
│       │   ├── service.trend-calculator.ts     # Trend score calculation (40-50 LOC)
│       │   ├── service.opportunity-detector.ts # Opportunity detection (80-100 LOC)
│       │   └── service.data-processor.ts       # Data transformation & aggregation (150-180 LOC)
│       └── feature-utils/
│           ├── util.date-ranges.ts             # Date range calculation (40-50 LOC)
│           ├── util.property-formatter.ts      # Property ID formatting (20-30 LOC)
│           ├── util.response-builder.ts        # Response structure builders (60-80 LOC)
│           └── util.error-handler.ts           # Error handling utilities (40-50 LOC)
```

### Layer Responsibilities

#### **routes/ga4.ts** (30-40 LOC)
- Route definitions only
- Middleware attachment (`tokenRefreshMiddleware`)
- Controller function delegation
- Export both router and `getGA4AIReadyData` wrapper
- No logic, no validation, no error handling

**Structure**:
```typescript
import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import Ga4Controller from "../controllers/ga4/Ga4Controller";

const ga4Routes = express.Router();
ga4Routes.use(tokenRefreshMiddleware);

ga4Routes.post("/getKeyData", Ga4Controller.getKeyData);
ga4Routes.get("/diag/properties", Ga4Controller.getDiagnosticProperties);
ga4Routes.get("/properties/get", Ga4Controller.getPropertiesWithDomains);
ga4Routes.post("/getAIReadyData", Ga4Controller.getAIReadyData);

export { getGA4AIReadyData } from "../controllers/ga4/Ga4Controller";
export default ga4Routes;
```

#### **controllers/ga4/Ga4Controller.ts** (100-120 LOC)
- Request extraction (`req.oauth2Client`, `req.body.propertyId`, etc.)
- Input validation (propertyId presence)
- Service layer orchestration
- Response formatting (delegates to util.response-builder)
- Error handling (try/catch with util.error-handler)
- No direct Google API calls
- No business logic
- Exports both class methods and standalone `getGA4AIReadyData` function

**Methods**:
- `getKeyData(req, res)` - Delegates to TrendCalculatorService
- `getDiagnosticProperties(req, res)` - Delegates to AnalyticsApiService
- `getPropertiesWithDomains(req, res)` - Delegates to AnalyticsApiService
- `getAIReadyData(req, res)` - Delegates to DataFetcherService
- Static `getGA4AIReadyData(oauth2Client, propertyId, startDate?, endDate?)` - Exported function for direct use

#### **controllers/ga4/feature-services/service.analytics-api.ts** (100-120 LOC)
- Google API client creation (`createAnalyticsDataClient`, `createAnalyticsAdminClient`)
- Low-level API calls (`runReport`, `accounts.list`, `properties.list`, `dataStreams.list`)
- Error wrapping with context
- No data transformation
- No business logic

**Methods**:
- `createDataClient(oauth2Client)` - Returns analyticsdata client
- `createAdminClient(oauth2Client)` - Returns analyticsadmin client
- `fetchReport(client, propertyId, requestBody)` - Wrapper for `runReport` with logging
- `listAccounts(adminClient)` - List all accounts
- `listProperties(adminClient, accountName)` - List properties for account
- `listDataStreams(adminClient, propertyName)` - List data streams for property

#### **controllers/ga4/feature-services/service.data-fetcher.ts** (200-250 LOC)
- Orchestrates parallel API calls for comprehensive data
- Delegates to `service.analytics-api.ts` for actual API calls
- Delegates to `service.data-processor.ts` for transformations
- Handles Promise.all orchestration
- Logging for fetch progress

**Methods**:
- `fetchKeyMetrics(oauth2Client, propertyId, startDate, endDate)` - Fetches activeUsers, engagementRate, conversions
- `fetchComprehensiveData(oauth2Client, propertyId, startDate, endDate)` - Orchestrates all 8 parallel API calls
- `fetchReportData(client, propertyId, startDate, endDate, metrics, dimensions?, limit?)` - Reusable report fetcher

#### **controllers/ga4/feature-services/service.trend-calculator.ts** (40-50 LOC)
- Trend score calculation
- Percentage change calculation
- Weighted formula application
- Pure calculation logic (no API calls)

**Methods**:
- `calculateTrendScore(currentData, previousData)` - Returns trend score (number)
- `calculatePercentageChange(current, previous)` - Helper for percentage change

#### **controllers/ga4/feature-services/service.opportunity-detector.ts** (80-100 LOC)
- Opportunity detection algorithms
- High bounce page detection
- Low engagement source detection
- Configurable thresholds
- Pure analysis logic (no API calls)

**Methods**:
- `detectOpportunities(overviewData, pagesData, acquisitionData)` - Returns array of opportunities
- `detectHighBouncePages(pagesData)` - Returns high bounce pages
- `detectLowEngagementSources(acquisitionData)` - Returns low engagement sources
- `calculateBounceRate(engagedSessions, sessions)` - Helper calculation

#### **controllers/ga4/feature-services/service.data-processor.ts** (150-180 LOC)
- Data transformation and aggregation
- Row-to-structured-object mapping
- Merging related datasets (e.g., lead submissions with acquisition data)
- Response structure building
- No API calls

**Methods**:
- `processAcquisitionData(rows, leadSubmitRows?)` - Structures acquisition data with lead submissions
- `processAudienceData(geoRows, deviceRows)` - Structures geographic and technology data
- `processBehaviorData(pageRows, eventRows)` - Structures page and event data
- `processEcommerceData(ecommerceRows)` - Structures e-commerce data (currently returns zeros)
- `extractMetricValues(row, metricHeaders)` - Helper to parse metric values from API response
- `extractDimensionValues(row, dimensionHeaders)` - Helper to parse dimension values from API response
- `buildAIReadyStructure(processedData)` - Builds final AI-ready response object

#### **controllers/ga4/feature-utils/util.date-ranges.ts** (40-50 LOC)
- Date range calculation logic
- Current month vs previous month
- Date formatting (`YYYY-MM-DD`)
- Pure utility (no dependencies)

**Methods**:
- `getDateRanges()` - Returns `{ currentMonth: { startDate, endDate }, previousMonth: { startDate, endDate } }`
- `formatDate(date)` - Converts Date to `YYYY-MM-DD` string

#### **controllers/ga4/feature-utils/util.property-formatter.ts** (20-30 LOC)
- Property ID formatting
- Ensures `properties/{id}` format
- Reusable across all API calls

**Methods**:
- `formatPropertyId(propertyId)` - Returns formatted property ID string

#### **controllers/ga4/feature-utils/util.response-builder.ts** (60-80 LOC)
- Success response builders
- Error response builders
- Standardized response structures
- No business logic

**Methods**:
- `buildKeyDataResponse(activeUsers, engagementRate, conversions, trendScore)` - Structures getKeyData response
- `buildPropertiesResponse(properties)` - Structures properties list response
- `buildAIReadyResponse(aiData)` - Structures AI-ready data response
- `buildErrorResponse(operation, error)` - Structures error response

#### **controllers/ga4/feature-utils/util.error-handler.ts** (40-50 LOC)
- Error logging utilities
- Error response formatting
- HTTP status code mapping
- Centralized error handling

**Methods**:
- `handleError(res, error, operation)` - Logs error and sends 500 response
- `logError(operation, error)` - Console logs with structured format
- `formatErrorMessage(error)` - Extracts useful error message from Google API errors

---

## 3. Endpoint to Component Mapping

### POST `/getKeyData`
**Route** → **Controller** → **Services** → **Utils**

```
routes/ga4.ts::post("/getKeyData")
  ↓
Ga4Controller.getKeyData(req, res)
  ↓ validate propertyId
  ↓ extract oauth2Client, propertyId
  ↓
service.data-fetcher.ts::fetchKeyMetrics(oauth2Client, propertyId, startDate, endDate)
  ↓ calls util.date-ranges.ts::getDateRanges()
  ↓ calls util.property-formatter.ts::formatPropertyId(propertyId)
  ↓ calls service.analytics-api.ts::createDataClient(oauth2Client)
  ↓ calls service.analytics-api.ts::fetchReport() [2x parallel for current/previous month]
  ↓ returns { currentMonthData, previousMonthData }
  ↓
service.trend-calculator.ts::calculateTrendScore(currentData, previousData)
  ↓ returns trendScore
  ↓
util.response-builder.ts::buildKeyDataResponse(activeUsers, engagementRate, conversions, trendScore)
  ↓
Ga4Controller → res.json(response)
```

**Error Path**:
- Any service throws error
- Controller catch block
- util.error-handler.ts::handleError(res, error, "GA4 API")

### GET `/diag/properties`
**Route** → **Controller** → **Services**

```
routes/ga4.ts::get("/diag/properties")
  ↓
Ga4Controller.getDiagnosticProperties(req, res)
  ↓ extract oauth2Client
  ↓
service.analytics-api.ts::createAdminClient(oauth2Client)
  ↓
service.analytics-api.ts::listAccounts(adminClient)
  ↓ for each account:
  ↓   service.analytics-api.ts::listProperties(adminClient, account.name)
  ↓ aggregates properties
  ↓
util.response-builder.ts::buildPropertiesResponse(properties)
  ↓
Ga4Controller → res.json(response)
```

### GET `/properties/get`
**Route** → **Controller** → **Services** → **Utils**

```
routes/ga4.ts::get("/properties/get")
  ↓
Ga4Controller.getPropertiesWithDomains(req, res)
  ↓ extract oauth2Client
  ↓
service.analytics-api.ts::createAdminClient(oauth2Client)
  ↓
service.analytics-api.ts::listAccounts(adminClient)
  ↓ for each account:
  ↓   service.analytics-api.ts::listProperties(adminClient, account.name)
  ↓   for each property:
  ↓     service.analytics-api.ts::listDataStreams(adminClient, property.name)
  ↓     extract domain from stream URL (with try/catch)
  ↓     remove "www." prefix
  ↓     fallback to displayName if URL parsing fails
  ↓ returns [{ propertyId, domain }]
  ↓
Ga4Controller → res.json(properties)
```

**Special Logic Note**: Domain extraction logic should remain in controller or be moved to `util.property-formatter.ts::extractDomainFromProperty(property, streams)`.

### POST `/getAIReadyData`
**Route** → **Controller** → **Services** → **Utils**

```
routes/ga4.ts::post("/getAIReadyData")
  ↓
Ga4Controller.getAIReadyData(req, res)
  ↓ validate propertyId
  ↓ extract oauth2Client, propertyId, startDate?, endDate?
  ↓
Ga4Controller.getGA4AIReadyData(oauth2Client, propertyId, startDate, endDate)
  ↓ (exported static function)
  ↓
service.data-fetcher.ts::fetchComprehensiveData(oauth2Client, propertyId, startDate, endDate)
  ↓ calls util.date-ranges.ts::getDateRanges()
  ↓ calls util.property-formatter.ts::formatPropertyId(propertyId)
  ↓ calls service.analytics-api.ts::createDataClient(oauth2Client)
  ↓ orchestrates 8 parallel API calls via service.analytics-api.ts::fetchReport()
  ↓ returns raw API response data
  ↓
service.data-processor.ts::processAcquisitionData(acquisitionRows, leadSubmitRows)
service.data-processor.ts::processAudienceData(geoRows, deviceRows)
service.data-processor.ts::processBehaviorData(pageRows, eventRows)
service.data-processor.ts::processEcommerceData(ecommerceRows)
  ↓ all processors return structured data
  ↓
service.opportunity-detector.ts::detectOpportunities(overviewData, pagesData, acquisitionData)
  ↓ returns opportunities array
  ↓
service.data-processor.ts::buildAIReadyStructure(processedData, opportunities)
  ↓ returns final AI-ready data structure
  ↓
Ga4Controller → res.json(aiReadyData)
```

**Error Path**:
- Any service throws error
- Controller catch block
- util.error-handler.ts::handleError(res, error, "GA4 AI Data")

### Exported Function: `getGA4AIReadyData()`
**Direct Call** → **Services**

```
External module calls getGA4AIReadyData(oauth2Client, propertyId, startDate?, endDate?)
  ↓ (exported from controllers/ga4/Ga4Controller.ts)
  ↓
Ga4Controller.getGA4AIReadyData(oauth2Client, propertyId, startDate, endDate)
  ↓ same flow as POST /getAIReadyData
  ↓ returns aiReadyData object (no HTTP response)
```

**Usage Context**: Used by other modules that need direct GA4 data without HTTP overhead (e.g., scheduled jobs, AI pipeline, other internal services).

---

## 4. Step-by-Step Migration Plan

### Phase 1: Create Target Folder Structure (No Code Changes)
1. Create controller folder: `src/controllers/ga4/`
2. Create services folder: `src/controllers/ga4/feature-services/`
3. Create utils folder: `src/controllers/ga4/feature-utils/`

### Phase 2: Extract Utilities (Standalone, No Dependencies)
**Rationale**: Utilities are pure functions with no external dependencies. Safest to extract first.

**Files to Create**:
1. **`util.date-ranges.ts`** (Priority: High)
   - Extract `getDateRanges()` function (lines 41-66)
   - Extract `formatDate()` inline function
   - Add unit tests (5 test cases: current month calculation, previous month calculation, leap year handling, year boundary, date format validation)

2. **`util.property-formatter.ts`** (Priority: High)
   - Extract property ID formatting logic (lines 400-402, 602-605)
   - Create `formatPropertyId(propertyId)` function
   - Add unit tests (4 test cases: already formatted, needs formatting, null/undefined handling, empty string)

3. **`util.error-handler.ts`** (Priority: Medium)
   - Extract `handleError()` function (lines 30-38)
   - Create `logError()` helper
   - Create `formatErrorMessage()` helper
   - Add unit tests (3 test cases: standard error, Google API error with response.data, error with no message)

4. **`util.response-builder.ts`** (Priority: Low)
   - Create response structure builders (based on current response patterns)
   - `buildKeyDataResponse()`
   - `buildPropertiesResponse()`
   - `buildAIReadyResponse()`
   - Add unit tests (4 test cases: one per builder function)

**Validation After Phase 2**:
- All utils have unit tests
- Utils are pure functions (no side effects)
- No dependencies on services or controllers

### Phase 3: Extract Service Layer (Google API Wrappers)
**Rationale**: Services depend on utils (extracted in Phase 2) but have no controller dependencies.

**Files to Create**:
1. **`service.analytics-api.ts`** (Priority: Critical)
   - Extract `createAnalyticsDataClient()` (lines 14-19)
   - Extract `createAnalyticsAdminClient()` (lines 22-27)
   - Create `fetchReport()` wrapper for `runReport` (based on lines 146-150)
   - Create `listAccounts()` wrapper
   - Create `listProperties()` wrapper
   - Create `listDataStreams()` wrapper
   - Add error handling with context
   - Add logging patterns from `fetchGA4DataWithDimensions()` (lines 138-210)
   - Add unit tests (mocked Google API clients)

2. **`service.data-processor.ts`** (Priority: High)
   - Extract `processAcquisitionData()` (lines 214-237)
   - Extract `processAudienceData()` (lines 240-257)
   - Extract `processBehaviorData()` (lines 260-277)
   - Extract `processEcommerceData()` (lines 280-314)
   - Create `extractMetricValues()` helper
   - Create `extractDimensionValues()` helper
   - Create `buildAIReadyStructure()` function
   - Add unit tests (fixtures with sample API responses)

3. **`service.trend-calculator.ts`** (Priority: High)
   - Extract `calculateTrendScore()` (lines 356-385)
   - Create `calculatePercentageChange()` helper
   - Add unit tests (8 test cases: normal changes, zero division, negative changes, rounding)

4. **`service.opportunity-detector.ts`** (Priority: Medium)
   - Extract `calculateGA4Opportunities()` (lines 317-353)
   - Create `detectHighBouncePages()` method
   - Create `detectLowEngagementSources()` method
   - Create `calculateBounceRate()` helper
   - Add configurable thresholds (default: bounceRate > 0.7, sessions > 50, engagementRate < 0.3, users > 100)
   - Add unit tests (fixtures with sample page/source data)

5. **`service.data-fetcher.ts`** (Priority: Critical)
   - Extract `fetchGA4Data()` (lines 69-114)
   - Extract `fetchGA4DataWithDimensions()` (lines 117-211)
   - Create `fetchKeyMetrics()` method (used by `/getKeyData`)
   - Create `fetchComprehensiveData()` method (used by `/getAIReadyData`, lines 654-767)
   - Orchestrates calls to `service.analytics-api.ts`
   - Delegates processing to `service.data-processor.ts`
   - Add integration tests (mocked Google API)

**Validation After Phase 3**:
- All services are testable
- Services only depend on utils and Google APIs
- No req/res objects in services
- Services throw errors (do not handle HTTP responses)

### Phase 4: Extract Controller Layer
**Rationale**: Controllers depend on services (extracted in Phase 3).

**Files to Create**:
1. **`Ga4Controller.ts`** (Priority: Critical)
   - Create class with static methods
   - Extract handler logic from lines 388-444 → `getKeyData(req, res)`
   - Extract handler logic from lines 447-491 → `getDiagnosticProperties(req, res)`
   - Extract handler logic from lines 494-593 → `getPropertiesWithDomains(req, res)`
   - Extract handler logic from lines 828-854 → `getAIReadyData(req, res)`
   - Create static method `getGA4AIReadyData(oauth2Client, propertyId, startDate?, endDate?)` (extracted from lines 596-825)
   - Each method calls services, wraps in try/catch, uses util.error-handler
   - Add integration tests (mocked services)

**Special Handling**:
- Domain extraction logic in `getPropertiesWithDomains()` (lines 530-551):
  - Option A: Keep in controller (simple URL parsing logic)
  - Option B: Move to `util.property-formatter.ts::extractDomainFromProperty(property, streams)`
  - **Recommendation**: Keep in controller for now (not complex enough to warrant util extraction)

**Validation After Phase 4**:
- Controllers are thin (mostly delegation)
- Controllers handle req/res only
- Controllers do not contain business logic
- Controllers do not call Google APIs directly

### Phase 5: Refactor Route File
**Rationale**: Routes depend on controllers (extracted in Phase 4).

**File to Modify**:
1. **`routes/ga4.ts`** (Priority: Critical)
   - Remove all helper functions
   - Remove all handler logic
   - Import `Ga4Controller`
   - Replace inline handlers with controller method references
   - Keep middleware attachment (`tokenRefreshMiddleware`)
   - Export router and `getGA4AIReadyData` wrapper
   - Target: 30-40 LOC

**Before**:
```typescript
ga4Routes.post("/getKeyData", async (req, res) => {
  try {
    // ... 50 lines of logic ...
  } catch (error) {
    // ... error handling ...
  }
});
```

**After**:
```typescript
ga4Routes.post("/getKeyData", Ga4Controller.getKeyData);
```

**Validation After Phase 5**:
- Route file is <50 LOC
- Route file only contains route definitions
- All logic moved to controllers/services/utils
- Exported function still works for direct calls

### Phase 6: End-to-End Testing
**Rationale**: Ensure refactored code behaves identically to original.

**Test Cases**:
1. **POST `/getKeyData`** (2 test cases)
   - Valid propertyId → returns trend score and metrics
   - Missing propertyId → returns error response

2. **GET `/diag/properties`** (1 test case)
   - Returns list of properties with full metadata

3. **GET `/properties/get`** (2 test cases)
   - Returns list of properties with domains
   - Handles properties with no data streams (fallback to displayName)

4. **POST `/getAIReadyData`** (3 test cases)
   - Valid propertyId → returns comprehensive AI-ready data
   - Custom date range → respects startDate/endDate
   - Missing propertyId → returns error response

5. **Exported Function `getGA4AIReadyData()`** (2 test cases)
   - Direct call with oauth2Client → returns AI-ready data
   - Direct call with custom dates → respects date parameters

**Validation After Phase 6**:
- All endpoints return identical responses
- Exported function behavior unchanged
- Error handling consistent with original
- Logging patterns preserved

### Phase 7: Cleanup and Documentation
**Rationale**: Remove old code, document new structure.

**Tasks**:
1. Delete old route file backup (if created)
2. Update import statements in any modules using `getGA4AIReadyData()`
3. Add JSDoc comments to all public methods
4. Add README.md in `src/controllers/ga4/` explaining architecture
5. Update API documentation (if exists)

---

## 5. Files to Create

### Controllers
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/Ga4Controller.ts` (100-120 LOC)

### Services
2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-services/service.analytics-api.ts` (100-120 LOC)
3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-services/service.data-fetcher.ts` (200-250 LOC)
4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-services/service.trend-calculator.ts` (40-50 LOC)
5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-services/service.opportunity-detector.ts` (80-100 LOC)
6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-services/service.data-processor.ts` (150-180 LOC)

### Utils
7. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-utils/util.date-ranges.ts` (40-50 LOC)
8. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-utils/util.property-formatter.ts` (20-30 LOC)
9. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-utils/util.response-builder.ts` (60-80 LOC)
10. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/feature-utils/util.error-handler.ts` (40-50 LOC)

### Documentation
11. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/ga4/README.md` (documentation)

**Total New Files**: 11
**Total New LOC**: ~750-900 (excluding tests)

---

## 6. Files to Modify

### Routes
1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/ga4.ts`
   - **Current**: 856 LOC
   - **Target**: 30-40 LOC
   - **Change**: Remove all logic, keep only route definitions and middleware
   - **Risk**: Low (straightforward delegation to controller)

### External Dependencies (Discovery Required)
**Action Required**: Search codebase for imports of `getGA4AIReadyData` function.

**Search Pattern**:
```bash
grep -r "from.*routes/ga4" signalsai-backend/src/
grep -r "getGA4AIReadyData" signalsai-backend/src/
```

**Expected Locations**:
- AI pipeline modules
- Scheduled jobs
- Aggregation services
- Report generation modules

**Required Changes**:
- Update import path from `routes/ga4` to `controllers/ga4/Ga4Controller`
- Update function signature if changed (unlikely, should remain compatible)

**Example**:
**Before**:
```typescript
import { getGA4AIReadyData } from "../routes/ga4";
```

**After**:
```typescript
import { getGA4AIReadyData } from "../controllers/ga4/Ga4Controller";
```

---

## 7. Risk Assessment

### Critical Risks (Must Address Before Migration)

#### 1. Exported Function Breaking External Modules
**Risk Level**: HIGH
**Description**: The `getGA4AIReadyData()` function is exported for direct use by other modules. If the function signature changes or the export path changes, dependent modules will break.

**Mitigation**:
- Search entire codebase for `getGA4AIReadyData` usage BEFORE starting migration
- Create compatibility layer if function signature must change
- Maintain export in route file temporarily (re-export from controller)
- Update all imports in Phase 5 (same PR as route refactor)

**Validation**:
- Run full test suite after Phase 5
- Grep for any remaining imports from old path
- Check for runtime errors in dependent modules

#### 2. Date Range Calculation Logic Quirk
**Risk Level**: MEDIUM
**Description**: The `getDateRanges()` function has a quirk where "current month" is actually the previous calendar month (`now.getMonth() - 1`). This may be intentional business logic, not a bug.

**Impact**:
- If logic is changed during refactor, reports will show wrong data
- Existing reports may depend on this behavior

**Mitigation**:
- Do NOT "fix" the date calculation logic during refactor
- Extract as-is with explicit comment explaining behavior
- Add unit test that validates current behavior (not "correct" behavior)
- Flag for product team review in separate ticket

**Example Comment**:
```typescript
// NOTE: "currentMonth" is actually the previous calendar month.
// This appears intentional (lines 44 in original). Do not change without PM approval.
const currentMonth = now.getMonth() - 1;
```

#### 3. Google API Rate Limiting and Error Handling
**Risk Level**: MEDIUM
**Description**: Google Analytics API has rate limits and quota restrictions. Current error handling returns generic 500 errors. Refactored code must preserve error logging patterns for debugging.

**Impact**:
- Loss of detailed error logs could make production debugging impossible
- Rate limit errors may not be distinguishable from other errors

**Mitigation**:
- Preserve all console.log statements from `fetchGA4DataWithDimensions()` (lines 138-210)
- Keep error logging format identical (lines 198-208)
- Do not consolidate error logging (each API call should log separately)
- Add TODO comment for future enhancement (structured logging, error types)

**Validation**:
- Test with invalid property ID → verify error logs match original
- Test with expired OAuth token → verify error logs match original

### Medium Risks (Address During Migration)

#### 4. Promise.all Failure Handling in `getGA4AIReadyData()`
**Risk Level**: MEDIUM
**Description**: The function uses `Promise.all()` with 8 parallel API calls (lines 654-767). If any call fails, the entire operation fails. Current catch block logs and re-throws (lines 763-767).

**Impact**:
- One failing API call causes entire data export to fail
- No partial data returned

**Mitigation**:
- Preserve current behavior during refactor (fail-fast with Promise.all)
- Document this behavior in service layer
- Add TODO comment for future enhancement (partial data return with Promise.allSettled)

**Future Enhancement** (Out of Scope):
- Use `Promise.allSettled()` to allow partial data
- Return successful data with error flags for failed calls

#### 5. Test Coverage for Data Processing Functions
**Risk Level**: MEDIUM
**Description**: Data processing functions (`processAcquisitionData`, `processAudienceData`, etc.) transform complex API responses. Refactored code must handle edge cases (empty arrays, missing fields).

**Impact**:
- Incorrect data transformation could break AI pipeline
- Missing null checks could cause runtime errors

**Mitigation**:
- Create fixtures with sample Google API responses
- Add unit tests for each processor (minimum 3 test cases: normal data, empty data, malformed data)
- Test null/undefined handling explicitly
- Validate output structure matches original

**Test Fixtures Required**:
- Sample `runReport` response with dimensions
- Sample `runReport` response without dimensions
- Empty response (no rows)
- Response with missing metricValues

### Low Risks (Monitor During Migration)

#### 6. Controller Method Structure (Static vs Instance)
**Risk Level**: LOW
**Description**: Decision needed: Should controller methods be static or instance methods?

**Options**:
- **Option A**: Static methods (no state, easier to use)
- **Option B**: Instance methods (follows OOP patterns, allows dependency injection)

**Recommendation**: Use static methods.

**Rationale**:
- Controllers have no state
- Simpler route file (`Ga4Controller.getKeyData` vs `new Ga4Controller().getKeyData`)
- Consistent with other refactored routes (check existing patterns)

#### 7. TypeScript Interfaces for Service Return Types
**Risk Level**: LOW
**Description**: Services return complex objects (e.g., AI-ready data structure). Should we define TypeScript interfaces?

**Options**:
- **Option A**: Define interfaces (better type safety)
- **Option B**: Use `any` or inferred types (faster to implement)

**Recommendation**: Define interfaces for public service methods.

**Rationale**:
- Improves IDE autocomplete
- Catches type errors at compile time
- Self-documenting code

**Scope**:
- Define interfaces for:
  - `fetchKeyMetrics()` return type
  - `fetchComprehensiveData()` return type
  - `getGA4AIReadyData()` return type
- Do not define interfaces for internal helper functions (out of scope)

#### 8. Logging Consistency Across Services
**Risk Level**: LOW
**Description**: Current code has logging prefixes (`[GA4 API]`, `[GA4 Core]`). Should refactored code maintain these?

**Recommendation**: Maintain existing logging patterns.

**Rationale**:
- Existing production monitoring may rely on these patterns
- Easy to change later (low impact)
- No benefit to changing during refactor

**Validation**:
- Grep production logs for `[GA4 API]` and `[GA4 Core]` patterns
- Ensure refactored code logs match original

---

## 8. Testing Strategy

### Unit Tests (Per File)

#### Utils
- **`util.date-ranges.ts`**: 5 test cases
  - Current month calculation (normal case)
  - Previous month calculation (normal case)
  - Leap year handling (Feb 29)
  - Year boundary (Dec → Jan)
  - Date format validation (`YYYY-MM-DD`)

- **`util.property-formatter.ts`**: 4 test cases
  - Already formatted (`properties/123`)
  - Needs formatting (`123`)
  - Null/undefined input
  - Empty string input

- **`util.error-handler.ts`**: 3 test cases
  - Standard Error object
  - Google API error with `response.data`
  - Error with no message

- **`util.response-builder.ts`**: 4 test cases
  - `buildKeyDataResponse()` with valid data
  - `buildPropertiesResponse()` with empty array
  - `buildPropertiesResponse()` with properties
  - `buildAIReadyResponse()` with full data

#### Services
- **`service.analytics-api.ts`**: 6 test cases (mocked Google clients)
  - `createDataClient()` returns valid client
  - `createAdminClient()` returns valid client
  - `fetchReport()` successful call
  - `fetchReport()` API error handling
  - `listAccounts()` successful call
  - `listProperties()` successful call

- **`service.data-processor.ts`**: 12 test cases (fixture-based)
  - `processAcquisitionData()` with normal data
  - `processAcquisitionData()` with empty array
  - `processAcquisitionData()` with lead submissions
  - `processAudienceData()` with normal data
  - `processAudienceData()` with empty arrays
  - `processBehaviorData()` with normal data
  - `processBehaviorData()` with empty arrays
  - `processEcommerceData()` with normal data
  - `processEcommerceData()` with empty array
  - `extractMetricValues()` with valid row
  - `extractDimensionValues()` with valid row
  - `buildAIReadyStructure()` with full data

- **`service.trend-calculator.ts`**: 8 test cases
  - `calculateTrendScore()` with positive changes
  - `calculateTrendScore()` with negative changes
  - `calculateTrendScore()` with zero previous values
  - `calculateTrendScore()` with mixed changes
  - `calculatePercentageChange()` normal case
  - `calculatePercentageChange()` zero division
  - `calculatePercentageChange()` rounding to 2 decimals
  - `calculateTrendScore()` weighted formula validation

- **`service.opportunity-detector.ts`**: 6 test cases
  - `detectHighBouncePages()` finds pages above threshold
  - `detectHighBouncePages()` ignores low-traffic pages
  - `detectLowEngagementSources()` finds sources below threshold
  - `detectLowEngagementSources()` ignores low-traffic sources
  - `calculateBounceRate()` calculation
  - `detectOpportunities()` combines both types

- **`service.data-fetcher.ts`**: 4 integration tests (mocked API)
  - `fetchKeyMetrics()` parallel calls
  - `fetchKeyMetrics()` error handling
  - `fetchComprehensiveData()` all 8 parallel calls
  - `fetchComprehensiveData()` Promise.all failure

#### Controller
- **`Ga4Controller.ts`**: 8 integration tests (mocked services)
  - `getKeyData()` success path
  - `getKeyData()` missing propertyId
  - `getDiagnosticProperties()` success path
  - `getPropertiesWithDomains()` success path
  - `getPropertiesWithDomains()` domain extraction fallback
  - `getAIReadyData()` success path
  - `getAIReadyData()` custom date range
  - `getGA4AIReadyData()` direct call (exported function)

**Total Unit/Integration Tests**: ~60 test cases

### End-to-End Tests (Route Level)

#### Endpoint Tests (Real HTTP Requests)
1. **POST `/api/ga4/getKeyData`**
   - Valid propertyId → 200 with trend score
   - Missing propertyId → 200 with error message (check current behavior)
   - Invalid OAuth token → 500 with error

2. **GET `/api/ga4/diag/properties`**
   - Valid OAuth → 200 with properties array
   - Invalid OAuth → 500 with error

3. **GET `/api/ga4/properties/get`**
   - Valid OAuth → 200 with `[{ propertyId, domain }]`
   - Property with no data streams → fallback to displayName
   - Invalid OAuth → 500 with error

4. **POST `/api/ga4/getAIReadyData`**
   - Valid propertyId → 200 with full AI data structure
   - Valid propertyId + custom dates → respects date range
   - Missing propertyId → 200 with error message
   - Invalid OAuth → 500 with error

**Total E2E Tests**: 11 test cases

### Regression Tests (Critical Behavior)

#### Exported Function Test
- Direct call to `getGA4AIReadyData(oauth2Client, propertyId)` → returns expected structure
- Direct call with custom dates → respects dates
- Direct call with invalid propertyId → throws error

#### Date Range Logic Test
- Validate "current month" is previous calendar month (preserve quirk)
- Validate "previous month" is 2 months ago
- Validate date format is `YYYY-MM-DD`

#### Error Logging Test
- Trigger API error → verify console logs match original format
- Verify `[GA4 API]` prefix present
- Verify `[GA4 Core]` prefix present

**Total Regression Tests**: 8 test cases

### Test Execution Plan

#### Phase 2 (Utils)
- Run unit tests for each util file
- Achieve 100% code coverage for utils

#### Phase 3 (Services)
- Run unit tests for each service file
- Run integration tests for data-fetcher service
- Mock all Google API calls

#### Phase 4 (Controller)
- Run integration tests for controller methods
- Mock all service calls

#### Phase 5 (Routes)
- Run E2E tests against refactored endpoints
- Compare responses with original route (before refactor)
- Use diff tool to validate identical behavior

#### Phase 6 (Regression)
- Run all regression tests
- Run full application test suite
- Test exported function in dependent modules

---

## 9. Rollback Plan

### Rollback Triggers
1. Any E2E test fails after Phase 5
2. Exported function breaks dependent modules
3. Production error rate increases after deployment
4. Google API error logs show different format

### Rollback Strategy

#### Immediate Rollback (Production Issue)
1. Revert PR merge commit
2. Redeploy previous version
3. Notify dependent module owners

#### Phased Rollback (Test Failure)
1. If Phase 5 E2E tests fail:
   - Do not merge PR
   - Fix issues in controller layer
   - Re-run E2E tests

2. If Phase 6 regression tests fail:
   - Identify specific regression
   - Fix in relevant layer (service/controller)
   - Re-run full test suite

### Rollback Validation
- Run E2E tests against rolled-back version
- Verify all endpoints return original responses
- Check error logs for original format

---

## 10. Success Criteria

### Code Quality Metrics
- Route file: <50 LOC (target: 30-40 LOC)
- Controller file: <150 LOC (target: 100-120 LOC)
- Each service file: <300 LOC (largest is data-fetcher at ~250 LOC)
- Each util file: <100 LOC (largest is response-builder at ~80 LOC)
- Test coverage: >80% for all new files

### Functional Validation
- All E2E tests pass (11 test cases)
- All regression tests pass (8 test cases)
- Exported function works in dependent modules
- Error logs match original format
- Response structures match original

### Performance Validation
- No increase in average response time (measure with profiler)
- No increase in memory usage
- No new memory leaks (run long-duration test)

### Maintainability Validation
- Each file has single responsibility
- Dependencies flow in one direction (routes → controllers → services → utils)
- No circular dependencies
- JSDoc comments on all public methods
- README.md explains architecture

---

## 11. Post-Migration Enhancements (Out of Scope)

### Immediate Follow-Ups (Separate Tickets)
1. **Date Range Logic Review**
   - Ticket: "Review GA4 date range calculation logic"
   - Validate with product team if "current month" = previous month is intentional
   - Update comments or fix logic based on decision

2. **Error Type Granularity**
   - Ticket: "Add typed error handling for GA4 API errors"
   - Define error types: `RateLimitError`, `QuotaExceededError`, `InvalidPropertyError`, `AuthenticationError`
   - Return appropriate HTTP status codes (429 for rate limit, 401 for auth, etc.)

3. **Partial Data Return**
   - Ticket: "Support partial data return in GA4 AI-ready endpoint"
   - Replace `Promise.all()` with `Promise.allSettled()` in `fetchComprehensiveData()`
   - Return successful data with error flags for failed calls
   - Update AI pipeline to handle partial data

4. **Configurable Opportunity Thresholds**
   - Ticket: "Make GA4 opportunity detection thresholds configurable"
   - Move hardcoded thresholds (0.7 bounce rate, 0.3 engagement rate) to config
   - Allow per-property customization via admin settings

### Future Enhancements (Backlog)
1. **Structured Logging**
   - Replace `console.log` with structured logger (Winston, Pino)
   - Add request IDs for tracing
   - Add log levels (info, warn, error)

2. **Caching Layer**
   - Add Redis cache for frequently accessed properties
   - Cache GA4 data for 1 hour (reduce API calls)
   - Implement cache invalidation strategy

3. **Rate Limit Handling**
   - Implement retry logic with exponential backoff
   - Add circuit breaker for repeated failures
   - Queue requests when rate limit hit

4. **TypeScript Strict Mode**
   - Enable strict null checks
   - Add interfaces for all service return types
   - Remove `any` types

5. **Performance Monitoring**
   - Add APM instrumentation (New Relic, Datadog)
   - Track API call latency
   - Track individual endpoint performance

---

## 12. Migration Timeline Estimate

### Assumptions
- 1 developer working full-time
- Unit tests written as files are created
- Code reviews happen between phases

### Phase Breakdown

| Phase | Description | Estimated Time | Cumulative |
|-------|-------------|----------------|------------|
| Phase 1 | Create folder structure | 0.5 hours | 0.5 hours |
| Phase 2 | Extract utils + unit tests | 4 hours | 4.5 hours |
| Phase 3 | Extract services + unit tests | 12 hours | 16.5 hours |
| Phase 4 | Extract controller + integration tests | 6 hours | 22.5 hours |
| Phase 5 | Refactor route file + update imports | 2 hours | 24.5 hours |
| Phase 6 | E2E testing + regression tests | 4 hours | 28.5 hours |
| Phase 7 | Cleanup + documentation | 2 hours | 30.5 hours |

**Code Review & Fixes**: +4 hours
**Buffer for Issues**: +3.5 hours

**Total Estimated Time**: 38 hours (~5 working days)

### Recommended Approach
- **Week 1**: Phases 1-3 (utils + services)
- **Week 2**: Phases 4-7 (controller + routes + testing + cleanup)
- Code review after Phase 3 (services extracted)
- Code review after Phase 6 (E2E tests pass)

---

## 13. Definition of Done

### Code Checklist
- [ ] All 11 new files created
- [ ] Route file reduced to <50 LOC
- [ ] All helper functions moved to appropriate layers
- [ ] No direct Google API calls in controller
- [ ] No business logic in controller
- [ ] No req/res objects in services
- [ ] TypeScript compiles with no errors
- [ ] ESLint passes with no warnings
- [ ] No circular dependencies (validated with `madge`)

### Test Checklist
- [ ] All unit tests pass (60 test cases)
- [ ] All E2E tests pass (11 test cases)
- [ ] All regression tests pass (8 test cases)
- [ ] Test coverage >80% for all new files
- [ ] Manual testing of all 4 endpoints
- [ ] Exported function tested in dependent modules

### Documentation Checklist
- [ ] JSDoc comments on all public methods
- [ ] README.md created in `src/controllers/ga4/`
- [ ] Inline comments explain date range quirk
- [ ] Inline comments explain weighted trend formula
- [ ] Inline comments explain opportunity thresholds

### Deployment Checklist
- [ ] PR approved by 2+ reviewers
- [ ] All tests pass in CI/CD
- [ ] Staging deployment successful
- [ ] Smoke tests pass in staging
- [ ] Production deployment plan reviewed
- [ ] Rollback plan communicated to team

### Validation Checklist
- [ ] Compare response structures (original vs refactored)
- [ ] Compare error logs (original vs refactored)
- [ ] Verify exported function works in dependent modules
- [ ] Run performance profiler (no regression)
- [ ] Monitor production error rate (24 hours post-deploy)

---

## 14. Open Questions

1. **Are there any modules using `getGA4AIReadyData()` directly?**
   - Action: Search codebase before starting Phase 4
   - Impact: HIGH (breaking change if not handled)

2. **Is the date range calculation logic intentional or a bug?**
   - Current behavior: "currentMonth" is previous calendar month
   - Action: Validate with product team before Phase 2
   - Impact: MEDIUM (may affect existing reports)

3. **Should we add TypeScript interfaces for service return types?**
   - Recommendation: Yes (better type safety)
   - Action: Define interfaces in Phase 3
   - Impact: LOW (optional, improves DX)

4. **Should domain extraction logic stay in controller or move to util?**
   - Current location: `getPropertiesWithDomains()` handler (lines 530-551)
   - Recommendation: Keep in controller (not complex enough for util)
   - Impact: LOW (refactoring preference)

5. **Should we maintain existing logging format or upgrade to structured logging?**
   - Recommendation: Maintain existing format during refactor
   - Action: Add TODO comment for future enhancement
   - Impact: LOW (production monitoring may rely on current format)

---

## Appendix A: Current Helper Function Inventory

| Function | Lines | LOC | Responsibility | Target Layer | Target File |
|----------|-------|-----|----------------|--------------|-------------|
| `createAnalyticsDataClient` | 14-19 | 6 | Google client creation | Service | `service.analytics-api.ts` |
| `createAnalyticsAdminClient` | 22-27 | 6 | Google client creation | Service | `service.analytics-api.ts` |
| `handleError` | 30-38 | 9 | Error handling | Util | `util.error-handler.ts` |
| `getDateRanges` | 41-66 | 26 | Date calculation | Util | `util.date-ranges.ts` |
| `fetchGA4Data` | 69-114 | 46 | API call (simple) | Service | `service.data-fetcher.ts` |
| `fetchGA4DataWithDimensions` | 117-211 | 95 | API call (complex) | Service | `service.data-fetcher.ts` |
| `processAcquisitionData` | 214-237 | 24 | Data transformation | Service | `service.data-processor.ts` |
| `processAudienceData` | 240-257 | 18 | Data transformation | Service | `service.data-processor.ts` |
| `processBehaviorData` | 260-277 | 18 | Data transformation | Service | `service.data-processor.ts` |
| `processEcommerceData` | 280-314 | 35 | Data transformation | Service | `service.data-processor.ts` |
| `calculateGA4Opportunities` | 317-353 | 37 | Business logic | Service | `service.opportunity-detector.ts` |
| `calculateTrendScore` | 356-385 | 30 | Business logic | Service | `service.trend-calculator.ts` |

**Total Helper LOC**: 350 lines
**Total Route File LOC**: 856 lines
**Handler Logic LOC**: 506 lines (856 - 350)
**Target Route File LOC**: 30-40 lines
**Reduction**: ~95% LOC reduction in route file

---

## Appendix B: Dependency Graph

### Current Architecture (Flat)
```
routes/ga4.ts (856 LOC)
  ↓ directly calls
Google Analytics API (@googleapis/analyticsadmin, @googleapis/analyticsdata)
```

### Target Architecture (Layered)
```
routes/ga4.ts (30-40 LOC)
  ↓
Ga4Controller.ts (100-120 LOC)
  ↓
┌──────────────────────────────────────────┐
│ Services (570-680 LOC)                   │
│  - service.analytics-api.ts              │
│  - service.data-fetcher.ts               │
│  - service.trend-calculator.ts           │
│  - service.opportunity-detector.ts       │
│  - service.data-processor.ts             │
└──────────────────────────────────────────┘
  ↓
┌──────────────────────────────────────────┐
│ Utils (160-210 LOC)                      │
│  - util.date-ranges.ts                   │
│  - util.property-formatter.ts            │
│  - util.response-builder.ts              │
│  - util.error-handler.ts                 │
└──────────────────────────────────────────┘
  ↓
Google Analytics API
```

**Dependency Rules**:
- Routes only import Controllers
- Controllers import Services + Utils
- Services import Utils + External APIs
- Services do not import Controllers
- Utils do not import Services or Controllers
- No circular dependencies

---

## Appendix C: Response Structure Reference

### POST `/getKeyData` Response
```typescript
{
  activeUsers: {
    prevMonth: number,
    currMonth: number
  },
  engagementRate: {
    prevMonth: number,
    currMonth: number
  },
  conversions: {
    prevMonth: number,
    currMonth: number
  },
  trendScore: number
}
```

### GET `/diag/properties` Response
```typescript
{
  properties: Array<{
    propertyId: string,        // "properties/123456789"
    displayName: string,
    timeZone: string,
    currencyCode: string,
    accountId: string,         // "accounts/987654321"
    accountDisplayName: string
  }>
}
```

### GET `/properties/get` Response
```typescript
Array<{
  propertyId: string,          // "properties/123456789"
  domain: string               // "example.com"
}>
```

### POST `/getAIReadyData` Response
```typescript
{
  overview: {
    sessions: number,
    users: number,
    pageviews: number,
    engagementRate: number,
    avgSessionDuration: number,
    bounceRate: number,
    leadSubmissions: number,
    dateRange: { startDate: string, endDate: string }
  },
  acquisition: {
    bySource: Array<{
      source: string,
      medium: string,
      users: number,
      sessions: number,
      engagementRate: number,
      conversions: number,
      leadSubmissions: number
    }>
  },
  audience: {
    geographic: Array<{
      country: string,
      users: number,
      sessions: number,
      engagementRate: number
    }>,
    technology: Array<{
      deviceCategory: string,
      users: number,
      sessions: number,
      engagementRate: number
    }>
  },
  behavior: {
    topPages: Array<{
      page: string,
      views: number,
      users: number,
      avgEngagementTime: number,
      bounceRate: number
    }>,
    topEvents: Array<{
      eventName: string,
      eventCount: number,
      users: number
    }>
  },
  ecommerce: {
    revenue: {
      total: number,
      transactions: number,
      avgOrderValue: number
    },
    products: Array<{
      itemName: string,
      revenue: number,
      quantity: number
    }>
  },
  realTime: {
    activeUsers: number,
    popularPages: []
  },
  opportunities: Array<
    | {
        type: "high_bounce_page",
        page: string,
        bounceRate: number,
        sessions: number
      }
    | {
        type: "low_engagement_source",
        source: string,
        medium: string,
        engagementRate: number,
        users: number
      }
  >
}
```

---

**END OF PLAN**
