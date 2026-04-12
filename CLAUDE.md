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

## Operating Protocol

Read `memory/context/operating-protocol.md` before any cross-team handoff.
Core principle: Corey speaks descriptive (outcomes, feelings). Dave needs prescriptive (files, line numbers, tests). AI translates between them. Corey never writes engineering specs. Dave never interprets product intent.
Team profiles with working styles: `memory/people/`

## Engineer Handoff Format (LOCKED -- Dave confirmed this works, April 11 2026)

Every document, spec, or handoff intended for Dave or any engineer MUST use this format.
No exceptions. This is the format Dave's agents consume. Deviating from it causes confusion.

Rules:
- Prescriptive, not descriptive. "Build this" not "here's the outcome we like."
- Frame changes as discrete features, not abstract goals. Each feature is a card.
- Cards sequenced simplest-first, complexity noted on every card.
- Every card has runnable verification tests (browser checks, SQL queries, Network tab).
- Done gates between every card: "All tests pass? Yes = next card. No = fix first."
- Always state whether the change touches: database, auth, billing, new API endpoint.

Card format:
```
Card [N]: [Feature Name]
Blast Radius: Green / Yellow / Red
Complexity: Low / Medium / High
Dependencies: [prior cards or "none"]

What Changes:
- [file]: [specific change]

Touches:
- Database: yes/no
- Auth: yes/no
- Billing: yes/no
- New API endpoint: yes/no

Verification Tests:
1. [Specific, runnable check]
2. [Specific, runnable check]

Done Gate:
All verification tests pass? Yes = next card. No = fix before proceeding.
```

If a doc going to engineering doesn't look like this, rewrite it before sending.

## Deployment Reality (LOCKED -- stop getting this wrong)

Sandbox EC2 auto-deploys on every push to the sandbox branch. CI/CD pipeline is working.
There is NO Dave dependency for sandbox. If code is pushed, it is deployed.
If something is not working on sandbox, it is a code problem -- fix it directly.
Never say "blocked by EC2" or "blocked by Dave" for sandbox work. That is false.

## Session Start

1. Read `CURRENT-SPRINT.md` -- this is the GPS. It tells you where you are, what's verified, and what the next waypoint is. Do not skip this. Do not re-plan from scratch.
2. `git branch --show-current && git status --short`
3. Read `docs/PRODUCT-OPERATIONS.md` -- check which Knowns are PASS/FAIL/UNTESTED
4. Update `CURRENT-SPRINT.md` Current Position if anything is stale
5. Execute the next waypoint, or fix failing tests if any exist

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

## Before Presenting Work to Corey (Pre-Presentation Gate)

Run this filter before showing any work product. If any item is NO, fix it or flag it explicitly.

1. Did I verify this beyond grep/code? (If no: state "Yellow -- code-verified only, not browser-verified")
2. Can I describe what the customer sees on every affected page? (If no: don't present as done)
3. Did I run the relevant Known tests from the Constitution? (If no: run them now)
4. Would Corey's first reaction be a correction or a decision? (If correction: I'm not done yet)
5. Update CURRENT-SPRINT.md with results before presenting.

The goal: Corey validates feel and vision. Claude catches everything else first.

## Product Hierarchy (LOCKED -- Corey has corrected this multiple times)

The app/dashboard is the product. The Monday email is a notification layer.
The email is a support piece: a weekly reminder that Alloro is working.
The email highlights the most surprising change and links to the dashboard.
The three instruments are the product. The email is a pointer, not the whole story.
Build features app-first. Email is additive.
Never say "the email is the product." That is stale and wrong.

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
