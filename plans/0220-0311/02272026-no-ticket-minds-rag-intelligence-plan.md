# Minds RAG Intelligence — Plan

**Date:** 02/27/2026
**Ticket:** no-ticket
**Feature:** minds-rag-intelligence
**Tier:** Structural Feature

---

## Problem Statement

The Minds chat system sends the **entire brain markdown** (up to 50K chars) as context on every single chat message. This is:

1. **Slow** — large input token count on every API call
2. **Expensive** — ~15-20K tokens of brain context per message, billed every time
3. **Capped** — brain can't grow past 50K chars because it would blow up the context window and cost

The same problem exists in the **comparison service** (`service.minds-comparison.ts`), which sends the full brain + all scraped content to the LLM for proposal generation.

The current approach doesn't scale. A mind with a 50K char brain answering 100 messages/day burns tokens on repeated, mostly irrelevant context. The brain size limit also caps how "intelligent" a mind can be.

---

## Context Summary

### Current Architecture (What We're Changing)

**Chat flow** (`service.minds-chat.ts`):
- Loads published brain version → full `brain_markdown` string
- Builds system prompt: personality + **full brain** + rules
- Sends to Claude with conversation history
- Every message = full brain context = maximum token cost

**Comparison flow** (`service.minds-comparison.ts`):
- Loads published brain → full `brain_markdown`
- Sends full brain + all scraped markdown to Claude
- Asks for NEW/UPDATE/CONFLICT proposals
- Single massive LLM call

**Compile-publish flow** (`compilePublish.processor.ts`):
- 8-step BullMQ pipeline
- Applies proposals to markdown → creates new version → publishes
- No vector operations currently

### Existing RAG Infrastructure (Partial, Different System)

There's an existing RAG system at `src/controllers/rag/` built for Notion content ingestion:
- OpenAI `text-embedding-3-small` client exists (`service.openai-client.ts`)
- Text chunker exists (`service.text-chunker.ts`) — splits by paragraph → sentence → word, 2048 char chunks
- `KnowledgebaseEmbeddingModel` with `bulkInsert()` exists
- **But**: No migration for the table, pgvector not installed, no retrieval/query service, write-only

We will **reuse the OpenAI embedding client pattern** and **text chunker logic** but build the Minds RAG as a dedicated system within the minds feature services.

### Database Schema

All minds tables live in the `minds` schema. Key tables:
- `minds.minds` — core entity with `published_version_id`
- `minds.mind_versions` — immutable snapshots with `brain_markdown` and `version_number`
- `minds.mind_sync_runs` — background job records
- `minds.mind_sync_steps` — pipeline step tracking

### Stack

- PostgreSQL (Knex ORM)
- BullMQ + Redis (background workers)
- Anthropic SDK (`claude-sonnet-4-6`)
- OpenAI API (embeddings — already in codebase)
- Express.js backend
- React frontend (no frontend changes in this plan)

---

## Existing Patterns to Follow

1. **Model pattern**: Extend `BaseModel`, schema-qualified table names (`minds.table_name`), static methods, typed interfaces
2. **Feature service pattern**: `service.minds-*.ts` in `/controllers/minds/feature-services/`
3. **Migration pattern**: Sequential numbered files in `src/database/migrations/`
4. **Worker pattern**: BullMQ processors with `runStep()` helper for step tracking
5. **Environment config**: `process.env.MINDS_*` prefix for minds-specific config
6. **Embedding pattern**: OpenAI client at `service.openai-client.ts` — `generateEmbedding(text) → number[]`
7. **Chunking pattern**: `service.text-chunker.ts` — paragraph/sentence/word boundary splitting

---

## Proposed Approach

### Overview

Replace full-brain-in-context with **Retrieval-Augmented Generation (RAG)**:
1. When a brain version is published, chunk the markdown and store vector embeddings
2. At chat time, embed the user's query and retrieve only the most relevant chunks
3. At comparison time, embed scraped content and retrieve only the relevant brain chunks
4. Keep markdown as source of truth — vectors are a derived index

### Architecture Diagram

```
PUBLISH FLOW (new):
  mind_versions.brain_markdown
    → chunk by markdown sections (## headings)
    → embed each chunk via OpenAI text-embedding-3-small
    → store in minds.mind_brain_chunks (pgvector)

CHAT FLOW (modified):
  user message
    → embed query via OpenAI
    → pgvector cosine similarity search → top 5-7 chunks
    → build system prompt: personality + relevant chunks + summary chunk + rules
    → send to Claude (small context, fast, cheap)

COMPARISON FLOW (modified):
  scraped markdown
    → embed scraped content
    → pgvector search → top 10-15 brain chunks
    → send relevant chunks + scraped content to Claude for proposals
    → (background job, generous retrieval)

FALLBACK:
  if brain < THRESHOLD chars → skip RAG, use full brain (current behavior)
  if embedding/retrieval fails → degrade to full brain
```

