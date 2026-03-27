# Google Auth Route Refactor Plan

## Current State

### File Location
`/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/googleauth.ts`

### Lines of Code
381 LOC (including embedded HTML templates and whitespace)

### Endpoints
1. **GET /api/auth/url** (Lines 85-110)
   - Purpose: Generates OAuth2 authorization URL for Google APIs
   - Protection: None (public endpoint)
   - Response: JSON with authUrl, scopes, message

2. **POST /api/auth/callback** (Lines 112-149)
   - Purpose: Exchanges authorization code for OAuth tokens
   - Protection: None (OAuth callback)
   - Response: JSON with tokens, scope info, supported APIs

3. **GET /api/auth/web-callback** (Lines 152-318)
   - Purpose: Browser-friendly OAuth callback with HTML UI
   - Protection: None (OAuth callback)
   - Response: HTML success/error page with token display and copy functionality

4. **GET /api/auth/validate** (Lines 321-354)
   - Purpose: Validates stored refresh token by attempting to refresh access token
   - Protection: None (diagnostic endpoint)
   - Response: JSON validation status with scope info

5. **GET /api/auth/scopes** (Lines 357-378)
   - Purpose: Returns information about required OAuth scopes
   - Protection: None (informational endpoint)
   - Response: JSON with scope descriptions and API coverage

### Current Dependencies
- `express` - routing framework
- `googleapis` - Google OAuth2 client and API access
- Environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `GOOGLE_REDIRECT_URI` (optional, has fallback)
  - `NODE_ENV` (for dev vs prod error details)

### No Direct Database Calls
This route does **not** interact with the database directly. It delegates to OAuth flow only.

### Business Logic in Route
- Lines 7-15: OAuth2 configuration object
- Lines 18-27: Required scopes array (GA4, GSC, GBP)
- Lines 30-42: Configuration validation function
- Lines 45-63: OAuth2 client factory function
- Lines 66-82: Generic error handler
- Lines 85-110: Auth URL generation logic
- Lines 112-149: OAuth token exchange logic
- Lines 152-318: Web callback with embedded HTML template (166 lines of inline HTML/CSS/JS)
- Lines 321-354: Token validation logic
- Lines 357-378: Scopes information endpoint

### Embedded HTML Templates
- Success page: Lines 176-294 (119 lines)
- Error page: Lines 297-316 (20 lines)

---

## Target Architecture

```
signalsai-backend/src/
├── controllers/
│   └── googleauth/
│       ├── GoogleAuthController.ts           # Main controller (5 methods)
│       ├── services/
│       │   ├── OAuth2Service.ts              # OAuth2 client management & token operations
│       │   └── TokenValidationService.ts     # Token refresh & validation logic
│       └── utils/
│           ├── oauthConfig.ts                # OAuth2 configuration & validation
│           ├── scopeDefinitions.ts           # Google API scope constants & descriptions
│           ├── errorHandler.ts               # OAuth error formatting
│           └── templates/
│               ├── successTemplate.ts        # HTML success page
│               └── errorTemplate.ts          # HTML error page
└── routes/
    └── googleauth.ts                         # Stripped down to route definitions only
```

---

## Mapping

### What Moves to Controller
**File: `GoogleAuthController.ts`**
- Request parameter extraction (code, error, state)
- Response formatting (JSON and HTML)
- HTTP status code decisions
- Error-to-HTTP-response mapping
- Entry point for all 5 endpoints

**Methods:**
- `generateAuthUrl(req: Request, res: Response)` - handles GET /url
- `handleCallback(req: Request, res: Response)` - handles POST /callback
- `handleWebCallback(req: Request, res: Response)` - handles GET /web-callback
- `validateToken(req: Request, res: Response)` - handles GET /validate
- `getScopeInfo(req: Request, res: Response)` - handles GET /scopes

### What Moves to Services

**File: `OAuth2Service.ts`**
- OAuth2 client instantiation
- Auth URL generation with scope configuration
- Authorization code → token exchange
- Token refresh operations
- Credentials management

**Methods:**
- `createInitialClient(): OAuth2Client` - creates client for initial auth
- `createAuthenticatedClient(): OAuth2Client` - creates client with refresh token
- `generateAuthorizationUrl(): string` - generates consent URL
- `exchangeCodeForTokens(code: string): Promise<TokenResult>` - exchanges code
- `refreshAccessToken(): Promise<string>` - refreshes access token

