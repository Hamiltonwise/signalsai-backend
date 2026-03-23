# Scraper Route Refactor Plan

**Route File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/scraper.ts`
**Current LOC:** 874 lines
**Target Pattern:** Route → Controller → Service → Utils

---

## 1. Current State

### Overview
Large, monolithic route file that orchestrates website scraping using Puppeteer. Single endpoint that captures desktop/mobile screenshots, HTML markup, broken links, page performance metrics, and NAP (Name/Address/Phone) business details. No direct database calls—all I/O is file-based logging, n8n webhook-style auth, and Puppeteer browser automation.

### Endpoints
1. **POST /scraper/homepage**
   - Authentication: `validateScraperKey` middleware (checks `x-scraper-key` header against `SCRAPER_API_KEY` env var)
   - Accepts: `{ domain: string }`
   - Orchestration flow:
     1. Normalizes URL (prepends `https://` if needed)
     2. Launches Puppeteer browser (headless, sandboxed args)
     3. **Desktop capture** (1280x720):
        - Sets viewport, user-agent
        - Navigates with retry logic (max 2 attempts)
        - Injects CSS to force-show animation library elements (Elementor, WOW.js, AOS, GSAP)
        - Auto-scrolls entire page to trigger lazy-loaded content
        - Waits 1s for animations to settle
        - Captures full-page JPEG screenshot (base64, 70% quality)
     4. Extracts page load time (Performance API)
     5. Checks HTTPS usage (security flag)
     6. Extracts HTML markup
     7. **Broken links check** (background, max 3 broken links):
        - Extracts all `<a>` hrefs (excludes `#`, `javascript:`, `mailto:`, `tel:`)
        - Checks link status via HTTP HEAD requests (batches of 5)
        - Returns URLs with 4xx/5xx/timeout/connection errors
     8. **NAP extraction** (business data):
        - Business name (Schema.org → OG tags → h1 → title)
        - Phone numbers (regex patterns + `tel:` links, max 5)
        - Addresses (regex + semantic selectors, max 3)
        - Emails (`mailto:` links + regex, max 3)
     9. **Mobile capture** (375x667, iPhone SE):
        - Sets mobile viewport, user-agent
        - Re-injects animation CSS (viewport change triggers re-render)
        - Auto-scrolls mobile view
        - Waits 1s for animations
        - Captures full-page JPEG screenshot (base64, 70% quality)
     10. Returns response with both screenshots, markup, security flag, load time, broken links, NAP details
   - Error handling:
     - Returns `{ error: true, error_message: "cannot load page" }` on navigation failures or exceptions
     - Always closes browser in finally block
   - File logging: All operations logged to `../logs/scraping-tool.log` with timestamps

### Current Dependencies
- `express` (Router, Request, Response, NextFunction)
- `puppeteer` (Browser, Page)
- `fs` (log file I/O)
- `path` (log directory resolution)
- `https`, `http` (broken link checking)
- **No database dependencies**
- **No model layer usage**
- **No service layer usage** (though apifyService exists in codebase, not used here)

### Current Responsibilities (All in Route File)
Route file contains:
1. **Logging infrastructure**
   - Log directory setup (`../logs`)
   - File-based append logging
   - Timestamp formatting
   - Operation start/complete logging with duration tracking
2. **Authentication middleware**
   - `validateScraperKey` - checks `x-scraper-key` header against env var
3. **URL normalization**
   - `normalizeUrl` - prepends `https://` to bare domains
4. **Puppeteer orchestration**
   - Browser launch configuration (sandbox args, resource blocking)
   - Page lifecycle management (viewport, user-agent, navigation, retry logic)
5. **Animation handling**
   - `forceAnimationVisibility` - injects CSS to force-show hidden animated elements
   - `autoScrollPage` - auto-scrolls page to trigger lazy-loaded content
6. **Link extraction & validation**
   - `extractPageLinks` - scrapes all `<a[href]>` elements
   - `checkLinkStatus` - HTTP HEAD request with timeout/error handling
   - `findBrokenLinks` - batched link checking (max 10, batch size 5)
7. **Performance metrics**
   - `getPageLoadTime` - uses Performance Timing API
8. **NAP extraction**
   - `extractNAPDetails` - multi-strategy business data extraction:
     - Business name: Schema.org LocalBusiness/Organization → OG tags → h1 → title
     - Phone: regex patterns (US/international) + `tel:` links
     - Address: regex patterns + semantic HTML selectors
     - Email: `mailto:` links + regex (filters false positives)
9. **Screenshot capture**
   - Desktop & mobile screenshots (JPEG, base64, 70% quality)
   - Full-page capture
10. **Request validation**
    - Type checking for `domain` field
11. **Error handling**
    - Try/catch blocks with generic error responses
    - Browser cleanup on error
12. **Response formatting**
    - Structured JSON responses with base64 data URIs

