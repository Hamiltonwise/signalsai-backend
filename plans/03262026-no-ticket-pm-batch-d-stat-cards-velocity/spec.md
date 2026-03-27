# PM Batch D: Stat Cards Replacement + Velocity Chart

## Why
The current 4 stat cards (Active Tasks, Due This Week, Completion Rate, Overdue) are generic counters with no actionable context. Replace with 3 focused metric cards (Focus Today, This Week, Backlog) that drive behavior, plus a full-width Velocity chart showing completed vs overdue trends over time with 7D/4W/3M toggle. This gives the dashboard real analytical value.

## What
1. New `GET /api/pm/stats` endpoint replacing old stats (Focus Today, This Week, Backlog counts)
2. New `GET /api/pm/stats/velocity?range=7d|4w|3m` endpoint for chart data
3. Replace `StatsRow` component with 3 new stat cards in a 3-column grid
4. New `VelocityChart` component — full-width dual-line Recharts card with time toggle
5. Update dashboard layout to 3-col stat grid + full-width velocity row

## Context

**Relevant files:**
- `src/controllers/pm/PmStatsController.ts` — current `getStats` handler returns `{ total_active_tasks, tasks_due_this_week, completion_rate, overdue_count }`. Needs full replacement.
- `src/routes/pm/stats.ts` — single `GET /` route. Need to add `/velocity`.
- `frontend/src/components/pm/StatsRow.tsx` — current 4-card component with `AnimatedNumber`, Framer spring animation. Will be completely rewritten.
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — renders `<StatsRow />` in the layout
- `frontend/src/api/pm.ts` — `fetchStats()` function. Need to add `fetchVelocity()`.
- `frontend/src/types/pm.ts` — `PmStats` interface. Needs replacement.
- `recharts` — already installed in `frontend/`

**Patterns to follow:**
- Backend: Knex raw SQL for complex aggregations
- Frontend: Framer Motion `useMotionValue` + `useSpring` for animated numbers
- Charts: Recharts `LineChart` with custom tooltip component
- CSS: inline styles with `var(--color-pm-*)` tokens
- API: `{ path }` object syntax, response is `res.data` (single unwrap)

## Constraints

**Must:**
- Focus Today: count tasks due today OR overdue (not completed). Color-coded threshold (0=green, 1-3=amber, 4+=red) with contextual subtitle.
- This Week: current Mon→Sun window, not completed. Subtitle "due by Sunday".
- Backlog: count tasks in Backlog columns across all active projects. Subtitle threshold (0="All clear", 1-10="unscheduled", 11+="consider triaging" in amber).
- Velocity chart: Recharts dual smooth line (`type="monotone"`), completed (solid orange) + overdue (dashed red at 50% opacity).
- Chart has NO Y-axis labels, NO grid lines. X-axis labels only. Clean aesthetic.
- Time range toggle: `7D` (days), `4W` (weeks), `3M` (months). Default `7D`. Animated transition on switch.
- Custom tooltip on hover with date + completed + overdue counts.
- Area fill under completed line: gradient `rgba(214,104,83,0.15)` → transparent.
- Overdue line: dashed `strokeDasharray="4 4"`, dots at 4px, no fill.
- Completed line: solid 2px, dots at 6px with card-bg stroke (punched-out look).
- Responsive: 3-col desktop → single-col mobile. Velocity always full-width.

**Must not:**
- Keep the old stat cards (remove entirely, no overlap)
- Use any chart library other than Recharts (already installed)
- Add Y-axis labels or grid lines to the velocity chart
- Make the velocity API slow — keep queries efficient with proper date filters

**Out of scope:**
- Per-project velocity (this is global across all projects)
- Export/download chart data
- Custom date range picker

## Risk

**Level:** 2 — New SQL queries with date windowing (generate_series). Overdue snapshot logic is non-trivial.

**Risks identified:**
- `generate_series` for overdue snapshots is a correlated subquery that could be slow with many tasks → **Mitigation:** Filter by active projects only. Index on `pm_tasks(deadline) WHERE completed_at IS NULL` already exists from Phase 1.
- Recharts custom tooltip styling in dark mode → **Mitigation:** custom tooltip React component, not the default Recharts tooltip. Full control over styling.

