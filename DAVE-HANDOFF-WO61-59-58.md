# Dave Handoff: Foundation Sprint (WO-58 + WO-61 + WO-59)

Branch: sandbox | Pushed: Yes | TypeScript: CLEAN (frontend + backend)
Total: 8 commits, 16 files, +1,506 / -105 lines
No database migrations. No new API endpoints. No env vars needed.

Cards are ordered simplest-first by complexity, as requested.
Each card maps to a specific commit so you can review/cherry-pick per card.

---

## Card 1: Vertical Intelligence Profiles (Single Source of Truth)

Commit: `fadb7b32`
Blast Radius: Green
Complexity: Low
Dependencies: none

### Why:

Previously, vertical-specific data (review benchmarks, competitive radii, case values, conversion rates) was scattered across 3+ files with hardcoded maps that drifted out of sync. This consolidates all 22 verticals into one config file. Existing consumers still work via backward-compatible map builders.

### What Changes:

- `src/config/verticalProfiles.ts`: NEW file (676 lines). 22 verticals profiled. Each has: googlePlaceTypes, reviewBenchmark, competitiveRadiusMiles, avgCaseValue, conversionRate, intelligenceMode, vocab, broadeningCategory. Includes resolveVertical() alias mapping, getVerticalProfile() lookup, and backward-compatible map builders.
- `src/services/businessMetrics.ts`: REVIEW_VOLUME_BENCHMARKS and COMPETITIVE_RADII_MILES now derived from verticalProfiles.ts via buildReviewBenchmarksMap() and buildCompetitiveRadiiMap(). Removed ~60 lines of hardcoded maps.
- `src/routes/checkup.ts`: Removed 36-line inline specialtyEconomics object. Replaced with import of getAvgCaseValue() and getConversionRate() from verticalProfiles.ts.
- `frontend/src/constants/businessMetrics.ts`: Updated to include canonical vertical keys alongside alias entries for backward compatibility.

### Touches:

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests:

1. Run a checkup for a dental practice. Verify avgCaseValue in the response matches verticalProfiles.ts (e.g., endodontist = $1,400).
2. Run a checkup for a non-dental vertical (e.g., "barber"). Verify it gets correct economics ($40 avgCaseValue).
3. Verify REVIEW_VOLUME_BENCHMARKS still contains all previous keys: `node -e "const m = require('./src/services/businessMetrics'); console.log(Object.keys(m.REVIEW_VOLUME_BENCHMARKS).length)"` -- should be 30+.
4. Verify backward compatibility: `node -e "const m = require('./src/services/businessMetrics'); console.log(m.REVIEW_VOLUME_BENCHMARKS['endodontist'])"` -- should print 40.

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 2: PatientPath Branding Cleanup

Commits: `4d7c3391` + `7d6cf2dd`
Blast Radius: Green
Complexity: Low
Dependencies: none

### Why:

