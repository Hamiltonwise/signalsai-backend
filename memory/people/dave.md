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

## What Makes Him Pause (Deep Intel -- April 12, 2026)

### Code Patterns He Enforces on Main
These are the patterns his agents check for. Deviating from any of them creates cognitive load.
- `{ success: boolean }` on every JSON response (400, 500, 200 -- all of them)
- `[Tag]` prefix on every console.error, console.log, console.warn
- JSDoc purpose block at the top of every route and controller file
- `export default router` at the bottom of every route file
- Knex query builder only -- `db.raw()` acceptable inside Knex chains, never standalone SQL
- `feature-services/` and `feature-utils/` subfolder structure inside controllers
- `// =====================================================================` section dividers in large route files (tasks.ts, checkup.ts) to separate CLIENT / ADMIN / HEALTH / EXPORTS
- `error: any` typing on catch blocks
- Error handling middleware at route file tail: `router.use((error, req, res, next) => {...})`
- Validation utility functions with `ValidationResult` interface

### What Creates Cognitive Load for His Agents
- Ambiguous file purposes (no JSDoc = his agent has to guess)
- Inconsistent response shapes (some endpoints return `{ data }`, others `{ success, data }`)
- Hardcoded localhost URLs (his agents flag these as production risks)
- Large diffs with mixed concerns (pattern fixes + feature changes in same commit)

### Bandwidth Reality (April 9-12, 2026)
- DentalEMR lost ~10 demo leads from form submission bugs. Emergency fix priority.
- One Endo Go Live required DNS/SSL standby support.
- DentalEMR website content migration (video content) ongoing.
- Partner page build for Meredith still in progress.
- AAE landing page edits on his project board.
- Seven-day free trial build (he said it's "fast" to implement).
- The sandbox merge competes for his attention against all of the above.

### How His Review Process Works
1. Receives the spec doc (Migration Manifest, Google Doc format)
2. His agents intake the doc and "run" it (1+ hours for the Product Map doc)
3. He builds a visual blast radius report of what changes, adds, removes
4. He validates against his three gates (design, APIs, code consistency)
5. He executes card-by-card, running verification tests between each
6. He does NOT interpret product intent -- only validates engineering quality

### What He Said About the Operating Protocol (April 11)
- "from now one we'll have better role coherence, like a venn diagram you overlapping into engineering, and me overlapping into the vision"
- "persist this to claude md so as any engineer-communicated doc is built in this fashion"
- He is bought in. He's not resistant. He needs clean input.

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
- When in doubt about whether something will make him pause, it will. Fix it before sending.
