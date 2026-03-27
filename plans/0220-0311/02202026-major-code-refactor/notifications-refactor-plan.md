# Notifications Route Refactor Plan

## 1. Current State Analysis

### File Overview
- **Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/notifications.ts`
- **LOC**: 386 lines
- **Endpoints**: 9 total
  - 4 client endpoints (domain-filtered)
  - 4 admin endpoints (unrestricted)
  - 1 health check endpoint

### Current Endpoints

#### Client Endpoints (Domain-Filtered)
1. **GET /** - Fetch latest 10 notifications for logged-in client
2. **PATCH /:id/read** - Mark a notification as read
3. **PATCH /mark-all-read** - Mark all notifications as read for a domain
4. **DELETE /delete-all** - Delete all notifications for a domain

#### Admin Endpoints (Unrestricted Access)
5. **POST /** - Create a notification (admin/system)
6. **DELETE /:id** - Delete a notification

#### Health Check
7. **GET /health** - Health check endpoint

### Current Dependencies
```typescript
import express, { Request, Response } from "express";
import { db } from "../database/connection";
import type { Notification, NotificationsResponse } from "../types/global";
```

### Inline Helpers (To Be Extracted)

#### 1. `getDomainFromAccountId(googleAccountId: number)` (Lines 14-26)
- **Purpose**: Get domain name from google account ID
- **Current Implementation**: Direct `db("google_accounts")` query
- **Replacement Available**: `GoogleAccountModel.getDomainFromAccountId()`
- **Status**: Duplicated across multiple route files (tasks.ts confirmed)

#### 2. `handleError(res, error, operation)` (Lines 31-39)
- **Purpose**: Standardized error response handler
- **Status**: Duplicated across 23 files
- **Pattern**: Logs error with context, returns 500 JSON response

### Database Queries Analysis

#### All Direct `db()` Calls to Replace:

1. **Line 18-20**: `db("google_accounts").where({ id }).first()`
   - **Replace with**: `GoogleAccountModel.getDomainFromAccountId()`

2. **Line 74-78**: `db("notifications").where({ domain_name }).orderBy("created_at", "desc").limit(10).select("*")`
   - **Replace with**: `NotificationModel.findByDomain(domain, 10)`

3. **Line 81-83**: `db("notifications").where({ domain_name, read: false }).count("* as count")`
   - **Replace with**: `NotificationModel.countUnread(domain)`

4. **Line 147-149**: `db("notifications").where({ id, domain_name }).first()`
   - **Replace with**: `NotificationModel.findByIdAndDomain(id, domain)`

5. **Line 161-165**: `db("notifications").where({ id }).update({ read: true, read_timestamp, updated_at })`
   - **Replace with**: `NotificationModel.markRead(id)`

6. **Line 204-210**: `db("notifications").where({ domain_name, read: false }).update({ read: true, read_timestamp, updated_at })`
   - **Replace with**: `NotificationModel.markAllRead(domain)`

7. **Line 250-252**: `db("notifications").where({ domain_name }).delete()`
   - **Replace with**: `NotificationModel.deleteAllByDomain(domain)`

8. **Line 287**: `db("google_accounts").where({ domain_name }).first()`
   - **Replace with**: `GoogleAccountModel.findByDomain(domain_name)`

9. **Line 310-312**: `db("notifications").insert(notificationData).returning("id")`
   - **Replace with**: `NotificationModel.create(notificationData)`

10. **Line 342-344**: `db("notifications").where({ id }).first()`
    - **Replace with**: `NotificationModel.findById(id)`

11. **Line 355**: `db("notifications").where({ id }).delete()`
    - **Replace with**: `NotificationModel.deleteById(id)`

### Data Transformation Logic
- **Metadata parsing** (Lines 87-95): Converts string JSON to object, normalizes boolean `read` field
- **Response formatting**: Structures data into `NotificationsResponse` shape

---

## 2. Target Architecture

### Folder Structure
```
src/
├── controllers/
│   └── notifications/
│       ├── NotificationsController.ts          [Main controller class]
│       ├── feature-services/
│       │   ├── NotificationService.ts          [Business logic layer]
│       │   └── index.ts                        [Barrel export]
│       └── feature-utils/
│           ├── notificationTransformers.ts     [Data transformation utilities]
│           ├── notificationValidators.ts       [Validation logic]
│           └── index.ts                        [Barrel export]
├── routes/
│   └── notifications.ts                         [Route definitions only]
└── models/
    ├── NotificationModel.ts                     [Existing - already complete]
    └── GoogleAccountModel.ts                    [Existing - already has getDomainFromAccountId]
