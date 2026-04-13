# Navigation

> Read this first. Every session. Before anything else.
> This is the GPS, not the map. The map is `docs/PRODUCT-OPERATIONS.md`.
> Update this document after every meaningful action. If position is stale, the nav is useless.

---

## Destination

Alloro replaces the question. The owner doesn't search, doesn't ask, doesn't know they needed to know. The answer arrives Monday morning. Five pages, five questions, one product. Every number verifiable with a link. The app is the product. The email is a notification.

The destination is defined by the 15 Knowns in the Product Constitution. If all Knowns pass, the product works. Everything else is a variable.

"Business Clarity" is the created category Alloro owns. Like HubSpot owns "inbound marketing." Never strip this from marketing.

---

## Current Position

**Last updated:** April 12, 2026 (evening -- post-production-readiness sweep)
**Branch:** sandbox
**EC2 sandbox:** Auto-deploys on push. No Dave dependency.

### Production Readiness Sweep (April 12 -- Cowork session)

Corey directive: "The sandbox is 100% ready to go straight into production. The entire dashboard and process needs to be ready to be sent to anyone."

253 files changed across two commits:

| Commit | Description |
|--------|-------------|
| `36f80b0e` | Brand cleanup, design system compliance, semantic fixes, Layer 2 script, TS type fixes |
| `93b979f1` | Restore "Business Clarity" category name (was incorrectly stripped with Score) |

### What was fixed

| Category | Scope | Details |
|----------|-------|---------|
| Brand cleanup | ~30 files | "Business Clarity Score" removed (K6). "Business Clarity Brief" -> "Monday Brief". Old "SignalsAI" references removed. "Business Clarity" as category RESTORED. |
| Design system | ~150 files | #212D40 -> #1A1D23, font-bold -> font-semibold, em-dashes removed. Entire frontend. |
| Broken promises | 2 files | BuildingScreen: "Coming soon" -> "In your dashboard now". ResultsScreen: Unfulfillable notification promise removed. |
| Dead features | 1 file | BuildingScreen referenced v1 website preview feature not in v2. |
| Dental terms | 5 files | HowItWorks, PMSUploadModal, PMSVisualPillars, UploadPrompt, MarketingFooter. "patient" -> "client" where customer-visible. |
| Hardcoded URLs | 2 files | templateRenderer.ts: window.location.origin. base.ts/MondayBriefEmail.ts: LOGO_URL env-aware. |
| Type bugs | 1 file | PMSVisualPillars: wizard demo data mismatches (doctor->partner, mktProduction->mktRevenue). Pre-existing TS errors. |
| Browser tab | 1 file | CheckupLayout: old brand name in title tag. |

### Verification gates

| Gate | Result |
|------|--------|
| TypeScript | Zero errors |
| Vite build | Passes (sandbox filesystem blocks rmSync, not a code issue) |
| Layer 1 (pattern) | 6/9 PASS. 3 known pre-existing: K2 backend scoring, K4 illustrative $$ in content pages, K6 BreathingScore component (unused in v2). |
| Layer 2 (semantic) | 8/8 PASS. 1 warning: GBP OAuth callback (Dave Card 8). |

### New tooling

**scripts/constitution-check-layer2.sh** -- Semantic compliance check.
Scans 49 customer-reachable files across 8 checks:
1. Broken promises (unfulfillable copy)
2. Dental terms in generic pages
3. Old brand names (Business Clarity Score, SignalsAI)
4. Hardcoded production URLs
5. Dead feature references
6. Placeholder/test data
7. Layer 1 regressions in customer files
8. Empty state quality

### Dave tasks pending

| Card | Issue | Blast Radius |
|------|-------|-------------|
| Card 4 | APP_URL env var not set on sandbox EC2 | Yellow |
| Card 8 | GBP OAuth callback hardcoded to production in src/routes/auth/gbp.ts:22 | Red (auth) |

Card 8 requires: (1) Change callback URL to read from process.env.APP_URL, (2) Add sandbox redirect URI in Google Console.

### What's deployed and committed (on sandbox branch)

All commits below are on sandbox. Push needed from local machine to trigger auto-deploy.

