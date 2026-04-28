# Summary as Sole USER Task Writer + Pipeline Debug Modal

## Why
Two coordination problems share one root cause: (1) Ranking writes its own `USER` tasks via `archiveAndCreateTasks`, parallel to Summary's `top_actions`, so clients can see duplicate / contradictory tasks on `/to-do-list`; (2) admin has no way to debug a monthly run because the agent input that fed Claude is truncated to NULL when >50KB and `dashboard_metrics` / GBP / Rybbit are never persisted. Folding ranking into Summary's input and lifting the truncation fixes both with one coherent change.

## What
- Summary v2 becomes the sole writer of `category: "USER"` tasks. Ranking output flows in as a sibling key in `additional_data.ranking_recommendations`. Existing `agent_type: "RANKING"` tasks get archived.
- Full agent input (the JSON payload sent to Claude for both RE and Summary) is preserved verbatim in `agent_results.agent_input` per run, no size cap.
- Admin can open a "View Pipeline" modal from any PMS job row at `/admin/ai-pms-automation` and see a DAG (PMS → RE → Dashboard Metrics → Summary → Tasks) with raw-JSON drill-down on every node, sourced from the persisted run data.

## Context

**Relevant files:**
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:281` — the 50KB truncation: `agent_input: userMessage.length > 50000 ? null : userMessage`
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:192-222` — `buildSummaryPayload` returns `additional_data` (already includes `dashboard_metrics`, `referral_engine_output`, PMS, GBP via `monthData`)
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts:195` — call to `llmWebhookHandler.archiveAndCreateTasks(...)` (the line to remove)
- `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts:63-155, 160-189` — keep `saveLlmAnalysis`; the task-creation path becomes dead and can be deleted
- `src/agents/monthlyAgents/Summary.md` — INPUTS list (lines 14-25) + grounding rules (lines 42-52)
- `src/models/PracticeRankingModel.ts:61` — `llm_analysis` JSONB column already exists, no schema change
- `src/models/AgentResultModel.ts:14` — `agent_input` already typed `Record<string, unknown> | null` and listed in `jsonFields`; BaseModel handles JSON.parse/stringify, so removing the truncation is a code-only change
- `frontend/src/components/Admin/PMSAutomationCards.tsx` — admin page where the "View Pipeline" button mounts on each row
- `src/controllers/dashboard/DashboardController.ts:28-89` — analog for an admin GET endpoint pattern

**Patterns to follow:**
- Admin GET endpoints: see `DashboardController.ts` for auth + route shape
- Knex data-migration sweeps: see `src/database/migrations/20260428000010_sweep_stuck_pms_approvals.ts` (already in this branch) for archiving rows via migration
- Modal components: existing admin modals in `frontend/src/components/Admin/` and `frontend/src/components/settings/ConfirmModal.tsx` for backdrop/dismiss pattern

**Reference file:** `src/controllers/dashboard/DashboardController.ts` for the read endpoint structure; `frontend/src/components/Admin/PMSAutomationProgressDropdown.tsx` for status/data-fetch + polling patterns inside the admin page.

**Confirmed in context-building (2026-04-28 conversation):**
- Rybbit analytics path is wired but not yet emitting data — leave the `website_analytics` field as-is (will be `null`/`undefined`); no work needed here
- RE → ALLORO tasks are intentionally separate audience; left untouched
- Cadence policy for ranking news between PMS uploads = accept the lag (option a from discussion); no Summary re-trigger on ranking complete
- `pms_job_id` FK on `agent_results` deferred; modal joins by `org+location+date_range` for v1

## Constraints

**Must:**
- Keep `saveLlmAnalysis()` writing `practice_rankings.llm_analysis` (Summary's new input depends on this)
- Persist `agent_input` verbatim — no shape transformation, no field stripping; debugging needs fidelity
- Modal is read-only and admin-only (mount under `/admin/...` route, gate behind admin RBAC)
- Ranking recommendations enter Summary as `additional_data.ranking_recommendations` — sibling key, NOT folded into `dashboard_metrics` (preserves the deterministic-only contract of `dashboard_metrics`)
- Summary prompt change must NOT add `ranking_recommendations` paths to the `supporting_metrics[*].source_field` grounding rule (those values are interpretive, not deterministic) — recommendations flow into `rationale` / `outcome` content only

**Must not:**
- Add new dependencies for the modal (use existing UI primitives in `frontend/src/components/ui/DesignSystem.tsx` + a simple SVG/CSS DAG; no ReactFlow)
- Change `agent_results` column type (already JSON-shaped via `jsonFields`)
- Touch RE → ALLORO task creation (`createTasksFromReferralEngineOutput`)
- Modify `dashboard_metrics` shape or its computation
- Refactor any code outside the listed file paths

**Out of scope:**
- `pms_job_id` FK on `agent_results` (deferred, current join sufficient)
- Multi-location manual-trigger fallback fix in `AgentsController.ts:188-191`
- Re-triggering Summary when ranking completes (cadence option b/c)
- Persisting GBP / Rybbit / dashboard_metrics in their own tables (the full Summary `agent_input` snapshot subsumes these)
- Renaming `service.llm-webhook-handler.ts` (misnamed but unrelated)

## Risk

**Level:** 2

**Risks identified:**
- Lifting 50KB cap → larger `agent_results` rows for big orgs (Postgres TEXT handles 1GB; row size only matters for cold-storage cost). **Mitigation:** monitor `agent_results` table growth post-deploy; if pathological, revisit with compression or external blob storage. Not a v1 blocker.
- Summary prompt change could destabilize task quality (LLM now sees a new input source). **Mitigation:** keep the Summary output schema (`SummaryV2OutputSchema`) unchanged; ranking recs only feed `rationale`/`outcome`/`top_actions` selection, not new fields. Validate by spot-checking 2-3 monthly runs in dev before merge.
- Archiving existing RANKING tasks is a one-way sweep — clients lose any pending ranking-derived tasks at deploy time. **Mitigation:** sweep migration sets `status: "archived"` (not deleted), preserves history; documented in CHANGELOG as expected behavior at deploy.
- Reading `practice_rankings.llm_analysis` in the input-builder adds one DB query per Summary run. **Mitigation:** indexed lookup by `(organization_id, location_id) ORDER BY created_at DESC LIMIT 1` (same pattern `buildRankingMetrics` already uses); negligible cost.

**Blast radius:**
- `service.agent-orchestrator.ts` is called by every monthly-agents-run trigger (PMS finalize + manual). All callers benefit from the truncation fix; none break.
- `service.ranking-llm.ts:195` is called once per ranking run; removing the task-creation call only affects the practice-rankings pipeline.
- `agent_results.agent_input` is read by: (consumers identified at execution time — verify in Pre-Execution Check). Today only the orchestrator writes it; any reader gets the parsed object via `BaseModel.jsonFields`, behavior unchanged.
- `Summary.md` change affects every monthly Summary run going forward.

**Pushback:** None at Level 3+. The cadence-lag tradeoff (option a) was discussed and accepted explicitly during context-building.

## Tasks

### T1: Remove the 50KB `agent_input` truncation
**Do:** In `service.agent-orchestrator.ts:281` and the matching write for the Summary row, change `agent_input: userMessage.length > 50000 ? null : userMessage` to `agent_input: userMessage`. Verify both RE and Summary writes are covered (search the file for the truncation pattern).
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. Manual: trigger a monthly-agents run in dev, confirm `agent_results.agent_input` for both RE and Summary rows contains the full payload (not NULL, not truncated).

### T2: Add `ranking_recommendations` to Summary input
**Do:** Create `src/controllers/agents/feature-services/service.ranking-recommendations.ts` exporting `fetchLatestRankingRecommendations(orgId, locationId)` — query `practice_rankings` (status="completed", scoped by org+optional location, ORDER BY created_at DESC LIMIT 1), return parsed `llm_analysis.top_recommendations || null`. In `service.agent-input-builder.ts:buildSummaryPayload`, accept new param `rankingRecommendations` and spread into `additional_data` as `ranking_recommendations` (only when non-null). In `service.agent-orchestrator.ts` (Summary section, ~line 654-668), call the fetch after `computeDashboardMetrics` and pass into `buildSummaryPayload`.
**Files:** `src/controllers/agents/feature-services/service.ranking-recommendations.ts` (new), `src/controllers/agents/feature-services/service.agent-input-builder.ts`, `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none (parallel with T1)
**Verify:** `npx tsc --noEmit` zero errors. Unit-style check: add a console.log around the orchestrator call site, run a monthly-agents run for an org with a completed practice_rankings row, confirm the recommendations array is in the payload.