```

### Controller Pattern
The `NotificationsController` will follow the established pattern:
- Static methods for each endpoint
- Thin controller layer calling service methods
- Standardized error handling
- Request validation delegation

### Service Layer Responsibilities
`NotificationService` handles:
- Domain resolution from google account ID
- Notification creation with account lookup
- Bulk operations (mark all read, delete all)
- Domain ownership verification
- Data transformation coordination

### Utilities Layer Responsibilities

**`notificationTransformers.ts`**:
- Parse metadata from string to JSON
- Normalize boolean `read` field
- Format NotificationsResponse

**`notificationValidators.ts`**:
- Validate notification ID
- Validate required fields
- Validate google account ID presence

---

## 3. Detailed Mapping

### Route Handlers → Controller Methods

| Current Route Handler | New Controller Method | Endpoint |
|----------------------|----------------------|----------|
| GET / handler (lines 50-108) | `NotificationsController.getNotifications` | GET / |
| PATCH /:id/read handler (lines 115-174) | `NotificationsController.markAsRead` | PATCH /:id/read |
| PATCH /mark-all-read handler (lines 181-220) | `NotificationsController.markAllAsRead` | PATCH /mark-all-read |
| DELETE /delete-all handler (lines 227-262) | `NotificationsController.deleteAll` | DELETE /delete-all |
| POST / handler (lines 273-323) | `NotificationsController.createNotification` | POST / |
| DELETE /:id handler (lines 329-364) | `NotificationsController.deleteNotification` | DELETE /:id |
| GET /health handler (lines 374-380) | `NotificationsController.healthCheck` | GET /health |

### Business Logic → Service Methods

| Logic Description | Service Method | Called From |
|------------------|----------------|-------------|
| Resolve domain from google account ID | `NotificationService.resolveDomainFromAccountId()` | Multiple controllers |
| Fetch notifications with unread count | `NotificationService.getNotificationsForDomain()` | `getNotifications` |
| Mark notification as read with domain verification | `NotificationService.markNotificationRead()` | `markAsRead` |
| Mark all notifications as read for domain | `NotificationService.markAllNotificationsRead()` | `markAllAsRead` |
| Delete all notifications for domain | `NotificationService.deleteAllNotificationsForDomain()` | `deleteAll` |
| Create notification with account lookup | `NotificationService.createNotificationForDomain()` | `createNotification` |
| Delete single notification (admin) | `NotificationService.deleteNotificationById()` | `deleteNotification` |

### Database Calls → Model Methods

| Current db() Call | Model Method | Location in Current File |
|-------------------|--------------|-------------------------|
| `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.getDomainFromAccountId(accountId)` | Line 18-20 (getDomainFromAccountId helper) |
| `db("notifications").where({ domain_name }).orderBy().limit().select("*")` | `NotificationModel.findByDomain(domain, 10)` | Lines 74-78 (GET / handler) |
| `db("notifications").where({ domain_name, read: false }).count()` | `NotificationModel.countUnread(domain)` | Lines 81-83 (GET / handler) |
| `db("notifications").where({ id, domain_name }).first()` | `NotificationModel.findByIdAndDomain(id, domain)` | Lines 147-149 (PATCH /:id/read) |
| `db("notifications").where({ id }).update()` | `NotificationModel.markRead(id)` | Lines 161-165 (PATCH /:id/read) |
| `db("notifications").where({ domain_name, read: false }).update()` | `NotificationModel.markAllRead(domain)` | Lines 204-210 (PATCH /mark-all-read) |
| `db("notifications").where({ domain_name }).delete()` | `NotificationModel.deleteAllByDomain(domain)` | Lines 250-252 (DELETE /delete-all) |
| `db("google_accounts").where({ domain_name }).first()` | `GoogleAccountModel.findByDomain(domain_name)` | Line 287 (POST / handler) |
| `db("notifications").insert().returning("id")` | `NotificationModel.create(data)` | Lines 310-312 (POST / handler) |
| `db("notifications").where({ id }).first()` | `NotificationModel.findById(id)` | Lines 342-344 (DELETE /:id) |
| `db("notifications").where({ id }).delete()` | `NotificationModel.deleteById(id)` | Line 355 (DELETE /:id) |

### Utility Functions → Extracted Utilities

| Current Function | New Utility | Location |
|-----------------|-------------|----------|
| Lines 87-95: metadata parsing + boolean normalization | `notificationTransformers.parseNotification()` | feature-utils/notificationTransformers.ts |
| Lines 87-95: notifications array mapping | `notificationTransformers.parseNotifications()` | feature-utils/notificationTransformers.ts |
| Lines 97-102: response formatting | `notificationTransformers.formatNotificationsResponse()` | feature-utils/notificationTransformers.ts |
| Lines 120-126: notification ID validation | `notificationValidators.validateNotificationId()` | feature-utils/notificationValidators.ts |
| Lines 52-61: google account ID validation | `notificationValidators.validateGoogleAccountId()` | feature-utils/notificationValidators.ts |
| Lines 278-284: notification creation validation | `notificationValidators.validateCreateNotificationRequest()` | feature-utils/notificationValidators.ts |
| Lines 31-39: handleError helper | **DEFER** to shared error handling refactor | N/A (will be centralized later) |

---

## 4. Step-by-Step Migration

### Step 1: Create Directory Structure
```bash
mkdir -p src/controllers/notifications/feature-services
mkdir -p src/controllers/notifications/feature-utils
```

### Step 2: Create Validation Utilities
**File**: `src/controllers/notifications/feature-utils/notificationValidators.ts`

**Functions to create**:
- `validateNotificationId(id: string): { valid: boolean; notificationId?: number; error?: string }`
- `validateGoogleAccountId(googleAccountId: any): { valid: boolean; error?: string }`
- `validateCreateNotificationRequest(body: any): { valid: boolean; errors?: string[] }`

**Extracted from**:
- Lines 117-134 (PATCH /:id/read validation)
- Lines 52-61 (GET / google account validation)
- Lines 128-134, 183-191 (google account ID body validation)
- Lines 278-284 (POST / field validation)

### Step 3: Create Transformation Utilities
**File**: `src/controllers/notifications/feature-utils/notificationTransformers.ts`

**Functions to create**:
```typescript
// Parse single notification (lines 87-95 logic)
parseNotification(notification: any): Notification