### Issues
- **Massive scope creep** - single route file handles 10+ distinct responsibilities
- **No separation of concerns** - route definition, business logic, I/O, validation, error handling all intertwined
- **Testing nightmare** - impossible to unit test individual functions without spinning up Express server
- **Reusability** - utility functions (URL normalization, link checking, NAP extraction) locked inside route file
- **Maintenance burden** - 874 LOC in single file; any change requires understanding entire flow
- **Error handling** - generic error responses; no distinction between navigation failures, timeout, validation errors
- **Logging** - file-based logging hardcoded; no observability abstractions
- **Resource management** - Puppeteer browser lifecycle managed inline; no abstraction for cleanup
- **Type safety** - interfaces defined inline; no shared types for cross-module usage
- **Performance** - sequential operations (mobile capture waits for desktop, NAP extraction inline)

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── scraper.ts                                    # Route definitions only (30-40 LOC)
├── controllers/
│   └── scraper/
│       ├── scraper.controller.ts                     # Main controller (~150-200 LOC)
│       ├── feature-services/
│       │   ├── service.scraping-orchestrator.ts      # Main orchestration (~150 LOC)
│       │   ├── service.puppeteer-manager.ts          # Browser lifecycle (~80 LOC)
│       │   ├── service.screenshot-capture.ts         # Screenshot logic (~120 LOC)
│       │   ├── service.link-checker.ts               # Broken links (~100 LOC)
│       │   ├── service.nap-extractor.ts              # NAP extraction (~200 LOC)
│       │   └── service.performance-metrics.ts        # Page performance (~40 LOC)
│       └── feature-utils/
│           ├── util.url-normalizer.ts                # URL utilities (~20 LOC)
│           ├── util.animation-injector.ts            # CSS injection (~60 LOC)
│           ├── util.page-scroller.ts                 # Auto-scroll (~40 LOC)
│           └── util.scraper-logger.ts                # File logging (~80 LOC)
├── middleware/
│   └── scraperAuth.ts                                # Extracted middleware (~30 LOC)
├── types/
│   └── scraper/
│       ├── scraper.types.ts                          # Shared interfaces/types (~100 LOC)
│       └── scraper.enums.ts                          # Enums (viewport configs, etc.) (~30 LOC)
```

### Layer Responsibilities

#### Route Layer (`routes/scraper.ts`)
**Responsibility:** Route definition only
**LOC:** ~30-40
**Content:**
- Import controller
- Define POST `/homepage` route
- Attach `scraperAuth` middleware
- Call `ScraperController.captureHomepage`
- No business logic
- No error handling (delegated to controller)

#### Middleware Layer (`middleware/scraperAuth.ts`)
**Responsibility:** Authentication
**LOC:** ~30
**Content:**
- Extract from route file: `validateScraperKey` middleware
- Check `x-scraper-key` header against `SCRAPER_API_KEY` env var
- Return 401 if invalid/missing
- Return 500 if env var not configured

#### Controller Layer (`controllers/scraper/scraper.controller.ts`)
**Responsibility:** HTTP orchestration
**LOC:** ~150-200
**Content:**
- Request parameter extraction & validation
- Orchestrates service calls (delegates to `ScrapingOrchestrator`)
- Maps service results to HTTP response format
- Error handling & HTTP status code decisions
- Response formatting (converts screenshots to data URIs)
- Logging (operation start/complete via `ScraperLogger`)
- Browser cleanup coordination

#### Service Layer

##### `service.scraping-orchestrator.ts`
**Responsibility:** Main scraping workflow coordination
**LOC:** ~150
**Content:**
- Coordinates entire scraping flow
- Manages browser lifecycle (via `PuppeteerManager`)
- Orchestrates desktop capture → metrics → broken links → NAP → mobile capture
- Aggregates results from all sub-services
- Returns structured data to controller
- **Pure orchestration** - no direct Puppeteer calls, no I/O

##### `service.puppeteer-manager.ts`
**Responsibility:** Browser lifecycle management
**LOC:** ~80
**Content:**
- `launchBrowser()` - launches Puppeteer with sandbox args, resource blocking
- `createPage()` - creates new page with viewport/user-agent
- `navigateWithRetry()` - navigation with retry logic (max 2 attempts, 1s delay)
- `closeBrowser()` - safe browser cleanup
- Viewport configuration (desktop: 1280x720, mobile: 375x667)
- User-agent strings (Windows desktop, iPhone SE mobile)
- Request interception (blocks media resources)

##### `service.screenshot-capture.ts`
**Responsibility:** Screenshot capture logic
**LOC:** ~120
**Content:**
- `captureDesktop(page)` - desktop screenshot flow:
  - Set viewport (1280x720)
  - Inject animation CSS (via `AnimationInjector`)
  - Auto-scroll (via `PageScroller`)
  - Wait 1s for animations
  - Capture full-page JPEG (base64, 70% quality)
- `captureMobile(page)` - mobile screenshot flow (same steps, 375x667)
- Screenshot size calculation (KB)
- Returns base64 strings + metadata (size, duration)

##### `service.link-checker.ts`
**Responsibility:** Broken link detection
**LOC:** ~100
**Content:**
- `extractPageLinks(page)` - extract all `<a[href]>` (excludes `#`, `javascript:`, `mailto:`, `tel:`)
- `checkLinkStatus(linkUrl, baseUrl)` - HTTP HEAD request:
  - Resolves relative URLs
  - 5s timeout
  - Returns `{ url, status }` for 4xx/5xx/timeout/connection_error
