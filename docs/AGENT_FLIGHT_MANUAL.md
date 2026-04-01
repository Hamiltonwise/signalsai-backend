# Alloro Agent Flight Operations Manual

## The Principle

SpaceX doesn't launch 33 engines untested. They fire one, then three, then nine, then all 33.
Alloro doesn't launch 50 agents at once. We prove each layer before adding the next.

## Phase 1: The Monday Chain (5 agents, Week 1)

The minimum viable agent team. This is the chain that touches the customer every week.
Prove this works flawlessly before adding anything else.

### Agents
1. Weekly Score Recalculation (Sunday 10pm ET)
2. Competitive Scout (Tuesday 6am ET)
3. Intelligence Agent (feeds Monday email content)
4. System Conductor (gates the output)
5. Monday Email (Monday 7am ET)

### Data Flow
```
Sun 10pm: Score Recalc fetches fresh Google data -> writes new score to org
Tue 6am:  Competitive Scout compares snapshots -> writes competitor.movement to behavioral_events
Mon 6am:  Intelligence Agent reads last 7 days of events -> generates 3 findings
Mon 6:45: System Conductor runs Go/No-Go:
          - Intelligence Agent: findings ready? GO/NO-GO
          - Score Recalc: score computed? GO/NO-GO
          - Competitive Scout: data fresh? GO/NO-GO
          All GO -> Monday Email assembles and sends
          Any NO-GO -> Email sends with available data, notes gap
Mon 7am:  Monday Email delivers to client
```

### Steady State Definitions
| Agent | Success | Failure |
|-------|---------|---------|
| Score Recalc | New score computed, delta calculated, history appended | Timeout, stale data, score unchanged when data changed |
| Competitive Scout | 0 false competitor matches, movement events written | Cross-specialty match, timeout, no events written |
| Intelligence Agent | 3 HIGH-confidence findings per org | <2 findings, LOW confidence finding surfaces |
| System Conductor | All gates evaluated, decision logged | Gate skipped, output released without evaluation |
| Monday Email | Delivered by 7:15am, score delta in opening line, zero unverifiable claims | Not sent, wrong data, spam folder, late delivery |

### Abort Sequences
| Failure | Response |
|---------|----------|
| Score Recalc timeout | Email sends with previous score, notes "score updating" |
| Competitive Scout timeout | Email sends without competitor note, notes gap |
| Intelligence Agent returns 0 findings | Email sends checkup-based findings as fallback |
| System Conductor failure | Email HELD. Morning Briefing flags for Corey |
| Mailgun failure | Log error, retry once, create dream_team_task for Dave |

### Testing Before Launch
- [ ] Run Score Recalc on 3 real orgs. Verify scores match expected.
- [ ] Run Competitive Scout on 3 real orgs. Verify zero cross-specialty matches.
- [ ] Run Intelligence Agent on 3 real orgs. Verify all findings are HIGH confidence.
- [ ] Run full chain in sequence. Verify Monday Email content is correct.
- [ ] Simulate Score Recalc failure. Verify email still sends.
- [ ] Simulate Competitive Scout failure. Verify email still sends.
- [ ] Simulate Intelligence Agent failure. Verify fallback works.
- [ ] Send test email to corey@getalloro.com. Verify inbox, not spam.

## Phase 2: Client Health Layer (add 3 agents, Week 2-3)

Only deploy after Phase 1 has run 2 consecutive clean Mondays.

### Add
6. Client Monitor (daily 6am ET)
7. Dreamweaver (daily 7:15am ET, after Client Monitor)
8. Morning Briefing (daily 6:30am ET)

### Why These 3
- Client Monitor scores account health (GREEN/AMBER/RED). Feeds Dreamweaver decisions.
- Dreamweaver creates hospitality moments for GREEN/AMBER accounts. Never for RED.
- Morning Briefing aggregates all overnight signals for Corey.

### New Abort Sequence
| Failure | Response |
|---------|----------|
| Client Monitor failure | All accounts treated as GREEN (no interventions). Morning Briefing flags gap. |
| Dreamweaver failure | No hospitality moment this week for affected orgs. Silent fail. |
| Morning Briefing failure | Corey checks VisionaryView dashboard instead. System degrades to pull. |

## Phase 3: Growth Engine (add 4 agents, Week 4-5)

Only deploy after Phase 2 has run 2 consecutive clean weeks.

### Add
9. Conversion Optimizer (weekly Monday 6am PT)
10. Learning Agent (weekly Sunday 9pm PT)
11. Content Performance (weekly Sunday 6pm PT)
12. CMO Agent (weekly Monday 6am PT)

### Why These 4
These form the growth feedback loop: Content Performance measures what converts ->
Learning Agent calibrates heuristics -> CMO Agent generates next week's briefs ->
Conversion Optimizer watches the funnel. Each feeds the next.

## Phase 4: Operations (add 4 agents, Week 6-7)

13. Nothing Gets Lost (daily 7am PT)
14. Bug Triage (hourly)
15. CS Agent proactive interventions (daily 7:30am PT)
16. CS Coach (weekly Sunday 8pm PT)

