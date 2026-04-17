# Project Identity Architecture

## Why
The current model spreads project context across multiple columns (`step_gbp_scrape`, `step_website_scrape`, `step_image_analysis`) populated only as a side effect of triggering generation. Project creation is GBP-first, which doesn't fit clients who already have content elsewhere or want to set up manually. There's no single source of truth for "who is this practice and what should the AI know," no way to enrich identity from multiple sources (GBP + page URLs + plain text), and no way to update identity conversationally. This blocks all the quality enhancements that depend on having clean, structured project knowledge.

## What
Introduce **Project Identity** as the single source of truth for project context:

1. **`project_identity` JSONB column** on `website_builder.projects` — consolidates business data, voice/tone, content essentials, extracted assets (logo, images), and brand decisions. Written once during warmup, updated via chat thereafter.
2. **Manual setup as default** — remove GBP-first project creation. New projects go straight to the dashboard, where a 3-step onboarding card shows: (1) Identity → (2) Layouts → (3) First Page. Each step is locked until the previous completes.
3. **Project Identity modal** — opened from a dedicated header button. Empty state shows a warmup form with three input options (GBP picker, multiple page URLs with `+` add, plain text). Ready state shows a structured summary, an editable JSON view, and a chat input for natural-language updates.
4. **Identity warmup pipeline** (`wb-identity-warmup` BullMQ job) — runs the full enrichment: GBP scrape → token-conservative URL scrapes → text input ingestion → image analysis → archetype classification → smart slot extraction → logo download/host. Outputs the consolidated `project_identity` JSONB.
5. **Chat-based identity updates** via Claude tool calling — admin types natural language ("change accent to navy"); LLM picks structured tools (`update_brand_color`, `update_archetype`, etc.); backend applies changes to identity; toast confirms the change.
6. **Migrate consumers** — 4 files currently read `step_gbp_scrape` directly; switch them to read from `project_identity.business`. Keep `primary_color`/`accent_color` columns mirrored for the 14 legacy consumers (no risky refactor).

Done when: a freshly created project lands on the dashboard with a 3-step onboarding card. Step 1 opens the Identity modal with an empty warmup form. Admin fills any combination of GBP / page URLs / text → clicks Generate Identity → background job runs → modal updates with structured summary + editable JSON. Admin can chat-update fields ("change archetype to luxury") and see toast notifications. Page and layout generation pipelines (existing + the revised 04172026 plan) read from `project_identity` instead of `step_*` columns.

## Context

