# Monthly Agents Pipeline Latency Optimization (Tier A)

## Why
A successful PMS-triggered monthly run currently takes ~302s end-to-end. Two of those seconds are wasted on each non-bottleneck phase, but ~62s are pure scheduling overhead — work that could be parallelized but isn't. Specifically, `dashboard_metrics` sits 43.5s after RE finishes despite 5 of its 6 sub-sections being independent of RE output, and the three pre-agent data fetches (GBP, PMS, Rybbit) run strictly sequentially despite being independent. Cleaning up the await graph nets ~40s without changing models, prompts, or output quality. This is the highest-ROI safest optimization layer.

## What
Reorder `processMonthlyAgents` so:
1. The three independent data fetches (GBP, PMS, Rybbit) execute in parallel.
2. The 5 RE-independent `dashboard_metrics` sub-sections (reviews, gbp, ranking, form_submissions, pms) compute concurrently with the RE Claude call. Only the `referral` sub-section finalizes after RE returns, since it consumes RE output.

Target: total runtime drops from ~302s → ~262s (–13%), a hard guarantee with zero behavior or output change.

## Context

**Measured time budget (Job #118 successful run, log lines 2395–2478, 2026-04-28T18:54:05–18:59:09 UTC):**

| Phase | Duration |
|---|---|
| GBP fetch | 19.2s |
| PMS fetch | 0.3s (sequential after GBP) |
| Rybbit fetch | 1.1s (sequential after PMS) |
| RE Claude call | 133.5s |
| dashboard_metrics | 43.5s (sequential after RE) |
| Summary Claude call | 95.4s |
| Tasks + DB writes | 6.6s |
| **Total** | **302.2s** |

**Relevant files:**
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:528-687` — `processMonthlyAgents` await chain. Sequential `await fetchAllServiceData → await aggregatePmsData → await fetchRybbitMonthlyComparison → RE retry loop → await computeDashboardMetrics → Summary retry loop`.
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts:680-820` — `computeDashboardMetrics`. Currently runs all 6 builders sequentially. Only `buildReferralMetrics` (line 602-662) consumes the `reOutput` parameter; `buildReviewsMetrics`, `buildGbpMetrics`, `buildRankingMetrics`, `buildFormSubmissionsMetrics`, `buildPmsMetrics` are RE-independent.
- `src/utils/dataAggregation/dataAggregator.ts` — `fetchAllServiceData` (Google APIs, no caching).
- `src/utils/pms/pmsAggregator.ts` — `aggregatePmsData` (DB query, no caching).
- `src/utils/rybbit/service.rybbit-data.ts` — `fetchRybbitMonthlyComparison`.

**Patterns to follow:**
- `Promise.all([...])` for parallel awaits where outputs are independent.
- Early-await pattern: kick off long work as a promise, do other work, then await the promise where its result is actually needed (only one place).

**Reference file:** `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` for an existing example of parallel data-fetch with `Promise.all` plus per-fetch failure isolation. Match its error-handling shape — one fetch failing shouldn't take down the others if their outputs are independently usable downstream.

## Constraints

**Must:**
- Preserve identical agent inputs vs today. RE must still receive PMS/GBP/Rybbit. Summary must still receive identical `additional_data` shape including the same `dashboard_metrics` dictionary.
- Preserve identical `agent_results` rows (RE input/output, Summary input/output) — debug modal at `/admin/ai-pms-automation` must continue to work without changes.
- Preserve the existing 3-attempt retry loops on RE and Summary (no change to retry semantics).
- Preserve order of `onProgress` callbacks for the FE progress UI — substep names and their sequence must match what `PMSAutomationProgressDropdown` expects.
- Per-fetch failure isolation: if one of GBP/PMS/Rybbit fails, the others should still attempt. A failed fetch surfaces the same error message as today (don't change observability).

**Must not:**
- Touch agent prompts, models, or token-trimming. Tier B (Summary input trim) and Tier C (Haiku for RE) are deferred — see Out of scope.
- Touch `computeDashboardMetrics`'s public signature. Internal restructure only.
- Add caching layers (deferred — separate concern with invalidation complexity).
- Change retry counts or backoff intervals.
- Refactor unrelated code in the orchestrator.

**Out of scope:**
- **Tier B — Summary input trim.** RE output is ~25k tokens of the Summary's 47.9k input; we could strip to action_plan + automation_opportunities. Defer until Tier A is observed in prod and we have a baseline to compare against. New spec then.
- **Tier C — Haiku for RE.** Sonnet 4.6 → Haiku 4.5 on RE alone could save 60–80s but risks structured-extraction quality. Needs eval first. New spec; gated on Tier A landing cleanly.
- **Data-fetch memoization across runs.** Useful only for re-triggers of the same org+date_range; rare in practice. Defer.
- **Streaming output / batching API.** Doesn't reduce per-job latency; orthogonal.

## Risk

**Level:** 1

**Risks identified:**
- **Race condition risk in parallel data fetches.** Both `fetchAllServiceData` (Google API) and `aggregatePmsData` (DB) acquire their own resources independently — no shared mutable state, no DB connection contention beyond the pool. **Mitigation:** verify by reading both functions for any module-scope mutable state (none expected). Promise.all is safe here.
- **`buildReferralMetrics` could be called with stale RE output if compute order changes.** The split must finalize `referral` AFTER RE resolves, not before. **Mitigation:** explicit task structure makes this dependency obvious; verify by checking T2's await graph.
- **`onProgress` callback ordering.** Today the FE sees `data_fetch → referral_engine (running) → dashboard_metrics → summary_agent`. If we kick off dashboard_metrics during RE, the FE sees `dashboard_metrics` flicker concurrent with RE — but the existing FE `PMSAutomationProgressDropdown` only cares about `currentStep` (which stays `monthly_agents`) and the agent badges (which already work fine with the substep churn). **Mitigation:** keep emitting `onProgress("dashboard_metrics", …)` at the same sequence point in user-visible terms, even if compute starts earlier. (Or skip the substep update — see T3 verify.)
- **Per-fetch failure isolation with Promise.all.** Default `Promise.all` rejects on first failure. **Mitigation:** use `Promise.allSettled` and unwrap each result with the same try/catch shape today's sequential code uses, surfacing the same error messages.

**Blast radius:**
- `processMonthlyAgents` is called by `runMonthlyAgents` in `AgentsController.ts` (PMS-triggered + manual triggers).
- `computeDashboardMetrics` is also called by `GET /api/dashboard/metrics` endpoint (`DashboardController.ts:28-89`). T2's internal restructure of `computeDashboardMetrics` must NOT change its return shape — confirmed it doesn't, since we're only reordering when the sub-builders run, not what they produce.

**Pushback:** None at Level 2+. Tier A is mechanically a re-arrangement of awaits with no semantic change.

## Tasks

### T1: Parallelize the three pre-agent data fetches
**Do:** In `processMonthlyAgents` (`service.agent-orchestrator.ts:528-596`), replace the sequential `await fetchAllServiceData(...) → await aggregatePmsData(...) → await fetchRybbitMonthlyComparison(...)` chain with `Promise.allSettled([...])` of all three. Unwrap each result preserving the existing try/catch error messages and logging exactly as the sequential version. The `monthData`, `pmsData`, `websiteAnalyticsMonthly` local variables stay the same shape post-unwrap.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. Manual: trigger a monthly run, log shows the three fetch lines arriving with overlapping timestamps (currently serial). Per-phase timing should drop the ~20.6s data-fetch block to ~19.2s (GBP-bound).

### T2: Split `computeDashboardMetrics` into independent + RE-dependent halves
**Do:** In `src/utils/dashboard-metrics/service.dashboard-metrics.ts`, refactor `computeDashboardMetrics` internals to expose two functions while keeping the public function signature unchanged:
- `computeIndependentMetrics(orgId, locationId, dateRange)` — returns `{ reviews, gbp, ranking, form_submissions, pms }` via `Promise.all` of the existing five builders.
- `computeReferralMetrics(reOutput)` — wraps the existing `buildReferralMetrics`.

The public `computeDashboardMetrics(orgId, locationId, dateRange, reOutput)` becomes a thin composition: `Promise.all([computeIndependentMetrics(...), computeReferralMetrics(reOutput)])` then merges the result. Existing dashboard endpoint (`GET /api/dashboard/metrics`) and orchestrator both keep working unchanged.
**Files:** `src/utils/dashboard-metrics/service.dashboard-metrics.ts`
**Depends on:** none (parallel with T1)
**Verify:** `npx tsc --noEmit` zero errors. Hit `GET /api/dashboard/metrics` for an org in dev, confirm response is byte-identical to pre-change. Confirm `computeDashboardMetrics` exported signature unchanged.

### T3: Run independent dashboard_metrics concurrently with RE Claude call
**Do:** In `processMonthlyAgents`, kick off `computeIndependentMetrics(...)` as a promise BEFORE entering the RE retry loop. After the loop completes successfully (RE output available), `await computeReferralMetrics(reOutput)` and the previously-kicked-off independent-metrics promise. Merge into the final `dashboardMetrics` object in the same shape as today. The `Computing dashboard metrics` log line moves to where the merge happens; the `[MONTHLY] ✓ Dashboard metrics computed` log fires as it does today, just at a different wall-clock moment. Do NOT emit any `onProgress` for `dashboard_metrics` step (which we removed in commit `d5520dc6` anyway — verify the call is still gone).
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T2 (needs the new split functions)
**Verify:** `npx tsc --noEmit` zero errors. Trigger a monthly run, log shows `Computing dashboard metrics (independent)` BEFORE `→ Running Referral Engine via Claude directly`, and the post-RE dashboard step takes <5s instead of ~43s. Total monthly run time should drop ~38s. Open the Pipeline modal for the resulting job and confirm Summary's `agent_input.additional_data.dashboard_metrics` has all 6 sub-sections populated identically to a pre-change run.

### T4: Add timing instrumentation
**Do:** Add a small `console.log("[TIMING]", { phase, duration_ms })` line at each phase boundary in `processMonthlyAgents`: data-fetches, RE-call, dashboard-metrics-merge, Summary-call, task-creation, total. Use `Date.now()` deltas; no perf_hooks or external lib. Output goes to `agent-run.log` alongside existing logging. This makes future Tier B/C decisions evidence-based — we can compare new runs against the 302s baseline easily.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T1, T3 (instrument the new phase boundaries)
**Verify:** Trigger a monthly run, log shows `[TIMING]` lines for each phase summing to roughly the run's total wall time.

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero new warnings
- [ ] Manual end-to-end: trigger a fresh PMS monthly run on Job #118 (or a fresh upload). Confirm:
  - Run completes successfully (Summary v2 attempt 1 passes — same as the 18:54 baseline)
  - Total wall-clock duration < 270s (target: ~262s, allowing ±10s for Claude-call variance)
  - `[TIMING]` lines show data-fetches < 22s (was 20.6s + serial overhead) and dashboard-metrics-merge phase < 6s (was 43.5s)
  - `agent_results.agent_input` for Summary contains identical `dashboard_metrics` structure (all 6 sub-sections populated) compared to a pre-change run from the log
  - `GET /api/dashboard/metrics` endpoint still returns the same shape and values
  - Pipeline modal at `/admin/ai-pms-automation` renders identically for the new run
- [ ] No regressions: existing tasks still get created (5 USER + 6 ALLORO observed in baseline), notification emails still fire
- [ ] Updated CHANGELOG with measured before/after timing
