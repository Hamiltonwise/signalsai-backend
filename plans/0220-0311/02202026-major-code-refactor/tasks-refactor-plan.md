# Tasks Route Refactor Plan

**Route:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/tasks.ts`
**Current LOC:** 871
**Endpoints:** 12
**Status:** Medium complexity route requiring structured refactor
**Date:** 2026-02-18

---

## 1. Current State Analysis

### 1.1 Route Metadata
- **Total Lines:** 871
- **Endpoints:** 12
- **Inline Helpers:** 3
- **Direct db() Calls:** 28
- **Dependencies:**
  - express (Request, Response)
  - db (direct database connection)
  - createNotification utility
  - 7 TypeScript type imports
- **External Services:**
  - Notification system (createNotification)
- **Authentication:** None (relies on googleAccountId in request)

### 1.2 Endpoints Inventory

#### Client Endpoints (Domain-Filtered, 2 endpoints)
1. **GET /** — Fetch tasks for logged-in client (grouped by category)
   - Lines: 78-136 (59 LOC)
   - Auth: googleAccountId required
   - Returns: GroupedActionItemsResponse
   - Logic: Domain lookup → approved tasks fetch → category grouping

2. **PATCH /:id/complete** — Mark USER task as complete
   - Lines: 143-222 (80 LOC)
   - Auth: googleAccountId required
   - Validation: ownership, category restriction (USER only)
   - Returns: Updated task

#### Admin Endpoints (Unrestricted, 9 endpoints)
3. **POST /** — Create new task
   - Lines: 233-304 (72 LOC)
   - Validation: domain_name, title, category required
   - Logic: Domain verification → task creation
   - Returns: Created task

4. **GET /admin/all** — Fetch all tasks with filtering
   - Lines: 311-434 (124 LOC)
   - Complex query building with 8+ filters
   - Pagination support (limit, offset)
   - Returns: ActionItemsResponse

5. **PATCH /:id** — Update task
   - Lines: 441-531 (91 LOC)
   - Conditional notification on USER task approval
   - Dynamic update object construction
   - Returns: Updated task

6. **PATCH /:id/category** — Update task category
   - Lines: 538-588 (51 LOC)
   - Category validation (ALLORO | USER)
   - Returns: Updated task

7. **DELETE /:id** — Archive task (soft delete)
   - Lines: 594-632 (39 LOC)
   - Soft delete via status update
   - Returns: Success message

8. **GET /clients** — Get list of onboarded clients
   - Lines: 638-658 (21 LOC)
   - Simple query with sorting
   - Returns: Client list

9. **POST /bulk/delete** — Bulk archive tasks
   - Lines: 665-695 (31 LOC)
   - Array validation
   - Returns: Count of archived tasks

10. **POST /bulk/approve** — Bulk approve/unapprove tasks
    - Lines: 702-797 (96 LOC)
    - Complex notification logic per domain
    - Domain grouping for notifications
    - Returns: Count of updated tasks

11. **POST /bulk/status** — Bulk update task status
    - Lines: 804-849 (46 LOC)
    - Status validation
    - Conditional completed_at timestamp
    - Returns: Count of updated tasks

#### Utility Endpoint (1 endpoint)
12. **GET /health** — Health check
    - Lines: 859-865 (7 LOC)
    - Simple status response

### 1.3 Inline Helpers

1. **getDomainFromAccountId(googleAccountId: number)** — Lines 24-36
   - Duplicated across 23 files
   - **Replacement:** `GoogleAccountModel.getDomainFromAccountId()`
   - Usage: 2 locations (lines 92, 165)

2. **validateTaskOwnership(taskId: number, domain: string)** — Lines 41-54
   - Single-use helper
   - **Replacement:** Move to TaskModel as `validateOwnership()`

3. **handleError(res: Response, error: any, operation: string)** — Lines 59-67
   - Duplicated across 23 files
   - **Replacement:** Centralized error handling middleware (planned)
   - Usage: 12 locations

### 1.4 Database Operations Mapping

| Line(s) | Operation | Replacement Model Method |
|---------|-----------|--------------------------|
| 28-30 | `db("google_accounts").where({ id }).first()` | `GoogleAccountModel.getDomainFromAccountId()` |
| 46-48 | `db("tasks").where({ id, domain_name }).first()` | `TaskModel.validateOwnership()` |
| 104-111 | `db("tasks").where({ domain_name, is_approved: true }).whereNot("status", "archived")` | `TaskModel.findByDomain()` |
| 175 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 204-208 | `db("tasks").where({ id }).update({ status, completed_at, updated_at })` | `TaskModel.markComplete()` |
| 210 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 264 | `db("google_accounts").where({ domain_name }).first()` | `GoogleAccountModel.findByDomain()` |
| 290-291 | `db("tasks").insert(taskData).returning("id")` | `TaskModel.create()` |
| 292 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 328-372 | Complex count query with filters | `TaskModel.countWithFilters()` |
| 375-418 | Complex data query with filters + pagination | `TaskModel.findAllWithFilters()` |
| 455 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 496 | `db("tasks").where({ id }).update(updateData)` | `TaskModel.update()` |
| 498 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 560 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 571-574 | `db("tasks").where({ id }).update({ category, updated_at })` | `TaskModel.updateCategory()` |
| 576 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 607 | `db("tasks").where({ id }).first()` | `TaskModel.findById()` |
| 618-621 | `db("tasks").where({ id }).update({ status: "archived", updated_at })` | `TaskModel.archive()` |
| 643-646 | `db("google_accounts").where("onboarding_completed", true)` | `GoogleAccountModel.findOnboarded()` |
| 680-683 | `db("tasks").whereIn("id", taskIds).update({ status: "archived" })` | `TaskModel.bulkArchive()` |
| 731-735 | `db("tasks").whereIn("id", taskIds).where(...)` | `TaskModel.findUserTasksForApproval()` |
| 752-755 | `db("tasks").whereIn("id", taskIds).update({ is_approved })` | `TaskModel.bulkUpdateApproval()` |
| 837 | `db("tasks").whereIn("id", taskIds).update(updateData)` | `TaskModel.bulkUpdateStatus()` |

**Total db() calls:** 28

---

## 2. Target Architecture

### 2.1 Folder Structure

```
src/
├── routes/
│   └── tasks.ts (stripped to route definitions only, ~150 LOC target)
│
├── controllers/
│   └── tasks/
│       ├── TasksController.ts (main controller, ~400 LOC)
│       ├── feature-services/
│       │   ├── TaskApprovalService.ts (approval + notification logic)
│       │   ├── TaskBulkOperationsService.ts (bulk archive/approve/status)
│       │   └── TaskFilteringService.ts (admin query building)
│       └── feature-utils/
│           ├── taskValidation.ts (validation helpers)
│           └── taskResponseFormatters.ts (response formatting)
│
├── models/
│   ├── TaskModel.ts (all task DB operations)
│   └── GoogleAccountModel.ts (existing, already has getDomainFromAccountId)
│
└── utils/
    └── notificationHelper.ts (existing, no changes)
