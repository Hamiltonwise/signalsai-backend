# Production Cutover Handoff

**Date:** April 12, 2026
**From:** Corey (via AI)
**To:** Dave + Dave's AI agents
**Branch:** sandbox
**Goal:** Sandbox is constitutionally clean. When you're ready, switch it to production before AAE.

---

## Context

Two sessions of Constitution compliance work have landed on sandbox. The codebase now passes Known 3 (no position claims), Known 4 (no fabricated dollar figures), Known 6 (no composite scores), and Known 14 (brand constants) across all primary customer-facing paths.

Email kill switch is active: `ALLOW_EMAIL_SEND=true` environment variable is required for any email to leave the system. Sandbox does not have this set. Zero customer contact from sandbox.

Commits on sandbox since last handoff:
1. `53b3c061` -- email kill switch + PMS upload silent failure fix
2. `a703e5b6` -- K3/K4/K6 compliance across Demo.tsx, index.html, GrowthChart, DoctorDashboardV1, DashboardSettings, marketing pages
3. (Pending commit) -- RankingsScreen reframe, PartnerPortal fix, HomePage hero cleanup

---

Card 1: Email Kill Switch for Production
Blast Radius: Red
Complexity: Low
Dependencies: none

What Changes:
- Production environment: add `ALLOW_EMAIL_SEND=true` to env vars
- Without this, zero emails send (Monday briefs, checkup results, welcome emails)
- The gate is in `src/emails/emailService.ts` lines 8-9
- All email flows through the single `sendEmail()` function. No bypass paths exist.

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. On sandbox: trigger any email flow (checkup, Monday brief). Check Mailgun logs. Zero sends.
2. On production (after setting env var): trigger a test email to corey@getalloro.com. Confirm delivery.
3. `grep -r "ALLOW_EMAIL_SEND" src/` returns exactly one file: emailService.ts

Done Gate:
All verification tests pass? Yes = next card. No = fix before proceeding.

---

Card 2: Verify PMS Upload Pipeline
Blast Radius: Green
Complexity: Low
Dependencies: none

What Changes:
- No code changes needed. Fixes already deployed.
- Three bugs were fixed: modal render guard removed orgId dependency, locationId prop added to HomePage upload, Dashboard hardcoded clientId replaced with real org lookup.

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Log in as 1Endo pilot account (multi-location). Navigate to Progress Report. Click upload. Modal should open.
2. Select a location from the dropdown. Upload a test CSV. Verify it lands on the correct location (check `pms_uploads` table: `location_id` should match selected location).
3. Navigate to Home. Click upload. Same test. Verify `location_id` is correct.
4. If clientId is empty (new account without org), modal should show: "Your account setup isn't complete yet."

Done Gate:
All verification tests pass? Yes = next card. No = fix before proceeding.

---

Card 3: Constitution Compliance Sweep (Already Deployed)
Blast Radius: Green
Complexity: Low
Dependencies: none

What Changes:
- No code changes needed. Already on sandbox.
- Demo.tsx: all rank/score/fabricated dollar references replaced with review growth language
- index.html: "See Where You Rank" replaced with "Business Clarity"
- GrowthChart.tsx: tooltip text neutralized
- DoctorDashboardV1.tsx: "Business Clarity Score: X/100" removed
- DashboardSettings.tsx: "Current position: #X" removed
- Marketing CTAs: "See Where You Rank" changed to "Run Your Free Checkup"
- RankingsScreen.tsx: reframed from rank position to competitive landscape (review gap, competitor names, no #X)
- PartnerPortal.tsx: "Business Clarity Score" changed to "Business Clarity Checkup"
- HomePage.tsx: BreathingScore gauge removed, ProgressStory removed. Oz Moment hero opens the page.

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Visit /demo -- no "#X" position numbers anywhere on page. No dollar figures. No score gauges.
2. Visit /home (logged in) -- no score ring at top. Greeting + Oz Moment hero should be first elements.
3. Visit /dashboard/rankings -- header says "Your Market", hero shows review count not rank number.
4. View page source on index.html -- title should be "Alloro - Business Clarity"
5. `grep -r "See Where You Rank" frontend/src/` -- zero results
6. `grep -r "Business Clarity Score" frontend/src/pages/DoctorDashboardV1` -- zero results

Done Gate:
All verification tests pass? Yes = next card. No = fix before proceeding.

---

Card 4: Production Environment Cutover
Blast Radius: Red
Complexity: Medium
Dependencies: Cards 1-3 pass

What Changes:
- Merge sandbox branch to main (or deploy sandbox to production, depending on your pipeline)
- Set `ALLOW_EMAIL_SEND=true` on production environment
- Verify production build succeeds

Touches:
- Database: no (no migrations in this batch)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Production build succeeds with zero errors
2. Production site loads at getalloro.com
3. /demo page loads with no rank numbers, no dollar figures
4. /checkup flow completes end-to-end
5. Test email sends to corey@getalloro.com from production
6. Monday brief job runs successfully on next Monday

Done Gate:
All verification tests pass? Yes = production is live. No = fix before proceeding.

---

## Known Compliance Debt (Not Blocking Production)

These are logged for future cleanup, not blocking the cutover:

| Issue | Scope | Priority |
|-------|-------|----------|
| `#212D40` text color in ~72 files | Marketing, content, admin, partner pages | Low. Cosmetic. Sweep when v2 file list is known. |
| `font-bold` in scattered files | Various non-primary pages | Low. Should be `font-semibold`. |
| RankingsScreen still stores `position` in DB | Backend data model | Medium. Backend still writes position data. Frontend no longer displays it as a rank claim. Data is useful for internal tracking. |
| GrowthChart shows position data as line chart | Dashboard component | Medium. The component still renders position numbers in the chart. Tooltip fixed but Y-axis shows position values. Product decision: reframe chart around review count growth? |

---

## What's NOT in This Handoff

- PMS components still use dental terms (14+ files). Separate work order.
- Onboarding wizard dental terms. Separate work order.
- Foundation/Heroes pages. Already deployed and bypassing trial gates.
