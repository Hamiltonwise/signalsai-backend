# Rankings Dashboard — Auto-detect In-Flight Ranking + Sticky Banner

## Why
The previous fix (`04282026-no-ticket-rankings-dashboard-in-flight-batch-banner`) only renders a progress banner when `?batchId=...` is in the URL. Once the user refreshes, navigates back to `/rankings`, or opens the dashboard from a sidebar link, the URL no longer carries the batchId and the banner disappears even though the ranking is still running server-side. User complaint: "in the dashboard it's not showing any indicator" — they kicked off a ranking, navigated to `/rankings`, and saw nothing.

The admin Practice Ranking page (`pages/admin/PracticeRanking.tsx`) already shows a beautiful in-flight progress card with progress bar + step message ("Sending to AI for gap analysis…"). The client-facing rankings dashboard needs the same affordance.

## What
1. Auto-detect in-flight rankings for the current org/location independently of URL state.
2. Make the banner sticky to the viewport top so it stays visible while the user scrolls — "overlaps all elements" per request.
3. Keep the existing `?batchId=` URL fast-path for the immediate post-finalize redirect (no regression).

Done when: navigating to `/rankings` (no query param) while a ranking is processing shows the progress banner sticky at the top until the ranking completes; banner auto-dismisses on completion + refreshes the rankings list.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/PracticeRankingController.ts:951-...` — `getLatestRankings` (returns completed only). Sibling new endpoint goes here.
- `src/routes/practiceRanking.ts` — register the new route under the existing auth + RBAC stack.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — already integrates `RankingInFlightBanner` via URL param; needs a complementary "auto-detect" fetch + state.
- `frontend/src/components/dashboard/RankingInFlightBanner.tsx` — existing component; minor wrapper change for sticky behavior.
- `frontend/src/api/practiceRanking.ts` — new `getInFlightRanking()` typed function.
- `frontend/src/pages/admin/PracticeRanking.tsx:1815-1825` — visual analog (admin in-flight card).

**Reference file:** `frontend/src/pages/admin/PracticeRanking.tsx` — already renders the in-flight pattern the user wants. Match its message-source (`statusDetail.message`) and progress-source (`statusDetail.progress`) approach.

## Constraints

**Must:**
- New backend endpoint scoped via the same auth + RBAC pattern as `/latest`.
- Endpoint returns the SINGLE most-recent processing/pending ranking row for the given (org, optional location). Not a list.
- Banner sticky positioning uses `sticky top-4 z-30` (or similar) so it overlays scrolled content but doesn't fight a fixed page header.
- URL-param batchId STILL works (covers the post-finalize redirect window where the DB write hasn't necessarily settled when the dashboard mounts).
- When both URL batchId and auto-detect are present, prefer URL batchId (most specific intent).
- Banner stays mounted across the whole ranking lifecycle (mount → poll → complete → 1.2s "done" pause → unmount).

**Must not:**
- Add SSE/websockets — polling at 4s is fine.
- Re-fetch in-flight status while a banner is already mounted (the banner does its own polling).
- Show banners for in-flight rankings outside the user's current location scope.
- Break the existing `/api/practice-ranking/latest` behavior.

**Out of scope:**
- Showing multiple concurrent in-flight rankings (admin page handles bulk; client dashboard is single-location).
- Persisting "I dismissed this" state across reloads.
- Push notifications when a ranking completes while the user is on a different page.

## Risk

**Level:** 1 — additive backend endpoint, additive frontend fetch on an already-existing component. Polling load is bounded to 1 GET on mount + 1 POST every 4s while the banner is visible.

**Risks identified:**
- **R1. Race between finalize-and-run insertion and the auto-detect fetch.** The DB insert happens in the finalize transaction; by the time the redirect lands, the row exists. The URL-param fast-path covers any uncertainty. → **Mitigation:** prefer URL-param batchId on mount; only fall back to auto-detect when no URL param.
- **R2. User has multiple in-flight rankings (e.g. via admin trigger).** → **Mitigation:** return the single most-recent. The banner identifies the practice via `gbpLocationName` so the user knows which one's running.
- **R3. Sticky banner clashes with the page's existing sticky `<header>`.** → **Mitigation:** banner sticky offset accounts for header height. Single page (`/rankings`) so we know the layout.

**Blast radius:**
- New endpoint, no shared state.
- RankingsDashboard.tsx is the only consumer; no other dashboard pages affected.

## Tasks

### T1: Backend — `GET /api/practice-ranking/in-flight`
**Do:**
- New handler `getInFlightRanking(req, res)` in `PracticeRankingController.ts`:
  - Reads `googleAccountId` (required) and `locationId` (optional) query params.
  - Queries `practice_rankings` for the most recent row matching `status IN ('pending', 'processing')` for the org (and location if given), ordered by `created_at DESC`.
  - Returns `{ success: true, ranking: { batchId, rankingId, status, statusDetail, gbpLocationName, createdAt } | null }`.
  - Uses `parseJsonField(row.status_detail)` for status detail.
- Register `GET /in-flight` in `routes/practiceRanking.ts` behind the same auth + rbac middleware as `/latest`.

**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/routes/practiceRanking.ts`

**Depends on:** none

**Verify:** `curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/practice-ranking/in-flight?googleAccountId=36&locationId=18"` returns the in-flight ranking when one exists, `{ ranking: null }` otherwise.

### T2: Frontend API — `getInFlightRanking()`
**Do:**
- `frontend/src/api/practiceRanking.ts`: new types and function.

**Files:** `frontend/src/api/practiceRanking.ts`

**Depends on:** T1

**Verify:** Type-check clean.

### T3: Auto-detect on dashboard mount + sticky banner
**Do:**
- `RankingsDashboard.tsx`:
  - On mount (or when `organizationId`/`locationId` change), fetch `getInFlightRanking()` if no URL `?batchId=` is present.
  - If response carries an in-flight ranking, store its `batchId` in local state (`autoDetectedBatchId`).
  - Banner renders when EITHER `inFlightBatchId` (from URL) OR `autoDetectedBatchId` (from auto-detect) is present, preferring URL.
  - Wrap `<RankingInFlightBanner>` in a `sticky top-4 z-30` container (with backdrop for legibility) so it overlays scrolled content.
  - On completion: clear both URL param (existing behavior) AND `autoDetectedBatchId` so the banner unmounts.

**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`

**Depends on:** T2

**Verify:** Manual:
1. Kick off a ranking → land on `/rankings?batchId=...` → banner shows (URL fast-path).
2. While ranking processes, navigate to a different page, then return to `/rankings` (no query param) → banner re-appears via auto-detect.
3. Scroll down through the dashboard → banner stays at top (sticky).
4. Wait for ranking to complete → banner shows "complete" briefly, then auto-dismisses; rankings list refreshes.

## Done
- [ ] New backend endpoint returns the in-flight ranking or null.
- [ ] `npx tsc --noEmit` clean (backend + frontend).
- [ ] Banner shows on `/rankings` (no query param) when a ranking is processing for the current location.
- [ ] Banner sticks to the viewport top while scrolling.
- [ ] Banner auto-dismisses when the ranking completes.
- [ ] No regression in the `?batchId=` URL fast-path.
- [ ] Lint clean for changed files.
