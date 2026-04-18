# Costs Tab + Page Builder Quality Fixes

## Why
Seven related concerns surfaced while stress-testing the builder:
(1) no visibility into what every agent run costs; (2) generated copy reads AI-ish because of em-dashes; (3) per-section rebuild has no perceivable UI feedback; (4) headings use sans in places where the design calls for serif; (5) the AI fabricates extra sub-components inside template sections; (6) `__skip__` slot marker is ignored — a skipped section still renders; (7) contrast bugs (white-on-white, dark-on-dark) ship to preview.

We need to close observability (item 1), tighten output quality (items 2, 4, 5, 7), fix two execution bugs (items 3, 6) — all scoped to the website builder.

## What
A Medium-Large batch, decomposable into parallel task groups:

- **Costs** — new `/admin/websites/:id` tab listing every AI run with vendor, model, token breakdown, and estimated USD. Project-level total at top.
- **Copy quality** — prompt rules banning em-dashes, forcing `font-serif` on all headings globally, forbidding extra child components in template sections, enforcing contrast pairs. Plus a post-gen lint that surfaces violations.
- **Section rebuild UX** — the regenerating section pulses + grays out + shows a toast on completion.
- **Skip actually skips** — pre-generation stripping of template sub-sections tied to skipped slots, backed by a template annotation (`data-slot-group`) + critic hard-reject.

## Context

**Relevant files:**
- `src/agents/service.llm-runner.ts` — single chokepoint for all Anthropic SDK calls. Already extracts `response.usage` but drops it after logging.
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — prompt used for per-section HTML generation. Owns font rules, color rules, slot directives.
- `src/agents/websiteAgents/builder/ComponentCritic.md` — self-critique prompt, runs post-generation on every component.
- `src/agents/websiteAgents/builder/LayoutGenerator.md` — wrapper/header/footer generation. Injects the `<style>` block with color utilities.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — orchestrates page build, per-component loop, enqueues regenerate-component jobs.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts:316-344` — parses `__skip__`/`__generate__` markers into groups, appends to user message as advisory text.
- `src/controllers/admin-websites/AdminWebsitesController.ts:848-901` — `regeneratePageComponent` endpoint, sets `generation_status = "generating"` and enqueues job.
- `src/utils/website-utils/htmlValidator.ts` — existing post-gen structural linter (absolute/fixed positioning, opacity variants, some contrast). Lands the new checks.
- `src/database/migrations/20260319000001_seed_dental_review_blocks.ts` — dental SEO template seed. Inconsistent serif/sans on headings today; needs `data-slot-group` attributes retrofitted.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — tab bar lives here (~line 1569). Costs tab + data fetch wires in here.
- `frontend/src/pages/admin/PageEditor.tsx:464-552` — live-preview polling loop. Section rebuild animation hooks alongside.
- `frontend/src/components/Admin/RegenerateComponentModal.tsx` — fires regenerate API, closes on success with no toast, no per-section feedback.

**Patterns to follow:**
- BullMQ processors: `src/workers/processors/websiteGeneration.processor.ts` (natural home for cost logging hooks after generation).
- Admin controllers: `src/controllers/admin-websites/AdminWebsitesController.ts` (use as model for the new costs route).
- Frontend tab panel: the existing Layouts tab in `WebsiteDetail.tsx` is the analog — scrollable list + state fetched on tab activation.

**Reference file:** `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — closest analog for the cost persistence service (same DB pattern, same project context).

## Constraints

**Must:**
- Cost logging must not block or slow the generation pipeline — fire-and-forget with a try/catch that never throws upstream.
- All new DB columns on existing tables go through a single migration file. New `ai_cost_events` table in its own migration.
- Prompt changes must preserve shortcode byte-exactness rule (`[post_block]`, `[review_block]`, `{{...}}`).
- New template markup (the `data-slot-group` annotations) must be non-breaking — old templates without the attribute keep working.
- Toast pattern must match existing toast usage in the codebase (find and use the current toast helper, do not introduce a new one).

