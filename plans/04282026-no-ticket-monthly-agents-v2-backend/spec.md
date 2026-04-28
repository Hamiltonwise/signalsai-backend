---
id: spec-monthly-agents-v2-backend
created: 2026-04-28
ticket: no-ticket
mode: --start
status: planning
---

# Monthly Agents v2 — Backend (Summary as Chief-of-Staff)

## Why
The current monthly agent chain (`Summary → Opportunity → CRO Optimizer`, with `Referral Engine` running independently) has uneven rigor and creates duplicate task writes. The Tier-1 audit landed accuracy fixes in Referral Engine, but Summary, Opportunity, and CRO remained at the legacy baseline (no Zod, no corrective retry, no anti-hallucination rules, no prompt cache). The forthcoming dashboard redesign (Plan 2, separate `-s`) requires a fundamentally different output shape from Summary — a single curated `top_actions: TopAction[]` array (3-5 items) ordered by `priority_score`, where `top_actions[0]` becomes the hero card and the rest fill the action queue. Opportunity and CRO no longer carry their weight: their outputs are uneven, weakly grounded, and create overlap with Summary's claims and RE's task writes. Disabling them and routing all task creation through Summary as a Chief-of-Staff that consumes specialist agent output (RE, future ranking-analyzer, future website-analyzer) yields one coherent action list per month, no cross-agent duplication, and a single point of grounding rigor.

## What
A backend rearchitecture that:

1. Hard-comments Opportunity + CRO Optimizer agents from the orchestrator (preserving their code, prompt files, and task-creator branches for potential revival).
2. Reorders the monthly chain: `RE → dashboard-metrics → Summary` (was: `Summary → Opp → CRO`, with RE separate).
3. Introduces `service.dashboard-metrics.ts` — a deterministic metrics-dictionary builder that runs after RE, before Summary. Computes review/GBP/ranking/form-submission/PMS/referral metrics from raw data + RE output. Summary picks 3 dictionary keys per `supporting_metrics` slot — never invents values.
4. Replaces Summary's prompt with a Chief-of-Staff role that picks 3-5 monthly actions across all six domains (`review`, `gbp`, `ranking`, `form-submission`, `pms-data-quality`, `referral`).
5. Adds `SummaryV2OutputSchema` (Zod, strict top-level) with corrective retry + prompt cache, mirroring the RE Tier-1 plumbing.
6. Routes Summary's `top_actions[*]` into the `tasks` table via `service.task-creator.ts`, with full metadata payload (rationale, highlights, supporting_metrics, outcome, cta, priority_score) on each row.
7. Removes RE's USER-task writes (`practice_action_plan`) — those items become input to Summary, not direct tasks. RE's ALLORO-task writes (`alloro_automation_opportunities`) stay (agency-internal).
8. Adds two new endpoints needed by Plan 2 (frontend), built now to keep the backend cohesive: `GET /api/user/website/form-submissions/timeseries` and `GET /api/practice-ranking/history`.
9. Adds a Proofline `highlights[]` field for the dashboard's trajectory section to mirror Summary's highlight pattern.
10. Exposes `service.dashboard-metrics.ts` via a thin endpoint `GET /api/dashboard/metrics` for frontend access.

**Done when:**
- Orchestrator runs `RE → dashboard-metrics → Summary` for the monthly cadence; Opportunity and CRO are not invoked.
- Summary v2 produces a Zod-valid `top_actions: TopAction[]` (length 3-5, ordered by `priority_score` desc) covering at least 2 different `domain` values typical-case.
- Each `TopAction` carries: `title · urgency · priority_score · domain · rationale · highlights[] · supporting_metrics[3] · outcome.{deliverables, mechanism} · cta · due_at?`.
- `supporting_metrics[*].source_field` references a real key in the dashboard-metrics dictionary; mismatched references fail Zod and trigger corrective retry.
- `tasks` table receives 3-5 SUMMARY-authored USER rows + 0-N REFERRAL_ENGINE_ANALYSIS-authored ALLORO rows per monthly run. No SUMMARY-authored ALLORO rows. No REFERRAL_ENGINE_ANALYSIS-authored USER rows.
- Proofline output includes a `highlights: string[]` field (max 2, must be substrings of `trajectory`).
- Two new endpoints return shapes the frontend can consume: `[{ month, verified, unread, flagged }]` and `[{ observedAt, rankScore, rankPosition, factorScores }]`.
- TypeScript check passes (backend `npx tsc --noEmit` zero new errors).
- Smoke run on a test org confirms all the above end-to-end.

## Context

**Files modified or read:**

