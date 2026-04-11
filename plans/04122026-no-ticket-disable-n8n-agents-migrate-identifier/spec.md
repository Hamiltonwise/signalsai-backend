# Disable n8n Agents & Migrate Identifier to SDK

## Why
Three agents still call n8n webhooks (Copy Companion, Guardian, Governance) and one (Identifier) calls n8n with a hardcoded fallback. Goal: zero n8n dependencies for any *performing* agent. Copy Companion / Guardian / Governance get disabled (reversibly — code stays). Identifier gets migrated to direct Claude SDK so the ranking pipeline produces real specialty/marketLocation values instead of silently degrading to the "orthodontist" fallback when the webhook is down.

## What
- `POST /api/agents/gbp-optimizer-run` and `POST /api/agents/guardian-governance-agents-run` no longer registered (commented with marker).
- "Run Guardian & Governance" button removed from `AIDataInsightsList.tsx`. Historical card grid + clear-month-data still work.
- `identifyLocationMeta()` no longer calls `IDENTIFIER_AGENT_WEBHOOK`. It calls Claude directly via `runAgent()` with a new `Identifier.md` prompt.
- Existing ranking consumers (`service.ranking-executor.ts:211`) read the same `{specialty, marketLocation}` shape — no behavior change for downstream.
- Done when: `npx tsc --noEmit` clean, ranking-run on a test practice produces real specialty/marketLocation, admin AI Data Insights page renders without the run button.

## Context

**Relevant files (modified):**
- `src/routes/agentsV2.ts` — comment out routes 28 + 30
- `src/controllers/agents/feature-services/service.webhook-orchestrator.ts:73-143` — replace webhook body in `identifyLocationMeta()` with `runAgent()` call. Keep the function signature, payload-building, and fallback path.
- `frontend/src/pages/admin/AIDataInsightsList.tsx` — comment out `handleRunAgents`, the run button (lines 270-277), the `renderProgressBar` block, and update the empty-state copy.

**Relevant files (created):**
- `src/agents/rankingAgents/Identifier.md` — new prompt subdir, follows existing convention (`dailyAgents/`, `monthlyAgents/`, `pmAgents/`, `pmsAgents/`, `websiteAgents/`).

**Patterns to follow:**
- SDK call pattern from `service.agent-orchestrator.ts:150-185` (Proofline daily agent):
  ```ts
  const systemPrompt = loadPrompt("rankingAgents/Identifier");
  const userMessage = JSON.stringify(payload, null, 2);
  const result = await runAgent({ systemPrompt, userMessage, maxTokens: 1024 });
  // result.parsed has the JSON
  ```
- Prompt loading via `loadPrompt(agentPath)` from `src/agents/service.prompt-loader.ts`. Path is relative to `src/agents/`, no extension.
- Fallback retention: keep `getFallbackMeta()` and `getFallbackMarket()` exactly as they are. They guard against parse failures and missing data — same role as before.

**Reference file:** `src/controllers/agents/feature-services/service.agent-orchestrator.ts:150-185` — closest analog (Proofline). Same pattern: load prompt → JSON.stringify payload → runAgent → read `result.parsed` → fall back on failure.

**Prior plan context:** `plans/03132026-no-ticket-ranking-llm-off-n8n/` migrated the main ranking LLM call off n8n. This spec finishes the job by killing the last ranking-pipeline n8n dependency (Identifier).

## Constraints

