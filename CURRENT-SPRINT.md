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

**Last updated:** April 13, 2026 (evening -- post-transcript-analysis + system fixes)
**Branch:** sandbox
**EC2 sandbox:** Auto-deploys on push. No Dave dependency.

### April 13 Session Summary

Two sessions today: (1) fire list fixes + content quality lint, (2) Fireflies transcript analysis + operating protocol upgrade.

**Fire list fixes (4 commits, pushed to sandbox remote):**

| Commit | Description |
|--------|-------------|
| `fa1bd9c0` | ComparePage: hasData gate prevents zero-value renders, WarmEmptyState when no data |
| `1763b25c` | ReferralProgram: removed hardcoded endodontics/SLC fallback, replaced with generic copy |
| `855bf2ba` | 12+ content pages: removed unverified dollar figures ($14k, $27k, etc.), kept verified Alloro pricing |
| `cafae254` | content-quality-lint.sh: 6-check static analysis gate (5 PASS, 1 WARNING) |

**System improvements (uncommitted -- memory/protocol files):**
- Operating protocol: added upstream session discipline (thinking vs build sessions, decision lock gate, AI content safety gate)
- Session contract: new file for Corey-Claude session start (memory/context/session-contract.md)
- Memory files: Dave and Corey profiles updated with April 13 transcript quotes
- ReferralMatrices.tsx: "PMS" -> generic language in empty states

### Prior work still on sandbox (April 12)

| Commit | Description |
|--------|-------------|
| `36f80b0e` | Production readiness sweep: 253 files, brand cleanup, design system, semantic fixes |
| `93b979f1` | Business Clarity category restoration |
| Dave pattern audits | JSDoc, console tags, response shapes, hardcoded URLs (4 commits) |
| Dave Confidence Sheet | docs/DAVE-CONFIDENCE-SHEET.md |

### Verification gates

| Gate | Result |
|------|--------|
| TypeScript | Zero errors (verified April 13 during fire list commits) |
| Content quality lint | 5/6 PASS, 1 WARNING (ReviewRequests.tsx || 0 without empty state -- non-blocking) |
| Layer 2 (semantic) | 8/8 PASS |

### Tooling (4 automated quality scripts)

1. **scripts/constitution-check.sh** -- Layer 1 pattern compliance
2. **scripts/vertical-sweep.sh** -- Vertical leakage detection
3. **scripts/data-flow-audit.sh** -- Logic bugs grep can't find
4. **scripts/content-quality-lint.sh** -- Placeholder data, unsafe defaults, dollar figures, auth bypass, design system

### Dave tasks pending

| Card | Issue | Blast Radius |
|------|-------|-------------|
| Card 4 | APP_URL env var not set on sandbox EC2 | Yellow |
| Card 8 | GBP OAuth callback hardcoded to production in src/routes/auth/gbp.ts:22 | Red (auth) |

### What's NOT done (AAE-critical)

| Item | Risk | Notes |
|------|------|-------|
| Browser verification (phone test) | Yellow | Code-verified, not browser-verified. Must happen before AAE. |
| Dave Card 4 + Card 8 | Yellow/Red | APP_URL env var + GBP OAuth. Card 8 blocks GBP demo. |
| Demo seed data | Low | Dental-only content, fabricated $$ in seed. Static fallback Demo.tsx works without it. |
| DEMO_MODE env var on EC2 | Unknown | Auto-login path needs this. Static fallback doesn't. |

### What IS done

| Item | Confidence |
|------|------------|
| All fire list items fixed and committed | Green |
| Production readiness sweep (253 files) | Green |
| Content quality lint passing | Green |
| Operating protocol upgraded with upstream discipline | Green |
| Session contract written | Green |
| Dave handoff package ready (Confidence Sheet + Slack message) | Green |
| AAE demo code audited -- static fallback is conference-safe | Green |

---

## Next Waypoint

### Waypoint 1: Browser verification on sandbox URL

**Why:** All code is committed and pushed. 4 automated quality scripts pass. But nobody has loaded the sandbox in a browser and walked through it. AAE is April 15. This is the single highest-risk gap.

