# Admin Agent Outputs Route Refactor Plan

**Route**: `/api/admin/agent-outputs`
**File**: `signalsai-backend/src/routes/admin/agentOutputs.ts`
**Created**: 2026-02-18
**Scope**: Medium - 11 endpoints, ~665 LOC

---

## Executive Summary

This route manages admin-level agent output viewing and management. It includes list/filter operations with pagination, archive/unarchive functionality, CRUD operations, and summary statistics. The route handles the `agent_results` table exclusively.

**Complexity**: Medium
- 11 endpoints with significant shared filter logic
- Pagination with complex query building
- JSON field parsing logic
- Archive state management
- Bulk operations
- Statistics aggregation

**Model Coverage**: Partial
`AgentResultModel` already provides most needed methods, but missing bulk operations, statistics, and JSON field selection handling.

---

## 1. Current State Analysis

### Lines of Code
- **Total**: 665 lines
- **Route definitions**: ~50 lines
- **Business logic**: ~550 lines
- **Comments/documentation**: ~65 lines

### Endpoints (11 total)

1. **GET `/`** - List agent outputs with filtering and pagination (lines 29-161)
2. **GET `/domains`** - Get unique domains for filter dropdown (lines 169-198)
3. **GET `/agent-types`** - Get unique agent types for filter dropdown (lines 206-233)
4. **GET `/:id`** - Get single agent output with full details (lines 241-299)
5. **PATCH `/:id/archive`** - Archive a single output (lines 307-354)
6. **PATCH `/:id/unarchive`** - Restore an archived output (lines 362-409)
7. **POST `/bulk/archive`** - Bulk archive multiple outputs (lines 418-457)
8. **POST `/bulk/unarchive`** - Bulk unarchive multiple outputs (lines 466-507)
9. **DELETE `/:id`** - Permanently delete a single output (lines 515-550)
10. **POST `/bulk/delete`** - Bulk delete multiple outputs (lines 559-594)
11. **GET `/stats/summary`** - Get summary statistics (lines 602-659)

### Direct Database Access (db() calls)

#### Endpoint 1 - List (GET `/`)
- **Line 48**: `db("agent_results")` - Count query builder
- **Line 52**: `.where("domain", domain)` - Domain filter
- **Line 56**: `.where("agent_type", agent_type)` - Agent type filter
- **Line 61**: `.where("status", status)` - Status filter
- **Line 64**: `.whereNot("status", "archived")` - Default exclude archived
- **Line 68-71**: `.where("created_at", ">=", date_from)` - Date from filter
- **Line 75-79**: `.where("created_at", "<=", date_to)` - Date to filter
- **Line 84**: `.count("* as count")` - Execute count
- **Line 89-100**: `db("agent_results").select(...)` - Data query builder with column selection
- **Lines 103-131**: Repeated filter application on data query
- **Lines 134-137**: `.orderBy("created_at", "desc").limit().offset()` - Pagination

**Issue**: Duplicate filter logic built twice (count query + data query)

#### Endpoint 2 - Domains (GET `/domains`)
- **Line 173**: `db("agent_results").distinct("domain")`
- **Line 174-176**: `.whereNotNull("domain").orderBy("domain", "asc")`
- **Lines 178-180**: In-memory filtering (removes "SYSTEM")

**Issue**: In-memory filtering could be done in query

#### Endpoint 3 - Agent Types (GET `/agent-types`)
- **Line 210**: `db("agent_results").distinct("agent_type")`
- **Line 211-213**: `.whereNotNull("agent_type").orderBy("agent_type", "asc")`

#### Endpoint 4 - Get by ID (GET `/:id`)
- **Line 247**: `db("agent_results").where("id", id).first()`
- **Lines 258-279**: Manual JSON parsing logic for `agent_input` and `agent_output`

**Issue**: JSON field parsing should be handled by model layer

#### Endpoint 5 - Archive (PATCH `/:id/archive`)
- **Line 314**: `db("agent_results").where("id", id).first()` - Check existence
- **Line 334-337**: `db("agent_results").where("id", id).update(...)` - Archive update

**Issue**: Two separate queries (fetch + update)

#### Endpoint 6 - Unarchive (PATCH `/:id/unarchive`)
- **Line 369**: `db("agent_results").where("id", id).first()` - Check existence
- **Line 389-392**: `db("agent_results").where("id", id).update(...)` - Unarchive update

**Issue**: Two separate queries (fetch + update)

#### Endpoint 7 - Bulk Archive (POST `/bulk/archive`)
- **Lines 434-440**: `db("agent_results").whereIn("id", ids).whereNot("status", "archived").update(...)`

#### Endpoint 8 - Bulk Unarchive (POST `/bulk/unarchive`)
- **Lines 484-490**: `db("agent_results").whereIn("id", ids).where("status", "archived").update(...)`

#### Endpoint 9 - Delete (DELETE `/:id`)
- **Line 522**: `db("agent_results").where("id", id).first()` - Check existence
- **Line 533**: `db("agent_results").where("id", id).del()` - Delete

**Issue**: Two separate queries (fetch + delete)

#### Endpoint 10 - Bulk Delete (POST `/bulk/delete`)
- **Line 575**: `db("agent_results").whereIn("id", ids).del()`

#### Endpoint 11 - Stats Summary (GET `/stats/summary`)
- **Lines 607-610**: `db("agent_results").select("status").count("* as count").groupBy("status")`
- **Lines 613-617**: `db("agent_results").select("agent_type").count(...).whereNot("status", "archived").groupBy("agent_type")`
- **Lines 620-627**: `db("agent_results").where("created_at", ">=", sevenDaysAgo).whereNot("status", "archived").count(...)`
- **Lines 630-638**: In-memory aggregation logic

### Dependencies
```typescript
import express, { Request, Response } from "express";
import { db } from "../../database/connection";
```

### Current Model (AgentResultModel)

**Available Methods**:
- ✅ `findById(id)` - Lines 31-36
- ✅ `create(data)` - Lines 64-69
- ✅ `updateById(id, data)` - Lines 71-77
- ✅ `archive(id)` - Lines 79-84
- ✅ `deleteById(id)` - Lines 86-91
- ✅ `listAdmin(filters, pagination)` - Lines 93-120 (supports domain, agent_type, status, exclude_status, date_from, date_to)
- ✅ `listDomains()` - Lines 122-125
- ✅ `listAgentTypes()` - Lines 127-132

**Missing Methods**:
- ❌ `findByIdWithJsonParsing(id)` - Need to select and parse agent_input/agent_output
- ❌ `unarchive(id)` - Restore archived status
- ❌ `bulkArchive(ids[])` - Bulk archive
- ❌ `bulkUnarchive(ids[])` - Bulk unarchive
- ❌ `bulkDelete(ids[])` - Bulk delete
- ❌ `getSummaryStats()` - Statistics aggregation
- ❌ Model doesn't handle `agent_input`/`agent_output` JSON fields

