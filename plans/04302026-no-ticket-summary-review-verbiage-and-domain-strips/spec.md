# Summary Review Verbiage Fix + Domain Summary Strips

## Why
The Summary agent tells the practice "You have 26 unanswered reviews" — but that's only reviews from the current month window (Feb 28 – Mar 30). The practice actually has 101 unanswered reviews going back 5 months. The verbiage is misleading. Separately, the dashboard only surfaces the #1 priority action prominently — the remaining 2-4 domain signals (GBP health, ranking, referrals) are buried in the queue list with no quick-glance summary.

## What
1. Fix the Summary prompt so review-related language is explicitly month-scoped, includes reviewer names, and states sentiment.
2. Add `dashboard_metrics.reviews` fields for reviewer names and average window rating so the agent has grounded data to cite.
3. Add a `domain_summaries` section to the Summary agent output — compact per-domain snapshots rendered as expandable strips inside the Hero card.
4. Build the frontend strips component inside Hero.

## Context

**Relevant files:**
- `src/agents/monthlyAgents/Summary.md` — Summary agent prompt (200 lines)
- `src/controllers/agents/types/agent-output-schemas.ts` — Zod schemas for TopAction/SummaryV2Output (lines 347-404)
- `src/utils/dashboard-metrics/types.ts` — ReviewsMetrics interface + Zod schema (lines 25-39)
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts` — `extractReviewSummary` (lines 135-184) and `buildReviewsMetrics` (lines 190-224) — currently strips reviewer names
- `frontend/src/components/dashboard/focus/Hero.tsx` — Hero card component (372 lines)
- `frontend/src/hooks/queries/useTopAction.ts` — parses task metadata into TopAction shape (160 lines)
- `src/controllers/agents/feature-services/service.task-creator.ts` — stores TopAction as task metadata (line 323)

**Patterns to follow:**
- `TopActionSchema` Zod pattern for new schema additions
- `StatCell` component pattern in Hero.tsx for strip styling
- `ActionQueue` row pattern for compact domain rows

**Reference file:** `frontend/src/components/dashboard/focus/ActionQueue.tsx` — closest analog for compact domain row rendering with icons

## Constraints

**Must:**
- Review verbiage must always include the month name (e.g., "26 March reviews without a reply")
- Reviewer names must come from `dashboard_metrics.reviews.unanswered_reviewer_names` (grounded, not invented)
- Domain strips only render for domains where the agent produced a summary — skip/hide if data doesn't exist
- Domain strips live inside the Hero card (below rationale, above the card bottom edge)
- Strips are collapsed by default (heading + summary), expandable on click to show detail

**Must not:**
- Do not add all-time unanswered count — keep window-scoped by design (practice may have deliberately skipped older reviews)
- Do not modify how `review-handler.service.ts` fetches reviews (window filtering stays as-is)
- Do not change the task creator flow — `domain_summaries` rides the existing metadata column alongside TopAction
- Do not introduce new API endpoints or hooks — data flows through existing task metadata

**Out of scope:**
- All-time unanswered review backlog surfacing
- Changing the date range window logic (Feb 28 – Mar 30 vs full month)
- New data sources for domain strips (website analytics card, ranking card stay separate)
- Mobile-specific strip layouts

## Risk

**Level:** 2

**Risks identified:**
- Summary agent may produce malformed `domain_summaries` on first runs → **Mitigation:** Make domain_summaries optional in Zod schema, frontend gracefully hides if missing/empty
- Adding `unanswered_reviewer_names` to dashboard_metrics increases payload size → **Mitigation:** Cap at 5 names, remaining as count
- Prompt changes may cause regression in top_actions quality → **Mitigation:** Changes are additive (new section + tighter review rules), existing rules untouched

**Blast radius:**
- `SummaryV2OutputSchema` — consumed by `service.agent-orchestrator.ts` (validation) and `service.task-creator.ts` (storage)
- `ReviewsMetrics` — consumed by `buildReviewsMetrics` and serialized into agent input
- `useTopAction.ts` — consumed by `Hero.tsx` only
- `Summary.md` prompt — consumed by orchestrator for monthly runs only

## Tasks

### T1: Enrich dashboard_metrics with reviewer names and window rating
**Do:**
1. In `types.ts`, add to `ReviewsMetrics` interface and `ReviewsMetricsSchema`:
   - `unanswered_reviewer_names: string[]` (max 5 names)
   - `avg_rating_this_month: number | null`
2. In `service.dashboard-metrics.ts`, update `extractReviewSummary` to also return `reviewerName` for each detail (currently strips it)
3. In `buildReviewsMetrics`, collect up to 5 unanswered reviewer names and compute the average window rating from `reviewDetails`
**Files:** `src/utils/dashboard-metrics/types.ts`, `src/utils/dashboard-metrics/service.dashboard-metrics.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Update Summary prompt for month-scoped review verbiage + domain_summaries output
**Do:**
1. Add a `REVIEW VERBIAGE RULES` section to `Summary.md`:
   - Always qualify unanswered count with the month name from observed_period (e.g., "26 March reviews")
   - Never say "unanswered reviews" without the month qualifier — this is not a total backlog count
   - Name up to 3 reviewers from `dashboard_metrics.reviews.unanswered_reviewer_names` with "and N more"
   - State sentiment: derive from `dashboard_metrics.reviews.avg_rating_this_month` — "all 5-star", "mostly positive (4.2 avg)", "mixed — needs attention (3.1 avg)"