**Must not:**
- Don't introduce a new LLM pricing service / external dependency. Hardcode a small `MODEL_PRICING` map in a single file.
- Don't instrument Apify, Puppeteer, or OpenAI in this pass — Anthropic only. Leave a TODO in the cost service.
- Don't refactor `service.llm-runner.ts` beyond adding a cost-capture hook.
- Don't change the regenerate-component job schema or API contract.

**Out of scope:**
- Cost rollups per-user / per-org. (MVP is per-project only.)
- Cost budget enforcement / throttling.
- Historical backfill of cost data for past runs.
- Cost export / CSV download.
- Apify cost tracking (needs their API polled post-run; separate plan).
- Template fidelity "tag-counting diff" enforcement — prompt + lint warning only.

## Risk

**Level:** 3 — Structural risk in the skip-fix (template annotations) and cost instrumentation (touches every LLM call site). Levels 1–2 elsewhere.

**Risks identified:**
- **Skip fix requires template annotations.** → **Mitigation:** ship the pre-gen stripping code behind `if (templateHasAnnotations)`. Annotate the dental SEO template in the same PR. If a template lacks annotations, fall back to today's advisory-only behavior (unchanged).
- **Cost logging can double-count nested tool calls.** `runWithTools()` can trigger nested Claude calls via `select_image`. → **Mitigation:** log usage from each tool-call turn separately using `event_id` + `parent_event_id`; total = sum of all events for the parent request id.
- **Prompt-only fixes (em-dash, serif, contrast, fidelity) rely on Claude obeying.** → **Mitigation:** back prompts with deterministic fallbacks — global CSS injection for serif (not prompt), post-gen regex lint for em-dashes and contrast, critic hard-reject for template fidelity.
- **`animate-pulse` + `opacity-50` on a live section during regenerate could confuse users as to whether section is stale vs. building.** → **Mitigation:** overlay a centered "Rebuilding…" pill with spinner on top of the grayed section; remove grayout immediately on success and fire toast.
- **Cost estimates drift when Anthropic changes prices.** → **Mitigation:** store `estimated_cost_usd` at event-time (frozen). Refreshing prices doesn't rewrite history.

**Blast radius:**
- LLM call sites touched: `service.llm-runner.ts` (core), `service.generation-pipeline.ts`, `service.identity-warmup.ts`, `service.layouts-pipeline.ts`, `service.identity-proposer.ts`, `service.seo-generation.ts`, `service.page-editor.ts`, `aiCommandService.ts`, `service.minds-chat.ts`, `websiteGeneration.processor.ts`.
- Prompt file changes ripple to every page build + layouts build + critic run. Safe (additive), but every new project built during rollout will get the stricter rules.
- `htmlValidator.ts` runs on every generated component — adding checks affects pass/fail rates. Mitigation: new checks start as **warnings**, not hard rejects, until validated against 2–3 sample pages.
- Dental SEO template seed migration re-runs on fresh DBs only; existing projects don't get retro-annotations. That's fine — the annotation code is additive.

**Pushback:**
- **User asked for cost tracking across every agent process.** Instrumenting Apify, Puppeteer, OpenAI embeddings, and Google Places in the same pass is 3× the surface area for marginal value. Recommend Anthropic-only MVP (covers >80% of cost) with explicit TODO markers for the rest. If you disagree, we expand T3 to cover vendor adapters but this becomes a Large spec.
- **User said "page-specific context does not make sense" and now wants per-section pulse.** That's orthogonal — the Step-3 rename already addressed the naming confusion. The pulse is a live-preview UX fix, addressed separately here.
- **Skip fix via template stripping is the right long-term architecture**, but it requires the dental template to be re-seeded with annotations. This is a data migration. Alternative: make the prompt directive "MANDATORY: omit any markup whose purpose maps to a skipped slot" — cheaper but less reliable. Recommendation: do both (prompt AND stripping) — the prompt is free, the stripping is the guarantee.

