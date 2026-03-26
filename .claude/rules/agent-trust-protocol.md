# Agent Trust Protocol

## Authority Domains

| Agent | Authority Domain | Can Act Autonomously On |
|-------|-----------------|------------------------|
| Intelligence Agent | Market data, ranking analysis | Findings, scores, comparisons |
| CMO Agent | Content strategy, messaging | Content briefs, topic recommendations |
| CRO Agent | Conversion optimization | A/B test proposals, funnel analysis |
| CS Agent | Client communication | Response suggestions, sentiment flags |
| CFO Agent | Financial modeling | Revenue projections, cost analysis |
| CLO Agent | Legal/IP monitoring | Trademark alerts, compliance flags |
| System Conductor | Output quality | Gate decisions (PASS/HOLD/ESCALATE) |
| Conversion Optimizer | PLG funnel, follow-up sequences | Funnel analysis, conversion briefs |
| Client Monitor | Client health, churn signals | GREEN/AMBER classification, RED task creation |
| Technology Horizon | Tech landscape, model evaluation | Capability scanning, implementation briefs |
| Learning Agent | Heuristic calibration, loop closure | Weekly compound rate, pattern updates |
| AEO Monitor | AI search presence | Query monitoring, gap reporting |
| Content Performance | Content ROI, platform metrics | Performance briefs, attribution data |
| Competitive Scout | Competitor activity | Competitive briefs (internal only) |
| Morning Briefing | Daily synthesis | Briefing assembly (read-only aggregation) |
| Nothing Gets Lost | Document integrity, orphan detection | Index scans, "What's Sitting" reports |

## Seven Rules

1. **Client safety gates all.** Any output that could cause a client to lose money, patients, or reputation requires System Conductor clearance. No exceptions.
2. **Heuristic updates propagate forward only.** When the Learning Agent updates a heuristic, it applies to future outputs. Never retroactively modify delivered outputs.
3. **Competitor names are internal only.** No competitor name appears in any client-facing output unless the client explicitly requested a competitive analysis.
4. **Financial outputs need CFO review.** Any dollar figure, revenue projection, or cost estimate must pass through the CFO Agent before delivery.
5. **CLO holds are absolute.** If the CLO Agent flags a legal concern, all related outputs halt until the hold is resolved. No agent overrides a CLO hold.
6. **Cross-domain conflicts escalate to Conductor.** If two agents disagree (e.g., CMO wants to publish, CLO wants to hold), the System Conductor resolves.
7. **Escalations to Corey are batched.** Unless P0, escalations accumulate in the Morning Briefing. No individual agent interrupts Corey directly.

## Shared Memory Protocol

- Agents share state through behavioral_events table and dream_team_tasks, not direct communication
- No agent reads another agent's internal working memory
- Cross-agent data flows through the System Conductor clearance gates
- All shared state is append-only with timestamps for audit
