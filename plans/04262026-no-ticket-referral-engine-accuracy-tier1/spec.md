---
id: spec-referral-engine-accuracy-tier1
created: 2026-04-26
ticket: no-ticket
mode: --start
status: planning
---

# Referral Engine + PMS Pipeline — Tier 1 Accuracy Fixes

## Why
The deep-map pass surfaced six surgical fixes that close the highest-ROI accuracy gaps in the Referral Engine pipeline without touching the model, the parser internals, or the n8n contract. Specifically:

1. **Code lies to the prompt.** Prompt promises GBP + website analytics enrichment; payload builder only sends PMS. Model is told to weigh data it never sees.
2. **Output validator only checks "non-empty."** Schema-mismatched outputs reach `agent_results` and downstream consumers silently break.
3. **No anti-hallucination guard.** Prompt asks for grounded claims but never says "only cite numbers from the input."
4. **Single-month data → improvisation.** Trend-comparison rules have no fallback for fresh orgs with one month of data.
5. **Prompt caching plumbed but unused.** Paying full input tokens on every monthly run for a ~200-line system prompt that never changes.
6. **Sum mismatches in `monthly_rollup` go undetected.** If `sum(sources) ≠ total_referrals`, the LLM trusts the blob and reports inconsistent numbers.

These six together close the largest accuracy holes; each is bounded, low-risk, and ships in the same PR.

## What
A single PR delivering:

1. **Referral Engine payload** carries GBP + website analytics under `additional_data` (or matching schema), passed through verbatim from existing fetchers — no transformation.
2. **Zod schema** for `ReferralEngineAgentOutput` + corrective single-retry on shape mismatch in `service.llm-runner.ts`. Retry counts toward the existing 3-attempt budget only if the second shape attempt also fails.
3. **Prompt edits** in `ReferralEngineAnalysis.md`: anti-hallucination rule + single-month trend rule + sum-reconciliation acknowledgement.
4. **Prompt caching** enabled for monthly agents — pass system prompt as a `cachedSystemBlock` with `cache_control: { type: "ephemeral" }`.
5. **Sum reconciliation** in `pmsAggregator.ts`: when `|sum(sources.referrals) - total_referrals| / total_referrals > 0.05`, append a `data_quality_flag` to the aggregated payload before the orchestrator hands it to the agent.
6. **Verification:** TS check both halves; smoke test by re-running an existing agent_results regeneration against a real org and inspecting the output for grounded claims, no schema errors, and presence of any expected data_quality_flag if the test data has known anomalies.

**Done when:**
- Backend `npx tsc --noEmit` zero errors.
- An end-to-end Referral Engine run on an org with multi-month PMS data produces a Zod-valid output containing GBP/analytics-aware claims (or correctly omits them when not available).
- A run on an org with single-month data outputs `trend_label: "new"` for every source and an explicit `data_quality_flags` entry naming the limitation.
- A run with intentionally mismatched sum data (test fixture) produces a `data_quality_flags` entry naming the discrepancy before the LLM call.
- Console logs show `cache_creation_input_tokens` on first run and `cache_read_input_tokens` on subsequent runs within the same 5-minute window.

## Context

**Relevant files (read for understanding, modified or extended during execution):**

