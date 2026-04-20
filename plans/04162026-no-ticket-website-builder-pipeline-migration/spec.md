# Website Builder Pipeline Migration (n8n → Backend)

## Why
The website generation pipeline currently lives in n8n — a workflow that scrapes GBP + website data, uploads images to S3, analyzes everything with Gemini, and generates customized HTML from templates. This creates ~52 LLM calls per page, uses Gemini instead of Claude, has no live preview, no progress visibility, and no cancel mechanism. Moving it into the backend as a BullMQ job eliminates the n8n dependency, switches to Claude Sonnet, cuts LLM calls to ~3-5 per page, enables component-by-component rendering for live preview, and adds a kill switch.

## What
Replace the n8n `Website Builder Workflow` with a backend BullMQ pipeline that:
- Scrapes once at project level (Apify + website + images), caches results on the project row
- Generates HTML component-by-component per page using Claude Sonnet, writing each to the DB incrementally
- Exposes progress (component-level per page, page-level per project) to the frontend via existing polling
- Provides a kill switch to cancel in-progress generation
- Renders a live preview in the page editor as components arrive

Done when: `createAllFromTemplate` and single-page creation queue BullMQ jobs (not n8n webhooks), pages render incrementally in the editor during generation, progress bars show on the page list, and a cancel button stops everything.

## Context