**Note**: Model interface `IAgentResult` doesn't include `agent_input` and `agent_output` fields that are actually in the database and used by endpoint 4.

---

## 2. Target Architecture

### Controller Structure

```
src/controllers/admin-agent-outputs/
├── AdminAgentOutputsController.ts        # Main controller class
├── feature-services/
│   ├── AgentOutputListService.ts         # List with pagination
│   ├── AgentOutputArchiveService.ts      # Archive/unarchive logic
│   ├── AgentOutputDeleteService.ts       # Delete logic
│   ├── AgentOutputStatsService.ts        # Statistics aggregation
│   └── AgentOutputBulkService.ts         # Bulk operations
└── feature-utils/
    ├── buildAgentOutputFilters.ts        # Filter building utility
    ├── parseAgentJsonFields.ts           # JSON parsing utility
    └── validateBulkIds.ts                # Bulk ID validation utility
```

### Controller Class Methods

```typescript
class AdminAgentOutputsController {
  // List & Filters
  async listOutputs(req, res)              // GET /
  async getDomains(req, res)               // GET /domains
  async getAgentTypes(req, res)            // GET /agent-types

  // Single Resource
  async getOutputById(req, res)            // GET /:id
  async archiveOutput(req, res)            // PATCH /:id/archive
  async unarchiveOutput(req, res)          // PATCH /:id/unarchive
  async deleteOutput(req, res)             // DELETE /:id

  // Bulk Operations
  async bulkArchive(req, res)              // POST /bulk/archive
  async bulkUnarchive(req, res)            // POST /bulk/unarchive
  async bulkDelete(req, res)               // POST /bulk/delete

  // Statistics
  async getSummaryStats(req, res)          // GET /stats/summary
}
```

---

## 3. Detailed Endpoint Mapping

### Endpoint 1: List Outputs (GET `/`)

**Current**: Lines 29-161 (133 LOC)

**Refactored Flow**:
```
Route → Controller.listOutputs()
          → AgentOutputListService.list(filters, pagination)
              → buildAgentOutputFilters(queryParams) [util]
              → AgentResultModel.listAdmin(filters, pagination)
          → Response formatting
```

**Service**: `AgentOutputListService.list()`
- Input: query params (domain, agent_type, status, date_from, date_to, page, limit)
- Output: `{ data: IAgentResult[], pagination: { page, limit, total, totalPages } }`
- Logic:
  - Parse pagination params
  - Build filters using `buildAgentOutputFilters` util
  - Call `AgentResultModel.listAdmin(filters, pagination)`
  - Return formatted response

**Util**: `buildAgentOutputFilters(queryParams)`
- Handles status logic: default excludes archived unless status=archived or status=all
- Handles "all" special case for agent_type
- Converts date strings to Date objects
- Returns `AgentResultFilters` object

**Model**: Already exists - `AgentResultModel.listAdmin()`
- ✅ No changes needed - already supports all filters

**LOC Reduction**: 133 → ~25 (controller) + ~40 (service) + ~20 (util) = 85 LOC (48 LOC reduction)

---

### Endpoint 2: Get Domains (GET `/domains`)

**Current**: Lines 169-198 (30 LOC)

**Refactored Flow**:
```
Route → Controller.getDomains()
          → AgentResultModel.listDomains()
          → Filter out "SYSTEM" in controller
          → Response formatting
```

**Controller**: `getDomains()`
- Call `AgentResultModel.listDomains()`
- Filter out "SYSTEM" and null values
- Return response

**Model Enhancement**: `AgentResultModel.listDomains()`
- **Current**: Returns all domains
- **Proposed**: Add optional `excludeValues` parameter
  ```typescript
  static async listDomains(excludeValues?: string[], trx?: QueryContext): Promise<string[]>
  ```
- This eliminates need for in-memory filtering

**LOC Reduction**: 30 → ~15 (controller) = 15 LOC reduction

---

### Endpoint 3: Get Agent Types (GET `/agent-types`)

**Current**: Lines 206-233 (28 LOC)

**Refactored Flow**:
```
Route → Controller.getAgentTypes()
          → AgentResultModel.listAgentTypes()
          → Response formatting
```

**Controller**: `getAgentTypes()`
- Call `AgentResultModel.listAgentTypes()`
- Return response

**Model**: Already exists - `AgentResultModel.listAgentTypes()`
- ✅ No changes needed

**LOC Reduction**: 28 → ~10 (controller) = 18 LOC reduction

---

### Endpoint 4: Get Output by ID (GET `/:id`)

**Current**: Lines 241-299 (59 LOC)

**Refactored Flow**:
```
Route → Controller.getOutputById()
          → AgentResultModel.findByIdWithDetails(id)
              → [Includes agent_input/agent_output fields]
              → Auto-parses JSON fields via BaseModel
          → Response formatting
```

**Controller**: `getOutputById()`
- Parse and validate ID param
- Call `AgentResultModel.findByIdWithDetails(id)`
- Handle 404
- Return response

**Model Enhancement**: New method needed
```typescript
static async findByIdWithDetails(
  id: number,
  trx?: QueryContext
): Promise<IAgentResultWithDetails | undefined>
```

**Interface Enhancement**: Extend interface
```typescript
export interface IAgentResultWithDetails extends IAgentResult {
  agent_input: Record<string, unknown> | null;
  agent_output: Record<string, unknown> | null;
}
```

**Model Changes**:
1. Add `agent_input` and `agent_output` to `jsonFields` array
2. New method `findByIdWithDetails` that selects all columns including JSON fields
3. BaseModel will auto-deserialize JSON fields

**Util**: Remove manual JSON parsing (lines 258-279) - handled by model

**LOC Reduction**: 59 → ~20 (controller) + ~10 (model method) = 30 LOC (29 LOC reduction)

---

### Endpoint 5: Archive Output (PATCH `/:id/archive`)

**Current**: Lines 307-354 (48 LOC)

**Refactored Flow**:
```
Route → Controller.archiveOutput()
          → AgentOutputArchiveService.archiveSingle(id)
              → AgentResultModel.findById(id)
              → Validate not already archived
              → AgentResultModel.archive(id)
          → Response formatting
```

**Service**: `AgentOutputArchiveService.archiveSingle(id)`
- Check if output exists
- Check if already archived (return error if true)
- Call `AgentResultModel.archive(id)`
- Return success

**Controller**: `archiveOutput()`
- Parse ID param
- Call service
- Handle errors (404, already archived)
- Return response

**Model**: Already exists - `AgentResultModel.archive(id)`
- ✅ No changes needed