**Dependencies:**
- `googleapis` library
- OAuth config from `oauthConfig.ts`
- Scope definitions from `scopeDefinitions.ts`

**File: `TokenValidationService.ts`**
- Token validation orchestration
- Access token refresh testing
- Validation result formatting

**Methods:**
- `validateRefreshToken(): Promise<ValidationResult>` - validates stored token
- `testTokenRefresh(client: OAuth2Client): Promise<boolean>` - tests refresh capability

**Dependencies:**
- `OAuth2Service` for client creation
- OAuth config for token access

### What Moves to Utils

**File: `oauthConfig.ts`**
- OAuth2 configuration object construction
- Environment variable loading
- Configuration validation logic
- Missing variable detection

**Exports:**
- `OAUTH2_CONFIG` object
- `validateOAuth2Config()` function
- `validateInitialConfig()` function

**File: `scopeDefinitions.ts`**
- Google API scope constants
- Scope descriptions mapping
- Supported APIs list

**Exports:**
- `REQUIRED_SCOPES` array
- `SCOPE_DESCRIPTIONS` object
- `SUPPORTED_APIS` array

**File: `errorHandler.ts`**
- OAuth error formatting
- Error detail extraction
- Environment-aware error exposure
- Status code mapping

**Exports:**
- `formatOAuthError(error: any, operation: string)` function
- `getErrorStatusCode(error: any): number` function

**File: `templates/successTemplate.ts`**
- HTML success page generation
- Token display formatting
- Copy-to-clipboard functionality

**Exports:**
- `generateSuccessPage(tokens: TokenInfo): string` function

**File: `templates/errorTemplate.ts`**
- HTML error page generation
- Error message formatting

**Exports:**
- `generateErrorPage(error: Error): string` function

### What Stays in Route File
- Route definitions (router.get, router.post)
- Controller method invocations
- Import statements for router and controller
- Router export

---

## Step-by-Step Migration

### Step 1: Create Directory Structure
```bash
mkdir -p /Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/services
mkdir -p /Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/templates
```

### Step 2: Extract Configuration (oauthConfig.ts)
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/oauthConfig.ts`

**Extract from route file:**
- Lines 7-15: OAUTH2_CONFIG object
- Lines 30-42: validateOAuth2Config function
- Lines 45-56: Validation logic from createInitialOAuth2Client

**Responsibilities:**
- Centralize OAuth configuration
- Provide validation functions for both initial and full config
- Export typed configuration object

**Interface:**
```typescript
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  redirectUri: string;
  email: string;
}

export const OAUTH2_CONFIG: OAuth2Config;
export function validateOAuth2Config(): void; // Full validation
export function validateInitialConfig(): void; // Client ID/Secret only
```

### Step 3: Extract Scope Definitions (scopeDefinitions.ts)
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/scopeDefinitions.ts`

**Extract from route file:**
- Lines 18-27: REQUIRED_SCOPES array
- Lines 360-371: Scope descriptions (from /scopes endpoint)
- Lines 372-376: APIs covered list

**Responsibilities:**
- Define all Google API scopes
- Provide human-readable descriptions
- List supported APIs

**Interface:**
```typescript
export const REQUIRED_SCOPES: string[];
export const SCOPE_DESCRIPTIONS: Record<string, string>;
export const SUPPORTED_APIS: string[];
```

### Step 4: Extract Error Handler (errorHandler.ts)
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/errorHandler.ts`

**Extract from route file:**
- Lines 66-82: handleError function

**Responsibilities:**
- Format OAuth errors consistently
- Extract relevant error details
- Determine appropriate HTTP status codes
- Control error detail exposure based on environment

**Interface:**
```typescript
interface FormattedError {
  operation: string;
  message: string;
  status?: number;
  data?: any;
  stack?: string;
}

export function formatOAuthError(error: any, operation: string): FormattedError;
export function getErrorStatusCode(error: any): number;
```

### Step 5: Extract HTML Templates
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/templates/successTemplate.ts`

**Extract from route file:**
- Lines 176-294: HTML success page template

**Responsibilities:**
- Generate success page with token display
- Include copy-to-clipboard functionality
- Format token expiry times
- Provide next steps instructions