**Relevant files (backend):**
- `src/models/website-builder/ProjectModel.ts` — IProject interface; needs `project_identity` field
- `src/database/migrations/20260209000001_create_projects_table.ts` — original projects table
- `src/database/migrations/20260225000008_add_colors_to_projects.ts` — colors columns to keep
- `src/controllers/admin-websites/AdminWebsitesController.ts` — project CRUD endpoints (`createProject` removes GBP-first logic; new `Identity` endpoints added)
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` — `createProject` logic
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — currently writes `step_*_scrape` columns; will be reused (the scrape primitives are extracted into reusable functions, the pipeline orchestration moves to a new identity warmup service)
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — Apify GBP scrape pattern
- `src/controllers/admin-websites/feature-services/service.website-scraper.ts` — single-URL scraper (need multi-URL extension)
- `src/agents/service.llm-runner.ts` — Claude wrapper (extend for tool calling)
- `src/agents/service.prompt-loader.ts` — prompt loading
- `src/workers/wb-queues.ts` — `getWbQueue("identity-warmup")`
- `src/workers/worker.ts` — register new worker
- `src/controllers/websiteContact/formSubmissionController.ts` (line 87) — reads `step_gbp_scrape` for business name
- `src/utils/core/s3.ts` — S3 upload helpers

**Relevant files (frontend):**
- `frontend/src/pages/admin/WebsiteDetail.tsx` — currently shows GBP search prominently (~lines 1338-1577); becomes 3-step onboarding card + Identity button in header (~lines 274-280 area)
- `frontend/src/pages/admin/WebsitesList.tsx` (line 274) — reads `step_gbp_scrape` for display
- `frontend/src/api/websites.ts` — `WebsiteProject` type, project APIs
- `frontend/src/components/Admin/CreatePageModal.tsx` — already has GBP picker code (extract pattern)
- `frontend/src/api/places.ts` — Places API helpers (search, details)

**Patterns to follow:**
- BullMQ processor pattern: `src/workers/processors/websiteGeneration.processor.ts`
- LLM call pattern: `src/agents/service.llm-runner.ts` `runAgent()`
- Multimodal Claude calls: existing `runAgent` already supports images
- Modal with stages: any existing wizard modal in frontend (e.g., the existing build-all modal in WebsiteDetail.tsx)
- Tool calling reference: Anthropic SDK `messages.create({ tools, ... })` — fetch latest docs via context7 during execution if needed

**Reference file:** `src/workers/processors/websiteGeneration.processor.ts` — analog for the new identity warmup processor

## Constraints

**Must:**
- `project_identity` is the source of truth for business + content data going forward
- 4 consumers of `step_gbp_scrape` must migrate to read from `project_identity.business` in this plan
- Backfill `project_identity` for existing projects from their current `step_*` columns during migration
- Keep `primary_color`, `accent_color`, `gradient_*` columns (mirrored to/from `project_identity.brand`) — too widely used to refactor safely
- Identity warmup is explicitly admin-triggered (not automatic on project creation)
- URL scraping must be token-conservative: strip `<script>`, `<style>`, HTML tags, special chars, URLs from the scraped text BEFORE sending to Claude
- Logo URL provided in warmup must be downloaded → uploaded to S3 → S3 URL stored in `project_identity.brand.logo_s3_url`
- Image analysis runs on all collected images (GBP + scraped URLs) and results live in `project_identity.extracted_assets.images`
- Identity update via chat uses Claude tool calling — never round-trip the full identity JSON
- Manual setup is the default project creation flow; remove the GBP-first prompt on project creation

**Must not:**
- Drop `step_*_scrape` columns in this plan (Phase 2 follow-up after monitoring)
- Drop `primary_color`, `accent_color`, `gradient_*` columns (legacy compat)
- Auto-trigger warmup on project creation (admin must explicitly start it)
- Break existing projects — backfill must produce valid `project_identity` for any project with non-null `step_*` data
- Modify the page/layout pipelines in this plan — those changes belong to the revised 04172026 plan that depends on this foundation

**Out of scope:**
- Phase 2 column drop migration (follow-up after this is monitored in production)
- Page/layout pipeline rewrites to read from `project_identity` (handled by revised 04172026)
- Tool calling for image selection in the page generator (revised 04172026)
- Per-component regenerate (revised 04172026)
- Admin UI for editing template_pages.dynamic_slots schemas (separate plan)

## Risk

**Level:** 3 (Structural — introduces a new core data model and shifts a critical column dependency)

**Risks identified:**
- Existing live projects rely on `step_gbp_scrape` being present. Migration must backfill cleanly. → **Mitigation:** Idempotent backfill in the migration that constructs `project_identity` from existing `step_*` data. Includes a dry-run log so we can verify the result before committing.
- Backfill may produce malformed identity for projects with partial data. → **Mitigation:** Backfill only the fields that exist; missing sections are explicit `null` not invented values. Identity schema tolerates partial completeness.
- Removing GBP-first from project creation may surprise admins who expect it. → **Mitigation:** Manual setup is the default, but the GBP option is preserved INSIDE the Identity modal warmup form. Same capability, different surface.
- Multi-URL scraping with token-conservative cleaning may strip too much / too little. → **Mitigation:** Reuse the existing `service.website-scraper.ts` pattern. Add a stronger cleaner for Claude consumption (separate from the raw HTML stored for re-use).
- Tool calling for chat updates is a new SDK capability we haven't used in this codebase. → **Mitigation:** Extend `service.llm-runner.ts` with a `runWithTools()` helper. Keep the existing `runAgent()` unchanged to avoid breaking other callers.
- Identity update via chat could let admins corrupt the identity ("delete everything"). → **Mitigation:** Tools are defined as targeted updates (no `delete_all` tool). Free-form `general_content_update` tool restricted to specific paths. Server-side validation rejects updates to read-only paths (e.g., `place_id`, `warmed_up_at`).

**Blast radius:**
- `ProjectModel`, `WebsiteProject` type, project list display, project detail display, form submission emails — all updated to read business name/category/etc. from `project_identity.business`
- `service.generation-pipeline.ts` — partial refactor: `scrapeAndCacheProject` becomes the warmup primitive; the existing call sites that wrote `step_*` columns now write to `project_identity`. Page generation in this file is left untouched (revised 04172026 will refactor it).
- `worker.ts` — additive (new worker registration)
- `WebsiteDetail.tsx` — significant restructure of the project header area and removal of the GBP-first card

**Pushback:**
- A full chat conversation interface (multi-turn dialog history) is overengineered for this. Single-shot input (one instruction → one update → toast) covers 95% of cases. If admins need conversational refinement, that's a follow-up.
- Storing raw HTML for every scraped URL in `project_identity.raw_inputs` could bloat the JSONB to many MB. Cap raw stored input at 50KB per source — enough for re-derivation, not so large it kills queries.

## Identity JSON Schema

```json
{
  "version": 1,
  "warmed_up_at": "2026-04-17T10:30:00Z",
  "last_updated_at": "2026-04-17T11:15:00Z",
  "sources_used": {
    "gbp": { "place_id": "...", "scraped_at": "2026-04-17T10:25:00Z" },
    "urls": [
      { "url": "https://example.com/about", "scraped_at": "...", "char_length": 4231 },
      { "url": "https://example.com/services", "scraped_at": "...", "char_length": 8123 }
    ],
    "text_inputs": [
      { "label": "founder note", "char_length": 312 }
    ]
  },
  "business": {
    "name": "Prime Clinic",
    "category": "Dental Office",
    "phone": "...",
    "address": "...",
    "city": "...",
    "state": "...",
    "zip": "...",
    "hours": [...],
    "rating": 4.8,
    "review_count": 127,
    "website_url": "...",
    "place_id": "..."
  },
  "brand": {
    "primary_color": "#064B9E",
    "accent_color": "#8DC740",
    "gradient_enabled": true,
    "gradient_from": "#064B9E",
    "gradient_to": "#8DC740",
    "gradient_direction": "to-br",
    "logo_s3_url": "https://alloro-main-bucket.s3.amazonaws.com/...",
    "logo_alt_text": "Prime Clinic Logo",
    "fonts": { "heading": "serif", "body": "sans" }
  },
  "voice_and_tone": {
    "archetype": "family-friendly",
    "tone_descriptor": "warm, approachable, professional",
    "voice_samples": ["...", "..."]
  },
  "content_essentials": {
    "unique_value_proposition": "...",
    "founding_story": "...",
    "core_values": ["...", "..."],
    "certifications": ["ADA", "Invisalign Diamond Provider"],
    "service_areas": ["Austin", "Round Rock"],
    "social_links": { "facebook": "...", "instagram": "..." },
    "review_themes": ["gentle with kids", "modern office", "on-time appointments"],
    "featured_testimonials": [
      { "author": "...", "rating": 5, "text": "..." }
    ]
  },
  "extracted_assets": {
    "images": [
      {
        "source_url": "...",
        "s3_url": "...",
        "description": "...",
        "use_case": "hero",
        "resolution": "high",
        "is_logo": false
      }
    ],
    "discovered_pages": [
      { "url": "...", "title": "About Us", "content_excerpt": "..." }
    ]
  },
  "raw_inputs": {
    "gbp_raw": { /* compact apify response */ },
    "scraped_pages_raw": { "url1": "cleaned text (capped at 50KB)", "url2": "..." },
    "user_text_inputs": [{ "label": "...", "text": "..." }]
  }
}
```

## Identity Update Tools

Available tools the chat-update LLM can call:

- `update_brand_color({ field: "primary_color"|"accent_color"|"gradient_from"|"gradient_to", value: hex_string })`
- `update_gradient({ enabled?, direction? })`
- `update_business_field({ field: "name"|"phone"|"address"|"city"|"state"|"zip"|"category", value })`
- `update_archetype({ archetype, reason })`
- `update_voice_tone({ tone_descriptor })`
- `update_uvp({ text })`
- `update_founding_story({ text })`
- `update_core_values({ values: string[] })` — replaces array
- `add_certification({ value })` / `remove_certification({ value })`
- `add_service_area({ value })` / `remove_service_area({ value })`
- `add_social_link({ platform, url })` / `remove_social_link({ platform })`
- `update_logo({ url })` — triggers download → S3 → updates `brand.logo_s3_url`
- `update_review_themes({ themes: string[] })`
- `update_featured_testimonials({ testimonials: Array })` — replaces

Each tool returns a structured result with `{ success: boolean, message: string }`. The message becomes the toast text shown to the admin.

## Tasks

### T1: Database migration
**Do:**
1. Add `project_identity JSONB DEFAULT NULL` to `website_builder.projects`
2. Backfill `project_identity` for existing projects with non-null `step_*_scrape` data:
   - Build identity from `step_gbp_scrape` → populate `business`, partial `brand` (name → logo_alt fallback), `extracted_assets.images` from GBP imageUrls
   - Add `step_website_scrape` → populate `extracted_assets.discovered_pages` (basic), `raw_inputs.scraped_pages_raw`
   - Add `step_image_analysis` → populate `extracted_assets.images` (merge with GBP)
   - Mirror existing `primary_color`, `accent_color` into `project_identity.brand`
   - Set `version: 1`, `warmed_up_at = updated_at`
3. **Do NOT drop** `step_*_scrape` columns in this migration. Phase 2 follow-up.

**Files:**
- `src/database/migrations/{timestamp}_add_project_identity.ts`
**Depends on:** none
**Verify:** `npm run db:migrate` clean. Query `SELECT id, project_identity FROM website_builder.projects WHERE step_gbp_scrape IS NOT NULL` returns populated identity for all backfilled rows.

### T2: Backend — extend service.llm-runner.ts for tool calling
**Do:**
1. Add a `runWithTools()` function alongside the existing `runAgent()`:
   - Signature: `runWithTools({ systemPrompt, userMessage, tools: AnthropicTool[], maxTokens, model? }): Promise<{ toolCalls: ToolCall[], textResponse: string|null, raw }>`
   - Returns array of tool calls (Claude can call multiple in one turn) plus optional text response (used when LLM asks for clarification instead of calling a tool)
   - Same logging pattern as `runAgent`
2. Define a `ToolCall` type: `{ name: string, input: Record<string, unknown>, id: string }`

**Files:**
- `src/agents/service.llm-runner.ts` (modify — add `runWithTools` function)
**Depends on:** none
**Verify:** Function callable from a REPL. Returns parsed tool calls when Claude responds with tool use.

### T3: Backend — Identity warmup pipeline service
**Do:**
1. Create `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` exporting:
   - `runIdentityWarmup(projectId, inputs, signal?): Promise<void>` where `inputs = { placeId?, urls?: string[], texts?: { label, text }[], logoUrl?, primaryColor?, accentColor?, gradient? }`
   - Steps in order:
     1. Update `project.warmup_status = 'running'`
     2. If `placeId` provided: run Apify GBP scrape (reuse `scrapeGbp` from existing `service.generation-pipeline.ts` — extract it into a shared util)
     3. For each URL in `urls`: scrape via `service.website-scraper.ts`. Apply token-conservative cleaning (strip `<script>`, `<style>`, HTML tags, special chars, URLs). Cap each cleaned text at 50KB.
     4. For each item in `texts`: include as-is (capped at 50KB each)
     5. Collect all images (GBP imageUrls + scraped page images). Run S3 upload + Claude vision analysis (reuse `processImages` from existing pipeline — extract to shared util)
     6. If `logoUrl` provided: download → S3 → designate as primary logo
     7. Run **archetype classification** (one Claude call with `ArchetypeClassifier.md` prompt). Inputs: GBP category + top reviews + business description.
     8. Run **content distillation** (one Claude call with `IdentityDistiller.md` prompt). Inputs: cleaned scraped texts + user texts. Outputs: structured `content_essentials` (UVP, founding story, values, certifications, service areas, social links, review themes, featured testimonials).
     9. Build the full `project_identity` JSON
     10. Write to `project.project_identity` AND mirror `brand.*` colors to legacy columns
     11. Update `project.warmup_status = 'ready'`, `warmed_up_at = now()`
2. Extract reusable scrape primitives from existing `service.generation-pipeline.ts` into shared utils so this service can call them without duplication:
   - `src/controllers/admin-websites/feature-utils/util.gbp-scraper.ts` — `scrapeGbp()`
   - `src/controllers/admin-websites/feature-utils/util.image-processor.ts` — `processImages()`
   - The existing `service.generation-pipeline.ts` continues to call these utils so no behavior change for current code
3. Cancel-aware: same pattern as existing pipelines (check abort signal between steps)

**Files:**
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` (new)
- `src/controllers/admin-websites/feature-utils/util.gbp-scraper.ts` (new — extracted)
- `src/controllers/admin-websites/feature-utils/util.image-processor.ts` (new — extracted)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — refactor to use the extracted utils, no behavior change)
- `src/agents/websiteAgents/builder/ArchetypeClassifier.md` (new)
- `src/agents/websiteAgents/builder/IdentityDistiller.md` (new)
**Depends on:** T1
**Verify:** Function callable; given test inputs, produces valid `project_identity` JSON. Existing page generation pipeline still works (no regression).

