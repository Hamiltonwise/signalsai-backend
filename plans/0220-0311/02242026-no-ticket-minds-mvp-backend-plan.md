# Minds MVP — Backend Implementation Plan

**Date:** 2026-02-24
**Ticket:** no-ticket
**Feature:** Minds MVP — Full backend: schema, migrations, models, controllers, services, routes, BullMQ worker
**Reference:** `plans/02-24-2026-minds_mvp_dev_prompt.md` (master spec)

---

## Problem Statement

Implement the **Minds** feature backend — a chatbot profile system where each Mind has a versioned markdown knowledge base ("brain"), a personality prompt, configurable discovery sources, automated blog post discovery, admin-gated scrape/compare/compile pipelines, and LLM-powered chat.

This is the first feature in this codebase that requires a background job system (BullMQ + Redis). It introduces a new PostgreSQL schema (`minds`), 11 new tables, ~25 new API endpoints, a BullMQ worker process, and Zod validation.

---

## Context Summary

### Existing Patterns (Must Follow)

| Pattern | Convention |
|---------|------------|
| **Route registration** | `app.use("/api/admin/minds", mindsRoutes)` in `src/index.ts` |
| **Auth** | `authenticateToken` → `superAdminMiddleware` chain (super-admin-only feature) |
| **Controllers** | Named exported async functions, not classes. Thin — parse request, delegate to services, format response |
| **Services** | Feature-focused files under controller subdirectory: `src/controllers/minds/feature-services/` |
| **Models** | Extend `BaseModel`. Static methods. `tableName` + `jsonFields`. Auto timestamps. Transaction support via `trx?: QueryContext` |
| **Migrations** | `YYYYMMDDHHMMSS_description.ts` in `src/database/migrations/`. Use `knex.transaction()` where needed. Include `up` and `down` |
| **Error handling** | try/catch per endpoint. `console.error("[MINDS] ...")`. Return `{ error: "message" }` or `{ success: true, data: ... }` |
| **Logging** | `console.log("[MINDS] ...")` + optional file logger for worker |
| **Response envelope** | `{ success: true, data: ... }` on success; `{ error: "message" }` on failure |
| **HTTP client** | Axios (already installed) |
| **HTML parsing** | Cheerio (already installed) |
| **LLM** | `@anthropic-ai/sdk` (already installed) |

### New Dependencies Required

| Package | Purpose |
|---------|---------|
| `bullmq` | Job queue for scrape/compare and compile/publish pipelines |
| `ioredis` | Redis client (required by BullMQ) |
| `zod` | Strict JSON schema validation for LLM proposal output |

### Decisions Locked

| Decision | Choice |
|----------|--------|
| Auth level | `superAdminMiddleware` — admin sidebar only |
| Org scoping | None — global feature, no `organization_id` |
| Scraping | Cheerio + Axios — no Puppeteer |
| LLM model | `claude-sonnet-4-5-20250514` for both chat and comparison |
| Content sanitization | `sanitize-html` (already installed) + Cheerio stripping |

---

## Risk Analysis

### Escalation: Level 4 — Major Impact

**Reason:** This introduces Redis as a new infrastructure dependency and a second PM2 process (worker). Every deployment environment (local dev, production EC2) must now run Redis.

**Mitigations:**
- Redis is bound to localhost only (no external exposure)
- Worker is a separate PM2 process — API server unaffected if worker crashes
- BullMQ concurrency=1, attempts=1 — no complex failure modes
- DB-level constraints prevent stuck/duplicate runs

### Escalation: Level 2 — Concern: New Schema

**Reason:** First use of a custom PostgreSQL schema (`minds`) in this codebase. All other tables live in the `public` schema.

**Mitigations:**
- `minds` schema is completely isolated — no FK references to/from `public` schema tables
- Knex `withSchema('minds')` or fully-qualified table names in models
- Clean separation makes future teardown trivial

