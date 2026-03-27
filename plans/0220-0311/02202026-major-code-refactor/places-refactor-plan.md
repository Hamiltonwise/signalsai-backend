# Places Route Refactor Plan

## Current State

### File Location
`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/places.ts`

### Lines of Code
431 LOC (including comments and whitespace)

### Endpoints
1. **POST /api/places/autocomplete** (Lines 66-133)
   - Purpose: Search for businesses using Google Places Autocomplete
   - Protection: None (public API wrapper)
   - Input: `{ input: string, sessionToken?: string }`
   - Response: `{ success: true, suggestions: Array<{ placeId, mainText, secondaryText, description }> }`
   - External API: `POST https://places.googleapis.com/v1/places:autocomplete`

2. **GET /api/places/:placeId** (Lines 149-260)
   - Purpose: Get detailed information for a specific place
   - Protection: None (public API wrapper)
   - Params: `placeId` (Google Place ID)
   - Query: `sessionToken?: string`
   - Response: `{ success: true, place: PlaceDetails }`
   - External API: `GET https://places.googleapis.com/v1/places/{placeId}`

3. **POST /api/places/search** (Lines 275-428)
   - Purpose: Combined autocomplete + get first result details
   - Protection: None (public API wrapper)
   - Input: `{ query: string }`
   - Response: `{ success: true, place: PlaceDetails | null, alternatives: Array<Suggestion> }`
   - External API: Two-step (autocomplete then details)

### Current Dependencies
- `express` - routing framework
- `axios` - HTTP client for Google Places API
- Environment variable: `GOOGLE_PLACES_API`
- Google Places API v1 (New Places API)

### Direct External API Calls
1. **Line 86-99**: POST to `/places:autocomplete` - autocomplete search
2. **Line 187-194**: GET to `/places/{placeId}` - place details lookup
3. **Line 296-308**: POST to `/places:autocomplete` - autocomplete search (in combined endpoint)
4. **Line 346-355**: GET to `/places/{placeId}` - place details lookup (in combined endpoint)

### Business Logic in Route
- **Lines 12-52**: `extractCityState()` helper - parses city/state from Google address components or formatted address
- **Lines 68-75**: Input validation (query param presence/type)
- **Lines 77-82**: API key configuration check
- **Lines 86-99**: Google API autocomplete request construction
- **Lines 101-115**: Response transformation (suggestions mapping)
- **Lines 154-159**: placeId validation
- **Lines 171-185**: Field mask construction for details API
- **Lines 187-194**: Google API details request construction
- **Lines 198-213**: City/state extraction and domain parsing
- **Lines 215-239**: Place object construction with derived fields
- **Lines 296-308**: Duplicate autocomplete logic
- **Lines 333-344**: Duplicate field mask construction
- **Lines 346-355**: Duplicate details request
- **Lines 358-395**: Duplicate place object construction
- **Lines 399-407**: Alternatives mapping
- **Lines 124-132**: Error handling with Google API error extraction
- **Lines 250-259**: Duplicate error handling
- **Lines 418-427**: Duplicate error handling

### Data Transformations
1. **extractCityState()** (Lines 12-52)
   - Input: `addressComponents[]`, `formattedAddress`
   - Output: `{ city: string, state: string }`
   - Logic: Tries address components first, falls back to regex parsing

2. **Domain Extraction** (Lines 205-213, 363-371)
   - Input: `websiteUri` string
   - Output: Clean domain without `www.`
   - Logic: URL parsing with try/catch fallback

3. **Display String Construction** (Lines 215-221, 373-379)
   - `displayString`: `"Name, City, State"` or `"Name"`
   - `practiceSearchString`: `"Name, Full Address"` or `"Name"`

4. **Suggestions Mapping** (Lines 101-115)
   - Extracts structured fields from Google's nested response
   - Maps to simplified format

5. **Place Object Construction** (Lines 223-239, 381-395)
   - Combines multiple Google API fields
   - Adds derived fields (displayString, practiceSearchString, domain)
   - Normalizes nullable fields

### Code Duplication
**Major duplication between `GET /:placeId` and `POST /search` endpoints:**
- Field mask construction (lines 171-185 vs 333-344)
- Place details API call (lines 187-194 vs 346-355)
- City/state extraction (lines 198-202 vs 358-361)
- Domain parsing (lines 205-213 vs 363-371)
- Place object construction (lines 215-239 vs 381-395)
- Error handling (lines 250-259 vs 418-427)

**~100 lines of duplicate logic between the two detail-fetching endpoints.**

---

