# CLAUDE.md — Alloro Build Context

## Session Startup — Always Run First
git branch --show-current
git status --short
At session start, read the Build Queue in Notion at https://www.notion.so/32dfdaf120c48141a798f219d02ac76d and execute the ACTIVE Work Order. Type 'go' to start.

## Repo Structure
Frontend: signalsai/ — React 18+, TypeScript, Vite, Tailwind CSS, shadcn/ui
Backend: signalsai-backend/ — Node.js, Express
Do not rename these directories.

## Who This Is Built For
The person who trained for years in a craft they love, bought a business to have freedom, and discovered they had accidentally bought a second job. Every word this system generates appears in front of that person. Standard: would this make them stop and say "how did they know that?" If not, it failed.

## Quality Standard
Brand truth: Alloro sells freedom to business owners. Period.
Category: Business Clarity.
North Star 1: Undeniable Value — stops them cold.
North Star 2: Inevitable Unicorn — closes a unicorn gap or waits.

## Blast Radius Rules
- Auto-execute: low risk, narrow scope
- Route-for-awareness: notify in #alloro-dev before merging
- Escalate: billing, pricing, auth, client copy, data deletion — Corey approves
- All pre-AAE Checkup builds: Auto-execute

## Hard Limits
- Never push to main directly — always sandbox or feature branch
- Never push to production without Dave review and merge
- Never commit credentials
- Never modify live client site without a Work Order
- Every screen looks like it was built by a company with 10,000 clients

## Current P0 — AAE Deadline April 14
Free Referral Base Checkup must be live and demo-ready:
1. Entry screen — Google Places autocomplete
2. Scanning theater — named checklist + competitor map with real competitor pins
3. Score reveal — three real findings, dollar figure, blur gate
4. Email capture gate with real competitor names pre-filled
5. Result email delivered in under 60 seconds

NOTHING ELSE ships before this works end-to-end on a phone.

## Work Order Format — Output Before Every Build
Work Order: [title]
Blast Radius: [Auto-execute / Route-for-awareness / Escalate]
Target: [what exists when done]
Files: [where to look]
Current state: [what it does now]
Required change: [exactly what changes]
Verification: [how to confirm it works in the browser]
Hard limits: [what not to touch]
AAE deadline: [Yes/No]

## The IKEA Rule
One card = one feature = one commit = one verifiable step.
Every commit is a checkpoint. Every mistake has a recovery point.
git checkout [last-good-commit] and you're back. Always.

## The Test
Corey gives a doctor a link at AAE. Goes home. Tuesday morning: new account, PatientPath building, Monday brief queued. He did nothing after handing over the link. Every build decision points toward that state.
