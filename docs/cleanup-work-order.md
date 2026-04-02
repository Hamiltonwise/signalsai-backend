# Cleanup Work Order -- Clean Station, Sharp Knives

**Created:** April 2, 2026
**Context:** Deep dive found infrastructure that's built but not wired, naming mismatches that made the Morning Briefing deaf, ungated content agents, and missing safety rails. This document is the work order.

**Principle:** "Work clean, stay clean, clean as I go." -- Hiro

---

## COMPLETED (this session)

- [x] Morning Briefing event naming mismatches (19 phantom consumers fixed)
- [x] Security: bootstrap route auth + hardcoded passwords removed
- [x] Security: demo login blocked in production
- [x] Security: support route rate limited
- [x] SQL: checkupFunnel MySQL syntax fixed to PostgreSQL
- [x] Cleanup: 4 duplicate files with spaces in names deleted
- [x] Agent identity system built (schema + API + service)

---

## PRIORITY 1: Wire the Safety Stack (architectural)

### WO-CLEAN-1: Wire identity + model router into scheduler
**File:** `src/workers/processors/scheduler.processor.ts`
**What:** Before executing any agent handler, call `startRun()` from agentIdentity to get UUID + run ID, check quarantine status, and call `getModelForAgent()` to get the correct model tier. After execution, call `endRun()`.
**Why:** Currently every agent runs without identity tracking, scope enforcement, or model routing. The scheduler is the single chokepoint.
**Blast radius:** Yellow (touches the execution path for all scheduled agents)
**Depends on:** Running the agent_identities migration first

### WO-CLEAN-2: Lift circuit breaker from Monday Chain to scheduler level
**File:** `src/workers/processors/scheduler.processor.ts`
**What:** Before executing any handler, call `checkCircuit(agentKey)`. On failure, call `recordFailure()`. On success, call `recordSuccess()`. Currently only mondayChain uses circuit breakers.
**Why:** If any agent enters a failure loop, the circuit breaker stops it after 3 consecutive failures instead of retrying forever.
**Blast radius:** Yellow

### WO-CLEAN-3: Gate the CMO Agent
**File:** `src/services/agents/cmoAgent.ts`
**What:** Before writing to `published_content` or calling HeyGen, route the output through `conductorGate()` from systemConductor.ts. The CMO's authority domain is "Content briefs, topic recommendations" not publishing.
**Why:** Currently the CMO can publish LinkedIn posts and trigger paid HeyGen videos on its weekly run with no human approval.
**Blast radius:** Yellow

---

## PRIORITY 2: Signal Bus Health

### WO-CLEAN-4: Add idempotency key to behavioral_events
**Migration:** Add a computed unique index on `(event_type, org_id, DATE(created_at))` or a dedicated `idempotency_key` column.
**Why:** Documented requirement in alloro-context.md. Currently duplicates can be written on retries or cron overlap.
**Blast radius:** Yellow (migration on high-traffic table)

### WO-CLEAN-5: Audit and fix all 34 dead signals
**What:** For each dead signal type, decide: (a) add a consumer, (b) stop producing it, or (c) mark it as audit-only. Key ones:
- `client_monitor.amber_nudge` (20 rows) -- should trigger CS Agent follow-up
- `marketing.page_view` (1,460 rows) -- should feed conversion analytics
- `result_email.sent` (13 rows) -- should feed email deliverability tracking
**Blast radius:** Green per signal

### WO-CLEAN-6: Add delivery confirmation to signal writes
**What:** After every behavioral_events insert, read-back within 60s to confirm persistence. Log to a health metric if confirmation fails.
**Why:** Documented in alloro-context.md as required. Currently not implemented.
**Blast radius:** Green

---

## PRIORITY 3: Activate Idle Agents (SpaceX style)

### WO-CLEAN-7: Register 7 scheduled agents
Add to `agentRegistry.ts`:
1. `programmatic_seo` -> `programmaticSEOAgent.ts` (Weekly Mon 4AM PT)
2. `ghost_writer` -> `ghostWriter.ts` (Daily 8AM PT)
3. `clo_agent` -> `cloAgent.ts` (Weekly Tue 6AM PT)
4. `cpa_personal` -> `cpaPersonal.ts` (Monthly)
5. `financial_advisor` -> `financialAdvisor.ts` (Monthly)
6. `partnerships` -> `partnershipsAgent.ts` (Monthly)
7. `state_of_clarity` -> `stateOfClarity.ts` (Quarterly)

**Activate one at a time. 2 clean weeks per agent before activating the next. SpaceX principle.**

### WO-CLEAN-8: Add rate limiting to on-demand Claude agents
**Files:** websiteCopyAgent.ts, scriptWriter.ts, guestResearch.ts, bookOutline.ts, prPitch.ts, conferenceIntelligence.ts, icpSimulation.ts
**What:** Wrap Anthropic API calls with a rate limiter (max N calls per hour). These agents bypass the scheduler/orchestrator so they have no protection against runaway API usage.
**Blast radius:** Green

---

## PRIORITY 4: Model Cost Optimization

### WO-CLEAN-9: Wire model router into agents
**What:** Replace hardcoded `model: "claude-sonnet-4-6"` in all 14 Claude-calling agents with `getModelForAgent(agentName)`.
**Impact:** 11 agents move to Haiku (40-60% cheaper per call). 5 agents move to Opus (better judgment). Estimated 40-55% cost reduction.
**Files:** All files in src/services/agents/ that import Anthropic
**Blast radius:** Green (each agent is independent)

---

## PRIORITY 5: Strengthen Agent Runtime

### WO-CLEAN-10: Migrate all agents to use agentRuntime
**What:** Ensure every agent calls `prepareAgentContext()` before acting, `recordAgentAction()` for every action, and `closeLoop()` on completion. Currently only clientMonitor, competitiveScout, and intelligenceAgent use the runtime.
**Why:** Agents that bypass the runtime don't get conflict checking, orchestrator approval, or the System Conductor gate.
**Blast radius:** Yellow (per agent, incremental migration)

---

## Notes

- All file paths are relative to repo root
- "Blast radius" follows the Green/Yellow/Red protocol from CLAUDE.md
- Dependencies are noted. Do not skip order.
- Run `npx ts-node scripts/product-quality-scan.ts` after each change
- Run `npx ts-node scripts/customer-experience-sim.ts` after any customer-facing change
