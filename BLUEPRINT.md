# BLUEPRINT.md -- The State of Alloro

Updated: April 2, 2026 (end of session)
Updated by: Claude (PM session)

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
pages/DoctorDashboard.tsx    -- THE client dashboard (being rebuilt)
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

### April 2 (PM session - Claude, coordinating)
- Analyzed Merideth + Dave transcripts from Fireflies
- Wired Lemonis Protocol into Monday email + clean week (archetype-aware tone)
- Built all 7 structural items (person layer, trial rewrite, nothing-to-do state, community proof, generous cancellation, unified onboarding, Foundation self-serve)
- Fixed 7 percentage displays (real numbers, not unverifiable stats)
- Wired bug pipeline (HelpButton -> tasks + events, frustration -> events)
- Fixed website editor email targeting bug
- Created SANDBOX-CATALOG.md (full audit)
- Researched dashboard psychology (10 findings, 27 sources)
- Vision: 3-page dashboard (Scoreboard, Deep Dive, Your Business). Spec in progress.
- Created BLUEPRINT.md

### April 2 (Plumbing session)
- 71 unregistered event types added to eventSchema.ts
- PMS parser: local storage fallback when n8n fails
- Gray dots: 35 agent_identities wired (was 4), 10 aspirational nodes deactivated
- 50+ standing rule violations fixed (font sizes, weights, colors, language)
- Closed 5 person-layer gaps (personalGoal rendering, backend clear state, Day 7 rewrite, Dashboard.tsx guard, community proof in Monday Brief)

### April 2 (Infrastructure session) -- 11 commits pushed
- Phase 1 COMPLETE: PMS -> referral_sources pipe connected (McPherson: 50 sources, $110K Heart of Texas verified). User activity tracking wired (login + dashboard views -> behavioral_events).
- Phase 2 PARTIAL: SQL injection closed, 60+ admin endpoints secured, composite index on behavioral_events, checkup dedup preventing ghost orgs. Remaining: 7 unprotected route files, 33 error message leaks, rate limiting.
- 3 structural bugs fixed: days_since_login, competitor self-filter, score recalc
- 71 event types registered, 24 gray dots resolved, 50+ style violations fixed

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

1. **Dashboard build**: 5-page structure (Home, Compare, Reviews, Presence, Settings). Frontend session building now.
2. **Referral data into Monday email bullets**: The pipe is connected (referral_sources populated) but the email body still only reads ranking snapshots. Wire referral drift into email bullets. "Heart of Texas sent 96 referrals worth $110K but dropped from 14/month to 5/month." THE Oz moment.
3. **Monday email verification**: confirm one real email sends to one real customer on sandbox
4. **Phase 2 security remaining**: 7 unprotected routes, 33 error message leaks, rate limiting
5. **Fill customer org_ids**: query sandbox DB, update table above
6. **Dave handoff**: cherry-pick to production once sandbox is verified

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