## Tasks

### T1: Replace stats backend endpoint
**Do:** Rewrite `PmStatsController.ts` `getStats` to return:
```json
{
  "focus_today": { "count": 3, "subtitle": "3 need attention", "severity": "amber" },
  "this_week": { "count": 7, "subtitle": "due by Sunday" },
  "backlog": { "count": 4, "subtitle": "unscheduled", "severity": "normal" }
}
```

SQL for focus_today:
```sql
SELECT COUNT(*)::int FROM pm_tasks
WHERE completed_at IS NULL AND deadline IS NOT NULL
  AND deadline <= (CURRENT_DATE + INTERVAL '1 day')
```

SQL for this_week:
```sql
SELECT COUNT(*)::int FROM pm_tasks
WHERE completed_at IS NULL AND deadline IS NOT NULL
  AND deadline >= DATE_TRUNC('week', CURRENT_DATE)
  AND deadline < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
```

SQL for backlog:
```sql
SELECT COUNT(*)::int FROM pm_tasks t
JOIN pm_columns c ON t.column_id = c.id
JOIN pm_projects p ON t.project_id = p.id
WHERE c.name = 'Backlog' AND p.status = 'active' AND t.completed_at IS NULL
```

Compute severity and subtitle server-side based on thresholds from the spec.
**Files:** `src/controllers/pm/PmStatsController.ts`
**Verify:** `curl /api/pm/stats` returns new shape with correct counts

### T2: Build velocity API endpoint
**Do:** Add `GET /api/pm/stats/velocity` to `PmStatsController.ts`. Query param `range` = `7d` | `4w` | `3m` (default `7d`).

Returns:
```json
{
  "completed_total": 12,
  "overdue_total": 3,
  "data": [
    { "label": "Mon", "period_start": "2026-03-20", "completed": 2, "overdue": 1 },
    ...
  ]
}
```

For each range:
- **7d**: `generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day')`. Labels: day abbreviations (Mon, Tue...). Completed = `DATE(completed_at) = day`. Overdue = `deadline < day+1 AND (completed_at IS NULL OR completed_at > day+1)`.
- **4w**: `generate_series(DATE_TRUNC('week', CURRENT_DATE) - 3 weeks, ..., '1 week')`. Labels: `Mar 3`, `Mar 10`... Completed = `completed_at` during that week. Overdue = snapshot at week end.
- **3m**: `generate_series(DATE_TRUNC('month', CURRENT_DATE) - 2 months, ..., '1 month')`. Labels: `Jan`, `Feb`, `Mar`. Completed = during month. Overdue = snapshot at month end.

Run completed + overdue as separate queries per range, then merge by `period_start`.

Add route: `router.get("/velocity", authenticateToken, superAdminMiddleware, controller.getVelocity);`
**Files:** `src/controllers/pm/PmStatsController.ts`, `src/routes/pm/stats.ts`
**Verify:** `curl /api/pm/stats/velocity?range=7d` returns 7 data points with correct structure

### T3: Update frontend types and API
**Do:** Replace `PmStats` in `frontend/src/types/pm.ts`:
```typescript
export interface PmStats {
  focus_today: { count: number; subtitle: string; severity: "green" | "amber" | "red" };
  this_week: { count: number; subtitle: string };
  backlog: { count: number; subtitle: string; severity: "normal" | "amber" };
}

export interface PmVelocityData {
  completed_total: number;
  overdue_total: number;
  data: Array<{
    label: string;
    period_start: string;
    completed: number;
    overdue: number;
  }>;
}
```

Add to `frontend/src/api/pm.ts`:
```typescript
export async function fetchVelocity(range: "7d" | "4w" | "3m" = "7d"): Promise<PmVelocityData> {
  const res = await apiGet({ path: `/pm/stats/velocity?range=${range}` });
  return res.data;
}
```
**Files:** `frontend/src/types/pm.ts`, `frontend/src/api/pm.ts`
**Verify:** `npx tsc --noEmit` passes