// Parse array of notifications
parseNotifications(notifications: any[]): Notification[]

// Format complete response (lines 97-102 logic)
formatNotificationsResponse(
  notifications: any[],
  unreadCount: number
): NotificationsResponse
```

**Extracted from**:
- Lines 87-95: metadata parsing, boolean normalization
- Lines 97-102: response structure formatting

### Step 4: Create Barrel Exports
**File**: `src/controllers/notifications/feature-utils/index.ts`
```typescript
export * from './notificationValidators';
export * from './notificationTransformers';
```

### Step 5: Create Service Layer
**File**: `src/controllers/notifications/feature-services/NotificationService.ts`

**Methods to create**:

1. **`resolveDomainFromAccountId(googleAccountId: number): Promise<{ domain: string | null; error?: string }>`**
   - Replaces inline helper (lines 14-26)
   - Calls: `GoogleAccountModel.getDomainFromAccountId()`

2. **`getNotificationsForDomain(domain: string, limit: number = 10): Promise<{ notifications: INotification[]; unreadCount: number }>`**
   - Replaces GET / core logic (lines 73-84)
   - Calls: `NotificationModel.findByDomain()`, `NotificationModel.countUnread()`

3. **`markNotificationRead(notificationId: number, domain: string): Promise<{ success: boolean; error?: string }>`**
   - Replaces PATCH /:id/read core logic (lines 146-165)
   - Calls: `NotificationModel.findByIdAndDomain()`, `NotificationModel.markRead()`
   - Domain ownership verification included

4. **`markAllNotificationsRead(domain: string): Promise<number>`**
   - Replaces PATCH /mark-all-read core logic (lines 204-210)
   - Calls: `NotificationModel.markAllRead()`

5. **`deleteAllNotificationsForDomain(domain: string): Promise<number>`**
   - Replaces DELETE /delete-all core logic (lines 250-252)
   - Calls: `NotificationModel.deleteAllByDomain()`

6. **`createNotificationForDomain(data: CreateNotificationRequest): Promise<{ success: boolean; notificationId?: number; error?: string }>`**
   - Replaces POST / core logic (lines 286-312)
   - Calls: `GoogleAccountModel.findByDomain()`, `NotificationModel.create()`
   - Handles account lookup and data preparation

7. **`deleteNotificationById(notificationId: number): Promise<{ success: boolean; error?: string }>`**
   - Replaces DELETE /:id core logic (lines 342-355)
   - Calls: `NotificationModel.findById()`, `NotificationModel.deleteById()`
   - Existence check included

**Extracted from**:
- Lines 14-26: getDomainFromAccountId helper
- Lines 63-84: GET / data fetching logic
- Lines 136-165: PATCH /:id/read domain verification + update
- Lines 194-210: PATCH /mark-all-read update logic
- Lines 239-252: DELETE /delete-all logic
- Lines 286-312: POST / account lookup + creation
- Lines 342-355: DELETE /:id existence check + deletion

### Step 6: Create Service Barrel Export
**File**: `src/controllers/notifications/feature-services/index.ts`
```typescript
export * from './NotificationService';
```

### Step 7: Create Controller
**File**: `src/controllers/notifications/NotificationsController.ts`

**Methods to create** (one per endpoint):

1. **`getNotifications(req: Request, res: Response): Promise<Response>`**
   - Validates google account ID
   - Resolves domain
   - Fetches notifications + unread count
   - Transforms and formats response
   - Calls: `NotificationService.resolveDomainFromAccountId()`, `NotificationService.getNotificationsForDomain()`, transformers

2. **`markAsRead(req: Request, res: Response): Promise<Response>`**
   - Validates notification ID
   - Validates google account ID
   - Resolves domain
   - Marks as read with domain verification
   - Calls: validators, `NotificationService.resolveDomainFromAccountId()`, `NotificationService.markNotificationRead()`

3. **`markAllAsRead(req: Request, res: Response): Promise<Response>`**
   - Validates google account ID
   - Resolves domain
   - Marks all as read
   - Calls: validators, `NotificationService.resolveDomainFromAccountId()`, `NotificationService.markAllNotificationsRead()`

4. **`deleteAll(req: Request, res: Response): Promise<Response>`**
   - Validates google account ID
   - Resolves domain
   - Deletes all for domain
   - Calls: validators, `NotificationService.resolveDomainFromAccountId()`, `NotificationService.deleteAllNotificationsForDomain()`

5. **`createNotification(req: Request, res: Response): Promise<Response>`**
   - Validates request body
   - Creates notification with account lookup
   - Calls: validators, `NotificationService.createNotificationForDomain()`

6. **`deleteNotification(req: Request, res: Response): Promise<Response>`**
   - Validates notification ID
   - Deletes notification
   - Calls: validators, `NotificationService.deleteNotificationById()`

7. **`healthCheck(_req: Request, res: Response): Response`**
   - Returns health status (synchronous)

**Pattern**:
- Each method is a thin wrapper
- Delegates validation to utilities
- Delegates business logic to service
- Handles HTTP-specific concerns (status codes, response formatting)
- Uses `handleError()` for error cases (keep inline for now)

### Step 8: Update Route File
**File**: `src/routes/notifications.ts`

**Transform to**:
```typescript
import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";

