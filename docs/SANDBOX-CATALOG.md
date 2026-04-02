# Sandbox Catalog -- Every Page, Feature, Agent, Data Connection

Status key:
- READY = works on sandbox, pure code, no infrastructure needed
- PARTIAL = works but has known issues or missing data connections
- BLOCKED = needs migration, env var, or Dave infrastructure
- INTERNAL = admin/team only, not customer-facing

Priority key:
- P1 = customers see this every visit
- P2 = customers see this sometimes
- P3 = internal or rarely used

---

## FRONTEND PAGES

### Customer-Facing (P1)

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Homepage | / | READY | Complete rewrite. Identity-first, Foundation prominent. Pure code. |
| Checkup Entry | /checkup | READY | Warm design, question field removed, trust signals. Needs GOOGLE_PLACES_API. |
| Checkup Scanning | /checkup/scanning | READY | Specialty vocabulary, "Great experience" removed. Pure frontend. |
| Checkup Results | /checkup/results | READY | 2 findings free, blur gate reframed, Oz moments. Needs checkup API. |
| Checkup Building | /checkup/building | READY | Honest confirmation, real score display. Pure frontend. |
| Sign In | /signin | READY | Warm gradient, terracotta inputs. Pure code. |
| Sign Up | /signup | READY | Standard auth flow. Pure code. |
| Thank You | /thank-you | READY | Booth conditional on conference mode. Pure code. |
| Doctor Dashboard | /dashboard | PARTIAL | Warm design, narrative greeting, position card. Needs ranking data to populate. |
| Dashboard Rankings | /dashboard/rankings | PARTIAL | Shows ranking history. Needs practice_rankings table populated. |
| Dashboard Reviews | /dashboard/reviews | PARTIAL | Review request card. Needs GBP connection for real data. |
| Dashboard Website | /dashboard/website | PARTIAL | NL editor, Make It Yours. Needs website_builder tables. |
| Dashboard Referrals | /dashboard/referrals | PARTIAL | Referral tracking. Needs referral_sources table. |
| Settings | /settings | READY | Profile, preferences, billing link. Pure code. |
| Settings Billing | /settings/billing | BLOCKED | Stripe portal. Needs STRIPE_SECRET_KEY. |
| Settings Integrations | /settings/integrations | PARTIAL | GBP connect flow. Needs GOOGLE_CLIENT_ID/SECRET. |
| Password Reset | /reset-password | READY | Pure auth flow. |
| Forgot Password | /forgot-password | READY | Pure auth flow. |

### Marketing Pages (P2)

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| About | /about | READY | Pure content. |
| Pricing | /pricing | READY | Shows Growth/Full tiers. Pure code. |
| Foundation | /foundation | READY | Heroes & Founders. Pure content. |
| Case Studies | /case-studies | READY | Dynamic from DB. |
| Blog | /blog | READY | Content pages. |
| Contact | /contact | READY | Support inquiry form. |
| Privacy Policy | /privacy | READY | Legal content. |
| Terms of Service | /terms | READY | Legal content. |

### Content Pages (P3)

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| 8 specialty pages | /for/endodontists etc. | READY | Routed in App.tsx. |
| 13 additional specialty pages | various | NOT ROUTED | Files exist but no route in App.tsx. Bundle bloat. |

### Admin Pages (INTERNAL)

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| VisionaryView | /admin/visionary | READY | Corey's dashboard. Warm design. |
| IntegratorView | /admin/integrator | READY | Jo's dashboard. Status boards. |
| Revenue Dashboard | /admin/revenue | PARTIAL | Needs real billing data from Stripe. |
| Organization Detail | /admin/organizations/:id | PARTIAL | Deep org view. Large, some data paths may 500. |
| Dream Team | /admin/dream-team | BLOCKED | Needs dream_team_nodes table + agent_identities. |
| Agent Canon | /admin/agent-canon | BLOCKED | Needs agent_canon tables (Apr 2 migration). |
| Mission Control | /admin/mission-control | BLOCKED | Needs agent_schedules, multiple new tables. |
| User Management | /admin/users | READY | CRUD for users. Standard DB tables. |
| Behavioral Events | /admin/behavioral-events | PARTIAL | Needs behavioral_events table (exists on sandbox). |
| AAE Dashboard | /admin/aae | READY | Conference war room. |
| Case Study Editor | /admin/case-studies | READY | CRUD for case studies. |
| Feature Flags | /admin/feature-flags | PARTIAL | Needs feature_flags table. |
| Analytics | /admin/analytics | BLOCKED | Needs GA4/GSC tokens per org. |
| Changelog | /admin/changelog | PARTIAL | Needs GITHUB_TOKEN for commit history. |