**Interface:**
```typescript
interface TokenInfo {
  refreshToken?: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
}

export function generateSuccessPage(tokens: TokenInfo): string;
```

**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/templates/errorTemplate.ts`

**Extract from route file:**
- Lines 297-316: HTML error page template

**Interface:**
```typescript
export function generateErrorPage(errorMessage: string): string;
```

### Step 6: Create OAuth2Service
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/services/OAuth2Service.ts`

**Extract from route file:**
- Lines 45-63: createInitialOAuth2Client function (refactored to class method)
- Lines 90-97: Auth URL generation logic
- Lines 123: Token exchange logic
- Lines 331-336: Access token refresh logic

**Responsibilities:**
- Instantiate OAuth2 clients (initial and authenticated)
- Generate authorization URLs
- Exchange authorization codes for tokens
- Refresh access tokens
- Abstract googleapis OAuth2 implementation details

**Interface:**
```typescript
interface TokenResult {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
}

class OAuth2Service {
  static createInitialClient(): OAuth2Client;
  static createAuthenticatedClient(): OAuth2Client;
  static generateAuthorizationUrl(): string;
  static async exchangeCodeForTokens(code: string): Promise<TokenResult>;
  static async refreshAccessToken(): Promise<string>;
}
```

**Dependencies:**
- `googleapis` library
- `OAUTH2_CONFIG` from oauthConfig
- `REQUIRED_SCOPES` from scopeDefinitions
- `validateInitialConfig()` from oauthConfig
- `validateOAuth2Config()` from oauthConfig

### Step 7: Create TokenValidationService
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/services/TokenValidationService.ts`

**Extract from route file:**
- Lines 321-354: Token validation logic

**Responsibilities:**
- Validate refresh token by attempting access token refresh
- Test OAuth client functionality
- Return structured validation results

**Interface:**
```typescript
interface ValidationResult {
  valid: boolean;
  message: string;
  hasRefreshToken: boolean;
  scopes: string[];
}

class TokenValidationService {
  static async validateRefreshToken(): Promise<ValidationResult>;
}
```

**Dependencies:**
- `OAuth2Service` for client creation and token refresh
- `OAUTH2_CONFIG` from oauthConfig
- `REQUIRED_SCOPES` from scopeDefinitions

### Step 8: Create GoogleAuthController
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/GoogleAuthController.ts`

**Extract from route file:**
- Lines 85-110: /url endpoint logic (minus business logic)
- Lines 112-149: /callback endpoint logic (minus business logic)
- Lines 152-318: /web-callback endpoint logic (minus business logic and templates)
- Lines 321-354: /validate endpoint logic (minus business logic)
- Lines 357-378: /scopes endpoint logic (already just data retrieval)

**Responsibilities:**
- HTTP request/response handling
- Parameter extraction (code, error, state)
- Service orchestration
- Response formatting (JSON and HTML)
- Error-to-HTTP mapping
- Console logging for operations

**Methods:**
```typescript
class GoogleAuthController {
  static generateAuthUrl(req: Request, res: Response): void;
  static async handleCallback(req: Request, res: Response): Promise<void>;
  static async handleWebCallback(req: Request, res: Response): Promise<void>;
  static async validateToken(req: Request, res: Response): Promise<void>;
  static getScopeInfo(req: Request, res: Response): void;
}
```

**Dependencies:**
- `OAuth2Service` for all OAuth operations
- `TokenValidationService` for token validation
- `generateSuccessPage` from successTemplate
- `generateErrorPage` from errorTemplate
- `formatOAuthError` from errorHandler
- `REQUIRED_SCOPES`, `SCOPE_DESCRIPTIONS`, `SUPPORTED_APIS` from scopeDefinitions

**Error handling:**
- Catch service errors
- Format using errorHandler utility
- Return appropriate HTTP status codes
- Log errors to console with operation context