## Tasks

Task groups can run in parallel: **Group A** (Costs), **Group B** (Prompt + validation quality), **Group C** (Section rebuild UX), **Group D** (Skip fix). Group A and B are fully independent. C and D share no files with A or B. All can dispatch to parallel sub-agents.

---

### Group A — Costs Tab (sequential within group)

#### T1: New `ai_cost_events` table
**Do:** Create migration adding `ai_cost_events` with columns: `id` (UUID pk), `project_id` (FK `website_builder.projects`, cascade delete), `event_type` (text, e.g. `page-generate`, `section-regenerate`, `warmup`, `layouts-build`, `editor-chat`, `identity-chat`, `critic`, `seo-generation`, `select-image-tool`), `vendor` (text, default `anthropic`), `model` (text), `input_tokens` (int), `output_tokens` (int), `cache_creation_tokens` (int, nullable), `cache_read_tokens` (int, nullable), `estimated_cost_usd` (decimal 10,6), `metadata` (JSONB, nullable — room for page_id, component_name, etc.), `parent_event_id` (UUID nullable — for nested tool calls), `created_at` (timestamptz default now). Index on `(project_id, created_at desc)`.
**Files:** `src/database/migrations/20260418000001_create_ai_cost_events.ts`, `plans/04172026-no-ticket-costs-tab-and-builder-quality/migrations/mssql.sql`, `plans/.../migrations/pgsql.sql`, `plans/.../migrations/knexmigration.js`.
**Depends on:** none.
**Verify:** `npm run db:migrate:status` shows new migration pending → apply → query `\d ai_cost_events` shows all columns.

#### T2: Cost pricing + capture service
**Do:** Create `src/services/ai-cost/service.ai-cost.ts` exporting `logAiCostEvent(event: AiCostEventInput)` and `estimateCost(model, usage)`. Contains a hardcoded `MODEL_PRICING` map for Claude Sonnet 4.6, Opus 4.7, Haiku 4.5 (input/output/cache-creation/cache-read rates per 1M tokens — use current Anthropic public prices at time of writing). Fire-and-forget wrapper `safeLogAiCostEvent()` catches and console.warns on errors so the pipeline never fails because of logging.
**Files:** `src/services/ai-cost/service.ai-cost.ts` (new), `src/services/ai-cost/pricing.ts` (new — the MODEL_PRICING map).
**Depends on:** T1.
**Verify:** unit check — call `estimateCost("claude-sonnet-4-6", {input_tokens: 1000, output_tokens: 500})` returns a plausible USD value.

#### T3: Wire cost capture into LLM runner + call sites
**Do:** In `service.llm-runner.ts`, add optional `costContext?: { projectId, eventType, parentEventId? }` to `runAgent()` and `runWithTools()` signatures. After each successful call, call `safeLogAiCostEvent()`. For `runWithTools` nested tool invocations, pass the top-level event id as `parent_event_id` so all turns roll up. At each LLM call site (list below), pass the appropriate `costContext`:
- `service.generation-pipeline.ts` → `page-generate` or `section-regenerate`
- `service.identity-warmup.ts` → `warmup`
- `service.layouts-pipeline.ts` → `layouts-build`
- `service.identity-proposer.ts` → `identity-propose`
- `service.seo-generation.ts` → `seo-generation`
- `service.page-editor.ts` (direct SDK call) → instrument manually with `logAiCostEvent`
- `aiCommandService.ts` (direct SDK call) → instrument manually
- `service.minds-chat.ts` → `minds-chat`
- ComponentCritic call in pipeline → `critic`
**Files:** `src/agents/service.llm-runner.ts` and the nine call-site files above.
**Depends on:** T2.
**Verify:** kick a page build on a test project → `select * from ai_cost_events where project_id = '…' order by created_at` returns 1 row per component + 1 for critic + 1 for any select_image tool call.