```

### 2.2 Responsibility Allocation

#### TasksController.ts
- Route handler coordination
- Request validation
- Response formatting
- Calling services/models
- Error handling delegation

#### TaskApprovalService.ts
- Task approval logic
- USER task notification triggering
- Bulk approval with domain grouping
- Notification message generation

#### TaskBulkOperationsService.ts
- Bulk archive orchestration
- Bulk status update orchestration
- Bulk approval orchestration (calls TaskApprovalService)
- Result aggregation

#### TaskFilteringService.ts
- Admin filter query building
- Pagination logic
- Count + data query coordination
- Filter validation

#### taskValidation.ts
- Category validation (ALLORO | USER)
- Status validation (pending | in_progress | complete | archived)
- Task ID validation
- Required field validation
- Array validation for bulk operations

#### taskResponseFormatters.ts
- GroupedActionItemsResponse formatting
- ActionItemsResponse formatting
- Success/error response standardization

#### TaskModel.ts
- All direct database operations
- CRUD methods
- Bulk operations
- Query builders
- Domain filtering
- Ownership validation

---

## 3. Endpoint to Controller Mapping

| Endpoint | HTTP Method | Current Lines | Controller Method | Services/Utils Used |
|----------|-------------|---------------|-------------------|---------------------|
| `/` | GET | 78-136 | `TasksController.getTasksForClient()` | `TaskModel.findByDomain()`, `taskResponseFormatters.formatGroupedTasks()` |
| `/:id/complete` | PATCH | 143-222 | `TasksController.completeTask()` | `TaskModel.findById()`, `TaskModel.validateOwnership()`, `TaskModel.markComplete()`, `GoogleAccountModel.getDomainFromAccountId()`, `taskValidation.validateTaskId()` |
| `/` | POST | 233-304 | `TasksController.createTask()` | `TaskModel.create()`, `GoogleAccountModel.findByDomain()`, `taskValidation.validateCreateRequest()` |
| `/admin/all` | GET | 311-434 | `TasksController.getAdminTasks()` | `TaskFilteringService.buildAdminQuery()`, `taskResponseFormatters.formatTasksResponse()` |
| `/:id` | PATCH | 441-531 | `TasksController.updateTask()` | `TaskModel.findById()`, `TaskModel.update()`, `TaskApprovalService.handleApprovalNotification()`, `taskValidation.validateUpdateRequest()` |
| `/:id/category` | PATCH | 538-588 | `TasksController.updateCategory()` | `TaskModel.findById()`, `TaskModel.updateCategory()`, `taskValidation.validateCategory()` |
| `/:id` | DELETE | 594-632 | `TasksController.archiveTask()` | `TaskModel.findById()`, `TaskModel.archive()`, `taskValidation.validateTaskId()` |
| `/clients` | GET | 638-658 | `TasksController.getClients()` | `GoogleAccountModel.findOnboarded()` |
| `/bulk/delete` | POST | 665-695 | `TasksController.bulkArchive()` | `TaskBulkOperationsService.archiveTasks()`, `taskValidation.validateBulkTaskIds()` |
| `/bulk/approve` | POST | 702-797 | `TasksController.bulkApprove()` | `TaskBulkOperationsService.approveTasks()`, `TaskApprovalService.createBulkNotifications()`, `taskValidation.validateBulkApproval()` |
| `/bulk/status` | POST | 804-849 | `TasksController.bulkUpdateStatus()` | `TaskBulkOperationsService.updateStatus()`, `taskValidation.validateBulkStatus()` |
| `/health` | GET | 859-865 | `TasksController.healthCheck()` | None (trivial) |

---

## 4. Model Methods to Implement

### 4.1 TaskModel.ts

All methods follow async/await pattern and return typed results.

#### Read Operations
1. **`findById(id: number): Promise<ActionItem | null>`**
   - Replaces: Lines 175, 210, 292, 455, 498, 560, 576, 607
   - Query: `db("tasks").where({ id }).first()`

2. **`findByDomain(domainName: string, options?: { excludeArchived?: boolean, approvedOnly?: boolean }): Promise<ActionItem[]>`**
   - Replaces: Lines 104-111
   - Query: Domain filter + optional approved/archived filters + ordering
   - Default: `excludeArchived: true, approvedOnly: false`

3. **`findAllWithFilters(filters: TaskFilterOptions, pagination: { limit: number, offset: number }): Promise<ActionItem[]>`**
   - Replaces: Lines 375-418
   - Query: Dynamic filter building + pagination + ordering
   - Filters: domain_name, status, category, agent_type, is_approved, date_from, date_to

4. **`countWithFilters(filters: TaskFilterOptions): Promise<number>`**
   - Replaces: Lines 328-372
   - Query: Same filter logic as findAllWithFilters, returns count
   - Used alongside findAllWithFilters for paginated admin view

5. **`validateOwnership(taskId: number, domainName: string): Promise<boolean>`**
   - Replaces: Lines 46-48
   - Query: `db("tasks").where({ id, domain_name }).first()`
   - Returns: Boolean indicating ownership

6. **`findUserTasksForApproval(taskIds: number[]): Promise<Array<{ domain_name: string }>>`**
   - Replaces: Lines 731-735
   - Query: `db("tasks").whereIn("id", taskIds).where("is_approved", false).where("category", "USER")`
   - Used for bulk approval notification logic

#### Write Operations
7. **`create(taskData: CreateTaskData): Promise<ActionItem>`**
   - Replaces: Lines 290-292
   - Query: Insert + return created record
   - Handles: Timestamps, default status, metadata serialization

8. **`update(id: number, updates: UpdateTaskData): Promise<ActionItem>`**
   - Replaces: Lines 496, 498
   - Query: Update + return updated record
   - Handles: Dynamic update object, completed_at logic, metadata serialization

9. **`updateCategory(id: number, category: ActionItemCategory): Promise<ActionItem>`**
   - Replaces: Lines 571-576
   - Query: Category update + return updated record

10. **`markComplete(id: number): Promise<ActionItem>`**
    - Replaces: Lines 204-210
    - Query: Set status="complete", completed_at=now, updated_at=now
    - Returns: Updated task

11. **`archive(id: number): Promise<void>`**
    - Replaces: Lines 618-621
    - Query: Set status="archived", updated_at=now

#### Bulk Operations
12. **`bulkArchive(taskIds: number[]): Promise<number>`**
    - Replaces: Lines 680-683
    - Query: `db("tasks").whereIn("id", taskIds).update({ status: "archived", updated_at })`
    - Returns: Count of updated records

13. **`bulkUpdateApproval(taskIds: number[], isApproved: boolean): Promise<number>`**
    - Replaces: Lines 752-755
    - Query: `db("tasks").whereIn("id", taskIds).update({ is_approved, updated_at })`
    - Returns: Count of updated records

14. **`bulkUpdateStatus(taskIds: number[], status: ActionItemStatus, completedAt?: Date): Promise<number>`**
    - Replaces: Line 837
    - Query: `db("tasks").whereIn("id", taskIds).update({ status, updated_at, completed_at? })`
    - Returns: Count of updated records

### 4.2 GoogleAccountModel.ts (Existing Methods to Use)

1. **`getDomainFromAccountId(googleAccountId: number): Promise<string | null>`**
   - Already exists
   - Replaces: Lines 28-30 (inline helper)

2. **`findByDomain(domainName: string): Promise<GoogleAccount | null>`**
   - Replaces: Line 264
   - Query: `db("google_accounts").where({ domain_name }).first()`

3. **`findOnboarded(): Promise<Array<{ id: number, domain_name: string, email: string }>>`**
   - Replaces: Lines 643-646
   - Query: `db("google_accounts").where("onboarding_completed", true).select(...).orderBy(...)`

---

## 5. Step-by-Step Migration Plan

### Phase 1: Model Layer (Foundation)
**Goal:** Create TaskModel with all database operations extracted.

1. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/TaskModel.ts`**
   - Implement all 14 methods listed in section 4.1
   - Add proper TypeScript types
   - Include JSDoc comments for each method
   - Add error handling with proper logging
   - **Estimated LOC:** ~500