### Step 9: Update Route File
**File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/googleauth.ts`

**Remove:**
- Line 2: googleapis import
- Lines 7-15: OAUTH2_CONFIG
- Lines 18-27: REQUIRED_SCOPES
- Lines 30-42: validateOAuth2Config
- Lines 45-63: createInitialOAuth2Client
- Lines 66-82: handleError
- Lines 85-378: All endpoint handlers

**Add:**
- Import: `GoogleAuthController` from controller file

**Replace handlers with:**
```typescript
googleAuthRoutes.get("/url", GoogleAuthController.generateAuthUrl);
googleAuthRoutes.post("/callback", GoogleAuthController.handleCallback);
googleAuthRoutes.get("/web-callback", GoogleAuthController.handleWebCallback);
googleAuthRoutes.get("/validate", GoogleAuthController.validateToken);
googleAuthRoutes.get("/scopes", GoogleAuthController.getScopeInfo);
```

**Final route file:** ~15 LOC (down from 381)

### Step 10: Verification
1. Run TypeScript compiler: `tsc --noEmit`
2. Start dev server: `npm run dev`
3. Manual test: GET /api/auth/url → verify authUrl generated
4. Manual test: Visit authUrl in browser → complete OAuth flow
5. Manual test: Verify web-callback renders HTML correctly
6. Manual test: Verify copy-to-clipboard button works
7. Manual test: GET /api/auth/validate → verify token validation
8. Manual test: GET /api/auth/scopes → verify scope info returned
9. Verify console logs appear with correct operation context
10. Test error cases: invalid code, missing config

---

## Files to Create

### 1. oauthConfig.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/oauthConfig.ts`

**Responsibilities:**
- Load environment variables
- Construct OAuth2 configuration object
- Validate configuration (full and partial)
- Provide typed config exports

**Exports:**
- `OAuth2Config` interface
- `OAUTH2_CONFIG` object
- `validateOAuth2Config()` function (requires all vars)
- `validateInitialConfig()` function (requires client ID/secret only)

**Environment variables:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_REDIRECT_URI` (with fallback)

### 2. scopeDefinitions.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/scopeDefinitions.ts`

**Responsibilities:**
- Define required OAuth scopes
- Provide human-readable descriptions
- List supported Google APIs

**Exports:**
- `REQUIRED_SCOPES: string[]`
- `SCOPE_DESCRIPTIONS: Record<string, string>`
- `SUPPORTED_APIS: string[]`

**No dependencies** - pure data exports

### 3. errorHandler.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/errorHandler.ts`

**Responsibilities:**
- Format OAuth errors consistently
- Extract error details safely
- Map errors to HTTP status codes
- Control error exposure by environment

**Exports:**
- `FormattedError` interface
- `formatOAuthError(error, operation)` function
- `getErrorStatusCode(error)` function

**Dependencies:**
- `process.env.NODE_ENV`

### 4. successTemplate.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/templates/successTemplate.ts`

**Responsibilities:**
- Generate HTML success page
- Display tokens with formatting
- Include copy-to-clipboard functionality
- Provide setup instructions
- List authorized APIs

**Exports:**
- `TokenInfo` interface
- `generateSuccessPage(tokens)` function

**Dependencies:** None - pure template generation

### 5. errorTemplate.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/utils/templates/errorTemplate.ts`

**Responsibilities:**
- Generate HTML error page
- Display error message
- Provide retry link

**Exports:**
- `generateErrorPage(errorMessage)` function

**Dependencies:** None - pure template generation

### 6. OAuth2Service.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/services/OAuth2Service.ts`

**Responsibilities:**
- Abstract googleapis OAuth2 implementation
- Create OAuth2 clients (initial and authenticated)
- Generate authorization URLs
- Exchange codes for tokens
- Refresh access tokens

**Exports:**
- `TokenResult` interface
- `OAuth2Service` class with static methods

**Dependencies:**
- `googleapis` library
- `OAUTH2_CONFIG` from oauthConfig
- `REQUIRED_SCOPES` from scopeDefinitions
- `validateInitialConfig` and `validateOAuth2Config` from oauthConfig

### 7. TokenValidationService.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/services/TokenValidationService.ts`

**Responsibilities:**
- Validate refresh token functionality
- Test token refresh capability
- Return structured validation results

**Exports:**
- `ValidationResult` interface
- `TokenValidationService` class with static method

**Dependencies:**
- `OAuth2Service` for client creation and token operations
- `OAUTH2_CONFIG` from oauthConfig
- `REQUIRED_SCOPES` from scopeDefinitions

