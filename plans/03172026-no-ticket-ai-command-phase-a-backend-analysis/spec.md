# AI Command — Phase A: Backend Analysis Engine

## Why
The QA → fix cycle for client websites is manual and slow. An AI-powered batch analysis engine can ingest a QA checklist (or simple instruction), analyze every section/layout/post against it, and produce structured recommendations — turning hours of manual work into a reviewable queue.

## What
Backend service + API endpoints that accept a prompt + target selection, analyze website content against the prompt using Claude Sonnet, and persist structured recommendations in the database. Phase B (frontend) and Phase C (execution) depend on this.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — existing AI edit pipeline, same service pattern
- `signalsai-backend/src/utils/website-utils/pageEditorService.ts` — existing Anthropic SDK integration (Haiku), we add a Sonnet variant
- `signalsai-backend/src/routes/admin/websites.ts` — route registration (44 endpoints currently)
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — controller delegation
- `signalsai-backend/src/database/migrations/20260316000001_create_backup_jobs.ts` — latest migration, naming convention

**Patterns to follow:**
- Service file: `feature-services/service.ai-command.ts` (matches `service.page-editor.ts`)
- Controller methods in `AdminWebsitesController.ts` with thin delegation
- Routes grouped by section in `websites.ts`
- Knex migrations with `website_builder` schema prefix
- JSON response format: `{ result, error? }` pattern from page editor

**Key decisions already made:**
- LLM: Claude Sonnet (`claude-sonnet-4-6`) for analysis
- Storage: New DB tables (not Redis/frontend state)
- One section per LLM call (no batching)
- Orchestration approach: LLM analyzes and recommends, does not rewrite HTML

## Constraints