**Relevant files (backend):**
- `src/controllers/admin-websites/feature-services/service.deployment-pipeline.ts` — current n8n webhook trigger (to be refactored)
- `src/controllers/admin-websites/AdminWebsitesController.ts` — endpoints: createAllFromTemplate, startPipeline, getPagesGenerationStatus
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` — createAllFromTemplate logic, status updates, polling query
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — existing Apify pattern (Google Maps scraper)
- `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts` — existing website scraper
- `src/agents/service.llm-runner.ts` — generic Claude caller with multimodal/JSON support
- `src/agents/service.prompt-loader.ts` — loads .md prompt files from src/agents/
- `src/utils/website-utils/aiCommandService.ts` — closest analog: Claude Sonnet HTML generation
- `src/workers/worker.ts` — BullMQ worker registry
- `src/workers/wb-queues.ts` — `getWbQueue()` with `{wb}` prefix
- `src/workers/processors/websiteBackup.processor.ts` — reference processor pattern

**Relevant files (frontend):**
- `frontend/src/pages/admin/WebsiteDetail.tsx` — page list with generation status badges, 3s polling, build-all trigger
- `frontend/src/pages/admin/PageEditor.tsx` — page editor with iframe preview via `renderPage()`
- `frontend/src/api/websites.ts` — API client: createAllFromTemplate, fetchPagesGenerationStatus, fetchPage
- `frontend/src/utils/templateRenderer.ts` — `renderPage()` composites wrapper + header + sections + footer
- `frontend/src/hooks/useBulkSeoProgress.ts` — reference polling hook with progress bar pattern

**Patterns to follow:**
- BullMQ processor: see `websiteBackup.processor.ts` for structure, `worker.ts` for registration
- Claude calls: see `service.llm-runner.ts` `runAgent()` — supports images, JSON prefill, structured output
- Prompt files: .md files in `src/agents/websiteAgents/`, loaded via `loadPrompt()`
- Queue: `getWbQueue("generate")` → queue name `wb-generate`, prefix `{wb}`
- Status polling: see `useBulkSeoProgress.ts` for frontend polling hook pattern

**Reference file:** `src/workers/processors/websiteBackup.processor.ts` — closest analog for long-running wb job processor

## Constraints

**Must:**
- Use Claude Sonnet (`claude-sonnet-4-6`) via existing `service.llm-runner.ts`
- Follow existing BullMQ worker pattern (`{wb}` prefix, register in `worker.ts`)
- Store prompts as .md files via `loadPrompt()`
- Keep the existing `generation_status` enum contract (queued → generating → ready → failed)
- Reuse existing Apify service pattern, scraper, S3 upload infra — no new external dependencies
- Write each component to the page DB row as it's generated (not batch at end)
- Scrape once per project, reuse cached data for all pages in a build-all

**Must not:**
- Break the existing `startPipeline` contract for callers that don't yet use the new pipeline (feature-flag the switch)
- Remove n8n webhook code yet — deprecate, don't delete, until the new pipeline is proven
- Call Gemini — all LLM calls go through Claude
- Add WebSocket/SSE — use the existing DB-backed polling pattern

**Out of scope:**
- Template system changes
- Scraper improvements
- Page editor changes beyond live preview mode
- Mobile responsiveness of preview
- SEO generation integration

## Risk

**Level:** 3 (Structural Risk)

**Risks identified:**
- Pipeline replacement is all-or-nothing per invocation. If the new pipeline generates broken HTML, the page is corrupt → **Mitigation:** Feature-flag (`USE_BACKEND_PIPELINE` env var). Default off. Old n8n path stays functional. Toggle per environment.
- Long-running BullMQ jobs (3-5 min for full project scrape + multi-page generation) can stall → **Mitigation:** 10-min lock duration, step-based checkpointing, cancel flag between each step.
- Claude structured output may return malformed HTML → **Mitigation:** Validate JSON structure before DB write. Retry once on parse failure (same pattern as `aiCommandService.ts`). Mark page `failed` on second failure.
- Component-by-component DB writes create N updates per page instead of 1 → **Mitigation:** Lightweight JSONB append operations. Pages table is low-contention. Acceptable tradeoff for live preview.
- Cancel race condition: cancel flag set while Claude call is in-flight → **Mitigation:** Check flag before AND after each async call. Use `AbortController` for fetch-based calls (Apify, scraper).

**Blast radius:**
- `AdminWebsitesController.ts` — `createAllFromTemplate` and single-page creation both call `startPipeline`. Both paths affected.
- `service.deployment-pipeline.ts` — refactored to queue BullMQ jobs instead of firing n8n webhooks.
- `worker.ts` — new worker registration (additive, no risk to existing workers).
- `WebsiteDetail.tsx` — UI additions (progress bar, cancel button). Existing badges unchanged.
- `PageEditor.tsx` — new live preview mode when `generation_status === 'generating'`. Normal editor mode unchanged.

**Pushback:** None. This is a well-motivated migration with clear benefits. The feature flag mitigates rollback risk.

## Tasks

### T1: Database migration + agent prompts
**Do:**
1. Create migration adding:
   - `generation_progress JSONB DEFAULT NULL` on `website_builder.pages` — shape: `{total: number, completed: number, current_component: string}`
   - `generation_cancel_requested BOOLEAN DEFAULT FALSE` on `website_builder.projects`
   - Add `'cancelled'` to `website_builder.page_generation_status` enum
2. Create prompt files in `src/agents/websiteAgents/builder/`:
   - `DataAnalysis.md` — system prompt for distilling website + GBP data into clean JSON (ported from n8n Gemini "content analysis and extractor agent" prompt, adapted for Claude)
   - `ImageAnalysis.md` — system prompt for analyzing images: dimensions, quality, placement, logo detection (ported from n8n Gemini image analysis prompt)
   - `ComponentGenerator.md` — system prompt for generating customized HTML per component from template + data context (ported from n8n Gemini "website builder agent" prompt, preserving color utility class rules and `{{slot}}` wrapper rule)

**Files:**
- `src/database/migrations/{timestamp}_website_builder_generation_pipeline.ts`
- `src/agents/websiteAgents/builder/DataAnalysis.md`
- `src/agents/websiteAgents/builder/ImageAnalysis.md`
- `src/agents/websiteAgents/builder/ComponentGenerator.md`
**Depends on:** none
**Verify:** `npm run db:migrate` succeeds. Prompt files load via `loadPrompt("websiteAgents/builder/DataAnalysis")`.

### T2: Pipeline orchestrator service
**Do:**
Create `service.generation-pipeline.ts` with three main functions:

1. **`scrapeAndCacheProject(projectId, params, signal?)`** — project-level data collection:
   - Call Apify Google Maps scraper (reuse pattern from `service.apify.ts`: start actor run, poll for completion, fetch dataset)
   - Update project `step_gbp_scrape`, set status `GBP_SCRAPED`
   - Call scraping orchestrator directly (internal function call, not HTTP) for website scrape
   - Update project `step_website_scrape`, set status `WEBSITE_SCRAPED`
   - Collect image URLs from GBP + website scrape
   - For each image: download, upload to S3 (`alloro-main-bucket/uploads/{projectId}/`), call Claude with image for analysis
   - Batch images into groups of 5 for Claude vision calls (reduce call count)
   - Update project `step_image_analysis`, set status `IMAGES_ANALYZED`
   - Check cancel flag + AbortSignal between each sub-step
   - If website scrape fails: continue with GBP data only (no images from website)

2. **`generatePageComponents(pageId, projectId, signal?)`** — per-page HTML generation:
   - Read cached data from project columns (step_gbp_scrape, step_website_scrape, step_image_analysis)
   - Read template data (from template + template_page associated with the page)
   - Call Claude once to distill website + GBP data into clean structured JSON (DataAnalysis prompt)
   - Determine component list: [wrapper, header, ...sections, footer] from template
   - Set page `generation_progress = {total: N, completed: 0, current_component: 'wrapper'}`
   - For each component in order:
     - Call Claude with: component template markup, distilled data, image analyses, color config, pageContext (ComponentGenerator prompt)
     - Parse JSON response `{name, html}`
     - Append to page `sections` JSONB array
     - If component is wrapper/header/footer AND page path is "/": also update project columns
     - Increment `generation_progress.completed`, update `current_component`
     - Check cancel flag between each component
   - Mark page `generation_status = 'ready'`, `generation_progress = null`
   - If homepage: set project status `LIVE`

3. **`cancelProjectGeneration(projectId)`** — kill switch:
   - Set `generation_cancel_requested = true` on project
   - Update all pages with `generation_status IN ('queued', 'generating')` to `'cancelled'`
   - Return count of cancelled pages

**Files:**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
**Depends on:** T1 (needs migration columns + prompts)
**Verify:** Unit-level: functions can be called with mock data. Integration: manual test via REPL.

### T3: BullMQ job processor + worker registration
**Do:**
1. Create `websiteGeneration.processor.ts` with two exported functions:
   - `processProjectScrape(job)` — wraps `scrapeAndCacheProject()`. Job data: `{projectId, placeId, practiceSearchString, websiteUrl, pages: [{pageId, templatePageId, path}], ...businessMetadata}`. On completion: enqueue one `wb-page-generate` job per page.
   - `processPageGenerate(job)` — wraps `generatePageComponents()`. Job data: `{pageId, projectId}`.
   - Both: check `generation_cancel_requested` at start, bail early if true. Create `AbortController`, pass signal to pipeline functions.

2. Register in `worker.ts`:
   - `wb-project-scrape` worker: concurrency 1, lock duration 600000 (10 min)
   - `wb-page-generate` worker: concurrency 2, lock duration 300000 (5 min)
   - Add to event handlers array and shutdown function

3. Add queue helper if needed (may just use `getWbQueue("project-scrape")` and `getWbQueue("page-generate")`)

**Files:**
- `src/workers/processors/websiteGeneration.processor.ts`
- `src/workers/worker.ts` (modify — add workers + shutdown)
**Depends on:** T2 (calls pipeline service functions)
**Verify:** `npm run dev:worker` starts without errors. Jobs can be enqueued via `getWbQueue("project-scrape").add(...)`.

### T4: API endpoint changes
**Do:**
1. Refactor `service.deployment-pipeline.ts` `startPipeline()`:
   - When `USE_BACKEND_PIPELINE` env var is truthy: enqueue `wb-project-scrape` BullMQ job instead of firing n8n webhook
   - When falsy: keep existing n8n webhook behavior (backward compat)
   - For build-all: enqueue ONE `wb-project-scrape` job with all page IDs. The processor handles fanning out to per-page jobs after scrape.
   - For single page (when project already has cached scrape data): enqueue `wb-page-generate` directly, skip scrape.

2. Add cancel endpoint in `AdminWebsitesController.ts`:
   - `POST /:id/cancel-generation` → calls `cancelProjectGeneration(projectId)`
   - Returns `{success: true, cancelledPages: number}`

3. Enhance `getPagesGenerationStatus` in `service.project-manager.ts`:
   - Add `generation_progress` to the SELECT query
   - Return it in the response so frontend has component-level progress

4. Add route definition in `routes/admin/websites.ts`

**Files:**
- `src/controllers/admin-websites/feature-services/service.deployment-pipeline.ts` (modify)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — add cancel handler, modify createAllFromTemplate to single-job dispatch)
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` (modify — enhance polling query)
- `src/routes/admin/websites.ts` (modify — add cancel route)
**Depends on:** T3 (needs processor + queues registered)
**Verify:** `curl -X POST .../cancel-generation` returns success. Generation status endpoint includes `generation_progress` field. Feature flag toggles between n8n and BullMQ paths.