**LOC Reduction**: 48 → ~15 (controller) + ~20 (service) = 35 LOC (13 LOC reduction)

---

### Endpoint 6: Unarchive Output (PATCH `/:id/unarchive`)

**Current**: Lines 362-409 (48 LOC)

**Refactored Flow**:
```
Route → Controller.unarchiveOutput()
          → AgentOutputArchiveService.unarchiveSingle(id)
              → AgentResultModel.findById(id)
              → Validate is archived
              → AgentResultModel.unarchive(id)
          → Response formatting
```

**Service**: `AgentOutputArchiveService.unarchiveSingle(id)`
- Check if output exists
- Check if actually archived (return error if not)
- Call `AgentResultModel.unarchive(id)` (new method)
- Return success

**Controller**: `unarchiveOutput()`
- Parse ID param
- Call service
- Handle errors (404, not archived)
- Return response

**Model Enhancement**: New method needed
```typescript
static async unarchive(id: number, trx?: QueryContext): Promise<number> {
  return super.updateById(id, { status: "success" }, trx);
}
```

**LOC Reduction**: 48 → ~15 (controller) + ~20 (service) + ~3 (model method) = 38 LOC (10 LOC reduction)

---

### Endpoint 7: Bulk Archive (POST `/bulk/archive`)

**Current**: Lines 418-457 (40 LOC)

**Refactored Flow**:
```
Route → Controller.bulkArchive()
          → validateBulkIds(req.body.ids) [util]
          → AgentOutputBulkService.bulkArchive(ids)
              → AgentResultModel.bulkArchive(ids)
          → Response formatting
```

**Service**: `AgentOutputBulkService.bulkArchive(ids)`
- Call `AgentResultModel.bulkArchive(ids)`
- Return count of updated records

**Controller**: `bulkArchive()`
- Validate input using util
- Call service
- Return response with count

**Util**: `validateBulkIds(ids)`
- Check if array
- Check if not empty
- Return validation result

**Model Enhancement**: New method needed
```typescript
static async bulkArchive(ids: number[], trx?: QueryContext): Promise<number> {
  return this.table(trx)
    .whereIn("id", ids)
    .whereNot("status", "archived")
    .update({
      status: "archived",
      updated_at: new Date(),
    });
}
```

**LOC Reduction**: 40 → ~15 (controller) + ~10 (service) + ~10 (util) + ~8 (model) = 43 LOC (-3 LOC, but better organized)

---

### Endpoint 8: Bulk Unarchive (POST `/bulk/unarchive`)

**Current**: Lines 466-507 (42 LOC)

**Refactored Flow**:
```
Route → Controller.bulkUnarchive()
          → validateBulkIds(req.body.ids) [util]
          → AgentOutputBulkService.bulkUnarchive(ids)
              → AgentResultModel.bulkUnarchive(ids)
          → Response formatting
```

**Service**: `AgentOutputBulkService.bulkUnarchive(ids)`
- Call `AgentResultModel.bulkUnarchive(ids)`
- Return count of updated records

**Controller**: `bulkUnarchive()`
- Validate input using util
- Call service
- Return response with count

**Util**: Reuse `validateBulkIds(ids)` from endpoint 7

**Model Enhancement**: New method needed
```typescript
static async bulkUnarchive(ids: number[], trx?: QueryContext): Promise<number> {
  return this.table(trx)
    .whereIn("id", ids)
    .where("status", "archived")
    .update({
      status: "success",
      updated_at: new Date(),
    });
}
```

**LOC Reduction**: 42 → ~15 (controller) + ~10 (service) + ~8 (model) = 33 LOC (9 LOC reduction)

---

### Endpoint 9: Delete Output (DELETE `/:id`)

**Current**: Lines 515-550 (36 LOC)

**Refactored Flow**:
```
Route → Controller.deleteOutput()
          → AgentOutputDeleteService.deleteSingle(id)
              → AgentResultModel.findById(id)
              → Validate exists
              → AgentResultModel.deleteById(id)
          → Response formatting
```

**Service**: `AgentOutputDeleteService.deleteSingle(id)`
- Check if output exists
- Call `AgentResultModel.deleteById(id)`
- Return success

**Controller**: `deleteOutput()`
- Parse ID param
- Call service
- Handle errors (404)
- Return response

**Model**: Already exists - `AgentResultModel.deleteById(id)`
- ✅ No changes needed

**LOC Reduction**: 36 → ~15 (controller) + ~15 (service) = 30 LOC (6 LOC reduction)

---

### Endpoint 10: Bulk Delete (POST `/bulk/delete`)

**Current**: Lines 559-594 (36 LOC)

**Refactored Flow**:
```
Route → Controller.bulkDelete()
          → validateBulkIds(req.body.ids) [util]
          → AgentOutputBulkService.bulkDelete(ids)
              → AgentResultModel.bulkDelete(ids)
          → Response formatting
```

**Service**: `AgentOutputBulkService.bulkDelete(ids)`
- Call `AgentResultModel.bulkDelete(ids)`
- Return count of deleted records

**Controller**: `bulkDelete()`
- Validate input using util
- Call service
- Return response with count

**Util**: Reuse `validateBulkIds(ids)` from endpoint 7

**Model Enhancement**: New method needed
```typescript
static async bulkDelete(ids: number[], trx?: QueryContext): Promise<number> {
  return this.table(trx).whereIn("id", ids).del();
}
```

**LOC Reduction**: 36 → ~15 (controller) + ~10 (service) + ~5 (model) = 30 LOC (6 LOC reduction)

---

### Endpoint 11: Summary Stats (GET `/stats/summary`)

**Current**: Lines 602-659 (58 LOC)

**Refactored Flow**:
```
Route → Controller.getSummaryStats()
          → AgentOutputStatsService.getSummary()
              → AgentResultModel.getStatsByStatus()
              → AgentResultModel.getStatsByAgentType()
              → AgentResultModel.getRecentCount(days)
          → Response formatting
```

**Service**: `AgentOutputStatsService.getSummary()`
- Call three model methods for different stats
- Aggregate results
- Calculate total
- Return formatted stats object

**Controller**: `getSummaryStats()`
- Call service
- Return response

**Model Enhancement**: Three new methods needed