2. **Verify GoogleAccountModel.ts has required methods**
   - Confirm `getDomainFromAccountId()` exists
   - Add `findByDomain()` if missing
   - Add `findOnboarded()` if missing
   - **Estimated LOC added:** ~30 (if methods missing)

3. **Test model methods in isolation**
   - Write unit tests for TaskModel methods
   - Test edge cases (null returns, empty arrays, etc.)

### Phase 2: Service Layer (Business Logic)
**Goal:** Extract complex orchestration logic.

4. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskApprovalService.ts`**
   - Method: `handleApprovalNotification(task: ActionItem, wasApproved: boolean): Promise<void>`
     - Checks if USER task was approved (line 500-519 logic)
     - Calls createNotification()
     - Error handling for notification failures
   - Method: `createBulkNotifications(userTasksByDomain: Array<{ domain_name: string, count: number }>): Promise<void>`
     - Groups and sends notifications per domain (lines 760-785 logic)
     - Handles plural/singular messaging
   - **Estimated LOC:** ~120

5. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskBulkOperationsService.ts`**
   - Method: `archiveTasks(taskIds: number[]): Promise<{ count: number }>`
     - Validates array
     - Calls TaskModel.bulkArchive()
   - Method: `approveTasks(taskIds: number[], isApproved: boolean): Promise<{ count: number }>`
     - Finds USER tasks for notification (if approving)
     - Calls TaskModel.bulkUpdateApproval()
     - Calls TaskApprovalService.createBulkNotifications()
   - Method: `updateStatus(taskIds: number[], status: ActionItemStatus): Promise<{ count: number }>`
     - Validates status
     - Determines completed_at logic
     - Calls TaskModel.bulkUpdateStatus()
   - **Estimated LOC:** ~150

6. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskFilteringService.ts`**
   - Method: `buildAdminQuery(filters: any): Promise<{ tasks: ActionItem[], total: number }>`
     - Coordinates countWithFilters() and findAllWithFilters()
     - Handles pagination
     - Filter parsing and validation
   - **Estimated LOC:** ~100

### Phase 3: Utility Layer (Validation & Formatting)
**Goal:** Extract reusable validation and formatting logic.

7. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-utils/taskValidation.ts`**
   - `validateTaskId(id: any): { valid: boolean, error?: string }`
   - `validateCategory(category: any): { valid: boolean, error?: string }`
   - `validateStatus(status: any): { valid: boolean, error?: string }`
   - `validateCreateRequest(body: any): { valid: boolean, errors?: string[] }`
   - `validateUpdateRequest(body: any): { valid: boolean, errors?: string[] }`
   - `validateBulkTaskIds(taskIds: any): { valid: boolean, error?: string }`
   - `validateBulkApproval(body: any): { valid: boolean, errors?: string[] }`
   - `validateBulkStatus(body: any): { valid: boolean, errors?: string[] }`
   - **Estimated LOC:** ~150

8. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-utils/taskResponseFormatters.ts`**
   - `formatGroupedTasks(tasks: ActionItem[]): GroupedActionItemsResponse`
     - Groups by category (ALLORO, USER)
     - Returns structured response (lines 114-126 logic)
   - `formatTasksResponse(tasks: ActionItem[], total: number): ActionItemsResponse`
     - Standard admin response format
   - `formatSuccessResponse(message: string, data?: any): any`
   - `formatErrorResponse(error: string, message: string): any`
   - **Estimated LOC:** ~80

### Phase 4: Controller Layer (Coordination)
**Goal:** Create controller with thin handlers that delegate to services/models.

9. **Create `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/TasksController.ts`**
   - Implement 12 controller methods (mapped in section 3)
   - Each method:
     - Extracts request data
     - Calls validation utils
     - Calls services/models
     - Formats response
     - Handles errors
   - **Estimated LOC:** ~400

### Phase 5: Route Refactor
**Goal:** Strip route file to definitions only, wire up controller.

10. **Modify `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/tasks.ts`**
    - Remove all inline helpers (lines 21-67)
    - Remove all handler logic
    - Replace with controller method calls
    - Keep route definitions and middleware
    - Example transformation:
      ```typescript
      // Before (59 LOC)
      router.get("/", async (req: Request, res: Response) => {
        try {
          const googleAccountId = req.query.googleAccountId || req.headers["x-google-account-id"];
          // ... 50+ lines of logic
        } catch (error: any) {
          return handleError(res, error, "Fetch tasks");
        }
      });

      // After (1 LOC)
      router.get("/", TasksController.getTasksForClient);
      ```
    - **Target LOC:** ~150 (from 871)

### Phase 6: Testing & Validation
**Goal:** Ensure refactor maintains functionality.

11. **Integration Testing**
    - Test each endpoint with existing test suite
    - Verify responses match original behavior
    - Test error cases
    - Test bulk operations with various inputs

12. **Regression Testing**
    - Run full test suite
    - Verify no breaking changes
    - Check notification creation for approved USER tasks
    - Verify domain filtering works correctly

### Phase 7: Cleanup
**Goal:** Remove deprecated code, update documentation.

13. **Remove deprecated inline helpers**
    - Remove getDomainFromAccountId() from route file (replaced by model)
    - Document handleError() as deprecated (pending centralized error handler)

14. **Update related documentation**
    - Update API documentation
    - Update architecture diagrams
    - Add JSDoc comments where missing

---

## 6. Files to Create

| File Path | Responsibility | Estimated LOC | Dependencies |
|-----------|----------------|---------------|--------------|
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/TaskModel.ts` | All task database operations | ~500 | db, types |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/TasksController.ts` | Route handler coordination | ~400 | express, services, models, utils |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskApprovalService.ts` | Approval + notification logic | ~120 | TaskModel, notificationHelper |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskBulkOperationsService.ts` | Bulk operations orchestration | ~150 | TaskModel, TaskApprovalService |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-services/TaskFilteringService.ts` | Admin query building | ~100 | TaskModel |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-utils/taskValidation.ts` | Validation helpers | ~150 | types |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/tasks/feature-utils/taskResponseFormatters.ts` | Response formatting | ~80 | types |