---

## BACKEND API ROUTES

### Public (No Auth)

| Endpoint | Status | Dependencies |
|----------|--------|-------------|
| GET /api/health | READY | DB connection only |
| GET /api/health/db | READY | DB connection only |
| GET /api/health/detailed | PARTIAL | Checks Redis (optional) |
| POST /api/checkup/analyze | READY | GOOGLE_PLACES_API, ANTHROPIC_API_KEY |
| GET /api/checkup/geo | READY | IP geolocation (no external API) |
| GET /api/places/autocomplete | READY | GOOGLE_PLACES_API |
| GET /api/places/:placeId | READY | GOOGLE_PLACES_API |
| POST /api/auth/login | READY | DB only |
| POST /api/auth/register | READY | DB only |
| POST /api/auth/forgot-password | READY | Mailgun (optional, logs if missing) |
| POST /api/websites/contact | READY | website_builder schema |
| GET /api/clarity-card/:id | READY | DB only |

### Authenticated User Routes

| Endpoint | Status | Dependencies |
|----------|--------|-------------|
| GET /api/user/dashboard-context | READY | DB (practice_rankings, organizations) |
| GET /api/user/one-action-card | READY | DB only |
| GET /api/user/streaks | READY | DB (behavioral_events) |
| GET /api/user/activity | READY | DB (behavioral_events) |
| POST /api/user/help | READY | DB (dream_team_tasks -- has hasTable check) |
| POST /api/user/help/signal | READY | DB (behavioral_events -- has create check) |
| GET /api/user/review-drafts | PARTIAL | Needs GBP data for real reviews |
| GET /api/user/website | PARTIAL | website_builder schema |
| POST /api/user/website/pages/:id/natural-edit | PARTIAL | ANTHROPIC_API_KEY + website_builder |
| GET /api/user/export | READY | DB only |
| GET /api/user/preferences | READY | DB only |
| POST /api/cs-agent/chat | BLOCKED | ANTHROPIC_API_KEY + org context |
| GET /api/billing/status | BLOCKED | STRIPE_SECRET_KEY |
| POST /api/billing/checkout | BLOCKED | STRIPE_SECRET_KEY + price IDs |
| GET /api/gbp | PARTIAL | Needs GBP OAuth tokens |
| GET /api/practice-ranking/latest | READY | DB (practice_rankings) |
| POST /api/practice-ranking/trigger | PARTIAL | GOOGLE_PLACES_API + worker queue |

### Admin Routes

| Endpoint | Status | Dependencies |
|----------|--------|-------------|
| POST /api/admin/ceo-chat | READY | ANTHROPIC_API_KEY (graceful fallback) |
| GET /api/admin/tasks | READY | DB (dream_team_tasks -- has fallback) |
| PATCH /api/admin/tasks/:id | READY | DB |
| POST /api/admin/flag-issue | READY | DB |
| GET /api/admin/behavioral-events | PARTIAL | behavioral_events table |
| GET /api/admin/organizations | READY | DB |
| POST /api/admin/blue-tape | READY | DB |
| GET /api/admin/dream-team | BLOCKED | dream_team_nodes, agent_identities |
| GET /api/admin/agent-canon | BLOCKED | agent_canon tables |
| POST /api/admin/agent/run | BLOCKED | Redis + BullMQ + worker |
| GET /api/admin/intelligence | BLOCKED | Multiple new tables |
| POST /api/admin/users/send-invite | PARTIAL | N8N webhook (optional) |

---

