# PM Phase 3: Dashboard & UI Polish

## Why
The kanban board works. Now we need the dashboard — the landing page when clicking "Projects." This is the command center: stats, project grid, activity feed, and placeholder for the daily brief.

## What
- Stats API endpoint with aggregate counts
- Activity feed API endpoint (global, paginated)
- Dashboard page with: Daily Brief card (placeholder), animated stats row, project grid, activity timeline
- Readable deadline formatting utility
- All Framer Motion animations (card enter/exit, page transitions, stat counters)
- Dark/light mode toggle

**Depends on:** Phase 2 complete (CRUD APIs, Zustand store, project/task data flowing)

## Context

**Relevant files:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — empty shell from Phase 1, becomes the dashboard
- `frontend/src/stores/pmStore.ts` — Zustand store from Phase 2
- `frontend/src/api/pm.ts` — API functions from Phase 2
- `frontend/src/index.css` — PM color tokens from Phase 1
- `frontend/src/lib/animations.ts` — existing animation utilities
- `src/models/PmTaskModel.ts`, `PmProjectModel.ts`, `PmActivityLogModel.ts` — models from Phase 1

**Patterns to follow:**
- Framer Motion: existing usage throughout admin UI (AnimatePresence, motion.div)
- Responsive: Tailwind breakpoints (sm/md/lg/xl)
- React Query or Zustand for data fetching (project already uses both)

## Constraints

**Must:**
- Stats endpoint must be a single efficient query (no N+1)
- Activity feed must be paginated (20 items per page, cursor or offset)
- All numbers animate on mount (Framer Motion spring)
- Project grid: 3 columns desktop, 2 tablet, 1 mobile
- Deadline display uses date-fns formatDistanceToNow or custom logic per Section 5.5
- Daily Brief card is a styled placeholder in this phase (real data in Phase 5)

**Must not:**
- Fetch all tasks client-side to compute stats — server computes
- Use CSS animations — all motion via Framer Motion
- Build the AI features — placeholder only

**Out of scope:**
- Daily Brief real data (Phase 5)
- Charts/Recharts (Phase 6)
- Command palette (Phase 6)
- Focus Mode (Phase 6)

## Risk

**Level:** 1

**Risks identified:**
- Stats query performance with many tasks → **Mitigation:** single aggregation query with GROUP BY, indexed columns from Phase 1

## Tasks

### T1: Build `/api/pm/stats` endpoint
**Do:** Create controller handler for `GET /api/pm/stats`. Returns:
```json
{
  "total_active_tasks": 42,
  "tasks_due_this_week": 8,
  "completion_rate": 0.67,
  "overdue_count": 3
}
```
Single query using Knex aggregations on `pm_tasks`:
- `total_active_tasks`: count where completed_at IS NULL
- `tasks_due_this_week`: count where deadline BETWEEN now() AND end_of_week AND completed_at IS NULL
- `completion_rate`: completed / total for all active projects
- `overdue_count`: count where deadline < now() AND completed_at IS NULL
**Files:** `src/controllers/pm/PmStatsController.ts`, `src/routes/pm/stats.ts`
**Verify:** `curl /api/pm/stats` returns correct counts matching manual DB check

### T2: Build `/api/pm/activity` endpoint
**Do:** Create controller for `GET /api/pm/activity`. Paginated (limit/offset query params, default limit 20). Returns activity entries with user info joined. Also `GET /api/pm/projects/:id/activity` for project-scoped feed. Each entry includes: id, action, metadata, created_at, user (id, display_name, email), project (id, name, color), task (id, title) if applicable.
**Files:** `src/controllers/pm/PmActivityController.ts`, `src/routes/pm/activity.ts`
**Verify:** `curl /api/pm/activity?limit=5` returns paginated results with user/project info

### T3: Build DailyBriefCard placeholder
**Do:** Styled card at top of dashboard. Shows: "Your daily brief will appear here tomorrow morning." with a subtle sparkle icon. Warm styling per PM color tokens. Pulsing dot animation (CSS or Framer). This is a visual placeholder — real data comes in Phase 5.
**Files:** `frontend/src/components/pm/DailyBriefCard.tsx`
**Verify:** Manual: component renders at top of dashboard with placeholder text