Orchestrator + agent layer:
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:299-642` — monthly agent dispatch, retry budgets, payload assembly. Reorder + comment-out happen here.
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:192-290` — payload builders (`buildSummaryPayload`, `buildOpportunityPayload`, `buildReferralEnginePayload`, `buildCroOptimizerPayload`). Summary's builder grows; the others stay (unused).
- `src/agents/service.llm-runner.ts:264-382` — Zod corrective retry plumbing (`outputSchema`, `cachedSystemBlocks`). Summary v2 reuses this exactly as RE Tier-1 does.
- `src/controllers/agents/feature-services/service.task-creator.ts:60-305, 197-273, 433-513` — task creation branches. Add SUMMARY branch; remove RE `practice_action_plan` (USER) branch; keep RE `alloro_automation_opportunities` (ALLORO) branch.
- `src/controllers/agents/types/agent-output-schemas.ts:214-295` — Zod schemas. Add `SummaryV2OutputSchema`; the existing `ReferralEngineAgentOutputSchema` stays.
- `src/agents/monthlyAgents/Summary.md` — full rewrite (32 lines → ~120 lines).
- `src/agents/monthlyAgents/Proofline.md` — additive: highlights rule + schema field.
- `src/agents/monthlyAgents/Opportunity.md`, `CRO.md` — untouched (kept on disk, just not invoked).

