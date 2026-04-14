# PM Phase-6 Finishers

## Why
Phase-6 power features spec (`plans/03252026-no-ticket-pm-phase6-power-features/spec.md`) landed most tasks but three UI items were never built: the tasks-over-time chart, the completion celebration, and the empty-state variants. They shape the polish the dashboard claims to have.

## What
Three isolated frontend additions plus one new backend endpoint:
1. `TasksOverTimeChart.tsx` — 14-day daily-completions line chart on `ProjectsDashboard` overview
2. `CompletionCelebration.tsx` — green pulse + particle burst when a task enters a Done column (drag-drop or detail panel)
3. `EmptyStates.tsx` — four named variants used in dashboard/kanban/activity/search views
4. `GET /api/pm/stats/chart-data` — returns `{ daily_completions: [{ date, count }] }` for last 14 days, derived from `pm_activity_log` where `action = 'task_completed'`

Done when: endpoint returns correct 14-day window, chart renders with animation, celebration triggers on move-to-Done (drag and detail-panel column change), all four empty-state variants render where they belong, build passes, manual smoke passes.

## Context

**Relevant files — backend:**
- `src/controllers/pm/PmStatsController.ts` — add `getChartData` handler; reuse existing query style
- `src/routes/pm/stats.ts` — register new route
- `src/models/PmActivityLogModel.ts` — `action` string column; `task_completed` is an existing value emitted by `pmActivityLogger`

**Relevant files — frontend:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — mount `TasksOverTimeChart` in overview
- `frontend/src/components/pm/CompletionRing.tsx` — nearest analog for chart file (Recharts, Alloro orange, animated entry)
- `frontend/src/components/pm/VelocityChart.tsx` — second Recharts analog; match patterns
- `frontend/src/components/pm/KanbanBoard.tsx` — trigger celebration on drop into Done
- `frontend/src/components/pm/TaskDetailPanel.tsx` — trigger celebration when column change lands on Done
- `frontend/src/components/pm/TaskCard.tsx` — celebration anchors to a card's bounding box
- `frontend/src/components/pm/KanbanColumn.tsx` — consume `EmptyStates.NoTasksInColumn`
- `frontend/src/pages/admin/ProjectBoard.tsx` — hook empty states to activity and search
- `frontend/src/api/pm.ts` — add `getChartData()` wrapper

**Patterns to follow:**
- Recharts animation style: match `VelocityChart.tsx` — `isAnimationActive`, `animationDuration: 800`, `animationEasing: "ease-out"`
- Chart colors: Alloro orange `#D66853` line, muted grid via `var(--color-pm-border-subtle)`
- Framer Motion particles: match existing usage in PM (search `motion.div` in `components/pm`)
- Empty-state tone: match existing microcopy tone from `components/pm/*` (quiet, one-line)

**Reference files:**
- Chart component → `frontend/src/components/pm/VelocityChart.tsx`
- Skeleton loader pairing → `frontend/src/components/pm/Skeletons.tsx`
- Celebration pattern — no existing analog; create new self-contained component

## Constraints

**Must:**
- Match existing Alloro PM dark theme tokens (`var(--color-pm-*)`)
- Use Recharts (already installed)
- Chart data derived from `pm_activity_log`, not computed on the frontend
- No new npm dependencies

**Must not:**
- Modify unrelated Phase-6 code that already shipped
- Change the shape of existing stats endpoints
- Add full-screen confetti (celebration is subtle — pulse + 6-8 particles max, under 1s)

**Out of scope:**
- Performance audit (T8 of original Phase-6)
- Responsive mobile audit (T6 of original Phase-6)
- Command palette / focus mode / error boundary (already shipped)
- TasksOverTimeChart drill-down or date-range picker (fixed 14-day window for v1)

## Risk

**Level:** 1 — isolated UI additions, one read-only endpoint

**Risks identified:**
- `pm_activity_log` may have gaps on days with no completions. **Mitigation:** backend fills missing dates with `count: 0` before returning so the chart line is continuous.
- Celebration animation could fire incorrectly on initial mount when tasks already in Done. **Mitigation:** trigger only on *transition into* Done, not on presence in Done — compare `previousColumnId !== newColumnId && newColumn.name === 'Done'`.
- Particle burst z-index could clash with drag overlay. **Mitigation:** celebration uses `pointer-events: none` and z-index below the drag overlay.

**Blast radius:**
- `PmStatsController.ts` — adds export only; no change to existing handlers
- `stats.ts` route — adds one route; no change to existing
- `ProjectsDashboard.tsx` — new child component mount only
- `KanbanBoard.tsx`, `TaskDetailPanel.tsx` — add a one-shot trigger; no change to drag semantics