| Item | Commit | Confidence |
|------|--------|------------|
| Production readiness sweep (253 files) | 36f80b0e | Green (TypeScript clean, Layer 2 8/8 PASS) |
| Business Clarity category restoration | 93b979f1 | Green |
| WO-60 Flywheel Dashboards | pending commit | Green (TypeScript clean) |
| All prior foundation sprint work | See Route History | Yellow (not browser-verified) |

### What's NOT done

| Item | Risk | Notes |
|------|------|-------|
| Push to sandbox remote | Blocking deploy | Needs credentials (push from local) |
| Browser verification (phone test) | Yellow | Code-verified, not browser-verified |
| Dave Card 4 + Card 8 | Yellow/Red | APP_URL env var + GBP OAuth |

### Home page hero status

RESOLVED. The Oz Moment system IS the hero. It shows intelligence findings from the backend, with client-side fallback from readings data. BreathingScore (K6 violation) was removed. ProgressStory was tabled. The Oz Moment fills the hero slot.

---

## Next Waypoint

### Waypoint 1: Push commits to sandbox, verify deploy

**Why:** Two commits (36f80b0e, 93b979f1) are on the local sandbox branch but not pushed to remote. Sandbox auto-deploys on push. Cannot browser-verify until deployed.

**Done gate:** `git push origin sandbox` succeeds. Sandbox URL loads with changes.

### Waypoint 2: End-to-end phone test on sandbox URL

**Why:** Code is verified. Browser experience is not. One real phone, one QR scan, one full run: entry -> scanning -> results -> account creation -> dashboard. Timed.

**Done gate:** Corey completes the walkthrough. Reports what worked and what didn't.

### Waypoint 3: WO-60 Flywheel Dashboards (admin ops)

**Why:** Internal HQ dashboards need flywheel metrics. VisionaryView (Corey), IntegratorView (Jo), BuildView (Dave). Yellow blast radius. Serves Inevitable Unicorn North Star.

**Done gate:** All three view upgrades committed. Real Stripe MRR. Conversion funnel. One Decision Card.

### Waypoint 4: Send Dave clean handoff

**Why:** Cards 4 and 8 need Dave execution. Prior cards (1-3, 5-6) need delivery.

**Done gate:** Dave has received clean handoff in #alloro-dev.

---

## Route History

| Date | Waypoint | Result |
|------|----------|--------|
| April 12 (AM) | Foundation sprint code (Cards 1-6) | Committed and pushed to sandbox |
| April 12 (AM) | Dave handoff doc | Written. Card 4 violated K6 -- pulled. |
| April 12 (AM) | Compliance audit | 72 files #212D40, 5 files "Business Clarity Score", 4 files computeHealth. |
| April 12 (AM) | Constitution check Layer 1 | scripts/constitution-check.sh. Critical path 7/7 PASS. |
| April 12 (PM) | Production readiness sweep | 253 files. Brand, design system, semantic fixes. Layer 2 script built. 8/8 PASS. |
| April 12 (PM) | Business Clarity category restored | 9 files. Corey correction: BC is the created category. Only Score is K6. |
| April 12 (PM) | Type bug fix | PMSVisualPillars wizard demo data mismatches fixed. |
| April 12 (PM) | WO-60 Flywheel Dashboards | VisionaryView (real Stripe MRR, flywheel velocity, decision card, funnel). IntegratorView (5-stage pipeline, auto-actions, team load). BuildView (live webhook health, improved system status). New endpoint: /api/admin/revenue/mrr. |

---

## How to Use This Document

**Session start:** Read Current Position. Is it stale? Update it. Then read Next Waypoint. Do that.

**After every commit:** Update "deployed and committed" table. Move items from uncommitted to committed.

**After every verification:** Update confidence from Yellow to Green (or Red if it fails).

**When priorities shift:** Corey updates Destination or reorders waypoints. The route recalculates. The destination stays.

**Pre-presentation gate:** Before showing any work to Corey, run the 5-item filter in CLAUDE.md. If any item is NO, fix it or flag it explicitly. Corey validates feel and vision. Claude catches everything else first.
