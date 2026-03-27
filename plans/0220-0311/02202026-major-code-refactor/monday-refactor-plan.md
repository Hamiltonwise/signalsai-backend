# Monday.com Routes Refactor Plan

**Date:** 2026-02-18
**Target:** `/signalsai-backend/src/routes/monday.ts`
**Status:** Ready for Review

---

## 1. Current State Analysis

### Overview
- **Total LOC:** 697 lines
- **Total Endpoints:** 8 (6 POST, 1 GET, 1 diagnostic)
- **Integration Type:** External API only (Monday.com GraphQL API)
- **Database Calls:** None — pure external integration
- **Middleware:** None currently (needs tokenRefreshMiddleware)
- **Dependencies:**
  - `express`
  - `axios` (HTTP client for Monday.com API)
  - `domainMappings` utility
  - Type definitions from `../types/global`

### Endpoints Inventory

| Method | Route | Handler LOC | Purpose |
|--------|-------|-------------|---------|
| POST | `/monday/createTask` | 72 | Create new task in Monday.com board |
| POST | `/monday/fetchTasks` | 66 | Fetch tasks filtered by domain/status |
| POST | `/monday/archiveTask` | 78 | Archive task (set status to archived_by_client) |
| POST | `/monday/updateTask` | 88 | Update task content, type, or status |
| POST | `/monday/getTaskComments` | 66 | Retrieve all comments/updates for a task |
| POST | `/monday/addTaskComment` | 59 | Add comment with client branding |
| GET | `/monday/diag/boards` | 30 | Diagnostic: list all boards |
| N/A | Helper Functions | 238 | Utilities and GraphQL execution |

### Current Helper Functions (Lines 20-195)

| Function | LOC | Purpose | Classification |
|----------|-----|---------|----------------|
| `executeMondayGraphQL` | 27 | Execute GraphQL queries/mutations | Core API Service |
| `handleError` | 9 | Standardized error handling | Controller Utility |
| `getClientDisplayName` | 7 | Map domain to display name | Business Logic Utility |
| `formatClientComment` | 6 | Format comment with client branding | Business Logic Utility |
| `getBoardColumns` | 18 | Fetch board column schema | API Service |
| `findColumnIds` | 14 | Map column titles to IDs | API Service |
| `createColumnValues` | 29 | Build column values JSON | Data Transformation Utility |
| `parseTaskData` | 33 | Parse Monday.com response to MondayTask | Data Transformation Utility |

### Configuration
```typescript
MONDAY_API_TOKEN (env)
MONDAY_BOARD_ID (env)
MONDAY_API_URL = "https://api.monday.com/v2"
```

### External Dependencies
- Monday.com GraphQL API (v2)
- `domainMappings` from `../utils/domainMappings`
- Type definitions: `MondayTask`, `CreateTaskRequest`, `FetchTasksRequest`, etc.

---

## 2. Target Architecture

### Proposed Folder Structure

```
src/
├── routes/
│   └── monday.ts                          # Route definitions only
│
├── controllers/
│   └── monday/
│       ├── MondayController.ts            # All endpoint handlers
│       │
│       ├── feature-services/
│       │   ├── service.monday-api.ts      # GraphQL execution & API calls
│       │   ├── service.board-columns.ts   # Column schema operations
│       │   └── service.task-operations.ts # Task CRUD operations
│       │
│       └── feature-utils/
│           ├── util.column-values.ts      # Column value builders
│           ├── util.task-parser.ts        # Response parsing
│           ├── util.client-branding.ts    # Domain/branding utilities
│           └── util.error-handler.ts      # Error handling
│
└── types/
    └── global.ts                          # Existing types (no change)
```

### Layer Responsibilities

**routes/monday.ts**
- Route registration only
- Middleware attachment (tokenRefreshMiddleware)
- Delegates to controller methods

**controllers/monday/MondayController.ts**
- HTTP layer: req/res handling
- Input validation
- Response formatting
- Error handling coordination
- Orchestrates services