const router = express.Router();

// CLIENT ENDPOINTS (Domain-Filtered)
router.get("/", NotificationsController.getNotifications);
router.patch("/:id/read", NotificationsController.markAsRead);
router.patch("/mark-all-read", NotificationsController.markAllAsRead);
router.delete("/delete-all", NotificationsController.deleteAll);

// ADMIN ENDPOINTS (Unrestricted Access)
router.post("/", NotificationsController.createNotification);
router.delete("/:id", NotificationsController.deleteNotification);

// HEALTH CHECK
router.get("/health", NotificationsController.healthCheck);

export default router;
```

**Result**: ~20 lines (was 386 lines)

### Step 9: Remove Duplicated Helper
Since `getDomainFromAccountId()` is now replaced by:
- `GoogleAccountModel.getDomainFromAccountId()` (model layer)
- `NotificationService.resolveDomainFromAccountId()` (service wrapper with error handling)

**Action**: Remove from `tasks.ts` and any other route files (separate refactor)

### Step 10: Testing Verification
**Test each endpoint**:
1. GET / - with valid/invalid google account ID
2. PATCH /:id/read - with valid/invalid IDs, domain mismatch
3. PATCH /mark-all-read - with valid domain
4. DELETE /delete-all - with valid domain
5. POST / - with valid/invalid bodies, missing domain
6. DELETE /:id - with valid/invalid IDs, non-existent notifications
7. GET /health - basic health check

**Verify**:
- All model methods return correct data
- Transformers properly parse metadata and booleans
- Validators catch invalid inputs
- Error responses maintain same structure
- Status codes unchanged
- Response shapes unchanged

---

## 5. Model Method Replacements (Complete Mapping)

### Summary Table

| Line(s) | Current db() Call | Model Method Replacement | Notes |
|---------|-------------------|-------------------------|-------|
| 18-20 | `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.getDomainFromAccountId(accountId)` | Returns domain_name directly |
| 74-78 | `db("notifications").where({ domain_name }).orderBy("created_at", "desc").limit(10)` | `NotificationModel.findByDomain(domain, 10)` | Auto-deserializes JSON fields |
| 81-83 | `db("notifications").where({ domain_name, read: false }).count()` | `NotificationModel.countUnread(domain)` | Returns number |
| 147-149 | `db("notifications").where({ id, domain_name }).first()` | `NotificationModel.findByIdAndDomain(id, domain)` | Domain ownership check |
| 161-165 | `db("notifications").where({ id }).update({ read, timestamps })` | `NotificationModel.markRead(id)` | Sets timestamps automatically |
| 204-210 | `db("notifications").where({ domain_name, read: false }).update()` | `NotificationModel.markAllRead(domain)` | Sets timestamps automatically |
| 250-252 | `db("notifications").where({ domain_name }).delete()` | `NotificationModel.deleteAllByDomain(domain)` | Returns count deleted |
| 287 | `db("google_accounts").where({ domain_name }).first()` | `GoogleAccountModel.findByDomain(domain_name)` | Returns full account |
| 310-312 | `db("notifications").insert().returning("id")` | `NotificationModel.create(data)` | Returns ID, auto-serializes JSON |
| 342-344 | `db("notifications").where({ id }).first()` | `NotificationModel.findById(id)` | Auto-deserializes JSON fields |
| 355 | `db("notifications").where({ id }).delete()` | `NotificationModel.deleteById(id)` | Returns count deleted |

### Critical Benefits of Model Methods

1. **JSON Field Handling**: `metadata` automatically serialized/deserialized
2. **Type Safety**: Return types are `INotification`, `IGoogleAccount` (not `any`)
3. **Timestamp Management**: `created_at`, `updated_at`, `read_timestamp` set automatically
4. **Transaction Support**: All methods accept optional `trx` parameter for future use
5. **Consistent Error Handling**: Model methods throw consistent errors
6. **No Direct DB Access**: Removes `db()` import from route files

---

## 6. Files to Create

### 6.1 Controller File
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/NotificationsController.ts`

