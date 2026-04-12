# Engineer Handoff: Interpretation Layer + Delivery Gap

**Date:** April 11, 2026
**From:** Corey (via AI)
**To:** Dave
**Branch:** sandbox
**Status:** Code complete, pending commit (git lock files need clearing, see Card 0)

---

## Context

The sandbox dashboard now has a contextual interpretation layer on every customer-facing reading. Instead of just showing numbers, each reading tells the owner what their numbers mean for their specific business. This is computed from their actual data, not templates.

Two commits cover this work:
1. `67284f0e` (already on sandbox): proof-of-work endpoint, proofline timeline, review trajectory, competitor velocity
2. Staged but uncommitted: interpretation sentences on Home, Compare, Progress pages + universal language fixes

---

Card 0: Clear Git Lock Files
Blast Radius: Green
Complexity: Low
Dependencies: none

What Changes:
- .git/HEAD.lock: delete stale lock file
- .git/index.lock: delete if exists

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Run `rm -f .git/HEAD.lock .git/index.lock` from repo root
2. Run `git status` and confirm clean output (3 staged files, no lock warnings)
3. Run `git commit` with the staged changes (message below):

```
feat: add interpretation layer to Home, Compare, and Progress pages

Every reading now carries a computed, magnitude-aware interpretation
sentence. Reviews show time-to-close or lead context. GBP actions
identify the top conversion channel. GBP profile flags missing fields
with severity. Progress computes weekly review rate and competitor
gap trajectory. Universal language applied across all three pages
(business not practice, people not patients).
```

Done Gate:
Commit succeeds and `git log --oneline -1` shows the new commit? Yes = next card. No = fix first.

---

Card 1: Proof-of-Work Backend Endpoint (ALREADY DEPLOYED)
Blast Radius: Yellow (new API endpoint)
Complexity: Medium
Dependencies: none

What Changes:
- src/routes/user/proofOfWork.ts: NEW file. Serves three datasets: prooflineTimeline (from agent_results where type = proofline), reviewTrajectory (from weekly_ranking_snapshots + practice_rankings), competitorLandscape (from latest ranking raw_data)
- src/index.ts: registered route at /api/user/proof-of-work

Touches:
- Database: read-only (agent_results, weekly_ranking_snapshots, practice_rankings)
- Auth: uses existing auth middleware
- Billing: no
- New API endpoint: yes, GET /api/user/proof-of-work

Verification Tests:
1. `curl -H "Authorization: Bearer <token>" https://sandbox.getalloro.com/api/user/proof-of-work` returns JSON with prooflineTimeline, reviewTrajectory, competitorLandscape arrays
2. prooflineTimeline entries have: date, action, detail fields
3. reviewTrajectory entries have: weekStart, reviewCount fields
4. Network tab on Progress page shows the request succeeding

Done Gate:
Endpoint returns valid data for at least one test customer? Yes = next card. No = fix first.

---

Card 2: Home Page Interpretation Layer
Blast Radius: Green
Complexity: Medium
Dependencies: Card 0

What Changes:
- frontend/src/pages/HomePage.tsx: extractReadings() function enhanced

Specific changes in extractReadings():
1. Reviews reading: computes reviewContext with time-to-close if behind competitor (`gap / 2 weeks`), or magnitude-aware lead message (500+/100+/small/tied)
2. GBP Actions reading: identifies top conversion channel (Calls vs Directions vs Website clicks), adds interpretation sentence
3. GBP Profile reading: counts missing fields, returns magnitude-aware message (0 missing = all complete, 1-2 = minor, 3+ = credibility risk)
4. Language: "your practice" changed to "your business" in buildFallbackHero

Touches:
- Database: no (reads from existing queries)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Log in as any customer on sandbox
2. Home page "Your Readings" section: each reading card shows a gray text interpretation below the value
3. Reviews reading: if behind competitor, shows "X leads by Y. At 2 per week, you close it in Z." If ahead, shows lead magnitude message
4. GBP Actions reading: shows "Calls are your top conversion channel" (or Directions/Website clicks)
5. GBP Profile reading: shows field completion status with severity
6. No instances of "your practice" remain on Home page

Done Gate:
All five verification tests pass visually in browser? Yes = next card. No = fix first.

---

Card 3: Compare Page Interpretation Layer
Blast Radius: Green
Complexity: Medium
Dependencies: Card 0

What Changes:
- frontend/src/pages/ComparePage.tsx: three language changes + lead interpretation block

Specific changes:
1. "How Easily Patients Find You" heading changed to "How Easily People Find You"
2. "patient searches" changed to "searches in your area"
3. "Your practice" changed to "Your business"
4. New magnitude-aware lead interpretation block: computes lead size, returns one of five messages (500+ moat, 100+ significant, 20+ solid, narrow, tied)

Touches:
- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Load Compare page for any customer
2. Search visibility section heading reads "How Easily People Find You"
3. No instances of "patients" or "practice" on the page
4. If customer leads competitor: interpretation paragraph appears below the lead count with magnitude-appropriate message
5. Text never says "moat" for a lead under 500

Done Gate:
All four verification tests pass? Yes = next card. No = fix first.

---

Card 4: Progress Page Interpretation Layer
Blast Radius: Green
Complexity: Medium
Dependencies: Card 0, Card 1

What Changes:
- frontend/src/pages/ProgressReport.tsx: review trend context enhanced

Specific changes:
1. Computes weekly review rate: `delta / (daysActive / 7)` rounded to 1 decimal
2. Shows "+X reviews since you joined (Y/week)" instead of raw count
3. If behind competitor: appends "CompetitorName is X ahead. Closeable in Y months at 2/week."
4. If ahead: appends "You lead CompetitorName by X" with magnitude context (100+ = "That gap compounds.")

Touches:
- Database: no (reads from proof-of-work query already added in Card 1)
- Auth: no
- Billing: no
- New API endpoint: no

Verification Tests:
1. Load Progress page for any customer with review data
2. Review trend section shows weekly rate calculation, not just raw delta
3. If competitor data exists: competitor gap context appears in the trend summary
4. Bar chart "Review Count Over Time" renders with data from proof-of-work endpoint
5. "What Alloro Did" proofline timeline renders below the chart

Done Gate:
All five verification tests pass? Yes = next card. No = fix first.

---

## Summary for Dave

Three files changed, 86 insertions, 30 deletions. All frontend. No database changes, no auth changes, no billing changes. TypeScript compiles clean (`npx tsc -b --force` passes with zero errors).

The interpretation layer connects directly to the "Alloro as a Product" diagram you built on April 8. These are the "real product components to narrow down and optimize" you identified. The readings are the blood panel. The interpretations are the doctor explaining the results.

Sandbox auto-deploys on push. Once the git locks are cleared and the commit lands, it's live.
