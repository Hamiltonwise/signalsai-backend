# BLUEPRINT.md -- The State of Alloro

Updated: April 2, 2026 (end of day)
Updated by: Claude (PM/Coordinator session)

Read this before touching anything. Update this before closing any session.

---

## What Alloro Is

A business intelligence platform that tells business owners what their business is trying to tell them. Push, not pull. The Monday email IS the product. The dashboard IS the email, live.

---

## Architecture (30-second version)

```
Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/ui
Backend:  Node.js, Express, Knex, PostgreSQL
Workers:  BullMQ + Redis (16 active queues, 32 dormant)
AI:       Anthropic Claude API (Haiku for edits, Sonnet for intelligence)
Email:    Mailgun (confirmed working on sandbox)
Billing:  Stripe (test mode, one paying customer)
Hosting:  Sandbox: sandbox.getalloro.com | Production: app.getalloro.com (Dave's EC2)
```

---

## What's Working (verified on sandbox)

- **22/22 endpoints healthy** (onboarding, dashboard, one-action, agents, billing, admin, system)
- Checkup flow: entry -> scanning -> results -> account creation (end to end)
- Google Places API v1: autocomplete, details, competitor discovery
- PostgreSQL: all 191 migrations run, tables exist
- Redis + BullMQ: 16 active job queues processing
- Stripe test mode: checkout, portal, webhook
- Auth: signup, signin, password reset, JWT (admin password reset no longer needs Mailgun)
- Anthropic API: CEO chat, NL website editor, Oz moments
- Mission Control: 50 agents visible. 16 nominal, 1 failed, 33 idle.
- PMS -> referral_sources: McPherson verified (50 sources, Heart of Texas: 96 referrals, $110K)
- User activity tracking: login + dashboard views -> behavioral_events
- HelpButton -> dream_team_tasks + behavioral_events
- Frustration detection -> behavioral_events
- Lemonis Protocol -> archetype detection -> Monday email tone
- Sidebar upload visible for all customers
- GBP prompts read live data, not stale checkup
- Notification dedup prevents spam

## What's Broken (known issues)

- Monday email: has likely NEVER been delivered to a paying client (unverified)
- PMS parser: improved (local fallback when n8n fails) but core parser still fragile
- 30 of 40 registered agents have never executed (5 critical ones now PASS Canon)
- 7 route files still need auth (agentsV2, practiceRanking, clarity, rag, audit, notifications, monday)
- 33 endpoints leak err.message to clients
- GBP OAuth redirect URI mismatch between sandbox and production
- GA4/GSC: columns exist, data fetch depends on per-org OAuth tokens
- DentalEMR: SaaS vertical, GBP/local-SEO features don't apply. Needs vertical config for data sources.
- Artful, McPherson, Caswell: PMS data in production only, empty on sandbox

(15 items fixed Apr 2. See git log for details.)

## What's Being Rebuilt

**Dashboard: 5 pages replacing 16.** Spec AGREED. Build starting.

| Page | Question | What's on it |
|------|----------|-------------|
| Home | "Am I okay?" + "What should I do?" | Greeting, One Action Card, position line, score, surprise moments |
| Compare | "How do I compare?" | Score breakdown, rankings over time, competitors, referral sources |
| Reviews | "What are people saying?" | Recent reviews, AI response drafts, velocity, review requests |
| Presence | "What does my online presence look like?" | Website editor, GBP profile, search presence, compliance |
| Settings | Touch once, forget | Account, billing, integrations, team, notifications, export |

Rules:
- Home: max 2 temporary prompts at once (stack in sequence, not parallel)
- Monday Preview: CUT (email is the surprise, preview kills anticipation)
- Referral card: earned moment after first win, not permanent
- Home must degrade gracefully: always shows something, even with zero data
- Surprise moments (Dreamweaver, milestone, win): appear when earned, vanish when seen

**Backend plumbing: Phase 1 COMPLETE. Phase 2 partial.**
- Phase 1 (data pipes): DONE. PMS -> referral_sources, user activity tracking.
- Phase 2 (security): PARTIAL. SQL injection closed, 60+ endpoints secured. 7 routes + error leaks remain.
- Phase 3 (integrity): DONE. 18 ghost orgs archived, timestamps added to 4 tables.
- Phase 4 (self-awareness): DONE. 5 critical agents evaluated PASS (monday_email, client_monitor, intelligence_agent, cs_agent, dreamweaver). 5 green dots on Dream Team board. Board tells the truth.