## Phase 5: External Intelligence (add 4 agents, Week 8-9)

17. AEO Monitor (weekly Monday 5am PT)
18. Market Signal Scout (daily 6am PT)
19. Technology Horizon (daily 6:05am PT)
20. Programmatic SEO Agent (weekly Monday 4am PT)

## Phase 6: Full Dream Team (remaining agents, Week 10+)

Only after Phases 1-5 are running cleanly. Add remaining agents in groups of 3-4,
testing each group for 1 week before adding the next.

## Model Routing (Cost Management)

### Tier 1: Fast/Cheap (claude-haiku-4-5 or equivalent)
- Morning Briefing assembly (aggregation, not analysis)
- Content Performance data pulls (SQL queries, not reasoning)
- AEO Monitor (web fetching, pattern matching)
- Client Monitor GREEN checks (routine scoring)
- Nothing Gets Lost scans (query-based, not analytical)
- Bug Triage routine checks

### Tier 2: Standard (claude-sonnet-4-6 -- current default)
- Intelligence Agent analysis
- CMO Agent content briefs
- Competitive Scout analysis
- CS Agent response suggestions
- Most agent reasoning tasks

### Tier 3: Judgment (claude-opus-4-6 -- reserved)
- System Conductor gate decisions for RED blast radius
- CFO financial projections
- CLO legal analysis
- Cross-domain conflict resolution
- ICP Simulation Engine persona evaluation

### Estimated Cost Savings
Without routing: 100% of calls at Sonnet pricing
With routing: ~50% Haiku, ~40% Sonnet, ~10% Opus = ~40-55% cost reduction

## Token Budgets Per Agent

| Agent | Budget per run | Auto-pause | Hard kill |
|-------|---------------|------------|-----------|
| Intelligence Agent | 50K tokens | 42K (85%) | 50K |
| CMO Agent | 80K tokens | 68K | 80K |
| System Conductor | 30K per gate check | 25K | 30K |
| Monday Email | 20K tokens | 17K | 20K |
| Competitive Scout | 15K tokens | 12K | 15K |
| Morning Briefing | 25K tokens | 21K | 25K |
| All others | 30K tokens | 25K | 30K |

## Circuit Breakers

Every agent has:
- MAX_ITERATIONS = 8 (forced reflection prompt at 6)
- Max consecutive failures = 3 (reassign or escalate after 3)
- Timeout: 60s for routine, 120s for analysis, 300s for complex reasoning
- Auto-pause at token budget 85%

## The Andon Cord

Any agent can halt the pipeline for its domain:
- CLO: halts ALL external communications
- Safety Agent: halts specific output
- Client Monitor RED: halts outbound to that specific org
- System Conductor: halts any single output or entire domain

Halts are logged to behavioral_events with event_type "andon.cord_pulled".
Morning Briefing surfaces all halts to Corey.

## Shared Memory Architecture

### behavioral_events (append-only, the source of truth)
- Add: `domain` column (intelligence, content, operations, client, growth, financial, personal)
- Add: `ttl_days` column (default 90, per Knowledge Graph Protocol)
- Existing: event_type, org_id, properties (JSONB), created_at

### Agent access rules
| Domain | Can read | Can write |
|--------|----------|-----------|
| Intelligence agents | intelligence, client | intelligence |
| Content agents | content, intelligence | content |
| Operations agents | ALL (read-only aggregation) | operations |
| Client agents | client, intelligence | client |
| Growth agents | ALL (read-only analysis) | growth |
| Financial agents | financial, growth | financial |
| Governance agents | ALL | governance |

### Caching
- System prompts: cached via Anthropic prompt caching (shared across all agent invocations of same type)
- Knowledge Lattice heuristics: cached in memory, refreshed daily
- Competitor data: cached per org, refreshed weekly by Competitive Scout
- Expected cache hit rate: 30-50% for agent workflows

## Success Metrics

### Per Phase
| Phase | Metric | Target |
|-------|--------|--------|
| 1 (Monday Chain) | Monday email delivered on time, correct content | 100% for 2 consecutive weeks |
| 2 (Client Health) | Health scores computed daily, zero missed orgs | 100% for 2 consecutive weeks |
| 3 (Growth Engine) | Content briefs generated, funnel measured | Weekly output for 2 consecutive weeks |
| 4 (Operations) | Orphans detected, bugs triaged, CS interventions fired | Daily execution for 2 consecutive weeks |
| 5 (External Intel) | Signals detected, AEO tracked, SEO analyzed | Weekly output for 2 consecutive weeks |

### System-Wide (after all phases)
- Agent uptime: >99% (measured by expected-vs-actual executions)
- Token cost per client per month: <$5 (target with routing)
- Time from event to action: <4 hours (for urgent signals)
- False positive rate: <2% (for client-facing findings)
- Morning Briefing delivery: 100% by 6:45am ET
- Monday Email delivery: 100% by 7:15am ET

## The Rule

No phase deploys until the previous phase has run 2 consecutive clean weeks.
"Clean" means: all steady state definitions met, zero abort sequences triggered,
zero false positives in client-facing output.

This is how you land a rocket. One engine at a time.
