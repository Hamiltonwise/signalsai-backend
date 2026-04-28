# Ranking → Summary → Tasks (Retire Ranking's Direct Task Creation)

## Why

Today the practice-ranking pipeline creates its own `agent_type: "RANKING"` tasks via `service.llm-webhook-handler.ts:113–147` immediately after the ranking LLM finishes. Those tasks live in the same `tasks` table as Summary v2's `agent_type: "SUMMARY"` tasks and Referral Engine's `agent_type: "REFERRAL_ENGINE_ANALYSIS"` tasks. The result is multiple voices producing tasks, no shared priority hierarchy, possible duplication of intent ("improve reviews" might appear from both ranking and RE on the same dashboard).

Plan 1 already retired the analogous Referral Engine direct task path — RE's `practice_action_plan` now feeds Summary instead, and Summary is the single voice that emits USER tasks. Ranking is the last remaining direct task producer. This plan unifies Summary as the *only* task author for client-facing actions.

Constraint the user explicitly accepted: Summary fires only inside the monthly agent chain triggered by PMS upload (or manual entry). Therefore ranking insights → tasks conversion only happens *after* a PMS upload. Practices with no PMS data will see rich ranking data (rank number, drivers, recommendations) on the rankings page but no auto-generated to-dos. This is a deliberate trade-off — it makes "tasks" a Summary-only concept and keeps the monthly chain as the single deliberation point.

## What

Three behavior changes:

1. **Stop ranking from creating tasks.** Strip the task-insert loop in `service.llm-webhook-handler.ts:113–147`. Keep the archive sweep (`:83`) so when a fresh ranking lands, the prior RANKING tasks for that location still get archived — old tasks naturally drain as practices re-run rankings.

2. **Pass ranking LLM output into Summary's input.** Extend `dashboardMetrics.ranking` to expose `client_summary`, `drivers[]`, `top_recommendations[]` excerpts, and the Apify `search_position`/`search_query`/`search_position_source`. Update `Summary.md` to instruct: "When a ranking domain action is appropriate, prefer consolidating from `ranking.top_recommendations[*]` over re-deriving from raw factors." Summary already emits `top_actions[*]` with `domain: "ranking"`; this just makes those actions information-rich.

3. **Repoint the rankings-page Visibility Protocol section.** That section currently calls `GET /practice-ranking/tasks` which hard-filters `agent_type: "RANKING"`. After the swap there will be no new RANKING tasks. Read directly from `practice_rankings.llm_analysis.top_recommendations` — the source the tasks were copied from anyway. Bypasses the tasks table for that section entirely.

Done = (a) re-running a ranking via admin no longer inserts rows into `tasks`; (b) PMS-upload-triggered Summary v2 emits `top_actions` with `domain: "ranking"` that reference the ranking's `top_recommendations`; (c) the rankings page Visibility Protocol section renders from `llm_analysis.top_recommendations` directly and looks identical to today.