## Tasks

### T1: Backend chart-data endpoint
**Do:** Add `getChartData(req, res)` in `PmStatsController.ts`. Query `pm_activity_log` for `action = 'task_completed'` across the last 14 days (inclusive of today). Group by `DATE(created_at)`. Return `{ daily_completions: [{ date: 'YYYY-MM-DD', count: N }] }` sorted ascending. Fill missing dates with `count: 0` so the array is always length 14.
**Files:** `src/controllers/pm/PmStatsController.ts`, `src/routes/pm/stats.ts`
**Depends on:** none
**Verify:** `curl -H 'Authorization: Bearer <token>' localhost:3000/api/pm/stats/chart-data` returns 14 entries. Insert a test activity log row dated 10 days ago; confirm count reflects.

### T2: API wrapper + types
**Do:** Add `getChartData()` to `frontend/src/api/pm.ts`. Add `ChartDataResponse` type in `frontend/src/types/pm.ts`.
**Files:** `frontend/src/api/pm.ts`, `frontend/src/types/pm.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` clean

### T3: TasksOverTimeChart component
**Do:** Create `TasksOverTimeChart.tsx` using Recharts `LineChart`. Alloro orange line, subtle grid, animated entry (match `VelocityChart.tsx`). Fetches via `getChartData()`. Shows skeleton during load (reuse `Skeletons.tsx`). Renders `EmptyStates.NoActivity` if every day is 0. Mount on `ProjectsDashboard.tsx` overview tab next to existing stats row.
**Files:** `frontend/src/components/pm/TasksOverTimeChart.tsx`, `frontend/src/pages/admin/ProjectsDashboard.tsx`
**Depends on:** T2, T5 (for empty-state reference)
**Verify:** Manual: dashboard shows 14-day line, animates on mount, matches `VelocityChart.tsx` visual language

### T4: CompletionCelebration component
**Do:** Create `CompletionCelebration.tsx` — absolutely-positioned overlay anchored to a task card's bounding box. Green border pulse (500ms, `box-shadow` flash) + 6 Framer Motion particles (Alloro orange + green, expand outward + fade, 800ms total). `pointer-events: none`. Self-cleans after animation via `onAnimationComplete`. Export a `triggerCelebration(taskId, rect)` helper or use a portal + context.

Wire triggers:
- `KanbanBoard.tsx` — after successful drop mutation, if the destination column's `name === 'Done'` and it wasn't the source column, fire celebration for that card's id.
- `TaskDetailPanel.tsx` — after column change persists, same rule.
**Files:** `frontend/src/components/pm/CompletionCelebration.tsx`, `frontend/src/components/pm/KanbanBoard.tsx`, `frontend/src/components/pm/TaskDetailPanel.tsx`
**Depends on:** none
**Verify:** Manual: drag a task into Done → see pulse + particles. Change column to Done from detail panel → same. Drop inside Done (same column) → no celebration.

### T5: EmptyStates component
**Do:** Create `EmptyStates.tsx` exporting four named variants:
- `NoProjects` — "Create your first project" CTA, opens `CreateProjectModal`
- `NoTasksInColumn` — dashed outline + "No tasks yet" (drop-zone aware)
- `NoActivity` — "No activity yet"
- `NoSearchResults` — "No results for '{query}'" (takes `query` prop)

Use Lucide icons, muted theme colors. Each variant is a small (<80 lines) composable component.

Wire:
- `ProjectsDashboard.tsx` — `NoProjects` when project list is empty
- `KanbanColumn.tsx` — `NoTasksInColumn` when column has no tasks
- `ActivityTimeline.tsx` — `NoActivity` when feed is empty
- `CommandPalette.tsx` — `NoSearchResults` when search yields nothing
**Files:** `frontend/src/components/pm/EmptyStates.tsx`, `frontend/src/pages/admin/ProjectsDashboard.tsx`, `frontend/src/components/pm/KanbanColumn.tsx`, `frontend/src/components/pm/ActivityTimeline.tsx`, `frontend/src/components/pm/CommandPalette.tsx`
**Depends on:** none
**Verify:** Manual: clear local state for each surface and confirm the empty state renders (or temporarily force-empty)

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] `GET /api/pm/stats/chart-data` returns a 14-element array with zero-filled gaps
- [ ] `TasksOverTimeChart` renders on dashboard with animated Recharts line
- [ ] Dragging a task into Done fires celebration; dropping within Done does not
- [ ] Changing column to Done from detail panel fires celebration
- [ ] All four empty states render in their target surfaces when empty
- [ ] No regressions in existing Phase-6 features (CommandPalette, FocusMode, Skeletons, PmErrorBoundary, CompletionRing, VelocityChart)
