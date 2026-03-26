# CLAUDE.md -- Alloro

## Project

Alloro is a universal business intelligence platform. Beachhead: licensed specialists.
Every build serves one mission: give every business owner the life they set out to build.

## Repo

Path: ~/Desktop/alloro
Branch: sandbox (never touch main directly)
Frontend: frontend/ (React 18+, TypeScript, Vite, Tailwind CSS, shadcn/ui)
Backend: src/ (Node.js, Express, Knex, PostgreSQL)
Agents: .claude/agents/

## Team

- Corey (Founder/Visionary) -- builds specs, demos to prospects, approves Red blast radius
- Jo (COO/Integrator) -- maternity leave
- Dave (CTO, Philippines) -- infrastructure, EC2, merges to main, n8n wiring

## Session Start

1. `git branch --show-current && git status --short`
2. Read CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e
3. Execute the active Work Order, or ask Corey what to build.

## Standing Rules

- Never use em-dashes in any output
- Never push to main directly
- Never commit credentials
- Never modify live client site without a Work Order
- Billing activates after TTFV, not at Step 4
- Universal language in core docs. Vertical-specific only in vocabulary configs
- Dave receives finished specs only. Never rough ideas
- Every screen looks like it was built by a company with 10,000 clients
- Every session ends with verification checks posted to Build State

## Global Model Default

model: claude-sonnet-4-6

To update the entire agent team: change this one line.
Do not hardcode model strings in individual agent files.

## Key Pages

- Build Queue: https://www.notion.so/32dfdaf120c48141a798f219d02ac76d
- Build State: https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7
- CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e

## Rules (loaded automatically)

@.claude/rules/task-routing.md
@.claude/rules/agent-safety.md
@.claude/rules/alloro-context.md
@.claude/rules/build-protocol.md
