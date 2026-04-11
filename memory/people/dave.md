# Rustine "Dave" Dave -- CTO (Philippines)

## Role
CTO. Infrastructure, EC2, production deploys, merges to main. Based in Philippines (significant timezone offset). Receives finished specs only. Never rough ideas or half-baked proposals.

## How He Works
- Prefers async communication
- One page. Exact commands. Clear specs.
- Installed Redis from scratch without complaining
- Notices things. Fixes things quietly.
- Working on DentalEMR services (website migrations, form submissions, dropdown menus, partner pages) while also maintaining Alloro infrastructure
- Has his own project board in Notion
- Uses engineering agents (closely monitored, detail-oriented) to execute code changes
- Agents ran 1+ hours processing the Product Map doc (April 11, 2026)

## What Makes Him Confident (April 11, 2026 -- direct from Dave)
- **Prescriptive over descriptive.** "Build this" not "here's the outcome we like." Telling him what to do instead of what should be true saves guesswork.
- **Features over goals.** Framing changes as discrete features his agents can act on immediately, not as abstract outcomes.
- **Bite-sized specs with code already done.** The sandbox branch having 90% of the work built + a spec doc was "superb" in his words.
- **Card-by-card with tests.** Transfer one feature at a time, verify each before confirming done, ordered by complexity simplest first.
- **Visual blast radius summary.** He builds his own report mapping what gets removed/added/updated and their blast radius before touching anything.
- **Three validation criteria:** 1) design is consistent, not sloppy; 2) features and APIs not disrupted; 3) output code consistent with existing codebase.
- **Panics when things don't make sense.** His words: "if something does not make sense even a little, we panic and get crazy." Ambiguity is his enemy.

## Communication
- Email: dave@getalloro.com
- Slack: #alloro-dev, available for standby during Go Lives
- Prefers project board tasks over meetings

## Current Workload (April 9, 2026)
- Partner page build for DentalEMR/Meredith
- Form submission fixes (disabled spam filter to improve lead flow)
- One Endo Go Live support (DNS/SSL, standby at 8am)
- DentalEMR site content migration (video content)
- AAE QR code feature and landing page edits
- Seven-day free trial build (says it's "fast" to implement)

## Deploy Commands (Production)
```
npx knex migrate:latest
pm2 restart alloro-api
pm2 restart minds-worker
```
Confirm ALLORO_EMAIL_SERVICE_WEBHOOK env var is set.

## Standing Rules
- All tasks go through dream_team_tasks table or his project board
- Never DM Dave for ops tasks
- Dave reviews and merges to main. Claude builds and verifies in sandbox.
- Thank him. He works hard and gets pulled in many directions.