**Exports**:
- `NotificationsController` class with 7 static methods

**Dependencies**:
- Express types (Request, Response)
- NotificationService
- Validators
- Transformers
- Types (Notification, NotificationsResponse, CreateNotificationRequest)

**Responsibilities**:
- HTTP request/response handling
- Input validation delegation
- Service method orchestration
- Error response formatting (handleError inline)
- Status code management

**Size estimate**: ~300-350 lines (was 386 in route file)

---

### 6.2 Service File
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/feature-services/NotificationService.ts`

**Exports**:
- `NotificationService` class with 7 static methods

**Dependencies**:
- NotificationModel
- GoogleAccountModel
- Types (INotification, IGoogleAccount, CreateNotificationRequest)

**Responsibilities**:
- Domain resolution with error handling
- Notification CRUD operations
- Domain ownership verification
- Account lookup for creation
- Business rule enforcement

**Size estimate**: ~200-250 lines

---

### 6.3 Transformer Utilities
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/feature-utils/notificationTransformers.ts`

**Exports**:
- `parseNotification(notification: any): Notification`
- `parseNotifications(notifications: any[]): Notification[]`
- `formatNotificationsResponse(notifications: Notification[], unreadCount: number): NotificationsResponse`

**Dependencies**:
- Types (Notification, NotificationsResponse)

**Responsibilities**:
- Metadata string → JSON parsing
- Boolean normalization (`read` field: 1/true → true, 0/false → false)
- Response structure formatting

**Size estimate**: ~50-70 lines

---

### 6.4 Validator Utilities
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/feature-utils/notificationValidators.ts`

**Exports**:
- `validateNotificationId(id: string): { valid: boolean; notificationId?: number; error?: string }`
- `validateGoogleAccountId(googleAccountId: any): { valid: boolean; error?: string }`
- `validateCreateNotificationRequest(body: any): { valid: boolean; errors?: string[] }`

**Dependencies**:
- None (pure validation logic)

**Responsibilities**:
- Notification ID parsing and validation
- Google account ID presence validation
- Create request field validation (domain_name, title required)

**Size estimate**: ~40-60 lines

---

### 6.5 Barrel Exports

**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/feature-utils/index.ts`
```typescript
export * from './notificationValidators';
export * from './notificationTransformers';
```
**Size**: ~2 lines

