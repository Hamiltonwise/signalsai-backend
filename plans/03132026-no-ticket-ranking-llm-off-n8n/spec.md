# Ranking LLM Analysis — Remove n8n Dependency

## Why
The practice ranking pipeline's only remaining n8n dependency is the LLM gap analysis step. It fires data to an n8n webhook which runs Gemini, then returns the response synchronously. This adds latency, an external failure point, and Gemini cost when we already have Claude infrastructure in the backend. Removing it consolidates all ranking logic into the backend.

## What
Replace the n8n webhook call in Step 6 of `service.ranking-pipeline.ts` with a direct call to `service.llm-runner.ts` using Claude Sonnet. Remove the webhook endpoint. Consolidate duplicate task creation logic.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — Pipeline orchestrator, Step 6 (lines 748-903) is the n8n webhook call
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts` — Webhook handler with `archiveAndCreateTasks()` and `saveLlmAnalysis()`
- `signalsai-backend/src/agents/service.llm-runner.ts` — Generic Claude caller with `runAgent()`
- `signalsai-backend/src/controllers/practice-ranking/PracticeRankingController.ts` — Contains `handleLlmWebhook` endpoint (to be removed)
- `signalsai-backend/src/routes/practiceRanking.ts` — Route registration for webhook endpoint (to be removed)

**Patterns to follow:**
- `service.llm-runner.ts` — `runAgent({ systemPrompt, userMessage, prefill: "{" })` with JSON output
- Existing agent services in `src/agents/` for prompt structure

**Key decisions:**
- Model: `claude-sonnet-4-6` (hardcoded, same as other agents)
- Prompt: Ported from Gemini n8n agent, adapted for Claude's strengths
- Task creation: Use webhook handler's transactional `archiveAndCreateTasks()` exclusively
- Webhook endpoint: Remove entirely

## Constraints

**Must:**
- Preserve the exact same `llm_analysis` JSON output schema (gaps, drivers, render_text, client_summary, one_line_summary, verdict, confidence, top_recommendations, citations)
- Preserve task creation behavior (archive old + create new in transaction)
- Preserve graceful fallback when LLM fails (mark "completed without AI insights")
- Use existing `service.llm-runner.ts` — no new LLM infrastructure

**Must not:**
- Change the ranking algorithm, Apify integration, or any Step 1-5 logic
- Modify the frontend contract (the `llm_analysis` JSONB shape)
- Add new npm dependencies
- Touch the leadgen tool's separate audit system

**Out of scope:**
- Prompt tuning/optimization (will port faithfully, tune later)
- Changing the 8-factor scoring algorithm
- The `audit_processes` table or leadgen tool ranking

## Risk

**Level:** 2 (Concern)

**Risks identified:**
- Model switch (Gemini → Claude) could produce slightly different prose quality → **Mitigation:** Claude Sonnet is equal or better at structured JSON output. Prefill `{` to force JSON. The `extractJson` fallback in llm-runner handles edge cases.
- Duplicate task creation in pipeline (lines 804-856) must be fully removed → **Mitigation:** T2 explicitly removes this code block and replaces with `archiveAndCreateTasks()` call.

## Tasks

### T1: Create ranking LLM prompt builder service
**Do:** Create `service.ranking-llm.ts` in `feature-services/`. This service:
1. Exports `buildRankingAnalysisPrompt(payload)` — takes the same `llmPayload` object currently built at pipeline line 760-787, returns `{ systemPrompt, userMessage }`
2. Exports `runRankingAnalysis(rankingId, llmPayload, ranking)` — calls `runAgent()`, processes the response, calls `archiveAndCreateTasks()` and `saveLlmAnalysis()`, handles errors
3. System prompt: port the Gemini prompt (8 ranking factors, gap/driver/recommendation instructions, JSON-only output constraint)
4. User message: `JSON.stringify(llmPayload.additional_data)`
**Files:** `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`
**Verify:** File compiles with `npx tsc --noEmit`

### T2: Replace n8n webhook call in pipeline with direct LLM call
**Do:** In `service.ranking-pipeline.ts` Step 6 (lines ~748-903):
1. Remove the `axios` import and `PRACTICE_RANKING_ANALYSIS_WEBHOOK` constant
2. Remove the entire webhook POST block + inline task creation (lines 759-892)
3. Replace with a call to `runRankingAnalysis()` from T1
4. Keep the existing fallback behavior: if LLM fails, mark "completed without AI insights"
**Files:** `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Verify:** `npx tsc --noEmit`

### T3: Remove webhook endpoint and clean up dead code
**Do:**
1. Remove `router.post("/webhook/llm-response", ...)` from `practiceRanking.ts`
2. Remove `handleLlmWebhook` export from `PracticeRankingController.ts`
3. Remove the `import * as llmWebhookHandler` from controller (if no longer used there)
4. Keep `service.llm-webhook-handler.ts` — its `archiveAndCreateTasks()` and `saveLlmAnalysis()` are still used by the new service
5. Remove `PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK` from `.env` (comment out, note it's deprecated)
**Files:** `signalsai-backend/src/routes/practiceRanking.ts`, `signalsai-backend/src/controllers/practice-ranking/PracticeRankingController.ts`, `signalsai-backend/.env`
**Verify:** `npx tsc --noEmit`, confirm no remaining references to the webhook URL

## Done
- [ ] `npx tsc --noEmit` passes with zero errors from changed files
- [ ] Pipeline Step 6 calls Claude directly via `runAgent()` — no axios, no webhook
- [ ] `llm_analysis` JSON output matches existing schema (gaps, drivers, render_text, client_summary, one_line_summary, verdict, confidence, top_recommendations, citations)
- [ ] Task creation uses transactional `archiveAndCreateTasks()` only — no duplicate path
- [ ] Webhook endpoint `/webhook/llm-response` is removed from routes
- [ ] No remaining references to `PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK` in code (only commented in .env)
- [ ] Graceful fallback: LLM failure still results in "completed without AI insights"
