# Website Contact Route Refactor Plan

**Route**: `/api/websites/contact`
**Current File**: `signalsai-backend/src/routes/websiteContact.ts`
**Date**: 2026-02-18
**Lines of Code**: 156

---

## 1. Current State

### Overview
Public contact form endpoint for rendered sites at `*.sites.getalloro.com`. No authentication required.

### Single Endpoint
- **POST** `/api/websites/contact` — Accepts contact form submissions

### Responsibilities (Current)
1. Input validation (required fields)
2. reCAPTCHA verification via Google API
3. Input sanitization (HTML tag stripping)
4. Hostname extraction from request headers (Origin/Referer)
5. HTML email body generation
6. Webhook forwarding to n8n (email dispatch)
7. Error handling and logging
8. Environment variable configuration management

### Dependencies
- `express` (Request, Response)
- `fetch` API (reCAPTCHA verification, n8n webhook)
- Environment variables:
  - `RECAPTCHA_SECRET_KEY`
  - `CONTACT_FORM_RECIPIENTS`
  - `CONTACT_FORM_FROM`
  - `ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK`

### Current Architecture Issues
- Route file contains all business logic (controller + service + utility functions)
- Utilities (`sanitize`, `extractHostname`, `buildEmailBody`) are tightly coupled to route file
- No separation between HTTP handling and business logic
- Testing requires mocking entire route
- No reusability of utility functions
- Difficult to locate specific concerns (email template, captcha logic, etc.)

---

## 2. Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── websiteContact.ts              # Route definitions only (~20 LOC)
└── controllers/
    └── websiteContact/
        ├── websiteContactController.ts      # Main controller (~40 LOC)
        ├── websiteContact-services/
        │   ├── recaptchaService.ts          # reCAPTCHA verification (~30 LOC)
        │   └── emailWebhookService.ts       # n8n webhook dispatch (~35 LOC)
        └── websiteContact-utils/
            ├── sanitization.ts              # Input sanitization (~10 LOC)
            ├── hostnameExtractor.ts         # Header parsing (~15 LOC)
            └── emailTemplateBuilder.ts      # HTML email generation (~40 LOC)
```

### Layer Responsibilities

**Route Layer** (`routes/websiteContact.ts`)
- Express router setup
- Endpoint definition
- Delegate to controller

**Controller Layer** (`websiteContactController.ts`)
- Request/response handling
- Orchestration of services
- Error response formatting
- HTTP status codes
- Top-level try/catch

**Service Layer** (`websiteContact-services/`)
- **recaptchaService.ts**: External API integration for reCAPTCHA
- **emailWebhookService.ts**: n8n webhook integration

**Utility Layer** (`websiteContact-utils/`)
- **sanitization.ts**: Pure function for HTML stripping
- **hostnameExtractor.ts**: Pure function for header parsing
- **emailTemplateBuilder.ts**: Pure function for HTML generation

---

## 3. Code Mapping

### Route File (Target: ~20 LOC)
```typescript
import express from "express";
import { handleContactSubmission } from "../controllers/websiteContact/websiteContactController";

const router = express.Router();

router.post("/contact", handleContactSubmission);

export default router;
```

### Controller (`websiteContactController.ts`)
**Responsibilities:**
- Extract `req.body` fields
- Call validation logic (inline, simple)
- Orchestrate sanitization → reCAPTCHA → email building → webhook
- Return HTTP responses with appropriate status codes
- Catch and format errors

**Function signature:**
```typescript
export async function handleContactSubmission(req: Request, res: Response): Promise<Response>
```

**Current lines to move here:**
- Lines 62-154 (main route handler logic)
- Validation logic (lines 66-77)
- Service orchestration
- Response formatting

---

### Service: `recaptchaService.ts`
**Responsibilities:**
- Verify reCAPTCHA token with Google API
- Handle network errors
- Return boolean success result

**Function signature:**
```typescript
export async function verifyRecaptcha(token: string): Promise<boolean>
```

**Current lines to move here:**
- Lines 80-96 (reCAPTCHA verification)
- Environment variable: `RECAPTCHA_SECRET_KEY`

---

### Service: `emailWebhookService.ts`
**Responsibilities:**
- Send email payload to n8n webhook
- Handle webhook failures
- Log errors

**Function signature:**
```typescript
export async function sendEmailWebhook(payload: EmailWebhookPayload): Promise<void>
```

**Current lines to move here:**
- Lines 101-148 (webhook sending logic)
- Environment variables: `CONTACT_FORM_RECIPIENTS`, `CONTACT_FORM_FROM`, `ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK`

**Types to define:**
```typescript
interface EmailWebhookPayload {
  cc: string[];
  bcc: string[];
  body: string;
  from: string;
  subject: string;
  fromName: string;
  recipients: string[];
}
```

---

### Utility: `sanitization.ts`
**Responsibilities:**
- Strip HTML tags from string input
- Pure function (no side effects)

**Function signature:**
```typescript
export function sanitize(str: string): string
```

**Current lines to move here:**
- Lines 13-15 (sanitize function)

---

### Utility: `hostnameExtractor.ts`
**Responsibilities:**
- Extract site hostname from Origin/Referer headers
- Pure function

**Function signature:**
```typescript
export function extractHostname(req: Request): string | null
```

**Current lines to move here:**
- Lines 19-23 (extractHostname function)

---

### Utility: `emailTemplateBuilder.ts`
**Responsibilities:**
- Build HTML email body from sanitized data
- Pure function

**Function signature:**
```typescript
export function buildEmailBody(data: EmailData): string

