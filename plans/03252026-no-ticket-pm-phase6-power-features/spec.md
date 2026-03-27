# PM Phase 6: Power Features & Polish

## Why
Final polish phase. Command palette for power users, Focus Mode for deep work, animated charts for the dashboard, and comprehensive QA pass. This turns a functional PM tool into a delightful one.

## What
- Command palette (Cmd+K) with fuzzy search
- Focus Mode (full-viewport kanban with ambient gradient)
- Recharts: tasks-over-time line chart + completion ring chart
- Task completion confetti/celebration animation
- Skeleton loaders for all async data
- Responsive testing and mobile breakpoint fixes
- Dark/light mode comprehensive QA
- Error boundaries and empty state designs
- Performance audit (memoization, virtualization)

**Depends on:** All previous phases complete

## Context

**Relevant files:**
- `frontend/src/components/pm/KanbanBoard.tsx` — Focus Mode wraps this
- `frontend/src/components/pm/TaskCard.tsx` — confetti on completion
- `frontend/src/components/pm/StatsRow.tsx` — add completion ring
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — add charts section
- `frontend/src/stores/pmStore.ts` — data source for command palette search

**Patterns to follow:**
- Framer Motion for all animations (consistent with rest of PM module)
- Lucide React for icons
- Tailwind for responsive breakpoints

## Constraints

**Must:**
- Command palette: Cmd+K (Mac) / Ctrl+K (Windows) global shortcut
- Focus Mode: ESC to exit, minimal chrome
- Charts: use Recharts (already installed from Phase 1)
- Confetti: subtle, not obnoxious — small particle burst, quick fade
- Skeleton loaders: match the shape of the real component
- All features work in both dark and light mode

**Must not:**
- Install heavy animation libraries (no canvas-confetti — use CSS/Framer particles)
- Break existing keyboard shortcuts in the admin app
- Virtualize unless board has 100+ cards (premature optimization)

**Out of scope:**
- Notifications/webhooks
- User roles/permissions
- Mobile native features

## Risk

**Level:** 1

**Risks identified:**
- Cmd+K conflicts with browser shortcut → **Mitigation:** `e.preventDefault()` in handler, only when PM module is active
- Focus Mode full-viewport may break on small screens → **Mitigation:** disable Focus Mode below `md` breakpoint

## Tasks

### T1: Build CommandPalette (Cmd+K)
**Do:** Global modal triggered by Cmd+K / Ctrl+K. Centered overlay with search input at top (auto-focused). Actions:
- "Create new task" → opens quick-add with project selector
- "Create new project" → opens CreateProjectModal
- "Search tasks" → fuzzy search across all task titles, shows results
- "Jump to project" → lists projects, click navigates
- "Toggle Focus Mode" → activates Focus Mode in current project

Implementation:
- Register global keydown listener (useEffect in App or PM layout wrapper)
- Fuzzy search: simple substring match on task titles and project names (no library needed for v1)
- Results update as user types (debounce 150ms)
- Arrow keys to navigate results, Enter to select
- ESC or backdrop click to close
- Framer Motion: scale + fade from center
**Files:** `frontend/src/components/pm/CommandPalette.tsx`, wire into PM layout
**Verify:** Manual: Cmd+K opens palette → type "fix" → matching tasks appear → Enter navigates → ESC closes

### T2: Build Focus Mode
**Do:** Activated via expand icon in kanban header bar. Behavior:
- Header collapses to minimal top bar (project name + ESC/exit button only)
- Sidebar completely hidden (if visible)
- Kanban board fills entire viewport (position: fixed, inset: 0, z-index: 40)
- Subtle ambient gradient animation on background (very slow warm color shift — CSS gradient animation, 30s cycle)
- Exit: click exit button or press ESC
- Framer Motion: layout animation for enter/exit (300ms ease-in-out)
- Disable below `md` breakpoint (hide toggle button)
**Files:** `frontend/src/components/pm/FocusMode.tsx`, update `frontend/src/components/pm/KanbanBoard.tsx`
**Verify:** Manual: click focus → board fills screen → gradient visible → ESC exits cleanly

