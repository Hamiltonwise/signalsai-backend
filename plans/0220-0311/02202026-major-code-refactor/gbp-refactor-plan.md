# GBP Route Refactor Plan

**Route File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/gbp.ts`
**Current LOC:** 1,132 lines
**Target Pattern:** Route → Controller → Service → Model
**API Type:** Pure Google API Proxy (No direct database calls in route)

---

## 1. Current State

### Overview
Large route file serving as a comprehensive proxy to Google Business Profile APIs. Handles account management, location details, reviews, posts, performance metrics, and AI-ready data aggregation. Uses OAuth2 token refresh middleware and batches multiple Google API calls for efficiency.

### Endpoints (11 Total)

1. **POST /gbp/getKeyData**
   - **Purpose:** GA4-style monthly comparison data with trend score
   - **Body:** `{ accountId: string, locationId: string }`
   - **Returns:** `{ newReviews, avgRating, callClicks }` (prev vs curr month) + trendScore
   - **Logic:** Fetches reviews (REST v4), call clicks (Performance API), calculates weighted trend
   - **Lines:** 249-349 (101 LOC)

2. **POST /gbp/getAIReadyData**
   - **Purpose:** Comprehensive location data for AI ranking/insights
   - **Body:** `{ accountId: string, locationId: string, startDate?, endDate? }`
   - **Returns:** Performance series, reviews (all-time + window), profile (NAP consistency)
   - **Logic:** Parallel fetch of time series, reviews, profile data
   - **Lines:** 529-555 (27 LOC) + exported function 425-522 (98 LOC)

3. **POST /gbp/getTextSources**
   - **Purpose:** Fetch all location profiles + posts for copy optimization LLM
   - **Headers:** `googleAccountId` (from middleware)
   - **Body:** `{ startDate?, endDate?, maxPostsPerLocation?, includeEmptyLocations? }`
   - **Returns:** Array of location profiles + posts, errors, summary stats
   - **Logic:** Database query → batch process locations → fetch profile + posts
   - **Lines:** 859-1059 (201 LOC) + exported function 671-846 (176 LOC)

4. **GET /gbp/diag/accounts**
   - **Purpose:** Diagnostic endpoint to list all GBP accounts
   - **Returns:** Array of accounts from Account Management API
   - **Lines:** 1062-1079 (18 LOC)

5. **GET /gbp/diag/locations**
   - **Purpose:** Diagnostic endpoint to list all locations for an account
   - **Query:** `accountName` (optional)
   - **Returns:** Array of locations with name, title, storeCode, metadata
   - **Lines:** 1081-1130 (50 LOC)

### Helper Functions (Move to Services/Utils)

6. **createClients()** (Lines 19-41)
   - Creates Google API clients: acctMgmt, bizInfo, perf, auth
   - **Target:** `services/gbp-api.service.ts`

7. **handleError()** (Lines 44-52)
   - Generic error handler for route responses
   - **Target:** `utils/error-handler.util.ts`

8. **getMonthlyRanges()** (Lines 55-66)
   - Calculates previous month and month-before date ranges
   - **Target:** `utils/date-helper.util.ts`

9. **buildAuthHeaders()** (Lines 68-74)
   - Constructs Bearer token headers from OAuth2 client
   - **Target:** `services/gbp-api.service.ts`

10. **listAllReviewsInRangeREST()** (Lines 76-137)
    - Paginated REST v4 reviews fetch with date filtering
    - Enum-to-number star rating conversion
    - **Target:** `services/review-handler.service.ts`

11. **fetchPerfTimeSeries()** (Lines 139-168)
    - Fetches performance metrics time series (CALL_CLICKS, etc.)
    - **Target:** `services/performance-handler.service.ts`

12. **getCallClicksTotal()** (Lines 171-201)
    - Aggregates total call clicks from performance time series
    - **Target:** `services/performance-handler.service.ts`

13. **safePercentageChange()** (Lines 204-208)
    - Calculates percentage change with division-by-zero protection
    - **Target:** `utils/metric-calculator.util.ts`

14. **calculateGBPTrendScore()** (Lines 210-235)
    - Weighted trend score: newReviews (30%), avgRating (50%), callClicks (20%)
    - **Target:** `utils/metric-calculator.util.ts`

15. **getLocationProfileForRanking()** (Lines 353-422)
    - Fetches comprehensive location profile using REST API (with retry fallback)
    - Used by AI ranking system
    - **Target:** `services/location-handler.service.ts`

16. **getLocationProfile()** (Lines 562-590)
    - Simplified profile fetch (no retry, graceful degradation)
    - **Target:** `services/location-handler.service.ts`

17. **listLocalPostsInRange()** (Lines 596-665)
    - Paginated local posts fetch with date filtering and early exit optimization
    - **EXPORTED** for practice ranking
    - **Target:** `services/post-handler.service.ts`

### Exported Functions (Public API)

18. **getGBPAIReadyData()** (Lines 425-522)
    - **Exported** for direct programmatic use (bypassing HTTP)
    - Aggregates all AI-ready data: performance, reviews, profile
    - **Target:** `gbp.controller.ts` (keep exported)

19. **getGBPTextSources()** (Lines 671-846)
    - **Exported** for direct programmatic use (bypassing HTTP)
    - Batch-fetches text sources for all locations in a Google account
    - **Target:** `gbp.controller.ts` (keep exported)

20. **listLocalPostsInRange()** (Lines 596-665)
    - **Exported** for practice ranking
    - **Target:** `services/post-handler.service.ts` (keep exported)

### Current Dependencies
```typescript
// External NPM packages
import express from "express";
import axios from "axios";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";