---

## Customer State (real people, real problems)

| Customer | Status | Issue | What They Need |
|----------|--------|-------|----------------|
| Pawlak (Artful Orthodontics) | Paying $1,500 | Confused by January data (referrals up 133%, production down 53%) | Accurate numbers, Monday email that explains her market |
| Garrison | Active | Was locked out, now in | Dashboard that shows him something true |
| Merideth (DentalEMR) | Partner, on sandbox | Website editor email bug (fixed), GA4 disconnected, conversions down | Different vertical (SaaS, not local SEO), needs adapted intelligence |
| Kuda | At risk | PMS upload broke, said "I'll do it myself" | Parser that works, or do it for him |
| Shawn | At risk | "You're doing the same thing I'm already doing" | Oz moment: something he doesn't already know |
| Kargoli | Active | Went back and forth for weeks on website edits | NL editor that works reliably |

---

## File Map (where things live)

### Frontend (frontend/src/)
```
pages/DoctorDashboard.tsx    -- V1 client dashboard (preserved as rollback)
pages/HomePage.tsx           -- V2 Home ("Am I okay?") LIVE on /home
pages/ComparePage.tsx        -- V2 Compare ("How do I compare?") LIVE on /compare
pages/ReviewsPage.tsx        -- V2 Reviews ("What are people saying?") LIVE on /reviews
pages/PresencePage.tsx       -- V2 Presence ("Online presence") LIVE on /presence
pages/checkup/               -- 7 screens: entry, scanning, results, building, share, etc.
pages/marketing/HomePage.tsx -- Public homepage
pages/foundation/            -- Heroes & Founders application (self-serve, wired today)
pages/OwnerProfile.tsx       -- Lemonis Protocol 5 questions
components/dashboard/        -- OneActionCard, MondayPreview, CompetitorComparison, etc.
components/HelpButton.tsx    -- Customer help -> dream_team_tasks
components/BlueTape.tsx      -- Internal QA punch list (admin only)
hooks/useFrustrationDetection.ts -- Rage clicks, idle, nav loops -> behavioral_events
```

### Backend (src/)
```
jobs/mondayEmail.ts          -- THE product. Monday email + clean week detection.
jobs/trialEmails.ts          -- 7-day trial sequence
routes/checkup.ts            -- Free checkup analysis (public, no auth)
routes/user/help.ts          -- HelpButton endpoint (created today)
routes/foundation.ts         -- Foundation apply + auto-account-creation (updated today)
services/oneActionCard.ts    -- Deterministic rule engine (5 rules + steady state)
services/ownerArchetype.ts   -- Craftsman/builder/survivor/legacy detection
emails/templates/            -- MondayBriefEmail, CleanWeekEmail, trial, winback, etc.
controllers/billing/         -- Stripe integration, isFoundation flag (updated today)
workers/worker.ts            -- BullMQ queue registrations (16 active, 32 dormant)
```

### Key Config
```
CLAUDE.md                    -- Standing rules (read first every session)
BLUEPRINT.md                 -- This file (read second, update last)
docs/SANDBOX-CATALOG.md      -- Full page/route/agent/data audit (snapshot from today)
.claude/rules/               -- Task routing, agent safety, build protocol, etc.
```

---

## Session Log

### April 2 (PM/Coordinator session - Claude)
- Analyzed Merideth + Dave transcripts from Fireflies (read both in full)
- Wired Lemonis Protocol into Monday email + clean week (archetype-aware, confidence-gated, safe personalGoal rendering)
- Built all 7 structural items (person layer, trial rewrite, nothing-to-do state, community proof, generous cancellation, unified onboarding, Foundation self-serve)
- Fixed 7 percentage displays (real numbers, not unverifiable stats)
- Wired bug pipeline (HelpButton -> tasks + events, frustration -> events)
- Fixed website editor email targeting bug + OneActionCard server override bug
- Created SANDBOX-CATALOG.md (full audit) and BLUEPRINT.md
- Researched dashboard psychology (10 findings, 27 sources)
- Coordinated 3 parallel sessions: frontend (5-page build), backend (4-phase plumbing), plumbing (person layer gaps)
- Spec agreed: 5 pages replacing 16. V1 preserved. Nav switch in progress.
- Key lesson: "Match pace. Think with Corey, not ahead of him. Trace data before code."

