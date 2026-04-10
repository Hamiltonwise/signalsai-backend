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