**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/notifications/feature-services/index.ts`
```typescript
export * from './NotificationService';
```
**Size**: ~1 line

---

## 7. Files to Modify

### 7.1 Route File (Primary Target)
**Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/notifications.ts`

**Current**: 386 lines with inline handlers, helpers, db() calls

**Target**: ~20 lines with route definitions only

**Changes**:
- Remove all inline handlers (lines 50-380)
- Remove helper functions (lines 14-39)
- Remove db import
- Remove type imports (moved to controller)
- Keep express router setup
- Add controller import
- Map routes to controller methods

**Before/After Structure**:

**Before** (simplified):
```typescript
import express from "express";
import { db } from "../database/connection";
import type { Notification, NotificationsResponse } from "../types/global";

const router = express.Router();

// Helper functions
async function getDomainFromAccountId() { ... }
function handleError() { ... }

// 7 route handlers with inline logic
router.get("/", async (req, res) => { /* 58 lines */ });
router.patch("/:id/read", async (req, res) => { /* 60 lines */ });
// ... etc

export default router;
```

**After**:
```typescript
import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";

const router = express.Router();

router.get("/", NotificationsController.getNotifications);
router.patch("/:id/read", NotificationsController.markAsRead);
router.patch("/mark-all-read", NotificationsController.markAllAsRead);
router.delete("/delete-all", NotificationsController.deleteAll);
router.post("/", NotificationsController.createNotification);
router.delete("/:id", NotificationsController.deleteNotification);
router.get("/health", NotificationsController.healthCheck);

export default router;
```

**Result**: 95% line reduction, 100% maintainability improvement

---