interface EmailData {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  siteName: string;
}
```

**Current lines to move here:**
- Lines 26-56 (buildEmailBody function)

---

## 4. Step-by-Step Migration

### Prerequisites
- [ ] Ensure tests exist for current route (if not, add integration tests first)
- [ ] Verify environment variables are documented

### Step 1: Create Directory Structure
```bash
mkdir -p signalsai-backend/src/controllers/websiteContact/websiteContact-services
mkdir -p signalsai-backend/src/controllers/websiteContact/websiteContact-utils
```

### Step 2: Extract Utilities (Pure Functions)
**Order matters: utilities have no dependencies**

1. Create `sanitization.ts`
   - Copy lines 13-15
   - Add TypeScript export
   - Add JSDoc comment

2. Create `hostnameExtractor.ts`
   - Copy lines 19-23
   - Add TypeScript export
   - Import `Request` from express
   - Add JSDoc comment

3. Create `emailTemplateBuilder.ts`
   - Copy lines 26-56
   - Define `EmailData` interface
   - Add TypeScript export
   - Add JSDoc comment

### Step 3: Extract Services (External Integrations)

4. Create `recaptchaService.ts`
   - Copy lines 80-96
   - Refactor to take `token: string` as parameter
   - Return `Promise<boolean>`
   - Handle `process.env.RECAPTCHA_SECRET_KEY` internally
   - Add error handling
   - Add JSDoc comment

5. Create `emailWebhookService.ts`
   - Copy lines 101-148
   - Define `EmailWebhookPayload` interface
   - Create function `sendEmailWebhook(payload: EmailWebhookPayload)`
   - Handle environment variables internally
   - Throw errors instead of returning HTTP responses
   - Add JSDoc comment

### Step 4: Create Controller

6. Create `websiteContactController.ts`
   - Import utilities from `./websiteContact-utils/`
   - Import services from `./websiteContact-services/`
   - Copy lines 62-154 (route handler)
   - Refactor to `export async function handleContactSubmission(req, res)`
   - Replace inline functions with imported utilities
   - Replace inline service calls with imported services
   - Keep validation logic inline (simple field checks)
   - Maintain try/catch with proper error responses

### Step 5: Refactor Route File

7. Modify `routes/websiteContact.ts`
   - Remove all helper functions
   - Remove route handler logic
   - Import `handleContactSubmission` from controller
   - Define route: `router.post("/contact", handleContactSubmission)`
   - Keep JSDoc file header comment

### Step 6: Verification

8. Manual verification steps:
   - [ ] Check imports resolve correctly
   - [ ] Run TypeScript compiler: `npm run build` or `tsc --noEmit`
   - [ ] Run linter: `npm run lint`
   - [ ] Start server and verify endpoint responds
   - [ ] Test contact form submission end-to-end
   - [ ] Verify reCAPTCHA validation works
   - [ ] Verify email webhook sends successfully
   - [ ] Check error cases (missing fields, invalid captcha)

9. Test coverage:
   - [ ] Add unit tests for utilities (pure functions)
   - [ ] Add unit tests for services (mock fetch)
   - [ ] Add integration test for controller
   - [ ] Ensure existing route tests still pass

---

## 5. Files to Create

| File Path | Responsibility | LOC (Est.) |
|-----------|---------------|------------|
| `controllers/websiteContact/websiteContactController.ts` | HTTP handling, orchestration | ~40 |
| `controllers/websiteContact/websiteContact-services/recaptchaService.ts` | reCAPTCHA verification | ~30 |
| `controllers/websiteContact/websiteContact-services/emailWebhookService.ts` | n8n webhook dispatch | ~35 |
| `controllers/websiteContact/websiteContact-utils/sanitization.ts` | HTML sanitization | ~10 |
| `controllers/websiteContact/websiteContact-utils/hostnameExtractor.ts` | Header parsing | ~15 |
| `controllers/websiteContact/websiteContact-utils/emailTemplateBuilder.ts` | HTML email generation | ~40 |

**Total new LOC:** ~170 (includes type definitions, JSDoc comments, improved error handling)

---

## 6. Files to Modify

### `routes/websiteContact.ts`
**Before:** 156 LOC
**After:** ~20 LOC

**Changes:**
- Remove helper functions (lines 13-56)
- Remove route handler (lines 62-154)
- Import controller function
- Define route with controller

**Remaining content:**
- File header JSDoc comment
- Import statements
- Router setup
- Single route definition
- Export statement

---

## 7. Risk Assessment

### Low Risk
- **Pure utilities**: `sanitization`, `hostnameExtractor`, `emailTemplateBuilder` are pure functions with no side effects. Easy to test and verify.
- **No DB changes**: This route has no database interactions.
- **No auth changes**: Route remains public.

### Medium Risk
- **Service extraction**: reCAPTCHA and webhook services involve external API calls. Must ensure error handling is preserved.
- **Environment variable access**: Services now access `process.env` internally. Verify all variables are available in all environments (dev, staging, prod).
- **Import path changes**: Must update any other files that import from this route (unlikely, but check).

### Potential Issues

#### 1. Missing Environment Variables
**Symptom:** Service throws error about missing config
**Mitigation:**
- Add explicit checks at service initialization
- Log warnings if optional variables are missing
- Fail fast if required variables are missing

#### 2. Import Path Errors
**Symptom:** TypeScript compilation fails
**Mitigation:**
- Use absolute imports or tsconfig path aliases if available
- Verify all imports resolve before committing
- Run `tsc --noEmit` before testing

#### 3. Error Response Format Changes
**Symptom:** Services throw errors that aren't properly caught
**Mitigation:**
- Ensure controller wraps all service calls in try/catch
- Maintain consistent error response format
- Test error cases explicitly

#### 4. Lost Context in Logging
**Symptom:** Logs don't include request context
**Mitigation:**
- Pass request ID or context through service calls if needed
- Maintain `[Website Contact]` log prefix in services

#### 5. Breaking Changes for Consumers
**Symptom:** Frontend receives different error responses
**Mitigation:**
- Preserve exact HTTP status codes (400, 500, 502)
- Preserve exact error message format: `{ error: string }`
- Test all error paths

### Testing Strategy

**Before refactor:**
1. Document current behavior (manual test or integration test)
2. Capture error cases:
   - Missing required fields
   - Invalid reCAPTCHA token
   - Webhook failure
   - Missing environment variables

**After refactor:**
1. Unit test each utility function
2. Unit test each service (mock fetch)
3. Integration test controller (mock services)
4. End-to-end test full flow
5. Compare behavior with documented pre-refactor behavior

### Rollback Plan

**If issues are detected in production:**

1. **Immediate rollback**: Revert the refactor commit
2. **Quick fix**: Route file is self-contained in current state
3. **No schema changes**: No migrations to reverse
4. **No config changes**: Environment variables unchanged

**Rollback is low-risk** because:
- No database changes
- No external API contract changes
- No authentication/authorization changes
- Route behavior remains identical

---

## 8. Definition of Done

- [ ] All 6 new files created with proper TypeScript types
- [ ] Route file reduced to ~20 LOC
- [ ] All imports resolve correctly
- [ ] TypeScript compiles without errors
- [ ] Linter passes
- [ ] Unit tests written for utilities
- [ ] Unit tests written for services
- [ ] Integration test passes for controller
- [ ] Manual testing confirms:
  - Successful contact form submission
  - reCAPTCHA validation works
  - Email webhook delivers
  - Error cases handled correctly (400, 500, 502)
- [ ] No console errors in server logs
- [ ] Code review completed
- [ ] Documentation updated (if README or API docs exist)

---

## 9. Architectural Benefits

### Maintainability
- Single Responsibility Principle: Each file has one clear purpose
- Easier to locate specific logic (email template, captcha, etc.)
- Reduced cognitive load when reading route file

### Testability
- Pure utilities are trivial to test (no mocks needed)
- Services can be unit tested with fetch mocks
- Controller can be tested with service mocks
- Existing integration tests remain valid

### Reusability
- Utilities can be reused by other routes
- Services can be shared across controllers
- Email template builder can be extended for other email types

### Consistency
- Establishes pattern for future route refactors
- Clear separation of concerns
- Predictable file structure

### Observability
- Service-level logging easier to implement
- Error boundaries clearer
- Performance monitoring can target specific services

---

## 10. Future Improvements (Out of Scope)

These are **not** part of this refactor but may be considered later:

- [ ] Add request validation library (e.g., zod, joi)
- [ ] Replace inline HTML template with template engine (e.g., handlebars)
- [ ] Add rate limiting middleware
- [ ] Add request ID tracking for distributed tracing
- [ ] Replace `console.error` with structured logging library
- [ ] Add metrics/monitoring for webhook success rate
- [ ] Add retry logic for webhook failures
- [ ] Cache reCAPTCHA verification results (with TTL)
- [ ] Add email queue instead of synchronous webhook call
- [ ] Add webhook signature verification for security

---

## Approval Required

This plan requires explicit approval before execution.

**Review checklist for approver:**
- [ ] Target architecture aligns with project standards
- [ ] Risk assessment is accurate
- [ ] Testing strategy is sufficient
- [ ] Rollback plan is acceptable
- [ ] Scope is clear (no hidden work)