### T4: Backend — Identity warmup BullMQ processor + worker registration
**Do:**
1. Create `src/workers/processors/identityWarmup.processor.ts`:
   - Exports `processIdentityWarmup(job)` wrapping `runIdentityWarmup()` with cancel polling + AbortController
   - Job data: `{ projectId, inputs }`
2. Register `wb-identity-warmup` worker in `worker.ts` (concurrency 1, lockDuration 600000)
3. Add to event handlers + shutdown

**Files:**
- `src/workers/processors/identityWarmup.processor.ts` (new)
- `src/workers/worker.ts` (modify)
**Depends on:** T3
**Verify:** Worker starts, accepts jobs, runs warmup end-to-end on a test project.

### T5: Backend — Identity update via tool calling
**Do:**
1. Create `src/controllers/admin-websites/feature-services/service.identity-update.ts`:
   - Exports `updateIdentityViaChat(projectId, instruction): Promise<{ updates: ToolCall[], message: string, identity: ProjectIdentity }>`
   - Builds tool definitions (~14 tools listed in the spec)
   - Builds minimal context: current colors + archetype + business name (~500 tokens)
   - Calls `runWithTools()` with tools + instruction
   - For each returned tool call: validates inputs, applies to `project_identity`, mirrors brand colors to legacy columns if applicable, downloads logo if `update_logo` was called
   - Returns the toast message (joined from individual tool result messages)