### 7.2 Other Files with getDomainFromAccountId() Duplicate
**Action**: Separate refactor (not in this plan's scope)

**Known duplicates**:
- `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/tasks.ts`
- (Potentially 1-2 other route files)

**Replacement**: Use `GoogleAccountModel.getDomainFromAccountId()` or service wrapper

---

## 8. Risk Assessment

### 8.1 Technical Risks

#### Risk: Metadata Parsing Behavior Change
**Current**: Manual JSON.parse with typeof check (lines 90-93)
**New**: BaseModel auto-deserializes JSON fields via `jsonFields = ["metadata"]`

**Mitigation**:
- NotificationModel already configured with `jsonFields = ["metadata"]`
- BaseModel handles string→JSON conversion transparently
- Add explicit test: verify metadata returned as object, not string

**Likelihood**: Low
**Impact**: Low (caught in testing)

---

#### Risk: Boolean Normalization Inconsistency
**Current**: `read: n.read === 1 || n.read === true` (line 89)
**Reason**: SQLite returns integers (0/1), PostgreSQL returns booleans

**New**: Transformer handles normalization centrally

**Mitigation**:
- Explicitly test with SQLite (current DB)
- Keep normalization logic in transformer
- Document database-specific behavior

**Likelihood**: Low
**Impact**: Medium (UI might show incorrect read state)

---

#### Risk: Response Shape Changes
**Current**: Specific JSON structure expected by frontend

**Mitigation**:
- Preserve exact response structure in controller
- Use existing types (NotificationsResponse, Notification)
- Add integration tests comparing old/new responses

**Likelihood**: Very Low
**Impact**: High (breaks frontend)

---

#### Risk: Domain Ownership Bypass
**Current**: Domain verification prevents cross-domain access (lines 147-158)

**New**: Service layer enforces same checks

**Mitigation**:
- Service method `markNotificationRead()` includes `findByIdAndDomain()` check
- Test unauthorized access scenarios
- Verify 404 returned for domain mismatch

**Likelihood**: Very Low (explicit test coverage)
**Impact**: Critical (security issue)

---

#### Risk: Error Handling Degradation
**Current**: `handleError()` provides consistent error format

**New**: Keep inline in controller (for now)

**Mitigation**:
- Copy handleError() to controller temporarily
- Mark with TODO for shared error handling refactor
- Maintain exact same error response structure

**Likelihood**: Very Low
**Impact**: Low (logged, not user-facing)

---

### 8.2 Operational Risks

#### Risk: Regression in Production
**Mitigation**:
- Comprehensive endpoint testing before deploy
- Deploy during low-traffic window
- Monitor error rates post-deploy
- Keep rollback plan ready

**Likelihood**: Low (with testing)
**Impact**: Medium (user-facing endpoints)

---

#### Risk: Performance Degradation
**Current**: Direct db() calls
**New**: Model methods (same underlying queries)

**Analysis**:
- No additional query overhead
- Model methods use same Knex queries
- JSON deserialization now automatic (was manual)
- Potential micro-improvement: fewer manual transformations

**Mitigation**:
- Monitor endpoint response times
- Compare query execution times (should be identical)

**Likelihood**: Very Low
**Impact**: Low

---

### 8.3 Development Risks

#### Risk: Incomplete Migration
**Scenario**: Miss extracting a helper or db() call

**Mitigation**:
- Use mapping table (Section 3) as checklist
- Grep for `db("notifications")` and `db("google_accounts")` after refactor
- Verify no imports of `{ db }` remain in route file

**Likelihood**: Low (detailed plan)
**Impact**: High (breaks endpoint)

---

#### Risk: Import Path Confusion
**Scenario**: Incorrect relative imports between controller/service/utils

**Mitigation**:
- Use barrel exports (`feature-utils/index.ts`)
- Test imports during development
- TypeScript will catch missing exports

**Likelihood**: Low
**Impact**: Low (caught at compile time)

---

### 8.4 Architectural Risks

#### Risk: Service Layer Over-Abstraction
**Concern**: Service methods might be too thin or duplicative

**Assessment**:
- Service methods provide domain-specific error handling
- Centralize google account → domain resolution
- Enable reuse across multiple controllers (future)
- Balance: Not too thin, not too thick

**Mitigation**:
- Keep service methods focused on single responsibility
- Avoid service-to-service calls (initially)
- Re-evaluate if methods become one-liners

**Likelihood**: Low
**Impact**: Low (refactorable later)

---

#### Risk: Duplicate Validation Logic
**Current**: Inline validation in each handler
**New**: Extracted validators

**Concern**: Validators might diverge from actual usage

**Mitigation**:
- Keep validators simple and pure
- Single source of truth for validation rules
- Document expected input/output

**Likelihood**: Very Low
**Impact**: Low

---

### 8.5 Risk Summary

| Risk Category | Likelihood | Impact | Priority |
|--------------|-----------|--------|----------|
| Metadata parsing behavior | Low | Low | P3 - Test |
| Boolean normalization | Low | Medium | P2 - Test thoroughly |
| Response shape changes | Very Low | High | P1 - Integration tests |
| Domain ownership bypass | Very Low | Critical | P1 - Security tests |
| Error handling degradation | Very Low | Low | P3 - Verify format |
| Production regression | Low | Medium | P2 - Staged rollout |
| Performance degradation | Very Low | Low | P3 - Monitor |
| Incomplete migration | Low | High | P1 - Use checklist |
| Import path confusion | Low | Low | P3 - TypeScript checks |
| Service over-abstraction | Low | Low | P4 - Future review |

**Overall Risk Level**: **LOW**

**Critical Mitigations**:
1. Comprehensive endpoint testing (all 7 endpoints)
2. Security test: domain ownership verification
3. Integration test: response shape comparison
4. Checklist: verify all db() calls replaced
5. Monitor: error rates and response times post-deploy

---

## 9. Definition of Done

### Code Completion
- [ ] All 7 files created (controller, service, 2 utils, 2 barrel exports)
- [ ] Route file reduced to ~20 lines with route definitions only
- [ ] All 11 db() calls replaced with model methods
- [ ] All inline handlers moved to controller
- [ ] getDomainFromAccountId() helper replaced with model/service calls
- [ ] handleError() kept in controller (marked TODO for centralization)
- [ ] TypeScript compiles with no errors

### Testing
- [ ] GET / returns notifications with unread count (valid account ID)
- [ ] GET / returns 400 for missing google account ID
- [ ] GET / returns 404 for invalid account ID
- [ ] PATCH /:id/read marks notification as read
- [ ] PATCH /:id/read returns 404 for domain mismatch
- [ ] PATCH /:id/read returns 400 for invalid ID format
- [ ] PATCH /mark-all-read marks all unread for domain
- [ ] DELETE /delete-all deletes all for domain
- [ ] POST / creates notification with valid data
- [ ] POST / returns 400 for missing required fields
- [ ] POST / returns 404 for unknown domain
- [ ] DELETE /:id deletes existing notification
- [ ] DELETE /:id returns 404 for non-existent ID
- [ ] GET /health returns 200 with health status
- [ ] Metadata correctly parsed as JSON (not string)
- [ ] Boolean `read` field normalized correctly

### Verification
- [ ] No `db()` imports remain in route file
- [ ] All endpoints return same response structure as before
- [ ] All status codes unchanged
- [ ] Error messages maintain same format
- [ ] No new dependencies introduced
- [ ] Import paths resolve correctly

### Documentation
- [ ] Controller methods have JSDoc comments
- [ ] Service methods have JSDoc comments
- [ ] Validators have input/output documented
- [ ] Transformers have behavior documented
- [ ] handleError() marked with TODO comment for future centralization

### Deployment
- [ ] Code reviewed by team member
- [ ] All tests passing
- [ ] Deployed to staging environment
- [ ] Manual smoke test of all endpoints
- [ ] Error monitoring configured
- [ ] Rollback plan documented

---

## 10. Additional Notes

### Why This Refactor Matters

**Before**:
- 386-line route file mixing HTTP, business logic, validation, data access
- Duplicated helpers (getDomainFromAccountId across multiple files)
- Direct db() calls scattered throughout
- Difficult to test business logic in isolation
- High cognitive load to understand any single endpoint

**After**:
- 20-line route file (pure routing)
- Controller handles HTTP concerns (~300 lines, organized)
- Service handles business logic (~200 lines, reusable)
- Utilities handle transformations/validation (~100 lines, testable)
- Single source of truth: models for data access
- Clear separation of concerns
- Easy to add new endpoints (follow pattern)
- Testable layers (unit test service, integration test controller)

### Pattern Consistency

This refactor follows the established pattern used in other controllers:
- Thin route definitions
- Controller delegates to service
- Service uses models exclusively
- Utilities handle cross-cutting concerns
- No db() in controller/service layers

### Future Improvements (Out of Scope)

1. **Centralized Error Handling**: Replace inline `handleError()` with shared middleware
2. **Remove getDomainFromAccountId() from tasks.ts**: Apply same refactor pattern
3. **Shared Validation Utilities**: Extract common validators (e.g., ID validation)
4. **Service-Level Authorization**: Move domain ownership checks to middleware
5. **Response Type Normalization**: Standardize success/error response shapes
6. **Transaction Support**: Add optional `trx` parameter to service methods
7. **Logging Enhancement**: Structured logging instead of console.error
8. **Rate Limiting**: Add per-domain rate limits for creation endpoints

---

## 11. Execution Checklist

Use this during implementation:

### Phase 1: Setup
- [ ] Create directories: `controllers/notifications/`, `feature-services/`, `feature-utils/`
- [ ] Verify models exist: NotificationModel.ts, GoogleAccountModel.ts

### Phase 2: Utilities (Bottom-Up)
- [ ] Create notificationValidators.ts (3 functions)
- [ ] Create notificationTransformers.ts (3 functions)
- [ ] Create feature-utils/index.ts barrel export
- [ ] Test utilities in isolation

### Phase 3: Service Layer
- [ ] Create NotificationService.ts (7 methods)
- [ ] Create feature-services/index.ts barrel export
- [ ] Verify all model methods exist (11 calls)
- [ ] Test service methods in isolation

### Phase 4: Controller
- [ ] Create NotificationsController.ts (7 methods)
- [ ] Copy handleError() temporarily (mark TODO)
- [ ] Wire up service calls
- [ ] Wire up validators/transformers

### Phase 5: Route Update
- [ ] Backup current notifications.ts
- [ ] Rewrite to ~20 lines
- [ ] Import controller
- [ ] Map all 7 routes

### Phase 6: Verification
- [ ] Compile TypeScript
- [ ] Run endpoint tests (all 7)
- [ ] Grep for remaining db() calls in route file
- [ ] Verify response shapes match
- [ ] Check error handling

### Phase 7: Cleanup
- [ ] Remove backup file
- [ ] Add JSDoc comments
- [ ] Update any route documentation
- [ ] Mark handleError() TODO

---

## Conclusion

This refactor transforms a 386-line monolithic route file into a clean, maintainable architecture with clear separation of concerns. The migration is low-risk due to comprehensive model method availability, detailed mapping, and explicit testing requirements.

**Key Success Factors**:
1. All database operations already have model method equivalents
2. Clear mapping of every line of code to its new location
3. Preserves existing behavior and response structures
4. Follows established controller pattern
5. Enables future improvements (error handling, testing, reusability)

**Estimated Effort**:
- Implementation: 3-4 hours
- Testing: 1-2 hours
- Review: 30 minutes
- **Total**: ~5-6 hours

**Outcome**: A maintainable, testable, and extensible notification system that follows architectural best practices.