### Step 1: Install pgvector Extension

- Enable `pgvector` extension on the PostgreSQL instance
- Add migration: `CREATE EXTENSION IF NOT EXISTS vector`
- Verify extension availability in target environments (dev, staging, prod)

### Step 2: New Migration — `minds.mind_brain_chunks` Table

```sql
CREATE TABLE minds.mind_brain_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES minds.mind_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  section_heading TEXT,            -- parent ## heading for context
  embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small dimension
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  char_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast vector similarity search per mind
CREATE INDEX idx_brain_chunks_mind_embedding
  ON minds.mind_brain_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE mind_id IS NOT NULL;

-- Lookup by version for cleanup
CREATE INDEX idx_brain_chunks_version
  ON minds.mind_brain_chunks(version_id);

-- Lookup active chunks by mind
CREATE INDEX idx_brain_chunks_mind_id
  ON minds.mind_brain_chunks(mind_id);
```

**Key decisions:**
- `embedding_model` column stored for future model migration traceability
- HNSW index for fast approximate nearest neighbor search
- `section_heading` stored for context enrichment (when a chunk is retrieved, we know which section it came from)
- `version_id` FK enables cleanup of old version chunks and rollback support

### Step 3: New Model — `MindBrainChunkModel`

Location: `src/models/MindBrainChunkModel.ts`

Interface:
```typescript
interface IMindBrainChunk {
  id: string;
  mind_id: string;
  version_id: string;
  chunk_index: number;
  chunk_text: string;
  section_heading: string | null;
  embedding: number[];
  embedding_model: string;
  char_count: number;
  created_at: Date;
}
```

Methods:
- `bulkInsert(chunks[])` — batch insert chunks for a version
- `deleteByMind(mindId)` — clear all chunks for a mind (used before re-indexing)
- `deleteByVersion(versionId)` — clear chunks for a specific version
- `searchSimilar(mindId, queryEmbedding, topK)` — pgvector cosine similarity search, returns top-k chunks
- `getByVersion(versionId)` — get all chunks for a version
- `countByMind(mindId)` — count active chunks

### Step 4: New Service — `service.minds-embedding.ts`

Location: `src/controllers/minds/feature-services/service.minds-embedding.ts`

Responsibilities:
- **`generateEmbedding(text: string): Promise<number[]>`** — call OpenAI API (reuse pattern from existing `service.openai-client.ts`)
- **`generateEmbeddings(texts: string[]): Promise<number[][]>`** — batch embedding (OpenAI supports batch in single API call)
- **`chunkBrainMarkdown(markdown: string): Chunk[]`** — markdown-aware chunking:
  - Split by `##` headings first (semantic sections)
  - If a section exceeds max chunk size (2048 chars), sub-split by paragraph → sentence → word boundary (reuse existing chunker logic)
  - Add 150 char overlap between adjacent chunks within the same section
  - Track `section_heading` for each chunk
- **`generateSummaryChunk(markdown: string): Promise<string>`** — generate a ~500 char summary of the entire brain (LLM call, cached per version). This summary chunk is always included in chat context as a "map" of what the mind knows.

### Step 5: New Service — `service.minds-retrieval.ts`

Location: `src/controllers/minds/feature-services/service.minds-retrieval.ts`

Responsibilities:
- **`retrieveForChat(mindId, query, topK = 7): Promise<RetrievalResult>`**
  - Embed user query
  - pgvector cosine similarity search
  - Return top-k chunks + summary chunk
  - Include `section_heading` context with each chunk
- **`retrieveForComparison(mindId, scrapedContent, topK = 15): Promise<RetrievalResult>`**
  - Embed scraped content (may need to chunk long content and search multiple times, merge results)
  - Return top-k unique chunks (deduplicated)
  - Generous retrieval — background job, accuracy over speed
- **`shouldUseRag(brainCharCount: number): boolean`**
  - Returns `false` if brain is under threshold (e.g., 8000 chars)
  - Returns `true` otherwise
- **`buildRetrievedContext(chunks: IMindBrainChunk[], summaryChunk: string): string`**
  - Formats retrieved chunks into a coherent context string for the LLM
  - Groups by section heading
  - Prepends summary chunk