### Escalation: Level 2 — Concern: Zod (New Validation Pattern)

**Reason:** Codebase has no input validation library. Zod is being added specifically for LLM output validation — not as a general replacement.

**Mitigations:**
- Scoped to LLM output validation only (not request body validation)
- Does not create pressure to adopt Zod codebase-wide
- Single validation schema file

---

## Scope Definition

### In Scope (This Plan)

**Tier: Structural Feature**

1. **Database**: New `minds` schema + 11 tables + constraints + indexes
2. **Seed**: Default CROSEO mind + initial brain version
3. **Models**: 11 new model classes extending BaseModel
4. **Routes**: 1 new route file with ~25 endpoints
5. **Controllers**: Mind CRUD, chat, sources, discovery, sync runs, proposals
6. **Services**: 7 feature services (CRUD, chat, discovery, scraping, comparison, compilation, sync orchestrator)
7. **Worker**: BullMQ worker entry point + queue definitions
8. **Validation**: Zod schemas for proposal output
9. **Config**: Environment variables for Redis, size caps, timeouts
10. **Deployment**: PM2 ecosystem config update

### Explicitly Out of Scope

- Frontend/UI (separate plan)
- RAG / embeddings / pgvector
- Puppeteer / JS-rendered scraping
- Auto-retries / parallel workers
- File upload / attachments in chat (deferred)
- Organization scoping
- Rate limiting on discovery/scraping

---

## Proposed Approach

### File Structure

```
signalsai-backend/src/
├── controllers/minds/
│   ├── MindsController.ts              # CRUD, brain, versions
│   ├── MindsChatController.ts          # Chat endpoint
│   ├── MindsSourcesController.ts       # Sources CRUD
│   ├── MindsDiscoveryController.ts     # Discovery batch, post triage
│   ├── MindsSyncController.ts          # Sync runs, polling
│   ├── MindsProposalsController.ts     # Proposal approve/reject
│   └── feature-services/
│       ├── service.minds-crud.ts       # Mind CRUD + versioning logic
│       ├── service.minds-chat.ts       # Chat system prompt construction + LLM call
│       ├── service.minds-discovery.ts  # Discovery algorithm (fetch sources, extract URLs)
│       ├── service.minds-scraper.ts    # HTTP fetch + Cheerio extraction + sanitization
│       ├── service.minds-comparison.ts # LLM comparison call + Zod validation
│       ├── service.minds-compiler.ts   # Apply proposals + create version + publish
│       ├── service.minds-sync.ts       # Sync run orchestrator (step pipeline)
│       └── service.minds-gating.ts     # Gating rule checks
├── models/
│   ├── MindModel.ts
│   ├── MindVersionModel.ts
│   ├── MindSourceModel.ts
│   ├── MindDiscoveryBatchModel.ts
│   ├── MindDiscoveredPostModel.ts
│   ├── MindScrapedPostModel.ts
│   ├── MindSyncRunModel.ts
│   ├── MindSyncStepModel.ts
│   ├── MindSyncProposalModel.ts
│   ├── MindConversationModel.ts
│   └── MindMessageModel.ts
├── routes/
│   └── minds.ts                        # All /api/admin/minds routes
├── workers/
│   ├── worker.ts                       # BullMQ worker entry point
│   ├── queues.ts                       # Queue definitions + connection config
│   ├── processors/
│   │   ├── scrapeCompare.processor.ts  # Scrape & Compare pipeline
│   │   ├── compilePublish.processor.ts # Compile & Publish pipeline
│   │   └── discovery.processor.ts      # Daily discovery job
│   └── steps/                          # Step definitions
│       ├── scrapeCompareSteps.ts
│       └── compilePublishSteps.ts
├── validation/
│   └── minds.schemas.ts                # Zod schemas for proposals
└── database/migrations/
    ├── 20260225000001_create_minds_schema.ts
    ├── 20260225000002_create_minds_tables.ts
    └── 20260225000003_seed_croseo_mind.ts
```

