# Practice Health — Cohort Rank Line + Factor-Level Competitor Deltas

## Why

Today the Rankings dashboard shows two scores: **Live Google rank** (literal Maps panel position from Apify) on the left of the hero, and **Practice Health** (Alloro's 0–100 proprietary score) on the right. Users can see *what* their fundamentals score is, but not *how it compares* to the competitor set those fundamentals were measured against. The proprietary `rank_position` / `total_competitors` is computed and persisted but deliberately hidden from the UI — an earlier surfacing of it as a raw `#N` number caused users to read it as a competing answer to the Live Google rank.

We want to resurface that comparison without reviving the confusion. Two reinforcing additions:
1. A **cohort rank sentence** under the Practice Health gauge — anchors the score to "where you stand among your competitors", framed as prose so it can't be visually mistaken for the giant Live Google `#N`.
2. **Per-factor competitor deltas** in the existing factor breakdown — turns each factor row into "your score, and how you compare to the cohort on this specific factor", giving users an actionable path into the gap analysis.

## What

- HeroPanel's right card (Practice Health) gets a new line beneath the verdict hint: *"You score higher than 8 of 11 of your tracked competitors."* — copy varies by `competitorSource`.
- `FactorBreakdown` rows get a small sub-line under the bar: *"You: 234 reviews · Cohort median: 187"* — only for the 6 of 8 factors with per-competitor data.
- Zero backend changes. All data already arrives via `formatLatestRanking` in `util.ranking-formatter.ts`.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — single file for both T1 and T2. Contains `HeroPanel` (line ~1166), `FactorBreakdown` (line ~1503), `RankingResult` interface (line ~109), `FACTOR_LABEL` / `FACTOR_TOOLTIP` (line ~901–929), `normalizeFactorPct` (line ~994).
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — already exposes `rankPosition`, `totalCompetitors`, `competitorSource`, and `rawData.competitors[]`. **Read-only for this spec — do not modify.**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts:822-840` — confirms which competitor fields are persisted in `raw_data.competitors[]`. The JSON contains `hasKeywordInName`, `photosCount`, `postsLast90d` even though the current FE type doesn't list them.

**Patterns to follow:**
- **Source-conditional rendering:** existing pattern in `HeroPanel` for `searchStatus` (line 1240–1332) — branches on `ok` / `not_in_top_20` / `bias_unavailable` / `api_error` and renders distinct copy per state. Mirror this exactly for `competitorSource` branching: `curated` → confident, `discovered_v2_pending` / `discovered_v1_legacy` → CTA.
- **InfoTip + SectionTitle + colored dot** card-header pattern (e.g. line 1336–1344).
- **Sub-line copy under primary content:** verdict hint at line 1348–1350 (`<p className="mt-3 text-[12px] font-medium text-alloro-navy/65 max-w-[28ch] text-center leading-relaxed">`) — match this voice/typography for the cohort rank line.
- **Factor row layout:** existing grid `grid-cols-[140px_1fr_60px_60px] sm:grid-cols-[180px_1fr_60px_60px]` (line 1535). The delta sub-line goes inside the same `<li>`, below the bar+score+weight row.
- **Tone copy:** caption-sized (`text-[11px]` or `text-[10.5px]`), `font-medium text-alloro-navy/55-65`, no emojis, no exclamation points.

**Reference file:** `frontend/src/components/dashboard/RankingsDashboard.tsx` itself — every primitive needed already exists. New code matches the existing functional component style (no class components, no new dependencies, Tailwind utility classes, lucide-react icons if any).

## Constraints

**Must:**
- Reuse `SectionTitle`, `InfoTip`, `FACTOR_LABEL`, `normalizeFactorPct`, the `accent`/`#22c55e` palette already in scope.
- Branch all new copy on `competitorSource` — `curated` shows confident copy referring to "your tracked competitors", `discovered_v2_pending` / `discovered_v1_legacy` shows softer copy referring to "competitors in your area" plus a CTA to curate.
- Keep the cohort rank line **inside the Practice Health card** (HeroPanel right). Not a new section. Not a new gauge.
- Compute cohort median from `rawData.competitors[]` client-side. No new state, no new fetch.
- Skip the per-factor delta sub-line entirely for `nap_consistency` and `sentiment` (no per-competitor data exists for these factors).
- Use *median* (not mean) for cohort comparison — robust against the long-tail outlier competitor with 2,000 reviews.
- Wizard demo data path must continue to render — extend the demo `competitors[]` if needed so cohort rank renders during onboarding tour.

**Must not:**
- Touch any backend file. Data is already on the wire.
- Add a second giant `#N` rank number anywhere in the hero. The cohort rank is sentence-only.
- Re-add the legacy "Local Rank" KPI card that was removed from the metric strip (the comment at line 1267–1269 stays valid).
- Modify the existing `FACTOR_TOOLTIP` strings or change factor weights.
- Introduce new dependencies (no new lucide icons that aren't already imported, no new utilities).
- Refactor unrelated code in `RankingsDashboard.tsx`. This file is large and contention-prone.

**Out of scope:**
- LLM-driven gap rewording. The existing `GapsPanel` and `NextMoves` stay as-is — factor deltas are *deterministic facts*, not LLM insights, and the two complement each other.
- Per-competitor `nap_consistency` / `sentiment` data collection. Adding scraping for these is a separate effort.
- Trend arrows on cohort rank or factor deltas. Single-snapshot only.
- Backend exposure of additional competitor fields. The fields needed (`hasKeywordInName`, `photosCount`, `postsLast90d`) already arrive in the `raw_data.competitors` JSON — only the frontend TS type needs widening.
- Mobile-specific layout work. Existing responsive grid is preserved.

## Risk

**Level:** 2

**Risks identified:**
- **Two-rank confusion regression** → **Mitigation:** sentence framing instead of `#N`, visual containment inside Practice Health card, and source-conditional copy. The cohort number is embedded in prose ("higher than 8 of 11") — there's no isolated digit to misread.
- **Misleading comparison for non-finalized locations** → **Mitigation:** when `competitorSource !== "curated"`, the copy explicitly says "competitors Google surfaced for your area" and pivots to a CTA: *"Curate your competitor list to compare against the practices that matter to you."* This doubles as a finalization nudge.
- **Empty deltas on 2 of 8 factor rows** create visual asymmetry → **Mitigation:** simply omit the sub-line for those rows. The bar+score+weight row remains identical; rows just look slightly more compact when no delta is shown. Cleaner than rendering "—".
- **Type widening for `rawData.competitors[]`** could introduce a runtime mismatch if older snapshots don't have the new fields → **Mitigation:** all new fields are typed as optional (`?`) and read with safe defaults. Pre-existing rankings that never persisted these fields just won't display deltas for keyword/photos/posts — review_count/star_rating/velocity/category still work.

**Blast radius:**
- `RankingsDashboard.tsx` is consumed by `frontend/src/pages/RankingsPage.tsx` (or equivalent route — the page wrapper). No other consumer.
- The `RankingResult` interface is local to `RankingsDashboard.tsx`. Widening it does not affect any other file.
- No backend consumers; no API contract changes.

**Pushback:**
None. The user explicitly chose option C (both additions) after a balanced presentation of A/B/C, including the alternative of a factor-level-only approach. Approach is sound provided labeling discipline is maintained — see Risk mitigations.

## Tasks

### T1: Frontend type widening for competitor cohort fields
**Do:** Widen the `RankingResult.rawData.competitors[]` type in `RankingsDashboard.tsx` (line ~151) to include three optional fields already persisted by the backend:
- `hasKeywordInName?: boolean`
- `photosCount?: number`
- `postsLast90d?: number`

These already arrive in the `raw_data.competitors` JSON blob from `service.ranking-pipeline.ts:822-840`. Only the frontend interface is missing them.

**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit` — zero new errors

### T2: Cohort rank sentence under Practice Health gauge
**Do:** In `HeroPanel` (line ~1166), inside the right card (Practice Health, line ~1335), add a new line directly below the existing verdict hint paragraph (line 1348–1350). The line:
- Reads `result.competitorSource`, `result.rankPosition`, `result.totalCompetitors`, and `result.locationOnboarding?.status`.
- When `competitorSource === "curated"` and `rankPosition` and `totalCompetitors` are valid: render *"You rank ahead of N of M of your tracked competitors."* (where N = `totalCompetitors - rankPosition`, M = `totalCompetitors - 1` since the client is included in `total_competitors`). Use `font-display` weight if a callout is desired, or match the verdict hint's caption styling — pick one and stay consistent.
- When `competitorSource === "discovered_v2_pending"` or `"discovered_v1_legacy"` (or null): render *"This is your fundamentals score against competitors Google surfaced for your area. <a>Curate your competitor list →</a> to compare against the practices that matter to you."* Link target: existing competitor onboarding flow (use `<button>` that triggers the same flow `CompetitorOnboardingBanner` triggers, or a route/anchor — match whatever the banner uses).
- When the inputs are missing/zero (e.g. legacy rows without `total_competitors`), render nothing. Defensive null-handling, no fallback copy.
- Wrap the rendered line in an `<InfoTip>` paired with a `font-mono-display` caption-style label *"vs competitor cohort"* so users have a hover explanation: *"Your Practice Health score ranked against the {curated → 'competitor list you curated' / discovered → 'competitors Google surfaced for your area'}. Independent of your Live Google rank."*

**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:**
- `npx tsc --noEmit` clean.
- Manual: load Rankings page for a `curated` location → confident copy with N of M numbers.
- Manual: load for a `discovered_v2_pending` location → CTA copy with curate link.
- Manual: hover the InfoTip → explanation tooltip appears.
- Manual: verify wizard demo path still renders (extend `wizardDemoData` competitor list if necessary so M ≥ 3).

### T3: Per-factor competitor delta sub-line in FactorBreakdown
**Do:** In `FactorBreakdown` (line ~1503), extend each row's `<li>` to include a sub-line beneath the existing bar+score+weight row. The sub-line:
- Reads competitor values from `result.rawData?.competitors ?? []` for the factor at hand, computes the **median** (sort + middle index, handle even-length arrays as `(a[n/2-1] + a[n/2]) / 2`), and renders `"You: <client value> · Cohort median: <median>"`.
- Pulls the **client value** from `result.rankingFactors[<key>].value` where present (review_count, star_rating, review_velocity, gbp_activity all already carry `value`), or from `result.rawData?.client_gbp` for fields that don't.
- Only renders for these 6 factors:
  - `category_match` → compare `primaryCategory` match rate ("3 of 11 competitors share your primary category")
  - `review_count` → `totalReviews`
  - `star_rating` → `averageRating` (1 decimal)
  - `keyword_name` → `hasKeywordInName` ("4 of 11 competitors have a keyword in their name")
  - `review_velocity` → `reviewsLast30d`
  - `gbp_activity` → `postsLast90d` (post count) — photos/description don't have reliable competitor data, so use posts only
- Skip the sub-line for `nap_consistency` and `sentiment` (no per-competitor data). The row remains the same height as today minus the new sub-line.
- Skip the sub-line if `rawData.competitors` is empty or undefined (graceful degradation for legacy snapshots).
- Styling: `text-[11px] font-medium text-alloro-navy/55 mt-1.5` aligned to start of the bar column (left-aligned beneath the bar, not full-width). Match the typography weight/color of the existing weight column for consistency.
- The label *"vs cohort"* should be tooltip-clarifiable: include a single `InfoTip` once at the section header level (not per-row) updating the existing factor-breakdown header tooltip to include "Each row shows your value and the cohort median where data is available."

**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1 (type widening enables `hasKeywordInName`, `postsLast90d` access without `as any`)
**Verify:**
- `npx tsc --noEmit` clean.
- Manual: load Rankings page → 6 factor rows show "You: X · Cohort median: Y" sub-lines, 2 rows (NAP, sentiment) don't.
- Manual: load a snapshot with empty `competitors[]` → no sub-lines render, no console errors.
- Manual: numeric formatting — review counts use `toLocaleString()`, ratings show 1 decimal, post counts integer.

## Done

- [x] `npx tsc --noEmit` — zero errors caused by these changes
- [ ] Manual: Rankings page for a `curated` location shows cohort rank sentence with valid N-of-M numbers under the Practice Health gauge
- [ ] Manual: Rankings page for a `discovered_v2_pending` / `discovered_v1_legacy` location shows the CTA copy + curate link instead
- [ ] Manual: Cohort rank InfoTip hover shows source-aware explanation
- [ ] Manual: 5 of 8 factor rows show a comparison sub-line; `nap_consistency`, `sentiment`, and `gbp_activity` rows do not (see Revision Log Rev 1)
- [ ] Manual: factor delta sub-lines absent for snapshots with no competitors (no console errors)
- [ ] Manual: hero layout, Live Google rank panel, SearchPositionSection, NextMoves, GapsPanel, DriversPanel all render unchanged (no regression)
- [ ] Manual: wizard demo path renders both new additions with realistic numbers
- [x] No new dependencies in `package.json`

## Revision Log

### Rev 1 — 2026-04-28 (during execution)

**Change:** Dropped `gbp_activity` from the set of factors that get a competitor delta sub-line. Final set is 5 of 8 (review_count, star_rating, review_velocity, category_match, keyword_name) — not 6 as originally specified.

**Reason:** Execution discovered `service.apify.ts:536` hardcodes `postsLast90d: 0` for every competitor because Apify cannot reliably scrape GBP local posts. Showing a delta would compare the client's real post count against an always-zero cohort median — the client would always look ahead, regardless of actual activity. That's worse than silence. NAP and sentiment remain skipped for the originally-stated reason (no per-competitor data collected at all).

**Updated Done criteria:** Item 4 now reads "5 of 8 factor rows… `nap_consistency`, `sentiment`, and `gbp_activity` rows do not" instead of "6 of 8".

**Future fix:** If Apify ever supports GBP posts, or if we add a separate GBP API enrichment for competitor posts, re-enable this delta by extending `computeCohortDelta` with the `gbp_activity` case.