## Target Architecture

```
signalsai-backend/src/
├── controllers/
│   └── places/
│       ├── PlacesController.ts              # Main controller
│       ├── feature-services/
│       │   ├── GooglePlacesApiService.ts    # Google API communication layer
│       │   └── PlaceDataTransformService.ts # Data transformation/normalization
│       └── feature-utils/
│           ├── addressParser.ts             # extractCityState + related parsing
│           ├── domainExtractor.ts           # URL → clean domain
│           └── fieldMasks.ts                # Google API field mask constants
└── routes/
    └── places.ts                             # Stripped down to route definitions only
```

### Architecture Principles
- **Controller**: Request/response handling, HTTP concerns, validation
- **Service Layer**: External API orchestration, business logic, error handling
- **Utils**: Pure functions for parsing, transformation, formatting
- **No DB calls**: This is a pure API proxy, no database interaction

---

## Mapping

### What Moves to Controller
**File: `PlacesController.ts`**
- Request validation (input/placeId presence and type)
- Response formatting (success/error structure)
- HTTP status code decisions (400, 500, 200)
- Error-to-HTTP-response mapping
- Entry point for all three endpoints

**Methods:**
- `autocomplete(req: Request, res: Response)` - handles POST /autocomplete
- `getPlaceDetails(req: Request, res: Response)` - handles GET /:placeId
- `quickSearch(req: Request, res: Response)` - handles POST /search

**Responsibilities:**
- Extract params/query/body
- Validate input types
- Call service layer
- Format response
- Handle service errors and convert to HTTP responses
- Logging at request/response boundaries

### What Moves to Services
**File: `GooglePlacesApiService.ts`**

Core service for all Google Places API interactions. Single source of truth for API communication.

**Methods:**
- `autocomplete(input: string, sessionToken?: string): Promise<PlaceSuggestion[]>`
  - Calls Google autocomplete API
  - Transforms raw response to normalized suggestions
  - Throws on API errors

- `getPlaceDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails>`
  - Calls Google place details API
  - Uses field mask
  - Throws on API errors
  - Returns raw Google response (transformation happens in PlaceDataTransformService)

- `quickSearch(query: string): Promise<{ place: PlaceDetails | null, alternatives: PlaceSuggestion[] }>`
  - Orchestrates autocomplete + details lookup
  - Returns first result details + alternative suggestions
  - Handles zero-results case

**Dependencies:**
- `axios` for HTTP calls
- `GOOGLE_PLACES_API` env variable
- Field masks from `fieldMasks.ts`
- Error handling utilities

**Error Handling:**
- Wraps Google API errors with context
- Extracts error messages from Google response structure
- Throws custom errors that controller can map to HTTP responses

---

**File: `PlaceDataTransformService.ts`**

Handles all data transformation and normalization logic.

**Methods:**
- `transformPlaceDetailsResponse(googleResponse: any): PlaceDetails`
  - Takes raw Google API response
  - Extracts city/state using addressParser
  - Extracts domain using domainExtractor
  - Constructs displayString and practiceSearchString
  - Returns normalized PlaceDetails object

- `transformAutocompleteSuggestions(googleSuggestions: any[]): PlaceSuggestion[]`
  - Maps Google suggestion format to simplified structure
  - Extracts structured text fields

**Dependencies:**
- `addressParser.ts` utilities
- `domainExtractor.ts` utilities

**Type Definitions:**
```typescript
interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  displayString: string;
  practiceSearchString: string;
  domain: string;
  websiteUri: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  category: string;
  types?: string[];
  location: any | null;
}

interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}
```

### What Moves to Utils
**File: `addressParser.ts`**
- `extractCityState(addressComponents?: any[], formattedAddress?: string): { city: string; state: string }`
  - Pure function extracted from lines 12-52
  - No changes to logic
  - Add JSDoc documentation

**File: `domainExtractor.ts`**
- `extractDomainFromUrl(websiteUri: string | null | undefined): string`
  - Pure function for URL → clean domain
  - Extracted from lines 205-213
  - Handles null/undefined
  - Removes `www.` prefix
  - Returns empty string on invalid URL

**File: `fieldMasks.ts`**
- `PLACE_DETAILS_FIELD_MASK: string` - constant for details API
  - Extracted from lines 171-185
  - Single source of truth
  - Used by both getPlaceDetails and quickSearch

### What Gets Removed
1. **Direct axios calls in routes** (lines 86-99, 187-194, 296-308, 346-355)
   - Replaced by `GooglePlacesApiService` method calls