### Migration Strategy

**3 migration files** (run sequentially):

**Migration 1 — Create Schema:**
- `CREATE SCHEMA IF NOT EXISTS minds`

**Migration 2 — Create All Tables:**
All 11 tables in dependency order:
1. `minds.minds` (core entity)
2. `minds.mind_versions` (FK → minds)
3. `minds.mind_sources` (FK → minds)
4. `minds.mind_discovery_batches` (FK → minds)
5. `minds.mind_sync_runs` (FK → minds)
6. `minds.mind_discovered_posts` (FK → minds, sources, batches, sync_runs)
7. `minds.mind_scraped_posts` (FK → minds, sources, sync_runs)
8. `minds.mind_sync_steps` (FK → sync_runs)
9. `minds.mind_sync_proposals` (FK → sync_runs, minds)
10. `minds.mind_conversations` (FK → minds)
11. `minds.mind_messages` (FK → conversations)

Then alter `minds.minds` to add FK for `published_version_id` → `mind_versions.id` (deferred FK due to circular dependency).

All constraints and indexes as specified in the master spec §4.

**Migration 3 — Seed CROSEO:**
- Insert default Mind with personality prompt
- Insert initial brain version (scaffold markdown)
- Set `published_version_id`

### Model Pattern

Each model extends `BaseModel` with schema-qualified table name:

```
protected static tableName = "minds.minds";
```

Knex supports dot-notation for schema-qualified tables — confirmed compatible with BaseModel's `table()` helper.

### Route Registration

Single route file with middleware chain:

```
router.use(authenticateToken, superAdminMiddleware);
```

All routes under this file are super-admin protected.

### API Endpoints (25 total)

**Minds CRUD (7):**
- `GET    /api/admin/minds`
- `POST   /api/admin/minds`
- `GET    /api/admin/minds/:mindId`
- `PUT    /api/admin/minds/:mindId`
- `PUT    /api/admin/minds/:mindId/brain`
- `GET    /api/admin/minds/:mindId/versions`
- `POST   /api/admin/minds/:mindId/versions/:versionId/publish`

**Chat (2):**
- `POST   /api/admin/minds/:mindId/chat`
- `GET    /api/admin/minds/:mindId/conversations/:conversationId`

**Sources (4):**
- `GET    /api/admin/minds/:mindId/sources`
- `POST   /api/admin/minds/:mindId/sources`
- `DELETE /api/admin/minds/:mindId/sources/:sourceId`
- `PATCH  /api/admin/minds/:mindId/sources/:sourceId`

**Discovery (3):**
- `GET    /api/admin/minds/:mindId/discovery-batch`
- `PATCH  /api/admin/minds/:mindId/discovered-posts/:postId`
- `POST   /api/admin/minds/:mindId/discovery/run`

**Sync Runs (4):**
- `POST   /api/admin/minds/:mindId/sync-runs/scrape-compare`
- `POST   /api/admin/minds/:mindId/sync-runs/compile`
- `GET    /api/admin/minds/:mindId/sync-runs`
- `GET    /api/admin/minds/:mindId/sync-runs/:runId`

**Proposals (2):**
- `GET    /api/admin/minds/:mindId/sync-runs/:runId/proposals`
- `PATCH  /api/admin/minds/:mindId/proposals/:proposalId`

**Status/Gating (1):**
- `GET    /api/admin/minds/:mindId/status` (returns canStartScrape, canCompile, blockingReasons)

### BullMQ Worker Architecture

**Queues:**
- `minds:discovery` — daily discovery job (repeatable, every 24h)
- `minds:scrape-compare` — scrape & compare pipeline
- `minds:compile-publish` — compile & publish pipeline