### 8. GoogleAuthController.ts
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/googleauth/GoogleAuthController.ts`

**Responsibilities:**
- HTTP request/response handling
- Parameter extraction and validation
- Service orchestration
- Response formatting (JSON and HTML)
- Error handling and logging
- Console logging for operations

**Exports:**
- `GoogleAuthController` class with 5 static methods

**Dependencies:**
- Express types (Request, Response)
- `OAuth2Service` from services
- `TokenValidationService` from services
- `generateSuccessPage` from templates/successTemplate
- `generateErrorPage` from templates/errorTemplate
- `formatOAuthError`, `getErrorStatusCode` from errorHandler
- `REQUIRED_SCOPES`, `SCOPE_DESCRIPTIONS`, `SUPPORTED_APIS` from scopeDefinitions

---

## Files to Modify

### 1. googleauth.ts (Route file)
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/googleauth.ts`

**Changes:**
- Remove: googleapis import
- Remove: All configuration constants
- Remove: All utility functions
- Remove: All embedded HTML templates
- Remove: All endpoint handler implementations
- Add: GoogleAuthController import
- Replace: Inline handlers with controller method references
- Keep: express import, router setup, export

**Before:** 381 LOC with business logic, config, utils, and HTML templates
**After:** ~15 LOC with route definitions only

**No middleware** - all endpoints are public OAuth callbacks

---

## Risk Assessment

### Low Risk ✅
- **No database calls:** Pure OAuth flow, no data persistence
- **No authentication:** All endpoints are public (OAuth callbacks)
- **No shared state:** Stateless request handling
- **Clear boundaries:** Configuration, services, templates, controller are cleanly separable
- **Existing patterns:** OAuth flow is standard, well-documented

### Medium Risk ⚠️
- **Large HTML templates:** 166 lines of embedded HTML must be extracted carefully
  - **Mitigation:** Preserve exact HTML structure, CSS, and JavaScript
  - **Verification:** Visual testing in browser required

- **Environment variable access:** Multiple services need OAuth config
  - **Mitigation:** Centralize in oauthConfig.ts, import consistently
  - **Verification:** Test with missing env vars to ensure error messages work

- **Error handling changes:** Service throws errors vs route returns responses
  - **Mitigation:** Controller maps service errors to identical HTTP responses
  - **Verification:** Test error paths (invalid code, missing config, network failures)

- **Token information exposure:** Success page displays refresh tokens
  - **Mitigation:** Preserve exact template logic, no changes to token display
  - **Security note:** This is intended behavior for initial setup flow

### Potential Failure Points 🔴

#### 1. HTML template preservation
**Problem:** Extracting 166 lines of HTML/CSS/JS could introduce syntax errors

**Solution:**
- Copy templates verbatim into template files
- Use template literals exactly as in original
- Test in browser with real OAuth flow
- Verify copy-to-clipboard functionality works
- Check responsive design on mobile

#### 2. OAuth client instantiation timing
**Problem:** Services must create OAuth clients with correct configuration state

**Solution:**
- Validate config before client creation
- Throw clear errors if env vars missing
- Document which methods require full vs partial config
- OAuth2Service.createInitialClient() → requires clientId, clientSecret only
- OAuth2Service.createAuthenticatedClient() → requires all config including refreshToken

#### 3. Callback URL mismatch
**Problem:** Google OAuth requires exact redirect URI match

**Solution:**
- Preserve OAUTH2_CONFIG.redirectUri logic exactly
- Maintain fallback to localhost:3000
- Document required environment variable setup
- Test with both production and development redirect URIs

#### 4. Scope array changes
**Problem:** Modifying REQUIRED_SCOPES could break existing OAuth authorizations

**Solution:**
- Extract scopes exactly as defined (no changes)
- Document that scope changes require re-authorization
- Keep scope descriptions in sync with scope array

#### 5. Error response format changes
**Problem:** External systems may depend on exact error response structure

**Solution:**
- Controller preserves exact JSON error format
- Error handler maintains identical status code logic
- Test error responses: invalid code, expired code, network failure
- Verify HTML error page renders correctly

#### 6. Console logging context
**Problem:** Log messages reference operation names

**Solution:**
- Pass operation context to error handler
- Preserve log format: `=== Operation Name ===`
- Maintain success log messages: `✅ Operation successful`
- Keep error logging with stack traces (first 3 lines)