**Must:**
- Follow existing service file patterns exactly
- Use same Anthropic SDK singleton pattern from `pageEditorService.ts`
- Store recommendations with enough context for Phase C execution
- Handle LLM failures gracefully per-recommendation (don't fail entire batch)
- Validate LLM JSON output, retry once on parse failure

**Must not:**
- Rewrite HTML during analysis — analysis produces recommendations only
- Add new dependencies
- Modify existing page editor service or prompts
- Touch frontend code

**Out of scope:**
- Frontend UI (Phase B)
- Execution/save logic (Phase C)
- Streaming/SSE (polling is sufficient)

## Risk

**Level:** 2

**Risks identified:**
- LLM may produce inconsistent recommendation structures → **Mitigation:** strict JSON schema validation with retry on malformed output
- Large pages with many sections = many LLM calls = slow + expensive → **Mitigation:** track token usage in batch stats, log costs. One section per call is user's choice — we honor it.
- Concurrent batch creation for same project → **Mitigation:** no constraint, multiple batches are fine. Each is independent.

## Tasks

### T1: Database migration — ai_command tables
**Do:** Create migration with two tables in `website_builder` schema.

`ai_command_batches`:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| project_id | uuid FK → projects | on delete cascade |
| prompt | text | the user's instruction/checklist |
| targets | jsonb | `{ pages: uuid[] \| "all", posts: uuid[] \| "all", layouts: ("wrapper" \| "header" \| "footer")[] \| "all" }` |
| status | text | analyzing, ready, executing, completed, failed |
| summary | text nullable | AI-generated summary after analysis |
| stats | jsonb | `{ total, pending, approved, rejected, executed, failed }` |
| created_by | uuid nullable | user who created |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

`ai_command_recommendations`:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| batch_id | uuid FK → batches | on delete cascade |
| target_type | text | page_section, layout, post |
| target_id | uuid | page_id, project_id (for layouts), post_id |
| target_label | text | human label: "Homepage > Hero Section", "Footer", "Blog: Invisalign Guide" |
| target_meta | jsonb | `{ section_index?, section_name?, layout_field?, post_type_slug? }` |
| recommendation | text | human-readable: "Update hours to include Kahala office" |
| instruction | text | LLM-ready instruction for execution phase |
| current_html | text | snapshot of HTML at analysis time |
| status | text | pending, approved, rejected, executed, failed |
| execution_result | jsonb nullable | `{ success, error?, edited_html? }` |
| sort_order | int | ordering within batch |
| created_at | timestamptz | default now() |

Indexes: `batch_id`, `batch_id + status`, `target_type + target_id`.

**Files:** `signalsai-backend/src/database/migrations/20260317000001_create_ai_command_tables.ts`
**Verify:** `npx knex migrate:latest` succeeds, tables exist in DB

### T2: Analysis service — `service.ai-command.ts`
**Do:** Create the core analysis service with these functions:

1. `createBatch(projectId, prompt, targets, createdBy?)` — insert batch record, return batch
2. `analyzeBatch(batchId)` — main orchestration:
   - Load batch + project
   - Resolve targets (expand "all" to actual IDs)
   - For layouts: fetch project wrapper/header/footer → analyze each
   - For pages: fetch draft (or published) sections → analyze each section individually
   - For posts: fetch published posts → analyze each
   - For each target, call `analyzeContent()` → parse recommendations → insert rows
   - Update batch status to "ready" when done, "failed" if all fail
   - Update batch stats after each target completes
3. `analyzeContent(prompt, targetLabel, html)` → call Sonnet, return parsed recommendations array
4. `getBatch(batchId)` — fetch batch with stats
5. `getBatchRecommendations(batchId, filters?)` — fetch recommendations, filterable by status/target_type
6. `updateRecommendationStatus(recommendationId, status)` — approve/reject individual
7. `bulkUpdateStatus(batchId, status, filters?)` — approve/reject all matching

**LLM prompt for `analyzeContent`:**
- System: "You are a website QA analyst. You analyze HTML content against requirements and produce structured recommendations."
- User: the prompt/checklist + the target label + the current HTML
- Response format (enforced via system prompt):
```json
{
  "recommendations": [
    {
      "recommendation": "Human-readable description of what to change",
      "instruction": "Specific instruction for an AI editor to execute this change on the HTML"
    }
  ]
}
```
- If no changes needed, return `{ "recommendations": [] }`

**Validation:** Parse JSON response. If parse fails, retry once with a "respond with valid JSON only" nudge. If second attempt fails, log error, skip this target, continue batch.

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Unit-testable functions, service imports cleanly

### T3: LLM integration — analysis prompt + Sonnet caller
**Do:** Create `aiCommandService.ts` in `utils/website-utils/` (alongside `pageEditorService.ts`):

- Use same `getClient()` singleton pattern
- Model: `claude-sonnet-4-6`
- `max_tokens: 4096`
- System prompt stored as constant (not in DB — this is internal, not user-facing)
- Function: `analyzeHtmlContent(params: { prompt: string, targetLabel: string, currentHtml: string })` → returns `{ recommendations: Array<{ recommendation: string, instruction: string }>, inputTokens: number, outputTokens: number }`
- JSON parse with fence-stripping (reuse pattern from `pageEditorService.ts`)
- Retry logic: on parse failure, append "Your previous response was not valid JSON. Respond ONLY with the JSON object." and retry once

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`
**Verify:** Function compiles, exports cleanly

### T4: Controller + routes
**Do:** Add controller methods and routes:

**Controller methods in `AdminWebsitesController.ts`:**
- `createAiCommandBatch` — POST, validates input, creates batch, kicks off `analyzeBatch` asynchronously (fire-and-forget with error logging), returns batch ID + status "analyzing"
- `getAiCommandBatch` — GET, returns batch with stats
- `getAiCommandRecommendations` — GET, returns recommendations with optional filters (query params: status, target_type)
- `updateAiCommandRecommendation` — PATCH, update single recommendation status (approve/reject)
- `bulkUpdateAiCommandRecommendations` — PATCH, bulk approve/reject

**Routes in `websites.ts`:**
```
POST   /:id/ai-command              → createAiCommandBatch
GET    /:id/ai-command/:batchId     → getAiCommandBatch
GET    /:id/ai-command/:batchId/recommendations → getAiCommandRecommendations
PATCH  /:id/ai-command/:batchId/recommendations/:recId → updateAiCommandRecommendation
PATCH  /:id/ai-command/:batchId/recommendations/bulk → bulkUpdateAiCommandRecommendations
```

**Files:** `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts`, `signalsai-backend/src/routes/admin/websites.ts`
**Verify:** `npx tsc --noEmit` passes, routes registered

### T5: Migration scripts
**Do:** Create SQL scripts for manual DB execution and Knex migration.

**Files:**
- `plans/03172026-no-ticket-ai-command-phase-a-backend-analysis/migrations/pgsql.sql`
- `plans/03172026-no-ticket-ai-command-phase-a-backend-analysis/migrations/mssql.sql`
- `plans/03172026-no-ticket-ai-command-phase-a-backend-analysis/migrations/knexmigration.js`

**Verify:** SQL is valid, matches T1 schema exactly

## Done
- [ ] `npx knex migrate:latest` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] POST `/:id/ai-command` creates batch and starts async analysis
- [ ] GET `/:id/ai-command/:batchId` returns batch with updating stats
- [ ] GET `/:id/ai-command/:batchId/recommendations` returns recommendation list
- [ ] PATCH approve/reject updates recommendation status
- [ ] LLM calls produce valid JSON recommendations
- [ ] Failed LLM calls don't crash the batch — graceful degradation
