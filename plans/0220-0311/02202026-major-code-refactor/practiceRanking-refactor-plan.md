# Practice Ranking Route Refactor Plan

## Executive Summary

This is the **MOST COMPLEX route file** in the codebase (2,172 LOC, 14 endpoints, critical business logic). The file contains massive batch orchestration, in-memory state tracking, complex LLM webhooks, and background job processing. This refactor is **CRITICAL** as it contains a **DATA LOSS BUG** (no transaction for atomic delete+insert).

**Critical Risk Level: LEVEL 4 - MAJOR IMPACT**

---

## 1. Current State Analysis

### File Information
- **Path**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/practiceRanking.ts`
- **Total LOC**: 2,172
- **Endpoints**: 14
- **Complexity**: Very High (batch orchestration, in-memory state, background jobs)

### Endpoints Inventory

| # | Method | Path | Lines | Responsibility | Complexity |
|---|--------|------|-------|---------------|------------|
| 1 | POST | `/trigger` | 967-1157 (191 LOC) | Start batch ranking analysis | **VERY HIGH** |
| 2 | GET | `/batch/:batchId/status` | 1163-1257 (95 LOC) | Get batch status (in-memory + DB) | **HIGH** |
| 3 | GET | `/status/:id` | 1263-1306 (44 LOC) | Get single ranking status | **LOW** |
| 4 | GET | `/results/:id` | 1312-1376 (65 LOC) | Get full ranking results | **MEDIUM** |
| 5 | GET | `/list` | 1382-1454 (73 LOC) | List rankings with filters | **MEDIUM** |
| 6 | GET | `/accounts` | 1460-1519 (60 LOC) | List onboarded accounts with GBP | **MEDIUM** |
| 7 | DELETE | `/batch/:batchId` | 1525-1574 (50 LOC) | Delete batch + in-memory cleanup | **MEDIUM** |
| 8 | DELETE | `/:id` | 1580-1623 (44 LOC) | Delete single ranking | **LOW** |
| 9 | POST | `/refresh-competitors` | 1629-1664 (36 LOC) | Invalidate competitor cache | **LOW** |
| 10 | GET | `/latest` | 1672-1847 (176 LOC) | Get latest rankings with previous | **HIGH** |
| 11 | GET | `/tasks` | 1855-1976 (122 LOC) | Get approved ranking tasks | **MEDIUM** |
| 12 | POST | `/webhook/llm-response` | 1982-2170 (189 LOC) | Receive LLM analysis from n8n | **VERY HIGH** |
| 13 | N/A | `processBatchAnalysis` | 131-558 (428 LOC) | Background batch processor | **VERY HIGH** |
| 14 | N/A | `processBatchAnalysisWithExistingRecords` | 564-957 (394 LOC) | Background batch processor (v2) | **VERY HIGH** |

### Dependencies

**External Services:**
- `rankingService` - processLocationRanking, updateStatus, MAX_RETRIES, RETRY_DELAY_MS
- `identifierService` - identifyLocationMeta
- `apifyService` - getSpecialtyKeywords
- `oauth2Helper` - getValidOAuth2Client
- `dataAggregator` - fetchGBPDataForRange
- `notificationHelper` - createNotification, notifyAdminsRankingComplete
- `competitorCache` - invalidateCache (dynamic import)

**Database Tables:**
- `practice_rankings` - Main rankings table
- `google_accounts` - Account data
- `tasks` - Task records from LLM recommendations

**In-Memory State:**
- `batchStatusMap` - Map<string, BatchStatus> for real-time batch progress tracking

### Critical Bugs Identified

#### 🔴 **CRITICAL: Data Loss Risk - No Transaction for Batch Archive/Delete**

**Location**: Lines 2052-2083 (webhook/llm-response endpoint)

**Issue**:
```typescript
// Archive tasks from previous rankings for this location
const archivedCount = await db("tasks")
  .where({ agent_type: "RANKING" })
  .whereRaw("metadata::jsonb->>'practice_ranking_id' IN (?)", [
    previousRankingIds.map(String).join(","),
  ])
  .whereNot({ status: "archived" })
  .update({
    status: "archived",
    updated_at: new Date(),
  });