### T5: Frontend — progress bars + kill switch
**Do:**
1. Update `api/websites.ts`:
   - Add `cancelGeneration(projectId)` API call
   - Update `PageGenerationStatusItem` type to include `generation_progress: {total: number, completed: number, current_component: string} | null`

2. Update `WebsiteDetail.tsx`:
   - **Project-level progress bar:** When `isCreatingAll`, show `"Building pages: 3 of 8 complete"` with a progress bar. Derive from polling response: count `ready` / total pages.
   - **Per-page progress bar:** Replace the bare `generating` badge with a mini progress bar: `"header (2/7)"`. Read from `generation_progress` field.
   - **Kill switch:** Red "Cancel" button visible when any pages are `queued` or `generating`. Calls `cancelGeneration()`. On click: confirm modal → API call → poll until all pages show `cancelled` or `failed`.
   - **Cancelled state:** New badge style for `cancelled` status (gray with slash icon).

**Files:**
- `frontend/src/api/websites.ts` (modify — add cancel call, update types)
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — progress bars, cancel button, cancelled badge)
**Depends on:** T4 (needs cancel endpoint + enhanced polling)
**Verify:** Manual: trigger build-all, see progress bars update. Click cancel, confirm pages stop generating.

### T6: Frontend — live preview
**Do:**
1. Update `PageEditor.tsx`:
   - Detect `generation_status === 'generating'` on page load or when navigating to a generating page
   - Enter **live preview mode**: read-only, no editing controls, progress overlay
   - Poll `fetchPage(projectId, pageId)` every 2 seconds
   - On each poll: call `renderPage()` with current partial sections → update iframe
   - Animate new components: CSS transition (fade-in + slide-down) when a new section appears that wasn't in the previous poll
   - Show progress indicator: `"Building: services section (4 of 7)..."` from `generation_progress`
   - When `generation_status` transitions to `ready`: stop polling, remove overlay, enable full editor
   - When `cancelled` or `failed`: show appropriate message, link back to page list