2. **Inline helper function** (lines 12-52)
   - Moved to `addressParser.ts`

3. **Duplicate logic** (~100 lines)
   - Place details fetching consolidated in service
   - Transformation logic unified in PlaceDataTransformService

4. **Environment variable access in routes** (line 6)
   - Moved to service layer
   - Routes no longer need to know about API keys

---

## Step-by-Step Migration

### Phase 1: Create Utility Files
**No dependencies, can be done first**

1. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/addressParser.ts`
   - Extract `extractCityState()` function (lines 12-52)
   - Add TypeScript types
   - Add JSDoc comments
   - Export function

2. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/domainExtractor.ts`
   - Extract domain parsing logic (lines 205-213)
   - Create `extractDomainFromUrl()` function
   - Handle null/undefined input
   - Export function

3. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/fieldMasks.ts`
   - Extract field mask constant (lines 171-185)
   - Export as `PLACE_DETAILS_FIELD_MASK`

### Phase 2: Create Service Layer
**Depends on utils from Phase 1**

4. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-services/PlaceDataTransformService.ts`
   - Define TypeScript interfaces (`PlaceDetails`, `PlaceSuggestion`)
   - Implement `transformPlaceDetailsResponse()`
     - Uses `extractCityState()` from addressParser
     - Uses `extractDomainFromUrl()` from domainExtractor
     - Constructs displayString and practiceSearchString
   - Implement `transformAutocompleteSuggestions()`
     - Maps Google suggestions to normalized format (lines 101-115)

5. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-services/GooglePlacesApiService.ts`
   - Implement `autocomplete()` method
     - Axios call to Google autocomplete API (lines 86-99)
     - Uses PlaceDataTransformService for response mapping
     - Error handling
   - Implement `getPlaceDetails()` method
     - Axios call to Google details API (lines 187-194)
     - Uses `PLACE_DETAILS_FIELD_MASK` from fieldMasks.ts
     - Returns raw response for transformation
     - Error handling
   - Implement `quickSearch()` method
     - Orchestrates autocomplete + details
     - Consolidates duplicate logic from lines 296-428
     - Uses PlaceDataTransformService for all transformations
   - Private helper: `buildGoogleApiHeaders()`
     - Constructs common headers
   - Private helper: `handleGoogleApiError(error: any)`
     - Extracts error messages from Google response structure

### Phase 3: Create Controller
**Depends on services from Phase 2**

6. Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/PlacesController.ts`
   - Implement `autocomplete(req, res)`
     - Extract and validate `input` and `sessionToken` (lines 68-75)
     - Call `GooglePlacesApiService.autocomplete()`
     - Format response (lines 119-122)
     - Handle errors (lines 124-132)
   - Implement `getPlaceDetails(req, res)`
     - Extract and validate `placeId` (lines 154-159)
     - Extract `sessionToken` from query (line 152)
     - Call `GooglePlacesApiService.getPlaceDetails()`
     - Call `PlaceDataTransformService.transformPlaceDetailsResponse()`
     - Format response (lines 245-248)
     - Handle errors (lines 250-259)
   - Implement `quickSearch(req, res)`
     - Extract and validate `query` (lines 278-284)
     - Call `GooglePlacesApiService.quickSearch()`
     - Format response with place + alternatives (lines 413-417)
     - Handle zero results (lines 313-319)
     - Handle errors (lines 418-427)
   - Private helper: `handleServiceError(error: any, res: Response)`
     - Centralized error-to-HTTP mapping
     - Logs errors with context
     - Returns appropriate HTTP status

### Phase 4: Update Routes
**Depends on controller from Phase 3**

7. Update `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/places.ts`
   - Remove all inline logic
   - Remove helper functions
   - Remove axios import
   - Remove environment variable access
   - Import PlacesController
   - Replace handler implementations:
     ```typescript
     placesRoutes.post("/autocomplete", PlacesController.autocomplete);
     placesRoutes.get("/:placeId", PlacesController.getPlaceDetails);
     placesRoutes.post("/search", PlacesController.quickSearch);
     ```
   - File should be ~20 LOC

### Phase 5: Testing & Validation

8. **Functional Testing**
   - Test POST /api/places/autocomplete with valid input
   - Test POST /api/places/autocomplete with missing input (400 error)
   - Test GET /api/places/:placeId with valid placeId
   - Test GET /api/places/:placeId with invalid placeId (error handling)
   - Test POST /api/places/search with valid query
   - Test POST /api/places/search with query returning zero results
   - Test sessionToken parameter passing through to Google API
   - Test error handling when Google API is unavailable
   - Test error handling when API key is missing/invalid