**Done gate:** Corey completes one phone walkthrough: entry -> scanning -> results -> dashboard. Reports what worked and what didn't.

### Waypoint 2: Send Dave clean handoff

**Why:** Cards 4 and 8 need Dave execution. Confidence sheet + Slack message are written (docs/DAVE-CONFIDENCE-SHEET.md, docs/DAVE-SLACK-MESSAGE.md). Dave's bandwidth is split across DentalEMR, 1Endo, AAE landing page. The earlier he gets this, the better.

**Done gate:** Dave has received clean handoff in #alloro-dev.

### Waypoint 3: Send 3 client draft emails

**Why:** Pre-AAE touchpoint. Shawn (McP Endo), Merideth (DentalEMR), Dr. Kargoli (1Endo). Dashboard updates they reference must be deployed and browser-verified first.

**Done gate:** Emails sent.

### Waypoint 4 (post-AAE queue): Cleanup

- ReviewRequests.tsx empty state (lint warning)
- Demo seed data: remove fabricated dollar figures, add non-dental verticals
- Wire lint scripts into CI as pre-commit gates
- 1Endo location switcher + review count (needs DB access)

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
| April 12 (PM) | Dave pattern audit round 1 | 15 files: JSDoc headers, console tags, response shapes. Commit d4b0044f. |
| April 12 (PM) | Dave pattern audit round 2 | 15 more files: hardcoded localhost URLs replaced with API_BASE_URL, remaining JSDoc + console tags. Commit 1fe758a1. |
| April 12 (PM) | Response shape alignment batch 1 | All API responses have { success: boolean }. Commit 8198512d. |
| April 12 (PM) | Response shape alignment batch 2 | Intelligence, SEO, auth, webhooks aligned. Commit df69d797. |
| April 12 (PM) | Dave Confidence Sheet | docs/DAVE-CONFIDENCE-SHEET.md answering his 3 validation gates. Commit ce5f66ce. |
| April 12 (PM) | Dave Slack Message | docs/DAVE-SLACK-MESSAGE.md copy-paste ready for #alloro-dev. |
| April 12 (PM) | AAE demo code audit | Full trace: /aae -> EntryScreen -> ScanningTheater -> ResultsScreen -> BuildingScreen -> UploadPrompt. Conference mode resilient: 5s timeout, offline fallback, personalized data. Zero broken paths. |
| April 12 (PM) | Client fire scan | Slack, Fireflies, Gmail last 48hrs. No fires. 1Endo go-live in progress (Jo handling). 3 client draft emails ready to send. |
| April 13 (PM) | Fire list fixes | ComparePage hasData gate, ReferralProgram fallback removed, dollar figures removed from 12+ content pages. 4 commits pushed. |
| April 13 (PM) | Content quality lint | 6-check static analysis script. 5 PASS, 1 WARNING. |
| April 13 (PM) | Demo.tsx audit | Full trace of AAE booth demo flow. Static fallback is conference-safe. Seed data has dental-only content + fabricated $$. |
| April 13 (PM) | Transcript analysis | Fireflies transcript (1095 lines) analyzed line-by-line. 5 friction points identified. |
| April 13 (PM) | Operating protocol upgrade | Upstream session discipline added: thinking vs build sessions, decision lock, AI content safety gate. |
| April 13 (PM) | Session contract | New file: memory/context/session-contract.md. Read-at-session-start discipline for Corey-Claude sessions. |
| April 13 (PM) | Memory updates | dave.md: upstream quality quotes. corey.md: session pattern diagnosis. |

---

## How to Use This Document

**Session start:** Read Current Position. Is it stale? Update it. Then read Next Waypoint. Do that.

**After every commit:** Update "deployed and committed" table. Move items from uncommitted to committed.

**After every verification:** Update confidence from Yellow to Green (or Red if it fails).

**When priorities shift:** Corey updates Destination or reorders waypoints. The route recalculates. The destination stays.

**Pre-presentation gate:** Before showing any work to Corey, run the 5-item filter in CLAUDE.md. If any item is NO, fix it or flag it explicitly. Corey validates feel and vision. Claude catches everything else first.
