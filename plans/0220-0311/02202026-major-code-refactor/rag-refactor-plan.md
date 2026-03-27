# RAG Route Refactor Plan

**Route File:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/rag.ts`
**Current LOC:** 957 lines
**Target Pattern:** Route → Controller → Service → Model

---

## 1. Current State

### Overview
Comprehensive RAG (Retrieval Augmented Generation) pipeline that ingests Notion databases, processes pages, generates embeddings, and stores them in PostgreSQL. This is a complex, long-running operation with extensive orchestration, logging, and error handling.

### Endpoints
1. **GET /api/rag**
   - Runs complete RAG pipeline
   - Validates environment variables (NOTION_TOKEN, OPENAI_API_KEY)
   - Orchestrates: fetch databases → fetch pages → extract content → chunk text → generate embeddings → save to DB
   - Returns detailed JSON summary with statistics, database results, skipped items, and errors
   - Logs to files: `src/logs/rag.log` and `src/logs/rag-error.log`
   - Returns: `RAGSummary` object (see line 129-145)

### Current Dependencies
- `express` (Router, Request, Response)
- `axios` (Notion API, OpenAI API calls)
- `../database/connection` (db instance)
- `fs` (file system logging)
- `path` (log file paths)
- Direct database queries using `db("knowledgebase_embeddings")`

### Current Responsibilities (All in Route File)

#### 1. Configuration (Lines 23-40)
- Environment variables
- Constants (API versions, chunk sizes, embedding model)
- Log directory setup
- File system initialization

#### 2. Type Definitions (Lines 46-145)
- 11 TypeScript interfaces for data structures
- Notion types, content types, embedding types, result types, summary types

#### 3. Logging (Lines 154-175)
- File-based logging with timestamps
- Error logging with stack traces
- Console output mirroring

#### 4. Notion API Integration (Lines 184-400)
- Fetch databases from Notion workspace
- Fetch pages for each database (with pagination)
- Fetch page content blocks (with pagination)
- Extract text from various block types
- Extract and format page properties

#### 5. Text Processing (Lines 409-500)
- Chunk text into ~2048 character segments
- Handle paragraph boundaries
- Handle sentence boundaries
- Handle word boundaries (forced split for long content)

#### 6. OpenAI Integration (Lines 509-530)
- Generate embeddings using `text-embedding-3-small` model
- Error handling for API failures

#### 7. Database Operations (Lines 539-576)
- Save embeddings to `knowledgebase_embeddings` table
- Truncate embeddings table (commented out)
- Direct `db()` calls

#### 8. Pipeline Orchestration (Lines 585-892)
- `processPage()` - Processes single page (fetch content, chunk, embed, save)
- `processDatabase()` - Processes all pages in a database
- `runRAGPipeline()` - Main orchestrator for entire pipeline
- Statistics tracking (databases, pages, chunks, embeddings, errors)
- Error collection and categorization
- Duration tracking

#### 9. Route Handler (Lines 911-951)
- Environment validation
- Pipeline execution
- Response formatting
- Error handling

### Issues
- **Massive single-file complexity** (957 LOC)
- **Mixed concerns** - API integration, text processing, business logic, route handling all in one file
- **Hard to test** - Complex orchestration logic intertwined with I/O
- **Hard to maintain** - Finding specific logic requires scrolling through entire file
- **Direct database calls** bypass model layer
- **No separation of concerns** between different API integrations
- **File system logging** embedded in business logic
- **Error handling** duplicated across many functions
- **No reusability** - Logic locked into route file

---

## 2. Target Architecture

### Folder Structure
```
src/
├── routes/
│   └── rag.ts                                # Route definitions only (~20-30 lines)
├── controllers/
│   └── rag/
│       ├── rag.controller.ts                 # Main controller (~150-200 lines)
│       ├── feature-services/
│       │   ├── service.notion-client.ts      # Notion API abstraction (~250-300 lines)
│       │   ├── service.openai-client.ts      # OpenAI API abstraction (~50-70 lines)
│       │   ├── service.rag-orchestrator.ts   # Pipeline orchestration (~300-350 lines)
│       │   ├── service.text-chunker.ts       # Text chunking logic (~120-150 lines)
│       │   └── service.rag-logger.ts         # File logging abstraction (~80-100 lines)
│       └── feature-utils/
│           ├── util.notion-parser.ts         # Notion data extraction (~150-180 lines)
│           ├── util.rag-validator.ts         # Environment/input validation (~40-50 lines)
│           └── util.rag-types.ts             # All TypeScript interfaces (~120-150 lines)
├── models/
│   └── KnowledgebaseEmbeddingModel.ts        # Already exists, may need 1 new method
```

### Layer Responsibilities

#### Route Layer (`routes/rag.ts`)
- Route definitions only
- Maps GET /rag to controller method
- No business logic
- No error handling (delegated to controller)
- **Target LOC:** ~20-30 lines

#### Controller Layer (`controllers/rag/rag.controller.ts`)
- Request/response handling
- Environment validation
- Orchestrates service calls (delegates to RagOrchestrator)
- Error handling and response formatting
- HTTP status code decisions
- **Target LOC:** ~150-200 lines

#### Service Layer

##### 1. `service.notion-client.ts`
- Encapsulates all Notion API communication
- Handles Notion API pagination
- Rate limiting / retry logic (if needed)
- Error handling specific to Notion API
- Methods:
  - `fetchDatabases(): Promise<NotionDatabase[]>`
  - `fetchPagesForDatabase(dbId): Promise<NotionPage[]>`
  - `fetchPageContent(pageId): Promise<string>` (delegates to util for parsing)
- **Target LOC:** ~250-300 lines

##### 2. `service.openai-client.ts`
- Encapsulates OpenAI API communication
- Handles API errors
- Potential retry logic
- Methods:
  - `generateEmbedding(text: string): Promise<number[]>`
- **Target LOC:** ~50-70 lines

##### 3. `service.rag-orchestrator.ts`
- Main pipeline orchestration logic
- Coordinates all services (Notion, OpenAI, Logger, Model)
- Statistics tracking
- Error aggregation
- Methods:
  - `runPipeline(): Promise<RAGSummary>`
  - `processDatabase(db, stats): Promise<DatabaseResult>`
  - `processPage(page, db, stats): Promise<PageResult>`
- **Target LOC:** ~300-350 lines

##### 4. `service.text-chunker.ts`
- Pure text processing logic
- Chunks text by paragraph/sentence/word boundaries
- Configurable chunk size
- Methods:
  - `chunkText(text: string, maxChars: number): Chunk[]`
- **Target LOC:** ~120-150 lines

##### 5. `service.rag-logger.ts`
- File-based logging abstraction
- Log file management
- Timestamp formatting
- Methods:
  - `log(message: string, isError: boolean): void`
  - `logError(operation: string, error: any): void`
  - `initializeLogDirectory(): void`
- **Target LOC:** ~80-100 lines

#### Utils Layer

##### 1. `util.notion-parser.ts`
- Notion data transformation utilities
- Parse Notion blocks into plain text
- Extract page properties
- Pure functions (no I/O)
- Methods:
  - `extractTextFromBlock(block: any): string`
  - `extractRichText(richText: any[]): string`
  - `extractPageProperties(page: NotionPage): Record<string, any>`
- **Target LOC:** ~150-180 lines

##### 2. `util.rag-validator.ts`
- Environment validation
- Input validation
- Methods:
  - `validateEnvironment(): { valid: boolean; errors: string[] }`
  - `validateChunkSize(size: number): boolean`
- **Target LOC:** ~40-50 lines

##### 3. `util.rag-types.ts`
- All TypeScript interfaces and types
- Exported for use across services
- No logic, only type definitions
- **Target LOC:** ~120-150 lines

#### Model Layer (`models/KnowledgebaseEmbeddingModel.ts`)
- Already exists (34 lines)
- Methods available:
  - `bulkInsert(data[]): Promise<void>` ✅
  - `truncate(): Promise<void>` ✅
- Possibly add:
  - `insertEmbedding(data: Partial<IKnowledgebaseEmbedding>): Promise<void>` (wrapper for single insert)

---

## 3. Code Mapping

### Route File → Components (Line-by-Line Breakdown)

| Current Lines | Logic | Target Location |
|---------------|-------|----------------|
| 1-13 | File header comments | Remove or move to README |
| 15-19 | Imports (express, axios, db, fs, path) | Split across files |
| 23-40 | Configuration constants + log dir setup | `service.rag-logger.ts` + `util.rag-validator.ts` |
| 46-145 | Type definitions (11 interfaces) | `util.rag-types.ts` |
| 154-175 | Logging utilities (2 functions) | `service.rag-logger.ts` |
| 184-224 | `fetchNotionDatabases()` | `service.notion-client.ts` |
| 229-263 | `fetchPagesForDatabase()` | `service.notion-client.ts` |
| 268-305 | `fetchPageContent()` | `service.notion-client.ts` |
| 310-340 | `extractTextFromBlock()` | `util.notion-parser.ts` |
| 345-348 | `extractRichText()` | `util.notion-parser.ts` |
| 353-400 | `extractPageProperties()` | `util.notion-parser.ts` |
| 409-500 | `chunkText()` (93 lines) | `service.text-chunker.ts` |
| 509-530 | `generateEmbedding()` | `service.openai-client.ts` |
| 539-562 | `saveEmbedding()` | Replaced by `KnowledgebaseEmbeddingModel.bulkInsert()` or new method |
| 567-576 | `truncateEmbeddingsTable()` | Replaced by `KnowledgebaseEmbeddingModel.truncate()` |
| 585-676 | `processPage()` | `service.rag-orchestrator.ts` |
| 681-747 | `processDatabase()` | `service.rag-orchestrator.ts` |
| 752-892 | `runRAGPipeline()` | `service.rag-orchestrator.ts` |
| 911-951 | Route handler (GET /) | `rag.controller.ts` → `runPipeline()` |

### Database Calls → Model Calls

| Current DB Call (Lines) | Model Method Replacement |
|------------------------|--------------------------|
| Lines 541-557: `db("knowledgebase_embeddings").insert({...})` | `KnowledgebaseEmbeddingModel.insertEmbedding(data)` (new method) OR `bulkInsert([data])` |
| Lines 570: `db("knowledgebase_embeddings").del()` | `KnowledgebaseEmbeddingModel.truncate()` ✅ (already exists) |

**Note:** The route currently inserts embeddings one at a time. Consider refactoring orchestrator to batch embeddings per page and use `bulkInsert()` for better performance.

### Notion API Logic → Service

| Logic (Lines) | Target |
|--------------|--------|
| Lines 184-224: Fetch all databases | `NotionClient.fetchDatabases()` |
| Lines 229-263: Fetch pages with pagination | `NotionClient.fetchPagesForDatabase()` |
| Lines 268-305: Fetch page content with pagination | `NotionClient.fetchPageContent()` (uses util for parsing) |

### Notion Parsing Logic → Utils

| Logic (Lines) | Target |
|--------------|--------|
| Lines 310-340: Extract text from block (switch statement) | `NotionParser.extractTextFromBlock()` |
| Lines 345-348: Extract plain text from rich_text array | `NotionParser.extractRichText()` |
| Lines 353-400: Extract and format page properties | `NotionParser.extractPageProperties()` |

### OpenAI Logic → Service

| Logic (Lines) | Target |
|--------------|--------|
| Lines 509-530: Generate embedding via OpenAI API | `OpenAIClient.generateEmbedding()` |

### Text Processing → Service

| Logic (Lines) | Target |
|--------------|--------|
| Lines 409-500: Chunk text by paragraph/sentence/word | `TextChunker.chunkText()` |

### Orchestration Logic → Service

| Logic (Lines) | Target |
|--------------|--------|
| Lines 585-676: Process single page (fetch, chunk, embed, save) | `RagOrchestrator.processPage()` |
| Lines 681-747: Process database (iterate pages) | `RagOrchestrator.processDatabase()` |
| Lines 752-892: Main pipeline (iterate databases, stats, errors) | `RagOrchestrator.runPipeline()` |

### Logging → Service

| Logic (Lines) | Target |
|--------------|--------|
| Lines 154-166: `log()` function | `RagLogger.log()` |
| Lines 171-175: `logError()` function | `RagLogger.logError()` |
| Lines 38-40: Log directory initialization | `RagLogger.initializeLogDirectory()` |

### Validation → Utils

| Logic (Lines) | Target |
|--------------|--------|
| Lines 914-929: Environment variable validation | `RagValidator.validateEnvironment()` |

---

## 4. Step-by-Step Migration

### Step 1: Create Type Definitions
**File:** `src/controllers/rag/feature-utils/util.rag-types.ts`

**Purpose:** Centralize all TypeScript interfaces

**Content:** Extract all interfaces from lines 46-145:
- `NotionDatabase`
- `NotionPage`
- `PageContent`
- `Chunk`
- `EmbeddingData`
- `RAGStats`
- `PageResult`
- `DatabaseResult`
- `SkippedDatabase`
- `ErrorDetail`
- `RAGSummary`

**Dependencies:** None (pure types)

**Estimated LOC:** ~120-150

---

### Step 2: Create Validator Util
**File:** `src/controllers/rag/feature-utils/util.rag-validator.ts`

**Purpose:** Environment and input validation

**Content:**
- Extract constants (NOTION_TOKEN, OPENAI_API_KEY, CHUNK_SIZE, etc.)
- `validateEnvironment()` - Checks env vars, returns structured result
- `validateChunkSize()` - Validates chunk size if configurable

**Dependencies:**
- None (uses process.env directly)

**Estimated LOC:** ~40-50

---

### Step 3: Create Logger Service
**File:** `src/controllers/rag/feature-services/service.rag-logger.ts`

**Purpose:** File-based logging abstraction

**Content:**
- Extract log directory setup (lines 38-40)
- Extract `log()` function (lines 154-166)
- Extract `logError()` function (lines 171-175)
- Add `initializeLogDirectory()` method
- Store LOG_DIR, LOG_FILE, ERROR_LOG_FILE as class properties

**Dependencies:**
- `fs`, `path`

**Estimated LOC:** ~80-100

---

### Step 4: Create Notion Parser Util
**File:** `src/controllers/rag/feature-utils/util.notion-parser.ts`

**Purpose:** Parse Notion data structures (pure functions)

**Content:**
- Extract `extractTextFromBlock()` (lines 310-340)
- Extract `extractRichText()` (lines 345-348)
- Extract `extractPageProperties()` (lines 353-400)
- Pure functions, no I/O, fully testable

**Dependencies:**
- `util.rag-types.ts` (NotionPage interface)

**Estimated LOC:** ~150-180

---

### Step 5: Create Text Chunker Service
**File:** `src/controllers/rag/feature-services/service.text-chunker.ts`

**Purpose:** Text processing logic

**Content:**
- Extract `chunkText()` function (lines 409-500)
- Make configurable (default chunk size from validator)
- Pure function, no side effects, fully testable

**Dependencies:**
- `util.rag-types.ts` (Chunk interface)

**Estimated LOC:** ~120-150

---

### Step 6: Create Notion Client Service
**File:** `src/controllers/rag/feature-services/service.notion-client.ts`

**Purpose:** Notion API abstraction

**Content:**
- Extract `fetchNotionDatabases()` (lines 184-224)
- Extract `fetchPagesForDatabase()` (lines 229-263)
- Extract `fetchPageContent()` (lines 268-305)
  - Delegates to `NotionParser.extractTextFromBlock()`
- Store NOTION_TOKEN, NOTION_API_VERSION as class properties or config
- All Notion API logic in one place

**Dependencies:**
- `axios`
- `util.rag-types.ts` (NotionDatabase, NotionPage)
- `util.notion-parser.ts` (for parsing blocks)
- `service.rag-logger.ts` (for logging)

**Estimated LOC:** ~250-300

---

### Step 7: Create OpenAI Client Service
**File:** `src/controllers/rag/feature-services/service.openai-client.ts`

**Purpose:** OpenAI API abstraction

**Content:**
- Extract `generateEmbedding()` (lines 509-530)
- Store OPENAI_API_KEY, EMBEDDING_MODEL as class properties or config
- Error handling specific to OpenAI API

**Dependencies:**
- `axios`
- `service.rag-logger.ts` (for logging)

**Estimated LOC:** ~50-70

---

### Step 8: Create RAG Orchestrator Service
**File:** `src/controllers/rag/feature-services/service.rag-orchestrator.ts`

**Purpose:** Pipeline orchestration and business logic

**Content:**
- Extract `processPage()` (lines 585-676)
- Extract `processDatabase()` (lines 681-747)
- Extract `runRAGPipeline()` (lines 752-892)
- Coordinates NotionClient, OpenAIClient, TextChunker, KnowledgebaseEmbeddingModel, RagLogger
- Statistics tracking, error aggregation, duration tracking

**Dependencies:**
- `util.rag-types.ts` (all result types, stats)
- `service.notion-client.ts`
- `service.openai-client.ts`
- `service.text-chunker.ts`
- `service.rag-logger.ts`
- `../../models/KnowledgebaseEmbeddingModel`
- `util.notion-parser.ts`

**Estimated LOC:** ~300-350

---

### Step 9: Add Model Method (If Needed)
**File:** `src/models/KnowledgebaseEmbeddingModel.ts`

**Purpose:** Single embedding insert wrapper

**Content:**
```typescript
static async insertEmbedding(
  data: Partial<IKnowledgebaseEmbedding>,
  trx?: QueryContext
): Promise<void> {
  const serialized = this.serializeJsonFields({
    ...data,
    created_at: new Date(),
  });
  await this.table(trx).insert(serialized);
}
```

**Alternative:** Use existing `bulkInsert()` with single-item array:
```typescript
await KnowledgebaseEmbeddingModel.bulkInsert([data]);
```

**Recommendation:** Use existing `bulkInsert([data])` to avoid adding new method. Or refactor orchestrator to batch embeddings per page and call `bulkInsert()` once per page.

**Estimated LOC:** +10 lines (if new method added), or 0 lines (if using existing bulkInsert)

---

### Step 10: Create Controller
**File:** `src/controllers/rag/rag.controller.ts`

**Purpose:** Request/response orchestration, error handling

**Methods:**
1. `runPipeline(req: Request, res: Response): Promise<Response>`
   - Validates environment using `RagValidator.validateEnvironment()`
   - Returns 500 if env vars missing
   - Calls `RagOrchestrator.runPipeline()`
   - Returns formatted success response with logs metadata
   - Handles errors with proper status codes

**Dependencies:**
- `express` (Request, Response)
- `service.rag-orchestrator.ts`
- `util.rag-validator.ts`
- `service.rag-logger.ts` (for log file paths)

**Error Handling Pattern:**
```typescript
try {
  // Environment validation
  const validation = RagValidator.validateEnvironment();
  if (!validation.valid) {
    return res.status(500).json({
      success: false,
      error: 'CONFIGURATION_ERROR',
      message: 'Missing required environment variables',
      details: validation.errors
    });
  }

  // Run pipeline
  const summary = await RagOrchestrator.runPipeline();

  // Return success response
  return res.json({
    ...summary,
    logs: {
      mainLog: RagLogger.getLogFilePath(),
      errorLog: RagLogger.getErrorLogFilePath(),
    },
  });
} catch (error: any) {
  RagLogger.logError('RAG endpoint', error);
  return res.status(500).json({
    success: false,
    error: 'RAG_PIPELINE_FAILED',
    message: error.message || 'Unknown error occurred',
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
}
```

**Estimated LOC:** ~150-200

---

### Step 11: Refactor Route File
**File:** `src/routes/rag.ts`

**New Content:**
```typescript
import express from "express";
import { RagController } from "../controllers/rag/rag.controller";

const router = express.Router();

/**
 * GET /rag
 * Runs the complete RAG pipeline
 */
router.get("/", RagController.runPipeline);

export default router;
```

**Remove:**
- All imports except express
- All constants
- All type definitions
- All utility functions
- All API functions
- All processing functions
- All orchestration logic
- All try/catch blocks in route handler
- File header comments (move to controller or README)

**Expected LOC After Refactor:** ~20-30 lines (route definition only)

---

### Step 12: Update Imports
Ensure all files have correct import paths:
- Controller imports orchestrator, validator, logger
- Orchestrator imports all services, model, types
- Services import types, logger, parser utils
- Route imports controller

---

### Step 13: Manual Testing
1. Test GET /api/rag with valid env vars
2. Verify pipeline runs successfully
3. Check log files are created and populated
4. Verify embeddings are saved to database
5. Test GET /api/rag with missing NOTION_TOKEN (expect 500)
6. Test GET /api/rag with missing OPENAI_API_KEY (expect 500)
7. Verify response format matches original (RAGSummary structure)
8. Verify error handling (Notion API down, OpenAI API down, DB down)
9. Check console output mirrors file logs
10. Verify statistics tracking (counts match reality)

---

## 5. Model Replacements (Detailed)

### Replacement 1: Save Single Embedding
**Current (Lines 541-557):**
```typescript
await db("knowledgebase_embeddings").insert({
  page_id: data.page_id,
  database_id: data.database_id,
  chunk_index: data.chunk_index,
  text: data.chunk_text,
  embedding: JSON.stringify(data.embedding),
  metadata: {
    page_id: data.page_id,
    database_id: data.database_id,
    database_name: data.database_name,
    page_title: data.page_title,
    properties: data.properties,
    token_count: data.chunk_text.split(/\s+/).length,
    source: "notion",
  },
  created_at: new Date(),
});
```

**Replacement Option 1 (Use existing bulkInsert):**
```typescript
await KnowledgebaseEmbeddingModel.bulkInsert([{
  page_id: data.page_id,
  database_id: data.database_id,
  chunk_index: data.chunk_index,
  text: data.chunk_text,
  embedding: data.embedding, // Model handles JSON serialization
  metadata: {
    page_id: data.page_id,
    database_id: data.database_id,
    database_name: data.database_name,
    page_title: data.page_title,
    properties: data.properties,
    token_count: data.chunk_text.split(/\s+/).length,
    source: "notion",
  },
}]);
```

**Replacement Option 2 (Add new method):**
```typescript
await KnowledgebaseEmbeddingModel.insertEmbedding({
  page_id: data.page_id,
  database_id: data.database_id,
  chunk_index: data.chunk_index,
  text: data.chunk_text,
  embedding: data.embedding,
  metadata: { /* same as above */ },
});
```

**Recommendation:** Use Option 1 (existing `bulkInsert`) unless performance profiling shows single inserts are causing issues. Better yet, refactor `processPage()` to collect all embeddings for a page and insert in one `bulkInsert()` call.

**Performance Improvement Opportunity:**
Current code inserts embeddings one at a time in a loop (line 638). Refactor to:
```typescript
// Collect all embeddings for the page
const embeddingsToInsert = [];
for (const chunk of chunks) {
  const embedding = await generateEmbedding(chunk.text);
  embeddingsToInsert.push({
    page_id: page.id,
    database_id: database.id,
    chunk_index: chunk.index,
    text: chunk.text,
    embedding: embedding,
    metadata: { /* ... */ },
  });
}

// Bulk insert all embeddings for this page
await KnowledgebaseEmbeddingModel.bulkInsert(embeddingsToInsert);
```

This reduces DB round trips from N (one per chunk) to 1 per page.

---

### Replacement 2: Truncate Embeddings Table
**Current (Lines 570):**
```typescript
await db("knowledgebase_embeddings").del();
```

**Replacement:**
```typescript
await KnowledgebaseEmbeddingModel.truncate();
```

**Notes:**
- Model method already exists ✅
- Exact same behavior
- No changes needed to model

---

## 6. Files to Create

### 6.1 Type Definitions Util
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-utils/util.rag-types.ts`

**Responsibilities:**
- All TypeScript interfaces
- No logic, only type definitions

**Exports:**
- `NotionDatabase`
- `NotionPage`
- `PageContent`
- `Chunk`
- `EmbeddingData`
- `RAGStats`
- `PageResult`
- `DatabaseResult`
- `SkippedDatabase`
- `ErrorDetail`
- `RAGSummary`

**Estimated LOC:** ~120-150

---

### 6.2 Validator Util
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-utils/util.rag-validator.ts`

**Responsibilities:**
- Environment validation
- Configuration constants
- Input validation

**Exports:**
- `RagValidator` class with static methods:
  - `validateEnvironment(): { valid: boolean; errors: string[] }`
  - `getNotionToken(): string`
  - `getOpenAIKey(): string`
  - `getChunkSize(): number`
  - `getEmbeddingModel(): string`

**Estimated LOC:** ~40-50

---

### 6.3 Logger Service
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-services/service.rag-logger.ts`

**Responsibilities:**
- File-based logging
- Log directory management
- Timestamp formatting

**Exports:**
- `RagLogger` class with static methods:
  - `initializeLogDirectory(): void`
  - `log(message: string, isError?: boolean): void`
  - `logError(operation: string, error: any): void`
  - `getLogFilePath(): string`
  - `getErrorLogFilePath(): string`

**Estimated LOC:** ~80-100

---

### 6.4 Notion Parser Util
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-utils/util.notion-parser.ts`

**Responsibilities:**
- Parse Notion blocks
- Extract text from rich_text arrays
- Extract page properties

**Exports:**
- `NotionParser` class with static methods:
  - `extractTextFromBlock(block: any): string`
  - `extractRichText(richText: any[]): string`
  - `extractPageProperties(page: NotionPage): Record<string, any>`

**Estimated LOC:** ~150-180

---

### 6.5 Text Chunker Service
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-services/service.text-chunker.ts`

**Responsibilities:**
- Text chunking logic
- Paragraph/sentence/word boundary handling

**Exports:**
- `TextChunker` class with static method:
  - `chunkText(text: string, maxChars?: number): Chunk[]`

**Estimated LOC:** ~120-150

---

### 6.6 Notion Client Service
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-services/service.notion-client.ts`

**Responsibilities:**
- Notion API communication
- Pagination handling
- Error handling

**Exports:**
- `NotionClient` class with static methods:
  - `fetchDatabases(): Promise<NotionDatabase[]>`
  - `fetchPagesForDatabase(databaseId: string): Promise<NotionPage[]>`
  - `fetchPageContent(pageId: string): Promise<string>`

**Estimated LOC:** ~250-300

---

### 6.7 OpenAI Client Service
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-services/service.openai-client.ts`

**Responsibilities:**
- OpenAI API communication
- Embedding generation
- Error handling

**Exports:**
- `OpenAIClient` class with static method:
  - `generateEmbedding(text: string): Promise<number[]>`

**Estimated LOC:** ~50-70

---

### 6.8 RAG Orchestrator Service
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/feature-services/service.rag-orchestrator.ts`

**Responsibilities:**
- Pipeline orchestration
- Statistics tracking
- Error aggregation
- Coordinates all services

**Exports:**
- `RagOrchestrator` class with static methods:
  - `runPipeline(): Promise<RAGSummary>`
  - `processDatabase(database: NotionDatabase, stats: RAGStats): Promise<DatabaseResult>` (private)
  - `processPage(page: NotionPage, database: NotionDatabase, stats: RAGStats): Promise<PageResult>` (private)

**Estimated LOC:** ~300-350

---

### 6.9 Controller
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/controllers/rag/rag.controller.ts`

**Responsibilities:**
- Request/response handling
- Environment validation
- Error handling
- Response formatting

**Exports:**
- `RagController` class with static method:
  - `runPipeline(req: Request, res: Response): Promise<Response>`

**Estimated LOC:** ~150-200

---

## 7. Files to Modify

### 7.1 Route File
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/rag.ts`

**Changes:**
- Remove everything except router definition (lines 1-957)
- Remove all imports except `express`
- Add controller import
- Replace route handler with controller method reference
- Keep route definitions only

**Before LOC:** 957
**After LOC:** ~20-30

**Diff Summary:**
- Removed: ~930 lines (all logic)
- Added: ~3 lines (controller import + route mapping)

---

### 7.2 Model File (Optional)
**Path:** `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/models/KnowledgebaseEmbeddingModel.ts`

**Changes:**
- **Option 1 (Recommended):** No changes - use existing `bulkInsert([data])`
- **Option 2:** Add `insertEmbedding()` method as wrapper

**Before LOC:** 34
**After LOC:** 34 (Option 1) or ~45 (Option 2)

---

## 8. Risk Assessment

### Low Risk Items ✅

- **Model methods already exist**
  `bulkInsert()` and `truncate()` are already implemented and tested. No new model behavior needed (unless adding `insertEmbedding()` wrapper).

- **Pure functions are easy to extract**
  Text chunking, Notion parsing, validation logic are all pure functions with no side effects. Easy to test in isolation.

- **No schema changes**
  Database table remains unchanged.

- **No breaking API changes**
  Request/response format stays identical (RAGSummary structure).

- **Logging is self-contained**
  File logging logic is straightforward to extract into service.

### Medium Risk Items ⚠️

- **Complex orchestration logic**
  The pipeline orchestrator has nested loops, statistics tracking, error aggregation, and conditional logic. Must preserve exact behavior when refactoring.

- **Pagination logic**
  Notion API pagination (has_more, start_cursor) must be preserved exactly. Test with databases that have >100 pages.

- **Error handling consistency**
  Many functions have try/catch blocks with specific error messages. Must preserve all error messages and codes.

- **Logging statements**
  Extensive logging throughout pipeline (database names, page names, progress messages). Must preserve all log output exactly for debugging.

- **Statistics tracking**
  Stats are mutated throughout pipeline (passed by reference). Must ensure all counts increment correctly after refactor.

### High Risk Items 🔴

- **Long-running operation**
  Pipeline can run for minutes/hours depending on Notion workspace size. Hard to test full pipeline quickly. Need staging environment with real Notion data.

- **External API dependencies**
  Notion API and OpenAI API failures must be handled gracefully. Original code has some error handling, but may need improvement (rate limiting, retries).

- **Performance implications**
  Current code inserts embeddings one at a time. Refactoring to bulk insert could improve performance but changes transaction boundaries. Test thoroughly.

- **File system I/O**
  Log files are created and written throughout pipeline. Ensure directory permissions, disk space, and concurrent writes are handled properly.

- **Memory usage**
  Processing large databases with many pages and chunks could consume significant memory. Original code processes sequentially, which is safe. Refactor must not introduce parallelism without careful memory management.

### What Could Go Wrong

#### 1. Orchestrator Logic Regression
**Scenario:** Nested loops in `runPipeline()` / `processDatabase()` / `processPage()` don't behave identically after refactor. Statistics are off, or pages are skipped.

**Mitigation:**
- Copy orchestration logic verbatim from original
- Test with small Notion workspace (1 database, 3 pages)
- Compare statistics output before/after
- Verify database record count matches
- Add logging at each loop iteration to trace flow

#### 2. Notion API Pagination Failure
**Scenario:** Pagination logic breaks, causing pages to be skipped or duplicated.

**Mitigation:**
- Test with database that has >100 pages (forces pagination)
- Log page counts at each pagination iteration
- Verify all pages are fetched (compare with Notion UI count)
- Add unit test for pagination logic

#### 3. OpenAI API Rate Limiting
**Scenario:** Pipeline hits OpenAI rate limits (current code has no retry/backoff).

**Mitigation:**
- Add exponential backoff retry logic in `OpenAIClient`
- Catch rate limit errors specifically (429 status code)
- Log retries clearly
- Consider adding delay between embedding requests (not in scope for this refactor, but note for future)

#### 4. Database Transaction Issues
**Scenario:** Switching from individual inserts to bulk inserts changes transaction boundaries, causing partial failures to behave differently.

**Mitigation:**
- Test failure scenarios (kill process mid-pipeline)
- Verify database state after partial failure
- Consider adding transaction support to orchestrator
- Document rollback strategy

#### 5. Logging File Permissions
**Scenario:** Log directory not writable, or log files grow too large.

**Mitigation:**
- Initialize log directory with proper permissions in `RagLogger.initializeLogDirectory()`
- Handle file write errors gracefully (fallback to console.log only)
- Consider log rotation (not in scope, but note for future)

#### 6. Memory Exhaustion
**Scenario:** Processing very large Notion workspace exhausts server memory.

**Mitigation:**
- Keep sequential processing (don't parallelize)
- Stream data where possible (not feasible for embeddings, but note for future)
- Monitor memory usage during testing
- Document recommended hardware specs

#### 7. Type Definition Mismatches
**Scenario:** Moving types to separate file causes circular dependency or import issues.

**Mitigation:**
- Keep types pure (no logic)
- Avoid importing from services/controllers in types file
- Use `import type { ... }` where possible
- Verify TypeScript compilation before testing

#### 8. Response Format Mismatch
**Scenario:** Controller returns different JSON structure than original route.

**Mitigation:**
- Copy exact response structure from original (lines 934-940)
- Test with real request and compare JSON output
- Verify `RAGSummary` type is used correctly

---

## 9. Testing Strategy

### Manual Testing Checklist

#### Pre-Testing Setup
- [ ] Ensure Notion workspace has:
  - At least 3 databases
  - At least 1 database with 0 pages (test skipped database)
  - At least 1 database with >100 pages (test pagination)
  - At least 1 page with no content (test skipped page)
  - At least 1 page with very long content (test chunking)

#### Environment Validation
- [ ] GET /api/rag with valid env vars (expect 200 success)
- [ ] GET /api/rag with missing NOTION_TOKEN (expect 500 with specific error)
- [ ] GET /api/rag with missing OPENAI_API_KEY (expect 500 with specific error)

#### Pipeline Execution
- [ ] Pipeline runs to completion
- [ ] Statistics match reality:
  - [ ] `databasesProcessed` count is correct
  - [ ] `pagesProcessed` count is correct
  - [ ] `chunksCreated` count is correct
  - [ ] `embeddingsGenerated` count is correct
- [ ] Embeddings are saved to database (verify with SQL query)
- [ ] Response format matches original `RAGSummary` structure

#### Logging Verification
- [ ] Log directory is created (`src/logs/`)
- [ ] Main log file is created and populated (`rag.log`)
- [ ] Error log file is created (even if empty) (`rag-error.log`)
- [ ] Console output matches file logs
- [ ] Timestamps are formatted correctly
- [ ] All progress messages are logged (database names, page names, etc.)

#### Error Handling
- [ ] Database with 0 pages is skipped and logged correctly
- [ ] Page with 0 content is skipped and logged correctly
- [ ] Notion API error is caught and logged (test by using invalid token temporarily)
- [ ] OpenAI API error is caught and logged (test by using invalid key temporarily)
- [ ] Database connection error is caught and logged (test by stopping PostgreSQL temporarily)
- [ ] Partial failures don't crash entire pipeline (test by injecting error in one page)

#### Edge Cases
- [ ] Database with >100 pages (test pagination)
- [ ] Page with very long content (test chunking, verify chunks are ~2048 chars)
- [ ] Page with special characters (test encoding)
- [ ] Page with code blocks (test Notion block parsing)
- [ ] Page with nested blocks (test recursive parsing if applicable)

#### Performance
- [ ] Pipeline completes in reasonable time (compare with original)
- [ ] Memory usage stays stable (no memory leaks)
- [ ] Database inserts are efficient (bulk insert vs individual)

#### Regression Testing
- [ ] Run pipeline before refactor, save output JSON
- [ ] Run pipeline after refactor, save output JSON
- [ ] Compare outputs:
  - [ ] Same number of databases processed
  - [ ] Same number of pages processed
  - [ ] Same number of chunks created
  - [ ] Same number of embeddings generated
  - [ ] Same error count
  - [ ] Similar duration (within 10%)

---

### Unit Testing Opportunities (Future)

After refactor, these components are easily testable:

- **Pure Functions (High Priority):**
  - `TextChunker.chunkText()` - Test with various inputs (long text, short text, edge cases)
  - `NotionParser.extractTextFromBlock()` - Test each block type
  - `NotionParser.extractRichText()` - Test empty arrays, null values
  - `NotionParser.extractPageProperties()` - Test each property type
  - `RagValidator.validateEnvironment()` - Test with missing env vars

- **Services (Medium Priority):**
  - `NotionClient` - Mock axios, test pagination logic
  - `OpenAIClient` - Mock axios, test error handling
  - `RagLogger` - Mock fs, test log writing

- **Controller (Low Priority):**
  - `RagController.runPipeline()` - Mock services, test request/response

---

## 10. Rollback Plan

If issues arise after deployment:

### Immediate Rollback
1. Revert commit
2. Redeploy previous version of `rag.ts` route file
3. Monitor logs for success

### Git Strategy
1. Create refactor in separate branch (`refactor/rag-route`)
2. Test thoroughly in staging environment
3. Code review before merging to main
4. Use feature flag if possible (add env var `ENABLE_NEW_RAG_PIPELINE`)

### Incremental Rollout
1. Deploy to staging first
2. Run full pipeline in staging
3. Compare results with production data (if safe)
4. Monitor logs for errors
5. Deploy to production only after validation
6. Monitor production logs closely for first 24 hours

### Database Safety
- No schema changes = no database rollback needed
- `knowledgebase_embeddings` table can be truncated and re-run if needed
- Pipeline is idempotent (can be re-run safely)

### Emergency Hotfix
If critical bug is discovered after deployment:
1. Revert to previous version immediately
2. Investigate bug in separate branch
3. Add test case for bug
4. Fix bug
5. Re-deploy after validation

---

## 11. Definition of Done

- [ ] All 9 files created (controller, 5 services, 3 utils)
- [ ] Route file refactored to ~20-30 lines (route definitions only)
- [ ] All model methods replace direct db() calls
- [ ] All endpoints return identical response formats
- [ ] All error codes and messages preserved
- [ ] All logging statements preserved (file and console)
- [ ] Manual testing checklist completed
- [ ] No TypeScript compilation errors
- [ ] Code follows existing project conventions
- [ ] Imports use correct relative/absolute paths
- [ ] Pipeline runs successfully from start to finish
- [ ] Statistics match reality (verified with database query)
- [ ] Log files are created and populated correctly
- [ ] Edge cases handled (empty databases, pagination, errors)
- [ ] Performance is equivalent or better than original
- [ ] Documentation updated (if applicable)

---

## 12. Future Improvements (Out of Scope)

These are NOT part of this refactor but could be added later:

### Performance Optimizations
- [ ] Batch embeddings per page (use `bulkInsert()` once per page instead of per chunk)
- [ ] Parallelize page processing within a database (with concurrency limit)
- [ ] Add caching layer for embeddings (avoid re-processing unchanged pages)
- [ ] Add incremental updates (only process pages modified since last run)

### Reliability Improvements
- [ ] Add retry logic with exponential backoff for API calls
- [ ] Add rate limiting for OpenAI API (respect tier limits)
- [ ] Add circuit breaker pattern for external APIs
- [ ] Add transaction support to orchestrator (rollback on failure)
- [ ] Add idempotency checks (skip pages that already have embeddings)

### Observability Improvements
- [ ] Add structured logging (JSON logs for parsing)
- [ ] Add metrics export (Prometheus, CloudWatch, etc.)
- [ ] Add distributed tracing (OpenTelemetry)
- [ ] Add real-time progress updates (WebSocket or SSE)
- [ ] Add pipeline health checks

### Feature Additions
- [ ] Add support for other content sources (Google Docs, Confluence, etc.)
- [ ] Add support for different embedding models
- [ ] Add support for vector similarity search
- [ ] Add support for filtering databases (only process specific databases)
- [ ] Add support for dry-run mode (preview what would be processed)
- [ ] Add support for resuming interrupted pipeline
- [ ] Add support for scheduled pipeline runs (cron job)

### Testing Additions
- [ ] Add unit tests for all services and utils
- [ ] Add integration tests for full pipeline
- [ ] Add performance benchmarks
- [ ] Add load testing (large Notion workspaces)
- [ ] Add chaos engineering (simulate API failures)

### Documentation Additions
- [ ] Add API documentation (OpenAPI/Swagger)
- [ ] Add architecture diagram
- [ ] Add sequence diagram for pipeline flow
- [ ] Add troubleshooting guide
- [ ] Add runbook for common issues

---

## 13. Summary

This refactor transforms a monolithic 957-line route file into a clean, layered architecture:

### File Breakdown
- **Route file:** Route definitions only (~20-30 lines)
- **Controller:** Request orchestration, error handling (~150-200 lines)
- **Orchestrator Service:** Pipeline coordination (~300-350 lines)
- **Notion Client Service:** Notion API abstraction (~250-300 lines)
- **OpenAI Client Service:** OpenAI API abstraction (~50-70 lines)
- **Text Chunker Service:** Text processing logic (~120-150 lines)
- **Logger Service:** File logging abstraction (~80-100 lines)
- **Notion Parser Util:** Notion data extraction (~150-180 lines)
- **Validator Util:** Environment validation (~40-50 lines)
- **Types Util:** TypeScript interfaces (~120-150 lines)
- **Model:** Already exists, no changes needed (34 lines)

### Total LOC Summary
- **Current:** 957 lines (single file)
- **After Refactor:** ~1,280-1,580 lines (10 files)
- **Net Increase:** ~323-623 lines

**Why the increase?**
- Class structure boilerplate
- Separation of concerns (clearer boundaries)
- Better error handling
- More comprehensive logging
- Type safety improvements
- Future extensibility (easier to add features)

### Benefits
- **Maintainability:** Each component has single responsibility
- **Testability:** Services and utils are easily unit-tested
- **Reusability:** NotionClient, OpenAIClient, TextChunker can be used elsewhere
- **Readability:** Route file is now ~20 lines instead of 957
- **Debugging:** Easier to isolate issues to specific service
- **Extensibility:** Easy to add new features (e.g., other content sources)

### Risk Level: Medium-High
- Complex orchestration logic with nested loops and statistics
- Long-running operation hard to test quickly
- External API dependencies (Notion, OpenAI)
- File system I/O
- No existing unit tests to verify behavior

**Mitigation:** Thorough manual testing in staging with real Notion data. Incremental rollout. Feature flag for easy rollback.

### Execution Time Estimate: 4-6 hours
- Create 9 files (~3-4 hours)
- Refactor route file (~30 minutes)
- Manual testing (~1-1.5 hours)
- Fix issues, iterate (~30 minutes)
- Documentation updates (~15 minutes)

---

## 14. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          HTTP Request                            │
│                         GET /api/rag                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        routes/rag.ts                             │
│                    (Route Definitions)                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RagController.runPipeline()                    │
│              (Validation, Orchestration, Error Handling)         │
└─────┬───────────────────────────────────────────────────────────┘
      │
      ├─► RagValidator.validateEnvironment() ───► return errors if invalid
      │
      └─► RagOrchestrator.runPipeline() ─────────┬──────────────────┐
                                                  │                  │
                                                  ▼                  │
          ┌─────────────────────────────────────────────┐           │
          │     Iterate over Notion Databases           │           │
          └─────────────────┬───────────────────────────┘           │
                            │                                        │
                            ▼                                        │
          ┌─────────────────────────────────────────────┐           │
          │  RagOrchestrator.processDatabase()          │           │
          │  (Process all pages in database)            │           │
          └─────────────────┬───────────────────────────┘           │
                            │                                        │
                            ▼                                        │
          ┌─────────────────────────────────────────────┐           │
          │  RagOrchestrator.processPage()              │           │
          │  (Fetch, Chunk, Embed, Save)                │           │
          └─────┬─────────────────────────┬─────────────┘           │
                │                         │                         │
                │                         │                         │
    ┌───────────▼──────────┐   ┌──────────▼──────────┐            │
    │   NotionClient       │   │   TextChunker       │            │
    │  .fetchPageContent() │   │  .chunkText()       │            │
    └───────────┬──────────┘   └──────────┬──────────┘            │
                │                          │                        │
                ▼                          ▼                        │
    ┌──────────────────────┐   ┌──────────────────────┐           │
    │  NotionParser        │   │  OpenAIClient        │           │
    │ .extractTextFromBlock│   │ .generateEmbedding() │           │
    └──────────────────────┘   └──────────┬───────────┘           │
                                           │                        │
                                           ▼                        │
                              ┌────────────────────────┐           │
                              │ KnowledgebaseEmbedding │           │
                              │     Model.bulkInsert() │           │
                              └────────────────────────┘           │
                                                                    │
          ┌─────────────────────────────────────────────────────────┘
          │
          ▼
    ┌──────────────────────┐
    │   RagLogger          │
    │  .log() / .logError()│
    │  (writes to files)   │
    └──────────────────────┘
```

---

## 15. Dependencies Between Files

```
routes/rag.ts
└── RagController (controllers/rag/rag.controller.ts)
    ├── RagValidator (feature-utils/util.rag-validator.ts)
    ├── RagLogger (feature-services/service.rag-logger.ts)
    └── RagOrchestrator (feature-services/service.rag-orchestrator.ts)
        ├── NotionClient (feature-services/service.notion-client.ts)
        │   ├── NotionParser (feature-utils/util.notion-parser.ts)
        │   │   └── Types (feature-utils/util.rag-types.ts)
        │   ├── RagLogger
        │   └── Types
        ├── OpenAIClient (feature-services/service.openai-client.ts)
        │   └── RagLogger
        ├── TextChunker (feature-services/service.text-chunker.ts)
        │   └── Types
        ├── KnowledgebaseEmbeddingModel (models/KnowledgebaseEmbeddingModel.ts)
        ├── RagLogger
        └── Types
```

**Dependency Rules:**
- Utils depend only on types (no services)
- Services depend on utils, types, logger, model (no other services except via orchestrator)
- Orchestrator depends on all services
- Controller depends on orchestrator, validator, logger
- Route depends only on controller

---

## 16. Migration Checklist

Use this checklist during implementation:

### Setup
- [ ] Create directory structure:
  - [ ] `src/controllers/rag/`
  - [ ] `src/controllers/rag/feature-services/`
  - [ ] `src/controllers/rag/feature-utils/`

### File Creation (In Order)
- [ ] Step 1: Create `util.rag-types.ts` (types first, no dependencies)
- [ ] Step 2: Create `util.rag-validator.ts` (validator second, only uses process.env)
- [ ] Step 3: Create `service.rag-logger.ts` (logger third, uses fs/path)
- [ ] Step 4: Create `util.notion-parser.ts` (parser fourth, uses types)
- [ ] Step 5: Create `service.text-chunker.ts` (chunker fifth, uses types)
- [ ] Step 6: Create `service.notion-client.ts` (notion client sixth, uses parser + logger + types)
- [ ] Step 7: Create `service.openai-client.ts` (openai client seventh, uses logger)
- [ ] Step 8: Create `service.rag-orchestrator.ts` (orchestrator eighth, uses all services)
- [ ] Step 9: Create `rag.controller.ts` (controller ninth, uses orchestrator + validator + logger)
- [ ] Step 10: Refactor `routes/rag.ts` (route last, uses controller)

### Verification (After Each File)
- [ ] TypeScript compiles without errors
- [ ] All imports resolve correctly
- [ ] No circular dependencies

### Testing
- [ ] Run manual testing checklist (see section 9)
- [ ] Compare output with original implementation
- [ ] Verify all logs are generated
- [ ] Verify all statistics are correct
- [ ] Test error scenarios

### Cleanup
- [ ] Remove unused imports from route file
- [ ] Remove commented-out code (e.g., line 772 truncate call)
- [ ] Add JSDoc comments to public methods
- [ ] Format code with Prettier/ESLint

### Documentation
- [ ] Update README if applicable
- [ ] Add architecture diagram to docs
- [ ] Document environment variables
- [ ] Add troubleshooting guide

### Deployment
- [ ] Merge to staging branch
- [ ] Deploy to staging environment
- [ ] Run full pipeline in staging
- [ ] Monitor logs for 24 hours
- [ ] Deploy to production
- [ ] Monitor production logs

---

## 17. Code Review Checklist

When reviewing this refactor, verify:

### Functional Correctness
- [ ] Pipeline runs to completion without errors
- [ ] Statistics match reality (verified with database query)
- [ ] All pages are processed (no skipped pages unless expected)
- [ ] All embeddings are saved to database
- [ ] Response format matches original exactly
- [ ] Error handling is preserved

### Code Quality
- [ ] Single Responsibility Principle: Each class has one job
- [ ] DRY: No duplicated logic
- [ ] Pure functions where possible (no side effects)
- [ ] Proper error handling (try/catch, specific error messages)
- [ ] TypeScript types are correct (no `any` unless necessary)
- [ ] Imports are clean (no unused imports)
- [ ] Naming is clear and consistent

### Architecture
- [ ] Route file is thin (only route definitions)
- [ ] Controller orchestrates, doesn't contain business logic
- [ ] Services are independent (no cross-dependencies except via orchestrator)
- [ ] Utils are pure functions (no I/O)
- [ ] Model layer is used for all database access (no direct db() calls)

### Testing
- [ ] Manual testing checklist is complete
- [ ] Edge cases are tested
- [ ] Error scenarios are tested
- [ ] Performance is acceptable

### Documentation
- [ ] Code is self-documenting (clear names)
- [ ] Complex logic has comments
- [ ] Public methods have JSDoc
- [ ] README is updated if needed

---

This plan provides a complete roadmap for refactoring the RAG route from a 957-line monolith into a clean, maintainable, testable architecture. The refactor prioritizes separation of concerns, testability, and long-term maintainability while preserving exact functional behavior.
