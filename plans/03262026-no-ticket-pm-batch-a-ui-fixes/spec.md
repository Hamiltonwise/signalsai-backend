# PM Batch A: UI Fixes — Triangles, FAB Modal, Loading States, Project Cards

## Why
Multiple visual and UX issues in the current PM implementation: priority triangles don't render (Lucide `Triangle` is an outline, not a filled triangle), no FAB for full task creation, no loading indicators on task creation/deletion, and project cards visually blend with stat cards — no differentiation.

## What
1. Custom SVG priority triangles (filled, colored) replacing Lucide Triangle
2. FAB opens full task creation modal (not just project create)
3. Loading indicators: skeleton shimmer on task create, spinner on delete confirm
4. Project cards visual differentiation: left color accent bar, subtle gradient, glow on hover

## Context

**Relevant files:**
- `frontend/src/components/pm/TaskCard.tsx` — uses Lucide `Triangle` which renders as outline. Props: `task`, `onClick`, `onDelete`, `isBacklog`
- `frontend/src/components/pm/QuickAddTask.tsx` — uses same Lucide Triangle for priority cycle
- `frontend/src/components/pm/ProposedTaskList.tsx` — priority rendering in AI synth review
- `frontend/src/components/pm/TaskDetailPanel.tsx` — priority selector with dots, needs triangles
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — FAB currently opens `CreateProjectModal`, project cards at lines 110-185
- `frontend/src/pages/admin/ProjectBoard.tsx` — kanban page, no FAB for task creation
- `frontend/src/stores/pmStore.ts` — `createTask`, `deleteTask` actions need loading state hooks
- `frontend/src/types/pm.ts` — `CreateTaskInput` type

**Patterns to follow:**
- Inline styles with CSS custom properties (`var(--color-pm-*)`)
- Framer Motion for animations
- `apiPost`/`apiGet` with `{ path, passedData }` object syntax

## Constraints

**Must:**
- Use a custom inline SVG for the filled triangle — NOT Lucide `Triangle` (which is hollow)
- FAB task modal: project selector dropdown + column selector + priority + deadline + title + description
- Skeleton shimmer on task creation must match approximate card height
- Project card accent bar uses the project's own color

**Must not:**
- Change the priority system values (P1/P2/P3/null) — only change the visual rendering
- Remove the existing "New Project" creation capability from the dashboard
- Break drag-and-drop on task cards

**Out of scope:**
- Markdown editor (Batch B)
- AI Synth batch system (Batch C)

## Risk

**Level:** 1 — visual changes only, no data model changes.

## Tasks

### T1: Create reusable PriorityTriangle component
**Do:** Create `frontend/src/components/pm/PriorityTriangle.tsx`. A small inline SVG component that renders a filled equilateral triangle. Props: `priority: "P1" | "P2" | "P3" | null`, `size?: number` (default 12). Colors: P1=#C43333, P2=#D4920A, P3=#3D8B40. Returns null if priority is null.
```tsx
// The SVG path for a filled equilateral triangle pointing up:
<svg width={size} height={size} viewBox="0 0 12 12">
  <path d="M6 1L11 10H1L6 1Z" fill={color} />
</svg>
```
**Files:** `frontend/src/components/pm/PriorityTriangle.tsx`
**Verify:** Import and render — see filled colored triangles

### T2: Replace all Lucide Triangle usage with PriorityTriangle
**Do:** Update `TaskCard.tsx`, `QuickAddTask.tsx`, `ProposedTaskList.tsx`, `TaskDetailPanel.tsx` to use the new `PriorityTriangle` component. Remove `import { Triangle } from "lucide-react"` from these files. In TaskDetailPanel, replace the dot-based priority selector with triangle-based pills.
**Files:** `TaskCard.tsx`, `QuickAddTask.tsx`, `ProposedTaskList.tsx`, `TaskDetailPanel.tsx`
**Verify:** All priority indicators show filled colored triangles. Backlog tasks show no triangle.