// Create task records for each recommendation
if (topRecommendations.length > 0) {
  await db("tasks").insert(tasksToInsert);
}
```

**Risk**: If the archive succeeds but insert fails, previous tasks are lost with no new tasks created.

**Impact**: Data loss, customer dissatisfaction, audit trail corruption.

**Fix Required**: Wrap in transaction:
```typescript
await db.transaction(async (trx) => {
  await trx("tasks").where(...).update(...);
  await trx("tasks").insert(tasksToInsert);
});
```

---

#### 🟡 **Disabled Features**

**User Email Notifications Disabled** (Lines 484-527, 883-926):
```typescript
// TODO: REVERT - User email temporarily disabled
// try {
//   await createNotification(...)
// }
```

**Impact**: Users are not notified when their ranking analysis completes.

---

#### 🟡 **In-Memory State Loss on Server Restart**

**Location**: Line 54 - `const batchStatusMap = new Map<string, BatchStatus>();`

**Issue**: Real-time batch status is lost on server restart. Active batches will continue processing but clients cannot track progress.

**Risk**: User experience degradation during deployments.

---

#### 🟡 **Legacy Format Support Duplication**

**Location**: Lines 1098-1148 (trigger endpoint)

**Issue**: Duplicate batch processing logic for legacy single-location format. Dead code path.

---

### Code Smells

1. **Massive Duplication**: `processBatchAnalysis` (428 LOC) and `processBatchAnalysisWithExistingRecords` (394 LOC) are 95% identical
2. **Business Logic in Routes**: Complex batch orchestration, retry logic, auto-detection all in route handlers
3. **Scattered Logging**: Custom logging utilities (lines 77-121) should be centralized
4. **Magic Numbers**: `MAX_RETRIES=3`, `RETRY_DELAY_MS=10000` hardcoded in rankingService but used here
5. **No Input Validation**: Request bodies validated inline with manual checks
6. **Direct DB Access**: 47 instances of `db()` calls (no model layer)
7. **Inconsistent Error Handling**: Some errors logged, some not; inconsistent response formats
8. **Side Effects in Route Handlers**: Background jobs started with `setImmediate()` - should be separate job queue
9. **Complex JSON Parsing**: Inline `typeof field === "string" ? JSON.parse(field) : field` repeated 12+ times
10. **No Type Safety**: Interface definitions in route file instead of shared types

---

## 2. Target Architecture

### Folder Structure

```
src/
├── controllers/
│   └── practice-ranking/
│       ├── PracticeRankingController.ts          [~400 LOC] - Main controller orchestration
│       ├── feature-services/
│       │   ├── service.ranking-computation.ts    [~600 LOC] - Batch computation & retry logic
│       │   ├── service.competitor-analysis.ts    [~200 LOC] - Competitor discovery/caching
│       │   ├── service.google-data-fetcher.ts    [~150 LOC] - GBP/GSC data fetching
│       │   ├── service.llm-webhook-handler.ts    [~250 LOC] - LLM response processing + task creation
│       │   ├── service.batch-status-tracker.ts   [~150 LOC] - In-memory batch status management
│       │   └── service.specialty-identifier.ts   [~200 LOC] - Auto-detect specialty/market location
│       └── feature-utils/
│           ├── util.ranking-logger.ts            [~80 LOC] - Centralized logging
│           ├── util.json-parser.ts               [~30 LOC] - Safe JSON parsing helper
│           ├── util.ranking-validator.ts         [~100 LOC] - Input validation schemas
│           └── util.ranking-formatter.ts         [~120 LOC] - Response formatting
│
├── models/
│   ├── PracticeRankingModel.ts                   [EXISTS - EXPAND]
│   ├── GoogleAccountModel.ts                     [EXISTS - EXPAND]
│   └── TaskModel.ts                              [EXISTS - EXPAND]
│
└── routes/
    └── practiceRanking.ts                        [~150 LOC] - Thin route definitions only
```

---

## 3. Detailed Mapping: Endpoints → Controllers/Services

### Endpoint 1: POST /trigger

**Current**: Lines 967-1157 (191 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.post("/trigger", PracticeRankingController.triggerBatchAnalysis);

// controllers/practice-ranking/PracticeRankingController.ts
async triggerBatchAnalysis(req, res) {
  // 1. Validate input (util.ranking-validator.ts)
  const validation = RankingValidator.validateTriggerRequest(req.body);
  if (!validation.valid) return res.status(400).json(validation.error);

  // 2. Get account data (GoogleAccountModel.ts)
  const account = await GoogleAccountModel.findByIdWithProperties(googleAccountId);
  if (!account) return res.status(404).json(...);

  // 3. Validate locations exist (util.ranking-validator.ts)
  const locationsValid = RankingValidator.validateLocations(locations, account.propertyIds);
  if (!locationsValid.valid) return res.status(400).json(...);

  // 4. Create batch records (PracticeRankingModel.ts)
  const batchId = uuidv4();
  const rankingIds = await PracticeRankingModel.createBatchRankings({
    batchId,
    googleAccountId,
    domain: account.domain,
    locations,
  });

  // 5. Start background processing (service.ranking-computation.ts)
  setImmediate(() => {
    RankingComputationService.processBatch(batchId, googleAccountId, locations, account.domain, rankingIds)
      .catch(err => Logger.error("Background batch process", err));
  });

  // 6. Return formatted response (util.ranking-formatter.ts)
  return res.json(RankingFormatter.formatTriggerResponse(batchId, locations, rankingIds));
}
```

**DB Calls → Model Methods**:
- `db("google_accounts").where({ id }).first()` → `GoogleAccountModel.findByIdWithProperties(id)`
- `db("practice_rankings").insert(...).returning("id")` → `PracticeRankingModel.createBatchRankings(...)`

---

### Endpoint 2: GET /batch/:batchId/status