// Internal
import { tokenRefreshMiddleware, AuthenticatedRequest } from "../middleware/tokenRefresh";
import { db } from "../database/connection"; // Only used in getTextSources endpoints
```

### Current Responsibilities (All in Route File)
- Route definitions
- Google API client initialization
- OAuth2 token management (headers)
- REST API calls to Google (axios)
- Review pagination and filtering
- Performance metrics aggregation
- Trend score calculation
- Date range computation
- Error handling
- Response formatting
- Batch processing with rate limiting
- Database queries (only for `getTextSources` endpoints)
- Logging and diagnostics

### Issues
- Massive 1,132 LOC route file
- Complex business logic mixed with route definitions
- Helper functions scattered throughout route file
- Duplicate profile-fetching logic (`getLocationProfile` vs `getLocationProfileForRanking`)
- Error handling duplicated across endpoints
- No separation of concerns
- Hard to test individual components
- Retry logic embedded in handlers
- Batch processing logic mixed with data fetching

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── gbp.ts                                  # Route definitions only (11 endpoints)
├── controllers/
│   └── gbp/
│       ├── gbp.controller.ts                   # Main controller with all endpoint handlers
│       ├── services/
│       │   ├── gbp-api.service.ts             # Google API client creation + auth headers
│       │   ├── review-handler.service.ts      # Review fetching, pagination, star conversion
│       │   ├── performance-handler.service.ts # Performance metrics, time series, call clicks
│       │   ├── location-handler.service.ts    # Location profile fetching (unified)
│       │   └── post-handler.service.ts        # Local posts fetching with date filtering
│       └── utils/
│           ├── date-helper.util.ts            # Date range calculations
│           ├── metric-calculator.util.ts      # Trend scores, percentage changes
│           └── error-handler.util.ts          # Error handling + response formatting
```

### Layer Responsibilities

#### Route Layer (`routes/gbp.ts`)
- Route definitions only
- Maps HTTP endpoints to controller methods
- Applies middleware (tokenRefreshMiddleware)
- No business logic
- No error handling (delegated to controller)

#### Controller Layer (`controllers/gbp/gbp.controller.ts`)
- Request/response handling
- Orchestrates service calls
- Error handling and response formatting
- HTTP status code decisions
- Request parameter extraction
- Batch processing orchestration
- Exports public functions (`getGBPAIReadyData`, `getGBPTextSources`)

#### Service Layer (`controllers/gbp/services/`)
- **gbp-api.service.ts**: API client creation, auth header building
- **review-handler.service.ts**: Review fetching, pagination, star rating enum conversion
- **performance-handler.service.ts**: Performance metrics, time series aggregation
- **location-handler.service.ts**: Unified location profile fetching (with retry logic)
- **post-handler.service.ts**: Local posts fetching, date filtering, early exit optimization

#### Utils Layer (`controllers/gbp/utils/`)
- **date-helper.util.ts**: Pure date calculations (monthly ranges)
- **metric-calculator.util.ts**: Trend score, percentage change calculations
- **error-handler.util.ts**: Generic error formatting for responses

#### Model Layer
- **Not Applicable:** This route is a pure Google API proxy with minimal database access
- Database calls only in `getTextSources` (lines 692-703, 880-914) to fetch `google_accounts.google_property_ids`
- No dedicated model needed (direct `db()` calls acceptable for this simple query)

---

## 3. Code Mapping

### Route File → Controller (Lines to Move)

| Current (Lines) | Endpoint | Target Controller Method |
|----------------|----------|-------------------------|
| 249-349 | POST /getKeyData | `GbpController.getKeyData()` |
| 529-555 | POST /getAIReadyData | `GbpController.getAIReadyData()` |
| 859-1059 | POST /getTextSources | `GbpController.getTextSources()` |
| 1062-1079 | GET /diag/accounts | `GbpController.diagAccounts()` |
| 1081-1130 | GET /diag/locations | `GbpController.diagLocations()` |

### Helper Functions → Services

| Function (Lines) | Target Service | Method Name |
|-----------------|---------------|-------------|
| createClients (19-41) | `gbp-api.service.ts` | `GbpApiService.createClients(req)` |
| buildAuthHeaders (68-74) | `gbp-api.service.ts` | `GbpApiService.buildAuthHeaders(auth)` |
| listAllReviewsInRangeREST (76-137) | `review-handler.service.ts` | `ReviewHandlerService.listReviewsInRange(...)` |
| fetchPerfTimeSeries (139-168) | `performance-handler.service.ts` | `PerformanceHandlerService.fetchTimeSeries(...)` |
| getCallClicksTotal (171-201) | `performance-handler.service.ts` | `PerformanceHandlerService.getCallClicksTotal(...)` |
| getLocationProfileForRanking (353-422) | `location-handler.service.ts` | `LocationHandlerService.getProfile(..., { withRetry: true })` |
| getLocationProfile (562-590) | `location-handler.service.ts` | `LocationHandlerService.getProfile(..., { withRetry: false })` |
| listLocalPostsInRange (596-665) | `post-handler.service.ts` | `PostHandlerService.listPostsInRange(...)` |

### Helper Functions → Utils