### Step 6: Modify Compile-Publish Pipeline

File: `compilePublish.processor.ts`

Add new step after PUBLISH_VERSION:

```
Step 7 (new): GENERATE_EMBEDDINGS
  → Load published version's brain_markdown
  → Check shouldUseRag(brain.length)
  → If yes:
    → chunkBrainMarkdown(brain_markdown)
    → generateEmbeddings(chunks)
    → generateSummaryChunk(brain_markdown)
    → deleteByMind(mindId) — clear old chunks
    → bulkInsert(new chunks + summary)
  → If no:
    → deleteByMind(mindId) — clear any stale chunks
    → Log "Brain under threshold, RAG skipped"
```

Existing steps renumber:
- Steps 1-6: unchanged
- Step 7: GENERATE_EMBEDDINGS (new)
- Step 8: FINALIZE_PROPOSALS (was step 7)
- Step 9: COMPLETE (was step 8)

### Step 7: Modify Chat Service

File: `service.minds-chat.ts`

Current `buildSystemPrompt()` sends full brain. Change to:

```typescript
// Before (current):
const systemPrompt = buildSystemPrompt(mind.name, mind.personality_prompt, brainMarkdown);

// After:
let brainContext: string;
if (shouldUseRag(brainMarkdown.length)) {
  const retrieval = await retrieveForChat(mindId, message);
  brainContext = buildRetrievedContext(retrieval.chunks, retrieval.summary);
} else {
  brainContext = brainMarkdown; // Small brain — use full context
}
const systemPrompt = buildSystemPrompt(mind.name, mind.personality_prompt, brainContext);
```

The `buildSystemPrompt()` function signature stays the same. It doesn't care whether it receives full brain or retrieved chunks — it's just a string.

**Fallback**: If `retrieveForChat` throws (embedding API down, pgvector error), catch and degrade to full brain with a warning log.

### Step 8: Modify Comparison Service

File: `service.minds-comparison.ts`

Current `compareContent()` receives full brain. Change to:

```typescript
export async function compareContent(
  mindId: string,        // NEW param
  currentBrain: string,
  scrapedMarkdown: string
): Promise<ProposalInput[]> {
  let brainContext: string;
  if (shouldUseRag(currentBrain.length)) {
    const retrieval = await retrieveForComparison(mindId, scrapedMarkdown);
    brainContext = buildRetrievedContext(retrieval.chunks, retrieval.summary);
  } else {
    brainContext = currentBrain;
  }
  // ... rest of comparison logic uses brainContext instead of currentBrain
}
```

**Caller update**: `scrapeCompare.processor.ts` step RUN_LLM_COMPARISON must pass `mindId` to `compareContent()`.

### Step 9: Modify Brain Update (Direct Edit) Flow

File: `service.minds-crud.ts` — `updateBrain()`

When an admin manually edits and saves the brain (bypassing the sync pipeline), the `updateBrain()` function creates a new version and publishes it. This also needs to regenerate embeddings.

Add post-publish embedding generation:
```typescript
// After version creation + publish in updateBrain():
if (shouldUseRag(brainMarkdown.length)) {
  await regenerateEmbeddings(mindId, newVersion.id, brainMarkdown);
}
```

This is synchronous since admin is waiting — but embedding 20-50 chunks is fast (~1-2 seconds).

### Step 10: Modify Version Rollback (publishVersion)

File: `service.minds-crud.ts` — `publishVersion()`

When an admin publishes an older version (rollback), re-embed from that version's markdown:

```typescript
// After publish in publishVersion():
const version = await MindVersionModel.findById(versionId);
if (version && shouldUseRag(version.brain_markdown.length)) {
  await regenerateEmbeddings(mindId, versionId, version.brain_markdown);
}
```

### Step 11: Backfill Migration

A data migration to generate embeddings for existing published minds:

```typescript
// For each mind with a published_version_id:
//   1. Load the published version's brain_markdown
//   2. Chunk → embed → insert into mind_brain_chunks
```

This runs once on deploy. Can be a seed file or a standalone script.

### Step 12: Environment Configuration

New env vars:
```bash
# Embedding
MINDS_EMBEDDING_MODEL=text-embedding-3-small    # OpenAI model
OPENAI_API_KEY=sk-...                           # Already exists in codebase

# RAG Thresholds
MINDS_RAG_THRESHOLD_CHARS=8000                  # Below this, use full brain
MINDS_RAG_CHAT_TOP_K=7                          # Chunks retrieved for chat
MINDS_RAG_COMPARISON_TOP_K=15                   # Chunks retrieved for comparison
MINDS_CHUNK_MAX_CHARS=2048                      # Max chunk size
MINDS_CHUNK_OVERLAP_CHARS=150                   # Overlap between chunks
```