- `findBrokenLinks(page, baseUrl, maxBrokenLinks)` - batched checking:
  - Batch size 5
  - Max broken links configurable (default 10)
  - Returns array of broken link objects
- Handles invalid URLs gracefully

##### `service.nap-extractor.ts`
**Responsibility:** Business data extraction (Name, Address, Phone)
**LOC:** ~200
**Content:**
- `extractNAPDetails(page)` - comprehensive extraction:
  - **Business name** (priority order):
    1. Schema.org LocalBusiness/Organization/MedicalBusiness/Dentist/Physician
    2. OG `site_name` meta tag
    3. First `<h1>` (if < 100 chars)
    4. Title tag (cleaned - splits on `|`, `-`, etc.)
  - **Phone numbers** (max 5):
    - Regex patterns (US formats, international +prefix)
    - `tel:` links
    - Deduplication, length validation (10-15 digits)
  - **Addresses** (max 3):
    - Regex patterns (US street addresses with ZIP)
    - Semantic HTML selectors (`[class*="address"]`, `[itemtype*="PostalAddress"]`, `<address>`)
    - Length/format validation
  - **Emails** (max 3):
    - `mailto:` links (most reliable)
    - Body text regex
    - Filters false positives (`example.com`, `yourdomain`, `.png`, `.jpg`)
- Returns `NAPDetails` interface
- All extraction runs in browser context (page.evaluate)

##### `service.performance-metrics.ts`
**Responsibility:** Page performance data
**LOC:** ~40
**Content:**
- `getPageLoadTime(page)` - uses Performance Timing API:
  - `loadEventEnd - navigationStart`
  - Fallback to `Date.now() - navigationStart` if `loadEventEnd` not yet fired
- `checkSecure(page)` - checks if final URL uses HTTPS
- Returns metrics object: `{ loadTime: number, isSecure: boolean }`

#### Utils Layer

##### `util.url-normalizer.ts`
**Responsibility:** URL utilities
**LOC:** ~20
**Content:**
- `normalizeUrl(domain: string)` - prepends `https://` to bare domains
- Trims whitespace
- Returns fully-qualified URL

##### `util.animation-injector.ts`
**Responsibility:** Force-show animation library elements
**LOC:** ~60
**Content:**
- `injectAnimationCSS(page)` - injects CSS to force visibility:
  - Elementor (`.elementor-invisible`)
  - WOW.js (`.wow`)
  - AOS (`[data-aos]`)
  - GSAP ScrollTrigger (`.gsap-hidden`, `[data-gsap]`)
  - Generic (`.animate__animated`, `.animated`)
  - Disables all transitions/animations (0s duration)
- Uses `page.addStyleTag({ content: ... })`
- Called before each screenshot (desktop & mobile)

##### `util.page-scroller.ts`
**Responsibility:** Auto-scroll page
**LOC:** ~40
**Content:**
- `autoScrollPage(page)` - triggers lazy-loaded content:
  - Scrolls 400px at a time
  - 80ms delay between scrolls
  - Continues until `scrollHeight` reached
  - Scrolls back to top (for screenshot)
- Runs in browser context (page.evaluate)

##### `util.scraper-logger.ts`
**Responsibility:** File-based logging
**LOC:** ~80
**Content:**
- Log directory setup (`../logs`)
- `log(level, message, data?)` - appends to `scraping-tool.log`:
  - Format: `[timestamp] [SCRAPER] [level] message | JSON(data)`
  - Levels: INFO, ERROR, DEBUG, WARN
  - Console fallback if file write fails
- `logOperationStart(domain, url)` - logs start with separator
- `logOperationComplete(domain, durationMs, success)` - logs end with separator
- `formatTimestamp()` - ISO 8601 format

#### Types Layer (`types/scraper/`)
**Responsibility:** Shared types & interfaces
**LOC:** ~130 total

**`scraper.types.ts`:**
- `HomepageRequest` - request body: `{ domain: string }`
- `HomepageResponse` - response structure
- `BrokenLink` - `{ url: string; status: number | string }`
- `NAPDetails` - `{ businessName, addresses[], phoneNumbers[], emails[] }`
- `ScreenshotResult` - `{ base64: string; sizeKB: number }`
- `PerformanceMetrics` - `{ loadTime: number; isSecure: boolean }`
- `ScrapingResult` - aggregated result from orchestrator

**`scraper.enums.ts`:**
- `ViewportConfig` - desktop/mobile viewport dimensions
- `UserAgent` - desktop/mobile user-agent strings
- `LogLevel` - INFO, ERROR, DEBUG, WARN

---

## 3. Mapping: Handler → Controller/Service/Util