2. Define tool schemas inline (Anthropic format)
3. Validate inputs server-side (e.g., color values must be valid hex; archetype must be in known set; URLs must be HTTPS)

**Files:**
- `src/controllers/admin-websites/feature-services/service.identity-update.ts` (new)
**Depends on:** T1, T2
**Verify:** Calling `updateIdentityViaChat(projectId, "change accent to red")` updates the project's identity and returns toast text. Test invalid input ("change name to <script>") is rejected.

### T6: Backend — API endpoints
**Do:**
1. Add endpoints in `AdminWebsitesController.ts`:
   - `POST /:id/identity/warmup` — body: `{ placeId?, urls?, texts?, logoUrl?, primaryColor?, accentColor?, gradient? }` → enqueues `wb-identity-warmup` job, returns `{ success: true }`
   - `GET /:id/identity` — returns current `project_identity` JSONB + `warmup_status`
   - `GET /:id/identity/status` — lightweight polling endpoint: `{ warmup_status, warmed_up_at }` only
   - `PUT /:id/identity` — body: `{ identity: ProjectIdentity }` → admin-edited JSON; validates schema, persists
   - `POST /:id/identity/chat` — body: `{ instruction: string }` → calls `updateIdentityViaChat`, returns `{ message, identity }`
2. Add routes in `routes/admin/websites.ts`
3. Modify `createProject` in `service.project-manager.ts`: remove any GBP-first auto-population. New projects get a generic name + slug only. Identity is set later via warmup.

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/routes/admin/websites.ts` (modify)
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` (modify — strip GBP-first logic from createProject)
**Depends on:** T3, T4, T5
**Verify:** All 5 endpoints work via curl. Project creation no longer requires placeId.