#### T4: Costs API endpoint
**Do:** New route `GET /api/admin/websites/:projectId/costs` returning `{ total_cost_usd, total_tokens: {input, output, cache_creation, cache_read}, events: [...] }`. Events shaped for UI consumption: `{id, event_type, model, input_tokens, output_tokens, estimated_cost_usd, metadata, created_at}`. Paginate (default 100 most recent, cursor later if needed).
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts` (add `getProjectCosts` handler), `src/routes/admin/websites.ts` (add route).
**Depends on:** T1.
**Verify:** `curl /api/admin/websites/{id}/costs` returns JSON shape matching contract.

#### T5: Costs tab in frontend
**Do:** In `WebsiteDetail.tsx` tab bar, add `"costs"` to the tab list with `<DollarSign>` icon. Add a new `CostsTab` component (`frontend/src/components/Admin/CostsTab.tsx`) that fetches `/costs`, renders:
- A header row: "Total: $X.XX across N runs" + token breakdown pill.
- A table-ish list: event type badge, model, tokens (in→out), cost, relative time, expandable row showing metadata JSON.
- Empty state when no events yet.
- Live refresh when any generation is active (reuse the existing `pageGenStatuses` polling signal — refetch costs when it toggles from active to idle).

Add corresponding API function in `frontend/src/api/websites.ts`.
**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`, `frontend/src/components/Admin/CostsTab.tsx` (new), `frontend/src/api/websites.ts`.
**Depends on:** T4.
**Verify:** Manual — kick a page build, open Costs tab, see live-updating list with total.

---

### Group B — Prompt + validation quality (parallelizable tasks within)

#### T6: Ban em-dashes in generated copy
**Do:** In `ComponentGenerator.md`, `LayoutGenerator.md`, and `ComponentCritic.md`, add a new "Prose Style" rule: "NEVER use em-dashes (—) or en-dashes (–). Use commas, periods, parentheses, or colons instead. Em-dashes are a strong AI tell and must not appear in generated copy." Add `/[—–]/` regex check to `htmlValidator.ts` → warning (not hard-reject) listing the offending characters. Critic should include em-dash check in its review.
**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`, `.../LayoutGenerator.md`, `.../ComponentCritic.md`, `src/utils/website-utils/htmlValidator.ts`.
**Depends on:** none.
**Verify:** regenerate a page post-change → spot-check output for absence of em-dashes.

#### T7: Global serif headings (deterministic)
**Do:** Don't rely on the prompt. In the wrapper `<style>` block generated by `LayoutGenerator.md` (and wherever wrapper CSS is assembled — check `service.generation-pipeline.ts` for wrapper stitching), inject:
```css
h1, h2, h3, h4, h5, h6 { font-family: var(--font-serif, Georgia, "Times New Roman", serif); }
```
Update `ComponentGenerator.md` font rules to note: "Headings are forced to serif via base CSS — do not add `font-sans` to h1–h6." Remove the conflicting `font-sans` from the dental SEO template seed where it lands on headings (e.g. `20260319000001_seed_dental_review_blocks.ts:58`).
**Files:** `src/agents/websiteAgents/builder/LayoutGenerator.md` (update the style block template), `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (ensure the injected CSS covers headings), `src/agents/websiteAgents/builder/ComponentGenerator.md`, `src/database/migrations/20260319000001_seed_dental_review_blocks.ts`.
**Depends on:** none.
**Verify:** Fresh page build → inspect rendered h1/h2/h3 → confirm serif in DevTools computed styles.