| Function (Lines) | Target Util | Method Name |
|-----------------|-------------|-------------|
| handleError (44-52) | `error-handler.util.ts` | `ErrorHandlerUtil.handleError(res, error, operation)` |
| getMonthlyRanges (55-66) | `date-helper.util.ts` | `DateHelperUtil.getMonthlyRanges()` |
| safePercentageChange (204-208) | `metric-calculator.util.ts` | `MetricCalculatorUtil.safePercentageChange(...)` |
| calculateGBPTrendScore (210-235) | `metric-calculator.util.ts` | `MetricCalculatorUtil.calculateTrendScore(...)` |

### Exported Functions → Controller (Keep Exported)

| Function (Lines) | Target | Keep Exported? |
|-----------------|--------|----------------|
| getGBPAIReadyData (425-522) | `GbpController.getGBPAIReadyData()` | ✅ Yes (public API) |
| getGBPTextSources (671-846) | `GbpController.getGBPTextSources()` | ✅ Yes (public API) |
| listLocalPostsInRange (596-665) | `PostHandlerService.listPostsInRange()` | ✅ Yes (used by practice ranking) |

---

## 4. Step-by-Step Migration

### Phase 1: Create Utility Layers (No Dependencies)

#### Step 1.1: Create Date Helper Util
**File:** `src/controllers/gbp/utils/date-helper.util.ts`

**Purpose:** Extract date range calculation logic

**Move:**
- Lines 55-66: `getMonthlyRanges()` function

**Content:**
```typescript
export class DateHelperUtil {
  static getMonthlyRanges(): {
    prevMonth: { startDate: string; endDate: string };
    prevPrevMonth: { startDate: string; endDate: string };
  }
}
```

**Testing:** Can write unit tests immediately (pure function, no external dependencies)

---

#### Step 1.2: Create Metric Calculator Util
**File:** `src/controllers/gbp/utils/metric-calculator.util.ts`

**Purpose:** Extract calculation logic for trend scores and percentage changes

**Move:**
- Lines 204-208: `safePercentageChange()` function
- Lines 210-235: `calculateGBPTrendScore()` function

**Content:**
```typescript
export class MetricCalculatorUtil {
  static safePercentageChange(current: number, previous: number): number;
  static calculateTrendScore(currentData: any, previousData: any): number;
}
```

**Testing:** Can write unit tests immediately (pure functions)

---

#### Step 1.3: Create Error Handler Util
**File:** `src/controllers/gbp/utils/error-handler.util.ts`

**Purpose:** Generic error response formatter

**Move:**
- Lines 44-52: `handleError()` function

**Content:**
```typescript
export class ErrorHandlerUtil {
  static handleError(res: express.Response, error: any, operation: string): express.Response;
}
```

**Note:** Consider whether this should live in a shared utils folder since other controllers might use it

**Testing:** Can write unit tests with mocked response object

---

### Phase 2: Create Service Layer (API Interaction)

#### Step 2.1: Create GBP API Service
**File:** `src/controllers/gbp/services/gbp-api.service.ts`

**Purpose:** Google API client initialization and auth header building

**Move:**
- Lines 19-41: `createClients()` function
- Lines 68-74: `buildAuthHeaders()` function

**Content:**
```typescript
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";
import { AuthenticatedRequest } from "../../../middleware/tokenRefresh";

export class GbpApiService {
  static createClients(req: AuthenticatedRequest): {
    acctMgmt: mybusinessaccountmanagement_v1.Mybusinessaccountmanagement;
    bizInfo: mybusinessbusinessinformation_v1.Mybusinessbusinessinformation;
    perf: businessprofileperformance_v1.Businessprofileperformance;
    auth: any;
  };

  static async buildAuthHeaders(auth: any): Promise<Record<string, string>>;
}
```

**Dependencies:**
- Google API packages
- `AuthenticatedRequest` type from middleware

**Testing:** Can write unit tests with mocked OAuth2 client

---

#### Step 2.2: Create Review Handler Service
**File:** `src/controllers/gbp/services/review-handler.service.ts`

**Purpose:** Review fetching, pagination, star rating conversion

**Move:**
- Lines 76-137: `listAllReviewsInRangeREST()` function

**Content:**
```typescript
import axios from "axios";

export class ReviewHandlerService {
  static async listReviewsInRange(
    auth: any,
    accountId: string,
    locationId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    newReviewsCount: number;
    avgRatingWindow: number | null;
  }>;
}
```

**Dependencies:**
- `axios` for REST API calls
- `GbpApiService.buildAuthHeaders()` for auth

**Testing:** Can mock axios calls

---

#### Step 2.3: Create Performance Handler Service
**File:** `src/controllers/gbp/services/performance-handler.service.ts`

**Purpose:** Performance metrics, time series aggregation, call clicks

**Move:**
- Lines 139-168: `fetchPerfTimeSeries()` function
- Lines 171-201: `getCallClicksTotal()` function

**Content:**
```typescript
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";

export class PerformanceHandlerService {
  static async fetchTimeSeries(
    perf: businessprofileperformance_v1.Businessprofileperformance,
    locationId: string,
    metrics: string[],
    startDate: string,
    endDate: string
  ): Promise<any[]>;

  static async getCallClicksTotal(
    perf: businessprofileperformance_v1.Businessprofileperformance,
    locationId: string,
    startDate: string,
    endDate: string
  ): Promise<{ callClicksTotal: number }>;
}
```

**Dependencies:**
- Google Performance API package

**Testing:** Can mock Performance API client

---

#### Step 2.4: Create Location Handler Service
**File:** `src/controllers/gbp/services/location-handler.service.ts`

**Purpose:** Unified location profile fetching with configurable retry logic