New backend files:
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts` — metrics dictionary builder. Pure function shape: `computeDashboardMetrics(orgId, locationId, dateRange, reOutput): DashboardMetrics`. Reads raw data (PMS, GBP, ranking, form-submissions) and merges with RE output for referral metrics.
- `src/utils/dashboard-metrics/types.ts` — `DashboardMetrics` interface + Zod (used by Summary's input validator).
- `src/controllers/dashboard/DashboardController.ts` (new) — `GET /api/dashboard/metrics` thin wrapper around the service. New router file `src/routes/dashboard.ts`.

Endpoint additions:
- `src/controllers/user-website/UserWebsiteController.ts` — add `GET /timeseries` handler. Existing controller; minimal additive change.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — add `GET /history` handler. Existing controller; minimal additive change.
- `src/routes/userWebsite.ts`, `src/routes/practiceRanking.ts` — register new endpoints.

**Patterns to follow:**

- **Zod corrective retry pattern:** identical to `ReferralEngineAgentOutputSchema` (`agent-output-schemas.ts:214-295`) and its runner usage (`service.llm-runner.ts:264-382`). Top-level `.strict()`, nested permissive, single corrective retry per outer attempt, falls back to legacy `isValidAgentOutput` if both fail.
- **Prompt-as-markdown:** `src/agents/monthlyAgents/*.md` loaded via `loadPrompt(...)`. Sectioned with INPUTS, RULES, OUTPUT, GROUNDING RULES — STRICT, etc.
- **Prompt cache:** `enableCache: true` flag on the orchestrator call site → `cachedSystemBlocks: []` in the runner → Anthropic 5-min TTL ephemeral cache.
- **Telemetry:** structured `console.log("[summary-v2]", JSON.stringify({...}))` lines on every Summary run — fields: orgId, locationId, n_actions, domains, schema_retries, total_ms.
- **Task metadata pattern:** existing `tasks.metadata` is jsonb. Summary writes the rich payload there; tasks columns (id, title, description, status, agent_type, category, created_at) stay as-is.

**Reference files (closest analogs):**
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md` — Summary v2's prompt structure and grounding rules pattern (GROUNDING RULES — STRICT, SINGLE-MONTH RULE, UPSTREAM DATA QUALITY ACKNOWLEDGEMENT). Summary v2's prompt mirrors this shape with cross-domain rules added.
- `src/controllers/agents/types/agent-output-schemas.ts` (lines 214-295) — `ReferralEngineAgentOutputSchema` is the structural template for `SummaryV2OutputSchema`.
- `src/utils/pms/pmsAggregator.ts` — example of a deterministic metrics aggregator with `data_quality_flags` output. `service.dashboard-metrics.ts` follows the same style (pure function, no LLM, deterministic).
- `src/controllers/pms/PmsController.ts:keyData` handler — pattern for the new `DashboardController.metrics` endpoint.
- `plans/04262026-no-ticket-referral-engine-accuracy-tier1/spec.md` — the prior plan that established the Zod + corrective retry + prompt cache + grounding rules pattern. Summary v2 is the same playbook applied to Summary.

## Constraints

**Must:**
- Use the prior-plan's `outputSchema` retry pattern. No bypassing.
- Keep all existing prompt files on disk. Hard-commenting Opp + CRO means orchestrator doesn't invoke them — files stay so revival is one uncomment away.
- `SummaryV2OutputSchema` is `.strict()` at the top level. Nested objects (cta, outcome) can stay non-strict to tolerate model verbosity.
- Summary's `domain` enum includes `"referral"`. The earlier "Summary excludes referral" rule is dropped — Summary now consumes RE's full output and decides cross-domain.
- Summary's prompt enforces: when surfacing an action originating from a specialist agent (RE), preserve the specialist's wording verbatim in `title` and `rationale` rather than paraphrasing. Cite the source field in `supporting_metrics[*].source_field`.
- Summary's prompt enforces a "Cross-source consolidation" rule: when two specialist signals reference the same entity (source name, doctor, location), merge into a single action that cites both signals.
- `supporting_metrics[*].value` MUST be a string that matches verbatim a value present in the dashboard-metrics dictionary at the path `source_field`. Validator hook in the runner (post-Zod) checks this; mismatch triggers corrective retry.
- `outcome.deliverables` and `outcome.mechanism` are descriptive only. NO numeric magnitude predictions ("+2 positions", "+5 patients"). Prompt enforces this with explicit examples of forbidden patterns. Schema cannot enforce this directly; prompt rule + grounding rule do.
- `highlights[]` entries must be substrings of `rationale`. Validator hook (post-Zod) checks; mismatched entries are silently dropped at validation time and a `[summary-v2]` warning is logged. Frontend further fail-safe drops in render.
- Task-creator writes ONE row per `top_actions[*]` entry. `tasks.agent_type = "SUMMARY"`, `tasks.category = "USER"`. Full TopAction object lives in `tasks.metadata`.
- Task-creator removes the RE `practice_action_plan` → USER tasks branch (lines ~259-275 of `service.task-creator.ts`). The RE `alloro_automation_opportunities` → ALLORO branch stays untouched.
- Dashboard-metrics service is **deterministic** — pure function on raw data. No LLM calls. Pure SQL/aggregation reads.
- Dashboard-metrics service runs AFTER RE in the orchestrator chain (so referral metrics can use RE output).
- Two new endpoints (`form-submissions/timeseries`, `practice-ranking/history`) return arrays sorted oldest-first by month/date.
- Proofline `highlights[]` is additive (optional in schema). Existing Proofline output without highlights remains valid.

**Must not:**
- Change `tasks` table schema. Use existing jsonb metadata column.
- Add new dependencies. Zod, Anthropic SDK, Knex, Express all already present.
- Break the existing RE flow that runs successfully today. RE schema, prompt, and runner stay unchanged. Only the orchestrator's CALL ORDER changes (RE first instead of in parallel/independent), and the task-creator's RE branch loses its USER side.
- Modify the existing `ReferralEngineAgentOutputSchema` or `Proofline` interface aside from adding the additive `highlights[]` field.
- Touch the frontend in this plan. Frontend redesign is Plan 2 (separate `-s`).
- Run dashboard-metrics service inside a Knex migration or background job. Request-scoped only (orchestrator-internal or HTTP-handler-internal).
- Allow Summary to invent `supporting_metrics[*].value` strings. The validator hook is non-negotiable.
- Persist any Opp + CRO output for monthly runs going forward. The agents are hard-commented; their results don't reach `agent_results`.

**Out of scope:**
- Frontend redesign (Plan 2).
- Onboarding wizard highlight fix (Plan 2 — frontend concern).
- Mobile bottom nav adjustments (Plan 2).
- Daily-cadence agents. Only monthly chain is touched.
- Data backfill: existing Summary outputs in `agent_results` (legacy shape) are not re-processed. New shape applies forward only.
- Removal of Opp + CRO prompt files or task-creator branches. Hard-comment only — full removal is a future cleanup once the new pipeline is proven.
- Any change to `practice_rankings` or `pms_jobs` table schemas.
- A UI for managing dashboard-metrics or Summary v2 output. Engineering tools only.
- Multi-month action plans. Each Summary run is a single month's action set.

## Risk

**Level:** 3 (Structural Risk — modifies the critical monthly agent pipeline, changes task-creation source-of-truth, touches an LLM contract that downstream UI depends on)

**Risks identified:**

1. **Summary v2 fails Zod repeatedly → no monthly tasks for an org.** Without task creation, the dashboard is empty. → **Mitigation:** Outer retry budget stays at 3 attempts (existing). Each attempt has 1 corrective Zod retry (existing pattern). On final failure, the legacy fallback path writes a single placeholder task ("Summary agent could not parse this month's data — please contact support") so the dashboard isn't blank. Telemetry alerts on `[summary-v2]` failure-mode lines. `data_quality_flags` populated with the failure reason.

2. **Disabling Opp + CRO loses task volume that some orgs depend on.** Today some orgs see 5-12 tasks/month from Opp + CRO. After v2 disable + Summary v2, expected: 3-5 USER tasks (Summary) + 0-N ALLORO tasks (RE). → **Mitigation:** Acceptable. The Summary v2 task set is curated and prioritized; the dropped Opp + CRO tasks were generally low-quality re-packaging of Summary's claims. Engineering monitors task completion rates for 1 month post-launch. If task-completion drops materially, revisit.

3. **Cross-domain dedup not enforced means Summary surfaces overlapping signals from RE + raw data as separate actions.** E.g., RE says "Cox dropped 60%" and ranking-analyzer (future) says "Cox left 1-star review" — Summary surfaces both as separate actions. → **Mitigation:** Prompt enforces explicit "Cross-source consolidation" rule with worked example. Acceptable risk if it slips through; user can mark duplicates as done. Long-term: post-Summary deterministic dedup pass (not in this plan).

4. **`supporting_metrics[*].value` validator hook is brittle.** If the value-matching is too strict (exact string match), the model returning "$48,420" vs the dictionary's "48420" fails. → **Mitigation:** Validator normalizes both sides with the existing `pmsAggregator.toNumber()` and `formatCurrency` helpers before comparison. Numeric-equivalent passes; string-equivalent passes; obvious hallucination fails. Configurable threshold for fuzziness if needed.

5. **`outcome` magnitude rule is prompt-enforced only — Zod can't catch "+2 positions" in the deliverables string.** → **Mitigation:** Prompt has explicit forbidden examples ("DO NOT write '+2 positions est.', '+5 patients/mo', '$3,200 revenue est.'"). Telemetry runs a regex post-validation to flag deliverables containing `\+\d+|\$\d` patterns; flagged cases logged for review but not auto-rejected (false-positive risk on legitimate dollar amounts already in the input).

6. **Sequential dependency RE → metrics → Summary increases monthly run wall-clock time.** Today RE + Summary run roughly 5-10s each in parallel-ish. New chain is sequential: RE (10s) + metrics (1s) + Summary (10s) = ~21s total. → **Mitigation:** Acceptable for monthly cadence (not user-facing real-time). dashboard-metrics is fast (raw SQL aggregations, no LLM). The orchestrator already handles long sequential chains.

7. **dashboard-metrics service has no schema validation today.** If it returns malformed dictionary, Summary's input has garbage. → **Mitigation:** Define `DashboardMetricsSchema` (Zod) and validate at the service boundary before passing into Summary's payload. Failures throw and abort the monthly run for that org with `data_quality_flags` populated.

8. **Frontend in Plan 2 cannot ship until this lands.** Plan 2 reads from `tasks.metadata` for hero/queue, expects Summary v2 shape. → **Mitigation:** Plan 1 ships and gets smoke-tested first. Plan 2 starts only after Plan 1 verification passes.

**Blast radius:**
- Backend code: ~12 files modified or created (orchestrator, input builder, task-creator, schemas, prompts, dashboard-metrics service + types, dashboard controller + route, 2 endpoint additions).
- Database: zero schema changes. Tasks metadata jsonb column unchanged in shape, content shifts.
- LLM behavior: Summary's role expands; Opp + CRO no longer invoked; RE behavior unchanged but its `practice_action_plan` items stop materializing as USER tasks.
- External dependencies: none.
- Existing approved-jobs admin views, PMS Statistics tab (RE matrices), Patient Journey tab — unchanged. Only the dashboard's main view (Plan 2) and tasks list will look different downstream.

**Pushback:**
- This is the second plan in a row touching the agent pipeline (after PMS column-mapping in 04272026 and RE Tier-1 in 04262026). Cumulative pipeline risk is real. **Strong recommendation:** smoke-test on a staging copy of prod data BEFORE merging. Reset target org's monthly state, run the new chain, manually inspect `tasks` table + `agent_results.response_log` for Summary v2 shape compliance.
- Disabling Opp + CRO is a one-way operational decision. If the user later wants their semantics back, the path is "re-enable in orchestrator + uncomment task-creator branches" — easy mechanically but the prompts have aged. Acceptable.
- The `supporting_metrics[*].value` validator hook is a new concept (existing schemas don't have value-matching post-validation). If it proves too brittle in practice, fall back to weaker schema-only validation and rely on the prompt's grounding rules. Tracked as Rev item if needed.

## Decisions

**D1. Orchestrator order:** `RE → dashboard-metrics → Summary`. Sequential. Opp and CRO hard-commented in the orchestrator (skipped). Daily-cadence agents and other independent monthly agents (Proofline) unchanged.

**D2. Summary v2 owns USER task creation.** Summary's `top_actions[*]` writes 3-5 rows with `category=USER, agent_type=SUMMARY`. Full TopAction object stored in `tasks.metadata`.

**D3. RE keeps ALLORO task writes only.** `alloro_automation_opportunities[*]` continues to write `category=ALLORO, agent_type=REFERRAL_ENGINE_ANALYSIS`. RE's `practice_action_plan` items stop writing tasks — they become input to Summary instead.

**D4. dashboard-metrics service is deterministic + LLM-free.** Pure function on raw data + RE output. Schema-validated boundary.

**D5. Summary v2 prompt mirrors RE Tier-1 structure:** GROUNDING RULES — STRICT, SINGLE-MONTH RULE, UPSTREAM DATA QUALITY ACKNOWLEDGEMENT, plus new sections: PASSTHROUGH RULE (preserve specialist wording), CROSS-SOURCE CONSOLIDATION RULE, OUTCOME RULE — NO MAGNITUDE PREDICTIONS, HIGHLIGHTS RULE.

**D6. `supporting_metrics[*]` post-Zod validator hook checks `value` matches the dictionary at `source_field`.** Numeric normalization via `toNumber()`. Mismatch → corrective retry with diff included in the error message.

**D7. `top_actions[]` is sorted by `priority_score desc` at validation time.** If the model returns out-of-order, validator re-sorts (not a corrective retry trigger).

**D8. Two new endpoints in this plan, not Plan 2.** Backend cohesion. Plan 2 wires the frontend; Plan 1 ships the data.

**D9. Proofline `highlights[]` is additive and optional.** Existing Proofline outputs that don't include it remain valid. Prompt rule for Proofline adds the highlight selection guidance, mirroring Summary's.

**D10. Existing `tasks` table is the single source of truth for hero + queue.** No new table, no separate "actions" entity. Frontend (Plan 2) reads `/api/tasks` and treats the highest-`priority_score` SUMMARY row as the hero. Lower-priority SUMMARY rows + ALLORO RE rows fill the queue.

**D11. Dashboard-metrics endpoint exposed at `/api/dashboard/metrics`.** Cached server-side per (orgId, locationId, dateRange) tuple for the duration of one HTTP request. No persistent cache (raw data is hot enough).

**D12. Failed monthly Summary runs write a placeholder task** with `data_quality_flags` so the dashboard isn't blank. Telemetry alerts on these.

## Output Schema (the contract)

```typescript
// src/controllers/agents/types/agent-output-schemas.ts (additive)

export const SupportingMetricSchema = z.object({
  label: z.string().min(1).max(40),       // "Current rank"
  value: z.string().min(1),                // "#4 of 28"
  sub: z.string().optional(),              // "of 28 competitors"
  source_field: z.string().min(1),         // "ranking.position" — must exist in dashboard-metrics
});

export const TopActionSchema = z.object({
  title: z.string().min(1).max(160),
  urgency: z.enum(["high", "medium", "low"]),
  priority_score: z.number().min(0).max(1),
  domain: z.enum([
    "review", "gbp", "ranking",
    "form-submission", "pms-data-quality", "referral"
  ]),
  rationale: z.string().min(1),
  highlights: z.array(z.string()).max(2).default([]),
  supporting_metrics: z.array(SupportingMetricSchema).length(3),
  outcome: z.object({
    deliverables: z.string().min(1),
    mechanism: z.string().min(1),
  }),
  cta: z.object({
    primary: z.object({
      label: z.string().min(1),
      action_url: z.string().min(1),
    }),
    secondary: z.object({
      label: z.string().min(1),
      action_url: z.string().min(1),
    }).optional(),
  }),
  due_at: z.string().optional(),
});

export const SummaryV2OutputSchema = z.object({
  top_actions: z.array(TopActionSchema).min(3).max(5),
  data_quality_flags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  observed_period: z.object({
    start_date: z.string(),
    end_date: z.string(),
  }).optional(),
}).strict();

export type SummaryV2Output = z.infer<typeof SummaryV2OutputSchema>;
```

## Dashboard Metrics Dictionary

```typescript
// src/utils/dashboard-metrics/types.ts

export interface DashboardMetrics {
  reviews: {
    oldest_unanswered_hours: number | null;
    unanswered_count: number;
    current_rating: number | null;
    rating_change_30d: number | null;
    reviews_this_month: number;
  };
  gbp: {
    days_since_last_post: number | null;
    posts_last_quarter: number;
    call_clicks_last_30d: number | null;
    direction_clicks_last_30d: number | null;
  };
  ranking: {
    position: number | null;
    total_competitors: number | null;
    score: number | null;
    lowest_factor: { name: string; score: number } | null;
    highest_factor: { name: string; score: number } | null;
    score_gap_to_top: number | null;
  };
  form_submissions: {
    unread_count: number;
    oldest_unread_hours: number | null;
    verified_count: number;
    verified_this_week: number;
    flagged_count: number;
  };
  pms: {
    distinct_months: number;
    last_upload_days_ago: number | null;
    missing_months_in_period: string[];
    production_total: number;
    production_change_30d: number | null;
    total_referrals: number;
    doctor_referrals: number;
    self_referrals: number;
  };
  referral: {           // sourced from RE output
    top_dropping_source: { name: string; drop_pct: number; days_since_last: number } | null;
    top_growing_source: { name: string; growth_pct: number } | null;
    sources_count: number;
  };
}
```

The dictionary keys above ARE the legal `source_field` values for `SupportingMetricSchema`. The post-Zod validator walks the dictionary at the dotted path and confirms the value matches.

## Tasks

Tasks split into six groups: **A (foundation, sequential)**, **B (service + endpoints, parallel)**, **C (Summary v2, parallel after B.T3)**, **D (task-creator bridge)**, **E (Proofline, parallel)**, **F (verification)**.

### Group A — Foundation (sequential)

#### T1: Disable Opp + CRO in orchestrator
**Do:** In `src/controllers/agents/feature-services/service.agent-orchestrator.ts`, hard-comment the Opportunity and CRO Optimizer dispatch blocks (lines ~474-541 are the regions). Wrap each in a clearly marked `/* DISABLED 2026-04 — Opp/CRO replaced by Summary v2. See plans/04282026.../spec.md */ if (false) { ... }` block so the code is preserved but unreachable. Skip their result-storage and task-creator invocations.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`. Manual: trigger a monthly run for a test org; confirm Opportunity and CRO produce no entries in `agent_results`.

