# PM UX Improvements

## Why
Playwright QA + visual inspection surfaced several friction points in the PM feature. None are blockers but they collectively make the tool feel unpolished. Addressing them now while the feature is still pre-launch.

## What
Five UX improvements across the kanban board, task detail panel, and ME tab. All are additive — no existing behavior is removed.

## Context

**Relevant files:**
- `frontend/src/components/pm/TaskCard.tsx` — renders kanban cards; titles truncate with CSS but no tooltip
- `frontend/src/components/pm/TaskDetailPanel.tsx` — task side panel; has no "created by / created at" metadata row
- `frontend/src/components/pm/MeKanbanBoard.tsx` — column highlight on drag-over uses background color change only; no border/ring
- `frontend/src/components/pm/MeTabView.tsx` — "This Week" stat card
- `frontend/src/components/pm/MeTaskCard.tsx` — ME kanban card; no assignee shown
- `src/controllers/pm/PmStatsController.ts` — `getMyStats` defines "Focus Today" and "This Week" logic

**Patterns to follow:**
- Tooltip pattern: use `title` attribute or a simple `group/tooltip` Tailwind pattern (check existing usage in the codebase)
- Stat card data shape: `PmMyStats` interface in `frontend/src/types/pm.ts`

**Key decisions already made:**
- Date input stays as `<input type="date">` for now — custom picker is a larger investment deferred to a future sprint

## Constraints

**Must not:**
- Change API contracts
- Add new npm dependencies
- Modify non-PM files

**Out of scope:**
- Custom date picker (deferred)
- Keyboard shortcut to create task (deferred)
- Confirmation dialog before leaving with unsaved description (deferred — rich text editor makes this complex)

## Risk

**Level:** 1

**Risks identified:**
- "This Week" stat logic change could surprise users if currently shown count changes → **Mitigation:** Verify logic matches expectation before changing; document the definition in a comment

## Tasks

### T1: Truncated task card titles — show full title on hover
**Do:** In `TaskCard.tsx`, add a `title={task.title}` attribute to the task title element so browsers show the native tooltip on hover. Also do the same in `MeTaskCard.tsx` for the ME kanban cards.
**Files:** `frontend/src/components/pm/TaskCard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Verify:** Hover over a card with a long truncated title → full title appears as a tooltip.

### T2: Show "Created by · date" metadata in task detail panel
**Do:** In `TaskDetailPanel.tsx`, below the Delete button section, add a subtle metadata row showing `Created by {task.creator_name ?? "—"} · {timeAgo}`. Style it small and muted (text-[11px], `--color-pm-text-muted`). Use `formatDistanceToNow` from `date-fns` (already a project dependency) for the relative time. Add `created_at` to the `PmTask` type if missing.
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`, `frontend/src/types/pm.ts`
**Verify:** Open any task → bottom of panel shows "Created by dave · 2 days ago".

### T3: Stronger drop zone visual on ME kanban drag
**Do:** In `MeKanbanBoard.tsx`, when `isDraggingOver` is true for a column, add a colored border ring in addition to the background change. Use `border: 2px solid var(--color-pm-accent)` (or the orange brand color `#D66853` at 40% opacity) on the droppable column container. Also apply a `scale(1.01)` transform on the column wrapper via a `transition: transform 150ms` so it subtly breathes when targeted.
**Files:** `frontend/src/components/pm/MeKanbanBoard.tsx`
**Verify:** Drag a card over each column — targeted column has a visible border ring + slight scale.

### T4: Fix "This Week" stat — verify and correct counting logic
**Do:** In `PmStatsController.ts`, audit `getMyStats`'s "This Week" query. It should count tasks assigned to the user with deadline within the current calendar week (Mon–Sun PST) that are NOT yet in a "Done" column. Compare with "Focus Today" logic (which counts P1/P2 priority). If the count is wrong (e.g., counting completed tasks or using wrong date bounds), fix the WHERE clause. Add a comment explaining what the stat means.
**Files:** `src/controllers/pm/PmStatsController.ts`
**Verify:** ME tab "This Week" card shows a non-zero count when there are tasks with deadlines this week.

### T5: Show assignee on ME task card
**Do:** In `MeTaskCard.tsx`, add a second info row (below project name) showing the assignee when `task.assignee_name` is set and is different from the current user. Format: `→ {assignee_name}` in muted text, same style as the assignee display in `TaskCard.tsx`. Since these are the current user's tasks, only show the assignee row if it's someone else (creator ≠ assignee, and assignee ≠ current user's display name). For now, just check `task.assignee_name` is not null.
**Files:** `frontend/src/components/pm/MeTaskCard.tsx`, `frontend/src/types/pm.ts` (add `assignee_name` to `PmMyTask` if missing)
**Verify:** ME kanban shows "→ jordan" on a task assigned from one user to another.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Hover a truncated card title → native tooltip shows full title (both kanban and ME kanban)
- [ ] Open task panel → "Created by dave · X ago" visible at bottom
- [ ] Drag to ME kanban column → orange border ring appears on target
- [ ] ME "This Week" count is accurate (manual check against known tasks)
- [ ] ME task card shows assignee name when set
