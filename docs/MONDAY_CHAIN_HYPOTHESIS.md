# Monday Chain: Complete System Map & Test Hypothesis

## The Kenji Method

Before testing, state the hypothesis clearly for each variable.
"I believe X will happen because of Y. If I see Z instead, it means my assumption was wrong."

## System Map (verified April 1, 2026)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONDAY CHAIN (Phase 1)                       │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │ Score Recalc  │────▶│  Intel Agent  │────▶│  Go/No-Go    │   │
│  │              │     │              │     │   Polling     │   │
│  │ Reads: org   │     │ Reads: events│     │              │   │
│  │ Calls: Google│     │ Calls: Claude│     │ 4 voters     │   │
│  │ Writes: org  │     │ Writes: evts │     │ parallel     │   │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘   │
│         │                    │                    │            │
│         │  ┌──────────────┐  │                    │            │
│         │  │  Comp Scout  │  │                    ▼            │
│         │  │ (ran Tuesday)│──┘             ┌──────────────┐   │
│         │  │ Read only    │               │ Monday Email  │   │
│         │  └──────────────┘               │              │   │
│         │                                 │ Assembles +  │   │
│         ▼                                 │ sends via    │   │
│  ┌──────────────┐                        │ Mailgun      │   │
│  │ Circuit      │ wraps every step       └──────────────┘   │
│  │ Breaker      │                                            │
│  └──────────────┘                                            │
│  ┌──────────────┐                                            │
│  │ Abort        │ fallback for every failure                 │
│  │ Handler      │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Verified Import/Export Chain

| From | Function | To |
|------|----------|-----|
| weeklyScoreRecalc.ts | `recalculateScore(orgId)` | mondayChain.ts line 88 |
| intelligenceAgent.ts | `runIntelligenceForOrg(orgId)` | mondayChain.ts line 178 |
| goNoGo.ts | `pollForDelivery(orgId, type)` | mondayChain.ts line 219 |
| circuitBreaker.ts | `checkCircuit(name)` | mondayChain.ts lines 76, 166 |
| abortHandler.ts | `handleAgentFailure(name, orgId, error)` | mondayChain.ts lines 111, 152, 201, 279 |
| mondayEmail.ts | `sendMondayEmailForOrg(orgId)` | mondayChain.ts line 258 |

All imports verified. All exports verified. The chain is connected.

## Database Dependencies

| Table | Used by | Verified exists |
|-------|---------|----------------|
| organizations | Score Recalc (read placeId, write score) | Yes (core table) |
| behavioral_events | Intel Agent (read), Scout (read), Chain (write trace) | Yes (migration 20260324000002) |
| organizations.current_clarity_score | Score Recalc (write) | Yes (migration 20260401000003) |
| organizations.score_history | Score Recalc (write) | Yes (migration 20260401000003) |
| organizations.checkup_data | Score Recalc (read placeId from checkup) | Yes (core field) |

## External Dependencies

| Service | Used by | Fallback if unavailable |
|---------|---------|------------------------|
| Google Places API | Score Recalc | Use previous score, note "score updating" |
| Anthropic Claude API | Intelligence Agent | Template findings from checkup data |
| Mailgun | Monday Email | Log error, create task for Dave |
| PostgreSQL | Everything | Chain cannot run. Hard failure. |
| Redis | BullMQ scheduling | Chain doesn't fire. Manual trigger only. |

## Test Hypotheses

### Test 1: Model Router
**Hypothesis:** `getModelForAgent('intelligenceAgent')` returns 'claude-sonnet-4-6' and `getModelForAgent('systemConductor')` returns 'claude-opus-4-6'.
**If wrong:** The model map is misconfigured. Fix the AGENT_MODEL_MAP.
**Verification:** Direct function call, compare output.

### Test 2: Circuit Breaker
**Hypothesis:** After 3 `recordFailure()` calls, `checkCircuit()` returns `{ allowed: false }`. After `resetCircuit()`, it returns `{ allowed: true }`.
**If wrong:** The circuit state machine has a bug. Check the threshold logic.
**Verification:** Call sequence: fail, fail, fail, check (expect blocked), reset, check (expect allowed).

