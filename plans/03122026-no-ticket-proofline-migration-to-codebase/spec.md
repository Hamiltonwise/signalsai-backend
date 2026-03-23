# Migrate Proofline Agent from N8N to Direct Claude Call

## Why
Proofline is the last daily agent still running via N8N webhook. Monthly agents already run via direct Claude call (`runAgent()`). Migrating proofline to the same pattern removes the N8N dependency, makes the prompt version-controlled, and enables adding a proper output schema that the frontend can rely on.

## What
Replace the N8N webhook call in `processDailyAgent()` with a direct Claude call using the existing `runAgent()` + `loadPrompt()` infrastructure. Add a proper JSON output schema to `dailyAgents/Proofline.md`. Add `ProoflineAgentOutput` to backend types. Fix the frontend `ProoflineAgentData` interface to include `trajectory`. The `/proofline-run` endpoint stays unchanged.

## Context

**Relevant files:**
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — prompt file (populated, needs schema)
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — `processDailyAgent()` currently calls `callAgentWebhook()`
- `signalsai-backend/src/controllers/agents/feature-services/service.webhook-orchestrator.ts` — `PROOFLINE_WEBHOOK` constant (will become unused)
- `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts` — needs `ProoflineAgentOutput`
- `signalsai-backend/src/agents/service.llm-runner.ts` — `runAgent()` (already exists)
- `signalsai-backend/src/agents/service.prompt-loader.ts` — `loadPrompt()` (already exists)
- `signalsai/src/types/agents.ts` — `ProoflineAgentData` frontend type (missing `trajectory`)

**Patterns to follow:**
- Monthly agent pattern in `processMonthlyAgents()` → `runMonthlyAgent()` → `loadPrompt()` + `runAgent()` + persist
- Summary.md prompt format: role, trigger, inputs, rules, OUTPUT schema, critical JSON enforcement

**Key decisions:**
- Output is a single JSON object (not an array) — consistent with how the dashboard reads `results[0]`
- `proof_type` values are `"win"` or `"loss"` — matching ApprovedInsightCard's switch cases
- `trajectory` field with `<hl>` tags is required — it's the hero narrative on the dashboard
- Skip case: `{ "skipped": true, "reason": "..." }` when no data is available

## Constraints

**Must:**
- Keep `/proofline-run` endpoint and `processDailyAgent()` function signature unchanged
- Follow `runAgent()` pattern (system prompt + user message as JSON payload)
- Output schema must match what DashboardOverview and ApprovedInsightCard consume

**Must not:**
- Don't remove the N8N webhook env var or constant yet (other agents still use the webhook infra)
- Don't change how `agent_results` are persisted (same insert pattern)
- Don't modify the prompt content/rules — only append the OUTPUT schema section

**Out of scope:**
- Rybbit data integration (next plan)
- Removing N8N webhook infrastructure
- Frontend component changes (beyond type fix)

## Risk

**Level:** 1

**Risks identified:**
- None significant. Direct mechanical migration following an established pattern.

## Tasks

### T1: Add output schema to Proofline.md prompt
**Do:** Append OUTPUT section to `dailyAgents/Proofline.md` with JSON schema and critical enforcement line. Schema fields:
```json
{
  "title": "string — short headline (e.g. 'Website Visits Up 58%')",
  "proof_type": "win | loss",
  "trajectory": "string — one-paragraph narrative for the dashboard hero, use <hl>key numbers</hl> tags to highlight important data points",
  "explanation": "string — detailed paragraph explaining the data behind the trajectory",
  "value_change": "string (optional) — e.g. '+58%' or '-44%'",
  "metric_signal": "string (optional) — the metric name e.g. 'website_visits'",
  "source_type": "string (optional) — 'visibility' | 'engagement' | 'reviews'",
  "citations": ["string (optional) — data source references"]
}
```
Also handle the skip case already in the prompt (lines 16-17).
**Files:** `signalsai-backend/src/agents/dailyAgents/Proofline.md`
**Verify:** File reads clean, schema matches frontend consumption

### T2: Add ProoflineAgentOutput to backend types
**Do:** Add `ProoflineAgentOutput` interface to `agent-output-schemas.ts` mirroring the schema from T1.
**Files:** `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts`
**Verify:** `npx tsc --noEmit`

### T3: Switch processDailyAgent from webhook to direct Claude call
**Do:** In `service.agent-orchestrator.ts`:
1. Import `loadPrompt` and `runAgent`
2. Replace `callAgentWebhook(PROOFLINE_WEBHOOK, payload, "Proofline")` with `runAgent({ systemPrompt: loadPrompt("dailyAgents/Proofline"), userMessage: JSON.stringify(payload, null, 2) })`
3. Extract `result.parsed` as the agent output
4. Remove the `callAgentWebhook` and `PROOFLINE_WEBHOOK` imports (if no longer used in this file)
5. Keep all existing validation, logging, rawData handling, and return shape
**Files:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Verify:** `npx tsc --noEmit`

### T4: Fix frontend ProoflineAgentData type
**Do:** Add `trajectory` field to `ProoflineAgentData` interface in `agents.ts`. This field is already consumed at runtime but missing from the type definition.
**Files:** `signalsai/src/types/agents.ts`
**Verify:** `npx tsc --noEmit` (frontend)

## Done
- [ ] `npx tsc --noEmit` passes (backend)
- [ ] `npx tsc --noEmit` passes (frontend)
- [ ] Proofline.md has complete OUTPUT schema section
- [ ] `processDailyAgent()` uses `runAgent()` instead of `callAgentWebhook()`
- [ ] `/proofline-run` endpoint still works (same function signature)
- [ ] `ProoflineAgentOutput` type exists in backend
- [ ] Frontend type includes `trajectory`