**Out of scope:**
- Building a *separate* "tasks-from-ranking-only" trigger for practices without PMS. The user explicitly accepted that gap.
- Migrating historical `agent_type: "RANKING"` rows in the `tasks` table. Per-location archive on next ranking run handles cleanup naturally.
- Retiring the `RANKING` value from `AgentType` union. Old rows still display the "Ranking" pill; the union value stays for backward-compat display.
- Admin "Refresh competitors" / "Retry ranking" UX copy update warning that "tasks update on next monthly run". Defer to a follow-up `-q` if the team flags confusion.
- LocalRankingCard v2 redesign on the Focus dashboard. Already in `BACKLOG.md`.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts:57–148` — owns the archive + task-insert loop. The insert loop (lines 113–147) gets removed; the archive sweep (lines 82–96) stays.
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts:295–399` — `getRankingMetrics()` selects `rank_position`, `rank_score`, `total_competitors`, `ranking_factors`. Extend the SELECT to also pull `llm_analysis`, `search_position`, `search_position_source`, `search_query`, and shape the new fields into the returned `ranking` block.
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:192–222` — `buildSummaryPayload` already takes `dashboardMetrics` and forwards it; no shape change needed here, the new fields propagate automatically.
- `src/agents/monthlyAgents/Summary.md:1–150` — the prompt. Needs (a) an explicit section on consolidating from `ranking.top_recommendations` rather than re-deriving, (b) updated `source_field` paths to reflect the new `dashboardMetrics.ranking` shape.
- `src/controllers/practice-ranking/PracticeRankingController.ts:1211–1295` — `GET /practice-ranking/tasks`. Once Visibility Protocol stops calling it, this endpoint may be unused; verify and decide whether to delete or leave deprecated.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — the Visibility Protocol section (search for "VisibilityProtocol" component or "rankingTasks[selectedRanking.id]"). Switch to reading `selectedRanking.llmAnalysis.top_recommendations` directly. The shape is `{ priority, title, description, expected_outcome, impact, effort, timeline }` — adapt the section's renderer to consume that.
- `frontend/src/types/tasks.ts:10–16` — leave `AgentType` union untouched.

**Patterns to follow:**
- The deterministic input-shaping pattern in `service.dashboard-metrics.ts` (parse JSONB defensively, fallback to null on missing fields).
- The Summary.md prompt structure: domain-keyed top_actions with source_field grounding (already established in the prompt).
- Plan 1's archive-on-next-run drain pattern for old tasks (RE's `practice_action_plan` was retired the same way — see `service.task-creator.ts:202+` comment).

**Reference file:** `plans/[Plan 1 folder]/spec.md` — the closest analog. Same architectural shift (retire-direct-creation, feed-Summary-instead) for a sibling agent.

## Constraints

**Must:**
- Preserve the Visibility Protocol section's *visible behavior* on the rankings page. Users should not notice the section's data source changed.
- Preserve the per-location archive sweep so re-runs cleanly retire prior recommendations.
- Keep `agent_type` strings as-is in DB. No enum migration. Old rows with `RANKING` continue to display the "Ranking" pill.
- Summary's payload addition (~3–5KB of LLM-excerpt strings + Apify position fields) must not include raw `ranking_factors` JSON or full `search_results` array. Just `client_summary` (string), `drivers` (top 5 max, each ~200 chars), `top_recommendations` (top 3 max, each ~300 chars), `search_position` + `search_query` + `search_position_source`.

**Must not:**
- Trigger the ranking pipeline from inside the monthly orchestrator. Ranking stays on its own scheduler/trigger; Summary just consumes whatever the latest persisted ranking row says.
- Block Summary v2 if no completed ranking row exists. The new fields all go null/undefined and Summary's prompt skips the ranking domain gracefully (it already handles missing optional inputs).
- Touch `rank_score` math, `ranking_factors` schema, or any LLM prompt other than `Summary.md`.
- Modify the v2 curated competitor flow.

**Out of scope:**
- Same as listed in `## What`.

## Risk

**Level:** 2 (Concern)

**Risks identified:**

- **Visibility Protocol section consumers.** Currently rendered from `agent_type: "RANKING"` tasks fetched via `GET /practice-ranking/tasks`. Switching to read `llm_analysis.top_recommendations` directly is a frontend refactor of one section. → **Mitigation:** the LLM output shape (`{priority, title, description, expected_outcome, impact, effort, timeline}`) is already richer than the task row's metadata. Map fields 1-to-1 in the renderer; no UX change needed.

- **Summary payload bloat.** Adding LLM excerpts grows the Summary call's input by ~3–5KB. With prompt caching this is amortized. → **Mitigation:** strict caps (5 drivers max, 3 top_recommendations max, no raw factor JSON, no full search_results).

- **Old RANKING tasks lingering in DB.** Practices that haven't re-run a ranking since deploy will still have stale RANKING rows in `tasks`. → **Mitigation:** the archive sweep at `service.llm-webhook-handler.ts:83` handles them on the next ranking run. No proactive migration needed. Worst case: a stale row sits for one cycle.

- **`GET /practice-ranking/tasks` endpoint may be orphaned post-swap.** → **Mitigation:** verify in T3 whether anything else still calls it. If not, mark deprecated with a comment block and delete in a follow-up sweep. If yes, leave intact.

**Blast radius:** Frontend filter sites that mention `"RANKING"` (5 places: TasksView, TaskDetailsModal, ActionItemsHub, OrgTasksTab, types/tasks). All consumers display the value as-is — none branch on it. Backend writes only happen at the one webhook handler being modified. Reads happen at `/practice-ranking/tasks` (being repointed/deprecated). Full-text grep confirms no other controller filters or branches on `agent_type === "RANKING"`.

