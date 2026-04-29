# Pre-Compute RE Matrix: Deterministic Trends + Dedup, Strip Raw Sources

## Why
RE's input scales linearly with PMS data volume because `monthly_rollup[*].sources` passes every source × every month as raw objects to Claude. Claude then does arithmetic (GROUP BY, compare month-over-month, rank) and fuzzy string matching (dedup) — both of which are deterministic work that JS can do in milliseconds. The aggregator (`pmsAggregator.ts`) already computes the all-time ranked matrix (`sources_summary`) but doesn't compute per-source trends or flag duplicates. Adding those two deterministic steps and stripping the raw source arrays makes RE's Claude input O(1) regardless of CSV size.

**Honest savings estimate:**
- Small org (1 month × 40 sources): ~200 tokens saved → ~5s. Minimal.
- Medium org (6 months × 60 sources): ~3,600 tokens saved → ~15-20s.
- Large org (12 months × 100+ sources): ~10,000+ tokens saved → ~30-50s.

The value compounds with growth: today's practices have 1-2 months of PMS data; in 6 months they'll have 6-12 months. Building O(1) now prevents a latency cliff later.

Secondary win: deterministic trend computation is more reliable than LLM arithmetic. Claude occasionally miscounts or invents trends; JS doesn't.

## What
1. Extend `pmsAggregator.ts` to compute per-source trend labels (increasing/decreasing/new/dormant/stable) and flag duplicate-name candidates.
2. Shape a leaner RE-specific PMS payload in the orchestrator: `sources_summary` + `source_trends` + `dedup_candidates` + month-level totals. Strip `monthly_rollup[*].sources` from RE's input.
3. Update RE prompt INPUTS to consume the new shape and remove the PRE-PROCESSING dedup section (now handled upstream).
4. Summary's pmsData is unaffected — Summary gets its source context from `referral_engine_output` (the computed matrix), not from raw PMS sources.

## Context

**Relevant files:**
- `src/utils/pms/pmsAggregator.ts:240-320` — `sourceMap` aggregation loop already iterates per-month per-source. Trend computation hooks in here naturally. Returns `AggregatedPmsData` type.
- `src/utils/pms/pmsAggregator.ts:22-38` — `AggregatedMonthData` and `AggregatedSourceData` types. `AggregatedMonthData.sources: RawPmsSource[]` is the field to strip from RE's view.
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:549-567` — orchestrator shapes `pmsData` from `aggregated`. Currently passes `month.sources` through.
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:259-282` — `buildReferralEnginePayload` passes `pmsData` as-is. Needs a leaner shape for RE.
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md:14-19` — INPUTS section lists PMS fields. Lines 26-46: PRE-PROCESSING dedup section that becomes upstream.
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md:47-68` — WHAT YOU CAN DERIVE + TREND RULES. Most of these become deterministic outputs, not LLM work.

**Patterns to follow:**
- The aggregator's existing `sourceMap` loop (line 250-271) for per-source iteration — trend computation goes inside this loop or in a second pass after it.
- `sources_summary` shape (rank, name, referrals, production, percentage) — extend with trend_label and delta fields rather than creating a parallel structure.

**Reference file:** `src/utils/pms/pmsAggregator.ts` — the aggregator IS the reference. We're extending it, not replacing it.

## Constraints

**Must:**
- `AggregatedPmsData` public type stays backward-compatible (Summary, dashboard-metrics, and the dashboard API all consume it). Add new fields; don't remove existing ones from the type.
- RE's output schema stays identical — `doctor_referral_matrix`, `non_doctor_referral_matrix`, `practice_action_plan`, etc. are unchanged. Only the INPUT changes.
- `sources_summary` shape stays the same (downstream consumers depend on it). Trend data is a new sibling field, not a modification of `sources_summary`.
- Summary's pmsData continues to include `monthly_rollup` with full shape (Summary may use it for narrative context). Only RE's view is stripped.
- Data quality flags from the aggregator continue flowing through unchanged.
- Single-month rule still applies: when only 1 month, all trends are "new" and no deltas are computed.