**Move:**
- Lines 353-422: `getLocationProfileForRanking()` function
- Lines 562-590: `getLocationProfile()` function

**Refactor:** Merge duplicate logic into single function with options parameter

**Content:**
```typescript
import axios from "axios";

export class LocationHandlerService {
  static async getProfile(
    auth: any,
    accountId: string,
    locationId: string,
    options?: {
      withRetry?: boolean;  // Controls retry with alternate format
      readMask?: string;    // Custom field mask
    }
  ): Promise<any | null>;
}
```

**Dependencies:**
- `axios` for REST API calls
- `GbpApiService.buildAuthHeaders()` for auth

**Key Improvement:** Single implementation that:
- Uses `withRetry: true` for ranking system (lines 353-422)
- Uses `withRetry: false` for text sources (lines 562-590)
- Eliminates code duplication

**Testing:** Can mock axios calls, test retry logic

---

#### Step 2.5: Create Post Handler Service
**File:** `src/controllers/gbp/services/post-handler.service.ts`

**Purpose:** Local posts fetching with date filtering and early exit optimization

**Move:**
- Lines 596-665: `listLocalPostsInRange()` function

**Content:**
```typescript
import axios from "axios";

export class PostHandlerService {
  static async listPostsInRange(
    auth: any,
    accountId: string,
    locationId: string,
    startDate: string,
    endDate: string,
    maxPosts?: number
  ): Promise<any[]>;
}
```

**Dependencies:**
- `axios` for REST API calls
- `GbpApiService.buildAuthHeaders()` for auth

**Export:** Keep exported for use by practice ranking system

**Testing:** Can mock axios calls, test pagination and early exit logic

---

### Phase 3: Create Controller Layer

#### Step 3.1: Create GBP Controller
**File:** `src/controllers/gbp/gbp.controller.ts`

**Purpose:** Orchestrate all endpoint handlers, export public API functions

**Move:**
- Lines 249-349: `getKeyData` route handler → `GbpController.getKeyData()`
- Lines 529-555: `getAIReadyData` route handler → `GbpController.getAIReadyData()`
- Lines 425-522: `getGBPAIReadyData()` exported function → `GbpController.getGBPAIReadyData()`
- Lines 859-1059: `getTextSources` route handler → `GbpController.getTextSources()`
- Lines 671-846: `getGBPTextSources()` exported function → `GbpController.getGBPTextSources()`
- Lines 1062-1079: `diagAccounts` route handler → `GbpController.diagAccounts()`
- Lines 1081-1130: `diagLocations` route handler → `GbpController.diagLocations()`

**Content:**
```typescript
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import express from "express";
import { GbpApiService } from "./services/gbp-api.service";
import { ReviewHandlerService } from "./services/review-handler.service";
import { PerformanceHandlerService } from "./services/performance-handler.service";
import { LocationHandlerService } from "./services/location-handler.service";
import { PostHandlerService } from "./services/post-handler.service";
import { DateHelperUtil } from "./utils/date-helper.util";
import { MetricCalculatorUtil } from "./utils/metric-calculator.util";
import { ErrorHandlerUtil } from "./utils/error-handler.util";

export class GbpController {
  // HTTP Endpoint Handlers
  static async getKeyData(req: AuthenticatedRequest, res: express.Response): Promise<void>;
  static async getAIReadyData(req: AuthenticatedRequest, res: express.Response): Promise<void>;
  static async getTextSources(req: AuthenticatedRequest, res: express.Response): Promise<void>;
  static async diagAccounts(req: AuthenticatedRequest, res: express.Response): Promise<void>;
  static async diagLocations(req: AuthenticatedRequest, res: express.Response): Promise<void>;

  // Exported Public API Functions (for programmatic use)
  static async getGBPAIReadyData(
    oauth2Client: any,
    accountId: string,
    locationId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any>;

  static async getGBPTextSources(
    oauth2Client: any,
    googleAccountId: number,
    startDate?: string,
    endDate?: string,
    options?: {
      maxPostsPerLocation?: number;
      includeEmptyLocations?: boolean;
    }
  ): Promise<any>;
}
```

**Dependencies:**
- All service classes
- All util classes
- `AuthenticatedRequest` type
- `express` for response types
- `db` from `../../database/connection` (only for `getTextSources` methods)

**Testing:** Can write integration tests with mocked services

---

### Phase 4: Update Route File

#### Step 4.1: Refactor Route File
**File:** `src/routes/gbp.ts`

**Action:** Replace all logic with controller method calls

**Before:** 1,132 lines
**After:** ~50-60 lines (route definitions only)

**Content:**
```typescript
import express from "express";
import { tokenRefreshMiddleware, AuthenticatedRequest } from "../middleware/tokenRefresh";
import { GbpController } from "../controllers/gbp/gbp.controller";

const gbpRoutes = express.Router();

// Apply token refresh middleware to all GBP routes
gbpRoutes.use(tokenRefreshMiddleware);

// Main data endpoints
gbpRoutes.post("/getKeyData", GbpController.getKeyData);
gbpRoutes.post("/getAIReadyData", GbpController.getAIReadyData);
gbpRoutes.post("/getTextSources", GbpController.getTextSources);

// Diagnostic endpoints
gbpRoutes.get("/diag/accounts", GbpController.diagAccounts);
gbpRoutes.get("/diag/locations", GbpController.diagLocations);

// Export controller functions for programmatic use
export { getGBPAIReadyData, getGBPTextSources } from "../controllers/gbp/gbp.controller";

// Export service functions used by other systems
export { listPostsInRange } from "../controllers/gbp/services/post-handler.service";

export default gbpRoutes;
```