```typescript
static async getStatsByStatus(trx?: QueryContext): Promise<Record<string, number>> {
  const rows = await this.table(trx)
    .select("status")
    .count("* as count")
    .groupBy("status");

  const result: Record<string, number> = {};
  rows.forEach((row: any) => {
    result[row.status] = parseInt(row.count, 10);
  });
  return result;
}

static async getStatsByAgentType(excludeArchived = true, trx?: QueryContext): Promise<Record<string, number>> {
  let query = this.table(trx)
    .select("agent_type")
    .count("* as count")
    .groupBy("agent_type");

  if (excludeArchived) {
    query = query.whereNot("status", "archived");
  }

  const rows = await query;
  const result: Record<string, number> = {};
  rows.forEach((row: any) => {
    result[row.agent_type] = parseInt(row.count, 10);
  });
  return result;
}

static async getRecentCount(days: number, excludeArchived = true, trx?: QueryContext): Promise<number> {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);

  let query = this.table(trx)
    .where("created_at", ">=", dateThreshold)
    .count("* as count");

  if (excludeArchived) {
    query = query.whereNot("status", "archived");
  }

  const result = await query.first();
  return parseInt((result as any)?.count || "0", 10);
}
```

**LOC Reduction**: 58 → ~10 (controller) + ~20 (service) + ~45 (model methods) = 75 LOC (-17 LOC, but better organized with reusable model methods)

---

## 4. Step-by-Step Migration Plan

### Phase 1: Model Enhancement (No Breaking Changes)

**Step 1.1**: Update `IAgentResult` interface
- Add `agent_input` and `agent_output` fields
```typescript
export interface IAgentResult {
  id: number;
  google_account_id: number;
  domain: string;
  agent_type: string;
  date_start: string | null;
  date_end: string | null;
  data: Record<string, unknown> | null;
  agent_input: Record<string, unknown> | null;   // NEW
  agent_output: Record<string, unknown> | null;  // NEW
  status: "success" | "pending" | "error" | "archived";
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}
```

**Step 1.2**: Update `AgentResultModel` JSON fields
```typescript
protected static jsonFields = ["data", "agent_input", "agent_output"];
```

**Step 1.3**: Add new model methods (one at a time, test each)
1. `findByIdWithDetails(id)` - For full output with JSON fields
2. `unarchive(id)` - For restore functionality
3. `bulkArchive(ids[])` - For bulk archive
4. `bulkUnarchive(ids[])` - For bulk unarchive
5. `bulkDelete(ids[])` - For bulk delete
6. `getStatsByStatus()` - For statistics
7. `getStatsByAgentType(excludeArchived?)` - For statistics
8. `getRecentCount(days, excludeArchived?)` - For statistics

**Step 1.4**: Enhance `listDomains()` method (optional)
```typescript
static async listDomains(
  excludeValues?: string[],
  trx?: QueryContext
): Promise<string[]> {
  let query = this.table(trx).distinct("domain").orderBy("domain");

  if (excludeValues && excludeValues.length > 0) {
    query = query.whereNotIn("domain", excludeValues);
  }

  const rows = await query.whereNotNull("domain");
  return rows.map((row: { domain: string }) => row.domain);
}
```

**Testing**: Write unit tests for each new model method before proceeding.

---

### Phase 2: Create Utilities (Foundation)

**Step 2.1**: Create `feature-utils/buildAgentOutputFilters.ts`
```typescript
export interface AgentOutputQueryParams {
  domain?: string;
  agent_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export function buildAgentOutputFilters(
  queryParams: AgentOutputQueryParams
): AgentResultFilters {
  const filters: AgentResultFilters = {};

  // Domain filter
  if (queryParams.domain) {
    filters.domain = queryParams.domain;
  }

  // Agent type filter (skip "all")
  if (queryParams.agent_type && queryParams.agent_type !== "all") {
    filters.agent_type = queryParams.agent_type;
  }

  // Status filter logic
  if (queryParams.status && queryParams.status !== "all") {
    filters.status = queryParams.status;
  } else if (!queryParams.status || queryParams.status !== "all") {
    // Default: exclude archived
    filters.exclude_status = "archived";
  }

  // Date filters
  if (queryParams.date_from) {
    filters.date_from = new Date(queryParams.date_from).toISOString();
  }

  if (queryParams.date_to) {
    filters.date_to = new Date(queryParams.date_to).toISOString();
  }

  return filters;
}
```

**Step 2.2**: Create `feature-utils/validateBulkIds.ts`
```typescript
export interface BulkIdsValidation {
  valid: boolean;
  error?: string;
  ids?: number[];
}

export function validateBulkIds(
  requestBody: any
): BulkIdsValidation {
  const { ids } = requestBody;

  if (!ids) {
    return {
      valid: false,
      error: "Must provide an array of output IDs",
    };
  }

  if (!Array.isArray(ids)) {
    return {
      valid: false,
      error: "IDs must be an array",
    };
  }

  if (ids.length === 0) {
    return {
      valid: false,
      error: "IDs array cannot be empty",
    };
  }

  return {
    valid: true,
    ids,
  };
}
```

**Testing**: Write unit tests for utilities.

---

### Phase 3: Create Services (Business Logic Layer)

**Step 3.1**: Create `feature-services/AgentOutputListService.ts`
```typescript
import { AgentResultModel, IAgentResult, PaginationParams } from "../../../models";
import { buildAgentOutputFilters, AgentOutputQueryParams } from "../feature-utils/buildAgentOutputFilters";

export interface ListAgentOutputsParams extends AgentOutputQueryParams {
  page?: string;
  limit?: string;
}

export interface ListAgentOutputsResult {
  data: IAgentResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class AgentOutputListService {
  static async list(params: ListAgentOutputsParams): Promise<ListAgentOutputsResult> {
    // Parse pagination
    const page = parseInt(params.page || "1", 10);
    const limit = parseInt(params.limit || "50", 10);

    // Build filters
    const filters = buildAgentOutputFilters(params);

    // Call model
    const result = await AgentResultModel.listAdmin(
      filters,
      { page, limit }
    );

    return {
      data: result.data,
      pagination: result.pagination,
    };
  }
}
```

**Step 3.2**: Create `feature-services/AgentOutputArchiveService.ts`
```typescript
import { AgentResultModel } from "../../../models";

export class AgentOutputArchiveService {
  static async archiveSingle(id: number): Promise<void> {
    const output = await AgentResultModel.findById(id);

    if (!output) {
      throw new Error("NOT_FOUND:Agent output not found");
    }

    if (output.status === "archived") {
      throw new Error("ALREADY_ARCHIVED:Agent output is already archived");
    }

    await AgentResultModel.archive(id);
  }

  static async unarchiveSingle(id: number): Promise<void> {
    const output = await AgentResultModel.findById(id);

    if (!output) {
      throw new Error("NOT_FOUND:Agent output not found");
    }

    if (output.status !== "archived") {
      throw new Error("NOT_ARCHIVED:Agent output is not archived");
    }

    await AgentResultModel.unarchive(id);
  }
}
```

**Step 3.3**: Create `feature-services/AgentOutputDeleteService.ts`
```typescript
import { AgentResultModel } from "../../../models";

export class AgentOutputDeleteService {
  static async deleteSingle(id: number): Promise<void> {
    const output = await AgentResultModel.findById(id);

    if (!output) {
      throw new Error("NOT_FOUND:Agent output not found");
    }

    await AgentResultModel.deleteById(id);
  }
}
```