#### T2: Reorder orchestrator: RE → dashboard-metrics → Summary
**Do:** In the same orchestrator file, restructure the monthly chain. Today: Summary runs first. New order: (a) RE runs first, (b) `dashboard-metrics` service runs (after T3 lands), (c) Summary runs last with RE's output + dashboard-metrics in its payload. Keep Proofline scheduling as-is. Update telemetry log lines accordingly.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`. Smoke trace logs for one monthly run confirm the new order.

### Group B — Service + endpoints (parallelizable after A)

#### T3: New service `service.dashboard-metrics.ts`
**Do:** Create `src/utils/dashboard-metrics/service.dashboard-metrics.ts` exporting `computeDashboardMetrics(orgId: number, locationId: number | null, dateRange: { start: string; end: string }, reOutput: ReferralEngineOutput | null): Promise<DashboardMetrics>`. Pure function. Reads from existing services: `aggregatePmsData()`, `fetchGBPDataForRange()`, `fetchRybbitMonthlyComparison()` (or the analog), and the `practice_rankings` + `website_form_submissions` tables directly. Returns the `DashboardMetrics` shape from the types file. Defines and exports `DashboardMetricsSchema` (Zod) for boundary validation.
**Files:** `src/utils/dashboard-metrics/service.dashboard-metrics.ts`, `src/utils/dashboard-metrics/types.ts`
**Depends on:** none (parallel with T4, T5, T6)
**Verify:** `npx tsc --noEmit`. Unit-style spot-call against a known org; confirm shape and reasonable values.