#### 7. Token expiry date formatting
**Problem:** HTML template uses Date formatting for expiry times

**Solution:**
- Preserve exact date formatting logic in template
- Test with tokens that have expiry dates
- Test with tokens that don't have expiry dates
- Verify fallback to "unknown" works

### Testing Strategy

#### Unit Tests
- **oauthConfig.ts**
  - validateOAuth2Config() with missing vars
  - validateInitialConfig() with partial config
  - Config object construction

- **errorHandler.ts**
  - formatOAuthError() with various error types
  - getErrorStatusCode() for different status codes
  - Error detail exposure in dev vs production

- **OAuth2Service**
  - createInitialClient() with valid config
  - createInitialClient() with missing config
  - generateAuthorizationUrl() output format
  - Mock googleapis OAuth2 client

- **TokenValidationService**
  - validateRefreshToken() success case
  - validateRefreshToken() failure case
  - Mock OAuth2Service

- **Template generation**
  - generateSuccessPage() with full token info
  - generateSuccessPage() with missing refresh token
  - generateErrorPage() with error message

#### Integration Tests
- GET /api/auth/url
  - Verify authUrl format
  - Verify scopes included
  - Test with missing client ID (expect 500)

- POST /api/auth/callback
  - Valid authorization code → expect tokens
  - Missing code → expect 400
  - Invalid code → expect error

- GET /api/auth/web-callback
  - Valid authorization code → expect HTML success page
  - Missing code → expect HTML error page
  - OAuth error parameter → expect error response
  - Verify HTML renders correctly in browser

- GET /api/auth/validate
  - Valid refresh token → expect valid: true
  - Invalid refresh token → expect valid: false
  - Missing refresh token → expect error

- GET /api/auth/scopes
  - Verify scope list returned
  - Verify descriptions included

#### Manual Verification (Critical)
1. Start dev server
2. GET /api/auth/url → copy authUrl
3. Visit authUrl in browser
4. Complete Google OAuth consent flow
5. Redirected to /web-callback → verify HTML page renders
6. Verify token displayed correctly
7. Click "Copy to Clipboard" → verify copies to clipboard
8. Verify setup instructions readable
9. Add token to .env file
10. Restart server
11. GET /api/auth/validate → verify token valid
12. Test error case: GET /web-callback?error=access_denied

### Rollback Plan

If issues arise:

1. **Immediate:** Revert route file to original version
   ```bash
   git checkout signalsai-backend/src/routes/googleauth.ts
   ```

2. **Clean up:** Delete controller directory
   ```bash
   rm -rf signalsai-backend/src/controllers/googleauth
   ```

3. **Verify:** Restart server, test OAuth flow

4. **Duration:** < 5 minutes

**No data migration involved** - purely code reorganization.
**No external dependencies** - OAuth flow unchanged.

---

## Definition of Done

- [ ] oauthConfig.ts created with config validation
- [ ] scopeDefinitions.ts created with scope arrays
- [ ] errorHandler.ts created with error formatting
- [ ] successTemplate.ts created with exact HTML preserved
- [ ] errorTemplate.ts created with exact HTML preserved
- [ ] OAuth2Service created with all OAuth operations
- [ ] TokenValidationService created with validation logic
- [ ] GoogleAuthController created with 5 endpoint handlers
- [ ] Route file stripped to route definitions only (~15 LOC)
- [ ] TypeScript compiles without errors
- [ ] GET /url returns valid authUrl
- [ ] POST /callback exchanges code for tokens
- [ ] GET /web-callback renders HTML success page
- [ ] HTML success page copy button works
- [ ] GET /web-callback with error renders error page
- [ ] GET /validate tests token refresh
- [ ] GET /scopes returns scope information
- [ ] Console logs preserve operation context
- [ ] Error responses match original format
- [ ] Status codes unchanged
- [ ] OAuth flow works end-to-end in browser

---

## Notes

### Why This Refactor?
- **Separation of concerns:** HTTP handling vs OAuth logic vs configuration
- **Testability:** Services can be unit tested without Express or browser
- **Maintainability:** Configuration centralized, easy to update
- **Template management:** HTML extracted from route file (119 lines removed)
- **Reusability:** OAuth operations can be called from other contexts
- **Consistency:** Matches target architecture pattern
- **Clarity:** Route file becomes pure routing (381 LOC → 15 LOC)