**Pushback (rejected alternatives):**

- **Keep ranking-side task creation but also feed Summary** — rejected. Two task sources = duplicates and conflicting priority orderings. The whole point of the swap is to centralize task authorship.
- **Move ranking into the monthly orchestrator chain** — rejected. Forces a 5–10 min ranking run on every PMS upload; rate-limit and perf risk on Apify; ranking has its own scheduler for a reason.
- **Pre-emptively archive all `agent_type: "RANKING"` rows at deploy time** — rejected. Per-location archive sweep already exists and runs on next ranking refresh; using a one-time migration adds risk for negligible UX win.
- **Retire `RANKING` from the `AgentType` union** — rejected. Old DB rows still surface in admin views; keeping the union value preserves backward-compat display without forcing a data migration.

## Tasks

### T1: Extend `dashboardMetrics.ranking` to expose ranking LLM excerpts + Apify position
**Do:** In `src/utils/dashboard-metrics/service.dashboard-metrics.ts:295–399` (`getRankingMetrics`), extend the SELECT clause to include `llm_analysis`, `search_position`, `search_position_source`, `search_query`. Parse `llm_analysis` defensively (jsonb may be string or object). Add to the returned `ranking` block:
```
ranking: {
  position, total_competitors, score, lowest_factor, highest_factor, score_gap_to_top,
  // NEW (T1):
  search_position: number | null,
  search_position_source: "apify_maps" | "places_text" | null,
  search_query: string | null,
  client_summary: string | null,
  drivers: Array<{ factor, weight, direction, insight }>  // capped to 5
  top_recommendations: Array<{ priority, title, description, expected_outcome, impact, effort, timeline }>  // capped to 3
}
```
Cap `drivers` to top 5 and `top_recommendations` to top 3 inside the service to control payload size before it reaches Summary.
**Files:** `src/utils/dashboard-metrics/service.dashboard-metrics.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` clean. Quick sanity: query a known org and assert the new fields are present + types are correct.

### T2: Update Summary v2 prompt to consolidate from ranking's top_recommendations
**Do:** Edit `src/agents/monthlyAgents/Summary.md`. Add a section under "Inputs" explicitly listing the new `ranking.search_position`, `ranking.client_summary`, `ranking.drivers`, `ranking.top_recommendations`. In the "Top Actions Generation" guidance, add: "When emitting a top_action with `domain: 'ranking'`, prefer consolidating from `ranking.top_recommendations[*]` (already pre-prioritized by the ranking LLM) over re-deriving from raw factors. Treat them as candidate actions; cross-reference with RE's `alloro_automation_opportunities` to dedupe overlapping intent (e.g. don't emit two 'improve review velocity' actions if both signals surface it)." Update existing example `source_field` paths to use the new shape (`ranking.search_position`, `ranking.top_recommendations[0].title`, etc.).
**Files:** `src/agents/monthlyAgents/Summary.md`
**Depends on:** T1
**Verify:** Manual: re-read the prompt for internal consistency. The next monthly run on a test org should produce ≥1 ranking-domain top_action whose `proofline.source_field` references one of the new ranking paths.

### T3: Strip task creation from ranking LLM webhook handler
**Do:** In `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts`, delete the task-insert loop (lines 113–147 plus the surrounding `if (topRecommendations.length > 0)` and the `try/catch` they live inside). Keep the archive sweep (lines 82–96). Update the function's leading docstring to reflect the new behavior: "Archives previous ranking tasks on each new run; task creation now flows through Summary v2's `top_actions`." Audit other callers of the affected helpers — none should remain.
**Files:** `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts`
**Depends on:** T1 (so Summary can pick up the slack on the next monthly run)
**Verify:** `npx tsc --noEmit` clean. Trigger a ranking run on a test org; confirm zero new rows are inserted into `tasks` with `agent_type: "RANKING"`. Confirm prior RANKING rows for that location got archived.