**Step 3.4**: Create `feature-services/AgentOutputBulkService.ts`
```typescript
import { AgentResultModel } from "../../../models";

export class AgentOutputBulkService {
  static async bulkArchive(ids: number[]): Promise<number> {
    return AgentResultModel.bulkArchive(ids);
  }

  static async bulkUnarchive(ids: number[]): Promise<number> {
    return AgentResultModel.bulkUnarchive(ids);
  }

  static async bulkDelete(ids: number[]): Promise<number> {
    return AgentResultModel.bulkDelete(ids);
  }
}
```

**Step 3.5**: Create `feature-services/AgentOutputStatsService.ts`
```typescript
import { AgentResultModel } from "../../../models";

export interface AgentOutputStats {
  byStatus: Record<string, number>;
  byAgentType: Record<string, number>;
  recentCount: number;
  total: number;
}

export class AgentOutputStatsService {
  static async getSummary(): Promise<AgentOutputStats> {
    const [byStatus, byAgentType, recentCount] = await Promise.all([
      AgentResultModel.getStatsByStatus(),
      AgentResultModel.getStatsByAgentType(true),
      AgentResultModel.getRecentCount(7, true),
    ]);

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      byStatus,
      byAgentType,
      recentCount,
      total,
    };
  }
}
```

**Testing**: Write unit tests for each service class.

---

### Phase 4: Create Controller

**Step 4.1**: Create `controllers/admin-agent-outputs/AdminAgentOutputsController.ts`

```typescript
import { Request, Response } from "express";
import { AgentResultModel } from "../../models";
import { AgentOutputListService } from "./feature-services/AgentOutputListService";
import { AgentOutputArchiveService } from "./feature-services/AgentOutputArchiveService";
import { AgentOutputDeleteService } from "./feature-services/AgentOutputDeleteService";
import { AgentOutputBulkService } from "./feature-services/AgentOutputBulkService";
import { AgentOutputStatsService } from "./feature-services/AgentOutputStatsService";
import { validateBulkIds } from "./feature-utils/validateBulkIds";

export class AdminAgentOutputsController {
  // ===================================================================
  // List & Filters
  // ===================================================================

  async listOutputs(req: Request, res: Response): Promise<void> {
    try {
      console.log("[Admin Agent Outputs] Fetching with filters:", req.query);

      const result = await AgentOutputListService.list(req.query);

      console.log(
        `[Admin Agent Outputs] Found ${result.data.length} of ${result.pagination.total} outputs (page ${result.pagination.page})`
      );

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error fetching outputs:", error);
      res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch agent outputs",
      });
    }
  }

  async getDomains(_req: Request, res: Response): Promise<void> {
    try {
      console.log("[Admin Agent Outputs] Fetching unique domains");

      const domains = await AgentResultModel.listDomains(["SYSTEM"]);

      console.log(`[Admin Agent Outputs] Found ${domains.length} unique domains`);

      res.json({
        success: true,
        domains,
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error fetching domains:", error);
      res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch domains",
      });
    }
  }

  async getAgentTypes(_req: Request, res: Response): Promise<void> {
    try {
      console.log("[Admin Agent Outputs] Fetching unique agent types");

      const agentTypes = await AgentResultModel.listAgentTypes();

      console.log(`[Admin Agent Outputs] Found ${agentTypes.length} unique agent types`);

      res.json({
        success: true,
        agentTypes,
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error fetching agent types:", error);
      res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch agent types",
      });
    }
  }

  // ===================================================================
  // Single Resource
  // ===================================================================

  async getOutputById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      console.log(`[Admin Agent Outputs] Fetching output ID: ${id}`);

      const output = await AgentResultModel.findByIdWithDetails(parseInt(id, 10));

      if (!output) {
        res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "Agent output not found",
        });
        return;
      }

      console.log(`[Admin Agent Outputs] Found output ID: ${id}`);

      res.json({
        success: true,
        data: output,
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error fetching output:", error);
      res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch agent output",
      });
    }
  }

  async archiveOutput(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const idNum = parseInt(id, 10);

      console.log(`[Admin Agent Outputs] Archiving output ID: ${id}`);

      await AgentOutputArchiveService.archiveSingle(idNum);

      console.log(`[Admin Agent Outputs] ✓ Archived output ID: ${id}`);

      res.json({
        success: true,
        message: "Agent output archived successfully",
        data: { id: idNum, status: "archived" },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error archiving output:", error);

      if (error.message.startsWith("NOT_FOUND:")) {
        res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: error.message.replace("NOT_FOUND:", ""),
        });
        return;
      }

      if (error.message.startsWith("ALREADY_ARCHIVED:")) {
        res.status(400).json({
          success: false,
          error: "ALREADY_ARCHIVED",
          message: error.message.replace("ALREADY_ARCHIVED:", ""),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "ARCHIVE_ERROR",
        message: error?.message || "Failed to archive agent output",
      });
    }
  }

  async unarchiveOutput(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const idNum = parseInt(id, 10);

      console.log(`[Admin Agent Outputs] Unarchiving output ID: ${id}`);

      await AgentOutputArchiveService.unarchiveSingle(idNum);

      console.log(`[Admin Agent Outputs] ✓ Unarchived output ID: ${id}`);

      res.json({
        success: true,
        message: "Agent output restored successfully",
        data: { id: idNum, status: "success" },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error unarchiving output:", error);

      if (error.message.startsWith("NOT_FOUND:")) {
        res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: error.message.replace("NOT_FOUND:", ""),
        });
        return;
      }

      if (error.message.startsWith("NOT_ARCHIVED:")) {
        res.status(400).json({
          success: false,
          error: "NOT_ARCHIVED",
          message: error.message.replace("NOT_ARCHIVED:", ""),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "UNARCHIVE_ERROR",
        message: error?.message || "Failed to unarchive agent output",
      });
    }
  }

  async deleteOutput(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const idNum = parseInt(id, 10);

      console.log(`[Admin Agent Outputs] Deleting output ID: ${id}`);

      await AgentOutputDeleteService.deleteSingle(idNum);

      console.log(`[Admin Agent Outputs] ✓ Permanently deleted output ID: ${id}`);

      res.json({
        success: true,
        message: "Agent output permanently deleted",
        data: { id: idNum },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error deleting output:", error);

      if (error.message.startsWith("NOT_FOUND:")) {
        res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: error.message.replace("NOT_FOUND:", ""),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "DELETE_ERROR",
        message: error?.message || "Failed to delete agent output",
      });
    }
  }

  // ===================================================================
  // Bulk Operations
  // ===================================================================

  async bulkArchive(req: Request, res: Response): Promise<void> {
    try {
      const validation = validateBulkIds(req.body);

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: validation.error,
        });
        return;
      }

      console.log(`[Admin Agent Outputs] Bulk archiving ${validation.ids!.length} output(s)`);

      const updated = await AgentOutputBulkService.bulkArchive(validation.ids!);

      console.log(`[Admin Agent Outputs] ✓ Archived ${updated} output(s)`);

      res.json({
        success: true,
        message: `${updated} output(s) archived successfully`,
        data: { archived: updated },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error bulk archiving:", error);
      res.status(500).json({
        success: false,
        error: "BULK_ARCHIVE_ERROR",
        message: error?.message || "Failed to bulk archive outputs",
      });
    }
  }

  async bulkUnarchive(req: Request, res: Response): Promise<void> {
    try {
      const validation = validateBulkIds(req.body);

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: validation.error,
        });
        return;
      }

      console.log(`[Admin Agent Outputs] Bulk unarchiving ${validation.ids!.length} output(s)`);

      const updated = await AgentOutputBulkService.bulkUnarchive(validation.ids!);

      console.log(`[Admin Agent Outputs] ✓ Unarchived ${updated} output(s)`);

      res.json({
        success: true,
        message: `${updated} output(s) restored successfully`,
        data: { unarchived: updated },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error bulk unarchiving:", error);
      res.status(500).json({
        success: false,
        error: "BULK_UNARCHIVE_ERROR",
        message: error?.message || "Failed to bulk unarchive outputs",
      });
    }
  }

  async bulkDelete(req: Request, res: Response): Promise<void> {
    try {
      const validation = validateBulkIds(req.body);

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: validation.error,
        });
        return;
      }

      console.log(`[Admin Agent Outputs] Bulk deleting ${validation.ids!.length} output(s)`);

      const deleted = await AgentOutputBulkService.bulkDelete(validation.ids!);

      console.log(`[Admin Agent Outputs] ✓ Permanently deleted ${deleted} output(s)`);

      res.json({
        success: true,
        message: `${deleted} output(s) permanently deleted`,
        data: { deleted },
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error bulk deleting:", error);
      res.status(500).json({
        success: false,
        error: "BULK_DELETE_ERROR",
        message: error?.message || "Failed to bulk delete outputs",
      });
    }
  }

  // ===================================================================
  // Statistics
  // ===================================================================

  async getSummaryStats(_req: Request, res: Response): Promise<void> {
    try {
      console.log("[Admin Agent Outputs] Fetching summary statistics");

      const stats = await AgentOutputStatsService.getSummary();

      console.log("[Admin Agent Outputs] ✓ Summary statistics fetched");

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("[Admin Agent Outputs] Error fetching stats:", error);
      res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch statistics",
      });
    }
  }
}
```