### T7: Backend — Migrate consumers of step_gbp_scrape to read from project_identity
**Do:**
Update each consumer to read from `project_identity.business` first, fall back to `step_gbp_scrape` for projects not yet backfilled (defensive, even though backfill should cover all):

1. `src/controllers/websiteContact/formSubmissionController.ts` (line 87-88) — read business name from `project_identity?.business?.name ?? step_gbp_scrape?.name`
2. `src/controllers/admin-websites/AdminWebsitesController.ts` — anywhere that reads `step_gbp_scrape` for response shaping → migrate
3. `frontend/src/pages/admin/WebsitesList.tsx` (line 274-275) — display logic
4. `frontend/src/pages/admin/WebsiteDetail.tsx` (lines 984-985, 274-275) — display logic + `gbpData` derivation

Update the `WebsiteProject` type in `frontend/src/api/websites.ts` to include `project_identity?: ProjectIdentity` and add a TypeScript type for `ProjectIdentity` matching the backend schema.

**Files:**
- `src/controllers/websiteContact/formSubmissionController.ts` (modify)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — display reads)
- `frontend/src/pages/admin/WebsitesList.tsx` (modify)
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — display reads only; major restructure happens in T9)
- `frontend/src/api/websites.ts` (modify — add `ProjectIdentity` type, add to `WebsiteProject`)
**Depends on:** T1
**Verify:** All consumer sites display correctly for both backfilled projects (have project_identity) and any edge-case project without it.

