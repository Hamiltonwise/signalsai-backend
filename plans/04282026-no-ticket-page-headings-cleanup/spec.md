---
id: spec-page-headings-cleanup
created: 2026-04-28
ticket: no-ticket
mode: --instant
status: planning
---

# Page Headings Cleanup — Drop 4, Shrink 1, Add Serif

## Why
The page-level eyebrow + headline + subtitle blocks on Tasks, Notifications, Help, and Settings are taking up first-fold space without adding signal — the page content speaks for itself. Rankings keeps its heading but is too large in the current 4xl/5xl scale. Across the rest of the app, headings still use Plus Jakarta Sans; the Fraunces serif we introduced for the Focus dashboard reads better on heading-scale type and we want it consistent.

## What
1. Remove the heading blocks entirely from **Tasks**, **Notifications**, **Help**, and **Settings**.
2. Shrink the **Rankings** heading and switch it to Fraunces (`font-display`).
3. Apply Fraunces (`font-display` utility from 0.0.34) to remaining page-level headings across the app.

**Done when:**
- The 4 headings flagged for removal are gone.
- Rankings heading uses `font-display` and a smaller scale (target ~24-28px range, weight 500-600, tighter tracking).
- Any other page-level h1/h2 elements that previously rendered in Plus Jakarta Sans now use `font-display`.
- TypeScript check + frontend build clean.

## Files
- `frontend/src/components/tasks/TasksView.tsx` — remove heading region
- `frontend/src/pages/Notifications.tsx` — remove heading region
- `frontend/src/pages/Help.tsx` — remove heading region
- `frontend/src/pages/Settings.tsx` — remove heading region
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — shrink + serif
- 1-3 other page files with prominent h1/h2 still using Plus Jakarta Sans — apply `font-display`

## Constraints
**Must:**
- Use the existing `font-display` Tailwind utility from `index.css:1137` (= Fraunces). Don't introduce new font tokens.
- Preserve any logic in the heading region (e.g., dynamic practice name in Settings, status pill in Notifications) — only the visible heading copy is removed; surrounding control regions stay unless they're tightly coupled.
- TypeScript + frontend build must remain clean.

**Must not:**
- Touch backend code.
- Change the Focus dashboard's existing typography (Hero, Trajectory, etc. already use `font-display`).
- Touch the global CSS tokens — just apply existing utility classes.
- Globally replace every h1 in the app — only page-level page headers get serif. Component-internal section headings stay as-is unless trivially adjacent.

## Tasks

### T1: Remove TasksView heading region
**Do:** In `frontend/src/components/tasks/TasksView.tsx`, find the "Actionable Growth" eyebrow + "Practice Roadmap" heading + "Complete these Team Tasks..." subtitle block and remove it cleanly. Keep any controls (filters, action buttons) that are visually adjacent but not part of the heading copy.
**Verify:** `npx tsc --noEmit` clean. Visual: Tasks tab/page renders without the title block; tasks list starts higher.

### T2: Remove Notifications heading region
**Do:** In `frontend/src/pages/Notifications.tsx`, remove the "Notifications Active" + "Practice Updates" + "A live feed..." block. Preserve the "Monthly" filter control if it's a separate element (not part of the subtitle).
**Verify:** tsc clean. Visual: Notifications page renders without the title block.

### T3: Remove Help heading region
**Do:** In `frontend/src/pages/Help.tsx`, remove the "We are here to help" + "How can we help?" + "Talk to your Alloro Strategist..." block. Keep any chat/contact CTAs that follow.
**Verify:** tsc clean. Visual: Help page renders without the title block.

### T4: Remove Settings heading region
**Do:** In `frontend/src/pages/Settings.tsx`, remove the avatar-circle + practice-name heading + "Manage your practice details..." subtitle block. Preserve any tab nav or section structure that follows.
**Verify:** tsc clean. Visual: Settings page renders without the title/avatar block.

### T5: Shrink Rankings heading + serif
**Do:** In `frontend/src/components/dashboard/RankingsDashboard.tsx`, find the "Local SEO Tracking On" eyebrow + "Local Reputation" heading + subtitle. Keep all three but:
- Heading: switch from current text-4xl/5xl to `text-2xl md:text-3xl`, add `font-display font-medium tracking-tight`
- Eyebrow stays small caps (existing)
- Subtitle stays as-is, possibly slightly smaller
**Verify:** tsc clean. Visual: heading is noticeably smaller and renders in Fraunces.

### T6: Apply `font-display` to other prominent page headings
**Do:** Find 1-3 remaining page-level headings (h1/h2 with sizes 2xl+ that aren't inside a card/component already styled). Add `font-display` to each. Likely candidates: Patient Journey Insights tab header (if any), DFY Website page header, any dashboard sub-tabs that have a top heading. Don't go on a hunt — pick the most visible 1-3 and stop.
**Verify:** tsc clean. Visual: those headings now render in Fraunces.

### T7: Verify
**Do:** `npx tsc --noEmit` from project root + `cd frontend && npm run build`. Both clean.
**Verify:** Both commands exit 0.

### T8: Commit
**Do:** Single commit `fix(ui): drop 4 page headings, shrink Rankings, apply serif to remaining headers` + changelog 0.0.36 with `LagDave` author.
**Verify:** `git log --oneline -2` shows the new commits.

## Done
- [ ] T1-T7 complete; tsc + build clean.
- [ ] CHANGELOG.md updated to 0.0.36.
- [ ] Two commits on dev/dave with LagDave attribution.

## Out-of-Spec Follow-ups
- Audit every remaining h1/h2 in the app for serif consistency in a separate pass if T6 leaves visible inconsistencies.
- Page-header redesign as a unified component (`<PageHeader />`) — currently headers are inlined per-page.
