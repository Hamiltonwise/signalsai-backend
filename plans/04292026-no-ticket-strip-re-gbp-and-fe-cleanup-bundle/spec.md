# Strip RE GBP Input + FE Cleanup (Disabled Agents + Pill Checkmarks)

## Why
Three small fixes bundled because they share orchestrator/FE files:
1. RE's prompt explicitly states GBP is "enrich if available" and the GROUNDING RULES forbid citing GBP fields, yet RE receives the full `monthData` blob (GBP) which dominates its 34k input tokens on big-org runs. Stripping it should drop RE Claude latency 30-50s with zero quality regression per the prompt's own contract.
2. Opportunity and CRO Optimizer agents are disabled (`if (false)` blocks at orchestrator:718-732) but still render as pills in both AGENT PROGRESS and AUTOMATION COMPLETE — visual noise.
3. RE's pill stays at the clock icon throughout the Summary call instead of getting checked at handoff. The bug: `service.agent-orchestrator.ts:705` passes `agentCompleted: "dashboard_metrics"` to `onProgress`, but `dashboard_metrics` isn't a valid `MonthlyAgentKey`, so the FE silently ignores the marker and never updates RE's pill.

## What
- RE no longer receives `gbp` in its `additional_data` payload. Prompt INPUTS section updated to match.
- Frontend's `MONTHLY_AGENT_CONFIG` drops `opportunity_agent` and `cro_optimizer`. Cascades to AGENT PROGRESS strip automatically (it iterates the config).
- AUTOMATION COMPLETE pill list filters out `opportunity` and `cro_optimizer` from `summary.agentResults`.
- Orchestrator's Summary onProgress call passes `"referral_engine"` as `agentCompleted` so the FE checkmarks RE the moment Summary starts.

## Context

**Relevant files:**
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:642` — `gbpData: monthData,` line in RE payload construction
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:705` — `onProgress("summary_agent", ..., "dashboard_metrics")` — third arg should be `"referral_engine"`
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:259-282` — `buildReferralEnginePayload` accepts `gbpData?: any`, emits as `gbp` field
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md:1, 19, 212` — three references to GBP that need to come out
- `frontend/src/api/pms.ts:30-35` — `MonthlyAgentKey` union type listing all 5 keys
- `frontend/src/api/pms.ts:746-753` — `MONTHLY_AGENT_CONFIG` map
- `frontend/src/components/Admin/PMSAutomationProgressDropdown.tsx:393-421` — AGENT PROGRESS strip iterates `MONTHLY_AGENT_CONFIG` (auto-cleanup)
- `frontend/src/components/Admin/PMSAutomationProgressDropdown.tsx:472-497` — AUTOMATION COMPLETE pills iterate `summary.agentResults` directly (needs filter)

**Reference file:** existing implementation patterns within the same files. No new patterns introduced.

## Constraints

**Must:**
- Preserve `runMonthlyAgent`'s public signature
- Preserve `agent_results.agent_input` shape — Summary still sees `additional_data.gbp` (via `monthData` spread). RE just stops receiving its own GBP copy.
- Backward compatibility for Pipeline modal: agents stored in `agent_results` for legacy runs (with the gbp field) still render correctly.

**Must not:**
- Touch Summary's GBP path (Summary genuinely uses GBP)
- Remove disabled agents from the backend orchestrator (the `if (false)` blocks stay; this is a frontend-visibility fix only)
- Touch Opportunity/CRO type definitions broadly — keep the keys in `AutomationSummary.agentResults` type for back-compat with old `automation_status_detail` rows
- Add prompt rules around GBP that don't exist today

**Out of scope:**
- Trimming Summary's GBP input (separate Tier B candidate)
- Re-enabling Opportunity / CRO Optimizer agents (separate decision)
- Renaming `MonthlyAgentKey` (keep type union for back-compat, just drop config entries)

## Risk

**Level:** 1

**Risks identified:**
- **GBP-stripped RE produces measurably worse output.** Per the prompt's GROUNDING RULES, RE cannot cite GBP fields anyway. Possible subtle regression on duplicate-source dedup if RE was using GBP `profile.address` for city context. **Mitigation:** Pipeline modal lets you compare a pre-strip RE output against a post-strip one for the same org. If dedup quality drops, revert.
- **MonthlyAgentKey type narrowing breaks compilation.** Removing `"opportunity_agent"` and `"cro_optimizer"` from the union could break consumers. **Mitigation:** Keep the union intact (consumers may still reference the string literal for back-compat); only remove from the rendered config map.
- **Old AutomationStatusDetail rows in DB still have agentsCompleted that include opportunity/cro.** FE filter on render handles this gracefully — extra agents in agentsCompleted that don't appear in the config simply don't render.

