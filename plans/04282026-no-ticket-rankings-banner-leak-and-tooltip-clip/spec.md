# Rankings Banner Location Leak + Factor Tooltip Clip

## Why
Two visible bugs on the Local Rankings dashboard:
1. The "Ranking in progress" banner persists after the user switches to a location that has no in-flight ranking — `autoDetectedBatchId` and `?batchId=` from URL are never cleared on location change, so the prior location's batch keeps the banner mounted.
2. The (i) tooltip on factor breakdown rows clips off-screen because the shared `InfoTip` is centered (`left-1/2 -translate-x-1/2 w-64`) but the icon sits flush-left in the row grid — half the 256px tooltip extends past the section/viewport edge.

## What
- Banner only renders for the location whose in-flight ranking is actually active. Switching locations clears stale banner state immediately.
- Factor row tooltip stays fully visible; tooltip extends rightward from the icon instead of overflowing left.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — auto-detect effect (~327), state (~280), `InfoTip` (~986), factor row callsite (~1734).
- `frontend/src/api/practiceRanking.ts:186` — `getInFlightRanking(orgId, locationId)`.
- Backend `src/controllers/practice-ranking/PracticeRankingController.ts:1604` — already filters by `location_id`. No backend change.

**Patterns to follow:**
- Existing in-file `InfoTip` is the only tooltip primitive. Extending its API in place keeps the surface single.
- Existing pattern of using `setSearchParams((p) => …)` with `URLSearchParams` for batchId mutation (lines 304, 316).

## Constraints

**Must:**
- Keep all current `InfoTip` callsites visually identical (default = centered).
- Reset banner state synchronously on location change so the user never sees stale banner mid-frame.

**Must not:**
- Add new dependencies (no Radix/Floating UI).
- Touch backend.
- Refactor the rest of `RankingsDashboard.tsx`.

**Out of scope:**
- Edge-aware tooltip auto-flipping (overkill for one known clip site).
- Reworking how `urlBatchId` is seeded by the finalize redirect.

## Risk

**Level:** 1 — local UI fix, no schema/contract change.

**Risks identified:**
- Clearing `urlBatchId` on every location change could fight with the finalize redirect (which sets `?batchId=…` on mount). **Mitigation:** use a `useRef` to detect *transitions* in `locationId` after first mount; first mount preserves `urlBatchId`.
- `InfoTip` is shared (9 callsites). **Mitigation:** new `align` prop defaults to `"center"` — all existing callsites unchanged.

**Blast radius:** `RankingsDashboard.tsx` only.

## Tasks

### T1: Reset banner state on location change
**Do:** Add a new effect that fires when `locationId` changes (after first mount, gated by a `useRef`). Inside, call `setAutoDetectedBatchId(null)`, `setBannerHidden(false)`, and remove `batchId` from the URL via `setSearchParams`. Add `useRef` to the React import. The existing auto-detect effect then re-runs (its deps include `locationId` + `urlBatchId`) and either re-seeds with the new location's in-flight or leaves state empty.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:** Manual — run analysis on Loc A → banner visible. Switch to Loc B → banner disappears immediately. Switch back to A → banner returns if still in-flight.

### T2: `InfoTip align` prop + factor row uses `align="left"`
**Do:** Extend `InfoTip` props: `align?: "center" | "left"` (default `"center"`). When `"left"`, swap tooltip positioning from `left-1/2 -translate-x-1/2` to `left-0`, and arrow positioning to `left-3`. Pass `align="left"` from the per-factor row callsite at ~line 1734. All other callsites unchanged.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:** Manual — hover (i) on any factor row → tooltip extends right of the icon and is fully visible. Hover any header InfoTip → still centered.

## Done
- [ ] `npx tsc --noEmit` — zero new errors from these changes
- [ ] Manual: location switch clears stale banner
- [ ] Manual: factor row tooltip not clipped on left
- [ ] No regressions to header InfoTips
