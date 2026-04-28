# Rankings Dashboard — In-Flight Batch Banner

## Why
After clicking "Run ranking" on the curate page, the user is navigated to `/rankings?batchId=...` while the pipeline runs server-side (~60-90s). Today the dashboard ignores that query param, so the user lands on a generic dashboard with no indication their ranking is running. They think it failed.

## What
A live progress banner at the top of the rankings dashboard that activates when `?batchId=...` is present in the URL. Polls the existing `GET /api/practice-ranking/batch/:batchId/status` endpoint every 4s, shows the current step (e.g. "Scraping competitors…") with a progress %, and auto-clears the URL param + reloads the dashboard normally when the ranking completes.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts:76-111` — `formatDbBatchStatus`; needs to include `status_detail` per ranking so the frontend can render granular step messages.
- `src/controllers/practice-ranking/PracticeRankingController.ts:269-282` — batch DB query; needs to select `status_detail`.
- `frontend/src/api/practiceRanking.ts` — needs a new `getBatchStatus(batchId)` typed function.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — reads search params for `batchId`; renders the banner at top.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx:213-230` — the redirect that lands users on `/rankings?batchId=...`. Reference only — no change needed.

**Reference file:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` `FinalizingState` — visual analog for the banner's "spinner + status text" affordance.

## Constraints

**Must:**
- Banner reads `batchId` from URL via `react-router-dom`'s `useSearchParams`.
- Poll every 4s; stop polling when `status === 'completed' || 'failed'` OR when component unmounts.
- When complete, clear the `batchId` query param via `setSearchParams({})` so a refresh doesn't re-show the banner.
- When complete, the dashboard data should refresh so the user sees the new ranking.
- Show progress % from `statusDetail.progress` if available, else fall back to the batch-level `progress`.
- Show step message from `statusDetail.message` if available, else generic "Running…".
- Banner is dismissible — small × button to clear the URL param manually.

**Must not:**
- Add a server-sent events / websocket layer for this. Polling is fine for a single short-lived ranking.
- Touch the curate page's `handleFinalizeAndRun` redirect logic.
- Cache the batch status across mounts.

**Out of scope:**
- Multi-batch concurrent display.
- Showing batch status for batches the user navigated to organically (no `batchId` param).
- Persisting "this batch was just kicked off" state across browser reloads beyond what the URL carries.

## Risk

**Level:** 1 — additive backend field, additive frontend component, no schema, no auth changes. Polling load is negligible (single user, 4s interval, ~15 polls per ranking).

**Risks identified:**
- **R1. Polling continues if user navigates away.** → **Mitigation:** cleanup interval on unmount + AbortController on the in-flight fetch.
- **R2. Stale status_detail JSON.** → **Mitigation:** `parseJsonField` already handles malformed JSON gracefully; banner falls back to generic copy.
- **R3. The user can finalize a ranking from another device and never see the banner.** → **Mitigation:** acceptable. Banner is for the immediate post-finalize feedback loop only.

**Blast radius:**
- Backend formatter change adds an output field; existing consumers ignore unknown fields.
- Backend query selects an extra column; performance noise.
- New frontend component, new API function — purely additive.

## Tasks

### T1: Backend — include `status_detail` in batch status response
**Do:**
- `PracticeRankingController.ts` batch query: add `"status_detail"` to the select list.
- `formatDbBatchStatus`: parse `r.status_detail` via `parseJsonField` and include as `statusDetail` on each ranking item.
- `formatInMemoryBatchStatus`: if the in-memory tracker exposes equivalent step info (currentStep, message, progress per ranking), surface it on the response under a similar shape; if not, leave the existing fields and let the frontend gracefully fall back.

**Files:** `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`, `src/controllers/practice-ranking/PracticeRankingController.ts`

**Depends on:** none

**Verify:** `curl /api/practice-ranking/batch/:batchId/status` returns `rankings[0].statusDetail` with `currentStep`, `message`, `progress`, `stepsCompleted` fields. `npx tsc --noEmit` clean.

### T2: Frontend API — typed `getBatchStatus`
**Do:**
- `frontend/src/api/practiceRanking.ts`: add types and function.

**Files:** `frontend/src/api/practiceRanking.ts`

**Depends on:** T1

**Verify:** Type-check clean.

### T3: Frontend — In-flight banner component + dashboard integration
**Do:**
- New component `frontend/src/components/dashboard/RankingInFlightBanner.tsx`:
  - Props: `batchId: string`, `onComplete: () => void`, `onDismiss: () => void`
  - Uses `useEffect` to poll `getBatchStatus(batchId)` every 4s
  - Renders a card with: spinner, current step message, progress bar (0-100%), and dismiss × button
  - On `status === 'completed' | 'failed'`, calls `onComplete` (which clears the URL param and triggers dashboard reload)
- `RankingsDashboard.tsx`: add `useSearchParams`, read `batchId` param, render `<RankingInFlightBanner>` at the top when present, pass `onComplete` that calls `setSearchParams({})` and refreshes the rankings list.

**Files:** new `frontend/src/components/dashboard/RankingInFlightBanner.tsx`, modified `frontend/src/components/dashboard/RankingsDashboard.tsx`

**Depends on:** T2

**Verify:** Manual:
- Kick off a ranking from the curate page → land on `/rankings?batchId=...`
- Banner appears at top of rankings dashboard with the current step message (e.g. "Looking up Artful Orthodontics on Google…", then "Scraping competitors…", etc.)
- Progress % updates as the pipeline advances
- When pipeline completes, banner auto-dismisses; URL param cleared; new ranking appears in the dashboard
- Manual × dismiss removes the banner immediately

## Done
- [ ] Backend batch status endpoint returns `statusDetail` per ranking.
- [ ] `npx tsc --noEmit` clean (backend + frontend).
- [ ] Banner renders on `/rankings?batchId=...`, polls every 4s, shows current step + progress.
- [ ] Banner auto-dismisses on `completed` / `failed` and clears URL param.
- [ ] Manual × dismiss works.
- [ ] No regressions in the rankings dashboard for users without `?batchId=`.
