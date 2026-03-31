# Alloro Context

## Biological-Economic Lens

Every output identifies the core human need threatened (safety, belonging, purpose, status)
and the economic consequence at 30, 90, and 365 days.
A finding without both is data. A finding with both is intelligence.

## Category

Name: Business Clarity. The built-in enemy is opacity.
Alloro sells freedom to business owners. Period.
The product standard: "How did they know that?"

## Brand Constants

- Terracotta: #D56753
- Navy: #212D40
- Every screen looks like it was built by a company with 10,000 clients

## Two North Stars

1. Undeniable Value: the customer stops and says "how did they know that?" If not, it failed.
2. Inevitable Unicorn: every build either closes a gap toward unicorn valuation or it waits.

## Prohibited

- Em-dashes (use commas or periods)
- "Accidental business owner" in any output
- Dental-specific language in core docs (use universal terms, vertical-specific only in vocabulary configs)
- Billing before TTFV (time to first value), not at Step 4

## The Execution Gate

For every agent output: does this take an action, or does it suggest one?
Actions compound. Suggestions decay.
The target ratio by month 6: 80% actions, 20% suggestions requiring human approval.

Examples:
- Action: Monday email fires a GP win-back sequence automatically. Compound.
- Suggestion: Monday email recommends calling Dr. Torres. Decays if ignored.
- Action: Proofline Agent detects GBP photo gap and queues content request. Compound.
- Suggestion: Dashboard shows "consider adding photos." Decays in 48 hours.

Every agent that currently produces suggestions must have a roadmap to convert its top 3 suggestions into autonomous actions. The System Conductor flags suggestion-only outputs for conversion review.

## Intelligence Lattices

Read both before any agent build or doctor-facing output:
- Knowledge Lattice: https://www.notion.so/282fdaf120c4802eb707cdd6faf89cc1
- Sentiment Lattice: https://www.notion.so/282fdaf120c48030bd0dfd56a12188e1
- Agent Registry: https://www.notion.so/281fdaf120c4805dac7aeda69dfa0b44

## The Test

Corey gives a doctor a link at AAE. Goes home. Tuesday morning: new account,
PatientPath building, Monday brief queued. He did nothing after handing over the link.
Every build decision points toward that state.

## Signal Bus: Handoff Failure Modes

Agent-to-agent handoff is where multi-agent systems break. Three failure patterns to guard against:

1. **Signal loss at handoff.** Agent A fires a finding, but Agent B never receives it. The behavioral_events write succeeded but the downstream agent's query window missed it, or the event_type didn't match the listener's filter. Fix: every signal write must be followed by a delivery confirmation read within 60 seconds. If the downstream agent hasn't acknowledged, retry once then escalate to System Conductor.

2. **Duplicate firing.** A signal is written twice (retry logic, race condition, cron overlap), causing the downstream agent to process the same finding twice. A client gets two Monday emails. A GP gets two outreach messages. Fix: every signal carries a unique idempotency key (event_id + org_id + event_type + date). Downstream agents deduplicate on this key before acting.

3. **Context collapse.** The signal arrives but without enough context for the receiving agent to act. Agent A writes "referral_drift_detected" but doesn't include which GP, which org, or the dollar figure. Agent B can't produce the One Action Card without this. Fix: every signal must carry the full Recipe payload (one finding, one dollar figure, one action) or be held by the Conductor until it does.

## Who This Is Built For

The person who trained for years in a craft they love, bought a business to have freedom,
and discovered they had accidentally bought a second job.