- `src/agents/monthlyAgents/ReferralEngineAnalysis.md` — the prompt. Modified additively (3 inserts).
- `src/agents/service.llm-runner.ts:94-248` — Anthropic SDK call site. `cachedSystemBlocks` parameter (lines 156-169) already plumbed but unused for monthly agents. `extractJson` (lines 473-540) returns null on failure. Modified for: caching enablement + Zod validation + corrective retry.
- `src/agents/service.llm-runner.ts:473-540` — `extractJson()` parser. Untouched; Zod validation runs on its output.
- `src/controllers/agents/feature-services/service.agent-input-builder.ts:244-263` — `buildReferralEnginePayload`. Currently only emits `pms`; extend to include `gbp` + `website_analytics`.
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:369-399, 547-598` — orchestrator: where GBP + analytics are fetched (already wired into Summary, just not Referral Engine). Read to confirm fetch shape; the call site that builds Referral Engine payload (line ~570) needs the extra args.
- `src/controllers/agents/types/agent-output-schemas.ts:182-195` — `ReferralEngineAgentOutput` interface. Add Zod schema as a sibling export. Keep TS interface for backward compat (Zod schema's `.infer` should match it).
- `src/utils/pms/pmsAggregator.ts:149-291` — aggregator. Add sum-reconciliation pass that appends to whatever `data_quality_flags` field is exposed in the aggregated payload (or create the field if missing — verify during execution).
- `src/agents/feature-services/agentLogger.ts:48-90` — `isValidAgentOutput`. NOT removed; remains as a fallback. Zod runs first; on Zod failure → corrective retry; on second Zod failure → fall through to existing `isValidAgentOutput` for legacy behavior. (Decision D4 below.)

**Patterns to follow:**

- **Zod schema location:** sibling export to the TS interface in `agent-output-schemas.ts`. Use `z.object({...}).strict()` for the top-level so unknown keys fail validation. Tolerate optional fields exactly as the TS interface allows.
- **Corrective retry message:** when Zod fails, send a single follow-up user message: `Your previous response failed schema validation. Errors: <errors>. Respond again with ONLY a valid JSON object matching the schema described in the system prompt. No markdown fences, no explanation.` Then re-call `messages.create` with the same system prompt + the original user message + assistant turn + the corrective user message. Cap at one corrective retry per outer attempt.
- **Cache control:** match the existing `cachedSystemBlocks` plumbing — pass an array of `{ type: "text"; text: <prompt>; cache_control: { type: "ephemeral" } }` blocks. The runner already supports this; the call site just needs to opt in.
- **Aggregator data_quality_flags:** if the aggregator output type doesn't already have a `data_quality_flags: string[]` field, add it to the type. Initialize as `[]` and push reconciliation messages.

**Reference file:** `service.llm-runner.ts` already calls Anthropic SDK with `cachedSystemBlocks` parameter — just unused. The shape of an enabled call is the cleanest analog (no new pattern needed).

## Constraints

**Must:**
- Use Zod 4.3.6 (already in deps, no new install).
- Preserve the TS `ReferralEngineAgentOutput` interface; the Zod schema is additive.
- Keep `temperature: 0` and `maxTokens: 16384` unchanged.
- Sum reconciliation threshold = **5%** delta. Use a named constant (`SOURCE_SUM_TOLERANCE = 0.05`) at the top of `pmsAggregator.ts`.
- Sum reconciliation guards against division by zero (if `total_referrals === 0`, skip the check; do not flag).
- Single-month detection = `monthly_rollup.length === 1`.
- Prompt caching uses `cache_control: { type: "ephemeral" }` matching existing `service.llm-runner.ts:156-169`.
- All prompt edits are **additive** — preserve every existing rule. New rules go in clearly-labeled sections (`ANTI-HALLUCINATION`, `SINGLE-MONTH RULE`, `SUM-INTEGRITY ACK`).
- Corrective-retry on Zod failure runs **once per outer attempt**. Outer retry budget stays at 3 (matches existing).

**Must not:**
- Change the agent's output schema (no new fields, no removed fields). Only validating the existing shape more strictly.
- Remove or weaken `isValidAgentOutput` — it stays as a fallback after Zod.
- Add new dependencies.
- Touch the n8n parser webhook contract.
- Touch the paste parser, file parser, or sanitize service (Tier 2 / 3 work).
- Modify Guardian / Governance Sentinel logic.
- Change retry counts, backoff, or logging shape (other than adding cache token fields when caching kicks in — those are already supported).
- Add a new admin UI surface (review-step UI is Tier 2, not this plan).

**Out of scope:**
- Tier 2 fixes: AI-driven type classification, date-format detection, parser unit tests, review UI step. Separate plan.
- Tier 3 fixes: self-critique pass, n8n parser repatriation, per-claim confidence, output cache by data fingerprint. Separate plan.
- Migrating other monthly agents (Proofline, Summary, Opportunity, CRO Optimizer) to Zod or to caching. Same patterns apply but those agents have their own schemas and are out of this plan's surface area. They become a follow-up that copies this plan's structure.
- Pre-LLM input validation beyond sum reconciliation (e.g., min row count, date sanity). Sum check is the single highest-value deterministic guard; the rest is Tier 2 review-UI work.

## Risk

**Level:** 2 (Concern — modifies live LLM agent behavior, but each fix is bounded and additive)

**Risks identified:**

1. **Zod rejects outputs that the old non-empty check accepted.** Possible regression: a previously "succeeded" output now fails Zod, triggers corrective retry, possibly fails again, lands in the existing 3-attempt-failure path. → **Mitigation:** keep `isValidAgentOutput` as a downstream fallback; log Zod failures with the schema error so we can tune the schema if it's too strict. Use `.strict()` only on the top level; allow loose typing on freeform string fields like `notes` and `description`.

2. **Adding GBP + website analytics to payload changes model output shape.** With more data, the model may emit longer matrices, different priority ranking, or new claim categories. → **Mitigation:** prompt already scopes GBP + analytics as enrichment ("if available"). No prompt edit changing primacy. Smoke test at end of execution; if outputs drift undesirably, the env knob to disable would be opening up `additional_data: { pms, gbp: null, website_analytics: null }` — keep payload extension behind a config flag if drift is observed during smoke.

3. **Prompt cache TTL window mismatch with monthly cadence.** 5-min ephemeral TTL means most monthly runs miss the cache (next run is days later). Cache only saves cost when multiple runs happen close together (orchestrator running across multiple orgs in one batch, retries). → **Mitigation:** acceptable. Even within-batch hits are real savings; no harm if it misses. Long-term consideration: 1h TTL is available via Anthropic's beta — explicitly out of scope here.

4. **Sum reconciliation could flag normal rounding.** `total_referrals` is computed by n8n; sources are aggregated by n8n; floats can drift. → **Mitigation:** 5% tolerance + integer types (referrals are counts, not floats). Flag is informational only — does not block the run.

5. **Prompt edit interactions.** Multiple new rules in one prompt edit could create unintended phrasing collisions with existing rules. → **Mitigation:** add new rules in their own labeled sections, do not edit existing rule wording.

6. **Corrective retry could double-spend tokens silently.** A single corrective retry per outer attempt = up to 3 retries × 2 calls = 6 LLM calls in worst case. → **Mitigation:** log each retry with `[zod-retry]` prefix so cost is observable. Cap is fixed; not configurable.

**Blast radius:**
- Files modified: 5 backend files + 1 prompt file + 1 type file = **7 files**.
- LLM behavior surface: Referral Engine only. Other agents unchanged.
- Database: no schema change. No migration. No data deletion.
- Frontend: untouched.
- API contract (admin endpoints): untouched.

**Pushback:**
- Combining 6 fixes in one PR is normally a Level 2+ smell — I'd usually push for splitting. Justification: every fix targets the same agent flow, each is small (1-30 lines), and they reinforce each other (more data + better grounding + schema validation + sum integrity). Splitting into 6 PRs would be ceremony tax with no meaningful safety gain. **Acceptable.** If during execution any single task balloons (e.g., Zod schema reveals too many output mismatches), halt and split.

## Decisions

**D1. Sum-mismatch threshold:** **5%** (`SOURCE_SUM_TOLERANCE = 0.05` constant in `pmsAggregator.ts`). Skips the check when `total_referrals === 0`.

**D2. Single-month rule:** When `monthly_rollup.length === 1`, all `trend_label` values must be `"new"`. Prompt enforces; not deterministically post-validated.

**D3. Anti-hallucination rule (exact wording for prompt):**
```
GROUNDING RULES — STRICT
Cite only source names, months, referral counts, and production figures
that appear verbatim in the input JSON. If a number is not in the input,
omit the claim. Do not infer, estimate, or interpolate values.
```

**D4. Zod-failure handling:**
- Outer attempt N: LLM call → `extractJson` → Zod validate.
- If Zod fails: send one corrective user message with the schema errors. Re-call. Re-validate.
- If second Zod attempt also fails: outer attempt N is consumed; fall through to existing 3-attempt retry loop. After all 3 outer attempts, fall back to existing `isValidAgentOutput` legacy check. If even that fails, throw — agent failure surfaces to client.

**D5. Payload extension:**
```typescript
buildReferralEnginePayload(params: {
  domain, googleAccountId, startDate, endDate,
  pmsData?, gbpData?, websiteAnalytics?,
}) → {
  agent: "referral_engine",
  domain, googleAccountId, dateRange,
  additional_data: {
    pms: pmsData ?? null,
    gbp: gbpData ?? null,
    website_analytics: websiteAnalytics ?? null,
  },
}
```
Existing GBP fetch in orchestrator (already feeding Summary) gets re-used as a parameter to `buildReferralEnginePayload`.

**D6. Prompt cache enablement:** the call to `runAgent` for Referral Engine passes `cachedSystemBlocks: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" }}]`. System prompt only; user message is dynamic and not cached.

