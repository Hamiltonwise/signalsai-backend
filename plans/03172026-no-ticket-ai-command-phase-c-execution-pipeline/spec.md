# AI Command — Phase C: Execution Pipeline

## Why
Phases A and B let users analyze content and approve/reject recommendations. Phase C closes the loop — executing approved recommendations by sending each one through an LLM editor, validating output, and saving the results.

## What
Backend execution service that processes approved recommendations sequentially (one Sonnet call per recommendation), applies edits to pages (replace draft sections), layouts (save directly), and posts (save directly). Frontend gets an "Execute" button with progress tracking via polling.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` — Phase A service (batch + recommendation CRUD)
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — draft/publish workflow, `updatePage()` for saving sections
- `signalsai-backend/src/utils/website-utils/pageEditorService.ts` — existing `editHtmlComponent()` for element-level edits
- `signalsai-backend/src/utils/website-utils/aiCommandService.ts` — Phase A analysis service (Sonnet caller)
- `signalsai/src/components/Admin/AiCommandTab.tsx` — Phase B UI

**Patterns to follow:**
- Section editing: replace section HTML in the sections JSONB array, save via `updatePage()`
- Layout editing: update project wrapper/header/footer field directly
- Post editing: update post content field directly
- LLM call pattern: same as `aiCommandService.ts` but with an execution-specific prompt

**Key decisions already made:**
- Pages: replace draft sections (create draft from published if needed)
- Layouts + posts: save immediately (no draft protection)
- No backup before execution (user chose to trust approve/reject flow)
- Validation: parse LLM output, verify HTML is non-empty, retry once on failure
- Sequential processing (one recommendation at a time)

## Constraints

**Must:**
- Process only `approved` recommendations — skip pending/rejected
- Update recommendation status to `executed` or `failed` after each
- Update batch stats after each recommendation
- Store `execution_result` with edited HTML (for audit) or error details
- Create page draft automatically if only published version exists
- Respect existing page editor contract — don't bypass draft checks

**Must not:**
- Execute pending or rejected recommendations
- Process multiple recommendations in parallel (sequential for safety)
- Modify the analysis service or prompt
- Add new dependencies

**Out of scope:**
- Undo/rollback after execution (v2 — could use stored `current_html` snapshots)
- Preview before execution (v2)
- Streaming progress (polling is sufficient)

## Risk

**Level:** 3

**Risks identified:**
- LLM may produce broken HTML during execution → **Mitigation:** validate output is non-empty and parseable. Store original HTML in `current_html` field for manual recovery. Retry once on failure.
- Layout save is immediate and affects live site → **Mitigation:** `current_html` stored in recommendation record acts as undo source. User already approved the specific change. Log prominently.
- Stale HTML: content may have changed between analysis and execution → **Mitigation:** compare `current_html` (snapshot from analysis) against current live HTML. If they differ, skip recommendation and mark as `failed` with reason "Content changed since analysis."

**Pushback:**
- The stale HTML check is important. Without it, execution could overwrite manual edits made between analysis and execution. This is a structural risk that justifies the extra DB read per recommendation.

## Tasks

### T1: Execution service functions
**Do:** Add to `service.ai-command.ts`:

1. `executeBatch(batchId)` — main orchestration:
   - Load batch, verify status is "ready"
   - Update batch status to "executing"
   - Fetch all approved recommendations ordered by sort_order
   - For each recommendation:
     - Call `executeRecommendation(rec)`
     - Update batch stats
   - After all: update batch status to "completed" (or "failed" if all failed)

2. `executeRecommendation(rec)` — per-recommendation logic:
   - **Stale check:** fetch current HTML for the target, compare with `rec.current_html`. If different → mark failed, reason: "Content changed since analysis"
   - **LLM call:** send current HTML + `rec.instruction` to Sonnet via new `editHtmlContent()` in `aiCommandService.ts`
   - **Validate output:** non-empty HTML, basic structure check
   - **Save:**
     - `page_section`: load page sections array, replace section at `target_meta.section_index`, call `updatePage()` (ensures draft-only check)
     - `layout`: update project `wrapper`/`header`/`footer` field directly via knex
     - `post`: update post `content` field directly via knex
   - **Record result:** update recommendation with status `executed`, store `{ success: true, edited_html }` or `{ success: false, error }`

3. Helper: `getCurrentHtml(rec)` — fetches current live HTML for any target type:
   - page_section: fetch draft page (or published), extract section by index
   - layout: fetch project, return wrapper/header/footer field
   - post: fetch post, return content

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Functions compile, handle all 3 target types

### T2: Execution LLM function
**Do:** Add to `aiCommandService.ts`:

`editHtmlContent(params: { instruction: string, currentHtml: string, targetLabel: string })` → `{ editedHtml: string, inputTokens: number, outputTokens: number }`

**System prompt:** "You are a precise HTML editor. You receive an HTML snippet and an edit instruction. Return ONLY the complete modified HTML. Do not wrap in code fences. Do not add commentary. Preserve all existing classes, IDs, and structure unless the instruction specifically requires changing them."

- Model: `claude-sonnet-4-6`
- max_tokens: 8192 (execution output can be larger than analysis)
- Validation: result must be non-empty, must not be JSON (should be raw HTML)
- Retry: on empty or JSON output, retry once with "Return ONLY raw HTML, no JSON wrapper"
- If retry fails → throw, caught by `executeRecommendation` and marked as failed

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`
**Verify:** Function compiles, returns valid HTML

### T3: Controller + routes for execution
**Do:** Add to controller and routes:

**Controller:**
- `executeAiCommandBatch` — POST, validates batch exists + status is "ready" + has approved recommendations, kicks off `executeBatch` asynchronously, returns immediately with status "executing"

**Route:**
```
POST /:id/ai-command/:batchId/execute → executeAiCommandBatch
```

**Files:** `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts`, `signalsai-backend/src/routes/admin/websites.ts`
**Verify:** Route registered, `npx tsc --noEmit` passes

### T4: Frontend — Execute button + progress
**Do:** Update `AiCommandTab.tsx`:

- Enable "Execute Changes" button (remove disabled state from Phase B)
- Button shows count: "Execute N Changes" (N = approved count)
- Disabled when 0 approved recommendations
- On click: call `POST execute`, transition to executing state
- **Executing state:**
  - Progress bar: `stats.executed / stats.approved` (polls batch status every 2s)
  - "Executing {n} of {total}..." text
  - Individual recommendation cards update status in real-time (executed → green check, failed → red x)
- **Completed state:**
  - Summary: "N executed, M failed"
  - Failed recommendations shown with error reason
  - "New Analysis" button to start fresh

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`, `signalsai/src/api/websites.ts` (add `executeAiCommandBatch` API function)
**Verify:** Execute flow works end-to-end, progress updates

## Done
- [ ] "Execute Changes" button triggers batch execution
- [ ] Approved recommendations processed sequentially
- [ ] Page sections updated (draft replaced)
- [ ] Layout fields updated (saved directly)
- [ ] Post content updated (saved directly)
- [ ] Stale HTML detection skips changed content
- [ ] Failed recommendations don't crash batch
- [ ] Progress bar shows real execution progress
- [ ] `npx tsc --noEmit` passes
- [ ] Manual: execute a batch with mixed targets, verify all saved correctly
