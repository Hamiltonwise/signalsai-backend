# PM QA Bug Fixes

## Why
Playwright QA session surfaced 5 confirmed bugs across the kanban board and ME tab. All are regressions from the recent feature sprint. Fixing them before the feature is used in production.

## What
Five targeted backend/frontend fixes. All traced to root cause. No new features, no refactoring.

## Context

**Relevant files:**
- `src/controllers/pm/PmTasksController.ts` — `createTask` and `assignTask` both return raw DB records without enriched name fields
- `src/controllers/pm/PmProjectsController.ts` — `getProjectDetail` is the reference pattern for enriching tasks with `creator_name`/`assignee_name` via LEFT JOIN
- `frontend/src/components/pm/TaskDetailPanel.tsx:43` — `setDeadline(task.deadline.slice(0, 10))` slices a UTC ISO string, returning the wrong day for PST users
- `frontend/src/utils/pmDateFormat.ts:14` — `endOfDayPST("2026-04-05")` stores `2026-04-06T06:59:00Z` (UTC), so slicing `[:10]` off the stored value gives the next day
- `frontend/src/components/pm/MeKanbanBoard.tsx` — `DraggableCard` puts `{...listeners}` on the outer div; `onClick` is on the inner `MeTaskCard`; @dnd-kit PointerSensor can suppress clicks after pointer interaction
- `frontend/src/components/pm/MeTaskCard.tsx` — no `user-select: none` on draggable content; text highlights during drag

**Patterns to follow:**
- `PmProjectsController.ts` LEFT JOIN enrichment pattern for `creator_name`/`assignee_name`
- `endOfDayPST` and `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` for PST date handling

**Key decisions already made:**
- `assignTask` and `createTask` return the task from `PmTaskModel.findById` — we add a JOIN on top of that

## Constraints

**Must:**
- Fix only the described bugs
- Backend enrichment must match the pattern used in `getProjectDetail`

**Must not:**
- Refactor `PmTaskModel`
- Change the API shape (same fields, just add `creator_name` / `assignee_name`)
- Modify unrelated files

**Out of scope:**
- "someone" in Recent Activity (data integrity issue — activity log `user_id` values may not match users table; needs investigation separately)
- Panel X button Playwright failure (likely automation artifact; real-browser usage works fine)

## Risk

**Level:** 1

**Risks identified:**
- Adding LEFT JOIN to `createTask` response adds a tiny DB round-trip → **Mitigation:** It's a single-row lookup, negligible

## Tasks

### T1: Enrich createTask and assignTask responses with creator_name / assignee_name
**Do:** In `PmTasksController.ts`, after both `createTask` and `assignTask` fetch the task to return, add a db JOIN on `users as creators` and `users as assignees` to resolve `creator_name` and `assignee_name`. Return the enriched object.
**Files:** `src/controllers/pm/PmTasksController.ts`
**Verify:** Create a task → card shows "by dave" not "by 58". Assign a user → card immediately shows "→ dave".

### T2: Fix deadline display off-by-one (UTC → PST on read)
**Do:** In `TaskDetailPanel.tsx`, change line 43 from `task.deadline.slice(0, 10)` to `new Date(task.deadline).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` so the displayed date is always the PST date, not the UTC date.
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Set deadline to 04/05/2026 → panel reopens showing 04/05/2026, not 04/06/2026.

### T3: Fix ME kanban card clicks blocked by DnD listeners
**Do:** In `MeKanbanBoard.tsx`, move the click handler out of `MeTaskCard` and onto the `DraggableCard` outer div directly. Add a `didDrag` ref (set true on `onPointerMove` > 5px delta, reset on `pointerup`) and suppress the onClick when `didDrag.current` is true.
**Files:** `frontend/src/components/pm/MeKanbanBoard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Verify:** Click a ME kanban card without dragging → detail panel opens. Drag a card → no panel opens.

### T4: Fix text selection during drag
**Do:** Add `userSelect: "none"` to the `DraggableCard` outer div style (alongside the existing `transform` and `opacity` styles). Also add it to `MeTaskCard`'s root motion.div style.
**Files:** `frontend/src/components/pm/MeKanbanBoard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Verify:** Drag a card — no text gets selected anywhere on the board.

### T5: Fix ME kanban drag reliability (DONE column)
**Do:** Replace `pointerWithin` collision detection in `MeKanbanBoard` with a custom strategy: use `rectIntersection` filtered to the three column droppables only (exclude any card-level droppables). This handles the case where the pointer lands near the edge of a column or the column is partially off-screen.
**Files:** `frontend/src/components/pm/MeKanbanBoard.tsx`
**Verify:** Drag a card to the DONE column (far right) → card moves reliably.

## Done
- [ ] `npx tsc --noEmit` passes (both frontend and backend)
- [ ] Create task → shows "by dave" immediately
- [ ] Assign task → card immediately shows "→ dave"
- [ ] Deadline round-trip: set 04/05 → close → reopen → shows 04/05
- [ ] Click ME kanban card → panel opens
- [ ] Drag ME kanban card → no text selection
- [ ] Drag to DONE column works
