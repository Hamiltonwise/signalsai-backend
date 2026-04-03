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

- Checkup flow: entry -> scanning -> results -> account creation (end to end)
- Google Places API v1: autocomplete, details, competitor discovery
- PostgreSQL: all 191 migrations run, tables exist
- Redis + BullMQ: 16 active job queues processing
- Stripe test mode: checkout, portal, webhook
- Auth: signup, signin, password reset, JWT
- Anthropic API: CEO chat, NL website editor, Oz moments
- HelpButton -> dream_team_tasks + behavioral_events (wired today)
- Frustration detection -> behavioral_events (wired today)
- Lemonis Protocol -> archetype detection -> Monday email tone (wired today)

## What's Broken (known issues)

- Monday email: has likely NEVER been delivered to a paying client (unverified)
- days_since_login: calculated from first_login_at (never updates), not actual last activity
- Competitor filter: sometimes compares practices to themselves or wrong specialty
- Score recalc: previous_clarity_score = 0 for many orgs, making deltas meaningless
- PMS parser: fragile, Kuda gave up on it
- PMS referral data: $413K of intelligence in pms_jobs.response_log never reaches referral_sources
- Behavioral events: backend doesn't log logins, page views, or feature usage (system half-blind)
- 30 of 40 registered agents have never executed
- 43 of 53 registered event types have never been written
- 45 "ghost" event types being written that aren't in the registry
- GBP OAuth redirect URI mismatch between sandbox and production
- GA4/GSC: columns re-added, but data fetch depends on per-org OAuth tokens
- Dashboard: 28 potential elements, 120 clickable items, 16 pages (Cheesecake Factory)

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

### April 2 (Infrastructure session)
- SQL injection fixes, 60+ admin endpoints secured
- Checkup dedup preventing ghost orgs
- Client health scoring, engagement scoring verified
- Identified: days_since_login bug, PMS pipe disconnected, competitor self-filter, event schema fiction
- Phase 1-4 plan proposed (data pipes, security, integrity, self-awareness)

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