**Testing**: Write integration tests for controller methods.

---

### Phase 5: Update Route File

**Step 5.1**: Refactor `/routes/admin/agentOutputs.ts`

```typescript
import express from "express";
import { AdminAgentOutputsController } from "../../controllers/admin-agent-outputs/AdminAgentOutputsController";

const router = express.Router();
const controller = new AdminAgentOutputsController();

// List & Filters
router.get("/", (req, res) => controller.listOutputs(req, res));
router.get("/domains", (req, res) => controller.getDomains(req, res));
router.get("/agent-types", (req, res) => controller.getAgentTypes(req, res));

// Statistics (before /:id to avoid route conflict)
router.get("/stats/summary", (req, res) => controller.getSummaryStats(req, res));

// Single Resource
router.get("/:id", (req, res) => controller.getOutputById(req, res));
router.patch("/:id/archive", (req, res) => controller.archiveOutput(req, res));
router.patch("/:id/unarchive", (req, res) => controller.unarchiveOutput(req, res));
router.delete("/:id", (req, res) => controller.deleteOutput(req, res));

// Bulk Operations
router.post("/bulk/archive", (req, res) => controller.bulkArchive(req, res));
router.post("/bulk/unarchive", (req, res) => controller.bulkUnarchive(req, res));
router.post("/bulk/delete", (req, res) => controller.bulkDelete(req, res));

export default router;
```

**LOC**: ~40 lines (down from 665 lines)

---

### Phase 6: Testing & Validation

**Step 6.1**: Run all existing tests
- Ensure no regressions

**Step 6.2**: Test each endpoint manually
- Verify pagination still works
- Verify filtering logic (especially status defaults)
- Verify archive/unarchive behavior
- Verify bulk operations
- Verify statistics aggregation

**Step 6.3**: Validate error handling
- Test 404 responses
- Test validation errors (bulk IDs)
- Test already archived scenarios

**Step 6.4**: Performance validation
- Compare query counts before/after
- Ensure no N+1 queries introduced

---

## 5. Model Replacement Summary

### Existing Model Methods (No Changes)
- ✅ `findById(id)` - Already perfect
- ✅ `create(data)` - Already perfect
- ✅ `updateById(id, data)` - Already perfect
- ✅ `archive(id)` - Already perfect
- ✅ `deleteById(id)` - Already perfect
- ✅ `listAdmin(filters, pagination)` - Already perfect
- ✅ `listDomains()` - Working, optional enhancement for excludeValues
- ✅ `listAgentTypes()` - Already perfect

### New Model Methods Required

| Method | Purpose | Lines | Complexity |
|--------|---------|-------|------------|
| `findByIdWithDetails(id)` | Get output with agent_input/output | ~10 | Low |
| `unarchive(id)` | Restore archived output to success | ~3 | Low |
| `bulkArchive(ids[])` | Archive multiple outputs | ~8 | Low |
| `bulkUnarchive(ids[])` | Unarchive multiple outputs | ~8 | Low |
| `bulkDelete(ids[])` | Delete multiple outputs | ~5 | Low |
| `getStatsByStatus()` | Aggregate by status | ~15 | Medium |
| `getStatsByAgentType(excludeArchived?)` | Aggregate by agent type | ~18 | Medium |
| `getRecentCount(days, excludeArchived?)` | Count recent records | ~15 | Medium |

**Total New Model Code**: ~82 lines

### Interface Changes
```typescript
// Add to IAgentResult
agent_input: Record<string, unknown> | null;
agent_output: Record<string, unknown> | null;

// Update jsonFields in model class
protected static jsonFields = ["data", "agent_input", "agent_output"];
```

---

## 6. Files to Create

```
src/controllers/admin-agent-outputs/
├── AdminAgentOutputsController.ts                   (~400 LOC)
├── feature-services/
│   ├── AgentOutputListService.ts                    (~40 LOC)
│   ├── AgentOutputArchiveService.ts                 (~40 LOC)
│   ├── AgentOutputDeleteService.ts                  (~20 LOC)
│   ├── AgentOutputBulkService.ts                    (~25 LOC)
│   └── AgentOutputStatsService.ts                   (~30 LOC)
└── feature-utils/
    ├── buildAgentOutputFilters.ts                   (~45 LOC)
    └── validateBulkIds.ts                           (~30 LOC)
```