### T8: Frontend — Identity Modal component
**Do:**
1. Create `frontend/src/components/Admin/IdentityModal.tsx`:
   - Receives: `projectId`, `onClose`, `onIdentityChanged`
   - Fetches `GET /:id/identity` on open
   - **Empty state** (`warmup_status` is null/failed):
     - Form with three input groups:
       - **GBP picker** (reuse `searchPlaces` API; can be deferred to use the shared `GbpSearchPicker` from the 04172026 plan once that lands; for now, inline)
       - **Page URLs** — list with `+` button to add row, `×` to remove. URL inputs.
       - **Plain text** — list of `{ label, text }` items with `+`/`×`. Each is a small textarea with optional label.
       - **Brand colors** — primary, accent, gradient toggle (reuse existing ColorPicker for now; switches to GradientPicker when 04172026 lands)
       - **Logo URL** — single URL input
     - "Generate Identity" button → `POST /:id/identity/warmup` with all collected inputs
   - **Warming up state** (`warmup_status === 'running'`):
     - Animated indicator with status text ("Scraping your sources...", "Analyzing images...", "Classifying your practice...") — derived from a `current_step` field added to the warmup status endpoint (extends T6 endpoint)
     - Cancel button (uses existing cancel infra)
     - Polls `GET /:id/identity/status` every 2s
   - **Ready state** (`warmup_status === 'ready'`):
     - **Summary view** (default tab) — structured cards showing business basics, brand colors, archetype, content essentials, image count
     - **JSON view** (tab) — Monaco/CodeMirror editor with the full identity JSON, "Save" button → `PUT /:id/identity`
     - **Chat input** at the bottom (always visible in ready state) — input field, "Update" button → `POST /:id/identity/chat` → toast notification on success
     - "Re-run warmup" button (with confirmation — destroys current identity)
2. Add toast notification helper if not already present (check existing Toast usage)
3. JSON editor: use `react-json-view` or a simple `<textarea>` initially — keep it simple; admin power tool

**Files:**
- `frontend/src/components/Admin/IdentityModal.tsx` (new)
- `frontend/src/api/websites.ts` (modify — add identity API calls)
**Depends on:** T6, T7
**Verify:** Manual: open modal on a project without identity → see empty form. Fill inputs → click Generate → see warming-up state. After completion → see summary + JSON tabs. Type "change accent to red" in chat → see toast.