## AI AGENTS

### Active (Running in Worker)

| Agent | Schedule | What It Does | Infrastructure |
|-------|----------|-------------|----------------|
| Dreamweaver | Daily 6AM PT | Hospitality moments for returning users | Redis, BullMQ, DB |
| Weekly Score Recalc | Monday 5AM PT | Recalculates all ranking scores | Redis, BullMQ, GOOGLE_PLACES_API |
| Feedback Loop | Tuesday | Measures outcomes of agent actions | Redis, BullMQ, DB |
| Collective Intelligence | Weekly | Cross-client pattern discovery | Redis, BullMQ, ANTHROPIC_API_KEY |
| Product Evolution | Sunday 11PM PT | Self-improvement proposals | Redis, BullMQ, ANTHROPIC_API_KEY |
| GBP Refresh | Daily 3AM PT | Refreshes OAuth tokens | Redis, BullMQ, GOOGLE_CLIENT_SECRET |
| Review Sync | Periodic | Syncs Google reviews | Redis, BullMQ, GOOGLE_PLACES_API |
| Bug Triage | Hourly | Detects error patterns, creates tasks | Redis, BullMQ, DB |
| Nothing Gets Lost | Daily 7AM PT | Orphan detection, stale task alerts | Redis, BullMQ, DB |
| Trial Emails | Hourly check | 7-day onboarding email chain | Redis, BullMQ, N8N webhook |
| Discovery | Event-driven | New org data pipeline | Redis, BullMQ, GOOGLE_PLACES_API |
| 5 more infrastructure processors | Various | Backup, scrape, skill triggers | Redis, BullMQ |

### Dormant (Code Complete, Not Scheduled)

| Agent | What It Does | Why Dormant |
|-------|-------------|-------------|
| Intelligence Agent | Generates 3 daily findings per org | Not registered in worker.ts |
| Client Monitor | Daily GREEN/AMBER/RED health scoring | Not registered in worker.ts |
| Competitive Scout | Competitor tracking + alerts | Not registered in worker.ts |
| CS Agent | Proactive interventions (stalled onboarding, etc.) | Not registered in worker.ts |
| CMO Agent | Content strategy recommendations | Not registered in worker.ts |
| CFO Agent | Monthly financial metrics | Not registered in worker.ts |
| Monday Email | Weekly intelligence brief | Needs MAILGUN_API_KEY + domain verification |
| Morning Briefing | Daily synthesis for team | Not registered in worker.ts |
| 24 more agents | Various capabilities | Code exists, not activated |

**Total: 16 active, 32 dormant, 48 total agents with code**

---

## DATA CONNECTIONS

### What's Connected

| Data Source | Status | How It Works |
|-------------|--------|-------------|
| PostgreSQL | CONNECTED | Primary database. All tables exist on sandbox. |
| Google Places API v1 | CONNECTED | Autocomplete, details, competitor search. GOOGLE_PLACES_API env var. |
| Stripe (test mode) | CONNECTED | Test key works. One paying customer (Pawlak $1,500). |
| Redis | CONNECTED (sandbox) | Worker queues, caching. Self-healing connection. |
| Anthropic Claude API | CONNECTED | CEO chat, NL editor, Oz moments, agent intelligence. |
| BullMQ | CONNECTED (sandbox) | 16 active job queues processing. |

### What's Partially Connected

| Data Source | Status | Issue |
|-------------|--------|-------|
| GBP OAuth | PARTIAL | Tokens exist for some orgs. Redirect URI mismatch between sandbox/production. |
| GA4 | PARTIAL | Columns re-added (Apr 2 migration). DentalEMR tag broke during migration. 3 orgs have property IDs. |
| GSC | PARTIAL | Same OAuth flow as GA4. Property IDs stored for some orgs. |
| Mailgun | PARTIAL | Works on sandbox (confirmed Mar 31). DNS verification needed per domain. |

### What's Not Connected