Customer-facing page had "PatientPath" branding (internal product name) visible. Changed to generic "Your Website." Also fixed all design system violations (font-bold to font-semibold, #212D40 to #1A1D23, billing CTA button from bg-[#212D40] to bg-[#D56753]).

### What Changes:

- `frontend/src/pages/dashboard/PatientPathPreview.tsx`: Changed "Your PatientPath Site" to "Your Website". Fixed all h1 elements: font-bold to font-semibold, text-[#212D40] to text-[#1A1D23] (lines 76, 101). Changed billing CTA button from bg-[#212D40] to bg-[#D56753] (line 139).

### Touches:

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests:

1. Navigate to /dashboard/patientpath-preview. Page title should read "Your Website", not "Your PatientPath Site".
2. Inspect the h1 element. Should have class font-semibold (not font-bold) and text color #1A1D23 (not #212D40).

### Design System Check:

- No text below 12px (min: text-xs)
- No font-black or font-extrabold (max: font-semibold)
- No #212D40 for text (use #1A1D23)

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 3: Warm Empty States + Alive Greeting

Commit: `627c107a`
Blast Radius: Green
Complexity: Low
Dependencies: none

### Why:

New customers landing on the dashboard with no data yet saw cold skeleton loaders and generic text. Now they see a time-aware greeting ("Good morning, Dr. Chen") and warm, encouraging empty states that set expectations ("We're gathering your competitive picture").

### What Changes:

- `frontend/src/components/dashboard/WarmEmptyState.tsx`: New component. Replaces cold "no data" skeleton loaders with encouraging, contextual messages per page.
- `frontend/src/pages/HomePage.tsx`: Imports WarmEmptyState. Time-aware greeting ("Good morning, Dr. Chen"). Replaced cold empty state at ~line 698.
- `frontend/src/pages/ComparePage.tsx`: Imports WarmEmptyState. Replaced "Your competitive picture is building" skeleton with warm state.
- `frontend/src/pages/ProgressReport.tsx`: Imports WarmEmptyState. Replaced skeleton loader empty state.

### Touches:

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests:

1. Open /dashboard with a new org (no ranking data). Greeting should show first name + time of day. Empty state should show warm messaging, not skeleton loaders.
2. Open /compare with no ranking data. Should show warm empty state, not cold gray text.
3. Open /progress with no ranking data. Should show warm empty state.
4. Existing orgs with data: all three pages should render normally (WarmEmptyState only shows when data is absent).

### Design System Check:

- All text in WarmEmptyState.tsx: min text-xs (12px), max font-semibold, text color #1A1D23
- No skeleton loaders or gray placeholder text remaining on empty state paths

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 4: Breathing Score Ring + Progress Story

Commit: `d1e076d4`
Blast Radius: Green
Complexity: Medium
Dependencies: Card 3 (renders on the same HomePage, below greeting)

### Why:

The dashboard showed raw numbers without synthesis. Breathing Score is an animated health ring that rolls up all readings into one "temperature" (healthy/attention/critical). Progress Story replaces static deltas with a narrative arc: "Week 6. You started with 31 reviews. You're at 47 now." Both make the dashboard feel alive and personally relevant.

### What Changes:

- `frontend/src/components/dashboard/BreathingScore.tsx`: New component (~180 lines). Animated SVG health ring. Synthesizes readings into fraction, determines status (healthy/attention/critical). Pulsing center dot, color shifts, delta badge. Click expands dropdown showing which readings drive the temperature.
- `frontend/src/components/dashboard/ProgressStory.tsx`: New component (~140 lines). Narrative arc replacing static numbers. Adapts based on tenure, review delta, weekly velocity, competitive gap.
- `frontend/src/pages/HomePage.tsx`: Added BreathingScore between greeting and Oz Moment. Added ProgressStory below BreathingScore. Extracts checkup data for startReviews, currentReviews, competitor info.

### Touches:

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests:

1. Open /dashboard for an org with ranking data. Breathing Score ring should appear below greeting. Ring should be colored (green/amber/red) based on readings.
2. Click the Breathing Score ring. Dropdown should expand showing individual readings.
3. Progress Story should appear below Breathing Score with narrative text including review count, tenure, and competitor name if available.
4. For orgs with no ranking data: BreathingScore and ProgressStory should not render (they rely on data props).

### Design System Check:

- BreathingScore.tsx: status colors (green/amber/red) should use consistent palette, not arbitrary hex
- ProgressStory.tsx: all text min text-xs, max font-semibold, color #1A1D23
- No font-black or font-extrabold in either component

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 5: Trial Gate (Soft Banner + Hard Overlay + Middleware)

Commit: `4c33b9b8`
Blast Radius: Yellow (touches billing middleware + auth path)
Complexity: Medium
Dependencies: none

### Why:

No mechanism existed to convert trial users to paying customers. This adds a soft nudge (dismissable banner when trial has <= 3 days left) and a hard gate (full-screen overlay when trial expires). Foundation/Heroes customers are always exempt. The billingGate middleware now returns specific error codes (TRIAL_GRACE, TRIAL_EXPIRED) so the frontend can react accordingly.

### What Changes:

- `frontend/src/components/dashboard/TrialBanner.tsx`: New component (~80 lines). Soft gate shown when trial has <= 3 days remaining. Dismissable but reappears daily (localStorage). Loss-aversion copy names the competitor.
- `frontend/src/components/dashboard/TrialExpiredOverlay.tsx`: New component (~70 lines). Full-screen overlay blocking dashboard access when trial expired. Shows one finding as hook.
- `frontend/src/components/FivePageLayout.tsx`: Added trial state logic. Fetches dashboard-context, computes showTrialBanner and showTrialExpired. Foundation/Heroes exempt. TrialExpiredOverlay rendered as fixed overlay. TrialBanner rendered after mobile header.
- `src/middleware/billingGate.ts`: Added `account_type` to org select query. Added Foundation/Heroes bypass (returns next() immediately). Added active subscription pass-through. Added grace period: 3 days after trial end = TRIAL_GRACE error code. After grace = TRIAL_EXPIRED error code.

### Touches:

- Database: no (reads existing columns: account_type, trial_end_at, subscription_status)
- Auth: YES (billingGate middleware is in the auth path)
- Billing: YES (trial expiry logic, Foundation bypass)
- New API endpoint: no

### Verification Tests:

1. Foundation/Heroes account: navigate all pages. No trial banner, no overlay, no lockout. Confirm with SQL: `SELECT account_type FROM organizations WHERE id = [org_id]`
2. Active subscriber: navigate all pages. No trial banner, no overlay.
3. Trial account with 2 days remaining: TrialBanner should appear at top of every page. Should be dismissable. Should show competitor name if available.
4. Trial account with 0 days remaining (within 3-day grace): TrialExpiredOverlay should appear. Should show "Subscribe" CTA. Should show one finding as hook.
5. Trial account expired > 3 days ago: Full lockout overlay. API calls should return 402 with errorCode "TRIAL_EXPIRED".
6. Network tab: billingGate should add account_type to its org query. Foundation orgs should get 200 on all protected routes.

### Design System Check:

- TrialBanner.tsx: text min text-xs, max font-semibold, no #212D40
- TrialExpiredOverlay.tsx: overlay text readable, CTA button consistent with existing button styles

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 6: Intelligence Paywall (BlurGate)

Commit: `2e7e8da6`
Blast Radius: Green
Complexity: Low
Dependencies: Card 5 (useSubscriptionGate relies on billingGate behavior)

### Why:

Free/expired users could see all competitive intelligence data. Now premium sections (competitive data on Compare, reading trends on Progress) are blurred with a subscribe overlay. Foundation/Heroes always see everything. This creates a clear value gate: "You can see Alloro is working. Subscribe to see the details."

### What Changes:

- `frontend/src/components/dashboard/BlurGate.tsx`: New component (~60 lines). Wraps children with CSS blur filter + subscribe overlay when locked. "Alloro is still collecting this data. Subscribe to see it."
- `frontend/src/hooks/useSubscriptionGate.ts`: New hook (~30 lines). Centralizes subscription state: checks billingStatus, Foundation status, trial state. Returns { locked, onSubscribe, isSubscribed, isFoundation, trialActive }. Foundation/Heroes always pass.
- `frontend/src/pages/ComparePage.tsx`: Added BlurGate wrapping all competitive data sections. Added useSubscriptionGate hook.
- `frontend/src/pages/ProgressReport.tsx`: Added BlurGate wrapping reading trends through proofline. Added useSubscriptionGate hook.

### Touches:

- Database: no
- Auth: no
- Billing: no (reads state from existing dashboard-context API)
- New API endpoint: no

### Verification Tests:

1. Active subscriber on /compare: all data visible, no blur.
2. Expired trial on /compare: competitive data sections should be blurred with subscribe overlay.
3. Active subscriber on /progress: all data visible, no blur.
4. Expired trial on /progress: reading trends through proofline should be blurred.
5. Foundation account: no blur on any page regardless of subscription status.

### Design System Check:

- BlurGate overlay text: min text-xs, max font-semibold, color #1A1D23
- Subscribe CTA styling consistent with existing buttons (no new button styles)

### Done Gate:

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Summary Table

| Order | Feature | Commit | Blast Radius | Complexity | Dependencies |
|-------|---------|--------|-------------|-----------|-------------|
| 1 | Vertical Intelligence Profiles | `fadb7b32` | Green | Low | none |
| 2 | PatientPath Branding Cleanup | `4d7c3391` + `7d6cf2dd` | Green | Low | none |
| 3 | Warm Empty States + Greeting | `627c107a` | Green | Low | none |
| 4 | Breathing Score + Progress Story | `d1e076d4` | Green | Medium | Card 3 |
| 5 | Trial Gate (Banner + Overlay + Middleware) | `4c33b9b8` | Yellow | Medium | none |
| 6 | Intelligence Paywall (BlurGate) | `2e7e8da6` | Green | Low | Card 5 |

Cards 1-3 are independent Green/Low changes -- safe to merge in any order.
Card 4 depends on Card 3 (same page layout).
Card 5 is the only Yellow (auth/billing middleware) -- review carefully.
Card 6 depends on Card 5's subscription state.

Additional commit: `230cf3f9` -- restores customerOutcomeTracker.ts deleted by a prior index conflict. No feature change, just file restoration.

---

## Relationship to Product Map Google Doc

This handoff covers WO-58 (Vertical Profiles), WO-59 (Trial Gate + BlurGate), and WO-61 (Breathing Score + Warm States) only. These are a subset of the full Product Map. The remaining Product Map features (AAE, email infrastructure, Google API writes, etc.) are separate future work orders and are NOT included here.