### T9: Frontend — WebsiteDetail restructure (3-step onboarding + Identity button)
**Do:**
1. Remove the GBP-first card section (~lines 1338-1577) from `WebsiteDetail.tsx`
2. Add a **3-step onboarding card** as the primary content when project status is CREATED or IN_PROGRESS:
   ```
   ┌─────────────────────────────────────────────┐
   │  Get your website live in 3 steps           │
   │                                             │
   │  ① Project Identity        [Start →]        │
   │     Tell us about the practice              │
   │                                             │
   │  ② Generate Layouts        🔒 (locked)      │
   │     Header, footer, page shell              │
   │                                             │
   │  ③ Generate First Page     🔒 (locked)      │
   │     Your homepage, ready to edit            │
   └─────────────────────────────────────────────┘
   ```
   - Step 1 unlocks always; step 2 unlocks when `warmup_status === 'ready'`; step 3 unlocks when `layouts_generated_at IS NOT NULL`
   - Each step: Start button → opens corresponding modal/flow. When completed: green checkmark + "Edit" button instead of "Start"
3. Add an **Identity button** in the header action area (next to "No Organization", "Custom Domain", refresh, external link, trash buttons). Icon: a sparkle or fingerprint glyph. Opens `IdentityModal`.
4. The button is always visible (not gated). Clicking it after warmup opens the summary/JSON/chat view.
5. The 3-step card disappears when all 3 are complete. The Identity button stays in the header forever.

**Files:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — major restructure of project header + dashboard layout)
**Depends on:** T8
**Verify:** Manual: create new project → land on detail page → see 3-step card with only step 1 unlocked. Click step 1 → IdentityModal opens. After warmup → step 2 unlocks. Header shows Identity button.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend)
- [ ] `cd frontend && npx tsc --noEmit` — zero errors (frontend)
- [ ] **Migration**
  - [ ] `project_identity JSONB` column exists on projects
  - [ ] All existing projects with `step_*` data are backfilled with valid `project_identity`
  - [ ] No `step_*` columns dropped (Phase 2 follow-up)
- [ ] **Identity warmup**
  - [ ] `POST /:id/identity/warmup` accepts GBP placeId, page URLs, text inputs, logo URL, brand colors
  - [ ] BullMQ job runs: GBP scrape → URL scrapes (token-conservative cleaning) → text ingestion → image S3 upload + analysis → archetype classification → content distillation → assembled identity JSON written to project
  - [ ] Logo URL: image downloaded, hosted in S3, S3 URL in `project_identity.brand.logo_s3_url`
  - [ ] Cancel button stops warmup mid-flight
- [ ] **Identity modal**
  - [ ] Opens from header button on every website detail page
  - [ ] Empty state: warmup form with GBP picker, multi-URL inputs (+ button), text inputs (+ button), brand colors, logo URL
  - [ ] Warming-up state: live progress with current step name + cancel button
  - [ ] Ready state: summary tab + JSON editor tab + chat input
  - [ ] Chat input ("change accent to red") triggers tool-calling LLM, applies update, shows toast
  - [ ] JSON editor allows direct edit + save
- [ ] **Project creation**
  - [ ] Manual setup is the default — no GBP-first card on the project detail page
  - [ ] Existing GBP search functionality is preserved INSIDE the IdentityModal warmup form (not lost)
- [ ] **3-step onboarding card**
  - [ ] Visible on the project detail page when project is not fully set up
  - [ ] Step 1 (Identity) always unlocked; step 2 (Layouts) unlocks when warmup_status='ready'; step 3 (First Page) unlocks when layouts_generated_at exists
  - [ ] Each step shows green checkmark when complete
  - [ ] Card disappears when all 3 are complete
- [ ] **Consumer migration**
  - [ ] Form submission emails read business name from `project_identity.business`
  - [ ] WebsitesList displays project info from `project_identity.business`
  - [ ] WebsiteDetail derives `gbpData` from `project_identity.business`
  - [ ] No regressions for projects backfilled from `step_*`
- [ ] **Backward compat**
  - [ ] `primary_color`, `accent_color`, `gradient_*` columns still populated (mirrored from identity)
  - [ ] No regression in form submissions, backups, restores, AI command, instant generator
  - [ ] No regression in existing live sites