**Must not:**
- Remove `monthly_rollup[*].sources` from the `AggregatedPmsData` type (other consumers may need it).
- Change the RE output schema (Zod validation stays the same).
- Add external dependencies for fuzzy matching (use Levenshtein or simple heuristics inline).
- Mix this work with Tier A parallelization (separate spec, separate concern).

**Out of scope:**
- Tier A parallelization (separate spec at `plans/04292026-no-ticket-monthly-agents-latency-optimization/`)
- Trimming Summary's input (separate Tier B concern)
- Changing the RE output schema
- Patient-record-level analysis (not available in current data)

## Risk

**Level:** 2

**Risks identified:**
- **RE output quality changes because it sees less data.** Today RE sees raw source arrays and derives trends; after this change it sees pre-computed trends. If the deterministic computation disagrees with what Claude would have computed, the output differs. **Mitigation:** The trend rules in the RE prompt are explicit and deterministic ("If a source appeared this month but not prior → new; if referrals dropped → decreasing"). JS implements the same rules. Compare RE output via Pipeline modal for 2-3 orgs before and after.
- **Dedup quality drops without Claude.** RE's prompt has nuanced dedup rules ("Same first word + same city/location context" etc.). Simple string distance may miss subtle cases. **Mitigation:** Conservative approach — only flag obvious duplicates (Levenshtein ≤ 2 on normalized names, or identical first word + similar length). Let Claude still decide on flagged candidates. We're moving the DETECTION to JS but keeping the DECISION with Claude.
- **Summary loses narrative context.** Summary receives `pmsData` which currently includes per-month sources. Stripping sources from RE's view is fine, but if we strip from `pmsData` globally, Summary loses it too. **Mitigation:** Don't strip from `AggregatedPmsData` — only shape a leaner payload for RE specifically. Summary keeps full pmsData.

**Blast radius:**
- `pmsAggregator.ts` is consumed by: orchestrator (for RE + Summary input), dashboard-metrics service, PMS key-data endpoint. Adding fields is additive; no breakage.
- `buildReferralEnginePayload` only called from orchestrator:636. Contained.
- RE prompt change doesn't affect Summary prompt.

**Pushback:** None at Level 3+. This is mechanically sound — moving arithmetic from LLM to JS with identical rules. The dedup concern is real but mitigated by keeping Claude in the decision loop for ambiguous cases.

## Tasks