**Must:**
- Keep `identifyLocationMeta()` signature and return shape **identical** — `Promise<{ specialty: string; marketLocation: string }>`. No changes to consumers.
- Keep `IDENTIFIER_AGENT_WEBHOOK`, `COPY_COMPANION_WEBHOOK`, `GUARDIAN_AGENT_WEBHOOK`, `GOVERNANCE_AGENT_WEBHOOK` constants in `service.webhook-orchestrator.ts` (they're exported; keep for restoration).
- Keep all controller functions (`runGbpOptimizer`, `runGuardianGovernance`) and their downstream services. Only the route registrations get commented out.
- Use marker comment format: `// DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md`
- New prompt file in `src/agents/rankingAgents/Identifier.md` — strip n8n-specific Mustache templating (`{{ JSON.stringify($json.body) }}`) since the runner injects JSON via `userMessage`, not via prompt interpolation.

**Must not:**
- No new dependencies.
- No changes to `runAgent()` or `loadPrompt()`.
- No changes to `service.ranking-executor.ts`, `service.places-competitor-discovery.ts`, or `service.ranking-pipeline.ts` (the Identifier consumers).
- No deletion of n8n-related code (Copy Companion / Guardian / Governance services, controllers, env vars). All stays.
- No introduction of `specialtyKeywords[]`, `city`, `state`, `county`, `postalCode` into the return type yet — Path A is parity-only. Those fields are produced by the new prompt but ignored by the SDK function for now.

**Out of scope:**
- Wiring `specialtyKeywords[]` into `service.places-competitor-discovery.ts` (Path B — separate plan).
- Using city/state/postalCode for tighter geographic filtering.
- Deleting Copy Companion / Guardian / Governance code.
- Removing n8n env vars from `.env.example`.
- Restoring or migrating any other n8n agents.

## Risk

**Level:** 2

**Risks identified:**

1. **Internal callers of disabled routes.** If any cron, scheduler, or test suite POSTs to `/api/agents/gbp-optimizer-run` or `/api/agents/guardian-governance-agents-run`, commenting the route registration will break it. → **Mitigation:** Pre-execution grep for the route strings across the entire repo (backend + frontend). Checkpoint listed in T1 verify step.

2. **New prompt fields produced but ignored.** The Identifier prompt now returns `specialtyKeywords[]`, `city`, `state`, `county`, `postalCode`. Path A drops them. If a future Path B implementer assumes the return type already includes them, they'll get a surprise. → **Mitigation:** Add a one-line comment in `identifyLocationMeta()` noting "prompt also returns specialtyKeywords/city/state/county/postalCode — wire up in follow-up."

3. **Frontend `isRunning` state becomes orphaned.** Removing the run button leaves `isRunning` / `setIsRunning` and `renderProgressBar` referencing unused state. Pure code, no UX impact, but lint may warn. → **Mitigation:** Comment out the related state declarations + `renderProgressBar` reference together. TypeScript will catch any leftover references.

4. **Empty-state messaging references the disabled flow.** Line 354: `"Guardian and Governance agents haven't run yet for this month. Click 'Run Guardian & Governance' above to start."` — telling users to click a button that no longer exists is worse than no button at all. → **Mitigation:** Replace empty-state copy with neutral text like `"No agent insights available for this month yet."`

**Blast radius:**
- `agentsV2.ts` route registrations: consumed by Express router mount in `src/index.ts` (or wherever `agentsV2` is mounted under `/api/agents`). Commenting routes is local — does not affect router mount.
- `identifyLocationMeta()` consumers: only `service.ranking-executor.ts:211`. Single consumer, single call site.
- `AIDataInsightsList.tsx` button removal: only this page renders the button. No shared component.

**Pushback:** None at Level 3+. Plan is conservative and reversible.

## Tasks

### T1: Pre-execution sanity grep
**Do:** Grep for internal callers of the routes being disabled. If anything internal POSTs to `/api/agents/gbp-optimizer-run` or `/api/agents/guardian-governance-agents-run`, halt and surface them in the spec's Revision Log before commenting routes.
**Files:** Whole repo (backend + frontend).
**Depends on:** none
**Verify:** Grep for `gbp-optimizer-run` and `guardian-governance-agents-run`. Expect frontend hit at `AIDataInsightsList.tsx:106` only. Any other hit = halt.

### T2: Comment out backend routes
**Do:** Comment out lines 28 and 30 of `agentsV2.ts` with the marker. Update the JSDoc endpoint list at lines 11 + 13 to mark them disabled.
**Files:** `src/routes/agentsV2.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` clean. `curl -X POST http://localhost:PORT/api/agents/gbp-optimizer-run` returns 404.

### T3: Create Identifier prompt file
**Do:** Create `src/agents/rankingAgents/Identifier.md` containing the new prompt — system rules, output format, examples. **Strip the n8n trailing `The data to process: {{ JSON.stringify($json.body) }}` line** — the runner passes JSON via `userMessage`, not via template interpolation.
**Files:** `src/agents/rankingAgents/Identifier.md` (new)
**Depends on:** none
**Verify:** Manual: file exists, contents match the prompt the user provided minus the Mustache line.

### T4: Migrate `identifyLocationMeta()` to SDK
**Do:** Replace the axios webhook call inside `identifyLocationMeta()` with a `runAgent()` call. Imports needed: `loadPrompt` from `src/agents/service.prompt-loader`, `runAgent` from `src/agents/service.llm-runner`. Build the same payload object (`{domain, gbp_profile, storefront_address, address}`), JSON.stringify it as `userMessage`, load `rankingAgents/Identifier` as system prompt. Read `result.parsed?.specialty` and `result.parsed?.marketLocation`, fall back to `getFallbackMeta(gbpData)` on null/throw. Keep the return shape `{specialty, marketLocation}` exactly. Add the comment about future fields per Risk #2.

Remove the `IDENTIFIER_AGENT_WEBHOOK` env var read inside the function — the constant declaration at line 29-30 stays exported for restoration. The function no longer branches on whether the env var is set; it always uses the SDK now.
**Files:** `src/controllers/agents/feature-services/service.webhook-orchestrator.ts`
**Depends on:** T3
**Verify:** `npx tsc --noEmit` clean. Manual: trigger ranking-run on one test practice via `POST /api/agents/ranking-run`, check that `practice_rankings.specialty` and `practice_rankings.location` get populated with non-fallback values.

### T5: Disable Guardian/Governance UI in admin dashboard
**Do:** In `AIDataInsightsList.tsx`:
- Comment out `handleRunAgents` (lines 87-130) with the marker
- Comment out `isRunning` / `setIsRunning` state (line 45)
- Comment out the `Run Guardian & Governance` `ActionButton` block (lines 270-277)
- Comment out `renderProgressBar` function definition (lines 220-258) and its three render sites (`<AnimatePresence>{renderProgressBar()}</AnimatePresence>` at lines 349 and 371)
- Update empty-state description (line 354) to neutral copy: `"No agent insights available for this month yet."`
- Remove now-unused imports if TypeScript flags them: `Loader2`, `motion`, `AnimatePresence`, `Play` — only remove what becomes unreferenced after the comment-outs. Verify each.
**Files:** `frontend/src/pages/admin/AIDataInsightsList.tsx`
**Depends on:** none (parallelizable with T2-T4)
**Verify:** `npx tsc --noEmit` clean (or `npm run build` in `frontend/`). Manual: load `/admin/ai-data-insights` in browser — page renders, run button gone, historical cards still display, "Clear Month Data" still works.

## Done
- [ ] `npx tsc --noEmit` — zero new errors from these changes (backend)
- [ ] Frontend type-check / build clean
- [ ] T1 grep returned no unexpected internal callers (or callers were addressed in Revision Log)
- [ ] `src/agents/rankingAgents/Identifier.md` exists with the user-supplied prompt minus n8n templating
- [ ] `identifyLocationMeta()` no longer references `axios` or `IDENTIFIER_AGENT_WEBHOOK` inside the function body; uses `runAgent` + `loadPrompt`
- [ ] Routes for `gbp-optimizer-run` and `guardian-governance-agents-run` commented in `agentsV2.ts` with marker
- [ ] `AIDataInsightsList.tsx` no longer shows "Run Guardian & Governance" button; empty state copy is neutral
- [ ] Manual: trigger `POST /api/agents/ranking-run` for one test org → `practice_rankings` row gets a real `specialty` (not always "orthodontist") and a real `location`
- [ ] Manual: hitting the disabled routes returns 404
- [ ] Manual: AI Data Insights page in admin renders without errors and historical cards still navigate correctly
- [ ] No regressions in Proofline / Monthly agents / Practice Ranking flows