#### T8: Template structural fidelity
**Do:** In `ComponentGenerator.md`, replace the existing soft rule with a mandatory one: "CRITICAL: Do not add new sibling or child sections, cards, columns, or layout wrappers that aren't present in the template markup. Change text, colors, image sources, and attributes only. If the template has 3 cards, your output has 3 cards — not 4, not 2." In `ComponentCritic.md`, add a check: "Count the top-level direct children of the root `<section>` in the template vs. the output. If they differ by more than 1, reject with reason `STRUCTURE_DRIFT`." Add a same-intent check in `htmlValidator.ts` that compares top-level child count — warning only for MVP.
**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`, `.../ComponentCritic.md`, `src/utils/website-utils/htmlValidator.ts`.
**Depends on:** none.
**Verify:** Generate a page → diff rendered component's top-level DOM children against template → match within ±1.

#### T9: Contrast pairing
**Do:** In `ComponentGenerator.md` and `LayoutGenerator.md`, add explicit pairing rules:
> When you apply a background, the foreground text color must come from the approved pair:
> - `bg-white`, `bg-gray-50`, `bg-primary-subtle`, `bg-accent-subtle` → text must be `text-gray-900`, `text-gray-800`, or `text-primary`.
> - `bg-primary`, `bg-accent`, `bg-gradient-brand`, `bg-gray-900` → text must be `text-white`.
> NEVER combine `text-white` with `bg-white`/`bg-gray-50`/`bg-*-subtle`. NEVER combine `text-gray-900` with `bg-primary`/`bg-accent`/`bg-gradient-brand`.

In `htmlValidator.ts`, extend the contrast check to flag the banned combos listed above. Warning level for MVP.
**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`, `.../LayoutGenerator.md`, `src/utils/website-utils/htmlValidator.ts`.
**Depends on:** none.
**Verify:** Generate a page → validator log shows no contrast warnings; visual spot-check of cards.

---

### Group C — Section rebuild UX

#### T10: Per-section regenerate animation + toast
**Do:** In `PageEditor.tsx`, track `regeneratingSectionIds: Set<string>` state. When `RegenerateComponentModal` fires `onRegenerated(sectionId)`, add the id to the set. Render the corresponding section wrapper with `opacity-50 animate-pulse pointer-events-none` plus a centered overlay pill: `<Loader2 spin /> Rebuilding section…`. Hook into the existing live-preview polling loop (lines 464–552) — when a poll result shows the section's `html` has changed for a regenerating id, remove it from the set, trigger a toast "Section rebuilt — review changes", and scroll the section into view. Use the project's existing toast helper (search for `useToast`/`toast.success` patterns; do not introduce a new library).
**Files:** `frontend/src/pages/admin/PageEditor.tsx`, `frontend/src/components/Admin/RegenerateComponentModal.tsx` (pass section id to onRegenerated if not already).
**Depends on:** none.
**Verify:** Manual — edit a page, click "Regenerate" on a section → section grays + pulses → toast fires when fresh HTML arrives → new content visible.

---

### Group D — Skip fix

#### T11: Template slot-group annotations
**Do:** In the dental SEO template seed (`20260319000001_seed_dental_review_blocks.ts` and any related template-section seeds), wrap each sub-section whose presence is tied to a single slot with `data-slot-group="{slot_key}"`. Example: the gallery card/grid gets `data-slot-group="gallery_url"`. Only wrap the minimum removable subtree — preserve the section's other content. Add a comment in the seed file documenting the convention.
**Files:** `src/database/migrations/20260319000001_seed_dental_review_blocks.ts` and sibling template seed files (enumerate during execution by grepping `seed_dental`).
**Depends on:** none.
**Verify:** `grep -r data-slot-group src/database/migrations/` returns annotated subtrees; re-seed on fresh DB → query template_sections → confirm attribute present.

