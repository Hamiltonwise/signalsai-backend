# Navigation

> Read this first. Every session. Before anything else.
> This is the GPS, not the map. The map is `docs/PRODUCT-OPERATIONS.md`.
> Update this document after every meaningful action. If position is stale, the nav is useless.

---

## Destination

Alloro replaces the question. The owner doesn't search, doesn't ask, doesn't know they needed to know. The answer arrives Monday morning. Five pages, five questions, one product. Every number verifiable with a link. The app is the product. The email is a notification.

The destination is defined by the 15 Knowns in the Product Constitution. If all Knowns pass, the product works. Everything else is a variable.

---

## Current Position

**Last updated:** April 12, 2026 (late evening -- post-AAE-triage)
**Branch:** sandbox
**EC2 sandbox:** Auto-deploys on push. No Dave dependency.

### AAE Triage (Cowork + CC joint analysis)

The self-serve checkup flow (QR scan -> trial) is the AAE product. Not a booth demo.
Path: EntryScreen -> ScanningTheater -> ResultsScreen -> BuildingScreen -> ColleagueShare -> OwnerProfile -> Dashboard.
Constitution compliance: critical path 7/7 PASS (scripts/constitution-check.sh --critical-path).

Two issues found. Cards written in docs/AAE-READINESS-CARDS.md. CC executes.

| Issue | Severity | Card | Status |
|-------|----------|------|--------|
| Conference fallback shows fake SLC endodontics competitors to non-dental prospects | Trust-killing if wifi is bad | Card 1 (Green) | Ready for CC |
| "Split the Check" promises discount with no backend | Broken promise post-conference | Card 2 (Yellow -- Corey approved direction) | Ready for CC |
| PMS upload buried after ColleagueShare and OwnerProfile | Banner promises "Which One" but flow doesn't deliver it in first 5 min | Card 6 (Yellow) | Ready for CC |
| PMS upload org resolution bug | Data orphaned silently | Fixed by CC (01d4ff3a) | DONE |

### What's deployed and committed

| Item | Commit | Reflection Result | Confidence |
|------|--------|-------------------|------------|
| Alive Greeting + Warm Empty States | 627c107a | PASS (Known 13, 14) | Yellow -- not browser-verified |
| Breathing Score ring | d1e076d4 | FAIL (Known 6) -- composite score + gauge. Corey did not approve. PULL FROM HANDOFF. | Red -- do not send to Dave |
| Progress Story narrative | d1e076d4 (same commit) | PASS (Known 3, 4, 5) -- raw verifiable data, names competitors. Corey: "feels cheesy." TABLED. | Red -- awaiting Corey direction on home page hero |
| Trial gate (soft banner Day 5, hard overlay Day 8) | 4c33b9b8 | PASS -- Foundation/Heroes bypass confirmed line 102 billingGate.ts | Yellow -- not tested with real trial account |
| Intelligence paywall (blur gate) | 2e7e8da6 | PASS -- isFoundation checks both "foundation" and "heroes" | Yellow -- not browser-verified |
| Vertical Intelligence Profiles (backend) | fadb7b32 | PASS -- self-contained, backward compat | Green |
| PatientPath branding removed | 4d7c3391 | PASS (Known 14) | Yellow -- not browser-verified |
| Design system cleanup in PatientPathPreview.tsx | 7d6cf2dd | PASS (Known 14) | Yellow -- not browser-verified |
| Dave handoff doc (Cards 1-7) | 9d17665d | PARTIAL -- Card 4 must be pulled. Cards 1-3, 5-6 clean. Card 7 not built. | Yellow -- needs revision before send |

### What's changed but uncommitted

| Item | File | Status |
|------|------|--------|
| vocabulary.ts fallback fix (Known 6) | src/routes/vocabulary.ts | Changed "Business Clarity Score" to "Google Health Check". Git locked by Dave's CC session. Commit when lock releases. |
| CLAUDE.md updates (session start + pre-presentation gate) | CLAUDE.md | Two additions. Commit with vocab fix. |
| CURRENT-SPRINT.md | This file | Living doc. |

### Compliance debt (discovered April 12 audit)

| Issue | Scope | Action |
|-------|-------|--------|
| #212D40 color in 72 files | Marketing, content, admin, partner, foundation pages | Wait for Dave's research to determine which files survive v2. Then sweep. |
| "Business Clarity Score" in 5 files | DoctorDashboardV1 (v1, non-primary), PartnerPortal, HowItWorks, TermsOfService, PrivacyPolicy | Legal/marketing pages are customer-reachable. Sweep after Dave sync. |
| computeHealth in 4 files | BreathingScore (FAIL), ResultsScreen, WebsiteDetail, SeoPanel | BreathingScore pulled. Other 3 need review (admin/checkup context may be acceptable). |

### What's NOT done

| Item | Risk | Notes |
|------|------|-------|
| PMS components hardcode dental terms (14+ files) | Red for non-dental verticals | Card 7 in handoff doc. Not built. |
| Onboarding wizard dental terms | Red for non-dental verticals | wizardConfig.ts still says "Upload Your PMS Data" |
| Browser verification of foundation sprint | Yellow | Every card is code-verified, not browser-verified |
| Home page hero decision | Blocked on Corey | BreathingScore pulled (Known 6). ProgressStory tabled (feels cheesy). What opens the home page? |
| Handoff doc revision | Blocked on home page decision | Pull Card 4 entirely, or split BreathingScore out and keep ProgressStory? |