### T3: Update Summary prompt for ranking recommendations
**Do:** In `src/agents/monthlyAgents/Summary.md`: (a) add `ranking_recommendations → optional, list of LLM-curated ranking improvement actions for this location` to the INPUTS section (lines 14-25). (b) Add a section instructing Summary to consider `ranking_recommendations` when prioritizing `top_actions[]`, treat them as interpretive (not numeric) signal, surface them via `rationale` / `outcome`, and NOT cite them in `supporting_metrics[*].source_field`. (c) State precedence rule when ranking recs and RE recs overlap on the same theme (e.g., both flag GBP profile): merge into a single `top_action`, prefer the version with the more specific evidence.
**Files:** `src/agents/monthlyAgents/Summary.md`
**Depends on:** T2 (input field name must match)
**Verify:** Manual: read the prompt end-to-end, confirm grounding rule on lines 42-52 still says supporting_metrics must trace to `dashboard_metrics` paths only (untouched). Run one Summary in dev with a populated ranking and inspect `top_actions[]` for ranking-flavored content.

### T4: Stop ranking from creating tasks + archive existing RANKING tasks
**Do:** (a) Delete the call `await llmWebhookHandler.archiveAndCreateTasks(...)` at `service.ranking-llm.ts:195`. Keep the `saveLlmAnalysis` call. (b) Remove now-dead `archiveAndCreateTasks` export from `service.llm-webhook-handler.ts:63-155` (and the unused interface above it). (c) Create knex migration `src/database/migrations/{timestamp}_archive_legacy_ranking_tasks.ts` that runs `UPDATE tasks SET status = 'archived', updated_at = NOW() WHERE agent_type = 'RANKING' AND status IN ('pending', 'in_progress')`. Down migration is a no-op (one-way sweep, documented).
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts`, `src/database/migrations/{timestamp}_archive_legacy_ranking_tasks.ts` (new)
**Depends on:** T2 + T3 (Summary must be ready to receive ranking recs before ranking stops writing tasks; otherwise there's a window where ranking insights are invisible)
**Verify:** `npx tsc --noEmit` zero errors. Run the new migration in dev, confirm RANKING-typed pending tasks become `archived`. Trigger a ranking run, confirm no new rows in `tasks` with `agent_type = 'RANKING'`. Confirm `practice_rankings.llm_analysis` still gets populated.

### T5: Pipeline read endpoint
**Do:** Add `GET /api/admin/pms-jobs/:id/pipeline` route. New controller method `getPipelineForPmsJob(req, res)`: load the `pms_jobs` row, derive `(organization_id, location_id, date_range)` from it (PMS jobs already track which monthly period they're for), fetch matching `agent_results` rows for `agent_type IN ('referral_engine', 'summary')` with `run_id` matching the job's run and ordered by created_at. Return `{ pms_job: {...}, agents: [{ agent_type, run_id, agent_input, agent_output, status, error_message, created_at }] }`. Gate behind admin RBAC middleware.
**Files:** `src/controllers/pms/PmsController.ts` (or a new `PmsPipelineController.ts` if cleaner — match existing controller granularity), `src/routes/` (registration)
**Depends on:** T1 (so endpoint returns full inputs, not NULL'd ones)
**Verify:** `npx tsc --noEmit` zero errors. Manual: hit endpoint with a known job ID, confirm response includes both RE and Summary nodes with their `agent_input` as parsed JSON objects (PMS rollup, dashboard_metrics, etc. visible inside).

### T6: Pipeline modal frontend
**Do:** New component `frontend/src/components/Admin/PMSPipelineModal.tsx`. Props: `jobId: number`, `isOpen: boolean`, `onClose: () => void`. Fetches `/api/admin/pms-jobs/:id/pipeline` on open. Renders: (a) DAG header showing nodes `PMS → Referral Engine → Dashboard Metrics → Summary → Tasks` as styled boxes with arrows (CSS flexbox + connectors, no graph library). (b) Click a node → expand a panel below with that node's `agent_input` and `agent_output` as syntax-highlighted JSON (use existing JSON renderer if one exists; otherwise plain `<pre>`). (c) Tasks node shows the `top_actions[]` list with title + status. (d) Loading and error states. Use design system primitives.
**Files:** `frontend/src/components/Admin/PMSPipelineModal.tsx` (new), `frontend/src/api/pms.ts` (add `fetchPmsPipeline(jobId)`)
**Depends on:** T5
**Verify:** Manual: open `/admin/ai-pms-automation`, click "View Pipeline" on a completed job, confirm modal renders DAG, click each node, confirm raw JSON is readable. Test with a legacy job (pre-T1) — confirm the modal renders and shows "input not captured (legacy run)" placeholder where `agent_input` is NULL.

### T7: "View Pipeline" trigger on PMS job rows
**Do:** In `frontend/src/components/Admin/PMSAutomationCards.tsx`, add a new action button per row (next to existing actions like "View" / "Delete"). On click, set local state to open `PMSPipelineModal` with that row's `jobId`. Show button only for jobs whose status reached `monthly_agents` or `complete` (no pipeline data exists otherwise).
**Files:** `frontend/src/components/Admin/PMSAutomationCards.tsx`
**Depends on:** T6
**Verify:** Manual: button visible on completed/in-progress-past-monthly-agents rows, hidden on early-stage jobs. Click opens modal with correct job ID.

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` (frontend + backend) — zero new warnings
- [ ] All seven tasks completed and individually verified per their `Verify:` lines
- [ ] Manual: end-to-end test in dev — upload a PMS file, run through monthly agents, confirm: (a) `agent_results.agent_input` for both RE and Summary is fully populated (not NULL); (b) Summary's `additional_data.ranking_recommendations` is present when org has a completed ranking; (c) no new `agent_type: "RANKING"` tasks created; (d) "View Pipeline" modal opens and shows full DAG with drill-down JSON
- [ ] Migration runs cleanly: existing pending RANKING tasks become `archived`
- [ ] Spot-check Summary output for two dev orgs — `top_actions[]` reasonably reflects ranking signal when present
- [ ] No regressions: existing `/to-do-list` view still renders, RE → ALLORO tasks still created, dashboard metrics endpoint still returns deterministic data