**Total New Files**: 8
**Total New LOC**: ~630 lines (vs. 665 original, but much more maintainable)

---

## 7. Files to Modify

### File 1: `src/models/AgentResultModel.ts`
**Changes**:
1. Add `agent_input` and `agent_output` to `IAgentResult` interface (2 lines)
2. Update `jsonFields` array (1 line)
3. Add 8 new model methods (~82 lines total)
4. Optional: Enhance `listDomains()` with excludeValues parameter (~10 lines)

**Total additions**: ~95 lines

---

### File 2: `src/routes/admin/agentOutputs.ts`
**Changes**: Complete rewrite

**Before**: 665 lines
**After**: ~40 lines (96% reduction)

**Content**:
- Import controller
- Define 11 routes mapped to controller methods
- Export router

---

## 8. Risk Assessment

### 8.1 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| JSON field parsing breaks | Medium | Low | BaseModel handles JSON deserialization automatically; test with real data |
| Filter logic changes behavior | High | Low | buildAgentOutputFilters util must replicate exact logic; comprehensive testing required |
| Pagination breaks | Medium | Low | Using existing model method; existing tests should catch |
| Bulk operations missing edge cases | Medium | Medium | Add tests for empty arrays, invalid IDs, mixed archived/unarchived states |
| Statistics aggregation incorrect | Medium | Low | Test against current endpoint output; compare counts manually |
| Route ordering causes conflicts | Low | Low | Stats route placed before /:id to avoid conflict |
| Performance regression | Low | Low | Using same queries, just organized differently; validate with timing tests |

### 8.2 Operational Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Breaking changes to API | Critical | Very Low | API interface unchanged; internal refactor only |
| Missing error cases | Medium | Low | Controller replicates all existing error handling |
| Logging changes | Low | Low | All console.log statements preserved |
| Transaction handling | Low | Very Low | No transactions in original code; none needed in refactor |

### 8.3 Code Quality Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Service layer too thin | Low | Medium | Acceptable for simple CRUD operations; consolidates validation |
| Util functions over-engineered | Low | Low | Utils are simple transformation/validation functions |
| Controller too large | Medium | Low | Controller is ~400 LOC but well-organized; alternative would be split by feature area |
| Duplicate validation logic | Low | Low | Shared validateBulkIds util prevents duplication |

### 8.4 Business Continuity Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Admin can't manage agent outputs | Critical | Very Low | Phased migration with testing at each step |
| Data loss from bulk operations | High | Very Low | Bulk operations unchanged; existing safeguards maintained |
| Filter combinations break | Medium | Low | Test common filter combinations thoroughly |
| Archive state confusion | Medium | Low | Archive/unarchive logic clearly separated in service |

### 8.5 Blast Radius

**Affected Systems**:
- Admin agent outputs UI (if any)
- Any internal tools consuming this API
- Monitoring/logging systems (log format unchanged)

**Unaffected Systems**:
- User-facing features
- Agent execution pipelines
- Other admin routes
- Database schema

**Rollback Strategy**:
- Keep original route file as `.backup`
- Feature flag for new controller (if deployment risk is high)
- Database queries are identical, so rollback is safe

---

## 9. Code Quality Improvements

### 9.1 Separation of Concerns
**Before**: All logic in route handlers
**After**: Clear layers
- Routes: Define endpoints only
- Controller: Request/response handling, error formatting
- Services: Business logic, validation
- Utils: Shared transformation functions
- Model: Data access, query building

### 9.2 Reusability
**Before**: Duplicate filter logic in two places (count + data query)
**After**: Single `buildAgentOutputFilters` util used everywhere

**Before**: Duplicate bulk validation in 3 endpoints
**After**: Single `validateBulkIds` util shared across all bulk operations

**Before**: JSON parsing logic in route handler
**After**: Model handles JSON fields automatically

### 9.3 Testability
**Before**: Route integration tests only
**After**:
- Unit tests for model methods
- Unit tests for utilities
- Unit tests for services
- Integration tests for controller
- E2E tests for routes

### 9.4 Maintainability
**Before**: 665-line route file, hard to navigate
**After**:
- 40-line route file (easy to see all endpoints)
- Controller with clear method names
- Services organized by feature area
- Easy to add new endpoints or modify logic

### 9.5 Error Handling
**Before**: Error handling mixed with business logic
**After**:
- Services throw structured errors
- Controller catches and formats for API response
- Clear error type prefixes (NOT_FOUND:, ALREADY_ARCHIVED:)

### 9.6 Performance
**Before**: Duplicate query building
**After**: Single query builder utility

**No Regressions**: All queries remain identical in structure

---

## 10. Future Enhancements (Post-Refactor)

### 10.1 Easy Additions After Refactor
1. **Export functionality** - Add export service for CSV/JSON downloads
2. **Batch update status** - Add bulk status update beyond archive/unarchive
3. **Advanced filters** - Add date range presets, multi-select filters
4. **Soft delete** - Add deleted_at timestamp instead of hard delete
5. **Activity log** - Track who archived/deleted what and when
6. **Search functionality** - Full-text search across agent_input/output

### 10.2 Performance Optimizations
1. **Caching** - Add Redis cache for domains/agent types lists
2. **Indexing** - Add database indexes for common filter combinations
3. **Pagination optimization** - Use cursor-based pagination for large datasets
4. **Statistics caching** - Cache stats for 5 minutes to reduce query load

### 10.3 Testing Enhancements
1. **Load testing** - Test bulk operations with 1000+ IDs
2. **Concurrent operations** - Test archive + delete simultaneously
3. **Filter combination testing** - Test all possible filter combinations
4. **Edge case testing** - Test with malformed JSON, null values, etc.

---

## 11. Success Criteria

### 11.1 Functional Requirements
- ✅ All 11 endpoints work identically to current implementation
- ✅ Pagination returns same results
- ✅ Filtering logic unchanged (status defaults, date ranges, etc.)
- ✅ Archive/unarchive behavior identical
- ✅ Bulk operations return correct counts
- ✅ Statistics match current aggregation logic
- ✅ Error responses unchanged (same status codes, error formats)

### 11.2 Code Quality Requirements
- ✅ Route file under 50 lines
- ✅ Controller methods under 50 lines each
- ✅ Service methods under 30 lines each
- ✅ Utility functions under 50 lines each
- ✅ No duplicate logic (filter building, validation)
- ✅ Clear separation of concerns
- ✅ All TypeScript types properly defined