### T4: ✅ DONE OUT-OF-BAND — Visibility Protocol removed entirely from rankings page
**Status:** Shipped via quickfix on 2026-04-28 (commit will be the same one as this plan's commit, or a sibling). User decided to remove the section instead of repointing it — tasks now only live on /to-do-list, fed by Summary v2.
**What actually shipped:** Deleted the `<VisibilityProtocol />` render call, the entire `VisibilityProtocol` component (~150 lines), the `RankingTask` interface, the `rankingTasks` state, the `fetchRankingTasks` call, the `useEffect` that triggered it, the `tasks` prop on `PerformanceDashboard`, and the now-unused `Rocket` / `ExternalLink` icon imports from `frontend/src/components/dashboard/RankingsDashboard.tsx`.
**Why this is better than the original T4:** The user's reasoning — "tasks live in the actual tasks page" — means the rankings page shouldn't surface tasks at all. `HoldingYouBackSection` already shows the top-3 LLM recommendations as an information teaser (without the "approval / View in Tasks" framing), which fully covers the prior intent of Visibility Protocol. Repointing would have been wasted work.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`

### T5: Audit and deprecate `GET /practice-ranking/tasks`
**Do:** Grep for callers of `/practice-ranking/tasks` across `frontend/src` and any stray scripts. After T4, if the endpoint has zero remaining callers, add a `@deprecated` JSDoc block to the controller method `getRankingTasks` (`PracticeRankingController.ts:1211`) noting the swap, and add a server-side `console.warn` if it's hit so we can confirm in production logs that nothing's calling it. Do **not** delete the route in this plan — keep it one cycle to validate.
**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/routes/practiceRanking.ts`
**Depends on:** T4
**Verify:** Grep returns zero callers after T4 ships. After one monthly cycle in production, server logs show no warnings → safe to delete the route in a follow-up `-q`.

### T6: Smoke run end-to-end
**Do:** On a test org with PMS uploaded and a recent completed ranking row:
1. Trigger a fresh ranking via admin → confirm zero new tasks inserted with `agent_type: "RANKING"`; confirm prior RANKING tasks for that location got archived.
2. Trigger a fresh PMS upload (or manual entry) → confirm Summary v2 runs and emits `top_actions[*]` with `domain: "ranking"` whose `rationale` or `prooflines` reference the ranking's `top_recommendations[*]`.
3. Load /rankings → Visibility Protocol section renders from `llm_analysis.top_recommendations` and looks identical to pre-deploy.
4. Load /to-do-list → ranking-flavored actions appear under `agent_type: "SUMMARY"` with the "Summary" pill (not "Ranking"). Old "Ranking"-pilled rows from prior runs may still exist alongside them and is acceptable.
**Files:** none (manual)
**Depends on:** T2, T3, T4, T5
**Verify:** Manual checklist above.

## Revision Log

### Rev 1 — 2026-04-28
**Change:** T4 was originally "Repoint Visibility Protocol section to read from llm_analysis directly". User decided mid-execution that the section should be **removed entirely** instead of repointed — tasks live on /to-do-list, the rankings page should not surface tasks at all. `HoldingYouBackSection` already covers the "things to fix" information need without the task-table framing.
**Reason:** User feedback during the execute phase: "we don't need it as the tasks will live in the actual tasks page".
**Updated Done criteria:** The "Visibility Protocol section renders from `llm_analysis.top_recommendations`" check is replaced with "Visibility Protocol section is removed; `HoldingYouBackSection` remains as the LLM teaser; rankings page has no task-table affordance."

## Done
- [ ] `npx tsc --noEmit` zero errors (backend)
- [ ] `npx tsc -b` + `npm run build` zero errors (frontend)
- [ ] Ranking trigger inserts zero new `agent_type: "RANKING"` task rows
- [ ] Per-location archive sweep on ranking re-run still works (prior RANKING tasks archived)
- [ ] Summary v2 payload includes `ranking.client_summary`, `ranking.drivers` (≤5), `ranking.top_recommendations` (≤3), `ranking.search_position`, `ranking.search_position_source`
- [ ] Summary v2 prompt explicitly consolidates from `ranking.top_recommendations` rather than re-deriving
- [x] Visibility Protocol section on /rankings is removed (Rev 1 — replaced earlier "renders from `llm_analysis.top_recommendations`" criterion). `HoldingYouBackSection` remains as the LLM teaser.
- [ ] `GET /practice-ranking/tasks` is `@deprecated` and emits a warn log on hit, with grep showing zero remaining callers
- [ ] One monthly Summary run on a test org produces a ranking-domain top_action whose proofline's `source_field` references one of the new `ranking.*` paths
