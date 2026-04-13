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

## Session Discipline (LOCKED -- April 13 diagnosis)

Read `memory/context/session-contract.md` at session start.

Every session is THINKING or BUILD. Not both.
- THINKING: Corey explores problems. Output = locked decisions. No code.
- BUILD: Starts with locked decisions. Build, verify, produce Dave-ready card.

The explore-build blur is the #1 time waster. Corey spent 1000+ hours because
sessions jumped from "describe intent" to "build code" without locking decisions.
Dave then received multiple experimental versions and couldn't tell which was decided.

Before ideation: brief constraints (Dave's patterns, Knowns, vocabulary, blast radius).
Before code: answer the 5 decision lock questions in the session contract.
Before commit: run all 4 sweep scripts.
Before handoff: run the pre-handoff quality gate.

## Session Start

1. Declare session type: THINKING or BUILD
2. Read `CURRENT-SPRINT.md` -- this is the GPS.
3. `git branch --show-current && git status --short`
4. Read `docs/PRODUCT-OPERATIONS.md` -- check which Knowns are PASS/FAIL/UNTESTED
5. If BUILD: read `memory/context/session-contract.md` for quality gates
6. Execute the next waypoint, or fix failing tests if any exist

## Before Every Build

Write a Customer Reality Check in the conversation:
- What the customer sees now
- What they should see after
- What could go wrong
- What you're confident about, what you're not

## Before Every Commit

The pre-commit hook (.git/hooks/pre-commit) runs automatically on `git commit`:

Hard gates (block on failure -- these pass clean, any failure is a new regression):
1. data-flow-audit.sh -- logic bugs, wrong data consumed
2. content-quality-lint.sh -- placeholders, zero defaults, dollar figures
3. TypeScript type check (`tsc -b --force`)

Advisory gates (warn, don't block -- known pre-existing issues, promote to hard once clean):
4. constitution-check.sh -- 3 known pre-existing failures
5. vertical-sweep.sh -- 108 known dental terms awaiting useVocab() migration

If a hard gate fails, the commit is blocked. Fix the error, then commit again.

Manual checks the hook can't do:
4. `npm run build` in frontend/ (zero errors)
5. Check the map: describe what each affected page shows. If you can't describe it with certainty, don't commit.

## Quality Scripts (run before every handoff to Dave)

Four automated quality gates. All must pass before Dave sees any work.

| Script | What it catches | Run time |
|--------|----------------|----------|
| `scripts/constitution-check.sh` | Known violations (K2-K15), position claims, fabricated data | <5s |
| `scripts/vertical-sweep.sh --customer-only` | Dental-specific language in customer-facing code | <5s |
| `scripts/data-flow-audit.sh` | Logic bugs: location context, competitor selection, queryKey scoping | <5s |
| `scripts/content-quality-lint.sh` | Content quality: placeholders, empty states, dollar figures, design system | <5s |

If any script fails, fix the issue before committing. These scripts exist because
every bug they catch was a real bug found on April 12-13 that would have reached
a customer or caused Dave to pause.

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

## AI Content Safety (LOCKED -- April 13, Dave + Corey agreed)

Never show AI-generated recommendations to customers without human review.
Show DATA (reviews, ratings, competitor names, GBP completeness). Hide ADVICE.

Why: On April 13, the AI recommended "add a patient testimonial video showing
your consultation process from intake to quote." That's a HIPAA violation.
Dave said: "we don't trust AI so much... it doesn't know what's going to be right."

Before any AI-generated text reaches a customer, check:
1. Could this be a HIPAA violation?
2. Could this be factually wrong? (wrong competitor, wrong review count)
3. Is this a recommendation or a fact? (show facts, hide recommendations)
4. Would a doctor who knows their market see through this?

## Standing Rules

- Never push to main directly
- Never commit credentials
- No em-dashes in any output
- No text-[10px] or text-[11px]. Min font: text-xs (12px)
- No font-black or font-extrabold. Max weight: font-semibold
- No #212D40 for text. Use #1A1D23
- No fabricated content
- No AI-generated recommendations in customer-facing output without human review
- One feature = one commit = one verifiable step

## Global Model Default

model: claude-sonnet-4-6

## Key Pages

- Build Queue: https://www.notion.so/32dfdaf120c48141a798f219d02ac76d
- Build State: https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7

## Rules (loaded automatically)

@.claude/rules/task-routing.md
@.claude/rules/build-safety.md
