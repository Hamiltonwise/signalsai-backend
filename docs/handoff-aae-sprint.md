# AAE Sprint Mega-Spec: All Three Pillars

**Date:** April 11, 2026
**Event:** AAE Conference, Salt Lake City, April 15-18
**Window:** 4 days
**From:** Corey (via AI)
**To:** Dave + Dave's AI agents
**Branch:** sandbox

---

## Context

AAE starts Wednesday. This spec covers everything needed across all three product pillars (Website, PMS Analyzer, Ranking) to have a demo-ready, referral-generating product by Tuesday night.

Two prior commits on sandbox:
1. `67284f0e` (deployed): proof-of-work endpoint, proofline timeline, review trajectory, competitor velocity
2. Staged but uncommitted (3 files, 86 insertions): interpretation layer on Home/Compare/Progress + universal language

Additional uncommitted changes (3 more files, 43 insertions): share prompt on Home, universal language fixes in ReferralProgram + BuildingScreen.

All TypeScript clean. Zero errors.

---

## PRIORITY 0: Unblock the Pipeline

Card 0: Clear Git Locks and Commit All Staged Changes
Blast Radius: Green
Complexity: Low
Dependencies: none

What Changes:
- .git/HEAD.lock: delete
- .git/index.lock: delete if exists

Steps:
1. `cd ~/Desktop/alloro`
2. `rm -f .git/HEAD.lock .git/index.lock`
3. `git status` (should show 6 modified files staged)
4. `git add frontend/src/pages/HomePage.tsx frontend/src/pages/ComparePage.tsx frontend/src/pages/ProgressReport.tsx frontend/src/pages/ReferralProgram.tsx frontend/src/pages/checkup/BuildingScreen.tsx`
5. Commit:
```
git commit -m "feat: interpretation layer + share prompt + universal language

- Home/Compare/Progress: every reading now has computed, magnitude-aware interpretation
- Home: share/refer prompt connected to existing ColleagueShare infrastructure
- ReferralProgram + BuildingScreen: practice->business, patients->customers
- ComparePage: patients->people, patient searches->searches in your area
"
```
6. `git push origin sandbox`

Verification:
- Sandbox auto-deploys. Check https://sandbox.getalloro.com within 5 minutes.

Done Gate: Push succeeds, sandbox deploys, no build errors in CI.

---

Card 1: Ensure Workers Are Running
Blast Radius: Yellow (infrastructure)
Complexity: Low
Dependencies: Card 0

What Changes:
- Redis must be running on EC2
- minds-worker PM2 process must be running
- Migrations must be current

Steps:
1. SSH into sandbox EC2
2. `redis-cli ping` (expect PONG)
3. `pm2 status` (expect alloro-api and minds-worker both online)
4. If minds-worker not listed: `pm2 start minds-worker`
5. `npx knex migrate:latest` (run any pending migrations)
6. `pm2 restart alloro-api` (triggers startup hooks: catchUpStaleScores, pollReviewsOnStartup, analyticsCatchUp)

Touches:
- Database: yes (migrations)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. `curl https://sandbox.getalloro.com/api/health` returns 200
2. `pm2 logs minds-worker --lines 20` shows worker processing jobs
3. Within 15 minutes: login as Garrison, Home page shows fresh profile completeness (3/5 not 1/5)
4. Within 15 minutes: Reviews page shows individual reviews with AI draft responses

Done Gate: All 4 verification tests pass? Yes = next card. No = fix first.

---

## PILLAR 1: RANKING (Product Dashboard)

Status: Code complete. Needs data flowing (Card 1 unblocks this).

What's already built and deployed on sandbox:
- 5-page model (Home, Compare, Reviews, Presence, Progress)
- Interpretation layer on every reading (time-to-close, top conversion channel, GBP profile severity, weekly review rate)
- Proof-of-work endpoint and timeline
- One action card with 6-priority waterfall
- Review response drafts with approve/post
- Advisor chat (Claude-powered, contextual)
- Share prompt on Home (connected to referral system)
- Competitor velocity on Compare

What needs Dave's infrastructure to light up:
- Workers running (Card 1)
- Fresh ranking snapshots (Sunday cron or manual trigger)
- Review sync (daily cron or manual trigger)

Card 2: Trigger Manual Data Refresh for All Demo Customers
Blast Radius: Green
Complexity: Low
Dependencies: Card 1

Steps (after Card 1):
1. For each customer org (Artful=?, Garrison=5, OneEndo=?, Caswell=?, DentalEMR=?, McPherson=?):
   - `POST /api/admin/rankings/run-now` with `{ "orgId": X }`
   - `POST /api/admin/reviews/poll`
   - `POST /api/admin/score-recalc/run-now` with `{ "orgId": X }`
