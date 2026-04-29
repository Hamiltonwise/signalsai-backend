# Homepage Focus Card Cleanup

## Why
The homepage focus hero is visually overloaded: the right insight panel truncates metric content, raw source-field labels leak implementation details, and task actions/due dates compete with the main recommendation. The dashboard also needs to distinguish current, stale, and missing PMS data so users know when to upload the next month without changing the PMS upload/manual-entry flows.

## What
Clean up the Focus homepage card and add PMS-data-aware header states:
- Keep the existing dark hero/card appearance, but make the right insight panel readable and non-truncated.
- Remove `Open task`, `Assign to team`, `Not now`, due date, `TIME-SENSITIVE`, and raw source-field labels from the hero.
- Show `Focus — {latest PMS month}` and `{month start} – {month end}` based on latest approved PMS data when available.
- If the latest PMS month is behind the current calendar month, show a persistent upload nudge above the focus section until a newer PMS month exists.
- If no PMS data exists, render the same hero shell with empty-state verbiage instead of the normal action copy.
- Remove the temporary debug toggle so the dashboard always reflects current PMS data.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/DashboardOverview.tsx` — owns the Focus header, period label, and hero placement.
- `frontend/src/components/dashboard/focus/Hero.tsx` — renders the dark recommendation card, CTAs, due footer, right metric panel, loading/empty/error states.
- `frontend/src/hooks/queries/useTopAction.ts` — fetches and parses Summary-created top action metadata from tasks.
- `frontend/src/api/pms.ts` — exposes `fetchPmsKeyData`, whose `months[]` list can identify the latest approved PMS month.
- `frontend/src/lib/queryClient.ts` — query key factory; new PMS focus-period query keys belong here.

**Patterns to follow:**
- Keep API access inside `frontend/src/hooks/queries/` hooks, not directly inside components.
- Use the existing Focus dashboard composition pattern: `DashboardOverview` stays thin and delegates UI to focus subcomponents.
- Use existing PMS key-data semantics; do not redesign or modify PMS upload/manual-entry modals.

**Key decisions already made:**
- Latest approved PMS data determines the displayed Focus month when PMS data exists.
- The upload nudge targets the missing/current calendar month, e.g. if latest PMS data is April and the current month is May, the nudge should ask for May PMS data.
- Debug controls are removed from the dashboard; testing should use seeded PMS data or local date simulation instead of visible UI toggles.

## Constraints

**Must:**
- Hide raw `supporting_metrics[*].source_field` values from the UI.
- Keep the right panel readable at desktop and responsive widths; no clipped or ellipsized stat cards.
- Preserve the existing dark card visual language and the main recommendation text treatment.
- Keep upload CTA behavior routed to the existing PMS upload flow/page only; do not alter upload/manual-entry modals.
- Use `QUERY_KEYS`, typed hooks, and no direct API calls in React components.

**Must not:**
- Touch PMS upload/manual-entry modal implementation.
- Introduce a new chart/UI dependency.
- Add backend schema changes or migrations.
- Change Summary agent output contracts unless frontend-only derivation proves impossible.
- Leave debug UI visible in production builds.

**Out of scope:**
- Rewriting monthly agent task creation.
- Changing PMS parsing/approval logic.
- Building task assignment/open-task workflows.
- Redesigning lower dashboard cards.

## Risk

**Level:** 2 — Concern

**Risks identified:**
- Current Focus header uses `new Date()`, which can drift from the latest processed PMS month. → **Mitigation:** derive the displayed Focus month from latest approved PMS key-data month and only fall back to current month when no PMS month exists.
- A dev debug toggle can become production clutter. → **Mitigation:** gate it behind `import.meta.env.DEV` and keep the states isolated in a tiny helper so removal is one-file/simple.
- The hero right panel currently depends on agent-generated metric labels/values of variable length. → **Mitigation:** render metric values in flexible rows/cards with wrapping and omit implementation source labels entirely.

**Pushback:**
- The right panel is trying to show too much provenance. Future-us will hate debugging a design that exposes internal metric paths to clients. The UI should show business meaning only; source-field validation belongs in backend/agent plumbing, not the homepage card.

## Tasks

### T1: PMS-aware focus period
**Do:** Add a query hook that reads `fetchPmsKeyData`, derives latest PMS month, current-month staleness, empty state, focus label, period label, and upload-nudge copy. Add the needed query key factory entry.
**Files:** `frontend/src/hooks/queries/usePmsFocusPeriod.ts`, `frontend/src/lib/queryClient.ts`
**Verify:** `cd frontend && npx tsc -b`

### T2: Header and upload nudge
**Do:** Update `DashboardOverview` to use the PMS focus-period hook, render `Focus — {derived month}`, preserve the period label for the focus month, and show a compact upload nudge only when the latest PMS month is stale. Keep debug controls out of the production dashboard UI.
**Files:** `frontend/src/components/dashboard/DashboardOverview.tsx`
**Verify:** Manual: seed stale and empty PMS states; confirm the heading/period/nudge copy updates without affecting upload modals.

### T3: Hero card cleanup
**Do:** Remove the primary/secondary/tertiary CTA row, due footer, `TIME-SENSITIVE` label, and raw metric source labels. Rework the right insight panel layout so metric values wrap cleanly and the panel reads as concise supporting evidence, not three truncated cards.
**Files:** `frontend/src/components/dashboard/focus/Hero.tsx`
**Verify:** Manual: load the focus dashboard at desktop width and confirm no right-panel truncation or raw `pms.*`/`referral.*` strings are visible.

### T4: Hero empty PMS state
**Do:** Pass the PMS empty-state signal into the hero and render the same dark card shell with no-data verbiage when no approved PMS data exists. Keep the copy distinct from the normal `no top action yet` processing state.
**Files:** `frontend/src/components/dashboard/DashboardOverview.tsx`, `frontend/src/components/dashboard/focus/Hero.tsx`
**Verify:** Manual: simulate no approved PMS data and confirm the hero shows no-data copy, no action buttons, no due date, and no right metric clutter.

## Done
- [ ] `cd frontend && npx tsc -b` passes.
- [ ] Targeted lint passes for changed frontend files or only reports unrelated pre-existing lint issues.
- [ ] Manual: normal state keeps the dark hero card and readable right panel.
- [ ] Manual: stale state shows an upload nudge for the missing/current month while keeping Focus/Period on latest PMS month.
- [ ] Manual: empty state shows the no-data hero copy and no CTAs/due/source-field labels.
- [ ] No development debug toggle is visible on the dashboard.
- [ ] PMS upload/manual-entry modal files remain untouched.

## Revision Log

### Rev 1 — April 30, 2026
**Change:** Delay the stale PMS upload nudge until the month after the requested data month begins.
**Reason:** If latest uploaded data is March, April PMS data is not complete until May 1, so the dashboard should not ask for April data during April. Debug toggles were also removed so the visible dashboard reflects current data only.
**Updated Done criteria:** Stale nudge appears only when `currentMonth > monthAfterLatestPmsMonth`; March latest data asks for April starting May 1; no debug toggle is visible.