| Current Location | New Location | Responsibility |
|-----------------|-------------|----------------|
| Route handler (POST `/homepage`) | `ScraperController.captureHomepage()` | HTTP request/response handling |
| Browser launch logic | `PuppeteerManager.launchBrowser()` | Browser lifecycle |
| Page navigation + retry | `PuppeteerManager.navigateWithRetry()` | Navigation reliability |
| Desktop screenshot flow | `ScreenshotCapture.captureDesktop()` | Desktop capture orchestration |
| Mobile screenshot flow | `ScreenshotCapture.captureMobile()` | Mobile capture orchestration |
| Broken links check | `LinkChecker.findBrokenLinks()` | Link validation |
| NAP extraction | `NAPExtractor.extractNAPDetails()` | Business data extraction |
| Performance metrics | `PerformanceMetrics.getPageLoadTime()` | Page performance |
| Security check | `PerformanceMetrics.checkSecure()` | HTTPS validation |
| Full orchestration flow | `ScrapingOrchestrator.scrapeHomepage()` | Workflow coordination |
| `normalizeUrl()` | `UrlNormalizer.normalize()` | URL utilities |
| `forceAnimationVisibility()` | `AnimationInjector.inject()` | CSS injection |
| `autoScrollPage()` | `PageScroller.scroll()` | Page scrolling |
| File logging functions | `ScraperLogger.*` | Logging abstraction |
| `validateScraperKey` | `middleware/scraperAuth.ts` | Authentication middleware |
| Interfaces/types | `types/scraper/*` | Shared type definitions |

---

## 4. Step-by-Step Migration

### Phase 1: Setup Infrastructure (No Breaking Changes)
**Goal:** Create directory structure & type definitions

1. **Create directories:**
   ```bash
   mkdir -p src/controllers/scraper/feature-services
   mkdir -p src/controllers/scraper/feature-utils
   mkdir -p src/types/scraper
   ```

2. **Create type definitions:**
   - Create `types/scraper/scraper.types.ts`:
     - Extract all interfaces from route file: `HomepageRequest`, `HomepageResponse`, `BrokenLink`, `NAPDetails`
     - Add new interfaces: `ScreenshotResult`, `PerformanceMetrics`, `ScrapingResult`
   - Create `types/scraper/scraper.enums.ts`:
     - Define `ViewportConfig` enum (desktop: 1280x720, mobile: 375x667)
     - Define `UserAgent` enum (Windows desktop, iPhone SE)
     - Define `LogLevel` enum (INFO, ERROR, DEBUG, WARN)

### Phase 2: Extract Utilities (Pure Functions)
**Goal:** Move stateless utility functions (no dependencies)