2. Wait 10 minutes
3. Check each customer dashboard shows fresh data

Verification:
- Garrison: Compare page shows Peluso with rating + photo count (not N/A)
- All customers: Home page readings show current data, not stale signup data
- Reviews page: individual reviews listed with AI drafts

Done Gate: At least 3 customer dashboards show fresh, complete data.

---

## PILLAR 2: WEBSITE (Managed Websites)

Status: Functional but creating manual work. Artful form submissions blocked by Protect. DentalEMR pages required manual import. 1Endo needs blog migration.

Card 3: Stabilize Alloro Protect (Form Submissions)
Blast Radius: Yellow
Complexity: Medium
Dependencies: none (can run parallel with Cards 1-2)

Context: Artful's real form submissions were being silently blocked by Alloro Protect's AI flagging. Dave disabled some protections on April 9. Current state: "silent droppers" disabled, AI flagging still active but may be too aggressive.

What Changes:
- Review Alloro Protect's AI flagging thresholds
- Ensure legitimate submissions are never silently dropped
- If a submission is flagged, it should still be saved and visible in the dashboard submissions tab
- Client must be able to see ALL submissions (flagged or not) in their dashboard

Touches:
- Database: possibly (protect config)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Submit a test form on artfulorthodontics.com with a real-looking name/email/message
2. Submission appears in Artful's dashboard submissions tab within 60 seconds
3. Submission email arrives at Artful's configured email within 5 minutes
4. Submit an obviously spam form (gibberish, "test test test") -- should be flagged but still visible in dashboard

Done Gate: Real submissions reach both dashboard and email. Flagged submissions visible in dashboard with "flagged" indicator.

---

Card 4: DentalEMR Website Audit Follow-up
Blast Radius: Green
Complexity: Low
Dependencies: none

Context: Jo sent Merideth a full audit report on April 9. Missing pages have been imported. Insurance form page redirects to contact. Privacy policy page is live at dentalemr.com/privacy-policy.

What Changes:
- Verify all links from Jo's audit report resolve correctly
- Ensure no 404s on any page linked from the main navigation
- Confirm privacy policy link in footer points to /privacy-policy (not homepage)

Verification Tests:
1. Visit every page in dentalemr.com navigation. Zero 404s.
2. Footer privacy policy link goes to /privacy-policy, not /
3. Contact form submission reaches DEMR dashboard + email

Done Gate: Zero 404s, privacy link correct, form works.

---

Card 5: 1Endo Blog Migration
Blast Radius: Yellow
Complexity: Medium
Dependencies: none

Context: Dr. Cuda's 1Endo site has pages of blog posts. Team discussed educating on FAQ vs blog SEO value. Jo recommended migrating 10 max if they push for it.

What Changes:
- Spin up blog scraper agent (Dave mentioned this April 7)
- Scrape 1Endo blog posts
- Import top 10 (by traffic or recency) into Alloro website engine
- Redirect old blog URLs to new locations

Touches:
- Database: yes (website content)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. At least 10 blog posts visible on 1Endo's Alloro site
2. Old blog URLs redirect (301) to new locations
3. Blog posts render with proper formatting (headings, images)

Done Gate: 10 posts migrated, old URLs redirect, no broken formatting. If blocked, move to Card 6.

---

## PILLAR 3: PMS ANALYZER (Business Data)

Status: Upload wizard exists. Referral analysis works. PMS Vision parser handles images/PDFs. Currently dental-specific language in some places but the core parsing is universal.

No cards needed for AAE. The upload flow works. The language fixes were made in the Ranking pillar changes. If a prospect at AAE uploads data, it will parse and display.

---

## AAE-SPECIFIC: PROSPECT EXPERIENCE

Card 6: End-to-End Checkup Flow Verification
Blast Radius: Green
Complexity: Low
Dependencies: Card 1 (for data to flow)

Context: The checkup flow is the AAE entry point. Prospect scans QR -> enters business name -> ScanningTheater (live map) -> ResultsScreen (readings) -> account creation -> ColleagueShare.

What Changes:
- No code changes. Verification only.
- Test the full flow on sandbox from a phone browser

Verification Tests:
1. Visit https://sandbox.getalloro.com/checkup on mobile Safari/Chrome
2. Enter a real business name + city (try: "Valley Endodontics, Salt Lake City")
3. ScanningTheater: map loads, pin drops, competitor pins appear, scanning animation plays
4. ResultsScreen: readings appear (star rating, review count, competitor comparison)
5. "Create Account" flow works (email + password)
6. ColleagueShare screen appears with share button
7. Share button opens native share sheet (iOS) or copies link (desktop)
8. Referral link points to /checkup?ref=[code]