### T3: Build CreateTaskModal component
**Do:** Create `frontend/src/components/pm/CreateTaskModal.tsx`. A centered modal with:
- Title (required, auto-focused)
- Description (textarea, 3 rows)
- Project dropdown (fetches from `usePmStore.projects`, shows project name + color dot)
- Column dropdown (populated from selected project's columns, default "To Do")
- Priority selector (triangle pills, disabled if column is Backlog)
- Deadline (date input, optional)
- "Create Task" button (orange, with spinner when submitting, text changes to "Creating...")
- "Cancel" ghost button

On submit: calls `createTask(projectId, data)` from store. On success: close modal, refetch active project if on kanban view. On error: show inline error message.

The modal uses the same warm dark theme styling as `CreateProjectModal`.
**Files:** `frontend/src/components/pm/CreateTaskModal.tsx`
**Verify:** Modal opens, all fields work, task created successfully

### T4: Wire FAB to open CreateTaskModal
**Do:**
- On **Dashboard** (`ProjectsDashboard.tsx`): FAB opens `CreateTaskModal` (not `CreateProjectModal`). Add a secondary action: long-press or small dropdown from FAB with "New Task" (primary) and "New Project" (secondary). OR simpler: change FAB to open task modal, add a "New Project" text button in the dashboard header area.
- On **Kanban Board** (`ProjectBoard.tsx`): Add FAB that opens `CreateTaskModal` pre-populated with the current project.
**Files:** `ProjectsDashboard.tsx`, `ProjectBoard.tsx`
**Verify:** FAB opens task creation modal on both pages. Project creation still accessible.

### T5: Loading indicators on task creation
**Do:** In `QuickAddTask.tsx`: after submit, show a skeleton shimmer card at position 0 in the column while the API call is in flight. Use a local `isCreating` state. The skeleton is a `motion.div` with animated gradient background (shimmer effect). When API returns, the skeleton is replaced by the real card.

Shimmer animation:
```tsx
<motion.div
  className="rounded-lg"
  style={{
    height: 72,
    background: `linear-gradient(90deg, var(--color-pm-bg-secondary) 25%, var(--color-pm-bg-hover) 50%, var(--color-pm-bg-secondary) 75%)`,
    backgroundSize: "200% 100%",
  }}
  animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
/>
```
**Files:** `QuickAddTask.tsx`, possibly `KanbanColumn.tsx`
**Verify:** Creating a task shows shimmer placeholder briefly before real card appears

### T6: Loading indicator on delete confirmation
**Do:** In `TaskCard.tsx`: when "Yes" is clicked on the delete tooltip, show a small spinner inside the "Yes" button (replace text with a 12px spinner). Disable both "Yes" and "No" during the API call. The card exit animation (shrink + fade) only triggers after API success. On API error, show the tooltip text as "Failed" in red for 2 seconds, then revert.
**Files:** `TaskCard.tsx`
**Verify:** Delete shows spinner, card fades on success, error shows failure message

### T7: Project card visual differentiation
**Do:** Update project cards in `ProjectsDashboard.tsx`:
- Add a 3px left accent bar using the project's color (same pattern as DailyBriefCard)
- Add a subtle gradient overlay from the project's color at 4% opacity to transparent
- On hover: add a glow shadow using the project's color at 15% opacity
- Increase card border-radius to 14px
- Add a subtle 1px border using project color at 8% opacity

This creates visual distinction from stat cards (which are flat/neutral) and ties each project card to its brand color.
**Files:** `ProjectsDashboard.tsx`
**Verify:** Each project card has a unique left accent bar matching its color, subtle glow on hover

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Priority triangles render as filled colored SVGs everywhere (task cards, quick-add, detail panel, proposed tasks)
- [ ] FAB opens full task creation modal with project/column/priority/deadline fields
- [ ] Task creation shows skeleton shimmer loading state
- [ ] Task deletion shows spinner in confirmation, proper error handling
- [ ] Project cards have left color accent bar + hover glow
- [ ] Backlog tasks show no priority triangle