### T4: Rebuild StatsRow with 3 new cards
**Do:** Rewrite `frontend/src/components/pm/StatsRow.tsx`. 3-column CSS grid layout:

Card 1 — Focus Today:
- Icon: Lucide `Target`, `#D66853` on `rgba(214,104,83,0.08)` bg
- Number color: green (0), amber (1-3), red (4+)
- Subtitle from API

Card 2 — This Week:
- Icon: Lucide `CalendarRange`, `#D4920A` on `rgba(212,146,10,0.08)` bg
- Number: `text-primary`
- Subtitle: "due by Sunday"

Card 3 — Backlog:
- Icon: Lucide `Inbox`, `#5E5850` on `rgba(94,88,80,0.08)` bg
- Number: `text-primary`
- Subtitle threshold: "All clear" / "unscheduled" / "consider triaging" (amber)

All cards: animated number (spring), `32px/700` value, `11px/600` uppercase label, `12px` subtitle, `20px` card padding, `12px` border-radius, warm shadows.

Grid: `grid-cols-3` desktop, `grid-cols-1` mobile.
**Files:** `frontend/src/components/pm/StatsRow.tsx`
**Verify:** 3 cards render with correct icons, numbers animate, color thresholds work

### T5: Build VelocityChart component
**Do:** Create `frontend/src/components/pm/VelocityChart.tsx`. Full-width card below the stat grid.

Structure:
- Header: icon (TrendingUp, green), "VELOCITY" label, time range toggle pills (7D/4W/3M)
- Summary: "{completed} completed · {overdue} overdue" — numbers in 24px/700, colored
- Chart: Recharts `LineChart` with `ResponsiveContainer` (height 120px)
  - Line 1 (completed): solid `#D66853`, strokeWidth 2, `type="monotone"`, dots 6px with card-bg stroke
  - Line 2 (overdue): `rgba(196,51,51,0.5)`, strokeWidth 1.5, strokeDasharray "4 4", dots 4px, no area
  - Area fill under completed: `linearGradient` from `rgba(214,104,83,0.15)` to transparent
  - XAxis: 10px labels in `text-muted`, no axis line, no ticks
  - No YAxis, no CartesianGrid
  - Custom `Tooltip` component: card-styled with date + completed dot + overdue dot
  - `ReferenceLine` cursor (vertical dashed line on hover) — use Recharts `cursor` prop

Time range toggle:
- Local state `range: "7d" | "4w" | "3m"`
- On change: fetch new data, key the chart to force remount for animation
- Active pill: `rgba(214,104,83,0.14)` bg, `#D66853` text
- Inactive: transparent, `text-muted`

Animation: `animationDuration={800}` on completed line, `animationBegin={200}` on overdue line.
**Files:** `frontend/src/components/pm/VelocityChart.tsx`
**Verify:** Chart renders with both lines, toggle switches data, tooltip appears on hover, animation plays on mount

### T6: Wire into dashboard layout
**Do:** Update `ProjectsDashboard.tsx`:
- Replace `<StatsRow />` with new `<StatsRow />` (same import, rewritten component)
- Add `<VelocityChart />` below stats, above the project grid
- Layout: stats grid → velocity → project grid + activity (existing layout)
**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`
**Verify:** Dashboard shows: Daily Brief → 3 stat cards (3-col) → Velocity chart (full-width) → Projects + Activity

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] `GET /api/pm/stats` returns Focus Today / This Week / Backlog with computed subtitles
- [ ] `GET /api/pm/stats/velocity?range=7d` returns 7 data points
- [ ] `GET /api/pm/stats/velocity?range=4w` returns 4 data points
- [ ] `GET /api/pm/stats/velocity?range=3m` returns 3 data points
- [ ] 3 stat cards render with correct icons, animated numbers, color thresholds
- [ ] Velocity chart shows dual lines (orange solid + red dashed)
- [ ] Time range toggle switches between 7D/4W/3M with animation
- [ ] Custom tooltip shows on hover with date + counts
- [ ] Area gradient under completed line visible
- [ ] No Y-axis, no grid lines on chart
- [ ] Responsive: 3-col → 1-col on mobile, velocity always full-width
