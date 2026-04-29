# Haiku 4.5 for Referral Engine

## Why
RE is structured-extraction work — read inputs, produce JSON matching a Zod schema. Haiku 4.5 is ~2-3× faster than Sonnet 4.6 on similar token loads. RE's 133.5s Claude call is the single largest contributor to monthly run latency (44% of 302s). Swapping its model alone could save ~50-90s without touching parallelization (separate Tier A spec) or Summary's prompt. Summary stays on Sonnet — different work (deep reasoning + multi-rule grounding) where quality matters more than speed.

## What
Per-agent model selection for the monthly orchestrator: RE picks up an env var (`RE_AGENT_MODEL`) when set; defaults to the existing global default when unset. Summary call site untouched. No prompt or output-schema changes. Rollback is environment-only — unset the var and RE falls back to Sonnet.

## Context

**Relevant files:**
- `src/agents/service.llm-runner.ts:15` — `const DEFAULT_MODEL = process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6"`. Global default.
- `src/agents/service.llm-runner.ts:64-87` — `runAgent({ model = DEFAULT_MODEL, ... })`. Already accepts per-call model override; just needs caller to pass it.
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:248-296` — `runMonthlyAgent` opts shape (`promptPath`, `payload`, `agentName`, `meta`, `enableCache`, `outputSchema`). Needs a `model` field added and passed through to `runAgent`.
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:683-690` — RE call site (the one to wire the env var into).
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts:738-745` — Summary call site (intentionally untouched).
- `.env.active`, `.env.sandbox` — existing env files; no `.env.example` to update.

**Patterns to follow:**
- `process.env.X || "fallback"` is the existing convention in `service.llm-runner.ts:15` for the global model default. Mirror it for the per-agent variant.
- The Pipeline modal at `/admin/ai-pms-automation` (shipped this session, commit `f0655c51`) renders full `agent_input` and `agent_output` JSON for any RE run. Use it for the side-by-side eval — no new tooling needed.

**Reference file:** `service.llm-runner.ts:15` for the env-fallback shape.

## Constraints

**Must:**
- Default behavior unchanged when env var unset — RE still runs on whatever `AGENTS_LLM_MODEL` resolves to (Sonnet 4.6 today)
- Summary call site remains untouched (continues to inherit default)
- Preserve RE's Zod schema validation and 3-attempt retry semantics
- Env var name: `RE_AGENT_MODEL`, applied via `process.env.RE_AGENT_MODEL || undefined` so `runAgent`'s existing `model = DEFAULT_MODEL` default kicks in when unset

**Must not:**
- Hardcode Haiku as the new RE default (rollback must be `unset RE_AGENT_MODEL`, not a code change)
- Touch Summary's call site
- Add new dependencies or eval frameworks
- Change RE's prompt or output schema
- Cascade the change to other agents (Proofline, Copy Companion, etc.) — those keep their own defaults

**Out of scope:**
- Haiku for Summary (explicitly rejected — see prior conversation; quality risk too high without proper eval harness)
- Tier A parallelization (separate spec at `plans/04292026-no-ticket-monthly-agents-latency-optimization/spec.md`)
- Per-tenant model selection
- Automated eval harness / CI quality comparison
- Per-environment env var bootstrapping (deployment / infra concern; documented in the changelog when shipped)

## Risk

**Level:** 2

**Risks identified:**
- **Quality regression on RE output.** Haiku may produce JSON that passes Zod schema but is subtly worse — less complete `doctor_referral_matrix`, generic `practice_action_plan` items, weaker `growth_opportunity_summary`. The validator we have only checks structure, not insight quality. **Mitigation:** Manual side-by-side eval via Pipeline modal (T4) before flipping the env var on in prod. Env-var design means rollback is instant.
- **Schema validation failure rate could rise.** Today's 3-attempt retry absorbs the occasional Sonnet schema mismatch. If Haiku's failure rate climbs above ~30%, the latency win gets eaten by retries. **Mitigation:** Monitor `agent_results` for `agent_type='referral_engine'` rows with `status='error'` or where multiple attempts were needed. Pipeline modal makes this visible per-run.
- **Real saving may be lower than the 70-90s estimate.** Haiku's TTFT advantage scales with output tokens more than input. RE input is ~34k tokens; Haiku still has to process them. Realistic estimate: 50-70s saved, not 70-90. Eval will reveal actual numbers.

**Blast radius:**
- `runMonthlyAgent` is the chokepoint for RE + Summary calls. Adding an optional `model` opt is backwards-compatible (Summary's call site stays unchanged, falls back to default).
- `runAgent` already accepts `model` via destructuring — no change to its signature.
- No frontend, no API, no DB, no migrations.

**Pushback:** None — this is acting on a user-confirmed recommendation (the user accepted the "RE only, leave Summary on Sonnet" path). The Level 2 quality risk is mitigated by the env-var-with-eval design.

## Tasks

### T1: Add `model` opt to `runMonthlyAgent` and pass through to `runAgent`
**Do:** In `service.agent-orchestrator.ts`, extend the `runMonthlyAgent` opts type to include `model?: string`. In the function body, conditionally include `model: opts.model` in the `runAgent` call (only when defined, so `runAgent`'s `DEFAULT_MODEL` default still applies otherwise). Confirm `runAgent`'s existing destructure accepts the override.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` zero errors. `grep -n "runMonthlyAgent" src/` confirms only two callers (RE and Summary); both still compile.