**Blast radius:**
- Orchestrator: RE call site + Summary progress write. Both contained.
- Input-builder: `buildReferralEnginePayload` only called from one place (orchestrator:636).
- Prompt: only the RE prompt is touched.
- Frontend: two specific render sites in `PMSAutomationProgressDropdown.tsx`. No other components use these pills.

**Pushback:** None at Level 2+.

## Tasks

### T1: Drop GBP from RE payload builder
**Do:** In `service.agent-input-builder.ts`, remove `gbpData?: any` from the `buildReferralEnginePayload` params type and remove the `gbp: params.gbpData ?? null,` field from the returned `additional_data`. Add a code comment noting GBP is intentionally excluded per prompt's grounding rules.
**Files:** `src/controllers/agents/feature-services/service.agent-input-builder.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. Caller (orchestrator:636) will fail to compile if it still passes `gbpData` — fix in T2.

### T2: Drop the GBP arg at the RE call site + fix Summary progress write
**Do:** In `service.agent-orchestrator.ts`, remove `gbpData: monthData,` from the `buildReferralEnginePayload` call (line 642). In the same file, change the Summary `onProgress` call (line 705) third arg from `"dashboard_metrics"` to `"referral_engine"` so the FE marks RE as completed when Summary starts.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` zero errors. Trigger a monthly run. Confirm: (a) RE log line still says `→ Running Referral Engine via Claude directly` and the run completes, (b) RE input token count drops vs. pre-change baseline (visible in the `(N in / N out)` log line), (c) FE pill for Referral Engine flips to checkmark immediately after RE completes.

### T3: Update RE prompt INPUTS section to remove GBP references
**Do:** In `src/agents/monthlyAgents/ReferralEngineAnalysis.md`, remove the three GBP references:
- Line 1-2: "Using PMS monthly rollup data as your primary source, **enriched by GBP and website analytics where available**" → "Using PMS monthly rollup data as your primary source, **enriched by website analytics where available**"
- Line 19: "GBP data → enrich if available" → delete this line
- Line 212-213: "this month's PMS referral data, enriched by GBP and website analytics" → "this month's PMS referral data, enriched by website analytics"

Keep the line in ACTION RULES (line 96-97) about not citing "(GBP)" — defensive even though we no longer pass it.
**Files:** `src/agents/monthlyAgents/ReferralEngineAnalysis.md`
**Depends on:** T2
**Verify:** Manual: read prompt end-to-end; confirm INPUTS lists only PMS + website_analytics. Trigger a run; confirm RE output is structurally identical (matrix shapes, action types) compared to a pre-change reference run via Pipeline modal.

### T4: Drop disabled agents from frontend MONTHLY_AGENT_CONFIG
**Do:** In `frontend/src/api/pms.ts`, remove `opportunity_agent` and `cro_optimizer` entries from `MONTHLY_AGENT_CONFIG`. Keep them in the `MonthlyAgentKey` union type so back-compat reads of old DB rows don't break. AGENT PROGRESS strip in `PMSAutomationProgressDropdown.tsx:393` iterates `Object.entries(MONTHLY_AGENT_CONFIG)` — automatically loses those pills.
**Files:** `frontend/src/api/pms.ts`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit` zero errors. Open `/admin/ai-pms-automation` in dev; expand a recent job's progress; AGENT PROGRESS strip shows only Fetching data + Summary Agent + Referral Engine.

### T5: Filter disabled agents from AUTOMATION COMPLETE pill list
**Do:** In `PMSAutomationProgressDropdown.tsx:474`, wrap the `Object.entries(summary.agentResults)` with a filter that excludes `key === "opportunity"` and `key === "cro_optimizer"`. Render only the surviving entries.
**Files:** `frontend/src/components/Admin/PMSAutomationProgressDropdown.tsx`
**Depends on:** none (parallel with T4)
**Verify:** `cd frontend && npx tsc --noEmit` zero errors. View a completed PMS job's AUTOMATION COMPLETE panel; only `summary #N` and `referral engine #M` pills appear.

## Done
- [ ] `npx tsc --noEmit` clean (backend + frontend)
- [ ] Manual: trigger a monthly run on a known org
  - RE input tokens visibly smaller (compare to pre-change run)
  - Total run time drops noticeably (target: 30-50s saving on big-org case)
  - RE pill flips green ✓ during Summary phase, not after
  - AGENT PROGRESS strip during Summary phase shows only 3 agents (Fetching data, Summary Agent, Referral Engine)
  - AUTOMATION COMPLETE panel shows only `summary` and `referral engine` pills, no `opportunity 0` or `cro optimizer 0`
- [ ] Pipeline modal renders RE's `agent_input` for the new run with no `gbp` field, and `agent_output` is structurally identical to a pre-change baseline (matrix counts, action shapes)
- [ ] No regressions: Summary still passes validator on attempt 1; tasks created (5+ USER, 6+ ALLORO)
- [ ] CHANGELOG entry summarizing the bundle