### T1: Add per-source trend computation to the aggregator
**Do:** After the existing `sourceMap` aggregation loop in `pmsAggregator.ts`, add a second pass that computes per-source trend data by comparing the last two months:
- For each source in `sources_summary`, look up its referral count in the latest month and the prior month (from `monthMap`).
- Assign `trend_label`: `"new"` (only in latest month), `"dormant"` (in prior but not latest), `"increasing"` (latest > prior), `"decreasing"` (latest < prior), `"stable"` (equal).
- Compute `referrals_current`, `referrals_prior`, `referrals_delta`.
- When only 1 month exists, all sources get `trend_label: "new"` and no delta (matches SINGLE-MONTH RULE).
- Export the result as a new `sourceTrends` field on `AggregatedPmsData` (type: `SourceTrendData[]`).
**Files:** `src/utils/pms/pmsAggregator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. Unit-style check: log `aggregated.sourceTrends` for org-36 (single month — all should be "new") and for an org with multi-month data if available.

### T2: Add duplicate-name candidate detection to the aggregator
**Do:** After computing `sources_summary`, run a simple dedup scan:
- Normalize each source name (lowercase, strip "dr." / "dr " prefix, strip punctuation).
- Compare all pairs. Flag as candidates when: Levenshtein distance ≤ 3 on normalized names, OR identical first word + both names ≥ 3 words.
- Export as `dedupCandidates` field on `AggregatedPmsData`: `Array<{ name_a: string; name_b: string; reason: string }>`.
- Keep the list conservative — better to miss a subtle duplicate than to false-flag.
**Files:** `src/utils/pms/pmsAggregator.ts`
**Depends on:** T1 (uses the same source list)
**Verify:** `npx tsc --noEmit` zero errors. Log `aggregated.dedupCandidates` for org-36 and check against known duplicates in their data.

### T3: Shape leaner RE-specific PMS payload in orchestrator + input-builder
**Do:** In `service.agent-orchestrator.ts`, build a second `pmsData` shape for RE that includes:
```
{
  monthly_totals: months.map(m => ({
    month: m.month,
    self_referrals: m.selfReferrals,
    doctor_referrals: m.doctorReferrals,
    total_referrals: m.totalReferrals,
    production_total: m.productionTotal,
    // NO sources[] array
  })),
  sources_summary: aggregated.sources,
  source_trends: aggregated.sourceTrends,
  dedup_candidates: aggregated.dedupCandidates,
  totals: aggregated.totals,
  data_quality_flags: aggregated.dataQualityFlags,
}
```
Pass this to `buildReferralEnginePayload` instead of the full `pmsData`. Summary continues to receive the full `pmsData` (unchanged).

Update `buildReferralEnginePayload` param type to accept the new shape (or type it loosely as `any` since we're already using `any` there).
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`, `src/controllers/agents/feature-services/service.agent-input-builder.ts`
**Depends on:** T1, T2 (needs the new aggregator fields)
**Verify:** `npx tsc --noEmit` zero errors. Trigger a monthly run, open Pipeline modal, confirm RE's `agent_input.additional_data.pms` has `source_trends` and `dedup_candidates` but NO `sources[]` arrays inside `monthly_totals`. Confirm Summary's `agent_input.additional_data.pms` still has the full shape with `monthly_rollup[*].sources`.

### T4: Update RE prompt to consume pre-computed trends and dedup candidates
**Do:** In `ReferralEngineAnalysis.md`:
- INPUTS section: replace `monthly_rollup → sources[]` description with `source_trends` (trend_label, referrals_current, referrals_prior, referrals_delta per source) and `dedup_candidates` (pairs flagged upstream).
- Remove or simplify the PRE-PROCESSING dedup section — dedup detection is now upstream. RE still DECIDES on flagged candidates (merge or not), but doesn't scan for them. Rewrite to: "Review dedup_candidates. For each pair, decide: merge (sum referrals/production, note original names) or keep separate (add to data_quality_flags). Do not scan for additional duplicates beyond what's flagged."
- WHAT YOU CAN DERIVE section: note that trend_label and deltas are pre-computed; RE should USE them, not re-derive them. Remove the manual trend computation instructions.
- TREND RULES: simplify to "Use the pre-computed trend_label from source_trends. Do not override or re-derive."
**Files:** `src/agents/monthlyAgents/ReferralEngineAnalysis.md`
**Depends on:** T3 (input shape must match)
**Verify:** Manual: read prompt end-to-end; confirm INPUTS matches the new payload shape from T3. Trigger a monthly run, confirm RE output is structurally identical to a pre-change baseline (same matrix shapes, same action types) via Pipeline modal.

## Done
- [ ] `npx tsc --noEmit` clean (backend + frontend)
- [ ] Manual end-to-end: trigger a monthly run for org-36 (single month). Confirm:
  - RE input has `source_trends` (all "new"), `dedup_candidates`, and `monthly_totals` WITHOUT `sources[]`
  - RE output matrix is structurally identical to pre-change baseline
  - Summary input still has full `monthly_rollup[*].sources`
  - Summary passes validator attempt 1; tasks created
  - Pipeline modal renders both RE and Summary inputs correctly
- [ ] Token comparison: RE input tokens should drop vs pre-change baseline (modest for 1-month org, proportionally more for multi-month)
- [ ] If a multi-month org is available: run for that org too and verify trend labels are correct (compare against what Claude would have assigned)
- [ ] No regressions: `GET /api/dashboard/metrics` still returns same shape; `sources_summary` unchanged in shape
- [ ] CHANGELOG entry with measured before/after token counts