### T4: Build StatsRow with animated metric cards
**Do:** Horizontal row of 4 stat cards. Each card: Lucide icon, metric label, animated number (Framer Motion spring from 0 to value on mount). Cards: "Active Tasks" (ClipboardList icon), "Due This Week" (Calendar icon), "Completion Rate" (CheckCircle icon, shows percentage), "Overdue" (AlertTriangle icon, red accent if > 0). Fetch data from `/api/pm/stats` via Zustand or React Query.
**Files:** `frontend/src/components/pm/StatsRow.tsx`
**Verify:** Manual: stats animate on page load, numbers match API response

### T5: Build ProjectGrid + ProjectCard
**Do:**
- `ProjectGrid.tsx`: responsive grid (CSS grid with Tailwind: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). Renders `ProjectCard` for each project. Clicking card navigates to `/admin/pm/:projectId`.
- `ProjectCard.tsx`: shows project icon (Lucide, dynamic by name) + color accent dot, project name, task progress bar (animated width, e.g. "12/18 done"), deadline indicator in readable format, member avatars (small stack), recent activity snippet (last action text). Framer Motion: cards stagger-enter on mount.
**Files:** `frontend/src/components/pm/ProjectGrid.tsx`, `frontend/src/components/pm/ProjectCard.tsx`
**Verify:** Manual: project cards render in grid, progress bars animate, clicking navigates to kanban

### T6: Build ActivityTimeline
**Do:** Scrolling feed component. Each entry: user avatar (circle with initials), action text (e.g. "Dave moved 'Fix hero section' to Done"), project color dot, timestamp in readable relative format. "Load more" button at bottom for pagination. Framer Motion: entries slide in on mount.
**Files:** `frontend/src/components/pm/ActivityTimeline.tsx`
**Verify:** Manual: activity feed renders with entries, "load more" fetches next page

### T7: Build deadline formatting utility
**Do:** Create `frontend/src/utils/pmDateFormat.ts`. Function `formatDeadline(date: string | Date)` returns:
- `"overdue"` — past deadline (red)
- `"today"` — due today (amber)
- `"tomorrow"` — due tomorrow
- `"3 days"` — due within 3 days (amber)
- `"this week"` — due within current week (green)
- `"2 weeks"` — further out (muted)
- `"Mar 15"` — more than 2 weeks out
Also returns a color class/token for each case. Uses date-fns `isToday`, `isTomorrow`, `differenceInDays`, `isThisWeek`, `format`.
**Files:** `frontend/src/utils/pmDateFormat.ts`
**Verify:** Unit test or manual: verify all cases return correct strings

### T8: Wire dashboard page
**Do:** Assemble `ProjectsDashboard.tsx` with all components: DailyBriefCard at top, StatsRow below, ProjectGrid in main area, ActivityTimeline in right column (desktop) or below grid (mobile). Add the "New Project" FAB (floating action button) in bottom-right corner — Alloro orange, "+" icon, opens CreateProjectModal on click. Fetch data on mount via Zustand store.
**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`
**Verify:** Manual: full dashboard renders with all sections, FAB opens creation modal

### T9: Add Framer Motion animations across PM components
**Do:** Review all PM components and add:
- Card enter: fade + slide up (stagger for grids)
- Card exit: shrink + fade out
- Page transitions: shared layout animation between dashboard ↔ kanban (AnimatePresence in route wrapper)
- Progress bars: animated width (0 → actual, 0.4s ease-out)
- Stat counters: spring number animation on mount
- New task: slides in from top with fade
- Delete: card shrinks + fades, siblings reflow
**Files:** Various PM components
**Verify:** Manual: all transitions feel smooth, no layout jumps

### T10: Dark/light mode support
**Do:** Ensure all PM components use the CSS custom properties from `--pm-*` tokens. Add a toggle in the PM dashboard header (sun/moon icon). Toggle adds/removes `dark` class on `<html>`. Store preference in localStorage. Dark mode is primary per spec. Use Tailwind `dark:` variant classes where PM tokens aren't sufficient.
**Files:** `frontend/src/components/pm/ThemeToggle.tsx`, various PM components
**Verify:** Manual: toggle between dark and light mode, all PM UI adapts correctly

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Stats endpoint returns correct aggregated data
- [ ] Activity endpoint returns paginated feed with user/project info
- [ ] Dashboard renders: brief placeholder, stats row, project grid, activity timeline
- [ ] All numbers and progress bars animate on mount
- [ ] Project cards navigate to kanban on click
- [ ] FAB creates new project
- [ ] Deadline formatting shows correct relative text with colors
- [ ] Dark/light mode works across all PM components