#### T4: New endpoint `GET /api/user/website/form-submissions/timeseries`
**Do:** Add handler to `src/controllers/user-website/UserWebsiteController.ts`. Accepts query: `range=12m|6m|3m`. Returns `[{ month: "YYYY-MM", verified: number, unread: number, flagged: number }]` ordered oldest-first, with all months in the range present (zero-filled if no submissions). Query: `SELECT date_trunc('month', created_at) AS month, COUNT(*) FILTER (WHERE status='verified') AS verified, ... FROM website_form_submissions WHERE organization_id = $1 GROUP BY month`. Register in `src/routes/userWebsite.ts`.
**Files:** `src/controllers/user-website/UserWebsiteController.ts`, `src/routes/userWebsite.ts`
**Depends on:** none (parallel with T3, T5, T6)
**Verify:** `npx tsc --noEmit`. curl with a real orgId returns expected shape and zero-filled months.

#### T5: New endpoint `GET /api/practice-ranking/history`
**Do:** Add handler to `src/controllers/practice-ranking/PracticeRankingController.ts`. Accepts query: `range=6m|3m`. Returns `[{ observedAt: ISO, rankScore: number, rankPosition: number, factorScores: Record<string, number> }]` ordered oldest-first. Query: `SELECT observed_at, rank_score, rank_position, ranking_factors FROM practice_rankings WHERE google_account_id = $1 [AND gbp_location_id = $2] AND observed_at >= NOW() - INTERVAL '6 months' ORDER BY observed_at ASC`. Register in `src/routes/practiceRanking.ts`.
**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/routes/practiceRanking.ts`
**Depends on:** none (parallel with T3, T4, T6)
**Verify:** `npx tsc --noEmit`. curl with a real orgId returns expected shape.

#### T6: New endpoint `GET /api/dashboard/metrics`
**Do:** Create `src/controllers/dashboard/DashboardController.ts` with `getMetrics` handler that calls `computeDashboardMetrics` and returns the dictionary. Validates with `DashboardMetricsSchema` before returning. Create `src/routes/dashboard.ts` and register in the main router. Auth: standard authenticated user middleware (the same chain that protects `/pms/keyData`).
**Files:** `src/controllers/dashboard/DashboardController.ts`, `src/routes/dashboard.ts`, `src/index.ts` (or wherever the main router mounts sub-routers — additive registration)
**Depends on:** T3 (service must exist)
**Verify:** `npx tsc --noEmit`. curl `/api/dashboard/metrics?organization_id=N&location_id=M` returns valid `DashboardMetrics` JSON.

### Group C — Summary v2 (parallelizable, depends on T3 for input shape)

#### T7: `SummaryV2OutputSchema` Zod
**Do:** In `src/controllers/agents/types/agent-output-schemas.ts`, add `SupportingMetricSchema`, `TopActionSchema`, `SummaryV2OutputSchema` per the contract above. Keep the existing legacy `Summary` interface in place for backward compat (it lives elsewhere in `agent-output-schemas.ts` but is no longer the validation target).
**Files:** `src/controllers/agents/types/agent-output-schemas.ts`
**Depends on:** none (parallel with T8, T9, T10)
**Verify:** `npx tsc --noEmit`. Spot test: feed a hand-crafted top_actions[] sample through `safeParse`; confirm pass/fail expected.

#### T8: Summary v2 prompt rewrite
**Do:** Replace `src/agents/monthlyAgents/Summary.md` with the v2 prompt. Sections: ROLE (Chief-of-Staff), INPUTS, RULES, GROUNDING RULES — STRICT, SINGLE-MONTH RULE, UPSTREAM DATA QUALITY ACKNOWLEDGEMENT, PASSTHROUGH RULE, CROSS-SOURCE CONSOLIDATION RULE, OUTCOME RULE — NO MAGNITUDE PREDICTIONS, HIGHLIGHTS RULE, OUTPUT (with example JSON). Length target: 100-140 lines. Mirror the structural patterns from `ReferralEngineAnalysis.md`.
**Files:** `src/agents/monthlyAgents/Summary.md`
**Depends on:** none (parallel with T7, T9, T10) — content depends on agreed schema in T7 but file edit is independent
**Verify:** Manual: read prompt end-to-end; confirm all rule sections present and self-consistent with `SummaryV2OutputSchema`.

#### T9: Summary input builder updated
**Do:** In `src/controllers/agents/feature-services/service.agent-input-builder.ts`, update `buildSummaryPayload` (lines 192-215) to accept `referralEngineOutput` and `dashboardMetrics` params. Add them to `additional_data`. Update orchestrator call site to pass these in.
**Files:** `src/controllers/agents/feature-services/service.agent-input-builder.ts`, `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T2 (orchestrator order set), T3 (metrics service exists)
**Verify:** `npx tsc --noEmit`. Trace one monthly run; confirm Summary's payload contains `additional_data.referral_engine_output` and `additional_data.dashboard_metrics`.