9. **Validation Checks**
   - Verify all endpoints return same response structure as before
   - Verify error messages match original format
   - Verify logging statements include same context
   - Verify no regression in functionality

10. **Code Review Checklist**
    - No business logic remains in routes
    - No duplicate logic between endpoints
    - All external API calls go through service layer
    - All transformations go through PlaceDataTransformService
    - Utils are pure functions with no side effects
    - Error handling is consistent across all endpoints
    - TypeScript types are properly defined
    - JSDoc comments added to public functions

---

## Files to Create

1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/PlacesController.ts`
   - ~150 LOC
   - Three public methods (autocomplete, getPlaceDetails, quickSearch)
   - Private error handling helper

2. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-services/GooglePlacesApiService.ts`
   - ~200 LOC
   - Three public methods (autocomplete, getPlaceDetails, quickSearch)
   - Two private helpers (headers, error handling)
   - Axios configuration for Google Places API

3. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-services/PlaceDataTransformService.ts`
   - ~120 LOC
   - Two public methods (transformPlaceDetailsResponse, transformAutocompleteSuggestions)
   - TypeScript interface definitions

4. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/addressParser.ts`
   - ~50 LOC
   - One exported function (extractCityState)

5. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/domainExtractor.ts`
   - ~20 LOC
   - One exported function (extractDomainFromUrl)

6. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/places/feature-utils/fieldMasks.ts`
   - ~15 LOC
   - One exported constant (PLACE_DETAILS_FIELD_MASK)

**Total new code: ~555 LOC** (down from 431 LOC due to deduplication)

---

## Files to Modify

1. `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/places.ts`
   - **Before**: 431 LOC with inline logic
   - **After**: ~20 LOC with route definitions only
   - **Change**: Remove ~410 LOC, replace with controller method calls

---

## Risk Assessment

### Risk Level: **LOW**

### Why Low Risk?
1. **No Database Interaction**
   - Pure external API proxy
   - No data persistence layer
   - No transaction management concerns
   - No schema changes

2. **No Authentication/Authorization**
   - Public endpoints
   - No middleware changes required
   - No security boundaries affected

3. **Simple Input/Output Contract**
   - Request/response format remains identical
   - No breaking changes to API contract
   - Frontend unchanged

4. **No Cross-Route Dependencies**
   - Places routes are isolated
   - No shared state with other routes
   - No downstream system impact

5. **Easily Testable**
   - External API can be mocked
   - Pure functions in utils
   - Service layer isolated from HTTP

6. **No Migration Required**
   - No data migration
   - No user migration
   - No configuration changes (same env var)

### Potential Issues

**1. Google API Response Format Changes**
- **Risk**: Google might return slightly different response structure
- **Mitigation**: Comprehensive testing with real API calls before deployment
- **Impact**: Low - would affect both old and new code equally

**2. Error Message Differences**
- **Risk**: Error messages might be slightly different after refactor
- **Mitigation**: Preserve exact error extraction logic from lines 124-132
- **Impact**: Very Low - error messages are for debugging, not part of contract

**3. Logging Format Changes**
- **Risk**: Console log statements might be formatted differently
- **Mitigation**: Keep same logging messages, just move to controller/service
- **Impact**: Very Low - internal observability only

**4. Session Token Handling**
- **Risk**: Session token might not be passed correctly through layers
- **Mitigation**: Explicit testing of sessionToken parameter flow
- **Impact**: Low - optional parameter, doesn't break functionality if missing

**5. Environment Variable Access**
- **Risk**: API key not accessible in service layer
- **Mitigation**: Test environment variable access in service during development
- **Impact**: Low - would fail immediately and obviously in testing

### Rollback Strategy
**If issues are discovered post-deployment:**

1. **Immediate**: Revert routes file to original version (single file revert)
2. **Quick**: Git revert of entire refactor (all files created/modified)
3. **No Data Loss**: No database changes, so no data corruption risk
4. **No Downtime**: Can deploy rollback immediately

**Rollback is trivial** - no data migration to undo, no schema changes, single route file to revert.

### Testing Strategy
1. **Unit Tests** (optional but recommended)
   - Test utils (addressParser, domainExtractor) with various inputs
   - Test PlaceDataTransformService with mock Google responses
   - Test controller error handling with mock service errors

2. **Integration Tests** (critical)
   - Test all three endpoints with real Google API calls
   - Test error cases (invalid input, missing placeId)
   - Test zero-results cases
   - Test sessionToken parameter passing