## Tasks

### T1: Add Zod schema for ReferralEngineAgentOutput
**Do:**
- In `src/controllers/agents/types/agent-output-schemas.ts`, add `ReferralEngineAgentOutputSchema = z.object({...}).strict()` matching the existing `ReferralEngineAgentOutput` interface (lines 182-195). Use `z.array(z.object({...}))` for `doctor_referral_matrix`, `non_doctor_referral_matrix`, etc. Use `.optional()` for fields the interface marks `?`. Use `z.enum([...])` for `trend_label` and `priority`.
- Export the schema and a derived `z.infer` type. Verify `z.infer<typeof Schema>` is structurally compatible with the existing TS interface.
**Files:** `src/controllers/agents/types/agent-output-schemas.ts` (modify)
**Depends on:** none
**Verify:** `npx tsc --noEmit` passes; manually compare schema field-by-field against the prompt's JSON output spec (lines 130-188 of `ReferralEngineAnalysis.md`).

### T2: Wire Zod validation + corrective retry in llm-runner
**Do:**
- In `src/agents/service.llm-runner.ts`, after `extractJson(raw)`:
  - If `parsed === null` → existing fallback path (return as before).
  - If `parsed !== null`: run `Schema.safeParse(parsed)`. If success → return as before. If fail:
    - Build corrective user message containing the Zod error (formatted via `error.format()` or `.issues`).
    - Re-call `messages.create` with `[user: original, assistant: raw, user: corrective]`. Same model, same system, same cache settings.
    - `extractJson` + `safeParse` again. If success → return. If fail → log `[zod-retry] failed second attempt` and return raw parsed (let outer caller decide).