**feature-services/**
- API communication logic
- GraphQL query/mutation execution
- Business operations (create, fetch, update, archive)
- Column schema management

**feature-utils/**
- Pure functions
- Data transformation
- Parsing
- Formatting
- Validation helpers

---

## 3. Component Mapping

### Routes Layer → Controller Methods

| Current Route Handler | New Controller Method | Services Called | Utils Called |
|-----------------------|----------------------|-----------------|--------------|
| POST `/createTask` | `MondayController.createTask` | `TaskOperations.createTask` | `ColumnValues.createColumnValues`, `TaskParser.parseTaskData` |
| POST `/fetchTasks` | `MondayController.fetchTasks` | `TaskOperations.fetchTasks` | `TaskParser.parseTaskData` |
| POST `/archiveTask` | `MondayController.archiveTask` | `TaskOperations.verifyTaskOwnership`, `TaskOperations.archiveTask` | `TaskParser.parseTaskData` |
| POST `/updateTask` | `MondayController.updateTask` | `TaskOperations.updateTask` | `ColumnValues.buildUpdateValues`, `TaskParser.parseTaskData` |
| POST `/getTaskComments` | `MondayController.getTaskComments` | `TaskOperations.getTaskComments` | None |
| POST `/addTaskComment` | `MondayController.addTaskComment` | `TaskOperations.addTaskComment` | `ClientBranding.getClientDisplayName`, `ClientBranding.formatClientComment` |
| GET `/diag/boards` | `MondayController.diagBoards` | `MondayAPI.executeMondayGraphQL` | None |

### Helper Functions → New Locations

| Current Function | New Location | New Function Name |
|------------------|--------------|-------------------|
| `executeMondayGraphQL` | `service.monday-api.ts` | `MondayAPIService.executeMondayGraphQL` |
| `handleError` | `util.error-handler.ts` | `ErrorHandler.handleError` |
| `getClientDisplayName` | `util.client-branding.ts` | `ClientBranding.getClientDisplayName` |
| `formatClientComment` | `util.client-branding.ts` | `ClientBranding.formatClientComment` |
| `getBoardColumns` | `service.board-columns.ts` | `BoardColumnsService.getBoardColumns` |
| `findColumnIds` | `service.board-columns.ts` | `BoardColumnsService.findColumnIds` |
| `createColumnValues` | `util.column-values.ts` | `ColumnValuesUtil.createColumnValues` |
| `parseTaskData` | `util.task-parser.ts` | `TaskParser.parseTaskData` |

---

## 4. Step-by-Step Migration Plan

### Phase 1: Setup Infrastructure (No Breaking Changes)

**Step 1.1:** Create directory structure
```bash
mkdir -p src/controllers/monday/feature-services
mkdir -p src/controllers/monday/feature-utils
```

**Step 1.2:** Create utility modules (pure functions, no dependencies on existing code)

- `src/controllers/monday/feature-utils/util.error-handler.ts`
  - Move `handleError` function
  - Export as class method: `ErrorHandler.handleError`

- `src/controllers/monday/feature-utils/util.column-values.ts`
  - Move `createColumnValues` function
  - Add `buildUpdateValues` for update endpoint
  - Export as class methods

- `src/controllers/monday/feature-utils/util.task-parser.ts`
  - Move `parseTaskData` function
  - Export as class method: `TaskParser.parseTaskData`

- `src/controllers/monday/feature-utils/util.client-branding.ts`
  - Move `getClientDisplayName` function
  - Move `formatClientComment` function
  - Import `domainMappings` here
  - Export as class methods

### Phase 2: Extract Services

**Step 2.1:** Create API service layer

- `src/controllers/monday/feature-services/service.monday-api.ts`
  - Move `executeMondayGraphQL` function
  - Extract configuration (MONDAY_API_TOKEN, MONDAY_API_URL, MONDAY_BOARD_ID)
  - Create `MondayAPIService` class with:
    - Constructor to validate config
    - `executeMondayGraphQL(query, variables)` method
    - `getBoardId()` getter
  - This becomes the only module that directly calls Monday.com API

**Step 2.2:** Create board columns service

- `src/controllers/monday/feature-services/service.board-columns.ts`
  - Move `getBoardColumns` function
  - Move `findColumnIds` function
  - Create `BoardColumnsService` class with:
    - Dependency on `MondayAPIService`
    - `getBoardColumns()` method
    - `findColumnIds()` method
    - Consider caching column IDs to reduce API calls

**Step 2.3:** Create task operations service

- `src/controllers/monday/feature-services/service.task-operations.ts`
  - Create `TaskOperationsService` class with methods:
    - `createTask(domain, content, type)` - encapsulates lines 202-272
    - `fetchTasks(domain, status, limit)` - encapsulates lines 279-343
    - `verifyTaskOwnership(taskId, domain)` - extracted from archiveTask
    - `archiveTask(taskId, domain)` - encapsulates lines 350-427
    - `updateTask(taskId, updates)` - encapsulates lines 434-521
    - `getTaskComments(taskId)` - encapsulates lines 528-593
    - `addTaskComment(taskId, domain, comment)` - encapsulates lines 600-658
  - Dependencies:
    - `MondayAPIService`
    - `BoardColumnsService`
    - `TaskParser`
    - `ColumnValuesUtil`
    - `ClientBranding`

### Phase 3: Create Controller

**Step 3.1:** Create controller class

- `src/controllers/monday/MondayController.ts`
  - Create `MondayController` class
  - Inject service dependencies (TaskOperationsService, etc.)
  - Implement HTTP handlers:
    - `createTask(req, res)`
    - `fetchTasks(req, res)`
    - `archiveTask(req, res)`
    - `updateTask(req, res)`
    - `getTaskComments(req, res)`
    - `addTaskComment(req, res)`
    - `diagBoards(req, res)`
  - Each handler:
    - Validates request body
    - Calls appropriate service method(s)
    - Formats response
    - Handles errors using `ErrorHandler.handleError`

### Phase 4: Refactor Routes File

**Step 4.1:** Update routes/monday.ts

- Import `MondayController`
- Instantiate controller with dependencies
- Replace inline handlers with controller method calls
- Keep middleware attachment (tokenRefreshMiddleware when added)
- Result should be ~50-60 LOC

Example structure:
```typescript
import express from "express";
import { MondayController } from "../controllers/monday/MondayController";
import { TaskOperationsService } from "../controllers/monday/feature-services/service.task-operations";
import { MondayAPIService } from "../controllers/monday/feature-services/service.monday-api";
import { BoardColumnsService } from "../controllers/monday/feature-services/service.board-columns";

const mondayRoutes = express.Router();

// Initialize services
const mondayAPIService = new MondayAPIService();
const boardColumnsService = new BoardColumnsService(mondayAPIService);
const taskOperationsService = new TaskOperationsService(
  mondayAPIService,
  boardColumnsService
);

// Initialize controller
const mondayController = new MondayController(taskOperationsService);

// Routes
mondayRoutes.post("/createTask", (req, res) => mondayController.createTask(req, res));
mondayRoutes.post("/fetchTasks", (req, res) => mondayController.fetchTasks(req, res));
mondayRoutes.post("/archiveTask", (req, res) => mondayController.archiveTask(req, res));
mondayRoutes.post("/updateTask", (req, res) => mondayController.updateTask(req, res));
mondayRoutes.post("/getTaskComments", (req, res) => mondayController.getTaskComments(req, res));
mondayRoutes.post("/addTaskComment", (req, res) => mondayController.addTaskComment(req, res));
mondayRoutes.get("/diag/boards", (req, res) => mondayController.diagBoards(req, res));

export default mondayRoutes;
```

### Phase 5: Cleanup & Validation

**Step 5.1:** Remove old code from routes/monday.ts
- Delete all helper functions (lines 20-195)
- Delete all inline route handlers (lines 202-695)
- Keep only route registration

**Step 5.2:** Test all endpoints
- Verify each endpoint maintains identical behavior
- Test error handling paths
- Validate response formats unchanged

**Step 5.3:** Add middleware (if not already present)
- Attach `tokenRefreshMiddleware` where required

---

## 5. Files to Create

### New Files (8 total)

1. **src/controllers/monday/MondayController.ts**
   - Main controller class
   - ~150-200 LOC (7 endpoint handlers + error handling)

2. **src/controllers/monday/feature-services/service.monday-api.ts**
   - Monday.com API client wrapper
   - ~60-80 LOC (GraphQL execution + config)

3. **src/controllers/monday/feature-services/service.board-columns.ts**
   - Board column schema operations
   - ~60-80 LOC (column fetching + ID mapping)

4. **src/controllers/monday/feature-services/service.task-operations.ts**
   - Task CRUD operations
   - ~300-350 LOC (7 business operations)

5. **src/controllers/monday/feature-utils/util.error-handler.ts**
   - Error handling utility
   - ~20-30 LOC

6. **src/controllers/monday/feature-utils/util.column-values.ts**
   - Column value builders
   - ~60-80 LOC (create + update builders)

7. **src/controllers/monday/feature-utils/util.task-parser.ts**
   - Task response parser
   - ~50-60 LOC

8. **src/controllers/monday/feature-utils/util.client-branding.ts**
   - Client branding utilities
   - ~30-40 LOC (display name + comment formatting)

**Total New LOC:** ~730-920 lines (slight increase due to class structure, type annotations, improved error handling)

---

## 6. Files to Modify

### Modified Files (1 total)

1. **src/routes/monday.ts**
   - **Before:** 697 LOC
   - **After:** ~50-60 LOC
   - **Changes:**
     - Remove all helper functions (lines 20-195)
     - Remove all inline handlers (lines 202-695)
     - Import controller and services
     - Instantiate dependencies
     - Register routes with controller methods
   - **Reduction:** ~640 LOC removed

---

## 7. Risk Assessment

### Risk Level: **LOW-MEDIUM**

### Risk Factors

#### ✅ Low Risk Factors
- **No database calls:** Pure external API integration reduces DB migration risk
- **Clear boundaries:** All code contained in single route file
- **Type safety:** Existing TypeScript types provide compile-time validation
- **No auth logic:** No complex authorization to migrate
- **Single dependency:** Only calls Monday.com API, no cross-service dependencies

#### ⚠️ Medium Risk Factors
- **External API dependency:** Monday.com API changes could impact all endpoints
- **GraphQL complexity:** GraphQL query/mutation structure must remain exact
- **Column ID mapping:** Dynamic column lookup could fail if board schema changes
- **Error handling:** Must preserve exact error response formats
- **Comment formatting:** Client branding logic must remain consistent

### Specific Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GraphQL query syntax breaks | Low | High | Preserve exact query strings; add integration tests |
| Column ID mapping fails | Medium | High | Add column caching; implement fallback logic |
| Error response format changes | Low | Medium | Use strict interface for error responses |
| Service initialization order issues | Low | Low | Use dependency injection pattern |
| Missing environment variables | Low | High | Validate config in MondayAPIService constructor |
| Client branding logic breaks | Low | Medium | Add unit tests for formatting functions |

### Mitigation Strategy

1. **Preserve GraphQL Queries Exactly**
   - Copy-paste all GraphQL query strings verbatim
   - Do not modify query structure during refactor

2. **Add Configuration Validation**
   - MondayAPIService constructor should throw if env vars missing
   - Fail fast on startup rather than runtime

3. **Implement Column Caching**
   - BoardColumnsService should cache column IDs after first fetch
   - Reduces API calls and failure surface

4. **Maintain Error Response Format**
   - Use strict interface for all error responses
   - ErrorHandler should preserve existing { error: string } structure

5. **Add Integration Tests**
   - Test each endpoint with Monday.com API (or mock)
   - Verify response formats unchanged

6. **Gradual Migration**
   - Create all new files first
   - Test in isolation
   - Update routes last

---

## 8. Testing Strategy

### Unit Tests (To Be Added)

**Feature Utils (High Priority)**
- `util.column-values.ts`: Test column value JSON generation
- `util.task-parser.ts`: Test Monday.com response parsing
- `util.client-branding.ts`: Test domain display name mapping, comment formatting

**Feature Services (Medium Priority)**
- Mock `executeMondayGraphQL` responses
- Test service methods in isolation

### Integration Tests (Critical)

**Endpoint Validation**
- Test each endpoint maintains identical request/response format
- Use actual Monday.com API (dev board) or comprehensive mocks
- Validate error handling paths

**Regression Tests**
- Before refactor: Capture request/response samples for all endpoints
- After refactor: Replay requests, compare responses

### Manual Testing Checklist

- [ ] POST `/monday/createTask` - Create task with ai/custom type
- [ ] POST `/monday/fetchTasks` - Fetch with domain filter, status filter
- [ ] POST `/monday/archiveTask` - Archive task, verify ownership check
- [ ] POST `/monday/updateTask` - Update content, type, status
- [ ] POST `/monday/getTaskComments` - Fetch comments, verify sorting
- [ ] POST `/monday/addTaskComment` - Add comment with client branding
- [ ] GET `/monday/diag/boards` - List boards, verify configured board ID
- [ ] Test error paths: missing fields, invalid task ID, wrong domain

---

## 9. Definition of Done

### Functional Requirements
- [ ] All 8 endpoints maintain identical behavior
- [ ] Request/response formats unchanged
- [ ] Error handling preserves existing format
- [ ] Client branding logic works identically
- [ ] Column ID mapping functions correctly
- [ ] Domain filtering operates as before

### Structural Requirements
- [ ] routes/monday.ts reduced to ~50-60 LOC (route definitions only)
- [ ] MondayController.ts created with 7 endpoint handlers
- [ ] 3 service files created in feature-services/
- [ ] 4 utility files created in feature-utils/
- [ ] All helper functions migrated to appropriate locations
- [ ] No code duplication between old and new structure

### Quality Requirements
- [ ] TypeScript compiles without errors
- [ ] No linting errors
- [ ] All imports resolved correctly
- [ ] Service dependencies injected properly
- [ ] Configuration validated on startup

### Testing Requirements
- [ ] All endpoints tested manually
- [ ] Unit tests added for utils (minimum)
- [ ] Integration tests added or documented
- [ ] Error paths validated

### Documentation Requirements
- [ ] Code comments added where logic is complex
- [ ] Service dependencies documented
- [ ] Configuration requirements documented

---

## 10. Rollback Plan

### Rollback Trigger Conditions
- Critical endpoint failure in production
- Monday.com API integration breaks
- Response format changes break clients
- Performance degradation observed

### Rollback Steps
1. **Immediate:** Revert routes/monday.ts to previous version from git
2. **Remove:** Delete new controller directory: `rm -rf src/controllers/monday/`
3. **Verify:** Test all endpoints return to working state
4. **Document:** Log what failed and why

### Rollback Risk: **VERY LOW**
- Single route file revert
- No database migrations to roll back
- No cross-service dependencies to unwind

---

## 11. Open Questions

1. **Column ID Caching Strategy**
   - Should column IDs be cached in-memory or fetched each request?
   - Recommendation: Cache with 1-hour TTL to reduce API calls

2. **Error Logging Strategy**
   - Should we maintain console.error or switch to structured logger?
   - Recommendation: Keep console.error for now; add structured logging as separate initiative

3. **Middleware Attachment**
   - When should tokenRefreshMiddleware be added?
   - Recommendation: Add in Phase 4 when updating routes file

4. **Service Instantiation**
   - Should services be singletons or instantiated per-request?
   - Recommendation: Singletons (stateless services)

5. **Type Location**
   - Should we create Monday-specific types in controllers/monday/types.ts?
   - Recommendation: Keep using existing types from ../types/global for now

---

## 12. Success Metrics

### Code Quality Metrics
- **Route file LOC:** 697 → ~55 (92% reduction)
- **Separation of concerns:** Routes/Controller/Services/Utils layers clear
- **Reusability:** Services can be called from other routes if needed
- **Testability:** Utils and services easily unit-testable

### Functional Metrics
- **Endpoint behavior:** 100% identical to current
- **API call count:** No increase in Monday.com API calls
- **Error handling:** All error paths preserved
- **Response time:** No degradation (negligible overhead from abstraction)

---

## 13. Timeline Estimate

Assuming one developer, moderate familiarity with codebase:

| Phase | Estimated Time | Cumulative |
|-------|----------------|------------|
| Phase 1: Setup + Utils | 2-3 hours | 2-3 hours |
| Phase 2: Extract Services | 3-4 hours | 5-7 hours |
| Phase 3: Create Controller | 2-3 hours | 7-10 hours |
| Phase 4: Refactor Routes | 1-2 hours | 8-12 hours |
| Phase 5: Testing + Validation | 2-3 hours | 10-15 hours |

**Total Estimate:** 10-15 hours (1.5-2 days of focused work)

---

## 14. Next Steps

1. **Review this plan** with team/lead engineer
2. **Approve or request changes** to architecture
3. **Create feature branch** (e.g., `refactor/monday-routes-restructure`)
4. **Execute Phase 1** (utils creation)
5. **Checkpoint:** Review utils with team
6. **Execute Phases 2-4** (services, controller, routes)
7. **Execute Phase 5** (testing)
8. **Submit PR** with before/after comparison
9. **Deploy to staging** for validation
10. **Deploy to production** after staging validation

---

**Plan Status:** Ready for Review
**Approval Required Before:** Phase 1 execution
**Point of Contact:** [Assign engineer responsible for execution]