**Current**: Lines 1163-1257 (95 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/batch/:batchId/status", PracticeRankingController.getBatchStatus);

// controllers/practice-ranking/PracticeRankingController.ts
async getBatchStatus(req, res) {
  const { batchId } = req.params;

  // 1. Check in-memory status first (service.batch-status-tracker.ts)
  const inMemoryStatus = BatchStatusTracker.getStatus(batchId);
  if (inMemoryStatus) {
    return res.json(RankingFormatter.formatBatchStatus(inMemoryStatus));
  }

  // 2. Fallback to DB (PracticeRankingModel.ts)
  const batchData = await PracticeRankingModel.getBatchStatus(batchId);
  if (!batchData) {
    return res.status(404).json({ error: "Batch not found" });
  }

  return res.json(RankingFormatter.formatBatchStatus(batchData));
}
```

**DB Calls → Model Methods**:
- `db("practice_rankings").where({ batch_id }).select(...)` → `PracticeRankingModel.getBatchStatus(batchId)`

---

### Endpoint 3: GET /status/:id

**Current**: Lines 1263-1306 (44 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/status/:id", PracticeRankingController.getRankingStatus);

// controllers/practice-ranking/PracticeRankingController.ts
async getRankingStatus(req, res) {
  const ranking = await PracticeRankingModel.findById(parseInt(req.params.id));
  if (!ranking) return res.status(404).json({ error: "Not found" });

  return res.json(RankingFormatter.formatRankingStatus(ranking));
}
```

**DB Calls → Model Methods**:
- `db("practice_rankings").where({ id }).first()` → `PracticeRankingModel.findById(id)`

---

### Endpoint 4: GET /results/:id

**Current**: Lines 1312-1376 (65 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/results/:id", PracticeRankingController.getRankingResults);

// controllers/practice-ranking/PracticeRankingController.ts
async getRankingResults(req, res) {
  const ranking = await PracticeRankingModel.findByIdWithFullResults(parseInt(req.params.id));
  if (!ranking) return res.status(404).json({ error: "Not found" });

  return res.json(RankingFormatter.formatFullResults(ranking));
}
```

**DB Calls → Model Methods**:
- `db("practice_rankings").where({ id }).first()` → `PracticeRankingModel.findByIdWithFullResults(id)`

---

### Endpoint 5: GET /list

**Current**: Lines 1382-1454 (73 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/list", PracticeRankingController.listRankings);

// controllers/practice-ranking/PracticeRankingController.ts
async listRankings(req, res) {
  const { googleAccountId, limit = 20, offset = 0 } = req.query;

  const rankings = await PracticeRankingModel.list({
    googleAccountId: googleAccountId ? Number(googleAccountId) : undefined,
    limit: Number(limit),
    offset: Number(offset),
  });

  return res.json(RankingFormatter.formatRankingsList(rankings));
}
```

**DB Calls → Model Methods**:
- Complex query with filters → `PracticeRankingModel.list(filters)`

---

### Endpoint 6: GET /accounts

**Current**: Lines 1460-1519 (60 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/accounts", PracticeRankingController.listAccounts);

// controllers/practice-ranking/PracticeRankingController.ts
async listAccounts(req, res) {
  const accounts = await GoogleAccountModel.listOnboardedWithGBP();
  return res.json(RankingFormatter.formatAccountsList(accounts));
}
```

**DB Calls → Model Methods**:
- `db("google_accounts").where({ onboarding_completed: true }).select(...)` → `GoogleAccountModel.listOnboardedWithGBP()`

---

### Endpoint 7: DELETE /batch/:batchId

**Current**: Lines 1525-1574 (50 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.delete("/batch/:batchId", PracticeRankingController.deleteBatch);

// controllers/practice-ranking/PracticeRankingController.ts
async deleteBatch(req, res) {
  const { batchId } = req.params;

  const exists = await PracticeRankingModel.batchExists(batchId);
  if (!exists) return res.status(404).json({ error: "Batch not found" });

  const deletedCount = await PracticeRankingModel.deleteBatch(batchId);

  // Clean up in-memory state
  BatchStatusTracker.clearStatus(batchId);

  return res.json({ success: true, deletedCount });
}
```

**DB Calls → Model Methods**:
- `db("practice_rankings").where({ batch_id }).select("id", "status")` → `PracticeRankingModel.batchExists(batchId)`
- `db("practice_rankings").where({ batch_id }).del()` → `PracticeRankingModel.deleteBatch(batchId)`

---

### Endpoint 8: DELETE /:id

**Current**: Lines 1580-1623 (44 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.delete("/:id", PracticeRankingController.deleteRanking);

// controllers/practice-ranking/PracticeRankingController.ts
async deleteRanking(req, res) {
  const rankingId = parseInt(req.params.id);
  if (isNaN(rankingId)) return res.status(400).json({ error: "Invalid ID" });

  const deleted = await PracticeRankingModel.deleteById(rankingId);
  if (!deleted) return res.status(404).json({ error: "Not found" });

  return res.json({ success: true, message: "Ranking deleted" });
}
```

**DB Calls → Model Methods**:
- `db("practice_rankings").where({ id }).first()` → `PracticeRankingModel.findById(id)`
- `db("practice_rankings").where({ id }).del()` → `PracticeRankingModel.deleteById(id)`

---

### Endpoint 9: POST /refresh-competitors

**Current**: Lines 1629-1664 (36 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.post("/refresh-competitors", PracticeRankingController.refreshCompetitors);

// controllers/practice-ranking/PracticeRankingController.ts
async refreshCompetitors(req, res) {
  const { specialty, location } = req.body;

  const validation = RankingValidator.validateRefreshCompetitors({ specialty, location });
  if (!validation.valid) return res.status(400).json(validation.error);

  const wasInvalidated = await CompetitorAnalysisService.invalidateCache(specialty, location);

  return res.json({
    success: true,
    message: wasInvalidated
      ? "Competitor cache invalidated. Next analysis will discover fresh competitors."
      : "No cache found. Next analysis will discover competitors.",
    invalidated: wasInvalidated,
  });
}
```

**DB Calls → Model Methods**: None (cache-only operation)

---

### Endpoint 10: GET /latest

**Current**: Lines 1672-1847 (176 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/latest", PracticeRankingController.getLatestRankings);

// controllers/practice-ranking/PracticeRankingController.ts
async getLatestRankings(req, res) {
  const { googleAccountId } = req.query;
  if (!googleAccountId) {
    return res.status(400).json({ error: "googleAccountId required" });
  }

  // Complex logic: find latest batch, get all rankings, get previous for each
  const latestRankings = await PracticeRankingModel.getLatestWithPrevious(
    Number(googleAccountId)
  );

  if (!latestRankings.length) {
    return res.status(404).json({ error: "No completed rankings found" });
  }

  return res.json(RankingFormatter.formatLatestRankings(latestRankings));
}
```

**DB Calls → Model Methods**:
- Lines 1691-1699 (find latest batch) → Part of `PracticeRankingModel.getLatestWithPrevious()`
- Lines 1703-1710 (legacy fallback) → Part of `PracticeRankingModel.getLatestWithPrevious()`
- Lines 1758-1764 (batch rankings) → Part of `PracticeRankingModel.getLatestWithPrevious()`
- Lines 1782-1790 (previous rankings) → Part of `PracticeRankingModel.getLatestWithPrevious()`

---

### Endpoint 11: GET /tasks

**Current**: Lines 1855-1976 (122 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.get("/tasks", PracticeRankingController.getRankingTasks);

// controllers/practice-ranking/PracticeRankingController.ts
async getRankingTasks(req, res) {
  const { practiceRankingId, googleAccountId, gbpLocationId } = req.query;

  const validation = RankingValidator.validateTasksRequest(req.query);
  if (!validation.valid) return res.status(400).json(validation.error);

  let tasks = [];

  if (practiceRankingId) {
    tasks = await TaskModel.findByRankingId(String(practiceRankingId));
  } else if (googleAccountId && gbpLocationId) {
    const latestRanking = await PracticeRankingModel.findLatestForLocation(
      Number(googleAccountId),
      String(gbpLocationId)
    );
    if (latestRanking) {
      tasks = await TaskModel.findByRankingId(String(latestRanking.id));
    }
  } else if (googleAccountId) {
    tasks = await TaskModel.findByAccountId(Number(googleAccountId), "RANKING");
  }

  return res.json(RankingFormatter.formatTasksList(tasks));
}
```

**DB Calls → Model Methods**:
- Lines 1869-1879 (tasks by ranking ID) → `TaskModel.findByRankingId(rankingId)`
- Lines 1882-1904 (latest ranking + tasks) → `PracticeRankingModel.findLatestForLocation()` + `TaskModel.findByRankingId()`
- Lines 1906-1915 (all account tasks) → `TaskModel.findByAccountId(accountId, "RANKING")`

---

### Endpoint 12: POST /webhook/llm-response

**Current**: Lines 1982-2170 (189 LOC)

**Refactored Flow**:
```typescript
// routes/practiceRanking.ts
router.post("/webhook/llm-response", PracticeRankingController.handleLLMWebhook);

// controllers/practice-ranking/PracticeRankingController.ts
async handleLLMWebhook(req, res) {
  await LLMWebhookHandler.processResponse(req.body);
  return res.json({ success: true, message: "Analysis saved" });
}

// services/service.llm-webhook-handler.ts
export class LLMWebhookHandler {
  static async processResponse(body: any) {
    // 1. Normalize input (handle array format)
    const normalized = this.normalizeWebhookBody(body);

    // 2. Validate required fields
    const validation = RankingValidator.validateWebhookBody(normalized);
    if (!validation.valid) throw new Error(validation.error);

    // 3. Get ranking context
    const ranking = await PracticeRankingModel.findById(normalized.practice_ranking_id);
    if (!ranking) throw new Error("Ranking not found");

    // 4. Handle error response
    if (normalized.error) {
      await this.handleErrorResponse(ranking.id, normalized);
      return;
    }

    // 5. Archive previous tasks and create new ones (WITH TRANSACTION!)
    await this.archiveAndCreateTasks(ranking, normalized.llmAnalysis);

    // 6. Save LLM analysis and mark complete
    await PracticeRankingModel.updateWithLLMAnalysis(ranking.id, normalized.llmAnalysis);
  }

  private static async archiveAndCreateTasks(ranking: any, llmAnalysis: any) {
    await db.transaction(async (trx) => {
      // Archive previous tasks
      const previousRankingIds = await PracticeRankingModel.findPreviousRankingIds(
        ranking.google_account_id,
        ranking.gbp_location_id,
        ranking.id
      );

      if (previousRankingIds.length > 0) {
        await TaskModel.archivePreviousTasks(previousRankingIds, trx);
      }

      // Create new tasks
      const topRecommendations = llmAnalysis.top_recommendations || [];
      if (topRecommendations.length > 0) {
        await TaskModel.createFromRecommendations(ranking, topRecommendations, trx);
      }
    });
  }
}
```

**DB Calls → Model Methods**:
- Line 2011 (update error status) → `PracticeRankingModel.updateWithError(id, error)`
- Lines 2039-2042 (get ranking) → `PracticeRankingModel.findById(id)`
- Lines 2055-2062 (find previous rankings) → `PracticeRankingModel.findPreviousRankingIds(accountId, locationId, currentId)`
- Lines 2067-2076 (archive tasks) → `TaskModel.archivePreviousTasks(rankingIds, trx)`
- Lines 2092-2121 (insert tasks) → `TaskModel.createFromRecommendations(ranking, recommendations, trx)`
- Lines 2134-2157 (save LLM analysis) → `PracticeRankingModel.updateWithLLMAnalysis(id, analysis)`

---

### Background Function: processBatchAnalysis + processBatchAnalysisWithExistingRecords

**Current**: Lines 131-558 (428 LOC) + 564-957 (394 LOC) = **822 LOC of duplication**

**Refactored Flow**:
```typescript
// services/service.ranking-computation.ts
export class RankingComputationService {
  static async processBatch(
    batchId: string,
    googleAccountId: number,
    locations: LocationInput[],
    domain: string,
    rankingIds: number[]
  ): Promise<void> {
    // 1. Initialize batch status tracker
    BatchStatusTracker.initialize(batchId, googleAccountId, locations, rankingIds);

    // 2. Process each location with retry logic
    const successfulResults = [];
    for (let i = 0; i < locations.length; i++) {
      const locationInput = locations[i];
      const rankingId = rankingIds[i];

      BatchStatusTracker.updateCurrentLocation(batchId, i, locationInput.gbpLocationName);

      // 3. Auto-detect specialty/location if needed
      const { specialty, marketLocation, locationParams } = await this.resolveLocationMeta(
        locationInput,
        googleAccountId,
        rankingId
      );

      // 4. Retry logic for each location
      const result = await this.processLocationWithRetries(
        rankingId,
        googleAccountId,
        locationInput,
        specialty,
        marketLocation,
        domain,
        batchId,
        locationParams
      );

      if (!result.success) {
        await this.handleBatchFailure(batchId, locationInput, result.error);
        return;
      }

      successfulResults.push(result);
      BatchStatusTracker.incrementCompleted(batchId);
    }

    // 5. Mark batch complete, send notifications
    await this.handleBatchSuccess(batchId, domain, locations, successfulResults);
  }

  private static async resolveLocationMeta(
    locationInput: LocationInput,
    googleAccountId: number,
    rankingId: number
  ) {
    // Delegates to service.specialty-identifier.ts
    return SpecialtyIdentifier.identify(locationInput, googleAccountId, rankingId);
  }

  private static async processLocationWithRetries(...) {
    // Retry logic with MAX_RETRIES
  }

  private static async handleBatchFailure(...) {
    // Mark all rankings failed
    await PracticeRankingModel.failBatch(batchId, errorMessage);
    BatchStatusTracker.markFailed(batchId);
  }

  private static async handleBatchSuccess(...) {
    // Notifications, admin emails
    BatchStatusTracker.markCompleted(batchId);
  }
}
```

**DB Calls → Model Methods**:
- Lines 160-183 (create rankings) → `PracticeRankingModel.createBatchRankings()`
- Lines 232-244 (update to processing) → `PracticeRankingModel.updateStatus(id, "processing", statusDetail)`
- Lines 256-267 (update identifying) → `PracticeRankingModel.updateStatus(id, "processing", statusDetail)`
- Line 270 (get account) → `GoogleAccountModel.findById(id)`
- Lines 336-348 (update specialty) → `PracticeRankingModel.updateMetadata(id, { specialty, location, keywords, locationParams })`
- Lines 361-365 (update defaults) → `PracticeRankingModel.updateMetadata(id, { specialty, location })`
- Lines 371-374 (update keywords) → `PracticeRankingModel.updateMetadata(id, { keywords })`
- Lines 442-449 (fail batch) → `PracticeRankingModel.failBatch(batchId, errorMessage)`
- Lines 550-556 (fail batch) → `PracticeRankingModel.failBatch(batchId, errorMessage)`

---

## 4. Complete DB → Model Mapping

### PracticeRankingModel Methods Needed

```typescript
// src/models/PracticeRankingModel.ts

export class PracticeRankingModel {
  // CREATE
  static async createBatchRankings(params: CreateBatchParams): Promise<number[]>

  // READ
  static async findById(id: number): Promise<PracticeRanking | null>
  static async findByIdWithFullResults(id: number): Promise<PracticeRanking | null>
  static async getBatchStatus(batchId: string): Promise<BatchStatusData | null>
  static async batchExists(batchId: string): Promise<boolean>
  static async list(filters: ListFilters): Promise<PracticeRanking[]>
  static async getLatestWithPrevious(googleAccountId: number): Promise<PracticeRankingWithPrevious[]>
  static async findLatestForLocation(googleAccountId: number, gbpLocationId: string): Promise<PracticeRanking | null>
  static async findPreviousRankingIds(googleAccountId: number, gbpLocationId: string, excludeId: number): Promise<number[]>

  // UPDATE
  static async updateStatus(id: number, status: string, statusDetail: any): Promise<void>
  static async updateMetadata(id: number, metadata: MetadataUpdate): Promise<void>
  static async updateWithError(id: number, error: string): Promise<void>
  static async updateWithLLMAnalysis(id: number, analysis: any): Promise<void>
  static async failBatch(batchId: string, errorMessage: string): Promise<void>

  // DELETE
  static async deleteById(id: number): Promise<boolean>
  static async deleteBatch(batchId: string): Promise<number>

  // HELPERS
  static parseJsonField(field: any): any
}
```

### GoogleAccountModel Methods Needed

```typescript
// src/models/GoogleAccountModel.ts

export class GoogleAccountModel {
  // READ
  static async findById(id: number): Promise<GoogleAccount | null>
  static async findByIdWithProperties(id: number): Promise<GoogleAccountWithProperties | null>
  static async listOnboardedWithGBP(): Promise<GoogleAccountWithGBP[]>
}
```

### TaskModel Methods Needed

```typescript
// src/models/TaskModel.ts

export class TaskModel {
  // READ
  static async findByRankingId(practiceRankingId: string): Promise<Task[]>
  static async findByAccountId(googleAccountId: number, agentType: string): Promise<Task[]>

  // UPDATE
  static async archivePreviousTasks(rankingIds: number[], trx?: Knex.Transaction): Promise<number>

  // CREATE
  static async createFromRecommendations(
    ranking: PracticeRanking,
    recommendations: any[],
    trx?: Knex.Transaction
  ): Promise<void>
}
```

---

## 5. Step-by-Step Migration Plan

### Phase 1: Foundation (No Breaking Changes)

**Goal**: Extract utilities and models without touching routes.

#### Step 1.1: Create Utility Files (2 hours)

1. **Create `/src/controllers/practice-ranking/feature-utils/util.ranking-logger.ts`**
   - Move logging utilities (lines 77-121)
   - Export `Logger` class with methods: `debug()`, `info()`, `warn()`, `error()`

2. **Create `/src/controllers/practice-ranking/feature-utils/util.json-parser.ts`**
   - Create `parseJsonField(field: any): any` helper
   - Used 12+ times in route file

3. **Create `/src/controllers/practice-ranking/feature-utils/util.ranking-validator.ts`**
   - Create validation schemas for all endpoints:
     - `validateTriggerRequest(body)`
     - `validateRefreshCompetitors(body)`
     - `validateTasksRequest(query)`
     - `validateWebhookBody(body)`
     - `validateLocations(locations, propertyIds)`

4. **Create `/src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`**
   - Response formatting methods:
     - `formatTriggerResponse()`
     - `formatBatchStatus()`
     - `formatRankingStatus()`
     - `formatFullResults()`
     - `formatRankingsList()`
     - `formatAccountsList()`
     - `formatLatestRankings()`
     - `formatTasksList()`

**Testing**: Unit tests for each utility. No integration changes yet.

---

#### Step 1.2: Expand Model Methods (4 hours)

1. **Expand `/src/models/PracticeRankingModel.ts`**
   - Add all methods listed in section 4 above
   - Each method encapsulates exactly one DB query pattern
   - Use Knex transactions where needed
   - Add JSDoc for each method

2. **Expand `/src/models/GoogleAccountModel.ts`**
   - Add `findByIdWithProperties()`
   - Add `listOnboardedWithGBP()`

3. **Expand `/src/models/TaskModel.ts`**
   - Add `findByRankingId()`
   - Add `findByAccountId()`
   - Add `archivePreviousTasks()` (with transaction support!)
   - Add `createFromRecommendations()` (with transaction support!)

**Testing**: Unit tests for each model method. Verify transactions work correctly.

---

### Phase 2: Extract Services (Risky - Requires Testing)

**Goal**: Extract business logic into service classes.

#### Step 2.1: Extract Simple Services (3 hours)

1. **Create `/src/controllers/practice-ranking/feature-services/service.batch-status-tracker.ts`**
   - Encapsulate `batchStatusMap` in-memory state
   - Methods:
     - `initialize(batchId, ...)`
     - `getStatus(batchId)`
     - `updateCurrentLocation(batchId, index, name)`
     - `incrementCompleted(batchId)`
     - `markFailed(batchId)`
     - `markCompleted(batchId)`
     - `clearStatus(batchId)`

2. **Create `/src/controllers/practice-ranking/feature-services/service.competitor-analysis.ts`**
   - Wrapper for `competitorCache`
   - Method: `invalidateCache(specialty, location)`

3. **Create `/src/controllers/practice-ranking/feature-services/service.google-data-fetcher.ts`**
   - Wrapper for `dataAggregator.fetchGBPDataForRange()`
   - Wrapper for `getValidOAuth2Client()`

**Testing**: Unit tests. No route changes yet.

---

#### Step 2.2: Extract Specialty Identifier (4 hours)

**High Complexity**: Lines 250-366 (duplicated in both batch functions)

1. **Create `/src/controllers/practice-ranking/feature-services/service.specialty-identifier.ts`**
   - Extract auto-detection logic:
     ```typescript
     export class SpecialtyIdentifier {
       static async identify(
         locationInput: LocationInput,
         googleAccountId: number,
         rankingId: number
       ): Promise<{
         specialty: string;
         marketLocation: string;
         locationParams: LocationParams;
       }> {
         // Lines 250-366 logic here
       }
     }
     ```

**Testing**: Integration tests with mock GBP data.

---

#### Step 2.3: Extract LLM Webhook Handler (6 hours) **CRITICAL**

**This fixes the data loss bug!**

1. **Create `/src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts`**
   - Extract lines 1982-2170
   - **CRITICAL**: Wrap task archive + insert in transaction:
     ```typescript
     private static async archiveAndCreateTasks(ranking: any, llmAnalysis: any) {
       await db.transaction(async (trx) => {
         // Archive previous tasks
         const previousRankingIds = await PracticeRankingModel.findPreviousRankingIds(
           ranking.google_account_id,
           ranking.gbp_location_id,
           ranking.id
         );

         if (previousRankingIds.length > 0) {
           await TaskModel.archivePreviousTasks(previousRankingIds, trx);
         }

         // Create new tasks
         const topRecommendations = llmAnalysis.top_recommendations || [];
         if (topRecommendations.length > 0) {
           await TaskModel.createFromRecommendations(ranking, topRecommendations, trx);
         }
       });
     }
     ```

**Testing**:
- Integration test: Verify transaction rollback on failure
- E2E test: Simulate webhook with task archive + insert failure

---

#### Step 2.4: Extract Ranking Computation (8 hours) **HIGHEST COMPLEXITY**

**This is the most complex refactor.**

1. **Create `/src/controllers/practice-ranking/feature-services/service.ranking-computation.ts`**
   - Consolidate `processBatchAnalysis` + `processBatchAnalysisWithExistingRecords` into ONE method
   - Remove duplication (822 LOC → ~600 LOC)
   - Use extracted services: `SpecialtyIdentifier`, `BatchStatusTracker`, `GoogleDataFetcher`

**Testing**:
- Integration tests with mock external services
- E2E test: Full batch flow from trigger to completion

---

### Phase 3: Refactor Controller (Low Risk)

**Goal**: Create thin controller layer.

#### Step 3.1: Create Controller (4 hours)

1. **Create `/src/controllers/practice-ranking/PracticeRankingController.ts`**
   - 14 methods (one per endpoint)
   - Each method:
     - Validate input (call `RankingValidator`)
     - Call model/service
     - Format response (call `RankingFormatter`)
     - Handle errors consistently

**Testing**: Integration tests for each controller method.

---

### Phase 4: Update Routes (Low Risk)

**Goal**: Make routes thin.

#### Step 4.1: Refactor Route File (2 hours)

1. **Update `/src/routes/practiceRanking.ts`**
   - Remove all business logic
   - Keep only route definitions:
     ```typescript
     import { PracticeRankingController } from "../controllers/practice-ranking/PracticeRankingController";

     const router = express.Router();

     router.post("/trigger", PracticeRankingController.triggerBatchAnalysis);
     router.get("/batch/:batchId/status", PracticeRankingController.getBatchStatus);
     // ... etc
     ```
   - Final LOC: ~150

**Testing**: E2E tests for all endpoints. Verify no regressions.

---

### Phase 5: Address Critical Fixes

#### Fix 1: Re-enable User Email Notifications (1 hour)

**Location**: Lines 484-527, 883-926

1. Uncomment notification code in `service.ranking-computation.ts`
2. Test email delivery in staging
3. Monitor for email send failures

---

#### Fix 2: Remove Legacy Format Support (1 hour)

**Location**: Lines 1098-1148

1. Remove legacy single-location format
2. Update API documentation
3. Verify no clients use old format

---

#### Fix 3: Document In-Memory State Loss (30 min)

**Location**: BatchStatusTracker

1. Add JSDoc comment:
   ```typescript
   /**
    * In-memory batch status tracker.
    * WARNING: State is lost on server restart. Active batches will continue
    * processing but clients cannot track progress until batch completes.
    * TODO: Consider Redis or DB-backed status store for production.
    */
   ```

---

## 6. Files to Create

| File Path | Responsibilities | Approx LOC |
|-----------|-----------------|------------|
| `controllers/practice-ranking/PracticeRankingController.ts` | Controller orchestration (14 methods) | ~400 |
| `controllers/practice-ranking/feature-services/service.ranking-computation.ts` | Batch computation & retry logic | ~600 |
| `controllers/practice-ranking/feature-services/service.competitor-analysis.ts` | Competitor cache wrapper | ~200 |
| `controllers/practice-ranking/feature-services/service.google-data-fetcher.ts` | GBP/GSC data fetching | ~150 |
| `controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts` | LLM webhook + task creation (with transaction!) | ~250 |
| `controllers/practice-ranking/feature-services/service.batch-status-tracker.ts` | In-memory batch status | ~150 |
| `controllers/practice-ranking/feature-services/service.specialty-identifier.ts` | Auto-detect specialty/location | ~200 |
| `controllers/practice-ranking/feature-utils/util.ranking-logger.ts` | Centralized logging | ~80 |
| `controllers/practice-ranking/feature-utils/util.json-parser.ts` | Safe JSON parsing | ~30 |
| `controllers/practice-ranking/feature-utils/util.ranking-validator.ts` | Input validation schemas | ~100 |
| `controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` | Response formatting | ~120 |

**Total New LOC**: ~2,280 (vs 2,172 in route file, but with better separation and testing)

---

## 7. Files to Modify

| File Path | Changes | Risk Level |
|-----------|---------|------------|
| `models/PracticeRankingModel.ts` | Add 18 new methods | **MEDIUM** |
| `models/GoogleAccountModel.ts` | Add 2 new methods | **LOW** |
| `models/TaskModel.ts` | Add 3 new methods (with transaction support!) | **MEDIUM** |
| `routes/practiceRanking.ts` | Reduce from 2,172 LOC → ~150 LOC (route definitions only) | **HIGH** |

---

## 8. Risk Assessment

### Overall Risk: **LEVEL 4 - MAJOR IMPACT**

**Justification**:
- Critical business logic (practice ranking is core feature)
- Complex batch orchestration with retry logic
- In-memory state that affects user experience
- LLM webhook integration with external system (n8n)
- **Data loss bug** in production
- High LOC count (2,172)
- Background job processing with `setImmediate()`
- 14 endpoints to refactor
- Extensive DB query patterns (47 db() calls)

---

### Risk Breakdown by Phase

| Phase | Risk Level | Mitigation |
|-------|-----------|------------|
| 1.1 - Extract Utilities | **LOW** | No route changes. Unit tests only. |
| 1.2 - Expand Models | **MEDIUM** | Extensive testing. Verify transactions. |
| 2.1 - Extract Simple Services | **LOW** | Simple wrappers. Unit tests. |
| 2.2 - Extract Specialty Identifier | **MEDIUM** | Integration tests with mock data. |
| 2.3 - Extract LLM Webhook Handler | **HIGH** | **CRITICAL**: Test transaction rollback extensively. |
| 2.4 - Extract Ranking Computation | **VERY HIGH** | E2E tests. Staging deployment required. |
| 3.1 - Create Controller | **MEDIUM** | Integration tests for all methods. |
| 4.1 - Refactor Routes | **HIGH** | E2E tests for all endpoints. Feature flags. |
| 5 - Critical Fixes | **MEDIUM** | Staging tests. Monitor production closely. |

---

### Failure Modes to Test

1. **Batch Processing Failures**:
   - One location fails after max retries → entire batch fails ✓
   - Network failure during GBP data fetch → retry logic kicks in ✓
   - Server restart during batch processing → batch continues, in-memory state lost ⚠️

2. **LLM Webhook Failures**:
   - Webhook receives error response → ranking marked complete with error ✓
   - Task archive succeeds but insert fails → **DATA LOSS BUG (MUST FIX)** 🔴
   - Invalid ranking ID → 404 response ✓

3. **Transaction Failures**:
   - Archive succeeds, insert fails → transaction rollback ✓ (after fix)
   - Database connection lost mid-transaction → rollback ✓

4. **Race Conditions**:
   - Two webhooks for same ranking arrive simultaneously → last write wins (acceptable)
   - Batch delete while webhook processing → orphaned tasks possible (needs investigation)

5. **In-Memory State Loss**:
   - Server restart → batch status lost, clients see stale data ⚠️
   - High memory usage → investigate batch status map growth

---

## 9. Testing Strategy

### Unit Tests (New Files)

- [ ] `util.ranking-logger.ts` - All log levels
- [ ] `util.json-parser.ts` - Valid JSON, invalid JSON, null, undefined
- [ ] `util.ranking-validator.ts` - Each validation schema (valid + invalid)
- [ ] `util.ranking-formatter.ts` - Each formatter method
- [ ] `service.batch-status-tracker.ts` - All state mutations
- [ ] `service.competitor-analysis.ts` - Cache invalidation
- [ ] `service.google-data-fetcher.ts` - Mock external calls
- [ ] `service.specialty-identifier.ts` - Mock GBP data, fallback logic
- [ ] `service.llm-webhook-handler.ts` - Transaction rollback, error handling
- [ ] `service.ranking-computation.ts` - Retry logic, batch failure

### Integration Tests (Models)

- [ ] `PracticeRankingModel` - All 18 methods, especially transactions
- [ ] `GoogleAccountModel` - All 2 methods
- [ ] `TaskModel` - All 3 methods, especially transactions

### E2E Tests (Endpoints)

- [ ] POST `/trigger` - Multi-location batch, legacy format, validation errors
- [ ] GET `/batch/:batchId/status` - In-memory status, DB fallback, not found
- [ ] GET `/status/:id` - Valid, not found
- [ ] GET `/results/:id` - Valid, not found
- [ ] GET `/list` - With/without filters, pagination
- [ ] GET `/accounts` - Onboarded accounts with GBP
- [ ] DELETE `/batch/:batchId` - Valid, not found, in-memory cleanup
- [ ] DELETE `/:id` - Valid, not found
- [ ] POST `/refresh-competitors` - Valid, invalid params
- [ ] GET `/latest` - Latest batch, legacy fallback, not found
- [ ] GET `/tasks` - All query param combinations
- [ ] POST `/webhook/llm-response` - Success, error response, transaction rollback

### Performance Tests

- [ ] Batch processing with 20+ locations
- [ ] Concurrent batch processing (5 batches simultaneously)
- [ ] In-memory status map growth (100+ active batches)
- [ ] Webhook throughput (100 requests/minute)

### Regression Tests

- [ ] Verify existing clients not broken by refactor
- [ ] Verify LLM webhook still works with n8n
- [ ] Verify admin dashboard still displays ranking data
- [ ] Verify client dashboard still displays latest rankings

---

## 10. Deployment Strategy

### Step 1: Feature Flag (Recommended)

Add environment variable `USE_REFACTORED_RANKING_ROUTES=false` to gate refactored routes.

**Benefits**:
- Zero-downtime rollback
- A/B testing in production
- Gradual rollout

**Cons**:
- More complex deployment
- Temporary code duplication

---

### Step 2: Staging Deployment

1. Deploy to staging
2. Run full E2E test suite
3. Manually trigger batch analysis (3+ locations)
4. Monitor logs for errors
5. Test LLM webhook integration
6. Verify no memory leaks (in-memory status map)
7. Test server restart during batch processing

**Duration**: 1 week in staging

---

### Step 3: Production Deployment

1. Deploy during low-traffic window (2am PST)
2. Enable feature flag for 10% of traffic
3. Monitor error rates, response times
4. Gradually increase to 50%, then 100%
5. Monitor for 48 hours

**Rollback Plan**:
- Disable feature flag → instant rollback to old routes
- If data corruption detected → restore from DB backup

---

## 11. Definition of Done

- [ ] All 14 endpoints refactored and tested
- [ ] Routes file reduced from 2,172 LOC → ~150 LOC
- [ ] All 47 db() calls moved to model methods
- [ ] All services extracted and unit tested
- [ ] All utilities extracted and unit tested
- [ ] Controller layer created with 14 methods
- [ ] **CRITICAL BUG FIXED**: Transaction for task archive + insert
- [ ] User email notifications re-enabled (if product approves)
- [ ] Legacy format support removed (if product approves)
- [ ] In-memory state loss documented
- [ ] 100% test coverage for new files
- [ ] E2E tests pass for all endpoints
- [ ] Staging deployment successful (1 week validation)
- [ ] Production deployment successful (no regressions)
- [ ] Performance benchmarks meet baseline (no degradation)
- [ ] Documentation updated (API docs, architecture diagrams)

---

## 12. Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1.1 - Extract Utilities | 2 hours | None |
| 1.2 - Expand Models | 4 hours | None |
| 2.1 - Extract Simple Services | 3 hours | 1.2 |
| 2.2 - Extract Specialty Identifier | 4 hours | 1.2, 2.1 |
| 2.3 - Extract LLM Webhook Handler | 6 hours | 1.2, 2.1 |
| 2.4 - Extract Ranking Computation | 8 hours | 1.2, 2.1, 2.2 |
| 3.1 - Create Controller | 4 hours | 2.1-2.4 |
| 4.1 - Refactor Routes | 2 hours | 3.1 |
| 5 - Critical Fixes | 2.5 hours | 2.3, 2.4 |
| Testing | 8 hours | All phases |
| Staging Validation | 1 week | Testing |
| Production Deployment | 1 week | Staging |

**Total Development Time**: ~44 hours (~1 week)
**Total Calendar Time**: 3 weeks (including staging + production validation)

---

## 13. Open Questions

1. **Product Decision**: Should we re-enable user email notifications? (Lines 484-527, 883-926)
   - **Recommendation**: Yes, users should be notified when analysis completes.

2. **Product Decision**: Can we remove legacy single-location format? (Lines 1098-1148)
   - **Recommendation**: Yes if no clients use it. Check logs for usage.

3. **Infrastructure Decision**: Should we replace in-memory batch status with Redis/DB?
   - **Recommendation**: Yes for production reliability. Current approach loses state on restart.

4. **Infrastructure Decision**: Should we use a proper job queue (Bull, BullMQ) instead of `setImmediate()`?
   - **Recommendation**: Yes for better observability, retry logic, and failure recovery.

5. **Testing Decision**: Do we have n8n staging environment for webhook testing?
   - **Recommendation**: Required for E2E testing. Coordinate with n8n team.

---

## 14. Success Metrics

**Before Refactor**:
- Route LOC: 2,172
- Direct db() calls: 47
- Test coverage: Unknown (likely <20%)
- Data loss bug: **PRESENT** 🔴
- Code duplication: 822 LOC (processBatch functions)

**After Refactor**:
- Route LOC: ~150 (93% reduction)
- Direct db() calls: 0 (100% moved to models)
- Test coverage: >80% (unit + integration + E2E)
- Data loss bug: **FIXED** ✅
- Code duplication: 0 (consolidated batch processing)

**Performance Metrics** (must not degrade):
- Batch processing time: <30s for 10 locations
- Webhook response time: <500ms
- Endpoint response times: <200ms (p95)
- Memory usage: <100MB for 20 active batches

---

## 15. Alternatives Considered

### Alternative 1: Incremental Refactor (Endpoint by Endpoint)

**Pros**:
- Lower risk per change
- Easier to review

**Cons**:
- Longer timeline (3-4 weeks)
- More temporary duplication
- Harder to consolidate batch processing

**Decision**: Rejected. Batch processing is tightly coupled; incremental refactor would be messy.

---

### Alternative 2: Rewrite from Scratch

**Pros**:
- Clean slate
- Modern patterns

**Cons**:
- **VERY HIGH RISK** (rewrite fallacy)
- 3-6 weeks development
- High chance of introducing new bugs

**Decision**: Rejected. Refactor is safer.

---

### Alternative 3: Extract Services Only (Skip Model Layer)

**Pros**:
- Faster (skip model expansion)

**Cons**:
- Services would call db() directly (anti-pattern)
- No transaction safety improvements
- **Data loss bug not fixed**

**Decision**: Rejected. Model layer is critical for transaction safety.

---

## 16. Conclusion

This refactor addresses the **MOST COMPLEX route file** in the codebase with **CRITICAL BUGS** including a data loss risk. The plan is detailed, phased, and testable. The primary risk is the complexity of batch orchestration, but the benefits (transaction safety, maintainability, testability) far outweigh the risks.

**Key Deliverables**:
1. **Fix data loss bug** (transaction for task archive + insert)
2. **Reduce route LOC by 93%** (2,172 → 150)
3. **Eliminate 822 LOC of duplication** (consolidate batch processing)
4. **Improve testability** (unit + integration + E2E tests)
5. **Enable future improvements** (Redis status store, job queue)

**Recommendation**: Proceed with phased approach. Allocate 3 weeks (1 week dev + 2 weeks validation).

---

*Plan created: 2026-02-18*
*File: `/Users/rustinedave/Desktop/alloro-app/plans/routes-refactor-plans/practiceRanking-refactor-plan.md`*
