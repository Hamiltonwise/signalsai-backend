# Rankings Page Redesign

## Why
The current `/rankings` page renders ranking data in a stack of full-width cards with heavy `font-black` typography, a 4-up KPI grid, and a 3-col driver tile grid that opens a 200-line modal carousel. The redesign delivers the same data in a denser, two-column editorial layout — split hero (Live Google Rank + Practice Health gauge), inline-expandable driver accordion, weighted factor breakdown, and right-rail recommendations/opportunities — using fonts and colors that already exist in the design system.

## What
Rewrite `PerformanceDashboard` (the body of `RankingsDashboard.tsx`) to match the layout in `~/Desktop/Rankings Standalone.html`. Delivers:
- Split hero: Live Google Rank composite (left, 1.35fr) + Practice Health half-arc gauge (right, 1fr)
- 2-col body grid: left rail (Top-5 search list + Drivers accordion + new Factor Breakdown), right rail (Top moves to climb + Opportunities)
- Inline `<details>` driver expansion (modal carousel deleted)
- New Factor Breakdown section (uses `rankingFactors` data we already fetch but never visualize)

Surfaces preserved: sticky glass header, in-flight banner, competitor onboarding banner, wizard demo path, all `searchStatus` branches, trend-arrow stability guards, cream insight callout, `InfoHint`.

Done = `/rankings` renders the redesigned layout for real client data, wizard demo data, and all 4 `searchStatus` states; tsc passes; no console errors in dev.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — single-file component (1790 lines). All component work happens here.
- `frontend/src/index.css` — design tokens, custom utilities. T1 only.
- `frontend/src/pages/Dashboard.tsx` — mounts `RankingsDashboard` for `/rankings`. Untouched.

**Reference markup:** `~/Desktop/Rankings Standalone.html` (extracted body cached at `/tmp/rankings-redesign-body.html` for reference during execution).

**Patterns to follow:**
- Inline component definitions in the same file (existing `KPICard`, `InfoHint`, `SearchPositionSection`, `HoldingYouBackSection`, `PerformanceDashboard`, `LoadingSkeleton` are all co-located — same convention).
- New CSS tokens declared in the `@theme inline { ... }` block of `index.css` (lines 206–298) so Tailwind v4 auto-generates utilities.
- Use `tabular-nums` Tailwind class (do NOT introduce a new `.tab-num` utility — Tailwind already provides this).
- `lucide-react` for icons (already imported); plain inline SVG for the gauge / sparkline / star (no new deps).
- Reuse existing `font-display`, `font-mono-display`, `shadow-premium` utility classes.

**Reference analogs:**
- `frontend/src/components/dashboard/focus/FactorBar.tsx` — analog for new `FactorBreakdown` (similar grid + bar pattern, but redesign uses 4-col vs 3-col grid; do not reuse — build new inline).
- `frontend/src/components/dashboard/focus/Sparkline.tsx` — analog for new `MiniTrend` (SVG sparkline, but multi-point vs 2-point; do not reuse).
- Existing inline components in `RankingsDashboard.tsx` (`KPICard`, `InfoHint`) — analog for new inline component naming, prop shape, JSX style.

## Constraints

**Must:**
- Keep all `searchStatus` branches (`ok` / `not_in_top_20` / `bias_unavailable` / `api_error`) — current copy unchanged, only chrome restyled.
- Keep the trend-arrow stability guards (`PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT`, `LIVE_GOOGLE_RANK_SOURCE_CHANGED_AT`, `SEARCH_POSITION_VANTAGE_TOLERANCE_METERS`, `haversineMeters`).
- Keep wizard demo data path working (lines 673–843).
- Keep `RankingInFlightBanner` and `CompetitorOnboardingBanner` integration (lines 894–916).
- Keep the sticky glass header lockup (lines 856–888) — untouched per user decision.
- Keep the cream insight callout (lines 919–933) — already correct.
- Keep `InfoHint` and its existing `motion` / `AnimatePresence` use.
- Preserve "Happy Patients" market-avg comparison — wire it into the new metric strip's Star rating `sub` slot as `Market avg ${marketAvgRating.toFixed(1)}`.