### T2: Wire `RE_AGENT_MODEL` env var at the RE call site
**Do:** At RE call (~line 685), pass `model: process.env.RE_AGENT_MODEL || undefined`. When unset → omitted from runAgent call → existing default. When set → overrides for RE only; Summary call (separate runMonthlyAgent invocation) is unaffected.
**Files:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Depends on:** T1
**Verify:** With env unset, run a monthly agent and confirm log shows current default model (Sonnet 4.6). Set `RE_AGENT_MODEL=claude-haiku-4-5-20251001` in `.env.active`, restart dev server, run again — confirm log shows Haiku.

### T3: Manual side-by-side eval via Pipeline modal
**Do:** Pre-eval baseline: pick the most recent successful RE result_id from `agent_results` (e.g. ID 1391 from the 18:54 baseline run on One Endodontics Job #118). With `RE_AGENT_MODEL` set to Haiku, trigger a fresh monthly run on the same org+location+date_range. Record the new RE result_id. Open Pipeline modal at `/admin/ai-pms-automation` for both jobs (or use direct DB lookup if jobs are too far apart in the list). Diff the `agent_output` JSON side-by-side. Specifically check:
- `doctor_referral_matrix` row count + content quality (are the same key referrers surfaced? are matrix values plausible?)
- `non_doctor_referral_matrix` similar comparison
- `growth_opportunity_summary` — is the insight as specific?
- `practice_action_plan` — are the action titles/descriptions as concrete? Look for genericity ("improve referral relationships" generic vs. "follow up with Cox Dental about March drop" specific)
- `alloro_automation_opportunities` — same specificity check
- Token usage, run duration

Document findings in `## Eval Findings` section appended to this spec post-execution. Decide: ship-to-prod, ship-but-watch, or revert.
**Files:** none (manual eval, document in spec)
**Depends on:** T2
**Verify:** `## Eval Findings` section added with comparison notes and a go/no-go decision.

### T4: Update CHANGELOG
**Do:** Add 0.0.41 entry documenting the env var, the rationale, the eval result, and clear rollback instruction.
**Files:** `CHANGELOG.md`
**Depends on:** T3 (eval result feeds the changelog)
**Verify:** Changelog reads cleanly; rollback instruction is unambiguous.

## Done
- [ ] `npx tsc --noEmit` zero errors
- [ ] `npm run lint` zero new warnings
- [ ] Manual: env var unset → log confirms default model (Sonnet); env var set → log confirms Haiku
- [ ] Pipeline modal renders both runs (Sonnet baseline + Haiku trial) for the same org+location+date
- [ ] Eval findings documented in this spec (T3 output)
- [ ] Decision recorded: prod env var ON | prod env var OFF | revert | further investigation
- [ ] No regressions: monthly run completes; Summary still passes validator on attempt 1; 5+ USER + 6+ ALLORO tasks created
- [ ] CHANGELOG entry includes rollback procedure
