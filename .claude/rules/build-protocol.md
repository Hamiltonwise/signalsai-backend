# Build Protocol

## Work Order Format (Output Before Every Build)

Work Order: [title]
Blast Radius: [Auto-execute / Route-for-awareness / Escalate]
Target: [what exists when done]
Files: [where to look]
Current state: [what it does now]
Required change: [exactly what changes]
Verification: [how to confirm it works in the browser]
Hard limits: [what not to touch]

## The IKEA Rule

One card = one feature = one commit = one verifiable step.
Every commit is a checkpoint. `git checkout [last-good-commit]` and you're back.

## File Ownership Protocol

Before starting a build, check the Build State page for any file marked "In Progress."
Do not modify any file currently marked In Progress by another terminal session.
When your build is complete, update the file status to "Ready to merge."

## Session End Protocol (Required, Every Session)

Run these checks in order and post all results to the Build State page:
https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7

1. `cd frontend && npx tsc -b --force` (frontend TypeScript clean?)
2. `npx tsc --noEmit` from repo root (backend TypeScript clean?)
3. `/simplify` (parallel quality pass, fix any flagged items)
4. `/review` (9-subagent code review, fix HIGH/CRITICAL items)
5. `curl localhost:3000/api/health` (backend responding?)
6. Test the specific endpoint built (paste the response)
7. Any migration errors from `npx knex migrate:latest`?
8. grep em-dash violations in customer-facing strings
9. grep Output Gate count across all agent files

Post format:
- PASS/FAIL per check
- Error output if any check failed
- Commit hash
- Files created/modified with one-sentence description each
- New environment variables required

Then update Known Issues: remove anything fixed, add anything new found.

## Measure Twice Standard

Before any non-trivial build:
1. Pre-mortem: what could go wrong?
2. Simulation: walk through the user flow mentally
3. Gap scan: what's missing from the spec?
4. Force multiplier check: is there a way to make this 10x more useful with minimal extra work?

## Permission Mode

Default: auto. Never use dangerously-skip-permissions in production workflows.
Auto mode uses model-based classifiers to approve safe actions while catching dangerous ones.
This replaces manual approval fatigue without removing blast radius protection.

## Self-Improvement Loop

1. Measure: what's the current state?
2. Build: execute the work order
3. Audit: verify it works
4. Ship: commit, post to Build State

Before closing any session: write architectural discoveries to auto memory.
