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
- ~~days_since_login: calculated from first_login_at~~ FIXED Apr 2 (infra session)
- ~~Competitor filter: self-comparison~~ FIXED Apr 2 (infra session)
- ~~Score recalc: previous_clarity_score = 0~~ FIXED Apr 2 (infra session)
- PMS parser: improved (local fallback when n8n fails) but core parser still fragile
- ~~PMS referral data: disconnected from referral_sources~~ FIXED Apr 2 (infra session, McPherson verified)
- ~~Behavioral events: backend blind to user actions~~ FIXED Apr 2 (login + dashboard views now tracked)
- 30 of 40 registered agents have never executed
- ~~43 of 53 event types never written, 45 ghost types~~ FIXED Apr 2 (71 types registered, schema consolidated)
- ~~SQL injection in agentExecutor~~ FIXED Apr 2
- ~~60+ unprotected admin endpoints~~ FIXED Apr 2
- ~~Pilot mode token (empty dashboards)~~ FIXED Apr 2
- ~~Dream Team /tasks route collision~~ FIXED Apr 2
- ~~Mission Control wrong table name~~ FIXED Apr 2
- ~~Notification dedup (spam)~~ FIXED Apr 2
- ~~agentCanon.ts missing import (server crash)~~ FIXED Apr 2
- 7 more route files still need auth (agentsV2, practiceRanking, clarity, rag, audit, notifications, monday)
- 33 endpoints leak err.message to clients
- GBP OAuth redirect URI mismatch between sandbox and production
- GA4/GSC: columns re-added, but data fetch depends on per-org OAuth tokens
- Dashboard: 28 potential elements, 120 clickable items, 16 pages (being rebuilt to 3)

## What's Being Rebuilt

- Dashboard: reducing to 3 pages (Scoreboard, Deep Dive, Your Business). Spec in progress.
- Backend plumbing: 4 phases (data pipes, security, integrity, self-awareness). In progress.

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

## What Comes Next

1. **Dashboard spec** (PM session): finalize 3-page Scoreboard/DeepDive/YourBusiness spec
2. **Phase 1 plumbing** (infra sessions): PMS -> referral_sources pipe, behavioral event logging for user actions
3. **Phase 2 security**: remaining unprotected routes, error message leaks, rate limiting
4. **Monday email verification**: confirm one real email sends to one real customer on sandbox
5. **Dashboard build**: implement spec once plumbing is verified
6. **Dave handoff**: cherry-pick to production once sandbox is verified

---

## Rules for Updating This File

- Read at session start
- Update at session end
- "What's Broken" section: remove when fixed, add when discovered
- "Session Log" section: one entry per session, 3-5 bullet points max
- "What Comes Next" section: reorder based on current priority
- Never let this file exceed what fits on 2 screens
- If it's getting long, something should move to SANDBOX-CATALOG.md instead
