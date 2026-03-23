# Support Route Refactor Plan

## Current State

### Overview
- **File**: `/signalsai-backend/src/routes/support.ts`
- **LOC**: 128 lines
- **Endpoints**: 2
  - `POST /api/support/inquiry` - Submit support inquiry (forwards to admin via email)
  - `GET /api/support/health` - Health check endpoint

### Current Dependencies
- `express` - Router and types (Request, Response)
- `../utils/notificationHelper` - `forwardUserInquiry()` function

### Current Responsibilities
The route file currently handles:
1. Route definition
2. Request validation (5 fields: userName, userEmail, practiceName, subject, message)
3. Email format validation (regex)
4. Business logic (trimming, formatting)
5. Service orchestration (calling notificationHelper)
6. Error handling and response formatting
7. Console logging

### No Database Calls
This route has **zero direct database calls**. It's purely a pass-through that:
- Validates input
- Forwards to notification helper
- Returns response

---

## Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── support.ts                    # Route definitions only
├── controllers/
│   └── support/
│       ├── supportController.ts      # Main controller entry point
│       ├── support-services/
│       │   └── inquiryService.ts     # Business logic for inquiry handling
│       └── support-utils/
│           └── validationUtils.ts    # Input validation utilities
```

---

## Mapping

### Route File (`routes/support.ts`)
**Keeps**:
- Route definitions
- Router setup and export

**Removes**:
- All validation logic
- All business logic
- All service calls
- All error handling beyond basic Express error propagation
- All console logging

**After refactor**:
- Lines 25-114 → controller call: `supportController.handleInquiry`
- Lines 120-126 → controller call: `supportController.healthCheck`

---

### Controller (`controllers/support/supportController.ts`)
**Responsibilities**:
- Request/response orchestration
- Call validation utils
- Call inquiry service
- Format responses
- Handle errors at controller level
- Return appropriate HTTP status codes

**Receives**:
- Lines 27-83 (validation + data extraction + trimming)
- Lines 85-102 (error handling + response formatting)
- Lines 103-113 (error handling)
- Lines 120-126 (health check)

---

### Inquiry Service (`controllers/support/support-services/inquiryService.ts`)
**Responsibilities**:
- Business logic for processing support inquiries
- Orchestrate notification helper calls
- Log business events (not HTTP events)
- Return structured results

**Receives**:
- Lines 77-83 (service call to forwardUserInquiry)
- Lines 72-74 (business logging)
- Lines 95 (success logging)

---

### Validation Utils (`controllers/support/support-utils/validationUtils.ts`)
**Responsibilities**:
- Input validation rules
- Email format validation
- Field presence and type checks
- Return structured validation results

**Receives**:
- Lines 30-70 (all validation logic)
- Lines 47-48 (email regex)

---

## Model Replacements

**No model replacements required**.

This route does not interact with the database directly. It only:
1. Validates user input
2. Calls `forwardUserInquiry()` from notificationHelper
3. Returns response

The `notificationHelper.forwardUserInquiry()` function remains as-is. It's a utility for sending emails, not a database operation.

---

## Files to Create

### 1. `/signalsai-backend/src/controllers/support/supportController.ts`
**Purpose**: Main controller entry point

**Exports**:
- `handleInquiry(req: Request, res: Response): Promise<Response>`
- `healthCheck(req: Request, res: Response): Response`

**Dependencies**:
- `./support-utils/validationUtils`
- `./support-services/inquiryService`
- Express types

**Logic Flow**:
```
handleInquiry:
1. Extract body fields
2. Call validation utils
3. If validation fails → return 400 with error
4. Call inquiry service with validated data
5. If service fails → return 500 with error
6. Return 200 with success message

healthCheck:
1. Return 200 with health status
```

---

### 2. `/signalsai-backend/src/controllers/support/support-services/inquiryService.ts`
**Purpose**: Business logic for inquiry processing

**Exports**:
- `processInquiry(data: InquiryData): Promise<ServiceResult>`

**Types**:
```typescript
interface InquiryData {
  userName: string;
  userEmail: string;
  practiceName?: string;
  subject: string;
  message: string;
}

