# Task Routing Protocol

## Decision Tree

**Step 0: Is this a Work Order?**
Read the Build Queue. If there's an active WO, execute it. If not, ask Corey what to build.

**Step 1: Who owns this?**
- Code change (frontend/backend) -> CC builds it
- Infrastructure (AWS, DNS, env vars, n8n) -> Dave's task page
- GTM (copy, positioning, outreach) -> Corey decides
- Legal/compliance -> escalate to Corey
- Financial outputs (dollar figures, projections, costs) -> verify against real data (Known 4), escalate to Corey

**Step 2: What's the blast radius?**
- Green (Auto-execute): test files, new components, agent .md files, non-auth routes
- Yellow (Route-for-awareness): DB migrations, nav changes, new API endpoints -> notify #alloro-dev
- Red (Escalate): billing, pricing, auth, client copy, data deletion -> Corey approves
- Red blast radius requires Corey approval before any code

**Step 3: Does it serve a North Star?**
- Undeniable Value: makes a client say "how did they know that?"
- Inevitable Unicorn: closes a gap in the Blueprint
- If neither: it waits.

**Step 4: Build or queue?**
- If Green + serves North Star -> build now
- If Yellow -> notify #alloro-dev, then build
- If Red -> stop, present to Corey
- If blocked by Dave -> add to Dave's task page, move to next WO

## #alloro-dev Signal Channel Rules

Only two things go to #alloro-dev:
1. CC build reports (commit hash, files changed, verification results)
2. Genuine blockers requiring infrastructure or credentials

Never DM Dave for ops tasks. All tasks go through dream_team_tasks table.
Dave receives finished specs only. Never rough ideas or half-baked proposals.