### April 2 (Plumbing session)
- 71 unregistered event types added to eventSchema.ts
- PMS parser: local storage fallback when n8n fails
- Gray dots: 35 agent_identities wired (was 4), 10 aspirational nodes deactivated
- 50+ standing rule violations fixed (font sizes, weights, colors, language)
- Closed 5 person-layer gaps (personalGoal rendering, backend clear state, Day 7 rewrite, Dashboard.tsx guard, community proof in Monday Brief)

### April 2 (Infrastructure session) -- all 4 phases complete
- Phase 1: PMS -> referral_sources connected (McPherson verified). User activity tracking wired.
- Phase 2: SQL injection closed, 60+ endpoints secured, checkup dedup, composite index.
- Phase 3: 18 ghost orgs archived, timestamps on 4 tables.
- Phase 4: 5 critical agents PASS Canon (monday_email, client_monitor, intelligence_agent, cs_agent, dreamweaver). Agent health status auto-updates on run.
- Root causes found: pilot token = empty dashboards, notification spam, GBP stale prompts, dream team route collision, mission control wrong table.
- Key lesson from session: "The building produced features. The listening produced fixes. The fixes mattered more."

---

## Monday Email Pipeline (THE product)

```
Trigger: BullMQ cron, Monday 7 AM (timezone-unaware, all orgs in batch)
Data:    organizations + weekly_ranking_snapshots + behavioral_events + owner_profile
Flow:    sendMondayEmailForOrg(orgId) in src/jobs/mondayEmail.ts
         -> loads org, user, vocabulary, owner profile (archetype)
         -> fetches latest ranking snapshot
         -> if clean week (no movement): sendCleanWeekEmail()
         -> if findings exist: builds bullets + 5-minute fix
         -> archetype modulates tone (survivor=reassurance, builder=momentum, craftsman=lifestyle)
         -> personalGoal reflected in clean week ("extra time for your kids")
         -> community count ("clean week for you and 89 others")
         -> sends via sendMondayBriefEmail() (Mailgun)
         -> fallback: in-app notification if email fails
Needs:   MAILGUN_API_KEY, MAILGUN_DOMAIN (confirmed working on sandbox)
         ANTHROPIC_API_KEY (for surprise findings during steady state)
Verify:  Has any Monday email EVER been delivered? Check behavioral_events for "monday_email.sent"
```

## Customer Org IDs (sandbox)

| Customer | org_id | Score | Position | Notes |
|----------|--------|-------|----------|-------|
| Garrison | TBD | 89.52 | #6/18 West Orange NJ | Clean |
| DentalEMR | TBD | 50.46 | #1/1 | SaaS, no real competitors in GBP |
| Artful (Pawlak) | TBD | 89.46 | #6/20 | PMS empty (prod only) |
| McPherson | TBD | 87.35 | #1/15 | PMS empty, website not live |
| Caswell | TBD | 90.56 | #3/16 | PMS empty (prod only) |
| One Endo | TBD | 45.00 | #1/1 | PMS has data (Fredericksburg) |

(Fill in org_ids from database for debugging)

## Required Environment Variables

**Will crash without:** JWT_SECRET, DB_HOST/PORT/NAME/USER/PASSWORD
**Features break without:** ANTHROPIC_API_KEY (AI chat, Oz moments, NL editor), GOOGLE_PLACES_API (checkup, autocomplete), STRIPE_SECRET_KEY (billing)
**Email breaks without:** MAILGUN_API_KEY, MAILGUN_DOMAIN
**Optional:** REDIS_HOST (defaults localhost), SENTRY_DSN, GITHUB_TOKEN, ALLORO_N8N_WEBHOOK_URL, SUPER_ADMIN_EMAILS

## What Comes Next

1. ~~Dashboard nav switch~~: DONE. /home is default. 5-icon nav live. V1 at /dashboard as rollback.
2. **Verify real data rendering**: Login as Garrison/One Endo on sandbox, confirm Home page shows real position, score, action card with actual data.
3. **Referral data into Monday email bullets**: Pipe connected but email body still reads ranking snapshots only. Wire referral drift into bullets. THE Oz moment.
4. **Monday email verification**: confirm one real email sends to one real customer on sandbox
5. **Phase 2 security remaining**: 7 unprotected routes, 33 error message leaks, rate limiting
6. **Fill customer org_ids**: query sandbox DB, update table above
7. **Dave handoff**: cherry-pick to production once sandbox is verified