### Architectural Decisions

#### Decision 1: Template Extraction
**Rationale:** 166 lines of embedded HTML makes route file unreadable
**Tradeoff:** Adds 2 more files, but dramatically improves route file clarity
**Alternatives considered:** Leave templates inline (rejected - too large)

#### Decision 2: Two Services (OAuth2Service + TokenValidationService)
**Rationale:** Validation is a distinct concern from OAuth operations
**Tradeoff:** Could combine into one service, but separation is clearer
**Alternatives considered:** Single service (rejected - violates SRP)

#### Decision 3: Static Methods vs Instance
**Rationale:** No state maintained between requests, static is simpler
**Tradeoff:** Harder to mock in tests (can use module mocks)
**Future:** Could convert to instance methods if state needed

#### Decision 4: Configuration Validation Functions
**Rationale:** Some operations need full config, some need partial
**Implementation:** Two validation functions (full vs initial)
**Benefit:** Clear error messages for missing environment variables

### Security Considerations

#### Token Display in Browser
- Success page displays refresh token in HTML
- This is **intentional** for initial setup flow
- User copies token to .env file manually
- Only accessible via OAuth callback (requires Google consent)

#### Error Detail Exposure
- Production: minimal error details
- Development: full error stack traces
- Controlled by NODE_ENV environment variable

#### No Authentication on Endpoints
- All 5 endpoints are public
- This is correct for OAuth callback flow
- Google OAuth validates authorization codes
- Refresh token must be stored securely in .env

### Performance Considerations

#### HTML Template Generation
- Templates generated on every request
- Templates are small (~5KB), generation is fast
- No caching needed (callback endpoints hit once per OAuth flow)
- Future optimization: Cache compiled templates if needed

#### OAuth Client Instantiation
- New OAuth2 client created per request
- Clients are stateless, instantiation is cheap
- No connection pooling needed
- Google API rate limits are per-token, not per-client

### OAuth Flow Documentation

#### Initial Setup Flow
1. GET /url → User gets authorization URL
2. User visits URL → Completes Google consent screen
3. Google redirects → GET /web-callback with code
4. Backend exchanges code → Gets refresh token
5. User copies token → Adds to .env file
6. Backend uses refresh token → Gets access tokens for API calls

#### Ongoing API Access
1. Backend reads refresh token from .env
2. OAuth2Service creates authenticated client
3. Client automatically refreshes access tokens as needed
4. No user interaction required

### Future Enhancements (Out of Scope)
- Token rotation: Automatically update .env file with new refresh tokens
- Database persistence: Store tokens in database instead of .env
- Multi-user support: Store tokens per user account
- Token revocation: Endpoint to revoke OAuth access
- Scope expansion: Add additional Google APIs
- Webhook support: Receive notifications on token expiry
- Admin UI: Web interface for OAuth setup instead of manual .env editing

### Related Files (For Reference)
- Route file: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/googleauth.ts`
- Environment template: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/.env.example` (if exists)
- Other Google API routes:
  - GA4: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/ga4.ts`
  - GSC: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/gsc.ts`
  - GBP: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/gbp.ts`

### Dependencies Analysis

#### External Dependencies
- `googleapis` (^118.0.0 or similar) - Google OAuth2 client
- `express` (^4.x) - HTTP framework

#### Internal Dependencies
- None (no database, no models, no middleware)

#### Dependency Injection Opportunities
- OAuth2Service could accept config as constructor parameter
- TokenValidationService could accept OAuth2Service instance
- Currently using static methods for simplicity
- Future: Refactor to instances if testing becomes difficult

### Migration Complexity
**Estimated effort:** 3-4 hours
- Configuration extraction: 30 minutes
- Template extraction: 1 hour (testing in browser)
- Service creation: 1 hour
- Controller creation: 1 hour
- Testing and verification: 30-60 minutes

**Complexity level:** Medium
- No database changes
- No breaking API changes
- Large HTML templates require careful extraction
- OAuth flow must be tested end-to-end

**Risk level:** Low-Medium
- OAuth flow is well-isolated
- No dependencies on other routes
- Failure only affects OAuth setup (not main app functionality)
- Easy rollback (single file revert)
