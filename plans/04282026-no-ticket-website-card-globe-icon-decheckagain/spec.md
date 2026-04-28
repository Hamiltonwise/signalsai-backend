# Website Card — Globe icon, no Check Again button

## Why
The "Preparing your website" state on the Focus dashboard's Website card uses a spinning `Loader2` icon and a "CHECK AGAIN" button. UX wants it to mirror the PMS card's quiet empty-state pattern: static icon, centered text, no action button.

## What
- Swap `Loader2` (spinning) for `Globe2` in `ErrorShell`.
- Remove the "Check again" button entirely.
- Centering already works via `CenteredState`; verify visual match against PMS `EmptyShell`.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/focus/WebsiteCard.tsx` — owns the `ErrorShell` rendered for the "Preparing your website" state (line 172-195).
- `frontend/src/components/dashboard/focus/PMSCard.tsx` — `EmptyShell` (line 169-200) is the visual reference for icon + centered copy with no action.

**Patterns to follow:**
- `CenteredState` helper at `WebsiteCard.tsx:123` already handles flex-centering. Pass a non-spinning icon and omit `action`.

**Reference file:** `frontend/src/components/dashboard/focus/PMSCard.tsx` — closest analog (same card shell, centered icon block, same typography).

## Constraints

**Must:**
- Keep the existing `CardShell` + `Eyebrow` + `CenteredState` composition.
- Use `Globe2` from lucide (already imported in this file at line 3).

**Must not:**
- Touch `NotReadyShell`, `EmptyShell`, or success-path render.
- Add new dependencies.

**Out of scope:**
- Copy changes to title/hint.
- Touch the retry logic on `stats`/`series` queries (react-query handles this; we just stop exposing a manual button).

## Risk

**Level:** 1 (Suggestion)

**Risks identified:**
- Dead code if `onRetry` prop and `retry` callback are no longer consumed → **Mitigation:** drop the `onRetry` prop, `ErrorShellProps` interface, and the `retry` ref passed at the call site, plus prune now-unused imports (`Loader2`, `RefreshCw`).

**Blast radius:** `ErrorShell` is local to `WebsiteCard.tsx` (not exported). Single render site at line 326.

## Tasks

### T1: Replace spinning loader with Globe2 and drop Check Again
**Do:** In `ErrorShell`, swap `Loader2` → `Globe2`, remove `spin`, remove `action` prop (the Check again button). Remove `onRetry` prop, `ErrorShellProps` interface. Update call site at line 326 to `<ErrorShell />`. Drop unused imports `Loader2` and `RefreshCw`.
**Files:** `frontend/src/components/dashboard/focus/WebsiteCard.tsx`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit`

## Done
- [ ] `cd frontend && npx tsc --noEmit` — zero new errors
- [ ] Manual: Website card "Preparing your website" state shows globe icon, centered, no Check Again button
- [ ] No regressions in success/empty/not-connected paths