**Changes:**
- Remove all helper functions
- Remove all inline logic
- Keep middleware application
- Delegate to controller methods
- Re-export public API functions from controller
- Re-export `listPostsInRange` from service (used by practice ranking)

---

### Phase 5: Update External References

#### Step 5.1: Find and Update Imports of Exported Functions
**Action:** Search codebase for imports of exported functions

**Search for:**
```bash
grep -r "from.*routes/gbp" --include="*.ts" --exclude-dir=node_modules
```

**Update:**
- `getGBPAIReadyData` → now imported from `controllers/gbp/gbp.controller.ts`
- `getGBPTextSources` → now imported from `controllers/gbp/gbp.controller.ts`
- `listLocalPostsInRange` → now imported from `controllers/gbp/services/post-handler.service.ts`

**Files to Update:**
- Any AI ranking system files
- Practice ranking files
- Copy optimizer files
- Agent files that use GBP data

---

### Phase 6: Testing & Validation

#### Step 6.1: Unit Tests
**Create test files:**
- `src/controllers/gbp/utils/__tests__/date-helper.util.test.ts`
- `src/controllers/gbp/utils/__tests__/metric-calculator.util.test.ts`
- `src/controllers/gbp/utils/__tests__/error-handler.util.test.ts`
- `src/controllers/gbp/services/__tests__/gbp-api.service.test.ts`
- `src/controllers/gbp/services/__tests__/review-handler.service.test.ts`
- `src/controllers/gbp/services/__tests__/performance-handler.service.test.ts`
- `src/controllers/gbp/services/__tests__/location-handler.service.test.ts`
- `src/controllers/gbp/services/__tests__/post-handler.service.test.ts`

**Test Coverage:**
- Utils: Pure functions (100% coverage goal)
- Services: Mock axios and Google API clients
- Controller: Mock all services, test orchestration logic

---

#### Step 6.2: Integration Tests
**Test endpoints with real OAuth2 flow:**
- POST /gbp/getKeyData
- POST /gbp/getAIReadyData
- POST /gbp/getTextSources
- GET /gbp/diag/accounts
- GET /gbp/diag/locations

**Test exported functions:**
- `getGBPAIReadyData()` with test credentials
- `getGBPTextSources()` with test credentials
- `listPostsInRange()` with test credentials

---

#### Step 6.3: Manual Testing Checklist
- [ ] All 5 HTTP endpoints return expected responses
- [ ] Error handling works correctly (invalid accountId, missing token)
- [ ] Rate limiting works (20 location max for text sources)
- [ ] Batch processing works (5 locations per batch)
- [ ] Retry logic works (location profile with alternate format)
- [ ] Date range defaults work (previous month)
- [ ] Trend score calculation is accurate
- [ ] Star rating enum conversion works (ONE → 1, FIVE → 5)
- [ ] Empty location filtering works (includeEmptyLocations flag)
- [ ] Exported functions work when called programmatically

---

## 5. Files to Create

### Utils (3 files)
1. `src/controllers/gbp/utils/date-helper.util.ts`
2. `src/controllers/gbp/utils/metric-calculator.util.ts`
3. `src/controllers/gbp/utils/error-handler.util.ts`

### Services (5 files)
4. `src/controllers/gbp/services/gbp-api.service.ts`
5. `src/controllers/gbp/services/review-handler.service.ts`
6. `src/controllers/gbp/services/performance-handler.service.ts`
7. `src/controllers/gbp/services/location-handler.service.ts`
8. `src/controllers/gbp/services/post-handler.service.ts`

### Controller (1 file)
9. `src/controllers/gbp/gbp.controller.ts`

### Tests (9 files - Optional but Recommended)
10. `src/controllers/gbp/utils/__tests__/date-helper.util.test.ts`
11. `src/controllers/gbp/utils/__tests__/metric-calculator.util.test.ts`
12. `src/controllers/gbp/utils/__tests__/error-handler.util.test.ts`
13. `src/controllers/gbp/services/__tests__/gbp-api.service.test.ts`
14. `src/controllers/gbp/services/__tests__/review-handler.service.test.ts`
15. `src/controllers/gbp/services/__tests__/performance-handler.service.test.ts`
16. `src/controllers/gbp/services/__tests__/location-handler.service.test.ts`
17. `src/controllers/gbp/services/__tests__/post-handler.service.test.ts`
18. `src/controllers/gbp/__tests__/gbp.controller.test.ts`

**Total New Files:** 9 production files + 9 test files = 18 files

---

## 6. Files to Modify

1. **`src/routes/gbp.ts`**
   - Replace 1,132 LOC with ~50-60 LOC
   - Remove all helper functions and inline logic
   - Keep route definitions and middleware
   - Import and delegate to controller methods
   - Re-export public API functions

2. **Files that import exported functions** (TBD - requires search)
   - Update imports of `getGBPAIReadyData`
   - Update imports of `getGBPTextSources`
   - Update imports of `listLocalPostsInRange`

**Estimated Files to Modify:** 1 confirmed + 2-5 estimated (depends on codebase usage)

---

## 7. Risk Assessment

### Complexity: MODERATE

**Factors:**
- Large file (1,132 LOC) with many responsibilities
- Multiple exported functions used by other systems
- Complex business logic (trend scores, batch processing, retry logic)
- External API dependencies (Google APIs)
- Rate limiting and batch processing logic
- Database queries (minimal, only for `getTextSources`)