**Worker entry point:** `src/workers/worker.ts`
- Connects to Redis via ioredis
- Registers processors for each queue
- Concurrency: 1
- Attempts: 1 (no retries)
- Graceful shutdown handler

**PM2 ecosystem:**
- API: `dist/index.js` (existing)
- Worker: `dist/workers/worker.js` (new)

### LLM Integration

**Chat (service.minds-chat.ts):**
- Constructs system prompt: personality + brain markdown + rules
- Uses `anthropic.messages.create()` with `claude-sonnet-4-5-20250514`
- Injects conversation history (capped at last 20 messages)
- Streams response if feasible; otherwise returns full response

**Comparison (service.minds-comparison.ts):**
- Single LLM call per scrape run
- System prompt instructs: compare scraped content vs current brain, produce JSON proposals
- Response parsed as JSON → validated with Zod `ProposalsSchema`
- On validation failure → step fails → run fails

### State Machines (Enforced in Code)

| Entity | States | Transitions |
|--------|--------|-------------|
| Discovery batch | `open` → `closed` | Close when no pending/approved posts remain |
| Discovered post | `pending` → `approved` / `ignored` → `processed` | Undo allowed: `approved`↔`pending`, `ignored`↔`pending` |
| Sync run | `queued` → `running` → `completed` / `failed` | No retries |
| Proposal | `pending` → `approved` / `rejected` → `finalized` | `approved` → `rejected` allowed pre-compile |

### Gating Rules (service.minds-gating.ts)

**Before Scrape & Compare:**
1. No `queued`/`running` sync runs for this mind
2. Open batch exists
3. No `pending` posts in open batch (all triaged)
4. At least 1 `approved` post, max `MAX_POSTS_PER_SCRAPE_RUN`
5. No `approved` (non-finalized) proposals for this mind

**Before Compile & Publish:**
1. No `queued`/`running` sync runs for this mind
2. At least 1 `approved` proposal for this mind

### Environment Variables (New)

```
# Redis (BullMQ)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Minds feature limits
MINDS_MAX_BRAIN_CHARACTERS=50000
MINDS_MAX_SCRAPED_PAGE_CHARACTERS=100000
MINDS_MAX_POSTS_PER_SCRAPE_RUN=10
MINDS_HTTP_FETCH_TIMEOUT_MS=10000

# LLM
MINDS_LLM_MODEL=claude-sonnet-4-5-20250514
```

---

## Security Considerations

1. **HTTP Fetch Hygiene:** Axios with timeout, max 3 redirects, user-agent string, response size limit (10MB)
2. **Content Sanitization:** `sanitize-html` to strip scripts/styles/iframes/event handlers → Cheerio to extract article content → truncate to `MAX_SCRAPED_PAGE_CHARACTERS`
3. **Prompt Injection Resilience:** Scraped content placed under clearly delimited `--- SCRAPED CONTENT (UNTRUSTED) ---` section in LLM prompts. System prompt rules explicitly override scraped content instructions
4. **Brain Size Cap:** Enforced at publish-time. Reject if > 50k chars. Warn at 40k
5. **Auth:** All endpoints behind `superAdminMiddleware` — only whitelisted emails can access

---

## Performance Considerations

1. **No N+1 risk:** Discovery fetches sources in batch; scraping is linear and capped at 10 posts
2. **Brain injection:** Full markdown injection capped at 50k chars — well within LLM context limits for Sonnet 4.5
3. **Polling:** Client polls every 3s during active runs. Endpoint is a simple indexed DB read — negligible load
4. **Worker isolation:** Background jobs run in separate process — cannot block API server
5. **Redis memory:** Minimal — BullMQ stores only job metadata, not payloads (payloads stored in PostgreSQL)

---

## Failure Mode Analysis