#### T12: Pre-generation template stripping
**Do:** Add `stripSkippedSlotGroups(sectionHtml, skippedSlotKeys)` to `util.identity-context.ts`. Uses a lightweight HTML parser (cheerio is already a dependency via scraping utils — reuse it) to find all `[data-slot-group="key"]` subtrees whose key is in `skippedSlotKeys` and remove them before the markup is passed to Claude. If the parser mutation strips the section's entire body, skip generation entirely and log `event_type = "section-skipped"` with no LLM cost. Keep the existing advisory-text injection as belt-and-suspenders.
**Files:** `src/controllers/admin-websites/feature-utils/util.identity-context.ts`, `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (call the stripper before prompt assembly).
**Depends on:** T11.
**Verify:** Set Gallery/Portfolio URL to `__skip__` → run page build → inspect rendered page → gallery subtree absent from output → logs show the stripper removed the subtree pre-LLM.

#### T13: Critic hard-reject for skipped content
**Do:** In `ComponentCritic.md`, add a rule: "If the prompt lists SKIP THESE SLOTS and the output contains visible content or structure for those slots, reject with reason `SKIPPED_SLOT_LEAKED`." In the pipeline's critic-loop, on `SKIPPED_SLOT_LEAKED`, do not re-roll — strip the offending subtree and mark the component as done. (Cheaper than another full Claude call.)
**Files:** `src/agents/websiteAgents/builder/ComponentCritic.md`, `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`.
**Depends on:** T12.
**Verify:** Intentionally skip T12's annotation on one section → re-run with `__skip__` → critic should flag `SKIPPED_SLOT_LEAKED` → pipeline auto-strips without a re-roll.

## Done
- [ ] `npm run db:migrate` applies T1 migration cleanly.
- [ ] `npx tsc --noEmit` in both `/` and `/frontend` — zero errors from this work.
- [ ] `npm run lint` (if configured) passes.
- [ ] Manual: Kick a fresh page build on a test project → Costs tab shows a row per component + critic + any tool call → total matches sum → est. cost ≈ expected ($).
- [ ] Manual: Generate a page with a skipped slot → target subtree absent from output HTML.
- [ ] Manual: Click Regenerate on a section → section pulses + grays → toast fires → new HTML renders without full-page reload.
- [ ] Manual: DevTools inspect rendered h1/h2 → `font-family` is a serif stack.
- [ ] Manual: Grep the generated HTML for `—` and `–` → zero matches in body copy (shortcodes/data attributes ok).
- [ ] Manual: No visible white-on-white or dark-on-dark cards in a generated page — eyeball.
- [ ] Cost logging never blocks pipeline — confirmed via intentional DB-down test (costs write fails, pipeline still succeeds).
- [ ] No regression in existing page builds — run the same template page pre- and post-change, diff rendered HTML for sanity.

## Revision Log

### Rev 1 — 2026-04-17 (during execution)
**Change:** T11 revised. Template HTML is not in a seed migration — it lives in `website_builder.template_pages.sections` JSONB, populated via a one-time data import. We cannot add `data-slot-group` annotations by editing a seed file.

**New approach for T11/T12/T13:**
- **T11 (dropped as a seed edit)** — no migration. Instead, define a `SLOT_TO_SECTION_KEYWORDS` map in `util.identity-context.ts` that binds each skippable slot key to keyword patterns (`gallery_source_url` → ["gallery", "portfolio", "before-after", "before/after"]). This map is the new source of truth for the stripper.
- **T12 (revised)** — `stripSkippedSlotGroups(sectionHtml, skippedSlotKeys)` uses cheerio to find top-level subtrees (direct children of the root `<section>`) whose text content contains the slot's keywords AND whose attributes don't carry the opposite marker. Removes them before the markup hits the AI. The cheerio approach supports a future `data-slot-group` attribute too — annotation wins when present, keyword fallback when not.
- **T13 (unchanged)** — critic hard-reject on `SKIPPED_SLOT_LEAKED` still ships as the second line of defense.

**Reason:** The cleanest future-state is data-slot-group annotations, but retrofitting requires a DB-scanning data migration which is out of scope for this plan. Keyword heuristics + critic hard-reject + strong prompt directive ships the fix today with acceptable precision. The annotation path stays open — cheerio stripper checks for `data-slot-group` first, falls back to keywords.

**Updated Done criteria:** unchanged — manual skip test still required to pass.
