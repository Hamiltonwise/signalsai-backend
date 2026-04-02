# PM Board: Fix Drag/Drop and Backlog Priority Inconsistency

## Why
Drag-and-drop between columns is broken — cards snap back or resolve to the wrong column. Priority buttons are shown for Backlog tasks but the backend clears priority on move, creating a confusing/inconsistent UX.

## What
- Cards can be dragged between columns reliably
- Backlog task detail panel hides priority controls (or shows read-only state)
- No visual or data inconsistencies around Backlog priority

## Context

**Relevant files:**
- `frontend/src/components/pm/TaskCard.tsx` — draggable card with `layout` prop conflict
- `frontend/src/components/pm/KanbanBoard.tsx` — drag handlers and collision detection
- `frontend/src/components/pm/KanbanColumn.tsx` — droppable column containers
- `frontend/src/components/pm/TaskDetailPanel.tsx` — priority buttons shown unconditionally
- `frontend/src/stores/pmStore.ts` — `moveTask` / `optimisticMoveTask`

**Patterns to follow:**
- dnd-kit multi-container sortable pattern (onDragOver for cross-container transfer)
- Existing PM component conventions (CSS vars, Framer Motion for non-drag animations)

**Key decisions already made:**
- Using `@dnd-kit/core` + `@dnd-kit/sortable` for drag
- Framer Motion for animations
- Priority is null for Backlog tasks (enforced server-side on move)

## Constraints

**Must:**
- Keep existing same-column reorder working
- Keep Framer Motion exit animations on card delete
- Keep PointerSensor distance constraint (click vs drag distinction)

**Must not:**
- Add new dependencies
- Change backend priority/move logic
- Modify unrelated PM components

**Out of scope:**
- Keyboard drag improvements
- Drag preview styling changes
- Backend priority validation

## Risk

**Level:** 2

**Risks identified:**
- Removing `layout` loses smooth reorder animation → **Mitigation:** cards still animate via `exit` prop; reorder is instant but functional
- `handleDragOver` implementation could cause position bugs → **Mitigation:** follow dnd-kit multi-container pattern; test all move scenarios

## Tasks

### T1: Fix drag/drop — remove `layout` conflict and implement `handleDragOver`
**Do:**
1. `TaskCard.tsx` — remove `layout` prop from the `motion.div`. Keep `initial={false}` and `exit` animation.
2. `KanbanBoard.tsx` — implement `handleDragOver` to handle cross-column item transfer during drag. When a dragged item enters a new column, call `optimisticMoveTask` to visually transfer the card. Update `handleDragEnd` to use the final `over` target correctly.
3. Consider switching collision detection from `closestCorners` to `closestCenter` for more predictable column detection.
**Files:** `frontend/src/components/pm/TaskCard.tsx`, `frontend/src/components/pm/KanbanBoard.tsx`
**Verify:** Manual — drag a card from Backlog to To Do, from To Do to In Progress, and reorder within a column. All moves should persist after page reload.

### T2: Hide priority controls for Backlog tasks in detail panel
**Do:**
1. `TaskDetailPanel.tsx` — accept `isBacklog` prop (or derive from task's column). When `isBacklog` is true, hide the priority button group and show an info message like "Move out of Backlog to set priority".
2. `ProjectBoard.tsx` (or wherever `TaskDetailPanel` is rendered) — pass column context so the panel knows if the task is in Backlog.
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`, `frontend/src/pages/admin/ProjectBoard.tsx`
**Verify:** Manual — open a Backlog task detail panel, confirm priority buttons are hidden. Open a non-Backlog task, confirm priority buttons appear.

## Done
- [ ] Drag cards between all four columns works reliably
- [ ] Same-column reorder still works
- [ ] Backlog task detail panel hides priority controls
- [ ] Non-Backlog task detail panel shows priority controls normally
- [ ] `npx tsc --noEmit` passes
- [ ] No regressions in card delete, exit animations