| Failure | Behavior |
|---------|----------|
| Worker crashes mid-run | Run stays `running` in DB. Recovery: admin manually retriggers. Future: add stale-run cleanup |
| Redis unavailable | API still works. Job enqueue fails with error response. Worker cannot start |
| LLM call fails | Step `RUN_LLM_COMPARISON` fails → run fails. Admin can retry by starting new run |
| Scrape timeout | Individual URL logged as failed. If all URLs fail → step fails → run fails |
| Brain exceeds 50k after compile | `VALIDATE_BRAIN_SIZE` step fails → run fails. No version created |
| Duplicate discovery | DB unique constraint `(mind_id, url)` silently ignores duplicates |
| Concurrent run attempt | Gating check rejects. DB partial unique index as safety net |

---

## Observability & Monitoring Impact

- **Console logging:** All services log with `[MINDS]` prefix
- **Worker logging:** File logger at `src/logs/minds-worker.log` + console
- **Sentry:** Worker process initializes Sentry independently
- **DB-backed step logs:** Every pipeline step writes status + log_output to `mind_sync_steps` — queryable audit trail
- **Polling endpoint:** Returns full step progression — admin has real-time visibility

---

## Test Strategy

- **Manual testing** via API (Postman/curl) — consistent with current codebase (no test framework detected)
- **Seed data** provides immediate testable state (CROSEO mind)
- **Discovery manual trigger** endpoint enables testing without waiting for daily cron
- **Step-by-step logging** makes pipeline debugging straightforward

---

## Blast Radius Analysis

| Area | Impact |
|------|--------|
| Existing tables | **None** — all new tables in `minds` schema |
| Existing routes | **None** — new route file registered additively |
| Existing middleware | **None** — reuses existing `authenticateToken` + `superAdminMiddleware` |
| package.json | **3 new deps** — bullmq, ioredis, zod |
| src/index.ts | **1 line added** — route registration |
| Infrastructure | **Redis required** — new operational dependency |
| PM2 | **1 new process** — worker |

---

## Definition of Done

1. `npm install` adds bullmq, ioredis, zod without conflicts
2. `knex migrate:latest` creates `minds` schema + all 11 tables + constraints + indexes + seeds CROSEO
3. All 25 API endpoints respond correctly behind super-admin auth
4. Chat endpoint constructs system prompt with brain + personality and returns LLM response
5. Discovery job fetches source URLs, extracts post links, stores in batch (no duplicates)
6. Scrape & Compare pipeline: enqueue → worker processes 9 steps linearly → proposals created
7. Compile & Publish pipeline: applies approved proposals → creates new version → publishes → finalizes
8. Gating rules enforce all constraints (no concurrent runs, no unfinalized proposals blocking new scrapes)
9. Polling endpoint returns step-by-step progression during active runs
10. Worker runs as separate PM2 process
11. All size caps and timeouts enforced

---

## Implementation Order

| Phase | What | Files |
|-------|------|-------|
| 1 | Install deps (bullmq, ioredis, zod) | `package.json` |
| 2 | Migrations: schema + tables + seed | 3 migration files |
| 3 | Models (11 classes) | `src/models/Mind*.ts` |
| 4 | Gating service | `service.minds-gating.ts` |
| 5 | CRUD controller + service + routes | Controller, service, route file |
| 6 | Chat controller + service | Controller, service |
| 7 | Sources controller | Controller |
| 8 | Discovery controller + service + processor | Controller, service, processor |
| 9 | Sync run controller + orchestrator service | Controller, service |
| 10 | Scraper service | Service |
| 11 | Comparison service + Zod schemas | Service, schema file |
| 12 | Compiler service | Service |
| 13 | Proposals controller | Controller |
| 14 | BullMQ queue definitions + worker entry point | `queues.ts`, `worker.ts` |
| 15 | Scrape/Compare processor (wires steps 2-8) | Processor file |
| 16 | Compile/Publish processor (wires steps) | Processor file |
| 17 | Register route in `src/index.ts` | 1 line |
| 18 | Env vars documentation | `.env.example` update |

---

**End of plan.**