3. **Manual Testing** (required)
   - Test from frontend or Postman
   - Verify response format matches exactly
   - Verify error messages are appropriate
   - Check console logs for proper context

### Deployment Approach
**Option 1: Single Deployment (Recommended)**
- Deploy all changes at once
- Simpler to reason about
- Easier rollback (single commit)
- Lower risk due to isolated nature of route

**Option 2: Feature Flag**
- Not necessary for this refactor
- Overkill for isolated API proxy
- Would add complexity without benefit

**Recommendation: Single deployment with comprehensive testing beforehand**

---

## Success Criteria

### Functional Requirements
- [ ] All three endpoints return identical responses to current implementation
- [ ] Error handling produces equivalent error messages
- [ ] Session token parameter is passed through correctly
- [ ] Zero-results case handled properly in search endpoint
- [ ] Invalid input returns 400 errors
- [ ] Missing API key returns 500 errors
- [ ] Google API errors are properly extracted and returned

### Code Quality Requirements
- [ ] No business logic in routes file
- [ ] No duplicate logic between endpoints
- [ ] All external API calls isolated in service layer
- [ ] All transformations isolated in PlaceDataTransformService
- [ ] Utils are pure functions with no side effects
- [ ] TypeScript types defined for all data structures
- [ ] JSDoc comments on public functions
- [ ] Consistent error handling across all endpoints
- [ ] Logging includes appropriate context

### Architectural Requirements
- [ ] Routes file is < 25 LOC
- [ ] Controller handles HTTP concerns only
- [ ] Services handle business logic and API orchestration
- [ ] Utils contain pure transformation functions
- [ ] No direct environment variable access in routes
- [ ] Field mask defined as constant, not inline
- [ ] Domain extraction logic reusable across codebase

### Testing Requirements
- [ ] Manual testing completed for all endpoints
- [ ] Error cases tested (invalid input, API failures)
- [ ] Edge cases tested (zero results, missing fields)
- [ ] Logging output verified
- [ ] Performance equivalent or better than current implementation

---

## Definition of Done

1. **Code Complete**
   - All 6 new files created with proper structure
   - Routes file updated to < 25 LOC
   - No TypeScript compilation errors
   - No linting errors

2. **Testing Complete**
   - All three endpoints tested manually
   - Error cases validated
   - Edge cases confirmed working
   - No regression in functionality

3. **Documentation Complete**
   - JSDoc comments on public functions
   - TypeScript interfaces defined
   - This plan updated with any deviations discovered during implementation

4. **Review Complete**
   - Code reviewed for:
     - Proper separation of concerns
     - No business logic in routes
     - Consistent error handling
     - Appropriate logging
   - Architectural compliance verified

5. **Deployment Ready**
   - All success criteria met
   - Rollback plan understood
   - No blocking issues identified

---

## Notes

### Why This Refactor Matters
1. **Eliminates ~100 lines of duplication** - getPlaceDetails and search endpoints had nearly identical logic
2. **Creates reusable utilities** - addressParser and domainExtractor can be used elsewhere
3. **Improves testability** - service layer can be mocked, utils can be unit tested
4. **Simplifies routes** - 431 LOC → 20 LOC makes route file readable
5. **Centralizes API communication** - single point of change if Google API updates

### Future Enhancements (Out of Scope)
- **Rate limiting**: Add rate limiting middleware for Google API calls
- **Caching**: Cache autocomplete results and place details
- **Retry logic**: Add exponential backoff for failed API calls
- **Metrics**: Add prometheus metrics for API latency and error rates
- **Validation**: Add Zod schema validation for inputs
- **OpenAPI docs**: Generate API documentation from controller

### Dependencies Between Files
```
routes/places.ts
    └─→ PlacesController.ts
            ├─→ GooglePlacesApiService.ts
            │       ├─→ PlaceDataTransformService.ts
            │       │       ├─→ addressParser.ts
            │       │       └─→ domainExtractor.ts
            │       └─→ fieldMasks.ts
            └─→ PlaceDataTransformService.ts (for type definitions)
```

### Estimated Time
- **Phase 1** (Utils): 30 minutes
- **Phase 2** (Services): 90 minutes
- **Phase 3** (Controller): 60 minutes
- **Phase 4** (Routes): 15 minutes
- **Phase 5** (Testing): 45 minutes
- **Total**: ~4 hours

### Similar Patterns
This refactor follows the same architecture as:
- `admin/auth` route refactor
- `profile` route refactor
- `websiteContact` route refactor

All follow the pattern: **routes → controller → services → utils/models**
