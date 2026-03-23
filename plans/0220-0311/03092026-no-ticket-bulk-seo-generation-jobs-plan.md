# Bulk SEO Generation as Background Jobs

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

SEO generation for pages and posts is currently synchronous and per-item only (via SeoPanel). There is no way to bulk-generate SEO for all pages or all posts of a given type. Users must open each page/post editor individually to generate SEO. Additionally, the posts list view shows no SEO health indicators.

## Context Summary

- **BullMQ infrastructure** exists with 5 workers, `{minds}` prefix, queues.ts singleton factory, database-backed progress tracking (MindSyncRunModel/StepModel pattern)
- **SEO generation service** (`service.seo-generation.ts`) has `generateAllSeoSections()` which fetches shared context (business data, mind skills) once and loops through 5 sections per entity
- **Page list** already shows SEO score bars with `computeSeoScore()` in WebsiteDetail.tsx
- **Posts list** (PostsTab.tsx) groups posts by post type in a sidebar, shows status/category/tag badges per item — no SEO indicators yet
- **Post interface** in frontend (`posts.ts`) is missing `seo_data` field despite backend returning it
- **Generation status polling** pattern exists: lightweight `GET /:id/pages/generation-status` endpoint polled by frontend
- **Posts have `seo_data` JSONB column** in DB, saved via `updatePostSeo` handler

## Existing Patterns to Follow

- BullMQ worker registration in `worker.ts` with processor files in `workers/processors/`
- Queue factory via `getMindsQueue(name)` in `queues.ts`
- Database-backed job tracking (MindSyncRunModel pattern: status enum, timestamps, error_message)
- Lightweight polling endpoints returning only status/progress fields
- `generateAllSeoSections()` shared-context pattern for batch efficiency
- `computeSeoScore()` in WebsiteDetail.tsx for score display with colored bars

## Proposed Approach

### Backend

1. **New migration** — `seo_generation_jobs` table:
   - `id` (UUID PK)
   - `project_id` (UUID FK)
   - `entity_type` ('page' | 'post')
   - `post_type_id` (UUID, nullable — only for posts)
   - `status` ('queued' | 'processing' | 'completed' | 'failed')
   - `total_count` (integer)
   - `completed_count` (integer, default 0)
   - `failed_count` (integer, default 0)
   - `failed_items` (JSONB, nullable — array of `{ id, title, error }`)
   - `created_at`, `updated_at` (timestamptz)

2. **New model** — `SeoGenerationJobModel` with methods: `create()`, `findById()`, `findActive()`, `incrementCompleted()`, `incrementFailed()`, `markProcessing()`, `markCompleted()`, `markFailed()`

3. **New BullMQ queue** — `seo-bulk-generate` via `getMindsQueue('seo-bulk-generate')`

4. **New processor** — `seoBulkGenerate.processor.ts`:
   - Receives: `{ jobRecordId, projectId, entityType, postTypeId? }`
   - Fetches shared context ONCE: business data, mind skills, all existing titles/descriptions
   - Fetches all target entities (pages for project, or posts for post type)
   - For each entity:
     - Extracts content (page sections joined or post content)
     - Calls internal `runGenerateSection()` for all 5 sections with shared context
     - Saves merged `seo_data` to DB via existing update methods
     - Updates `completed_count` in job record
     - On failure: updates `failed_count`, logs error to `failed_items`, continues to next
   - Marks job `completed` or `failed` when done

5. **New controller endpoints**:
   - `POST /:id/seo/bulk-generate` — Start bulk job (body: `{ entity_type, post_type_id? }`)
     - Creates job record, enqueues BullMQ job, returns `{ job_id }`
   - `GET /:id/seo/bulk-generate/:jobId/status` — Poll job progress
     - Returns `{ status, total_count, completed_count, failed_count }`
     - No caching headers (must be fresh)

6. **Register worker** in `worker.ts` as 6th worker with concurrency 1

### Frontend — Posts List SEO Score Bar

7. **Add `seo_data` to Post interface** in `posts.ts`

8. **Add SEO score bar to each post item** in PostsTab.tsx:
   - Reuse `computeSeoScore()` pattern from WebsiteDetail.tsx (extract to shared util)
   - Show colored bar + percentage next to status badge
   - Color coding: green (90+), lime (75+), orange (55+), red (35+), gray (0/null)

### Frontend — Bulk Generate Buttons + Progress

9. **Pages list** (WebsiteDetail.tsx):
   - Add "Generate SEO" button in pages header (next to "Create Page")
   - On click: POST to start bulk job, then poll progress
   - Show progress indicator: "Generating SEO... 2/7" with loading animation
   - Auto-remove progress and refresh page list when complete

10. **Posts list** (PostsTab.tsx):
    - Add "Generate SEO" button per post type in the sidebar post-type list
    - On click: POST to start bulk job for that post_type_id, then poll progress
    - Show progress indicator per post type: "Generating SEO... 3/12"
    - Auto-remove progress and refresh posts when complete

11. **Shared polling hook** — `useBulkSeoProgress(projectId, jobId)`:
    - Polls every 2 seconds while job is active
    - Returns `{ status, total, completed, failed, isActive }`
    - Stops polling when status is 'completed' or 'failed'

## Risk Analysis

**Level 3 — Structural Risk**

- **New worker/queue**: Follows established BullMQ patterns exactly. Low novelty risk.
- **Worker fetches content from DB**: Currently frontend sends content. Worker must self-serve by reading page sections / post content from DB. This is a shift but cleaner for background jobs.
- **Concurrent jobs**: Should prevent multiple active jobs for the same project+entityType. Enforce via `findActive()` check before creating.
- **LLM rate limits**: Processing items sequentially (concurrency 1) naturally throttles. No parallel LLM calls within a single job.
- **Stale progress**: Polling every 2s is sufficient. No WebSocket complexity needed.

## Performance Considerations

- Shared context (business data, mind skills) fetched once per job, not per item
- Sequential processing prevents LLM rate limiting
- Lightweight status endpoint (single row lookup by job ID)
- No-cache headers on progress endpoint

## Definition of Done

- [x] Migration creates `seo_generation_jobs` table
- [x] `SeoGenerationJobModel` with all CRUD methods
- [x] BullMQ queue `seo-bulk-generate` registered in worker.ts
- [x] Processor handles pages and posts, updates progress per item
- [x] Processor fetches shared context once, iterates entities
- [x] Failure in one item doesn't stop the batch
- [x] Controller endpoints for start + poll
- [x] Duplicate active job prevention
- [x] `Post` interface includes `seo_data`
- [x] SEO score bar on each post item in PostsTab
- [x] "Generate SEO" button in pages list header with progress
- [x] "Generate SEO" button per post type with progress
- [x] `useBulkSeoProgress` polling hook
- [x] Progress shows "X/Y" with loading animation
- [x] Progress auto-removes on completion, list refreshes
- [x] TypeScript compiles cleanly