### Step 13: Lift Brain Size Cap

Current limit in `service.minds-crud.ts`: 50K chars (warn at 40K).

With RAG:
- Raise limit to 500K chars (or make it configurable)
- Warn threshold at 400K
- The full brain is still stored in `mind_versions` — only the vector index grows
- Update `MINDS_MAX_BRAIN_CHARACTERS` env var default

Also update `compilePublish.processor.ts` VALIDATE_BRAIN_SIZE step to match.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|-----------|
| **pgvector not available in target DB** | L3 | Verify extension availability before starting. RDS, Supabase, Neon all support it. |
| **OpenAI embedding API downtime** | L2 | Fallback to full-brain-in-context. Log warning. Chat still works. |
| **Retrieval misses (wrong chunks returned)** | L2 | Generous top-k (7 chat, 15 comparison). Summary chunk always included. Overlap between chunks. Can tune later. |
| **Embedding model lock-in** | L1 | `embedding_model` column stored per chunk. Re-embed script possible. |
| **Comparison accuracy regression** | L2 | Top-15 retrieval for comparison. Background job — extra tokens acceptable. Full-brain fallback available. |
| **Publish latency increase** | L1 | Embedding 50 chunks in one batch API call: ~1-2 seconds. Negligible in a BullMQ job. |
| **Migration on existing data** | L1 | Backfill migration runs once. Only affects published versions. |
| **Chunking quality** | L2 | Markdown-aware splitting by `##` headings. Brain structure is already well-organized from compile pipeline. Overlap prevents boundary splits. |

---

## Definition of Done

- [ ] pgvector extension enabled in PostgreSQL
- [ ] `minds.mind_brain_chunks` table created with HNSW index
- [ ] `MindBrainChunkModel` with CRUD + vector similarity search
- [ ] `service.minds-embedding.ts` — chunking + embedding + summary generation
- [ ] `service.minds-retrieval.ts` — chat retrieval + comparison retrieval + threshold logic + fallback
- [ ] Compile-publish pipeline has GENERATE_EMBEDDINGS step
- [ ] Chat service uses RAG retrieval (with full-brain fallback)
- [ ] Comparison service uses RAG retrieval (with full-brain fallback)
- [ ] Direct brain edit (`updateBrain`) regenerates embeddings
- [ ] Version rollback (`publishVersion`) regenerates embeddings
- [ ] Backfill migration for existing published minds
- [ ] Brain size cap raised to 500K chars
- [ ] Environment variables documented and configured
- [ ] Existing tests pass (if any)
- [ ] Manual verification: chat a mind before/after, verify response quality

---

## Performance Considerations

**Token savings per chat message:**
- Before: ~15-20K input tokens (full 50K char brain)
- After: ~2-4K input tokens (5-7 retrieved chunks + summary)
- **~80% reduction in input tokens per message**

**Latency per chat message:**
- Added: ~200ms (embed query) + ~10-50ms (pgvector search)
- Removed: LLM processing time for 15K extra tokens (~1-3 seconds)
- **Net improvement: faster responses**

**Publish cost:**
- Added: ~$0.002 per publish (embed 50 chunks via OpenAI)
- Negligible

**Comparison cost:**
- Before: full brain (15-20K tokens) + scraped content → Claude
- After: relevant chunks (3-5K tokens) + scraped content → Claude
- **~60-70% reduction** in comparison LLM costs

---

## Dependency Impact

| Dependency | Type | Impact |
|-----------|------|--------|
| **pgvector** | PostgreSQL extension | Must be enabled server-side. No npm package needed — Knex raw SQL handles vector operations. |
| **OpenAI API** | External service | Already used in codebase (`service.openai-client.ts`). `OPENAI_API_KEY` already configured. No new dependency. |

No new npm packages required. pgvector is accessed via raw Knex queries (`knex.raw()`).

---

## Rollback Plan

1. **Feature flag approach**: `shouldUseRag()` threshold can be set to `Infinity` to disable RAG entirely — every brain falls below threshold, full-brain behavior resumes.
2. **Database**: `mind_brain_chunks` table can be dropped without affecting any other table. No other tables reference it.
3. **Code**: Chat and comparison services have explicit fallback paths. Setting threshold to `Infinity` or removing the RAG code path reverts to original behavior.
4. **No data loss**: `mind_versions.brain_markdown` is untouched. Vectors are derived data only.