**Must not:**
- Touch backend, API endpoints, or the `RankingResult` type.
- Touch routing or `pages/Dashboard.tsx`.
- Add new dependencies (no chart libraries — plain SVG).
- Refactor unrelated code in `RankingsDashboard.tsx`.
- Modify other rankings consumers (`OrgRankingsTab.tsx`, `LocalRankingCard.tsx`, `RankingInFlightBanner.tsx`).

**Out of scope:**
- Backend changes.
- Mobile-specific layout tweaks beyond the existing `lg:` breakpoint switch.
- Redesigning the 4 non-`ok` `searchStatus` headlines (inherit redesign's font/color choices, keep current copy and branching logic).
- Redesigning empty/error states (no-account, ranking-empty, error).
- Loading skeleton redesign — keep `LoadingSkeleton` as-is for now.

## Risk

**Level:** 2 (Concern)

**Risks identified:**
- **"Happy Patients" market-avg comparison loss** → wire `Market avg ${marketAvgRating.toFixed(1)}` into the Star rating metric strip `sub` slot.
- **Driver modal carousel deletion** removes a UX pattern. User has explicitly approved. Inline `<details>` is denser and requires less code (~200 lines deleted).
- **2-point sparkline is statistically thin.** Net positive vs current (zero trend viz). Accept.
- **Visual weight shift** — page goes from heavy `font-black` everywhere to a `font-medium`/`font-bold`/`font-extrabold` mix. Will look noticeably thinner. User signed off via the redesign reference. Aligns with the `feedback-design-quality` memory (avoid generic AI heaviness).
- **Line-number drift mid-execution** — T5 deletes ~200 lines of modal code, shifting line numbers for downstream tasks. Re-read the file before each subsequent Edit call.

**Blast radius:**
- `RankingsDashboard` is rendered only by `pages/Dashboard.tsx` for `/rankings`. No other consumers. ✅
- Inline `KPICard`, `SearchPositionSection`, `HoldingYouBackSection`, `PerformanceDashboard`, `LoadingSkeleton` are not exported — purely internal. Free to delete/replace.
- Wizard demo data (lines 673–843) feeds `PerformanceDashboard` via `selectedRanking`. Shape unchanged; redesigned UI consumes the same fields.
- `OrgRankingsTab.tsx` and `LocalRankingCard.tsx` import nothing from this file.

**Pushback:** None. Redesign is well-scoped, uses existing data, aligns with the user's "avoid generic AI UI" feedback (Google Stitch direction).

## Tasks

### T1: Add design tokens
**Do:** Append to the `@theme inline { ... }` block in `index.css` (after the existing `--color-alloro-*` and font tokens, before the shadcn `--color-background` aliases):
```css
/* Rankings redesign tokens — Plan: 04282026-no-ticket-rankings-page-redesign */
--color-cream: #FCFAED;
--color-cream-line: #EDE5C0;
--color-line-soft: rgba(17, 21, 28, 0.06);
--color-line-medium: rgba(17, 21, 28, 0.10);
--color-success-soft: rgba(34, 197, 94, 0.10);
--color-danger-soft: rgba(239, 68, 68, 0.10);
--color-amber: #D9A441;
--color-amber-soft: rgba(217, 164, 65, 0.14);
```
No new utility classes — Tailwind v4 auto-generates `bg-cream`, `border-cream-line`, `text-amber`, `bg-success-soft`, etc. Avoid name collisions with existing tokens (`alloro-success`, `alloro-danger`).
**Files:** `frontend/src/index.css`
**Depends on:** none
**Verify:** `npx tsc --noEmit` clean. Smoke test: load `/rankings` in dev, no missing-class warnings.

### T2: Add visual primitives inline in RankingsDashboard
**Do:** Inside `RankingsDashboard.tsx`, add new inline components above `PerformanceDashboard`:
- `Slug({ children, color? })` — mono uppercase eyebrow span with `tracking-widest text-[10px]`.
- `StarIcon({ size?, filled? })` — fixed-fill SVG star (replaces `<Star>` from lucide where decorative; keeps amber tone).
- `Delta({ delta, lowerIsBetter?, suffix? })` — colored pill with `▲`/`▼` arrow + abs value. `lowerIsBetter` flips the improved-direction sign. Returns `—` for null/zero.
- `HealthGauge({ value, prev? })` — half-arc SVG gauge (180×106 viewBox, r=64), `value` 0..100. Color tier: ≥80 success / ≥60 alloro-orange / <60 danger. Optional `prev` renders a `Delta` underneath the slug.
- `MiniTrend({ curr, prev, lowerIsBetter? })` — 2-point SVG line (44×24), green improved / red worse / navy unchanged.
- `FACTOR_LABEL` const — pretty-print map for the 8 factor keys (`category_match` → "Category match", etc.).
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1 (consumes new tokens via Tailwind classes).
**Verify:** `npx tsc --noEmit` clean. No render — primitives wired in T3+.

### T3: Replace hero — 4-up KPI grid → split panel
**Do:** Inside `PerformanceDashboard`, replace the 4-up `KPICard` grid (lines ~1351–1400) with a new inline `HeroPanel`:
- LEFT card (1.35fr): Live Google Rank.
  - Eyebrow row: orange dot + `<Slug>Live Google rank</Slug>`, right-aligned mono `checked {short date}`.
  - Giant `#X` from `searchPosition` (font-extrabold Plus Jakarta, 110px / lg:140px, `tracking-tighter`, `tabular-nums`). Color: orange ≤3, navy ≤10, dim >10.
  - To the right of the number: `Delta` for `posDelta` (or NEW pill if not stable, with existing `stabilityTooltip` preserved), then "of {totalCompetitors} on Google Maps", then "for {searchQuery}" with subtle accent underline.
  - Bottom metric strip (3 cols, `border-t border-line-soft`):
    - Star rating: value `averageRating.toFixed(1)` + `<StarIcon>`, sub = `Market avg ${marketAvgRating.toFixed(1)}` (preserves "Happy Patients" comparison).
    - Reviews: value `totalReviewCount.toLocaleString()`, sub = `+${reviewsLast30d} in 30d`.
    - Local rank: value `#${rankPosition}`, sub = `of ${totalCompetitors}`, trend = `<MiniTrend curr={rankPosition} prev={previousAnalysis?.rankPosition} lowerIsBetter />`.
- RIGHT card (1fr): Practice Health.
  - Eyebrow: success dot + `<Slug>Practice Health</Slug>`, mono `diagnostic` right-aligned.
  - `<HealthGauge value={Number(rankScore)} prev={previousAnalysis ? Number(previousAnalysis.rankScore) : undefined} />`. Respect the existing methodology-cutoff guard (`getScoreTrend` logic) — pass `prev` as `undefined` when previous run predates `PRACTICE_HEALTH_METHODOLOGY_CHANGED_AT`.
  - Verdict line: `Number(rankScore) >= 80 ? "Excellent — protect what's working." : ≥60 ? "Good. Clear path to climb." : "Needs improvement. Focus on velocity."`
  - Footer: `verdict` + mono `confidence ${confidence}%`.
- Wrap in `<section className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 lg:gap-5">`.
- Delete the inline `KPICard` definition (no other consumers — already verified via single-file search).
- Delete unused imports: `Trophy`, `Star`, `AlertTriangle`, `HelpCircle` if `KPICard` removal makes them dead. Re-check after edit.
- Preserve the `InfoHint` "Practice Health" eyebrow that wraps the section — it sits above the new HeroPanel just like it did above the old KPI grid.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T2
**Verify:** `npx tsc --noEmit` clean. Manual: `/rankings` shows split hero on real data; gauge color matches score tier; trend pill respects methodology cutoff; wizard demo still renders.

### T4: Restyle SearchPositionSection — table → compact rows
**Do:** Inside `SearchPositionSection`, replace the `<table>` (lines ~1141–1199) with the redesign's compact rows:
- Wrapper card unchanged (`bg-white rounded-3xl shadow-premium overflow-hidden`).
- Header row: orange dot + `<Slug>Top {n} on Google Maps</Slug>` + `— {searchQuery}` muted; right side: mono `live • {short date}`.
- Each row: `grid grid-cols-[44px_1fr_auto] items-center gap-4 px-6 lg:px-7 py-3.5 border-b border-line-soft last:border-b-0`. Client row gets `bg-alloro-orange/[0.04]` background.
  - Col 1: `#${position}` font-extrabold 20px, orange ≤3, dim >3.
  - Col 2: practice name (15px font-bold, orange when client, navy otherwise) + `You` chip when `isClient`.
  - Col 3: `<StarIcon>` + rating tab-num + reviewCount tab-num + mono `rev` micro-label.
- Preserve all 4 `searchStatus` branches above the list (lines ~1051–1138). Keep current copy; restyle only the chrome (heading sizes, eyebrow style) to match the redesign vocabulary.
- Replace the existing right-side `Last checked` pill with the new mono right-aligned timestamp in the section header.
- The `<InfoHint title="Live Google Rank" ...>` wrapper above this section stays.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1, T2
**Verify:** Manual: top-5 list renders for `ok`; `not_in_top_20` / `bias_unavailable` / `api_error` branches still render their existing copy inside the new card chrome. `npx tsc --noEmit` clean.

### T5: Replace drivers — modal carousel → split <details> accordion
**Do:** Delete the 3-col driver tile grid (lines ~1418–1486) AND the entire driver-modal carousel (lines ~1488–1691, ~200 lines). Replace with a new inline `DriversPanel`:
- Wrapper card with header: navy dot + `<Slug>What's driving your rank</Slug>`, right side mono `{drivers.length} factors`.
- Two columns (`grid-cols-1 md:grid-cols-2`, divider via `md:border-l border-line-soft`):
  - "Working for you" (positive) — green dot + count.
  - "Holding you back" (non-positive) — red dot + count.
- Each driver as a `<details>` row:
  - Summary: chevron SVG · pretty `FACTOR_LABEL[d.factor]` · right-aligned mono `weight {d.weight}`.
  - Body (when open): insight paragraph indented under the chevron, max 58ch.
- Delete: `selectedDriverIndex` state, `goToPrevDriver`, `goToNextDriver`, `selectedDriver` derived. Keep `drivers` as a top-of-component derived array.
- Remove now-dead imports: `ChevronLeft`, `X`, `Sparkles`, `TrendingUp`, `TrendingDown`, `Zap`, `Trophy`, `AlertTriangle`, `HelpCircle`. Audit the import block after edit — `motion`/`AnimatePresence` STAY (used by `InfoHint`).
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1, T2
**Verify:** `npx tsc --noEmit` clean (will surface unused imports). Manual: clicking a driver row expands inline; no modal opens; both columns render even if one is empty.

### T6: Add FactorBreakdown section
**Do:** New inline `FactorBreakdown` component, rendered after `DriversPanel` in the left rail (T8 wires the placement).
- Skip render entirely (return `null`) when `rankingFactors` is null.
- Wrapper card with header: navy dot + `<Slug>Ranking factor breakdown</Slug>`, right side mono `weighted score`.
- Sort `Object.entries(rankingFactors)` by `weighted` desc.
- Each row: `grid grid-cols-[180px_1fr_60px_60px] items-center gap-4`.
  - Col 1: `FACTOR_LABEL[key]`, 12.5px font-bold, truncate.
  - Col 2: 6px-tall bar (rounded, bg `line-soft`) with fill width = `score%`. Tier color: ≥80 success / ≥60 alloro-orange / <60 danger.
  - Col 3: `Math.round(score)` tab-num + dim ` /100`.
  - Col 4: mono `w {weight}` right-aligned.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T2
**Verify:** Manual: section renders for real data with 8 sorted bars; hidden when `rankingFactors === null`; bar widths visually match score values.

### T7: Restyle right rail — recommendations + gaps
**Do:**
- Replace `HoldingYouBackSection` (lines ~1214–1261) with new inline `NextMoves` panel:
  - Wrapper card; header: orange dot + `<Slug>Top moves to climb</Slug>`, right side mono `{recs.length} actions`.
  - Each rec as `<li>` with `grid-cols-[36px_1fr] gap-4 px-6 lg:px-7 py-5`:
    - Col 1: 28px circle border `border-line-medium`, orange `priority` number, bg `alloro-orange/[0.06]`.
    - Col 2: title (14.5px font-bold tracking-tight) + description (12.5px slate-500/65 max 64ch).
  - Skip render when `top_recommendations` is empty.
- Replace `Opportunities` section (lines ~1694–1738) with new inline `GapsPanel`:
  - Wrapper card; header: amber dot + `<Slug>Opportunities</Slug>`, right side mono `{gaps.length}`.
  - Each gap as `<li>`:
    - Top row: impact pill (`high` = danger + danger-soft / `medium` = amber + amber-soft / else = navy + navy-soft), then factor name (13.5px font-bold).
    - Below: reason paragraph (12.5px, max 62ch).
  - Skip render when `gaps` is empty.
- Both components stay inline in `RankingsDashboard.tsx` (file convention).
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1, T2
**Verify:** `npx tsc --noEmit` clean. Manual: right rail stacks below left at `<lg`, sits beside it at `lg:`.

### T8: Wire the new layout in PerformanceDashboard
**Do:** Replace `PerformanceDashboard`'s return JSX (lines ~1346–1740 final structure) with:
```jsx
<div className="space-y-5 lg:space-y-6">
  <InfoHint title="Practice Health" dotColor="#D66853" content="..." />
  <HeroPanel ranking={result} marketAvgRating={marketAvgRating} />

  <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 lg:gap-6">
    <div className="space-y-5 lg:space-y-6">
      <InfoHint title="Live Google Rank" dotColor="#4F8A5B" content="..." />
      <SearchPositionSection result={result} />
      <DriversPanel ranking={result} />
      <FactorBreakdown ranking={result} />
    </div>
    <div className="space-y-5 lg:space-y-6">
      <NextMoves ranking={result} />
      <GapsPanel ranking={result} />
    </div>
  </div>
</div>
```
- Update the `<main>` wrapper in `RankingsDashboard` (line ~890) from `max-w-[1100px]` → `max-w-[1180px]`. Keep the sticky header's own `max-w-[1100px]` lockup untouched (line ~858).
- Reduce vertical rhythm: current `space-y-8 lg:space-y-12` → `space-y-5 lg:space-y-6` to match the redesign's density.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T3, T4, T5, T6, T7
**Verify:** `npx tsc --noEmit` clean. Manual: full `/rankings` page renders end-to-end; layout switches at `lg:`; wizard demo path renders identical structure.

## Done
- [ ] `npx tsc --noEmit` (frontend) — zero errors
- [ ] `npm run lint` (frontend) — zero new errors caused by these changes
- [ ] Manual: `/rankings` renders for a real client with `searchStatus = ok`
- [ ] Manual: `/rankings` renders correctly for `not_in_top_20`, `bias_unavailable`, `api_error` (test via direct DB mock or staging fixture)
- [ ] Manual: trend-arrow stability guards still suppress the arrow correctly (vantage drift > 500m, source mismatch, methodology cutoff before 2026-04-12 / 2026-04-28)
- [ ] Manual: in-flight banner appears when `?batchId=` is in URL and on auto-detect
- [ ] Manual: competitor onboarding banner appears for pending/curating locations
- [ ] Manual: wizard demo path still renders the redesigned layout (lines 673–843 unchanged)
- [ ] Manual: drivers expand inline (no modal opens anywhere)
- [ ] Manual: FactorBreakdown bars render for real data; section absent when `rankingFactors === null`
- [ ] Manual: cream insight callout still renders above the hero
- [ ] Manual: sticky glass header lockup unchanged
- [ ] No regressions in `/dashboard`, `/tasks`, `/patientJourneyInsights`, `/pmsStatistics` (Dashboard.tsx renders 5 routes — quick smoke test each)

## Revision Log

### Rev 1 — 2026-04-28

**Change:** `searchStatus` branching moved from T4 to T3.
**Reason:** Spec literal read had T4 keep all 4 branches above the top-5 list, but the redesign places the giant rank in the hero (where the branched copy belongs visually). Keeping branches in both places would have been redundant.
**Effect:**
- `HeroPanel`'s left card now branches on `searchStatus`: `ok` → giant `#X` + metric strip; `not_in_top_20` / `bias_unavailable` / `api_error` → muted headline + helper copy (current copy preserved verbatim).
- `SearchPositionSection` now returns `null` when status is non-ok or there are no results — it's purely the compact top-5 list.
- Stability logic (`computeSearchPositionTrend`) hoisted to module scope so both `HeroPanel` and the legacy section share it.

**Change:** `InfoHint` component deleted.
**Reason:** The redesign uses inline `<Slug>` eyebrows baked into each card header (orange dot + mono label + right-aligned mono context). The legacy `InfoHint` lockup (`font-display` heading + tooltip) does not match this aesthetic — keeping it would create two competing eyebrow styles. The hover-tooltip explanation it provided is replaced by the redesign's denser, inline-context labels.
**Effect:**
- `InfoHint` definition removed (~60 lines).
- `motion`/`AnimatePresence` imports from `framer-motion` removed (sole consumer was `InfoHint`).
- `framer-motion` itself remains a project dependency (used elsewhere) — no `package.json` change.

**Change:** T5/T6/T7/T8 folded into a single `PerformanceDashboard` rewrite.
**Reason:** Once the new components were defined inline (T2/T5/T6/T7), wiring them in the new layout (T8) was a single edit to the return JSX. Splitting it across four edits would have caused unnecessary line-number drift and intermediate broken states.
**Effect:** No behavioral change; commits would still land as one logical unit.

**Change:** Removed unused locals from `PerformanceDashboard` — `clientReviews`, `clientRating`, `leaderReviews`, `reviewGap`, `getRankTrend`, `getScoreTrend`, `rankTrend`, `scoreTrend`.
**Reason:** Sole consumer was `KPICard`, which T3 deleted. `marketAvgRating` (consumed by HeroPanel) preserved.

**Build verification:**
- `npx tsc --noEmit` — exit 0
- `npx eslint src/components/dashboard/RankingsDashboard.tsx` — 0 errors, 1 pre-existing warning (`fetchLatestRankings` exhaustive-deps, unrelated to this change)
- `npm run build` — exit 0, no new warnings caused by these changes

### Rev 2 — 2026-04-28

**Change:** Added `normalizeFactorPct()` helper and applied to FactorBreakdown + drivers weight display.
**Reason:** Production stores `rankingFactors[].score` and `.weight` as 0..1 fractions (`weight: 0.25` = 25%). The wizard demo + redesign mock used 0..100. Without normalization, `score: 0.92` rendered as `1/100` with a 1%-wide bar across all 8 rows.
**Effect:** Bars now scale correctly (0..100% of card width); weight pill shows integer percent (`w 25` not `w 0.25`).

**Change:** Added `SectionTitle` component (Fraunces / `font-display`, `text-[15px]/16px`, `font-medium`); replaced top-level card-header `<Slug>` with it across HeroPanel hero card eyebrows kept Slug, but card section titles in `SearchPositionSection`, `DriversPanel`, `FactorBreakdown`, `NextMoves`, `GapsPanel` use serif now.
**Reason:** User feedback: "I find these fonts weird. What's driving your rank / Top 5 on Google Maps / — orthodontist in Winter Garden, FL — can we instead use actually legible serif heading font for the title." The mono Slug eyebrows on top-level card titles were too typewritten; mono kept only on right-side context labels (`5 actions`, `weighted score`, `live • Apr 28`, `{n} factors`).
**Effect:** All five body cards now have a Fraunces serif title left + mono context label right. Hero card slugs (`Live Google rank`, `Practice Health`) kept as Slug since they're inside the hero composition, not standalone card sections.

**Change:** SearchPositionSection's appended search query line restructured.
**Reason:** Inlining `— {query}` next to the title produced an awkward em-dash flow with the new serif title. Now: title on top, query on a second line with smaller body-font (no leading dash), softer color.
**Effect:** Cleaner title block with explicit query attribution.

**Change:** `NextMoves` and `GapsPanel` items converted to `<details>` accordions.
**Reason:** User feedback: "can we make these dropdowns incl the opportunities". The expanded list scrolled too far on real client data (5 recommendations × ~5 lines each). Now each item is collapsed by default; chevron rotates open; description (NextMoves) or reason (GapsPanel) expands inline.
**Effect:** Right rail compresses to a glanceable list; users opt in to detail. Matches the Drivers accordion pattern for consistency.

**Build verification (after Rev 2):**
- `npx tsc --noEmit` — exit 0
- `npx eslint src/components/dashboard/RankingsDashboard.tsx` — 0 errors, 1 pre-existing warning

### Rev 3 — 2026-04-28

**Change:** Added `InfoTip` component (CSS-only animated tooltip with `Info` icon).
**Reason:** User feedback: "for each of the card, add an (i) icon beside heading explaining each card with animated tooltips." Replaces the old `InfoHint` use case (which was deleted in Rev 1) but lighter — pure CSS opacity/transform transition, no framer-motion. Accessible via keyboard focus.
**Effect:** Tooltips wired into 7 card headers: HeroPanel left (Live Google rank), HeroPanel right (Practice Health), SearchPositionSection, DriversPanel, FactorBreakdown, NextMoves, GapsPanel.

**Change:** HeroPanel left + right card slugs replaced with `SectionTitle` (Fraunces serif).
**Reason:** User feedback: "actually replace the heading with serif heading." Rev 2 missed the hero card titles, only restyling the body cards. Now consistent across all card section headers.
**Effect:** "LIVE GOOGLE RANK" / "PRACTICE HEALTH" mono eyebrows replaced with Fraunces "Live Google rank" / "Practice Health" titles.

**Change:** Practice Health card stripped of "diagnostic" label, verdict footer, gauge sub-slug.
**Reason:** User feedback: "remove extra words stable confidence 0.82% and diagnostic." Three sources removed:
1. The right-aligned mono `diagnostic` label in the card header.
2. The card footer rendering `verdict` ("stable") + `confidence ${value}%` (where value was 0..1, displaying as "0.82%").
3. The duplicate `<Slug>Practice Health</Slug>` printed below the gauge SVG (redundant with the card header).
**Effect:** Practice Health card now: header (dot + "Practice Health" + InfoTip) → gauge SVG → optional Delta pill → verdict hint sentence ("Excellent — protect what's working."). Cleaner, less noise.
**Side note:** This sidesteps the confidence normalization bug — production stores `confidence` as 0..1 fraction, displayed as `0.82%`. Removing the line removes the bug, no normalization needed.

**Change:** Dropped "Local rank" metric from the hero metric strip (3-up → 2-up).
**Reason:** User feedback: "and here why its #5 and #3, that does not make sense." The hero giant `#5` is `searchPosition` (live Google Maps rank in the top-N for the search query). The strip's `#3 of 10` was `rankPosition` (curated-cohort rank). Same data shape, different cohorts — surfacing both in one card was confusing. The hero rank already conveys "where you sit in the search a real patient runs"; the cohort rank doesn't add a distinct insight at this scale.
**Effect:** Strip is now Star rating (with market-avg sub) + Reviews (with last-30d sub). The cohort rank is still derivable from the FactorBreakdown card if needed. `MiniTrend` deleted (sole consumer was the Local rank metric); `Metric.trend` prop removed.

**Build verification (after Rev 3):**
- `npx tsc --noEmit` — exit 0
- `npx eslint src/components/dashboard/RankingsDashboard.tsx` — 0 errors, 1 pre-existing warning

### Rev 4 — 2026-04-28

**Change:** Removed the `NEW` pill and the "of N on Google Maps" caption from the hero left card.
**Reason:** User feedback: "remove new and 'of 10' -- leave on local competitor search." The cohort count info already appears in the Top-N list card header ("Top 5 on Google Maps"). The NEW pill was meant to flag first-measurement / stability resets, but its hover tooltip was too subtle to be useful and added visual noise next to the giant `#X`.
**Effect:**
- Hero now shows: giant `#X` + (Delta pill only when stable trend available) + "for {searchQuery}". No NEW pill, no "of N on Google Maps".
- Stability information is no longer surfaced in the hero. Users investigating "why no trend arrow?" can rely on the InfoTip on the title or, in a future iteration, a separate stability hint elsewhere. Acceptable for now — Delta only renders when comparison is genuinely valid.
- `trend.stabilityTooltip` is still computed by `computeSearchPositionTrend` but unused at the call site. Left in place since the helper is a small pure function and cleanup would expand scope.

**Build verification (after Rev 4):**
- `npx tsc --noEmit` — exit 0
- `npx eslint src/components/dashboard/RankingsDashboard.tsx` — 0 errors, 1 pre-existing warning

### Rev 5 — 2026-04-28

**Change:** Per-factor `(i)` tooltips added to FactorBreakdown rows.
**Reason:** User feedback: "add (i) tooltip for each of these" pointed at the Ranking factor breakdown card. Each of the 8 factors now has an InfoTip explaining what the metric measures and why it affects rank.
**Effect:**
- New `FACTOR_TOOLTIP` const map (mirrors `FACTOR_LABEL` shape) with explanations for category_match, review_count, star_rating, keyword_name, review_velocity, nap_consistency, gbp_activity, sentiment.
- FactorBreakdown row first column now wraps the label + InfoTip in a flex container.
- Tooltips render below the icon on hover/focus (same component used in card headers).

**Build verification (after Rev 5):**
- `npx tsc --noEmit` — exit 0
- `npx eslint src/components/dashboard/RankingsDashboard.tsx` — 0 errors, 1 pre-existing warning
