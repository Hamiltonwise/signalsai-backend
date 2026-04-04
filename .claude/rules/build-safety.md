# Build Safety Protocol

## Work Order Format (Before Every Build)

Work Order: [title]
Blast Radius: [Green / Yellow / Red]
Target: [what exists when done]
Files: [what to touch]
Current state: [what it does now]
Required change: [what changes]
Verification: [how to confirm in the browser]

## Blast Radius

| Level | Examples | Action |
|-------|---------|--------|
| Green | New component, test file, CSS change | Build it |
| Yellow | DB migration, new API route, nav change | Notify #alloro-dev, then build |
| Red | Billing, auth, pricing, client copy, data deletion | Stop. Corey approves. |

## Three-Response Protocol

1. **Orientation:** State what you're building. Identify blast radius. List files. If Red: stop.
2. **Execution:** Build. One commit per feature. TypeScript clean before committing.
3. **Verification:** Test the endpoint. Check what the customer sees. Post results.

## The IKEA Rule

One feature = one commit = one checkpoint. `git checkout [last-good-commit]` and you're back.

## Reviewer Protocol

Claude builds. Claude verifies (tsc, endpoint test). Claude does NOT approve merges.
Dave reviews and merges to main.

## Task Routing Quick Reference

- Code (frontend/backend): Claude builds it
- Infrastructure (AWS, DNS, env vars, n8n): Dave's task page
- GTM (copy, positioning): Corey decides
- Red blast radius: Corey approves before any code

## #alloro-dev Channel

Only two things:
1. Build reports (commit hash, files changed, verification results)
2. Genuine blockers requiring infrastructure

Never DM Dave. All tasks through dream_team_tasks table.
Dave receives finished specs only. Never rough ideas.