### Risks & Mitigations

#### Risk 1: Breaking Exported Function Contracts
**Severity:** High
**Impact:** AI ranking system, practice ranking, copy optimizer may break
**Mitigation:**
- Keep exact function signatures unchanged
- Maintain export paths through route file
- Test all exported functions after refactor
- Search codebase for all import locations before modifying

#### Risk 2: Google API Rate Limits
**Severity:** Medium
**Impact:** Batch processing may fail or timeout
**Mitigation:**
- Preserve existing rate limit logic (20 location max, 5 per batch)
- Preserve 1-second delay between batches (line 821)
- Test with multiple locations to ensure rate limiting works
- Add logging to track batch progress

#### Risk 3: Retry Logic Regression
**Severity:** Medium
**Impact:** Location profile fetching may fail for some locations
**Mitigation:**
- Carefully preserve retry logic from `getLocationProfileForRanking()` (lines 384-420)
- Add unit tests for retry scenarios
- Test with both successful and failed alternate format attempts

#### Risk 4: Star Rating Enum Conversion
**Severity:** Low
**Impact:** Review ratings may be incorrect or null
**Mitigation:**
- Preserve exact enum-to-number mapping (lines 87-93, 121-130)
- Add unit tests for all enum values (ONE, TWO, THREE, FOUR, FIVE)
- Test with both string and number star ratings

#### Risk 5: Date Range Calculation
**Severity:** Low
**Impact:** Wrong month ranges could skew metrics
**Mitigation:**
- Preserve exact date logic from lines 55-66
- Add unit tests for edge cases (year boundaries, February)
- Verify with manual testing

#### Risk 6: Trend Score Formula
**Severity:** Low
**Impact:** Incorrect trend score could mislead users
**Mitigation:**
- Preserve exact formula: newReviews (30%), avgRating (50%), callClicks (20%)
- Add unit tests with known inputs/outputs
- Document formula in code comments

#### Risk 7: Database Query Changes
**Severity:** Low
**Impact:** `getTextSources` may fail to fetch location IDs
**Mitigation:**
- Database query is simple (lines 692-703, 880-914)
- No model layer needed for this query
- Test with real database to ensure query works

#### Risk 8: Middleware Dependency
**Severity:** Low
**Impact:** Token refresh may break if middleware changes
**Mitigation:**
- `tokenRefreshMiddleware` is external to this refactor
- No changes to middleware
- `AuthenticatedRequest` type preserved

---

## 8. Rollback Plan

### Pre-Refactor Backup
1. Create git branch: `refactor/gbp-route`
2. Commit current state with tag: `pre-gbp-refactor`
3. Keep original route file as `gbp.ts.backup` during development

### Rollback Triggers
- Any exported function breaks external systems
- Rate limiting fails causing API quota exhaustion
- Trend score calculations produce incorrect results
- Batch processing fails or times out
- More than 2 integration tests fail

### Rollback Steps
1. Revert all commits on `refactor/gbp-route` branch
2. Restore `gbp.ts` from `pre-gbp-refactor` tag
3. Delete all new controller/service/util files
4. Restart application
5. Verify all endpoints work with backup route file

### Partial Rollback Option
- Keep service/util layers for testing
- Only revert controller and route file
- Allows incremental debugging

---

## 9. Testing Strategy

### Unit Testing Priority

**High Priority (Must Test):**
1. `MetricCalculatorUtil.calculateTrendScore()` - Critical business logic
2. `MetricCalculatorUtil.safePercentageChange()` - Handles division by zero
3. `DateHelperUtil.getMonthlyRanges()` - Date boundaries are error-prone
4. `ReviewHandlerService.listReviewsInRange()` - Enum conversion + pagination
5. `LocationHandlerService.getProfile()` - Retry logic is complex

**Medium Priority (Should Test):**
6. `PerformanceHandlerService.fetchTimeSeries()` - Date parsing logic
7. `PerformanceHandlerService.getCallClicksTotal()` - Aggregation logic
8. `PostHandlerService.listPostsInRange()` - Early exit optimization
9. `GbpApiService.buildAuthHeaders()` - Token extraction logic

**Low Priority (Nice to Have):**
10. `GbpApiService.createClients()` - Simple factory method
11. `ErrorHandlerUtil.handleError()` - Generic error formatter

### Integration Testing

**Critical Endpoints:**
1. POST /gbp/getKeyData - Most complex, uses all services
2. POST /gbp/getAIReadyData - Parallel fetching logic
3. POST /gbp/getTextSources - Batch processing + rate limiting

**Secondary Endpoints:**
4. GET /gbp/diag/accounts - Simple, low risk
5. GET /gbp/diag/locations - Simple pagination

### Manual Testing

**Test Scenarios:**
1. Valid accountId + locationId → Success response
2. Invalid accountId → 400 error
3. Missing OAuth token → 401 error
4. >20 locations for text sources → 400 error with rate limit message
5. Empty location (no posts) → Excluded if `includeEmptyLocations: false`
6. Location with retry needed → Alternate format works
7. Custom date range → Respects startDate/endDate params
8. Default date range → Uses previous month

---

## 10. Performance Considerations

### No Performance Degradation Expected

**Reasons:**
1. All logic is extracted, not rewritten
2. No additional async/await overhead
3. No new network calls
4. Same batch processing logic
5. Same rate limiting logic
6. Same retry logic

### Potential Performance Improvements

1. **Service Caching (Future):**
   - Location profiles could be cached (currently fetched every time)
   - Posts could be cached with TTL
   - Would require cache invalidation strategy