3. **Create `util.url-normalizer.ts`:**
   - Extract `normalizeUrl()` function
   - Add unit tests (handles bare domains, http://, https://, whitespace)

4. **Create `util.page-scroller.ts`:**
   - Extract `autoScrollPage()` function
   - Import Puppeteer `Page` type
   - Add JSDoc comments

5. **Create `util.animation-injector.ts`:**
   - Extract `forceAnimationVisibility()` function
   - Import Puppeteer `Page` type
   - Document supported animation libraries

6. **Create `util.scraper-logger.ts`:**
   - Extract logging functions: `log()`, `logOperationStart()`, `logOperationComplete()`, `formatTimestamp()`
   - Extract log directory setup logic
   - Add configuration options (log directory path, log file name)
   - Make logger singleton or use dependency injection pattern

### Phase 3: Extract Feature Services (Business Logic)
**Goal:** Move service-layer logic (orchestration, data extraction)

7. **Create `service.puppeteer-manager.ts`:**
   - Extract browser launch logic:
     - `launchBrowser()` - launch config, args, resource blocking
   - Extract page creation logic:
     - `createPage(browser, viewport)` - viewport + user-agent setup
   - Extract navigation logic:
     - `navigateWithRetry(page, url, maxRetries = 2)` - retry with 1s delay
   - Add `closeBrowser(browser)` - safe cleanup
   - Import `ViewportConfig`, `UserAgent` enums

8. **Create `service.performance-metrics.ts`:**
   - Extract `getPageLoadTime(page)` function
   - Add `checkSecure(page)` function (checks `page.url()` starts with `https://`)
   - Return structured metrics object

9. **Create `service.link-checker.ts`:**
   - Extract `extractPageLinks(page)` function
   - Extract `checkLinkStatus(linkUrl, baseUrl)` function
   - Extract `findBrokenLinks(page, baseUrl, maxBrokenLinks = 10)` function
   - Import `BrokenLink` type
   - Add configurable batch size

10. **Create `service.nap-extractor.ts`:**
    - Extract `extractNAPDetails(page)` function
    - Import `NAPDetails` type
    - Document extraction strategy (Schema.org priority, regex patterns)
    - Consider breaking into sub-functions: `extractBusinessName()`, `extractPhones()`, `extractAddresses()`, `extractEmails()`

11. **Create `service.screenshot-capture.ts`:**
    - Create `captureDesktop(page)` function:
      - Delegates to `PuppeteerManager` for viewport
      - Delegates to `AnimationInjector` for CSS
      - Delegates to `PageScroller` for scrolling
      - Captures screenshot (JPEG, base64, 70% quality)
      - Calculates size (KB)
      - Returns `ScreenshotResult`
    - Create `captureMobile(page)` function (same flow, mobile viewport)
    - Add wait time configuration (currently hardcoded 1s)

12. **Create `service.scraping-orchestrator.ts`:**
    - Main orchestration function: `scrapeHomepage(domain: string)`
    - Workflow:
      1. Normalize URL (via `UrlNormalizer`)
      2. Launch browser (via `PuppeteerManager`)
      3. Create page (via `PuppeteerManager`)
      4. Navigate with retry (via `PuppeteerManager`)
      5. Capture desktop screenshot (via `ScreenshotCapture`)
      6. Get performance metrics (via `PerformanceMetrics`)
      7. Check broken links (via `LinkChecker`) - can run in parallel
      8. Extract NAP details (via `NAPExtractor`)
      9. Capture mobile screenshot (via `ScreenshotCapture`)
      10. Close browser (via `PuppeteerManager`)
      11. Return `ScrapingResult` (aggregates all data)
    - Error handling: catch all, close browser, rethrow
    - Logging: uses `ScraperLogger` throughout

### Phase 4: Extract Middleware
**Goal:** Move authentication middleware to shared middleware directory

13. **Create `middleware/scraperAuth.ts`:**
    - Extract `validateScraperKey` middleware
    - Check `x-scraper-key` header
    - Validate against `process.env.SCRAPER_API_KEY`
    - Return 401 if invalid
    - Return 500 if env var not configured
    - Call `next()` on success

### Phase 5: Create Controller
**Goal:** HTTP orchestration layer

14. **Create `controllers/scraper/scraper.controller.ts`:**
    - Export class `ScraperController`
    - Method: `captureHomepage(req: Request, res: Response)`
    - Responsibilities:
      - Extract `domain` from `req.body`
      - Validate `domain` (string, non-empty)
      - Return 400 if invalid
      - Log operation start (via `ScraperLogger`)
      - Call `ScrapingOrchestrator.scrapeHomepage(domain)`
      - Map result to `HomepageResponse` format:
        - Convert screenshots to data URIs (`data:image/jpeg;base64,...`)
        - Include all metadata (isSecure, loadTime, brokenLinks, napDetails)
      - Log operation complete (via `ScraperLogger`)
      - Return 200 with JSON response
      - Error handling:
        - Catch errors from orchestrator
        - Log error (via `ScraperLogger`)
        - Return `{ error: true, error_message: "cannot load page" }` (matches current behavior)
      - Track duration (startTime → endTime)

### Phase 6: Update Route File
**Goal:** Simplify route to pure route definition

15. **Refactor `routes/scraper.ts`:**
    - Remove all function definitions (now in services/utils)
    - Remove all interfaces (now in types)
    - Remove logging setup (now in util)
    - Remove middleware definition (now in middleware/)
    - Import `scraperAuth` from `middleware/scraperAuth`
    - Import `ScraperController` from `controllers/scraper/scraper.controller`
    - Route definition:
      ```typescript
      router.post("/homepage", scraperAuth, ScraperController.captureHomepage);
      ```
    - Export router
    - **Total LOC:** ~30-40 (down from 874)

### Phase 7: Testing & Validation
**Goal:** Ensure feature parity

16. **Unit tests:**
    - Test each utility in isolation (URL normalizer, page scroller, animation injector)
    - Test link checker (mock HTTP requests)
    - Test NAP extractor (mock page.evaluate results)
    - Test logger (file I/O mocking)

17. **Integration tests:**
    - Test orchestrator flow (mock all service dependencies)
    - Test controller (mock orchestrator, verify HTTP responses)

18. **End-to-end tests:**
    - Test full scraping flow against real URLs (use test domains)
    - Verify screenshots match original implementation
    - Verify broken links detection works
    - Verify NAP extraction works
    - Compare response format with original

19. **Performance validation:**
    - Measure scraping duration before/after refactor
    - Ensure no performance regression
    - Log file size should be identical

---

## 5. Files to Create

### New Directories
1. `src/controllers/scraper/`
2. `src/controllers/scraper/feature-services/`
3. `src/controllers/scraper/feature-utils/`
4. `src/types/scraper/`

### New Files (17 total)

#### Types (2 files)
1. `src/types/scraper/scraper.types.ts` (~100 LOC)
2. `src/types/scraper/scraper.enums.ts` (~30 LOC)

#### Controller (1 file)
3. `src/controllers/scraper/scraper.controller.ts` (~150-200 LOC)

#### Feature Services (6 files)
4. `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts` (~150 LOC)
5. `src/controllers/scraper/feature-services/service.puppeteer-manager.ts` (~80 LOC)
6. `src/controllers/scraper/feature-services/service.screenshot-capture.ts` (~120 LOC)
7. `src/controllers/scraper/feature-services/service.link-checker.ts` (~100 LOC)
8. `src/controllers/scraper/feature-services/service.nap-extractor.ts` (~200 LOC)
9. `src/controllers/scraper/feature-services/service.performance-metrics.ts` (~40 LOC)

#### Feature Utils (4 files)
10. `src/controllers/scraper/feature-utils/util.url-normalizer.ts` (~20 LOC)
11. `src/controllers/scraper/feature-utils/util.animation-injector.ts` (~60 LOC)
12. `src/controllers/scraper/feature-utils/util.page-scroller.ts` (~40 LOC)
13. `src/controllers/scraper/feature-utils/util.scraper-logger.ts` (~80 LOC)

#### Middleware (1 file)
14. `src/middleware/scraperAuth.ts` (~30 LOC)

#### Tests (3 files - optional but recommended)
15. `src/controllers/scraper/__tests__/scraper.controller.test.ts`
16. `src/controllers/scraper/feature-services/__tests__/link-checker.test.ts`
17. `src/controllers/scraper/feature-utils/__tests__/url-normalizer.test.ts`

---

## 6. Files to Modify

### Primary Modification
1. **`src/routes/scraper.ts`** (874 LOC → ~30-40 LOC)
   - Remove all function definitions
   - Remove all interfaces/types
   - Remove logging setup
   - Remove middleware definition
   - Import refactored modules
   - Simplify to pure route definition

### Secondary Modifications (if applicable)
2. **`src/index.ts` or `src/app.ts`** (if route imports need updating)
   - Verify `import scraperRouter from './routes/scraper'` still works
   - No changes needed if exports remain consistent

---

## 7. Risk Assessment

### Low Risk
- **URL normalizer, page scroller, animation injector** - pure functions, no side effects, easy to test
- **Type definitions** - zero runtime impact, compile-time only
- **Middleware extraction** - simple refactor, no logic changes

### Medium Risk
- **Link checker** - depends on external HTTP requests, network failures possible
  - **Mitigation:** Preserve exact timeout/retry behavior, extensive testing
- **NAP extractor** - complex regex patterns, browser context execution
  - **Mitigation:** Test against variety of websites (dental, medical, e-commerce)
- **Screenshot capture** - timing-sensitive (animations, lazy-loading)
  - **Mitigation:** Preserve exact wait times (1s), test with animation-heavy sites

### High Risk
- **Puppeteer manager** - browser lifecycle is critical, resource leaks catastrophic
  - **Mitigation:**
    - Add explicit browser cleanup in finally blocks
    - Test concurrent requests (browser instance management)
    - Add browser timeout safeguards
    - Monitor memory usage in production
- **Orchestrator** - coordinates entire flow, single point of failure
  - **Mitigation:**
    - Extensive integration tests
    - Preserve exact error handling behavior (generic "cannot load page" response)
    - Add rollback plan (keep original route file intact until validation complete)

### Breaking Change Risks
- **Response format changes** - n8n webhooks may depend on exact response structure
  - **Mitigation:** Preserve exact response format (data URIs, field names, error format)
- **Error handling changes** - different error messages could break downstream consumers
  - **Mitigation:** Match original error responses exactly (`{ error: true, error_message: "cannot load page" }`)
- **Timing changes** - different wait times could affect screenshot quality
  - **Mitigation:** Preserve exact wait times (1s after scroll, 1s for animations)

### Operational Risks
- **File logging changes** - log format/location changes could break monitoring tools
  - **Mitigation:** Preserve exact log format, file location (`../logs/scraping-tool.log`)
- **Environment variable dependencies** - `SCRAPER_API_KEY` must be present
  - **Mitigation:** Document required env vars, add startup validation

---

## 8. Rollback Plan

### If Issues Arise During Migration

1. **Keep original route file intact:**
   - Rename `routes/scraper.ts` → `routes/scraper.original.ts`
   - Create new `routes/scraper.ts` with refactored code
   - If refactor fails validation, revert:
     ```bash
     mv routes/scraper.original.ts routes/scraper.ts
     ```

2. **Feature flag approach:**
   - Add env var `USE_REFACTORED_SCRAPER=true/false`
   - Route file conditionally imports old vs. new controller
   - Allows A/B testing in production

3. **Gradual rollout:**
   - Deploy refactored code alongside original (different endpoint)
   - Test `/scraper/homepage-v2` with same payload
   - Compare results with original endpoint
   - Switch traffic gradually (10% → 50% → 100%)

### Rollback Criteria
Trigger rollback if:
- Response format differs from original
- Scraping duration increases >20%
- Screenshot quality degrades (visual comparison)
- Error rate increases >5%
- Memory leaks detected (browser not closing)
- Broken links detection returns different results
- NAP extraction accuracy drops

---

## 9. Testing Strategy

### Unit Tests
**Coverage:** Each utility/service in isolation

1. **URL Normalizer:**
   - ✓ Bare domain → prepends `https://`
   - ✓ Already has `http://` → unchanged
   - ✓ Already has `https://` → unchanged
   - ✓ Whitespace trimmed

2. **Link Checker:**
   - ✓ Filters out `#`, `javascript:`, `mailto:`, `tel:`
   - ✓ Resolves relative URLs correctly
   - ✓ Detects 4xx/5xx status codes
   - ✓ Handles timeouts (5s)
   - ✓ Handles connection errors
   - ✓ Returns max N broken links

3. **NAP Extractor:**
   - ✓ Extracts business name from Schema.org LocalBusiness
   - ✓ Falls back to OG tags → h1 → title
   - ✓ Extracts phone numbers (US format, international format)
   - ✓ Extracts addresses (US format with ZIP)
   - ✓ Extracts emails from `mailto:` links
   - ✓ Filters email false positives

4. **Logger:**
   - ✓ Writes to correct file path
   - ✓ Formats timestamps correctly (ISO 8601)
   - ✓ Handles file write failures (console fallback)
   - ✓ Logs operation start/complete with separators

### Integration Tests
**Coverage:** Service interactions

5. **Orchestrator:**
   - ✓ Calls all services in correct order
   - ✓ Passes data between services correctly
   - ✓ Aggregates results into single object
   - ✓ Closes browser on success
   - ✓ Closes browser on error
   - ✓ Retries navigation on failure

6. **Screenshot Capture:**
   - ✓ Sets viewport correctly (desktop: 1280x720, mobile: 375x667)
   - ✓ Injects animation CSS before capture
   - ✓ Scrolls page before capture
   - ✓ Waits 1s after scroll
   - ✓ Captures full-page JPEG at 70% quality
   - ✓ Calculates size in KB

### End-to-End Tests
**Coverage:** Full scraping flow

7. **Full Flow:**
   - Test against real URLs:
     - ✓ Simple static site (no animations)
     - ✓ WordPress site with Elementor
     - ✓ Site with WOW.js animations
     - ✓ Site with lazy-loaded images
     - ✓ Site with broken links
     - ✓ Site with Schema.org markup
   - Verify:
     - ✓ Response format matches original
     - ✓ Desktop screenshot captured
     - ✓ Mobile screenshot captured
     - ✓ HTML markup returned
     - ✓ HTTPS flag correct
     - ✓ Load time captured
     - ✓ Broken links detected (max 3)
     - ✓ NAP details extracted
     - ✓ Log file written correctly

8. **Error Handling:**
   - ✓ Invalid domain → 400 error
   - ✓ Missing API key → 401 error
   - ✓ Navigation timeout → "cannot load page" error
   - ✓ Browser crash → "cannot load page" error, browser closed

### Performance Tests
**Coverage:** Validate no regression

9. **Benchmarks:**
   - Scrape 10 different sites, measure:
     - ✓ Total duration (should be ±10% of original)
     - ✓ Memory usage (browser cleanup)
     - ✓ Screenshot sizes (should match original)
     - ✓ Log file size (should match original)

---

## 10. Success Criteria

### Functional Requirements
- ✅ All endpoint behavior matches original exactly
- ✅ Response format identical (field names, data URIs, error format)
- ✅ Screenshots visually identical (same quality, dimensions)
- ✅ Broken links detection returns same results
- ✅ NAP extraction accuracy unchanged
- ✅ Log file format/location unchanged
- ✅ Authentication behavior unchanged (401/500 errors)

### Performance Requirements
- ✅ Scraping duration within ±10% of original
- ✅ Memory usage stable (no browser leaks)
- ✅ Screenshot sizes within ±5% of original

### Code Quality Requirements
- ✅ Route file reduced to <50 LOC (from 874)
- ✅ All services <250 LOC each
- ✅ All utils <100 LOC each
- ✅ No code duplication
- ✅ TypeScript strict mode passes
- ✅ ESLint passes with no warnings

### Testing Requirements
- ✅ Unit test coverage >80% for services/utils
- ✅ Integration tests cover orchestrator + controller
- ✅ E2E tests pass against 5+ real websites
- ✅ Performance benchmarks within tolerance

### Documentation Requirements
- ✅ JSDoc comments on all public functions
- ✅ README in `controllers/scraper/` explaining architecture
- ✅ Type definitions exported for external consumers
- ✅ Migration guide for future route refactors

---

## 11. Post-Refactor Improvements (Optional)

### Immediate Opportunities
Once refactor is stable, consider:

1. **Configuration externalization:**
   - Move hardcoded values to config file:
     - Screenshot quality (70%)
     - Wait times (1s)
     - Viewport dimensions (1280x720, 375x667)
     - Retry counts (2)
     - Batch sizes (5 for link checking)
     - Max broken links (3)

2. **Observability enhancements:**
   - Replace file logging with structured logger (Winston/Pino)
   - Add metrics (Prometheus):
     - Scraping duration histogram
     - Screenshot size histogram
     - Broken links count gauge
     - NAP extraction success rate
   - Add distributed tracing (OpenTelemetry)

3. **Error handling improvements:**
   - Distinguish error types:
     - `NavigationError` (timeout, network)
     - `ValidationError` (invalid domain)
     - `BrowserError` (crash, timeout)
   - Return specific error codes/messages
   - Add retry logic with exponential backoff

4. **Performance optimizations:**
   - Run broken links check in parallel with NAP extraction
   - Capture mobile screenshot in parallel with desktop (2 pages)
   - Add caching layer (cache screenshots by domain+hash)
   - Reduce screenshot sizes further (WebP format, adaptive quality)

### Future Enhancements
Consider in next iteration:

5. **Webhook notifications:**
   - POST results to n8n webhook (if configured)
   - Async processing (queue-based)

6. **Multi-page scraping:**
   - Extend to scrape contact page, about page
   - Parallel page scraping

7. **Browser pooling:**
   - Reuse browser instances across requests
   - Connection pooling for HTTP requests (link checking)

8. **Rate limiting:**
   - Prevent abuse (max N requests per API key per hour)
   - Queue-based request handling

---

## 12. Dependencies & Environment

### Existing Dependencies (Preserved)
- `express` (^4.x)
- `puppeteer` (^21.x)
- `fs` (Node.js built-in)
- `path` (Node.js built-in)
- `https`, `http` (Node.js built-in)

### New Dependencies (None)
- Refactor uses only existing dependencies
- No new npm packages required

### Environment Variables
Required (unchanged):
- `SCRAPER_API_KEY` - API key for authentication

Optional (for future enhancements):
- `SCRAPER_LOG_DIR` - custom log directory (default: `../logs`)
- `SCRAPER_LOG_FILE` - custom log file name (default: `scraping-tool.log`)
- `SCRAPER_SCREENSHOT_QUALITY` - JPEG quality (default: 70)
- `SCRAPER_MAX_BROKEN_LINKS` - max broken links to check (default: 3)

---

## 13. Blast Radius

### Systems Impacted
1. **Direct:**
   - `/scraper/homepage` endpoint consumers (likely n8n workflows)
   - Any monitoring/alerting on log files (`../logs/scraping-tool.log`)

2. **Indirect:**
   - None - scraper route is isolated, no shared dependencies with other routes

### Consumers
- **n8n workflows** - likely the primary consumer (webhook-style API)
  - **Risk:** Changes to response format or error structure could break workflows
  - **Mitigation:** Preserve exact response format, field names, error messages

### Data Impact
- **No database changes** - route does not interact with database
- **File system:** Log files continue to be written to same location

### Rollout Strategy
1. **Deploy to staging first**
2. **Run parallel testing** (original vs. refactored endpoint)
3. **Deploy to production with feature flag** (gradual rollout)
4. **Monitor error rates, response times, log quality**
5. **Full cutover after 48 hours of stable operation**

---

## 14. Timeline Estimate

### Phase 1 (Setup): 1 day
- Create directory structure
- Create type definitions
- No functional changes

### Phase 2 (Utilities): 2 days
- Extract 4 utility files
- Write unit tests
- Validate in isolation

### Phase 3 (Services): 4 days
- Extract 6 service files
- Write unit tests
- Validate in isolation

### Phase 4 (Middleware): 0.5 days
- Extract middleware
- Test authentication

### Phase 5 (Controller): 2 days
- Create controller
- Write integration tests
- Validate HTTP layer

### Phase 6 (Route Update): 0.5 days
- Refactor route file
- Update imports

### Phase 7 (Testing): 3 days
- E2E tests
- Performance validation
- Bug fixes

### Phase 8 (Documentation): 1 day
- JSDoc comments
- README files
- Migration guide

### Phase 9 (Deployment): 1 day
- Staging deployment
- Production deployment
- Monitoring

**Total Estimated Time:** 15 days (3 weeks)

---

## 15. Definition of Done

- [ ] All 17 new files created
- [ ] Route file reduced to <50 LOC
- [ ] All TypeScript compilation errors resolved
- [ ] All ESLint warnings resolved
- [ ] Unit tests written for all services/utils (>80% coverage)
- [ ] Integration tests written for orchestrator + controller
- [ ] E2E tests pass against 5+ real websites
- [ ] Performance benchmarks within ±10% of original
- [ ] Response format matches original exactly (verified with diff)
- [ ] Error handling matches original exactly
- [ ] Log file format/location unchanged
- [ ] Authentication behavior unchanged
- [ ] JSDoc comments added to all public functions
- [ ] README created in `controllers/scraper/`
- [ ] Migration guide documented
- [ ] Code reviewed by peer
- [ ] Deployed to staging
- [ ] Staging tests pass (24 hours stable)
- [ ] Deployed to production with feature flag
- [ ] Production monitoring shows no regressions (48 hours)
- [ ] Feature flag removed, original route file archived
- [ ] Post-refactor retrospective completed

---

## 16. Notes & Assumptions

### Assumptions
1. **No breaking changes to API contract** - n8n workflows depend on exact response format
2. **File logging must be preserved** - monitoring tools depend on log files
3. **Screenshot quality must match** - downstream consumers depend on image quality
4. **No new dependencies** - avoid adding complexity
5. **Exact error messages preserved** - consumers may parse error messages

### Open Questions
1. **Are there other consumers besides n8n?** - need to identify all API consumers
2. **Is file logging the only observability mechanism?** - should we add metrics?
3. **Are there rate limits on Puppeteer usage?** - should we add request throttling?
4. **Do we need to support parallel requests?** - current implementation is synchronous
5. **What is the expected concurrency level?** - affects browser pooling decisions

### Future Considerations
1. **Caching layer** - cache screenshots by domain hash (TTL: 24 hours)
2. **Queue-based processing** - decouple request from scraping (async)
3. **Browser pooling** - reuse browser instances (reduce startup overhead)
4. **Multi-region support** - deploy scrapers closer to target websites
5. **Cost optimization** - reduce Puppeteer usage (headless Chrome is expensive)

---

**Plan Status:** Ready for Review
**Last Updated:** 2026-02-18
**Next Step:** Review plan → Create types → Extract utilities → Build services → Integrate controller → Test → Deploy