#### T10: Summary v2 runner with corrective retry + cache + value-validator hook
**Do:** Update the orchestrator's Summary call to use `runAgent` with `outputSchema: SummaryV2OutputSchema, cachedSystemBlocks: []` (mirroring RE Tier-1's pattern). Add a post-Zod validator hook that walks `output.top_actions[*].supporting_metrics[*].source_field` against the dashboard-metrics dictionary and confirms each `value` matches the dictionary value (with numeric normalization). On mismatch, throw a Zod-shaped error so the runner triggers its corrective retry. Add highlights[] verbatim-substring validator (drop mismatched entries with telemetry warning, don't reject).
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`, possibly `src/agents/service.llm-runner.ts` (if a hook is needed beyond outputSchema)
**Depends on:** T7, T9
**Verify:** `npx tsc --noEmit`. Smoke run: confirm `[summary-v2]` telemetry shows zod_attempts and value_validator_attempts where applicable.

### Group D — Task-creator bridge (depends on Group C)

#### T11: Add SUMMARY → tasks branch
**Do:** In `src/controllers/agents/feature-services/service.task-creator.ts`, add a new branch that processes Summary v2 output. For each `top_actions[i]`, INSERT a row into `tasks` with: `title=top_actions[i].title`, `description=top_actions[i].rationale`, `category="USER"`, `agent_type="SUMMARY"`, `metadata={...top_actions[i]}` (entire TopAction object), `status="open"`, `is_approved=true`, `due_at=top_actions[i].due_at ?? null`.
**Files:** `src/controllers/agents/feature-services/service.task-creator.ts`
**Depends on:** T7, T10
**Verify:** Smoke run produces N=3-5 tasks rows with `agent_type='SUMMARY'`. Inspect `tasks.metadata` jsonb and confirm full TopAction shape persisted.

#### T12: Remove RE → USER tasks branch (keep ALLORO)
**Do:** In `service.task-creator.ts`, locate the RE branch (lines ~197-273). Remove the `practice_action_plan` → USER task creation loop. Keep the `alloro_automation_opportunities` → ALLORO task creation loop. Add a comment explaining the change references this plan.
**Files:** `src/controllers/agents/feature-services/service.task-creator.ts`
**Depends on:** T11 (new SUMMARY branch must be in place first to avoid an interim state where USER tasks vanish)
**Verify:** Smoke run: confirm zero rows where `agent_type='REFERRAL_ENGINE_ANALYSIS' AND category='USER'`. Confirm ALLORO rows from RE still present.

### Group E — Proofline highlights (parallelizable)

#### T13: Add `highlights[]` to Proofline schema + prompt
**Do:** Update Proofline's output schema (locate in `agent-output-schemas.ts` or wherever it lives — Proofline may not have a Zod schema today; if not, add one or extend the TS interface). Add `highlights: z.array(z.string()).max(2).default([])`. Update `src/agents/monthlyAgents/Proofline.md` with a HIGHLIGHTS RULE section: "Pick 0-2 phrases from `trajectory` to emphasize. Phrases must appear verbatim in the trajectory text."
**Files:** `src/controllers/agents/types/agent-output-schemas.ts` (if Proofline schema lives there), `src/agents/monthlyAgents/Proofline.md`
**Depends on:** none (parallel with all other groups)
**Verify:** `npx tsc --noEmit`. Smoke run: Proofline output includes `highlights: []` (possibly empty for some inputs; non-empty when natural).

### Group F — Verification

#### T14: TypeScript build
**Do:** Run `npx tsc --noEmit` from project root. Zero new errors caused by this plan's changes. Pre-existing unrelated errors noted but not blocked.
**Files:** none (operational)
**Depends on:** T1-T13
**Verify:** Clean tsc output (or only pre-existing errors).

#### T15: End-to-end smoke run on a test org
**Do:** Pick a test organization. Reset its monthly agent state via the existing admin reset (`POST /api/admin/organizations/:id/reset-data` with PMS + RE groups). Trigger a monthly run via the existing trigger (admin endpoint or scheduler manual fire). Verify:
- (a) Orchestrator logs show order: RE first, then dashboard-metrics, then Summary. No Opportunity or CRO log lines.
- (b) `agent_results` has rows for: Proofline, RE, Summary v2 (no Opp, no CRO).
- (c) Summary v2's `response_log` matches `SummaryV2OutputSchema` (validate via runtime safeParse in a one-off script).
- (d) `tasks` table has 3-5 rows with `agent_type='SUMMARY' AND category='USER'`. Inspect one row's `metadata` jsonb — full TopAction object present.
- (e) `tasks` table has 0 rows with `agent_type='REFERRAL_ENGINE_ANALYSIS' AND category='USER'`.
- (f) `tasks` table has N rows with `agent_type='REFERRAL_ENGINE_ANALYSIS' AND category='ALLORO'` (where N = `re_output.alloro_automation_opportunities.length`).
- (g) Each Summary `supporting_metrics[*].source_field` resolves to a real key in the metrics dictionary; each `value` matches the dictionary value at that path.
- (h) `top_actions` are sorted by `priority_score` desc.
- (i) At least one TopAction has a non-empty `highlights[]` array, and entries are substrings of `rationale`.
- (j) `outcome.deliverables` does not contain regex `/\+\d+ |+ \$\d|\+%/` (no magnitude predictions).
- (k) GET `/api/dashboard/metrics?organization_id=X` returns valid `DashboardMetrics` JSON.
- (l) GET `/api/user/website/form-submissions/timeseries?range=12m` returns 12 months ordered oldest-first.
- (m) GET `/api/practice-ranking/history?range=6m` returns rows ordered oldest-first.
**Files:** none (operational)
**Depends on:** T1-T13
**Verify:** All 13 sub-checks pass. Document results in execution summary.

## Done

- [ ] T1-T13 complete and TypeScript clean.
- [ ] Smoke run on a test org passes all 13 sub-checks in T15.
- [ ] Telemetry: `[summary-v2]` lines visible in logs with structured JSON (orgId, n_actions, domains, schema_retries, value_validator_failures, total_ms).
- [ ] No regressions in existing approved-jobs admin views, PMS Statistics tab (RE matrices), Patient Journey tab.
- [ ] Existing daily-cadence agents and Proofline scheduling unchanged in behavior (only output shape gets the additive `highlights[]`).
- [ ] No regression in admin reset flow — resetting an org and triggering a new monthly run works as today.
- [ ] No regression in Referral Engine consumption: RE still produces matrices, growth_opportunity_summary, etc., still rendered on PMS Statistics tab.
- [ ] CHANGELOG.md updated to v0.0.33 with summary.
- [ ] Commit author `LagDave <laggy80@gmail.com>` (no Claude attribution per global CLAUDE.md).

## Out-of-Spec Follow-ups (not this plan)

- **Plan 2 (Frontend redesign)**: Top-bar layout, new DashboardOverview, Hero/Trajectory/Queue/Website/LocalRanking/PMS components, new fonts (Fraunces/Inter/JetBrains Mono), HighlightedText helper, Sparkline component, FactorBar component, mark.hl class, onboarding wizard highlight fix, mobile bottom nav adjustments, Proofline modal "Read full explanation →" retention.
- Future specialist agents (ranking-analyzer, website-analyzer) feeding Summary as data producers (mirrors RE → Summary chain).
- Post-Summary deterministic dedup pass (cross-source consolidation as code, not just prompt rule).
- Removal (full delete) of Opportunity + CRO Optimizer prompt files, task-creator branches, and orchestrator scaffolding once v2 is proven.
- Backfill historical Summary outputs (legacy shape) into the new shape.
- Admin UI for managing Summary v2 prompt or dashboard-metrics dictionary.
- Daily-cadence Summary (currently monthly only).
- Per-claim confidence scoring inside top_actions[*].
- RE Tier-2 (per-claim confidence, dedup audit output, trend strength) — re-evaluated after Plan 1 since RE's role narrowed.