2. **Parallel Batching (Future):**
   - Current batch size: 5 locations sequentially
   - Could increase to 10 with better rate limit handling
   - Would require testing against Google API quotas

3. **Response Streaming (Future):**
   - Text sources endpoint could stream results as they're fetched
   - Would improve perceived performance for large location sets
   - Requires architectural change (not part of this refactor)

---

## 11. Documentation Requirements

### Code Documentation

**Each service/util class needs:**
1. Class-level JSDoc comment explaining purpose
2. Method-level JSDoc for all public methods
3. Parameter descriptions
4. Return type descriptions
5. Example usage (for exported functions)

**Controller needs:**
1. Endpoint mapping table (HTTP method → controller method)
2. Exported function documentation
3. Error handling strategy
4. Rate limiting explanation

### API Documentation

**Update API docs for:**
1. POST /gbp/getKeyData
2. POST /gbp/getAIReadyData
3. POST /gbp/getTextSources
4. GET /gbp/diag/accounts
5. GET /gbp/diag/locations

**Include:**
- Request/response examples
- Error codes
- Rate limits
- Date format requirements
- Optional parameters

---

## 12. Migration Checklist

### Pre-Migration
- [ ] Create git branch: `refactor/gbp-route`
- [ ] Commit current state with tag: `pre-gbp-refactor`
- [ ] Search codebase for all imports of exported functions
- [ ] Document all external dependencies on exported functions
- [ ] Create directory structure: `controllers/gbp/`, `services/`, `utils/`

### Phase 1: Utils (Day 1)
- [ ] Create `date-helper.util.ts`
- [ ] Create `metric-calculator.util.ts`
- [ ] Create `error-handler.util.ts`
- [ ] Write unit tests for all utils
- [ ] Verify all tests pass

### Phase 2: Services (Day 2-3)
- [ ] Create `gbp-api.service.ts`
- [ ] Create `review-handler.service.ts`
- [ ] Create `performance-handler.service.ts`
- [ ] Create `location-handler.service.ts` (merge duplicate profile functions)
- [ ] Create `post-handler.service.ts`
- [ ] Write unit tests for all services
- [ ] Verify all tests pass

### Phase 3: Controller (Day 4)
- [ ] Create `gbp.controller.ts`
- [ ] Move all endpoint handlers to controller methods
- [ ] Move all exported functions to controller
- [ ] Wire up all service dependencies
- [ ] Write integration tests for controller
- [ ] Verify all tests pass

### Phase 4: Route Refactor (Day 5)
- [ ] Update `routes/gbp.ts` to use controller
- [ ] Remove all inline logic
- [ ] Keep middleware application
- [ ] Re-export public API functions
- [ ] Re-export service functions (listPostsInRange)
- [ ] Verify route file is <100 LOC

### Phase 5: External Updates (Day 5)
- [ ] Update all imports of `getGBPAIReadyData`
- [ ] Update all imports of `getGBPTextSources`
- [ ] Update all imports of `listLocalPostsInRange`
- [ ] Verify no broken imports remain

### Phase 6: Testing (Day 6)
- [ ] Run all unit tests
- [ ] Run all integration tests
- [ ] Manual test all 5 endpoints
- [ ] Test all 3 exported functions
- [ ] Test rate limiting (>20 locations)
- [ ] Test batch processing (5 per batch)
- [ ] Test retry logic (location profile)
- [ ] Test error scenarios (invalid accountId, missing token)
- [ ] Verify trend score calculations
- [ ] Verify star rating conversions

### Phase 7: Documentation (Day 7)
- [ ] Add JSDoc to all classes
- [ ] Add JSDoc to all public methods
- [ ] Update API documentation
- [ ] Add usage examples for exported functions
- [ ] Document rate limits
- [ ] Document batch processing strategy

### Post-Migration
- [ ] Deploy to staging environment
- [ ] Monitor for errors in staging
- [ ] Run smoke tests in staging
- [ ] Deploy to production
- [ ] Monitor production logs for 24 hours
- [ ] Archive backup files after 1 week of stable production

---

## 13. Definition of Done

### Code Quality
- [ ] All new files follow TypeScript strict mode
- [ ] All public methods have JSDoc comments
- [ ] No linting errors
- [ ] No TypeScript compilation errors
- [ ] All imports use absolute paths (no relative `../../..`)

### Testing
- [ ] 100% unit test coverage for utils
- [ ] >80% unit test coverage for services
- [ ] Integration tests for all endpoints
- [ ] All exported functions have test coverage
- [ ] Manual testing checklist 100% complete

### Functionality
- [ ] All 5 HTTP endpoints work correctly
- [ ] All 3 exported functions work correctly
- [ ] Error handling preserves original behavior
- [ ] Rate limiting works (20 location max)
- [ ] Batch processing works (5 per batch with 1s delay)
- [ ] Retry logic works (location profile alternate format)
- [ ] Trend score calculation matches original formula
- [ ] Star rating enum conversion works

### Documentation
- [ ] JSDoc added to all classes
- [ ] JSDoc added to all public methods
- [ ] API documentation updated
- [ ] Usage examples added for exported functions
- [ ] Rate limits documented
- [ ] Migration completed without rollback

### Performance
- [ ] No performance degradation vs original
- [ ] Response times within 10% of baseline
- [ ] No memory leaks
- [ ] No increased error rates

