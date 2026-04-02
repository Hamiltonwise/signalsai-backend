# Agent Canon Governance System -- Build Spec

## What You're Building

A governance layer for Alloro's 57 AI agents. Every agent must pass Gold Questions before it can run in production. The governance data lives in the database and is visible/editable from the admin dashboard. The scheduler enforces it at runtime.

## Why

Corey built a full agent governance system in Notion (October 2025) called "The Canon" with Registry, Playbooks, Prompt Packs, Gold Questions, Gate Packets, and Harness Packets. It was rigorous and correct. But 55 of 57 agents were coded without following it because the Notion setup was too complex. Result: 34 agents with green dots on the dashboard, 13 actually producing output, 9 dormant (running but starved of data), 5 critical agents (including Monday email and ranking) missing schedules entirely.

The Canon principles are sound. The delivery mechanism was wrong. This build moves the Canon INTO Alloro itself.

## Architecture Decision (April 2, 2026)

The Canon is simplified from 7 artifact types to 3 sections:
1. **Spec**: What the agent does, its constraints, expected behavior, owner
2. **Tests**: 20+ Gold Questions with expected answers, manually evaluated
3. **Verdict**: PASS/FAIL/PENDING, auto-expires after 90 days

It lives in the `agent_identities` table (already exists) with new columns. It renders in the Dream Team board as a "Canon" tab. The scheduler checks the verdict before running any agent.

## What Already Exists

Read these files first:
- `src/services/agents/agentIdentity.ts` -- Agent identity system with 25 AGENT_DEFINITIONS, UUIDs, scoped permissions, trust levels, audit trails, auto-quarantine. This is the foundation you're extending.
- `src/workers/processors/scheduler.processor.ts` -- The scheduler that dispatches agents. The gate check goes here (between handler lookup and run creation, around line 48).
- `src/database/migrations/20260402000001_agent_identity_system.ts` -- Existing schema for agent_identities and agent_audit_log tables.
- `src/services/agentRegistry.ts` -- 30 registered agent handlers with displayName, description, and handler functions.

Also read the memory files:
- `.claude/projects/-Users-coreys-air-Desktop-alloro/memory/project_agent_governance_canon.md` -- Full context on the original Notion Canon system
- `.claude/projects/-Users-coreys-air-Desktop-alloro/memory/project_agent_canon_in_dashboard.md` -- The architecture decision

## Build Steps (in order)

### Step 1: Migration

Create `src/database/migrations/20260402000003_agent_canon_columns.ts`

Add to `agent_identities`:
- `canon_spec` (JSONB, default `{}`) -- `{ purpose: string, expectedBehavior: string, constraints: string[], owner: string }`
- `gold_questions` (JSONB, default `[]`) -- array of `{ id: string, question: string, expectedAnswer: string, actualAnswer: string | null, passed: boolean | null, testedAt: string | null }`
- `gate_verdict` (VARCHAR 10, NOT NULL, default 'PENDING') -- CHECK IN ('PASS', 'FAIL', 'PENDING')
- `gate_date` (TIMESTAMPTZ, nullable) -- when verdict was last set
- `gate_expires` (TIMESTAMPTZ, nullable) -- gate_date + 90 days
- `agent_key` (TEXT, nullable) -- maps to schedules.agent_key for scheduler integration

### Step 2: Service Functions

Add to `src/services/agents/agentIdentity.ts`:

```typescript
checkGateStatus(agentKey: string): Promise<{ allowed: boolean; reason: string }>
```
- Query by agent_key OR slug
- If no identity row found: return allowed=true (ungoverned, backward compatible)
- If gate_verdict !== 'PASS': return allowed=false
- If gate_expires < now: auto-reset to PENDING, return allowed=false
- Otherwise: return allowed=true

```typescript
updateCanonSpec(agentId: string, spec: CanonSpec): Promise<void>
```
- Updates canon_spec, RESETS gate_verdict to PENDING

```typescript
setGoldQuestions(agentId: string, questions: GoldQuestion[]): Promise<void>
```
- Replaces gold_questions array, RESETS gate_verdict to PENDING