### Test 3: Abort Handler
**Hypothesis:** `handleAgentFailure('score_recalc', orgId, 'timeout')` returns `{ action: 'fallback' }` with the previous score as fallback data.
**If wrong:** The per-agent fallback map is missing or the org lookup failed.
**Verification:** Direct function call with a real orgId.

### Test 4: Score Recalculation
**Hypothesis:** For the demo org (or any org with checkup_data containing a placeId), `recalculateScore(orgId)` returns a score between 0-100 with a delta from the previous score.
**If wrong:** Either the org has no placeId (checkup never ran), the Google Places API call failed, or the scoring algorithm produced NaN/undefined.
**Dependencies:** Requires Google Places API to be available.
**Verification:** Direct function call, check return shape.

### Test 5: Intelligence Agent
**Hypothesis:** `runIntelligenceForOrg(orgId)` returns 1-3 findings. Without ANTHROPIC_API_KEY, it returns template findings. With it, it returns Claude-synthesized findings.
**If wrong:** Either no behavioral_events exist for this org (cold start), the Claude call failed, or the template fallback is broken.
**Dependencies:** behavioral_events table must have data, OR checkup_data must exist on the org.
**Verification:** Direct function call, check finding count and confidence levels.

### Test 6: Go/No-Go Polling
**Hypothesis:** `pollForDelivery(orgId, 'monday_email')` returns `{ cleared: true }` when the org has a fresh score and recent findings. Returns `{ cleared: false }` when data is stale.
**If wrong:** The voter logic is too strict (requires data that doesn't exist yet) or too loose (always approves).
**Verification:** Call after Test 4 and 5 have succeeded (data should be fresh). Call with a fake orgId (data should be stale, expect NO_GO).

### Test 7: Full Monday Chain
**Hypothesis:** `runMondayChain(orgId)` returns `{ success: true, emailSent: true/false, scoreUpdated: true, findingsGenerated: 1-3, goNoGoResult: 'cleared' }` for a real org with checkup data.
**If Mailgun is not configured:** emailSent will be false but the chain still succeeds (abort handler catches the email failure).
**If wrong:** A connection between components is broken, or a dependency is missing.
**Verification:** Run full chain, check every field in the return.

### Test 8: Failure Cascade
**Hypothesis:** If Score Recalc fails, the chain continues with the previous score. The Intelligence Agent still generates findings. The Go/No-Go still runs. The email still sends (with a note about the stale score).
**If wrong:** The abort handler for score_recalc doesn't return proper fallback data, or the chain doesn't use the fallback.
**Verification:** Mock a Score Recalc failure (or run on an org with no placeId), verify the chain completes.

## Test Execution Order

Run in this exact order. Stop at the first failure. Fix before proceeding.

1. Test 1 (Model Router) -- no dependencies, pure function
2. Test 2 (Circuit Breaker) -- no dependencies, pure function
3. Test 3 (Abort Handler) -- needs a real orgId from database
4. Test 4 (Score Recalc) -- needs Google Places API
5. Test 5 (Intelligence Agent) -- needs behavioral_events OR checkup_data
6. Test 6 (Go/No-Go) -- needs results from Test 4 and 5
7. Test 7 (Full Chain) -- needs all above
8. Test 8 (Failure Cascade) -- needs a known-bad input

## What "PASS" Means

The Monday Chain PASSES when:
- A real org gets a recalculated score (delta from previous)
- 1-3 HIGH confidence findings are generated
- Go/No-Go clears (all 4 voters GO)
- The email content is assembled correctly (score delta in opening, findings in body, "You're not doing this alone" at bottom)
- If Mailgun isn't configured, the chain still succeeds with emailSent: false
- Zero unverifiable claims in any finding
- The full trace is logged to behavioral_events

## What "FAIL" Means

The Monday Chain FAILS if:
- Any component crashes without the abort handler catching it
- An unverifiable claim appears in the email content
- The Go/No-Go approves with missing data
- The circuit breaker doesn't open after 3 failures
- The email sends without the score delta opening line
- The trace is incomplete (missing steps in the log)