| Data Source | Status | What's Needed |
|-------------|--------|--------------|
| Mailgun (production) | NOT SET UP | MAILGUN_API_KEY, MAILGUN_DOMAIN, DNS records on production |
| N8N webhooks | PARTIAL | ALLORO_N8N_WEBHOOK_URL exists on sandbox, unknown on production |
| Slack webhooks | NOT VERIFIED | ALLORO_BRIEF_SLACK_WEBHOOK, REVIEW_SLACK_WEBHOOK |
| HubSpot | NOT ACTIVE | HUBSPOT_CLIENT_ID/SECRET -- optional integration |
| Sentry | NOT VERIFIED | SENTRY_DSN -- error monitoring |

---

## MIGRATION GAP (Sandbox vs Production)

Production likely has migrations through ~March 24. Sandbox has migrations through April 2.

### Migrations That Need to Run on Production

| Migration | Tables/Columns | Risk |
|-----------|---------------|------|
| 20260324000001 - behavioral_events | behavioral_events table | LOW (new table) |
| 20260324000002 - dream_team_nodes | dream_team_nodes table | LOW (new table) |
| 20260324000003 - dream_team_tasks | dream_team_tasks table | LOW (new table) |
| 20260325000008 - gbp_oauth_columns | organizations.gbp_* columns | LOW (additive) |
| 20260329000001 - batch_checkup | batch_checkup_results | LOW (new table) |
| 20260401000001 - agent_schedules | agent_schedules table | LOW (new table) |
| 20260401000002 - agent_identities | agent_identities table | LOW (new table) |
| 20260401000003 - review_notifications | review_notifications | LOW (new table) |
| 20260401000004 - knowledge_sources | knowledge_sources | LOW (new table) |
| 20260401000005 - weekly_ranking_snapshots | weekly_ranking_snapshots | LOW (new table) |
| 20260401000006 - concierge fields | dream_team_tasks.task_type, blast_radius | LOW (additive) |
| 20260402000001 - feature_flags | feature_flags table | LOW (new table) |
| 20260402000002 - ga4/gsc columns | google_data_store.ga4_data, gsc_data | LOW (additive) |
| 20260402000003-7 - agent canon + seeds | Multiple agent tables + seed data | MEDIUM (large, many inserts) |

All migrations are additive (new tables or new columns). None modify existing data. Risk of running them on production is LOW if done in sequence.

---

## THE HONEST ASSESSMENT

### What a customer sees today on PRODUCTION:
- Old homepage ("Business Clarity for Specialists")
- Cold, gray dashboard with no warm design
- Orthodontist case value at $800 (should be $5,500)
- "Prospects" language throughout
- "Great experience!" for empty reviews
- Booth #835 shown to everyone
- No help button, no frustration detection
- Score labels: "Room to Grow" (shame framing)

### What a customer sees today on SANDBOX:
- Warm homepage ("You trained for years in a craft you love")
- Warm dashboard with narrative greeting, position card, Monday preview
- Research-backed economics for 25+ verticals
- "People" language throughout
- Honest review fallbacks
- Booth conditional on conference mode
- Help button, frustration detection, BlueTape
- Score labels: "Your Starting Point" (empowering)
- BUT: some data connections are partial (rankings need population, GBP needs connection per org)

### What it would take to make sandbox = production:
1. Run migrations on production (Dave, 30 min)
2. Set env vars (Dave, 15 min): ANTHROPIC_API_KEY, GOOGLE_PLACES_API, STRIPE keys
3. Cherry-pick the 5 highest-impact frontend changes (Dave, few hours)
4. Verify checkup flow end-to-end (Corey + Dave, 30 min)
5. Verify one customer dashboard loads correctly (Corey, 15 min)

### OR: What it would take to make sandbox THE production:
1. Run all migrations (Dave, 30 min)
2. Copy production env vars to sandbox server (Dave, 15 min)
3. Point app.getalloro.com DNS to sandbox server (Dave, 15 min)
4. Verify health endpoints (Dave, 5 min)
5. Verify one customer flow end-to-end (Corey, 30 min)
6. Risk: unsecured endpoints Dave hasn't reviewed, agent jobs that may misbehave

---

*Generated April 2, 2026. This is a point-in-time snapshot. Run the audit again after changes.*