### Architecture
- [ ] Route file <100 LOC
- [ ] Controller orchestrates services (no business logic)
- [ ] Services contain single responsibility
- [ ] Utils are pure functions (no side effects)
- [ ] No circular dependencies
- [ ] Clear separation of concerns

---

## 14. Success Metrics

### Quantitative
1. **LOC Reduction:** 1,132 → ~400-500 LOC total (across all files)
2. **Route File Size:** 1,132 → ~50-60 LOC (95% reduction)
3. **Test Coverage:** 0% → >80% for critical paths
4. **Cyclomatic Complexity:** Reduce per-function complexity by 50%
5. **Response Time:** No degradation (within 10% of baseline)

### Qualitative
1. **Maintainability:** Code is easier to understand and modify
2. **Testability:** Individual components can be tested in isolation
3. **Reusability:** Services can be used by other systems
4. **Documentation:** Public API is well-documented
5. **Separation of Concerns:** Clear boundaries between layers

---

## 15. Key Improvements After Refactor

### Architectural Benefits
1. **Single Responsibility:** Each service/util has one clear purpose
2. **Testability:** Pure functions and mocked dependencies
3. **Reusability:** Services can be imported by other systems
4. **Maintainability:** Easy to locate and modify specific logic
5. **Observability:** Logging can be added at service boundaries

### Code Quality Improvements
1. **Eliminated Duplication:** `getLocationProfile()` functions merged
2. **Clear Naming:** Service classes describe what they do
3. **Type Safety:** Explicit types for all service methods
4. **Error Handling:** Centralized error formatter
5. **Documentation:** JSDoc on all public methods

### Future Extensibility
1. **Add Caching:** Can add Redis cache to services
2. **Add Monitoring:** Can add metrics at service boundaries
3. **Add Rate Limiting:** Can enhance rate limiting in services
4. **Add Validation:** Can add Zod schemas to utils
5. **Add Testing:** Can add E2E tests for critical flows

---

## 16. Related Systems to Monitor

### Direct Dependencies (Will Import Refactored Code)
1. **AI Ranking System** - Uses `getGBPAIReadyData()`
2. **Practice Ranking** - Uses `listLocalPostsInRange()`
3. **Copy Optimizer** - Uses `getGBPTextSources()`
4. **Agent System** - May use GBP data directly

### Indirect Dependencies (Use GBP Endpoints via HTTP)
1. **Frontend Dashboard** - Calls POST /gbp/getKeyData
2. **Admin Panel** - Calls GET /gbp/diag/accounts, /diag/locations
3. **Scheduled Jobs** - May fetch GBP data periodically
4. **Webhooks** - May trigger GBP data fetching

### Monitoring Strategy
- Track error rates for all 5 endpoints
- Monitor response times for all endpoints
- Log all calls to exported functions
- Alert on any 500 errors
- Alert on rate limit violations

---

## 17. Alternatives Considered

### Alternative 1: Minimal Refactor (Utils Only)
**Approach:** Extract only utils, leave services in route file
**Pros:** Lower risk, faster implementation
**Cons:** Doesn't solve main problem (1,132 LOC route file), limited testability
**Rejected:** Doesn't achieve separation of concerns

### Alternative 2: Microservice Extraction
**Approach:** Move entire GBP route to separate service
**Pros:** Complete isolation, independent scaling
**Cons:** High complexity, requires infrastructure changes, network overhead
**Rejected:** Overengineered for current needs

### Alternative 3: Keep Route File, Add Service Facade
**Approach:** Create single `GbpService` class, keep logic in route file
**Pros:** Minimal changes, lower risk
**Cons:** Doesn't improve testability, single god class, still 1,132 LOC
**Rejected:** Doesn't solve maintainability issues

### Alternative 4: Gradual Extraction (Endpoint by Endpoint)
**Approach:** Refactor one endpoint at a time over multiple sprints
**Pros:** Lower risk per deployment, easier rollback
**Cons:** Long migration timeline, mixed patterns during transition
**Considered:** Could be valid if timeline is tight, but full refactor is preferred

### Chosen Approach: Full Service Layer Extraction
**Rationale:**
- Achieves clear separation of concerns
- Enables unit testing of all components
- Reduces route file to manageable size
- Sets pattern for future route refactors
- Single migration reduces context switching
- Balances risk vs reward

---

## 18. Post-Refactor Enhancements (Future Work)

### Short-Term (1-2 Sprints)
1. **Add Zod Validation:** Validate all request bodies with schemas
2. **Add Caching:** Cache location profiles with 5-minute TTL
3. **Add Metrics:** Track endpoint response times and error rates
4. **Improve Logging:** Structured logs with request IDs

### Medium-Term (3-6 Sprints)
1. **Response Streaming:** Stream text sources as they're fetched
2. **Increase Batch Size:** Test higher batch sizes (10-20 per batch)
3. **Add Retry Logic:** Exponential backoff for all Google API calls
4. **Add Circuit Breaker:** Prevent cascading failures

### Long-Term (6-12 Sprints)
1. **Event-Driven Updates:** Webhook-based cache invalidation
2. **Multi-Region Support:** Handle multiple GBP regions
3. **Advanced Analytics:** Trend analysis across multiple time periods
4. **AI Insights:** Automated recommendations based on GBP data

---

## End of Plan

**Plan Status:** Ready for Review
**Estimated Effort:** 6-7 developer days
**Risk Level:** Moderate
**Dependencies:** None (self-contained refactor)
**Blockers:** None

**Next Steps:**
1. Review plan with team
2. Get approval to proceed
3. Create git branch and start Phase 1