---

## Revision Log

### Revision 1 — 02/27/2026 — Add Streaming Chat Responses

**Reason:** Chat currently uses blocking `client.messages.create()` — user stares at a spinner until the full response is generated. We want ChatGPT/Claude-style streaming where tokens appear as they're generated.

**Reference implementation:** `~/Desktop/mergeability` uses SSE (Server-Sent Events) with `client.messages.stream()` + `res.write()` on backend, `fetch + ReadableStream` on frontend.

**Changes to plan:**

#### Step 14: Streaming Chat Backend

File: `service.minds-chat.ts`

Replace `client.messages.create()` with `client.messages.stream()`. The chat function becomes a generator/callback pattern:

```typescript
export async function chatStream(
  mindId: string,
  message: string,
  onChunk: (chunk: string) => void,
  conversationId?: string,
  adminId?: string
): Promise<{ conversationId: string }> {
  // ... same setup as current chat() ...
  // RAG retrieval (from Step 7)
  // Store user message
  // Build system prompt

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
  });

  let fullReply = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullReply += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  // Persist complete assistant message AFTER stream ends
  await MindMessageModel.addMessage(convId, "assistant", fullReply);
  await MindConversationModel.incrementMessageCount(convId);

  return { conversationId: convId };
}
```

**Key details:**
- User message saved to DB BEFORE streaming starts (same as now)
- Assistant message accumulated server-side during streaming
- Assistant message saved to DB AFTER stream completes
- `conversationId` sent as first SSE event so frontend can track it

#### Step 15: Streaming Chat Endpoint

File: `minds.ts` (routes) + `MindsController`

New SSE endpoint or modify existing `/api/admin/minds/:mindId/chat`:

```typescript
// Controller
export async function chatStream(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const { mindId } = req.params;
  const { message, conversationId } = req.body;

  try {
    const result = await chatStreamService(
      mindId,
      message,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      },
      conversationId,
      adminId
    );

    // Send conversation ID + done signal
    res.write(`data: ${JSON.stringify({ conversationId: result.conversationId, done: true })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
```

#### Step 16: Streaming Chat Frontend

File: `MindChatTab.tsx` + `api/minds.ts`

**API client** — new function that returns raw Response for streaming:
```typescript
export async function sendChatMessageStream(
  mindId: string,
  message: string,
  conversationId?: string
): Promise<Response> {
  return fetch(`/api/admin/minds/${mindId}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId }),
  });
}
```

**Chat component** — read stream + render incrementally:
- Add streaming state: `isStreaming`, `streamingText`
- On send: immediately show user message, start streaming
- Read `response.body.getReader()` + `TextDecoder` line-by-line
- Parse SSE `data:` lines, append text to state
- Show blinking cursor (`▌`) during streaming
- On `[DONE]`: finalize message in local state, capture `conversationId`
- Markdown rendering for assistant messages (already exists)

#### Step 17: Nginx SSE Configuration (Infrastructure)

For the minds chat streaming endpoint, Nginx must not buffer SSE responses:

```nginx
location /api/admin/minds/ {
    proxy_pass http://127.0.0.1:PORT;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    proxy_read_timeout 300s;
}
```

This is an infrastructure change, not a code change. Documented here for deployment.

**Updated Definition of Done (appended):**
- [ ] Chat service supports streaming via `messages.stream()`
- [ ] SSE endpoint for streaming chat responses
- [ ] Frontend reads stream + renders incrementally with cursor
- [ ] Assistant messages persisted after stream completes
- [ ] Nginx SSE config documented for deployment

---

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Agentic tool-use (Claude Code style)** | Adds latency (multiple LLM round-trips). Bad for web chatbot UX. Better for dev tools, not user-facing chat. |
| **Voyage AI embeddings** | Higher quality for Claude pairing, but adds a new API dependency. OpenAI embeddings already in codebase and proven. Can swap later via `embedding_model` column. |
| **Dedicated vector DB (Pinecone, Weaviate)** | Overkill. pgvector keeps vectors in PostgreSQL — no new infrastructure, no network hops, simpler ops. |
| **Fixed character chunking** | Markdown-aware chunking by headings preserves semantic coherence. Fixed-size chunks split mid-concept. |
| **Skip RAG for comparison, only fix chat** | Comparison has the same scaling problem. As brains grow past 50K, comparison breaks too. Fix both now. |