**Total new LOC:** ~1,500 (compared to current 871, but with clear separation of concerns)

---

## 7. Files to Modify

| File Path | Modification | LOC Change |
|-----------|--------------|------------|
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/tasks.ts` | Strip to route definitions only | 871 → ~150 (-721) |
| `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/GoogleAccountModel.ts` | Add missing methods if needed | +0 to +30 |

**Net LOC change for modified files:** -691 to -721

---

## 8. Risk Assessment

### 8.1 High Risk Areas

1. **Admin Filtering Logic (Lines 311-434)**
   - **Risk:** Complex query building with 8+ filters and pagination
   - **Impact:** Admin dashboard could return wrong data or fail
   - **Mitigation:**
     - Extract to TaskFilteringService with comprehensive tests
     - Create test fixtures with various filter combinations
     - Verify count query matches data query filters exactly
     - Add integration tests for edge cases (empty results, no filters, all filters)

2. **Bulk Approval Notification Logic (Lines 728-785)**
   - **Risk:** Domain grouping + notification creation per domain
   - **Impact:** Notifications might not be sent or sent to wrong domains
   - **Mitigation:**
     - Extract to TaskApprovalService.createBulkNotifications()
     - Add unit tests for domain grouping logic
     - Test notification failure handling (should not fail bulk approval)
     - Verify plural/singular message logic

3. **Task Ownership Validation (Lines 186-192)**
   - **Risk:** Authorization boundary enforcement
   - **Impact:** Users could complete tasks from other domains
   - **Mitigation:**
     - Extract to TaskModel.validateOwnership()
     - Add explicit tests for cross-domain access attempts
     - Verify 403 responses for unauthorized access

### 8.2 Medium Risk Areas

4. **Update Logic with Conditional Notification (Lines 489-519)**
   - **Risk:** Notification only sent when USER task approved for first time
   - **Impact:** Missing notifications or duplicate notifications
   - **Mitigation:**
     - Extract to TaskApprovalService.handleApprovalNotification()
     - Test all approval state transitions (false→true, true→false, true→true)
     - Verify notification only sent on false→true for USER category

5. **Bulk Status Update with Timestamp Logic (Lines 831-834)**
   - **Risk:** completed_at only set when status="complete"
   - **Impact:** Incorrect timestamps or missing timestamps
   - **Mitigation:**
     - Add tests for all status transitions
     - Verify completed_at only set when moving to "complete"
     - Test idempotency (marking complete twice)

6. **Category-Based Completion Restriction (Lines 195-201)**
   - **Risk:** Only USER tasks can be completed by clients
   - **Impact:** ALLORO tasks could be marked complete by clients
   - **Mitigation:**
     - Add explicit validation in TasksController.completeTask()
     - Test attempts to complete ALLORO tasks via client endpoint
     - Verify 403 response for ALLORO tasks

### 8.3 Low Risk Areas

7. **Task Creation with Domain Verification (Lines 264-272)**
   - **Risk:** Creating tasks for non-existent domains
   - **Impact:** Orphaned tasks or 404 errors
   - **Mitigation:** Simple validation in controller, already has error handling

8. **Grouped Response Formatting (Lines 114-126)**
   - **Risk:** Category grouping logic
   - **Impact:** Tasks in wrong category group
   - **Mitigation:** Extract to taskResponseFormatters.formatGroupedTasks(), add unit tests

9. **Health Check (Lines 859-865)**
   - **Risk:** None (trivial endpoint)
   - **Impact:** None
   - **Mitigation:** None needed

### 8.4 Cross-Cutting Risks

10. **Error Handling Consistency**
    - **Risk:** handleError() duplicated across 23 files
    - **Impact:** Inconsistent error responses across routes
    - **Mitigation:**
      - Document handleError() usage pattern in controller
      - Plan future consolidation into centralized error middleware
      - Ensure consistent error response format

11. **Transaction Safety**
    - **Risk:** No explicit transactions for multi-step operations
    - **Impact:** Partial updates if operations fail mid-execution
    - **Mitigation:**
      - Review bulk operations for transaction needs
      - Consider wrapping bulk approve + notification in transaction
      - Document transaction strategy for future enhancements

12. **Type Safety**
    - **Risk:** Implicit any types in request handling
    - **Impact:** Runtime errors from unexpected data shapes
    - **Mitigation:**
      - Use explicit types for all request/response interfaces
      - Validate request bodies against types
      - Add runtime validation with taskValidation utils

---

## 9. Testing Strategy

### 9.1 Unit Tests (New Files)

**TaskModel.ts**
- Test each CRUD method independently
- Mock db connection
- Test error cases (not found, DB errors)
- Test query building for filters
- Test bulk operations with various input sizes

**TaskApprovalService.ts**
- Test notification triggering logic
- Test domain grouping for bulk approvals
- Test notification failure handling (should not throw)
- Test message formatting (singular/plural)

**TaskBulkOperationsService.ts**
- Test bulk archive orchestration
- Test bulk approve with notification coordination
- Test bulk status update with timestamp logic
- Test empty array handling

**TaskFilteringService.ts**
- Test query building with all filter combinations
- Test pagination edge cases (offset > total, limit = 0)
- Test default filter behavior (exclude archived)
- Test count/data query consistency

**taskValidation.ts**
- Test all validation functions with valid/invalid inputs
- Test edge cases (null, undefined, wrong types)
- Test array validation (empty, invalid elements)

**taskResponseFormatters.ts**
- Test grouped response formatting
- Test standard response formatting
- Test error response formatting

### 9.2 Integration Tests (Endpoint Level)

**Client Endpoints**
- GET / — Test domain filtering, approved filter, archived exclusion, grouping
- PATCH /:id/complete — Test ownership validation, category restriction, timestamp update

**Admin Endpoints**
- POST / — Test domain verification, task creation, default values
- GET /admin/all — Test all filter combinations, pagination, sorting
- PATCH /:id — Test dynamic updates, notification triggering, completed_at logic
- PATCH /:id/category — Test category validation, update
- DELETE /:id — Test soft delete (status change)
- GET /clients — Test onboarded account filtering
- POST /bulk/delete — Test bulk archive
- POST /bulk/approve — Test bulk approve, notification per domain
- POST /bulk/status — Test bulk status update, timestamp logic

### 9.3 Regression Tests

- Run existing test suite after refactor
- Verify all responses match original behavior
- Test with real database (not mocks) for integration layer
- Test concurrent requests to bulk endpoints
- Test large bulk operations (100+ task IDs)

### 9.4 Edge Case Tests

- Empty domain (no tasks)
- Invalid googleAccountId
- Cross-domain access attempts
- Updating already-completed tasks
- Bulk operations with duplicate IDs
- Bulk operations with non-existent IDs
- Bulk approve with mix of USER/ALLORO tasks
- Notification failure during bulk approve (should not fail approval)

---

## 10. Performance Considerations

### 10.1 Query Optimization

1. **Admin Filtering (Lines 311-434)**
   - **Current:** Separate count and data queries (necessary for pagination)
   - **Optimization:** Ensure indexes on commonly filtered columns
     - `tasks.domain_name` (filtered on line 332)
     - `tasks.status` (filtered on line 336)
     - `tasks.category` (filtered on line 343)
     - `tasks.is_approved` (filtered on line 352)
     - `tasks.created_at` (filtered on lines 356, 364, ordering on line 416)
   - **Action:** Verify indexes exist or add migration

2. **Bulk Operations**
   - **Current:** Single update query with `whereIn()`
   - **Optimization:** Already optimal for bulk operations
   - **Consideration:** Add limit validation (max 1000 IDs per bulk operation)

3. **Domain Lookups**
   - **Current:** getDomainFromAccountId() queries per request
   - **Optimization:** Consider caching google_accounts domain mapping
   - **Action:** Document for future caching layer

### 10.2 N+1 Query Prevention

- **Current:** No N+1 issues detected
- **Risk:** Bulk approve queries tasks twice (line 731, line 752)
- **Optimization:** Combine into single query or cache result

### 10.3 Response Size

- **Admin /admin/all endpoint:** Pagination already implemented (limit/offset)
- **Client / endpoint:** No pagination (assumes reasonable task count per domain)
- **Consideration:** Add pagination to client endpoint if domains have 100+ tasks

---

## 11. Security Considerations

### 11.1 Authorization Boundaries

1. **Client Endpoints (Domain Filtering)**
   - **Protection:** googleAccountId → domain lookup → task filtering
   - **Risk:** If googleAccountId is spoofed, wrong domain accessed
   - **Mitigation:**
     - Validate googleAccountId against authenticated user session
     - Consider middleware to attach domain to request object
     - Add rate limiting per domain

2. **Admin Endpoints (Unrestricted)**
   - **Protection:** None in route (assumes auth middleware upstream)
   - **Risk:** If auth middleware missing, unrestricted access
   - **Mitigation:**
     - Document required auth middleware
     - Add explicit admin role check in controller
     - Consider separate admin router with auth guard

3. **Task Completion Restriction (USER only)**
   - **Protection:** Category check on line 195-201
   - **Risk:** ALLORO tasks could be completed if check fails
   - **Mitigation:**
     - Maintain category validation in controller
     - Add integration test for ALLORO completion attempt

### 11.2 Input Validation

1. **Task ID Validation**
   - **Current:** parseInt + isNaN check
   - **Risk:** SQL injection if not properly parameterized
   - **Mitigation:** Knex already parameterizes queries, but add explicit validation

2. **Category/Status Validation**
   - **Current:** Whitelist validation (lines 256, 551, 816)
   - **Risk:** Invalid values if validation skipped
   - **Mitigation:** Extract to taskValidation utils, ensure all endpoints use

3. **Array Input Validation**
   - **Current:** Array.isArray() + length check
   - **Risk:** Malformed array elements (non-numbers)
   - **Mitigation:** Add element validation in taskValidation.validateBulkTaskIds()

### 11.3 Sensitive Data

- **Metadata field:** JSON.stringify() without sanitization (lines 285, 487)
- **Risk:** Arbitrary JSON could be stored
- **Mitigation:** Document metadata schema, add validation if sensitive data stored

---

## 12. Migration Execution Plan

### 12.1 Pre-Migration

1. **Backup current route file**
   ```bash
   cp tasks.ts tasks.ts.backup
   ```

2. **Create feature branch**
   ```bash
   git checkout -b refactor/tasks-route-controller-model
   ```

3. **Run full test suite (baseline)**
   ```bash
   npm test -- --grep "tasks"
   ```

### 12.2 Migration Execution

Execute phases 1-5 sequentially (from section 5):
1. Create TaskModel.ts
2. Verify GoogleAccountModel.ts
3. Create TaskApprovalService.ts
4. Create TaskBulkOperationsService.ts
5. Create TaskFilteringService.ts
6. Create taskValidation.ts
7. Create taskResponseFormatters.ts
8. Create TasksController.ts
9. Refactor routes/tasks.ts
10. Run integration tests after each phase

### 12.3 Post-Migration

1. **Run full test suite**
   ```bash
   npm test
   ```

2. **Manual testing**
   - Test all 12 endpoints via Postman/curl
   - Test bulk operations with various inputs
   - Test error cases (404, 403, 400)

3. **Code review**
   - Review separation of concerns
   - Verify no business logic in routes
   - Verify all db() calls moved to models
   - Verify consistent error handling

4. **Documentation update**
   - Update API docs
   - Update architecture diagrams
   - Document new folder structure

### 12.4 Rollback Plan

If critical issues discovered:

1. **Immediate rollback**
   ```bash
   git checkout signalsai-backend/src/routes/tasks.ts.backup
   git restore tasks.ts
   ```

2. **Partial rollback (keep models, revert routes)**
   - Restore original route file
   - Keep model layer for future use
   - Investigate issues with controller layer

3. **Rollback considerations**
   - No database schema changes (safe to rollback)
   - No breaking API changes (routes unchanged)
   - No external service changes (notifications unchanged)

---

## 13. Success Metrics

### 13.1 Code Quality Metrics

- **Route file LOC:** 871 → ~150 (83% reduction)
- **Average method LOC:** Current ~70 → Target ~30 (57% reduction)
- **Cyclomatic complexity:** Reduce from 5-8 per handler to 2-3
- **Code duplication:** Eliminate 3 duplicate helpers (getDomainFromAccountId, handleError, validateTaskOwnership)
- **Test coverage:** Maintain or increase from current baseline

### 13.2 Maintainability Metrics

- **Separation of concerns:** Clear boundaries (routes → controller → service → model)
- **Single Responsibility:** Each file/method has one clear purpose
- **Discoverability:** New developers can locate task logic in controllers/tasks/
- **Reusability:** Validation/formatting utils reusable across routes

### 13.3 Functional Metrics

- **Zero regression bugs:** All existing tests pass
- **Zero breaking changes:** API contracts unchanged
- **Performance neutral:** No query performance degradation
- **Error handling consistent:** All endpoints return standard error format

---

## 14. Future Enhancements (Out of Scope)

These are explicitly NOT part of this refactor but should be considered in future work:

1. **Centralized Error Handler Middleware**
   - Replace duplicated handleError() across 23 files
   - Standardize error response format
   - Add error logging/monitoring integration

2. **Authentication Middleware**
   - Replace googleAccountId query param with session-based auth
   - Add JWT or session validation
   - Attach authenticated domain to request object

3. **Response Caching**
   - Cache domain → googleAccountId lookups
   - Cache onboarded clients list
   - Add Redis layer for frequent queries

4. **Rate Limiting**
   - Add per-domain rate limits
   - Protect bulk endpoints from abuse
   - Add request throttling

5. **Audit Logging**
   - Log all task mutations (create, update, delete, bulk operations)
   - Track who performed admin actions
   - Add audit trail for compliance

6. **Webhook Support**
   - Notify external systems on task approval
   - Trigger webhooks on task completion
   - Add webhook configuration per domain

7. **Task Scheduling**
   - Add recurring task support
   - Add task reminder notifications
   - Add due date warnings

8. **Soft Delete with Restore**
   - Add restore endpoint for archived tasks
   - Add permanent delete for GDPR compliance
   - Add archive retention policies

---

## 15. Definition of Done

This refactor is complete when:

- [ ] All 7 new files created with proper structure
- [ ] TaskModel.ts has all 14 methods implemented
- [ ] GoogleAccountModel.ts has required methods (getDomainFromAccountId, findByDomain, findOnboarded)
- [ ] All 3 service files created and functional
- [ ] All 2 util files created and functional
- [ ] TasksController.ts has all 12 controller methods
- [ ] routes/tasks.ts stripped to ~150 LOC (route definitions only)
- [ ] All 28 db() calls replaced with model methods
- [ ] All 3 inline helpers removed
- [ ] Full test suite passes (zero regressions)
- [ ] Integration tests written for all endpoints
- [ ] Unit tests written for all new files
- [ ] Code review completed and approved
- [ ] Documentation updated (API docs, architecture diagrams)
- [ ] Performance benchmarks show no degradation
- [ ] Manual testing completed for all endpoints
- [ ] Branch merged to main/develop

---

## 16. Questions for Team

Before proceeding with implementation, clarify:

1. **GoogleAccountModel.ts:** Confirm getDomainFromAccountId() already exists and is ready to use. If not, should it be added as part of this refactor?

2. **Error Handling:** Should we implement centralized error handler as part of this refactor, or continue using handleError() pattern temporarily?

3. **Authentication:** Should we add explicit auth middleware to admin endpoints, or assume it exists upstream?

4. **Transactions:** Should bulk operations use database transactions, or is current approach acceptable?

5. **Testing:** What is current test coverage baseline for tasks route? Should we aim for 80%+ coverage?

6. **Notifications:** Should notification failures fail the parent operation (task update/approval), or log and continue (current behavior)?

7. **Index Verification:** Should we verify database indexes as part of this refactor, or document for separate DB optimization task?

8. **Deployment Strategy:** Should this be deployed incrementally (model → service → controller → routes), or as single atomic deployment?

---

**Plan Status:** Ready for Review
**Next Step:** Team review → Approval → Execute Phase 1 (Model Layer)
**Estimated Implementation Time:** 12-16 hours (across all phases)
**Risk Level:** Medium (complex query logic, bulk operations, notification coordination)
**Dependencies:** None (self-contained refactor)