Done Gate: Full flow works on mobile. If any step fails, document which step and the error.

---

Card 7: QR Code for AAE Booth
Blast Radius: Green
Complexity: Low
Dependencies: Card 6

What Changes:
- Generate a QR code pointing to https://getalloro.com/checkup (or sandbox URL for testing)
- QR should be high-resolution for printing on booth materials
- Consider adding ?utm_source=aae&utm_medium=qr for tracking

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Scan QR with phone camera
2. Opens checkup page
3. Full flow from Card 6 works after scan

Done Gate: QR scans correctly on 3 different phones.

---

Card 8: Conference Fallback Data
Blast Radius: Green
Complexity: Low
Dependencies: none

Context: frontend/src/pages/checkup/conferenceFallback.ts already has SLC demo data (Valley Endodontics, Salt Lake City). It also has a `buildPersonalizedConferenceFallback()` function for dynamic results.

What Changes:
- Verify conferenceFallback.ts FALLBACK data is current and uses SLC-relevant businesses
- Ensure the fallback triggers correctly when Google Places API rate-limits during high-traffic demo periods
- The fallback should still feel personalized (uses real practice name, city, rating from the search)

Verification Tests:
1. Read conferenceFallback.ts and verify SLC data is realistic
2. Test checkup with a business that might rate-limit (run 5 checkups in 2 minutes)
3. If fallback triggers, results still show competitor data and readings

Done Gate: Fallback produces believable, SLC-relevant results.

---

## ENVIRONMENT CHECKLIST

| Item | Status | Who |
|------|--------|-----|
| Sandbox auto-deploy working | Confirmed | Dave |
| Redis running on EC2 | CHECK | Dave |
| minds-worker PM2 process | CHECK | Dave |
| ALLORO_N8N_WEBHOOK_URL env var | CHECK | Dave |
| MAILGUN_API_KEY env var | CHECK | Dave |
| MAILGUN_DOMAIN env var | CHECK | Dave |
| ANTHROPIC_API_KEY env var | CHECK | Dave |
| Google Places API key valid | CHECK | Dave |
| MyBusiness API OAuth tokens | CHECK | Dave |
| SSL cert valid on sandbox | CHECK | Dave |
| knex migrations current | CHECK | Dave |

---

## SEQUENCE FOR MAXIMUM PARALLELISM

Dave's AI can run these in parallel:

**Parallel Track A (Infrastructure):** Card 0 → Card 1 → Card 2
**Parallel Track B (Website):** Card 3, Card 4 (independent of Track A)
**Parallel Track C (Blog):** Card 5 (independent, can defer if blocked)
**After Track A completes:** Card 6 → Card 7 → Card 8

Timeline:
- Saturday/Sunday: Tracks A + B + C in parallel
- Monday: Card 6 (full flow test) + Card 7 (QR generation)
- Tuesday: Card 8 (conference fallback verification) + any fixes from Monday testing
- Wednesday: AAE opens. Product is ready.

---

## WHAT SUCCESS LOOKS LIKE TUESDAY NIGHT

1. A prospect scans the QR at AAE → sees their live competitive map → sees their readings with interpretation → creates account → shares with a colleague standing next to them
2. Garrison, Artful, 1Endo, DentalEMR dashboards show fresh data with interpretation on every reading
3. Monday email fires Monday morning with real intelligence for all customers
4. Form submissions on all client websites reach both dashboard and email
5. No "practice" or "patient" language visible anywhere a non-dental business owner would see it

---

## FILES CHANGED IN THIS SPRINT (for reference)

Already committed (67284f0e):
- src/routes/user/proofOfWork.ts (NEW)
- src/index.ts (route registration)
- frontend/src/pages/HomePage.tsx
- frontend/src/pages/ComparePage.tsx
- frontend/src/pages/ProgressReport.tsx

Staged, uncommitted (interpretation layer):
- frontend/src/pages/HomePage.tsx (interpretation + share prompt)
- frontend/src/pages/ComparePage.tsx (interpretation + universal language)
- frontend/src/pages/ProgressReport.tsx (interpretation)

Unstaged, uncommitted (language fixes):
- frontend/src/pages/ReferralProgram.tsx (practice→business, 212D40→1A1D23)
- frontend/src/pages/checkup/BuildingScreen.tsx (patients→customers)