2. Component rendering order in preview: wrapper (page shell) → header → sections in array order → footer. Each appears as it's written to the DB.

**Files:**
- `frontend/src/pages/admin/PageEditor.tsx` (modify — add live preview mode)
**Depends on:** T4 (needs incremental page data from polling)
**Verify:** Manual: trigger single page generation, open page editor immediately, watch components appear one by one with animation. Verify transitions to full editor when done.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend)
- [ ] `cd frontend && npx tsc --noEmit` — zero errors (frontend)
- [ ] Feature flag `USE_BACKEND_PIPELINE=true`: build-all queues BullMQ jobs, pages generate via Claude Sonnet
- [ ] Feature flag `USE_BACKEND_PIPELINE=false` (or unset): old n8n webhook path still works
- [ ] Apify + website scrape runs once per project, results cached in project columns
- [ ] Each page generates component-by-component, writing to DB after each
- [ ] `GET /:projectId/pages/generation-status` returns `generation_progress` with component counts
- [ ] Project-level progress bar shows `"3 of 8 pages complete"` during build-all
- [ ] Per-page progress bar shows `"header (2/7)"` during generation
- [ ] Cancel button stops all in-progress generation, pages show `cancelled` status
- [ ] Opening a generating page in the editor shows live preview with components appearing
- [ ] Live preview transitions to full editor when generation completes
- [ ] No regressions in existing page editor, page list, or template system