## North Star (longer term)

- **One Alloro**: Same 5 questions for everyone (customers, team, partners). Role determines data, not page structure. Jo gets a grid. Dave gets a terminal. Pawlak gets calm. Same philosophy, personal rendering. Customers first.
- **Vertical config**: DentalEMR (SaaS) needs different data sources behind the same 5 pages. Vocabulary handles language. Vertical config handles data routing.

## Dave's Migration Guide

When sandbox is ready, this is the checklist. One item at a time. Verify before moving to the next.

**Prerequisites (run once):**
```bash
# 1. Pull sandbox
git fetch origin sandbox
git checkout sandbox
git pull

# 2. Run migrations on production
npx knex migrate:latest --env production

# 3. Verify
curl https://app.getalloro.com/api/health/db
```

**Migration order (cherry-pick by priority):**

| # | What | Files | Verify | Risk |
|---|------|-------|--------|------|
| 1 | Homepage | frontend/src/pages/marketing/HomePage.tsx | Visit getalloro.com, check copy and layout | LOW (pure frontend) |
| 2 | Checkup flow | frontend/src/pages/checkup/*.tsx, src/routes/checkup.ts | Run checkup for "Artful Orthodontics Winter Garden FL", confirm score | LOW (public route, no auth) |
| 3 | Dashboard (5-page rebuild) | frontend/src/pages/DoctorDashboard*.tsx, new page files | Login as test account, verify Home page loads | MEDIUM (major UI change) |
| 4 | Monday email fixes | src/jobs/mondayEmail.ts, src/emails/templates/*.ts | Trigger manual send for one org, verify email arrives | MEDIUM (needs Mailgun) |
| 5 | Scoring + economics | src/routes/checkup.ts (economics), src/services/ozMoment.ts | Run checkup for orthodontist, verify $5,500 not $800 | LOW (data only) |
| 6 | HelpButton + bug pipeline | src/routes/user/help.ts, frontend/src/components/HelpButton.tsx | Click help button, verify task appears in admin | LOW (new route) |
| 7 | Foundation self-serve | src/routes/foundation.ts, frontend/src/pages/foundation/*.tsx | Submit test application, verify auto-login | LOW (new flow) |

**What NOT to move (sandbox-only for now):**
- Agent Canon governance (agent_canon tables, verdict system) -- still maturing
- Mission Control admin page -- internal only, not customer-facing
- 32 dormant agent queues -- no value until activated and verified
- BlueTape internal QA system -- team only

**Architecture note:**
Production has separate servers for homepage (getalloro.com), audit/checkup (audit.getalloro.com), and app (app.getalloro.com). Homepage changes need to go to the homepage repo, not the app repo. Dave knows this. Checkup changes may need the audit subdomain redirect he mentioned (getalloro.com/checkup -> audit.getalloro.com).

**After each migration step:**
```bash
# Verify health
curl https://app.getalloro.com/api/health/db

# Verify frontend loads
# Open in browser, check for console errors

# Verify one customer
# Login as Garrison or Pawlak, confirm dashboard shows real data
```

**The 5 agents that matter (all PASS Canon):**

| Agent | What it does | Infrastructure needed |
|-------|-------------|----------------------|
| monday_email | Weekly intelligence email, THE product | BullMQ, Redis, Mailgun |
| client_monitor | Daily GREEN/AMBER/RED health scoring | BullMQ, Redis, DB |
| intelligence_agent | Generates findings from ranking data | BullMQ, Redis, Anthropic API |
| cs_agent | Proactive chat when users are stuck | Anthropic API, DB |
| dreamweaver | "While you were away" moments | BullMQ, Redis, DB |

All 5 need Redis + BullMQ running on production. Dave confirmed both work.

---

## Corey Action Items (not code)

- Force password reset for Jay and Rosanna (DentalEMR). Passwords in git history (dentalemr2026).
- Valley Endo demo account configuration
- Artful PMS data: coordinate with Dave to copy from production to sandbox

---

## Rules for Updating This File

- Read at session start
- Update at session end
- "What's Broken" section: remove when fixed, add when discovered
- "Session Log" section: one entry per session, 3-5 bullet points max
- "What Comes Next" section: reorder based on current priority
- Never let this file exceed what fits on 2 screens
- If it's getting long, something should move to SANDBOX-CATALOG.md instead
