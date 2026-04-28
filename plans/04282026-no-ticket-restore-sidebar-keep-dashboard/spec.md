---
id: spec-restore-sidebar-keep-dashboard
created: 2026-04-28
ticket: no-ticket
mode: --start
status: planning
relates_to: plans/04282026-no-ticket-focus-dashboard-frontend
---

# Restore Sidebar — Keep New Dashboard Content

## Why
Plan 2 replaced the global left sidebar with a top-bar nav (`TopBar` + `Ticker`) across all authenticated pages, citing the hi-fi design's header-tab vocabulary. After landing it, the call is to walk that part back: keep the **inner** Focus dashboard redesign (Hero, Trajectory, Action Queue, 3 product cards, new fonts, `mark.hl` highlight class, brand-orange wizard outline) but restore the sidebar as the global nav so other pages render exactly as they did pre-Plan-2. The top-bar primitives (`TopBar.tsx`, `Ticker.tsx`) stay on disk with `@deprecated` comments for potential future revival.

## What
A surgical revert of Plan 2's layout shell change (T19 of that plan), with everything else preserved:

1. `PageWrapper.tsx` restored to its pre-Plan-2 shape: Sidebar + mobile header rendered as before. TopBar + Ticker unmounted. The `useDashboardRefresh` wiring at the TopBar level is removed; the dashboard's own refresh affordance returns to wherever the legacy DashboardOverview had it (or stays absent for v1, since the redesign doesn't currently expose a refresh button).
2. `Sidebar.tsx` `@deprecated` JSDoc block removed (sidebar is fully live again).
3. `components/layout/TopBar.tsx` + `components/layout/Ticker.tsx`: kept on disk, marked `@deprecated` with a JSDoc pointer to this plan (mirrors the pattern we just removed from Sidebar). Not deleted — well-built and trivially revivable if we revisit the top-bar layout.
4. `DashboardOverview.tsx`: unchanged. The thin composition (`SetupProgressBanner → FocusHeader → Hero → Trajectory + ActionQueue → 3 product cards`) stays exactly as Plan 2 shipped it.
5. All other Plan 2 work preserved: every file under `components/dashboard/focus/`, the new API clients (`dashboardMetrics`, `formSubmissionsTimeseries`, `rankingHistory`), the new React Query hooks, the new types, `index.html` font links (Fraunces, Inter, JetBrains Mono), `index.css` additions (`mark.hl`, font-family vars, domain icon tile classes), and the `wizard-highlight` brand-orange fix in `SpotlightOverlay.tsx`.

**Done when:**
- `/dashboard` renders the new Focus content (Hero + Trajectory + Queue + 3 cards) inside the existing sidebar layout chrome.
- All other authenticated routes (Settings, Help, Notifications, DFY Website, etc.) render exactly as they did before Plan 2.
- Sidebar shows on every authenticated page (desktop) and slides in on mobile via the mobile header burger button — matching pre-Plan-2 behavior.
- `TopBar.tsx` + `Ticker.tsx` exist on disk with `@deprecated` comments and are not mounted anywhere.
- `Sidebar.tsx` has no `@deprecated` comment.
- TypeScript clean (`npx tsc --noEmit` zero new errors backend + frontend).
- Frontend production build clean (`npm run build` exits 0).

## Context

**Files modified:**

- `frontend/src/components/PageWrapper.tsx` — full revert of the Plan 2 rewrite. Restore `useState/sidebarOpen`, mobile header (lucide `Menu`/`Bell`), `<Sidebar>` mount, `<MobileBottomNav>` (already there), and the sidebar-aware main padding (`md:ml-72` etc. via `useSidebar` collapsed state). Remove `TopBar`/`Ticker` imports + mounts and the `useDashboardRefresh`/`useQueryClient` wiring (the refresh button no longer lives in the chrome).
- `frontend/src/components/Sidebar.tsx` — remove the `@deprecated` JSDoc block at lines 1-7 (added by Plan 2).
- `frontend/src/components/layout/TopBar.tsx` — add `@deprecated` JSDoc at top, pointing to this plan. Component still exports cleanly, just not mounted.
- `frontend/src/components/layout/Ticker.tsx` — same: `@deprecated` JSDoc block.

**Files NOT modified (Plan 2 work that stays):**

- All 11 files under `frontend/src/components/dashboard/focus/`
- `frontend/src/components/dashboard/DashboardOverview.tsx` (the thin composition — its only external dependency is the focus subfolder)
- 3 new API clients in `frontend/src/api/`
- 5 new React Query hooks in `frontend/src/hooks/queries/`
- `frontend/src/types/dashboardMetrics.ts`
- `frontend/src/index.html` (font links)
- `frontend/src/index.css` (mark.hl, font vars, icon tile classes)
- `frontend/src/components/onboarding-wizard/SpotlightOverlay.tsx` (brand-orange outline fix — independent of layout)

**Patterns to follow:**