2. Add a `DOMAIN SUMMARIES` section to `Summary.md`:
   - Instruct agent to produce a `domain_summaries` array alongside `top_actions`
   - One entry per domain where data exists in dashboard_metrics or inputs
   - Each entry: `domain`, `heading` (2-4 words, noun phrase), `summary` (1 sentence, <=120 chars), `detail` (2-3 sentences with specific findings)
   - Allowed domains: review, gbp, ranking, referral (skip form-submission and pms-data-quality unless notable)
   - Only emit a domain summary if the agent has substantive data for that domain — do not fabricate summaries for empty domains
3. Update the OUTPUT section to show `domain_summaries` in the example JSON
**Files:** `src/agents/monthlyAgents/Summary.md`
**Depends on:** T1 (prompt references new dashboard_metrics fields)
**Verify:** Manual: read prompt, confirm rules are clear and example is valid

### T3: Add DomainSummary schema to Zod and update SummaryV2OutputSchema
**Do:**
1. Add `DomainSummarySchema` to `agent-output-schemas.ts`:
   ```
   domain: enum (same as TopAction domains)
   heading: string, min 1, max 30
   summary: string, min 1, max 150
   detail: string, min 1, max 500
   ```
2. Add `domain_summaries` to `SummaryV2OutputSchema` as `z.array(DomainSummarySchema).max(6).optional()` — optional so old runs don't break validation
3. Export `DomainSummary` type
**Files:** `src/controllers/agents/types/agent-output-schemas.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T4: Pass domain_summaries through task metadata
**Do:**
1. In `service.task-creator.ts` `createTasksFromSummaryV2Output`: store `domain_summaries` from the summary output on the first task row's metadata (the hero task) so the frontend can access it without a new endpoint. Add it as an extra key alongside the TopAction fields:
   ```ts
   metadata: JSON.stringify({ ...action, domain_summaries: summaryOutput.domain_summaries })
   ```
   Only attach to the first task (highest priority_score — the hero).
**Files:** `src/controllers/agents/feature-services/service.task-creator.ts`
**Depends on:** T3
**Verify:** `npx tsc --noEmit`

### T5: Frontend — parse domain_summaries from task metadata + render strips in Hero
**Do:**
1. In `useTopAction.ts`:
   - Add `DomainSummary` interface (mirrors backend type)
   - Extend `ResolvedTopAction` with `domain_summaries?: DomainSummary[]`
   - In `parseTopAction`, extract `domain_summaries` from raw metadata if present
2. In `Hero.tsx`:
   - Add a `DomainStrips` subcomponent rendered below the rationale paragraph (inside the left column of HeroBody, after the `</p>` at line 311)
   - Each strip: a horizontal row with domain icon (reuse `getDomainIcon`), bold heading (2-4 words), and summary text (1 sentence, muted color)
   - Clicking a strip toggles an expanded state showing the `detail` text below the summary
   - Use `useState` for expand/collapse per strip
   - Skip rendering entirely if `domain_summaries` is undefined/empty
   - Match the dark theme: same text colors as rationale (`#C5BEB1` for summary, `#F5F1EA` for heading, `#8E8579` for detail)
**Files:** `frontend/src/hooks/queries/useTopAction.ts`, `frontend/src/components/dashboard/focus/Hero.tsx`
**Depends on:** T3, T4
**Verify:** Manual: run dev server, verify strips render, expand/collapse works, missing data hides component

## Done
- [ ] `npx tsc --noEmit` — zero errors (both backend and frontend)
- [ ] Manual: re-run summary agent for Fredericksburg March and confirm review action says "March reviews" not generic "unanswered reviews"
- [ ] Manual: confirm reviewer names appear in rationale (e.g., "megan barbee, Bryan Smoot, and 24 more")
- [ ] Manual: confirm sentiment appears (e.g., "all 5-star")
- [ ] Manual: confirm domain strips render inside Hero card in dev server
- [ ] Manual: confirm strips expand/collapse on click
- [ ] Manual: confirm strips hide when domain_summaries is empty/missing
- [ ] No regressions in existing Hero rendering (pills, WHY THIS FIRST, WHAT THIS DOES)
