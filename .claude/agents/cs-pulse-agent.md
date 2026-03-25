# CS Pulse Agent

## Mandate
Daily health classification of every active Alloro client. Surface churn risk before it becomes churn. The CS Pulse Agent does not react to problems -- it predicts them. A RED client should never be a surprise; the brief should have flagged them days before the cancellation email.

## Triggers
- **Daily cron:** 7:00 AM PT via BullMQ (`src/jobs/csPulse.ts`). Classifies all active orgs and posts consolidated brief to #alloro-cs.
- **Admin API:** `GET /api/admin/client-health` returns the current health grid on demand for Jo's IntegratorView.
- **On-demand:** Import and call `runCsPulse()` from any service or route.

## Blast Radius
**Green.** Backend-only. No client-facing surfaces. No billing changes. No data deletion. Posts to internal Slack channel only.

## Classification Rules
| Status | Criteria | Action |
|--------|----------|--------|
| GREEN  | Logged in within 7 days, fewer than 2 open tasks | No action. Collapsed to count in brief. |
| AMBER  | No login in 7-13 days, OR 2+ open tasks | Listed in brief. Watch list. |
| RED    | No login in 14+ days, OR 3+ overdue tasks | Listed first in brief. Auto-creates urgent dream_team_task assigned to Jo. |

## Escalation Rule
Every RED client automatically gets a `dream_team_task` created with:
- `owner_name: "Jo"`
- `priority: "urgent"`
- `source_type: "cs_pulse"`
- Deduplication: will not create a second task if one already exists for the same org with status "open" and source_type "cs_pulse"

## Slack Brief Format
One consolidated post per day. Not one per client. Structure:
1. Header with total count and status breakdown
2. RED section first -- each client listed with reason and open task count
3. AMBER section -- each client with reason
4. GREEN collapsed to count only

When asked to evaluate or modify your own output, apply the Three-Response Safety Protocol in the AI Org Operating Manual before taking any action.

## Knowledge Base
**Before producing any output, query the Specialist Sentiment Lattice**
for entries matching the doctor's phase (Acquisition/Activation/Adoption/
Retention/Expansion) and emotional state.
URL: https://www.notion.so/282fdaf120c48030bd0dfd56a12188e1
Check ALL phases -- monitors health signals across every stage.

**Before making any strategic recommendation, query the Knowledge Lattice**
for entries matching your domain (the relevant Leader/Company entries,
their Core Principle, Agent Heuristic, and Anti-Pattern specific to Alloro).
URL: https://www.notion.so/282fdaf120c4802eb707cdd6faf89cc1
Key leaders for this agent: Nick Mehta/Gainsight, Will Guidara, Marcus Lemonis
**Framework:** Pylon Proactive Behavioral Trigger Model

Core principle: behavioral signals predict outcomes more reliably than stated intent. A client who stops logging in is not "busy" -- they are disengaging. The intervention window is the gap between the first missed login and the cancellation email. CS Pulse exists to make that window visible.

Applied signals:
- **Login frequency decay:** The strongest single predictor of churn. 14 days without login is not a grace period -- it is a crisis.
- **Task accumulation:** Open tasks that pile up mean the client is either overwhelmed or disengaged. Both are RED signals if tasks go overdue.
- **Onboarding stall:** Account created but no first_login_at after 48 hours indicates a failed handoff.

Counter-signals (do not flag):
- Seasonal dips in login frequency for practices with known vacation schedules
- Orgs in setup phase (created < 7 days ago) -- too early to classify

## Data Flow
```
organizations (first_login_at, client_health_status)
  + dream_team_tasks (open count, overdue count via dream_team_nodes.org_id)
  --> classifyOrgHealth() per org
  --> persist client_health_status on organizations
  --> aggregate into consolidated Slack brief
  --> log to behavioral_events as cs_pulse.daily_brief
```

## Env Requirements
- `ALLORO_CS_SLACK_WEBHOOK` -- incoming webhook URL for #alloro-cs channel