- Add an optional `outputSchema?: ZodSchema<any>` parameter to `runAgent`. Only when present, run validation. Backward compat for other agents that don't pass it.
**Files:** `src/agents/service.llm-runner.ts` (modify)
**Depends on:** T1
**Verify:** `npx tsc --noEmit`. Manual: temporarily inject a malformed return into `extractJson` and confirm the corrective retry fires + logs.

### T3: Extend Referral Engine payload with GBP + website analytics
**Do:**
- In `src/controllers/agents/feature-services/service.agent-input-builder.ts:244-263`, extend `buildReferralEnginePayload` per D5. Add `gbpData?` and `websiteAnalytics?` params. Always emit them in `additional_data` (defaulting to `null`).
- In `src/controllers/agents/feature-services/service.agent-orchestrator.ts` around line 570 (the Referral Engine invocation), pass the already-fetched `gbpData` and `websiteAnalytics` (the same values fed into Summary) to `buildReferralEnginePayload`.
**Files:** `service.agent-input-builder.ts` (modify), `service.agent-orchestrator.ts` (modify)
**Depends on:** none (parallelizable with T1/T2)
**Verify:** `npx tsc --noEmit`. Manual: log the payload right before LLM call, confirm `additional_data.gbp` and `additional_data.website_analytics` are populated when those fetches succeeded.