interface ServiceResult {
  success: boolean;
  error?: string;
  messageId?: string;
}
```

**Dependencies**:
- `../../../utils/notificationHelper`

**Logic Flow**:
```
processInquiry:
1. Log inquiry received (business event)
2. Call forwardUserInquiry with trimmed data
3. If email fails → log error, return failure result
4. Log success
5. Return success result with messageId
```

---

### 3. `/signalsai-backend/src/controllers/support/support-utils/validationUtils.ts`
**Purpose**: Input validation utilities

**Exports**:
- `validateInquiryInput(body: any): ValidationResult`

**Types**:
```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  message?: string;
  data?: {
    userName: string;
    userEmail: string;
    practiceName?: string;
    subject: string;
    message: string;
  };
}
```

**Logic Flow**:
```
validateInquiryInput:
1. Check userName presence, type, non-empty
2. Check userEmail presence, type, non-empty
3. Check userEmail format (regex)
4. Check subject presence, type, non-empty
5. Check message presence, type, non-empty
6. If any fail → return { valid: false, error, errorCode, message }
7. If all pass → return { valid: true, data: trimmedFields }
```

---

## Files to Modify

### 1. `/signalsai-backend/src/routes/support.ts`
**Changes**:
- Import controller instead of notificationHelper
- Replace lines 25-114 with controller call
- Replace lines 120-126 with controller call
- Remove all inline logic

**After refactor (~20 LOC)**:
```typescript
/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 * - GET /api/support/health - Health check endpoint
 */

import express from "express";
import * as supportController from "../controllers/support/supportController";

const router = express.Router();

/**
 * POST /api/support/inquiry
 * Submit a support request / inquiry
 * This forwards the message to admin team via email
 */
router.post("/inquiry", supportController.handleInquiry);

/**
 * GET /api/support/health
 * Health check endpoint
 */
router.get("/health", supportController.healthCheck);

export default router;
```

---

## Step-by-Step Migration

### Step 1: Create Controller Folder Structure
```bash
mkdir -p signalsai-backend/src/controllers/support/support-services
mkdir -p signalsai-backend/src/controllers/support/support-utils
```

### Step 2: Create Validation Utils
**File**: `controllers/support/support-utils/validationUtils.ts`

Extract:
- Lines 30-70 (all validation blocks)
- Line 47-48 (email regex constant)

Package into `validateInquiryInput()` function.

Return structured validation result with:
- `valid: boolean`
- `error?: string` (error code)
- `message?: string` (user-facing message)
- `data?: ValidatedInquiryData` (trimmed and validated fields)

### Step 3: Create Inquiry Service
**File**: `controllers/support/support-services/inquiryService.ts`

Extract:
- Lines 72-74 (log inquiry received)
- Lines 77-83 (call forwardUserInquiry)
- Lines 86 (log error)
- Lines 95 (log success)

Create `processInquiry()` function that:
- Accepts validated InquiryData
- Calls notificationHelper.forwardUserInquiry
- Logs business events
- Returns ServiceResult

### Step 4: Create Controller
**File**: `controllers/support/supportController.ts`

Extract:
- Lines 27 (extract body)
- Lines 85-92 (email failure response)
- Lines 97-102 (success response)
- Lines 103-113 (error handling)
- Lines 120-126 (health check)

Create two exported functions:
1. `handleInquiry(req, res)`:
   - Extract body
   - Call validationUtils.validateInquiryInput
   - If invalid → return 400 with validation error
   - Call inquiryService.processInquiry
   - If service fails → return 500 with email error
   - Return 200 with success
   - Wrap in try-catch for unexpected errors

2. `healthCheck(req, res)`:
   - Return health status object

### Step 5: Refactor Route File
**File**: `routes/support.ts`

Replace:
- Import statement: `notificationHelper` → `supportController`
- Line 25: `router.post("/inquiry", async (req, res) => { ... })` → `router.post("/inquiry", supportController.handleInquiry)`
- Line 120: `router.get("/health", (req, res) => { ... })` → `router.get("/health", supportController.healthCheck)`

Remove:
- All inline logic (lines 26-113)
- All inline logic (lines 121-125)

### Step 6: Test
Run existing tests (if any) or manually test:
- POST /api/support/inquiry with valid data → 200
- POST /api/support/inquiry with missing fields → 400
- POST /api/support/inquiry with invalid email → 400
- POST /api/support/inquiry when email fails → 500
- GET /api/support/health → 200

### Step 7: Verify Import Chain
Ensure no circular dependencies:
```
routes/support.ts
  → controllers/support/supportController.ts
    → controllers/support/support-utils/validationUtils.ts
    → controllers/support/support-services/inquiryService.ts
      → utils/notificationHelper.ts