### 11.3 Testing Requirements
- ✅ 100% of existing tests pass
- ✅ New unit tests for all model methods
- ✅ New unit tests for all utilities
- ✅ New unit tests for all services
- ✅ Integration tests for controller methods
- ✅ E2E tests for all 11 endpoints

### 11.4 Performance Requirements
- ✅ No increase in query count per endpoint
- ✅ Response times unchanged or improved
- ✅ No N+1 queries introduced
- ✅ Memory usage unchanged

### 11.5 Documentation Requirements
- ✅ Controller methods have JSDoc comments
- ✅ Service methods have JSDoc comments
- ✅ Utility functions have JSDoc comments
- ✅ Model methods have JSDoc comments
- ✅ README updated with new architecture

---

## 12. Migration Checklist

### Phase 1: Model Enhancement
- [ ] Add agent_input/agent_output to IAgentResult interface
- [ ] Update jsonFields array in AgentResultModel
- [ ] Add findByIdWithDetails() method
- [ ] Add unarchive() method
- [ ] Add bulkArchive() method
- [ ] Add bulkUnarchive() method
- [ ] Add bulkDelete() method
- [ ] Add getStatsByStatus() method
- [ ] Add getStatsByAgentType() method
- [ ] Add getRecentCount() method
- [ ] Write unit tests for new model methods
- [ ] Run all existing model tests

### Phase 2: Create Utilities
- [ ] Create buildAgentOutputFilters.ts
- [ ] Create validateBulkIds.ts
- [ ] Write unit tests for utilities
- [ ] Run utility tests

### Phase 3: Create Services
- [ ] Create AgentOutputListService.ts
- [ ] Create AgentOutputArchiveService.ts
- [ ] Create AgentOutputDeleteService.ts
- [ ] Create AgentOutputBulkService.ts
- [ ] Create AgentOutputStatsService.ts
- [ ] Write unit tests for services
- [ ] Run service tests

### Phase 4: Create Controller
- [ ] Create AdminAgentOutputsController.ts
- [ ] Implement all 11 controller methods
- [ ] Write integration tests for controller
- [ ] Run controller tests

### Phase 5: Update Route File
- [ ] Backup original route file
- [ ] Rewrite route file with controller
- [ ] Update route imports
- [ ] Test all 11 endpoints manually

### Phase 6: Testing & Validation
- [ ] Run all existing tests
- [ ] Run all new tests
- [ ] Manual testing of each endpoint
- [ ] Test error cases
- [ ] Test filter combinations
- [ ] Test bulk operations with various ID counts
- [ ] Validate statistics accuracy
- [ ] Performance testing
- [ ] Compare response formats to original

### Phase 7: Deployment
- [ ] Code review
- [ ] Merge to staging
- [ ] Test on staging environment
- [ ] Monitor logs for errors
- [ ] Deploy to production
- [ ] Monitor production logs
- [ ] Validate production metrics

---

## 13. Appendix: Query Comparison

### List Endpoint (GET `/`)

**Before** (lines 48-137):
```typescript
// Count query
let countQuery = db("agent_results");
if (domain) countQuery = countQuery.where("domain", domain);
if (agent_type && agent_type !== "all") countQuery = countQuery.where("agent_type", agent_type);
// ... more filters ...
const [{ count }] = await countQuery.count("* as count");

// Data query
let dataQuery = db("agent_results").select(...);
if (domain) dataQuery = dataQuery.where("domain", domain);
if (agent_type && agent_type !== "all") dataQuery = dataQuery.where("agent_type", agent_type);
// ... duplicate filters ...
const outputs = await dataQuery.orderBy("created_at", "desc").limit(limitNum).offset(offset);
```

**After**:
```typescript
const filters = buildAgentOutputFilters(queryParams);
const result = await AgentResultModel.listAdmin(filters, { page, limit });
```

**SQL Generated**: Identical

---

### Get by ID (GET `/:id`)

**Before** (line 247):
```typescript
const output = await db("agent_results").where("id", id).first();
// Manual JSON parsing (lines 258-279)
```

**After**:
```typescript
const output = await AgentResultModel.findByIdWithDetails(id);
// JSON parsing automatic
```

**SQL Generated**: Identical (select all columns)

---

### Archive (PATCH `/:id/archive`)

**Before** (lines 314, 334-337):
```typescript
const output = await db("agent_results").where("id", id).first();
await db("agent_results").where("id", id).update({
  status: "archived",
  updated_at: new Date(),
});
```

**After**:
```typescript
const output = await AgentResultModel.findById(id);
await AgentResultModel.archive(id);
```

**SQL Generated**: Identical (2 queries)

---

### Bulk Archive (POST `/bulk/archive`)

**Before** (lines 434-440):
```typescript
const updated = await db("agent_results")
  .whereIn("id", ids)
  .whereNot("status", "archived")
  .update({
    status: "archived",
    updated_at: new Date(),
  });
```

**After**:
```typescript
const updated = await AgentResultModel.bulkArchive(ids);
```

**SQL Generated**: Identical

---

### Statistics (GET `/stats/summary`)

**Before** (lines 607-627):
```typescript
const statusCounts = await db("agent_results")
  .select("status")
  .count("* as count")
  .groupBy("status");

const typeCounts = await db("agent_results")
  .select("agent_type")
  .count("* as count")
  .whereNot("status", "archived")
  .groupBy("agent_type");

const recentCount = await db("agent_results")
  .where("created_at", ">=", sevenDaysAgo)
  .whereNot("status", "archived")
  .count("* as count")
  .first();
```

**After**:
```typescript
const [byStatus, byAgentType, recentCount] = await Promise.all([
  AgentResultModel.getStatsByStatus(),
  AgentResultModel.getStatsByAgentType(true),
  AgentResultModel.getRecentCount(7, true),
]);
```

**SQL Generated**: Identical (3 queries run in parallel)

---

## Conclusion

This refactor transforms a 665-line route file into a well-organized, maintainable architecture:
- **8 new files** (~630 LOC total)
- **Route file**: 665 → 40 lines (94% reduction)
- **Model additions**: ~95 lines
- **Zero API changes** - fully backward compatible
- **Zero query changes** - identical SQL generated
- **Improved testability** - clear unit boundaries
- **Improved maintainability** - easy to find and modify logic
- **Improved reusability** - shared utilities prevent duplication

The refactor follows best practices:
- ✅ Separation of concerns (routes/controller/services/model)
- ✅ DRY principle (no duplicate logic)
- ✅ Single Responsibility Principle (each class has one job)
- ✅ Open/Closed Principle (easy to extend, no need to modify)
- ✅ Dependency Inversion (controller depends on abstractions)

**Recommended Approach**: Phased migration with testing at each step, starting with model enhancements and working up to route replacement.