### T3: Build animated Recharts for dashboard
**Do:**
- `TasksOverTimeChart.tsx`: line chart showing tasks completed per day over last 14 days. Query data from activity log (count `task_completed` actions per day). Recharts `LineChart` with custom animated entry. Alloro orange line, subtle grid.
- `CompletionRing.tsx`: animated donut/ring chart for the "Completion Rate" stat card. Animated from 0 to actual percentage on mount. Alloro orange fill, gray track. Center text shows percentage.
- Add new backend endpoint `GET /api/pm/stats/chart-data` returning `{ daily_completions: [{ date, count }] }` for last 14 days.
**Files:** `frontend/src/components/pm/TasksOverTimeChart.tsx`, `frontend/src/components/pm/CompletionRing.tsx`, `src/controllers/pm/PmStatsController.ts` (add chart-data handler), `src/routes/pm/stats.ts`
**Verify:** Manual: dashboard shows line chart with data points, ring chart animates on load

### T4: Build task completion celebration
**Do:** When a task is moved to the "Done" column (drag-drop or via detail panel):
- Task card briefly pulses green (border flash, 500ms)
- Small particle burst animation (6-8 small circles in Alloro orange + green, expand outward and fade, 800ms total). Use Framer Motion `animate` on absolutely-positioned divs.
- Subtle, quick, satisfying. Not a full-screen confetti cannon.
**Files:** `frontend/src/components/pm/TaskCard.tsx` or new `frontend/src/components/pm/CompletionCelebration.tsx`
**Verify:** Manual: drag task to Done → green pulse + particle burst → animation completes cleanly

### T5: Build skeleton loaders
**Do:** Create `frontend/src/components/pm/Skeletons.tsx` with skeleton variants:
- `ProjectCardSkeleton` — matches ProjectCard shape (progress bar, title, deadline)
- `TaskCardSkeleton` — matches TaskCard shape (priority dot, title, deadline)
- `StatsRowSkeleton` — 4 stat card shapes
- `DailyBriefSkeleton` — brief card shape
- `ActivityEntrySkeleton` — single activity row shape

Use Tailwind `animate-pulse` on gray placeholder shapes. Apply in all PM components during loading state (replace raw "Loading..." text or empty renders).
**Files:** `frontend/src/components/pm/Skeletons.tsx`, update loading states in all PM page components
**Verify:** Manual: refresh dashboard → skeletons visible briefly before data loads

### T6: Responsive testing + mobile fixes
**Do:** Test all PM views at breakpoints: 320px, 375px, 768px, 1024px, 1440px. Fix issues:
- Dashboard: single-column grid on mobile, stats row wraps to 2x2
- Kanban: horizontal scroll on mobile (columns don't stack), touch-friendly drag handles
- Task detail panel: full-screen on mobile (not slide-over)
- Command palette: full-width on mobile with larger touch targets
- FAB: ensure doesn't overlap important content on small screens
**Files:** Various PM components
**Verify:** Manual: test at each breakpoint, no overflow, no truncation, all interactive elements accessible

### T7: Error boundaries + empty states
**Do:**
- `PmErrorBoundary.tsx`: React error boundary wrapping PM routes. Shows friendly error message with "Reload" button. Logs to Sentry.
- Empty states for each view:
  - Dashboard with no projects: illustration/icon + "Create your first project" CTA
  - Kanban column with no tasks: subtle dashed outline + "No tasks yet" text
  - Activity feed empty: "No activity yet"
  - Search results empty: "No results for '[query]'"
- Wrap PM routes in error boundary
**Files:** `frontend/src/components/pm/PmErrorBoundary.tsx`, `frontend/src/components/pm/EmptyStates.tsx`, update PM page components
**Verify:** Manual: delete all projects → empty states show everywhere. Throw error → error boundary catches.

### T8: Performance audit
**Do:** Review all PM components for:
- `React.memo()` on TaskCard (prevents re-render of entire board on single card change)
- `useMemo` on sorted/filtered task lists
- `useCallback` on drag handlers passed as props
- Debounce on search input in CommandPalette (150ms)
- Lazy load: `React.lazy()` for PM pages (code-split from main admin bundle)
- If any kanban board has 100+ cards: add `react-virtual` (install only if needed, recommend but don't force for v1)
**Files:** Various PM components
**Verify:** React DevTools Profiler: no unnecessary re-renders on single task drag. Lighthouse: no regressions.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Cmd+K command palette works with search and navigation
- [ ] Focus Mode fills viewport with ambient gradient
- [ ] Dashboard charts render with animation
- [ ] Task completion shows celebration animation
- [ ] Skeleton loaders appear during all loading states
- [ ] All views responsive at 320px–1440px
- [ ] Error boundaries catch PM errors
- [ ] Empty states show for all empty views
- [ ] No performance regressions (React DevTools profiler clean)