```

---

## Risk Assessment

### Low Risk Factors
1. **No database operations** - Pure pass-through with validation
2. **Single dependency** - Only uses notificationHelper (unchanged)
3. **Simple logic** - No complex business rules or state management
4. **Already well-structured** - Clear separation of concerns within the file
5. **Small LOC** - Only 128 lines to refactor

### Medium Risk Factors
1. **Validation logic extraction** - Must preserve exact validation behavior
   - **Mitigation**: Copy validation logic verbatim, compare outputs
2. **Error response format** - Controller must return identical error shapes
   - **Mitigation**: Document error response schema, test all error paths
3. **Logging changes** - Moving logs may affect monitoring/debugging
   - **Mitigation**: Preserve all log messages with same context

### Potential Issues

#### 1. Validation Behavior Change
**Risk**: Extracted validation returns different errors or formats

**Impact**: Frontend may break if error codes/messages change

**Mitigation**:
- Copy validation logic exactly as-is
- Test all validation paths (missing fields, invalid email, etc.)
- Document expected error response format
- Run integration tests if available

#### 2. Error Handling Lost
**Risk**: Controller doesn't catch all error cases from service

**Impact**: Unhandled exceptions → 500 errors without proper response format

**Mitigation**:
- Wrap controller in try-catch
- Service should return structured results (never throw)
- Test failure scenarios (notification helper failure)

#### 3. Response Format Drift
**Risk**: Controller formats responses differently than current route

**Impact**: Frontend expects specific response shape

**Mitigation**:
- Document current response schemas:
  - Success: `{ success: true, message: string, messageId?: string }`
  - Validation error: `{ success: false, error: string, message: string }`
  - Server error: `{ success: false, error: string, message: string }`
- Test response shapes match exactly

#### 4. Logging Context Loss
**Risk**: Moving logs to service layer loses HTTP request context

**Impact**: Harder to trace errors from logs

**Mitigation**:
- Keep HTTP-level logging in controller (request received, response sent)
- Keep business-level logging in service (inquiry processed, email sent)
- Consider passing request ID through service calls

#### 5. Import Path Changes
**Risk**: Relative imports break after restructuring

**Impact**: Runtime errors on startup

**Mitigation**:
- Test server startup after refactor
- Use TypeScript to catch import errors at compile time
- Update tsconfig paths if needed

---

## Definition of Done

- [ ] `controllers/support/support-utils/validationUtils.ts` created with all validation logic
- [ ] `controllers/support/support-services/inquiryService.ts` created with inquiry processing logic
- [ ] `controllers/support/supportController.ts` created with orchestration logic
- [ ] `routes/support.ts` refactored to route definitions only
- [ ] All validation cases produce identical error responses
- [ ] All success cases produce identical success responses
- [ ] All error cases produce identical error responses
- [ ] No TypeScript compilation errors
- [ ] Server starts successfully
- [ ] POST /api/support/inquiry with valid data returns 200
- [ ] POST /api/support/inquiry with missing fields returns 400 with correct error codes
- [ ] POST /api/support/inquiry with invalid email returns 400 with correct error code
- [ ] POST /api/support/inquiry handles email sending failure gracefully (500)
- [ ] GET /api/support/health returns 200 with health status
- [ ] All console logs preserved (same messages, same context)
- [ ] No circular dependencies introduced
- [ ] Code passes linting (if linter exists)
- [ ] Existing tests pass (if tests exist)
- [ ] Manual smoke test of all endpoints successful

---

## Notes

### Why This Refactor is Low Risk
- No database interactions to migrate
- Single external dependency (notificationHelper) remains unchanged
- Simple validation and pass-through logic
- Well-defined boundaries already present in current code
- Small surface area (2 endpoints)

### Future Enhancements (Out of Scope)
- Add unit tests for validation utils
- Add unit tests for inquiry service
- Add integration tests for controller
- Consider rate limiting for inquiry endpoint
- Consider storing inquiries in database for audit trail
- Consider async queue for email sending (non-blocking)

---

## Estimated Effort
- **Step 2-4** (Create new files): 30 minutes
- **Step 5** (Refactor route): 10 minutes
- **Step 6-7** (Test and verify): 20 minutes
- **Total**: ~1 hour

Low complexity, high confidence refactor.