```typescript
recordGoldQuestionResult(agentId: string, questionId: string, actualAnswer: string, passed: boolean): Promise<void>
```
- Updates single question within the JSONB array

```typescript
setGateVerdict(agentId: string, verdict: 'PASS' | 'FAIL'): Promise<void>
```
- PASS only allowed if ALL gold questions have passed=true (validate this)
- Sets gate_date=now, gate_expires=now+90d
- Logs behavioral_event for Morning Briefing

### Step 3: Scheduler Gate Check

In `src/workers/processors/scheduler.processor.ts`, after the handler lookup (~line 48), before the run record creation:

```typescript
const gate = await checkGateStatus(schedule.agent_key);
if (!gate.allowed) {
  console.log(`[SCHEDULER] GATE BLOCKED "${schedule.agent_key}" -- ${gate.reason}`);
  const nextRunAt = computeNextRunAt(schedule);
  await ScheduleModel.updateById(schedule.id, { next_run_at: nextRunAt });
  continue;
}
```

CRITICAL: Still advance next_run_at so blocked agents don't spam the check every 60 seconds.

### Step 4: API Endpoints

Create `src/routes/admin/agentCanon.ts`:
- GET `/` -- List all agents with Canon status (for dashboard grid)
- GET `/:slug` -- Single agent full Canon detail
- PATCH `/:slug/spec` -- Update spec (resets gate to PENDING)
- PUT `/:slug/gold-questions` -- Set gold questions (resets gate)
- PATCH `/:slug/gold-questions/:qid` -- Record single question result
- POST `/:slug/verdict` -- Set verdict (validates all questions passed before allowing PASS)

Register in index.ts: `app.use("/api/admin/agent-canon", adminAgentCanonRoutes)`

### Step 5: Frontend Canon Tab

Add "Canon" tab to the Dream Team board.

Create `frontend/src/components/Admin/CanonTab.tsx`:
- Grid of agent cards grouped by agent_group
- Each card shows: name, verdict badge (green/red/yellow), expiry countdown, gold question progress
- Click to expand: spec editor, gold questions list with pass/fail toggles, verdict controls
- "Mark as PASS" button disabled unless all questions pass
- Warning banner on spec edit: "Saving will reset the gate to PENDING"

Design: match existing Dream Team patterns. Alloro coral (#D56753) accent. Rounded-xl. Same card patterns.

## Key Design Decisions

1. **Backward compatible**: Agents without Canon records still run (checkGateStatus returns allowed=true for unknown agents). Enforcement activates only after someone sets up Canon governance for an agent.

2. **Spec changes reset the gate**: If you modify what an agent does, previous test results are invalid. The agent must be re-validated.

3. **Gold Questions are manually evaluated**: No automated LLM output testing. Corey reads the output and decides if it meets the bar. This is intentional -- automated testing of LLM output gives false confidence.

4. **90-day expiry**: Forces periodic re-validation. Prevents "passed once, drifted forever."

5. **The agent_key mapping**: schedules.agent_key uses names like "proofline", agent_identities.slug uses "proofline_agent". The new agent_key column on agent_identities bridges this. checkGateStatus queries by agent_key first, slug second.

## Standing Rules

- Never use em-dashes in any output
- Minimum font size text-xs (12px), maximum weight font-semibold
- Text color #1A1D23, not #212D40
- Run `npx tsc --noEmit` (backend) + `cd frontend && npx tsc -b --force && npm run build` (frontend) + `bash scripts/preflight-check.sh` before every commit
- Branch: sandbox (never push to main)

## Verification

After building:
1. Run migration successfully
2. `GET /api/admin/agent-canon` returns all agents with PENDING verdicts
3. PATCH a spec, verify verdict resets to PENDING
4. Add gold questions, mark all as PASS, set verdict to PASS
5. Verify scheduler allows the agent to run
6. Set verdict to FAIL, verify scheduler blocks the agent
7. Check the Canon tab renders in the Dream Team board
8. All TypeScript clean, frontend builds, preflight passes