### T4: Enable prompt caching for Referral Engine
**Do:**
- At the `runAgent` call site for Referral Engine in `service.agent-orchestrator.ts`, add `cachedSystemBlocks: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]`.
- Confirm via existing logging (lines 212-214) that `cache_creation_input_tokens` shows up on first run; `cache_read_input_tokens` on second run within 5 min.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts` (modify)
**Depends on:** none (parallelizable with T1/T3)
**Verify:** Manual run. Log inspection.

### T5: Add sum reconciliation in pmsAggregator
**Do:**
- In `src/utils/pms/pmsAggregator.ts`, add a `SOURCE_SUM_TOLERANCE = 0.05` constant.
- After per-month aggregation, for each month compute `sumOfSourceReferrals = sources.reduce((a, s) => a + s.referrals, 0)`. If `total_referrals > 0` AND `Math.abs(sumOfSourceReferrals - total_referrals) / total_referrals > 0.05`, push to a `data_quality_flags: string[]` field on the aggregated output: `Sum-of-sources mismatch in <month>: sources=${sumOfSourceReferrals}, total=${total_referrals}`.
- If the aggregator output type doesn't already have `data_quality_flags`, add it (initialized as `[]`). The orchestrator will pass this through into the LLM payload's `additional_data.pms.data_quality_flags`. Confirm the prompt is structured to read it (it already references `data_quality_flags` as an output array; the agent will see them as input context — add a single line to prompt to acknowledge upstream flags).
**Files:** `src/utils/pms/pmsAggregator.ts` (modify), maybe a related types file (verify during execution)
**Depends on:** none (parallelizable with T1-T4)
**Verify:** `npx tsc --noEmit`. Unit-style smoke: craft a minimal aggregator input where source sums don't match `total_referrals`, confirm the flag is emitted.

### T6: Prompt edits — anti-hallucination, single-month, sum-acknowledgement
**Do:**
- In `src/agents/monthlyAgents/ReferralEngineAnalysis.md`, append three new clearly-labeled sections (do not edit existing rule wording):
  - **GROUNDING RULES — STRICT** (D3 wording verbatim).
  - **SINGLE-MONTH RULE:** "If `monthly_rollup` contains only one month, set `trend_label: 'new'` for every source. Add to `data_quality_flags`: 'Single month of data — no trend comparison possible.' Do not invent prior-month numbers."
  - **UPSTREAM DATA QUALITY ACKNOWLEDGEMENT:** "If `additional_data.pms.data_quality_flags` contains entries, surface them in your output's `data_quality_flags` array verbatim."
**Files:** `src/agents/monthlyAgents/ReferralEngineAnalysis.md` (modify)
**Depends on:** none (parallelizable with T1-T5)
**Verify:** Manual: re-read the prompt to confirm flow, no contradictions with existing rules.

### T7: Verification — TS + smoke
**Do:**
- `npx tsc --noEmit` from project root → zero errors.
- Pick an org with multi-month PMS data; trigger a Referral Engine re-run via the existing manual-trigger endpoint (or scheduler tick). Inspect `agent_results.agent_output` — confirm:
  - Output passes Zod (no `[zod-retry]` log lines OR exactly one followed by success).
  - `data_quality_flags` empty unless test fixture seeded.
  - LLM logs show `cache_creation_input_tokens` (first run) and `cache_read_input_tokens` (second run within 5 min).
- Pick an org with single-month PMS data (or seed one). Trigger a run. Confirm all `trend_label === "new"` and `data_quality_flags` contains the single-month line.
- Optional (skip if test data unavailable): seed a sum-mismatch row, trigger run, confirm the upstream flag surfaces.
**Files:** none (operational)
**Depends on:** T1–T6
**Verify:** Manual log + DB inspection.

## Done
- [ ] All 6 modified files saved (no new files except possibly a types add).
- [ ] `npx tsc --noEmit` passes from project root with zero errors.
- [ ] `ReferralEngineAgentOutputSchema` exported alongside the TS interface; `z.infer` matches.
- [ ] `service.llm-runner.ts` runs Zod validation when `outputSchema` is passed; corrective single-retry on failure; falls through to legacy `isValidAgentOutput` if both Zod attempts fail.
- [ ] Referral Engine payload contains `additional_data.gbp` and `additional_data.website_analytics` whenever those upstream fetches succeed.
- [ ] Prompt cache active on Referral Engine `runAgent` call; cache token fields appear in logs.
- [ ] Aggregator emits `data_quality_flags` on sum mismatches > 5%.
- [ ] Prompt has new GROUNDING / SINGLE-MONTH / UPSTREAM DATA QUALITY sections.
- [ ] Smoke run on real org produces a Zod-valid output that grounds claims in input data and surfaces upstream flags if present.
- [ ] No regression in existing Referral Engine consumers (task creation, Guardian validation, frontend rendering).

## Out-of-Spec Follow-ups (not this plan)
- Tier 2: AI-driven type classification (replace keyword matching), date-format detection by sampling, parser unit test suite, "review parsed data" admin UI step.
- Tier 3: self-critique second pass (Haiku), n8n parser repatriation, per-claim confidence scoring, output cache keyed by PMS data fingerprint.
- Apply this plan's patterns (Zod + caching + grounding rules) to Proofline, Summary, Opportunity, CRO Optimizer agents — copy-paste with their respective schemas.
- 1-hour cache TTL (Anthropic beta) — currently using 5-min ephemeral.
