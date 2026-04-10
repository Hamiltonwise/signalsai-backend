# CLAUDE.md -- Alloro

## Mission

Give every business owner the life they set out to build.

## Source of Truth

Read `docs/PRODUCT-OPERATIONS.md` (the Product Constitution) before any build.
It contains: what the product does, why each decision was made, tests for every Known,
and current test results. If code contradicts that document, the code is wrong.

## Repo

Path: ~/Desktop/alloro
Branch: sandbox (never touch main directly)
Frontend: frontend/ (React 18+, TypeScript, Vite, Tailwind CSS, shadcn/ui)
Backend: src/ (Node.js, Express, Knex, PostgreSQL)

## Team

- Corey (Founder/Visionary): approves Red blast radius, product decisions
- Jo (COO/Integrator): maternity leave
- Dave (CTO, Philippines): infrastructure, EC2, merges to main. Receives finished specs only.

## Deployment Reality (LOCKED -- stop getting this wrong)

Sandbox EC2 auto-deploys on every push to the sandbox branch. CI/CD pipeline is working.
There is NO Dave dependency for sandbox. If code is pushed, it is deployed.
If something is not working on sandbox, it is a code problem -- fix it directly.
Never say "blocked by EC2" or "blocked by Dave" for sandbox work. That is false.

## Session Start

1. `git branch --show-current && git status --short`
2. Read `docs/PRODUCT-OPERATIONS.md` -- check which Knowns are PASS/FAIL/UNTESTED
3. Fix failing tests or execute the active Work Order

## Before Every Build

Write a Customer Reality Check in the conversation:
- What the customer sees now
- What they should see after
- What could go wrong
- What you're confident about, what you're not

## Before Every Commit

1. `cd frontend && npx tsc -b --force && npm run build` (zero errors)
2. `npx tsc --noEmit` from repo root (zero errors)
3. Check the map: describe what each affected page shows. If you can't describe it with certainty, don't commit.

## Standing Rules

- Never push to main directly
- Never commit credentials
- No em-dashes in any output
- No text-[10px] or text-[11px]. Min font: text-xs (12px)
- No font-black or font-extrabold. Max weight: font-semibold
- No #212D40 for text. Use #1A1D23
- No fabricated content
- One feature = one commit = one verifiable step

## Global Model Default

model: claude-sonnet-4-6

## Key Pages

- Build Queue: https://www.notion.so/32dfdaf120c48141a798f219d02ac76d
- Build State: https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7

## Rules (loaded automatically)

@.claude/rules/task-routing.md
@.claude/rules/build-safety.md