- Reverting `PageWrapper.tsx`: literal restore of the version at commit `b750aefb^` (the parent of Plan 2's feature commit). Use `git show b750aefb^:frontend/src/components/PageWrapper.tsx` to see the exact pre-Plan-2 source. Re-apply that source verbatim.
- Adding `@deprecated`: mirror the JSDoc style from the Plan 2 Sidebar comment we now remove (3-line description + plan reference).

**Reference files:**
- Pre-Plan-2 `PageWrapper.tsx` content: `git show b750aefb^:frontend/src/components/PageWrapper.tsx`
- Plan 2 spec at `plans/04282026-no-ticket-focus-dashboard-frontend/spec.md` for what was changed (so we can revert exactly that surface).

## Constraints

**Must:**
- Restore PageWrapper to the EXACT pre-Plan-2 shape (no incremental cleanup, no opinionated edits).
- Preserve every line under `frontend/src/components/dashboard/focus/`.
- Preserve all new fonts, CSS additions, and the wizard outline fix.
- Keep TopBar + Ticker source on disk (do not delete) with deprecation comments.
- TypeScript clean (backend + frontend).
- Frontend build clean (`npm run build` exits 0).

**Must not:**
- Delete `TopBar.tsx` or `Ticker.tsx`.
- Touch any backend code (Plan 1 stays as-is).
- Modify `Sidebar.tsx` source beyond removing the `@deprecated` block.
- Add new dependencies.
- Refactor `PageWrapper.tsx` beyond the literal pre-Plan-2 restore.
- Change CHANGELOG entries for 0.0.33 or 0.0.34 retroactively. This plan ships as 0.0.35.

**Out of scope:**
- Repurposing TopBar/Ticker for other surfaces (they're parked).
- Cleaning up unused exports anywhere in the codebase.
- Mobile redesign (the legacy mobile header + bottom nav return as-is).
- Refresh button on the new dashboard surface (deferred — not present in legacy DashboardOverview either).

## Risk

**Level:** 1 (Suggestion — narrow surgical revert with no data or pipeline implications)

**Risks identified:**

1. **PageWrapper restore must match pre-Plan-2 exactly.** Any drift creates subtle layout breakage on pages that depended on the sidebar's collapsed-width math. → **Mitigation:** Use `git show b750aefb^:frontend/src/components/PageWrapper.tsx` and copy verbatim. Don't hand-author from memory.

2. **DashboardOverview's content was sized for a 1320px-wide top-bar layout.** With the sidebar back (288px or 68px collapsed), the dashboard content area shrinks. The new Hero, Trajectory + Queue grid, and 3-card grid must still render gracefully at narrower widths. → **Mitigation:** The new components already use Tailwind's responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). Visual check during T4 verification at 1280px (typical sidebar-open desktop). If a card looks cramped, that's a follow-up styling pass — not a blocker for this revert.

3. **TopBar + Ticker carry imports that some IDE/lint passes might flag as unused exports.** → **Mitigation:** They have valid TypeScript exports and no consumers. ESLint's `no-unused-modules` (if configured strictly) might warn — acceptable.

4. **The legacy sidebar's `MobileBottomNav` is still mounted in PageWrapper.** Plan 2 didn't remove it, and the revert keeps it. No change here.

**Blast radius:**
- One file reverted (`PageWrapper.tsx`).
- Three files get small JSDoc-level edits (`Sidebar.tsx`, `TopBar.tsx`, `Ticker.tsx`).
- Zero backend changes.
- Zero data changes.
- Layout impact: dashboard content reflows into narrower viewport; other pages unchanged.

**Pushback:**
- This walks back the most visible part of Plan 2 within hours of landing. The right call given the user's preference, but it does mean the hi-fi design's header-tab vocabulary lives on as parked code. Worth deciding within ~1 release cycle whether to fully delete TopBar/Ticker or commit to a different navigation rethink.

## Decisions

**D1. Literal pre-Plan-2 restore for `PageWrapper.tsx`.** No reformatting, no incremental fixes — just revert. Pull the source via `git show b750aefb^:frontend/src/components/PageWrapper.tsx`.

**D2. TopBar + Ticker preserved on disk with `@deprecated` JSDoc.** Mirrors the Sidebar deprecation pattern from Plan 2 (which we now reverse). Keeps revival cheap.

**D3. No refresh button in the new dashboard chrome.** Plan 2's TopBar carried a refresh icon dispatching `queryClient.invalidateQueries()`. With TopBar gone, that affordance is dropped. The legacy DashboardOverview had its own per-card refresh; the new DashboardOverview doesn't surface one. Acceptable for v1 — TanStack Query's automatic refetch (focus, mount, staleness) keeps data current.

**D4. Sidebar.tsx fully restored.** Just remove the `@deprecated` JSDoc; leave the rest of the 600+ lines untouched.

**D5. Versioning: 0.0.35.** Patch bump per the global CLAUDE.md rule. Changelog entry frames this as a "Sidebar restore" follow-up to 0.0.34.

## Tasks

### T1: Revert `PageWrapper.tsx` to pre-Plan-2 shape
**Do:**
1. Run `git show b750aefb^:frontend/src/components/PageWrapper.tsx` to get the exact pre-Plan-2 source.
2. Replace `frontend/src/components/PageWrapper.tsx` with that source (use `Write` after reading the current file to satisfy the read-before-write rule).
3. Confirm no leftover references to `TopBar`, `Ticker`, `useDashboardRefresh`, `useQueryClient` in the file.
**Files:** `frontend/src/components/PageWrapper.tsx`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit` zero new errors. Open the file and confirm Sidebar import is back, mobile header is back, main padding includes sidebar offset.

### T2: Remove `@deprecated` block from `Sidebar.tsx`
**Do:** Delete the JSDoc block at lines 1-7 of `frontend/src/components/Sidebar.tsx` (added by Plan 2). Restore the file to its pre-Plan-2 first-line shape (`import React, ...`).
**Files:** `frontend/src/components/Sidebar.tsx`
**Depends on:** none (parallel with T1)
**Verify:** First non-blank line of file is the `import React,` statement.

### T3: Add `@deprecated` JSDoc to `TopBar.tsx` and `Ticker.tsx`
**Do:** Prepend a JSDoc block to each file pointing to this plan and noting they are not mounted anywhere. Mirror the deprecation comment style we just removed from Sidebar:

```tsx
/**
 * @deprecated Plan 3 (Restore sidebar) walked back Plan 2's top-bar layout.
 * This component is preserved on disk for revival but is no longer mounted.
 * The global layout shell is `PageWrapper.tsx` (sidebar + mobile header).
 *
 * Plan: plans/04282026-no-ticket-restore-sidebar-keep-dashboard/spec.md
 */
```

**Files:** `frontend/src/components/layout/TopBar.tsx`, `frontend/src/components/layout/Ticker.tsx`
**Depends on:** none (parallel with T1, T2)
**Verify:** Both files start with the `@deprecated` block. Both still export cleanly (no orphaned imports).

### T4: TypeScript + frontend build clean
**Do:** Run from project root: `npx tsc --noEmit`. Then `cd frontend && npm run build`. Both must exit clean (zero new errors). The 4.6MB main-chunk warning from 0.0.34 stays — it's pre-existing.
**Files:** none (operational)
**Depends on:** T1, T2, T3
**Verify:** Both commands succeed. No new errors introduced.

### T5: Visual smoke (user-gated)
**Do:** `cd frontend && npm run dev`. Walk:
- (a) `/dashboard`: sidebar visible (left, dark navy), no top bar. New Focus content renders inside the sidebar-constrained main area: Hero card (dark, dominant), Trajectory + ActionQueue 2-col row, 3 product cards 3-col row. No `TopBar`/`Ticker` visible anywhere.
- (b) `/settings`, `/help`, `/notifications`, `/dfy/website`: sidebar present, content unchanged from pre-Plan-2.
- (c) Mobile (<lg): legacy mobile header at top with hamburger + Alloro mark, sidebar slides in as drawer when burger tapped, MobileBottomNav at the bottom. No TopBar mobile variant visible.
- (d) Wizard: trigger an onboarding step, confirm the spotlight outline is brand orange (kept from 0.0.34).
- (e) Highlights: confirm `<mark class="hl">` styling shows in Hero rationale + Trajectory body (kept from 0.0.34).
**Files:** none (operational)
**Depends on:** T4
**Verify:** Document each sub-check pass/fail in the execution summary. User-runnable; engineering can confirm via Playwright if available.

### T6: Commit
**Do:**
- Two commits, mirroring the existing pattern: `fix(layout): restore sidebar — keep new dashboard content` for the code change, and `chore: changelog 0.0.35 — restore sidebar (keep new dashboard content)` for the changelog.
- Author: `LagDave <laggy80@gmail.com>` (no Claude attribution per global CLAUDE.md).
- Update `CHANGELOG.md` to v0.0.35 above v0.0.34, framed as a follow-up.
**Files:** `CHANGELOG.md` (new entry), commit metadata
**Depends on:** T4 + T5 sign-off
**Verify:** `git log --oneline -3` shows the two new commits on top of `656d1be7`.

## Done

- [ ] T1-T4 complete; tsc + build clean.
- [ ] T5 visual sub-checks (a)-(e) pass.
- [ ] CHANGELOG.md updated to 0.0.35.
- [ ] Two commits on `dev/dave` with `LagDave` attribution.
- [ ] No regression on non-dashboard pages (they look exactly like pre-Plan-2).
- [ ] No regression on the new dashboard content (Hero/Trajectory/Queue/3 cards still render correctly inside the sidebar-constrained main).
- [ ] TopBar.tsx + Ticker.tsx remain on disk with `@deprecated` JSDoc.

## Out-of-Spec Follow-ups (not this plan)

- Decide within ~1 release cycle whether to delete TopBar.tsx + Ticker.tsx or commit to a different navigation rethink that revives them.
- Adjust new dashboard card spacing if T5 sub-check (a) reveals the Hero or product cards look cramped at typical sidebar-open desktop widths (1280-1440px).
- Reintroduce a refresh affordance on the new dashboard if users miss it (Plan 2's TopBar carried one; the legacy DashboardOverview also had one).
- Mobile redesign of the new dashboard cards (current mobile is "works, doesn't crash" inside the legacy mobile header + bottom nav).
