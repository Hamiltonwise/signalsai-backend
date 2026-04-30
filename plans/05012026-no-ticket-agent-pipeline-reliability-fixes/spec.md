# Agent Pipeline Reliability Fixes

## Why
Three issues are causing failed runs, wasted API spend, and log noise in the monthly agent pipeline: (1) the referral engine output endpoint returns "pending" for ALL locations when ANY location in the org is processing, triggering a 1-second polling storm on unrelated locations; (2) the RE agent truncates output at 32768 tokens for practices with 300+ sources; (3) the Summary agent cites monthly PMS values but dashboard_metrics only has aggregates, causing validation failures and 3 retries that always fail.

## What
Four targeted fixes. When done: Sterling won't show "pending" while Gainesville runs, Falls Church RE won't truncate, and Summary won't retry 3x on the same impossible validation.

## Context

**Relevant files:**
- `src/controllers/agents/AgentsController.ts:1291-1316` — org-scoped pending check in `getLatestReferralEngineOutput`
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:694` — RE `maxTokens: 32768`
- `src/utils/dashboard-metrics/types.ts:115-135` — `PmsMetrics` interface + schema
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts:578-596` — aggregate-only PMS metric computation
- `frontend/src/components/PMS/PMSVisualPillars.tsx:650` — 1-second poll interval

**Patterns to follow:**
- Location-scoped queries already used in `fetchActiveAutomationJobs` (frontend passes `location_id`)
- `pms_jobs` table has `location_id` column

## Constraints

**Must:**
- Pending check must add `location_id` filter when available, fall back to org-only when not
- Poll interval increase from 1s to 5s
- RE maxTokens bump to 65536
- New PMS fields use `_this_month` suffix to match the pattern from the reviews fix

**Must not:**
- Do not change RE prompt or input pipeline
- Do not change Summary prompt (it already knows how to cite `pms.*` paths)
- Do not modify the existing aggregate PMS fields (other consumers may depend on them)

**Out of scope:**
- Capping RE input source count
- WebSocket/SSE replacement for polling
- Summary prompt changes for the new fields (agent will discover them via dashboard_metrics)

## Risk

**Level:** 2

**Risks identified:**
- Increasing RE maxTokens to 65536 may exceed Sonnet 4.6's output ceiling → **Mitigation:** If API rejects, we'll know the ceiling and can adjust. Current 32768 definitely works, so no regression risk.
- Adding `_this_month` fields without updating Summary prompt could mean they go unused initially → **Mitigation:** The agent sees the full dashboard_metrics dictionary and will naturally prefer the matching field. Grounding validator will now accept monthly values.

**Blast radius:**
- `getLatestReferralEngineOutput` — consumed by `PMSVisualPillars.tsx` and `ReferralEngineDashboard.tsx`
- `PmsMetrics` — consumed by dashboard_metrics computation and Summary agent input
- Poll interval — only affects `PMSVisualPillars.tsx`

## Tasks

### T1: Scope pending check by location_id
**Do:** In `AgentsController.ts` line 1292, add `.where("location_id", locationId)` to the `pms_jobs` query when `locationId` is not null. Keep org-only fallback when locationId is absent.
**Files:** `src/controllers/agents/AgentsController.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Increase poll interval from 1s to 5s
**Do:** In `PMSVisualPillars.tsx` line 650, change `setTimeout(pollSequentially, 1000)` to `setTimeout(pollSequentially, 5000)`.
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T3: Bump RE maxTokens to 65536
**Do:** In `service.agent-orchestrator.ts` line 694, change `maxTokens: 32768` to `maxTokens: 65536`.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T4: Add current-month PMS fields to dashboard_metrics
**Do:**
1. In `types.ts`, add to `PmsMetrics` interface and `PmsMetricsSchema`:
   - `production_this_month: number | null`
   - `doctor_referrals_this_month: number | null`
   - `total_referrals_this_month: number | null`
2. In `service.dashboard-metrics.ts` `buildPmsMetrics`, after the aggregate loop, extract the latest month from `aggregated.months` (sorted by month string) and populate the `_this_month` fields from it. Null if no months exist.
**Files:** `src/utils/dashboard-metrics/types.ts`, `src/utils/dashboard-metrics/service.dashboard-metrics.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend + frontend)
- [ ] Manual: run monthly agent for Sterling while Gainesville is NOT processing — confirm no false "pending"
- [ ] Manual: re-run Falls Church RE — confirm output no longer truncates at 32768
- [ ] Manual: re-run Sterling Summary — confirm `pms.doctor_referrals_this_month` exists in dashboard_metrics and Summary can cite monthly values without validation failure