### Reflection system status

| Component | Location | Status |
|-----------|----------|--------|
| Review Queue | Notion: https://www.notion.so/340fdaf120c481e198d0f1610ae7115b | Live. Request 1 loaded (Cards 1-6). |
| Review Results | Notion: https://www.notion.so/340fdaf120c48134b3e1cddbf6e960f9 | Live. Result 1 posted (Cowork self-evaluation). |
| CC clean-room test | Corey running standalone CC session | In progress. Prompt delivered. Awaiting results. |

---

## Next Waypoint

### Waypoint 1: CC executes AAE Readiness Cards (docs/AAE-READINESS-CARDS.md)

**Why this is next:** Two issues in the self-serve checkup flow. Card 1 (conference fallback fake names) is trust-killing and Green blast radius -- CC can execute immediately. Card 2 (Split the Check copy) is Red -- needs Corey's decision on option A, B, or C before CC touches it.

**Done gate:** Card 1 committed and pushed. Card 2 decision made and executed. `constitution-check.sh --critical-path` passes. `npx tsc --noEmit` clean.

### Waypoint 2: End-to-end phone test on sandbox URL

**Why:** Code is verified. Browser experience is not. One real phone, one QR scan, one full run: entry -> scanning -> results -> account creation -> dashboard. Timed. If it works in under 2 minutes, AAE is ready.

**Done gate:** Corey completes the walkthrough. Reports what worked and what didn't.

### Waypoint 3: Resolve home page hero (Corey decision -- deferred from prior sprint)

**Why:** BreathingScore pulled (K6). ProgressStory tabled. Home page hero still needs a decision. Not blocking AAE (prospects land on checkup, not home page), but blocking the post-trial dashboard experience.

**Done gate:** Corey decides. Cards written for CC.

### Waypoint 4: Sync with Dave's research + send clean handoff

**Why:** Dave is running deep research. His findings inform which files survive v2. Handoff doc (docs/handoff-production-cutover.md) needs revision after AAE cards land. Cards 1-3, 5-6 from prior handoff still pending delivery.

**Done gate:** Dave has received clean handoff in #alloro-dev.

---

## Route History

| Date | Waypoint | Result |
|------|----------|--------|
| April 12 | Foundation sprint code (Cards 1-6) | Committed and pushed to sandbox |
| April 12 | Dave handoff doc | Written, committed. Not sent -- Card 4 violated Known 6 |
| April 12 | vocabulary.ts Known 6 fix | Code changed, not yet committed (git locked) |
| April 12 | Reflection system built | Notion Review Queue + Review Results pages created under Alloro HQ |
| April 12 | First reflection test | Card 4 (BreathingScore) caught as Known 6 violation. Cards 1-3, 5-6 clean. |
| April 12 | Compliance audit | 72 files with #212D40, 5 files with "Business Clarity Score", 4 files with computeHealth. Debt logged, sequencing depends on Dave. |
| April 12 | CC clean-room test | Prompt delivered to Corey. Session in progress. |
| April 12 | Dave sync | Slack draft in #alloro-dev. Asking where his research is landing before sending cards. |
| April 12 | K3/K4/K6 compliance sweep | 3 commits: a703e5b6 (Demo.tsx + 7 files), efad7985 (RankingsScreen, HomePage, PartnerPortal, handoff doc), + Corey's push (ResultsScreen, conferenceFallback checkup fixes) |
| April 12 | Constitution check script | scripts/constitution-check.sh built. Critical path 7/7 PASS. Full scan shows known debt (K2 backend, K4 content pages, K14 admin pages). Pending commit. |
| April 12 | AAE triage (Cowork + CC) | Joint analysis of QR-to-trial flow. CC audited, Cowork triaged. Two issues: conference fallback fake names (trust-killing) and Split the Check (broken promise). Cards written in docs/AAE-READINESS-CARDS.md. |

---

## How to Use This Document

**Session start:** Read Current Position. Is it stale? Update it. Then read Next Waypoint. Do that.

**After every commit:** Update "What's deployed and committed" table. Move items from "uncommitted" to "committed."

**After every reflection test:** Update reflection results. Adjust card confidence levels. Log in Route History.

**After every verification:** Update confidence from Yellow to Green (or Red if it fails). Record what was verified and how.

**When priorities shift:** Corey updates Destination or reorders waypoints. The route recalculates. The destination stays.

**When a waypoint completes:** Move it to Route History. Promote the next waypoint.

**When something breaks:** Add it to "What's NOT done" with risk level. If it blocks the current waypoint, note the block.

**Pre-presentation gate:** Before showing any work to Corey, run the 5-item filter in CLAUDE.md. If any item is NO, fix it or flag it explicitly. Corey validates feel and vision. Claude catches everything else first.

**Reflection gate:** Before sending any handoff to Dave, post the work to the Notion Review Queue. Evaluate against the Constitution. Post findings to Review Results. Only send to Dave after all blocking issues are resolved.
