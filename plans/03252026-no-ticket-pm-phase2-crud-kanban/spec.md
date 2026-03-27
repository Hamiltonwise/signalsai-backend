# PM Phase 2: Core CRUD & Kanban Board

## Why
Phase 1 laid the database and skeleton. This phase builds the actual project and task CRUD, the Zustand store, and the full kanban board with drag-and-drop. This is the core interactive experience.

## What
- Full project CRUD API (list, create, get, update, delete, archive)
- Full task CRUD API (create, update, move, assign, delete)
- Activity logging middleware that auto-logs all mutations
- Zustand store for PM client state
- Kanban board with 4 columns and @dnd-kit drag-and-drop
- Task cards with priority, deadline, avatar
- Task detail slide-over panel
- Project creation modal with icon + color picker
- Quick-add task input per column
- Optimistic UI for drag-drop

**Depends on:** Phase 1 complete (tables, models, route skeleton, frontend shell, dependencies installed)

## Context

**Relevant files:**
- `src/models/PmProjectModel.ts`, `PmTaskModel.ts`, `PmColumnModel.ts`, `PmActivityLogModel.ts` — from Phase 1
- `src/routes/pm/projects.ts`, `tasks.ts` — route skeletons from Phase 1
- `src/controllers/pm/PmController.ts` — placeholder from Phase 1 (to be replaced with real logic)
- `frontend/src/pages/admin/ProjectsDashboard.tsx`, `ProjectBoard.tsx` — shells from Phase 1
- `frontend/src/api/index.ts` — `apiGet`, `apiPost`, `apiPut`, `apiDelete` wrappers
- `frontend/src/lib/queryClient.ts` — `QUERY_KEYS` factory pattern
- `src/controllers/admin-schedules/AdminSchedulesController.ts` — reference controller pattern

**Patterns to follow:**
- Controller: static methods on a class, `try/catch` with `handleError` utility
- API layer: one file per domain in `frontend/src/api/`, exports typed functions
- Zustand: single store file, flat state with actions
- Components: feature folder `frontend/src/components/pm/`

## Constraints

**Must:**
- Use `BaseModel` methods for all DB operations (no raw queries unless needed for complex joins)
- Optimistic UI: drag-drop updates local state immediately, API call in background
- Activity log: every mutation (create, update, move, assign, delete) logs to `pm_activity_log`
- Auto-seed 4 columns on project creation (Backlog pos 0, To Do pos 1, In Progress pos 2, Done pos 3)
- Moving task to Done → set `completed_at = now()`. Moving out of Done → clear `completed_at`.
- Position management: new tasks insert at position 0 (top), shift others down

**Must not:**
- Use React Context for PM state — use Zustand
- Skip activity logging on any mutation
- Add AI features (Phase 4)
- Build dashboard stats or activity feed UI (Phase 3)

**Out of scope:**
- Dashboard view (Phase 3)
- AI Synth (Phase 4)
- Command palette, Focus Mode (Phase 6)

## Risk

**Level:** 2

**Risks identified:**
- Drag-drop position conflicts under concurrent edits → **Mitigation:** optimistic UI + server reconciliation on refetch. Positions are simple integers, recompute on conflict.
- Activity log volume on bulk operations → **Mitigation:** batch insert for multi-task creation (AI Synth later), single-row log per operation otherwise.

## Tasks

### T1: Build Project CRUD controller + wire routes
**Do:** Replace placeholder handlers in `PmController.ts` (or create `PmProjectsController.ts`) with real CRUD logic:
- `GET /api/pm/projects` — list all projects with task count summaries. Join with pm_tasks to get total_tasks, completed_tasks. Compute deadline inheritance (if no explicit deadline, use MAX task deadline). Filter by status (default: `active`). Support `?status=archived` query param.
- `POST /api/pm/projects` — create project, auto-seed 4 columns in a transaction. Log `project_created` to activity.
- `GET /api/pm/projects/:id` — get project with all columns and tasks. Tasks grouped by column_id, ordered by position.
- `PUT /api/pm/projects/:id` — update project fields (name, description, color, icon, deadline, status). Log `deadline_changed` if deadline changes.
- `DELETE /api/pm/projects/:id` — delete project (CASCADE handles children). Log `project_deleted` before delete.
- `PUT /api/pm/projects/:id/archive` — toggle status between `active` and `archived`.
**Files:** `src/controllers/pm/PmProjectsController.ts`, `src/routes/pm/projects.ts`
**Verify:** `curl` tests: create project → list shows it with 4 columns → update name → archive → list with status=archived shows it → delete

### T2: Build Task CRUD controller + wire routes
**Do:** Create `PmTasksController.ts`:
- `POST /api/pm/projects/:id/tasks` — create task in specified column (column_id in body). Default priority P3, source 'manual'. Insert at position 0, shift existing tasks down (+1). Log `task_created`.
- `PUT /api/pm/tasks/:id` — update task fields (title, description, priority, deadline, assigned_to). Log `task_updated` with old/new values in metadata JSONB.
- `PUT /api/pm/tasks/:id/move` — move task to target column_id + position. Recompute positions in source and target columns. If target column is Done, set `completed_at = now()`. If moving out of Done, clear `completed_at`. Log `task_moved` with from_column/to_column in metadata.
- `PUT /api/pm/tasks/:id/assign` — set assigned_to. Log `task_assigned`.
- `DELETE /api/pm/tasks/:id` — log `task_deleted` then hard delete. Recompute positions in the source column.
**Files:** `src/controllers/pm/PmTasksController.ts`, `src/routes/pm/tasks.ts`
**Verify:** `curl` tests: create task → move between columns → assign → update priority → delete

### T3: Build activity logging utility
**Do:** Create a utility function `logPmActivity(params)` that inserts into `pm_activity_log`. Params: `project_id`, `task_id` (optional), `user_id`, `action`, `metadata` (optional JSONB). Used by both controllers. Not middleware — called explicitly in controller handlers (gives more control over what metadata to log).
**Files:** `src/controllers/pm/pmActivityLogger.ts`
**Verify:** After T1/T2, activity log entries exist for all operations.

### T4: Build Zustand store for PM state
**Do:** Create `frontend/src/stores/pmStore.ts` using Zustand. State shape:
```typescript
interface PmState {
  projects: PmProject[]
  activeProject: PmProjectDetail | null
  isLoading: boolean
  // Actions
  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: CreateProjectInput) => Promise<PmProject>
  updateProject: (id: string, data: Partial<PmProject>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  archiveProject: (id: string) => Promise<void>
  createTask: (projectId: string, data: CreateTaskInput) => Promise<void>
  updateTask: (taskId: string, data: Partial<PmTask>) => Promise<void>
  moveTask: (taskId: string, columnId: string, position: number) => Promise<void>
  assignTask: (taskId: string, userId: string | null) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  // Optimistic helpers
  optimisticMoveTask: (taskId: string, fromColumnId: string, toColumnId: string, position: number) => void
}
```
Also create `frontend/src/api/pm.ts` with typed API functions calling `apiGet/apiPost/apiPut/apiDelete` for all PM endpoints.
**Files:** `frontend/src/stores/pmStore.ts`, `frontend/src/api/pm.ts`, `frontend/src/types/pm.ts` (TypeScript interfaces)
**Verify:** `npx tsc --noEmit` passes

### T5: Build KanbanBoard + KanbanColumn components
**Do:** Build the kanban board view for `ProjectBoard.tsx`:
- `KanbanBoard.tsx` — renders 4 columns horizontally. Uses `@dnd-kit/core` DndContext with sensors (PointerSensor, KeyboardSensor). Handles `onDragEnd` to call `moveTask` from store. Columns: Backlog (hideable via toggle), To Do, In Progress, Done.
- `KanbanColumn.tsx` — single column with droppable zone via `@dnd-kit/sortable`. Shows column name + task count badge. "+" button at top for quick-add. Renders TaskCard list.
- Header bar: back arrow to dashboard, project name (editable inline on click), deadline display, AI Synth button (disabled placeholder), Focus Mode toggle (disabled placeholder), more menu (archive, delete).
**Files:** `frontend/src/components/pm/KanbanBoard.tsx`, `frontend/src/components/pm/KanbanColumn.tsx`, `frontend/src/pages/admin/ProjectBoard.tsx` (wire up)
**Verify:** Manual: navigate to project → see 4 columns → drag card between columns → card persists in new column after refresh

### T6: Build TaskCard component
**Do:** Draggable task card using `@dnd-kit/sortable` `useSortable` hook. Displays:
- Priority dot top-left (P1 red `#E74C3C`, P2 amber `#F5A623`, P3 green `#4CAF50`)
- Task title (16px, semibold)
- Deadline in readable format with color coding (green = plenty of time, amber = this week, red = overdue)
- Assigned user avatar bottom-right (placeholder circle with initials if no avatar)
- Subtle drag handle icon on hover
- Click opens TaskDetailPanel
- Animations: shadow elevation + 1.02x scale on drag pickup, spring to final position on drop
**Files:** `frontend/src/components/pm/TaskCard.tsx`
**Verify:** Manual: cards render with correct priority dots, deadlines color-coded, drag feedback visible

### T7: Build TaskDetailPanel slide-over
**Do:** Right slide-over panel (Framer Motion slide from right + backdrop blur). Contains:
- Editable title (click to edit, Enter to save)
- Description textarea (markdown or plain text)
- Priority selector — 3 pills (P1/P2/P3) with color coding, click to select
- Deadline date picker
- Assignee dropdown (fetch admin users from `/api/pm/users` — reuse existing admin users list or create simple endpoint)
- Source badge ("Manual" or "AI Synth" with sparkle icon)
- Activity history for this task (fetch from `/api/pm/projects/:id/activity?task_id=X`)
- Delete button with confirmation modal
- Close on Escape key or backdrop click
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Manual: click task card → panel slides in → edit title → change priority → close panel → changes persisted

### T8: Build CreateProjectModal
**Do:** Modal overlay (Framer Motion scale + fade). Fields:
- Name (required text input)
- Description (optional textarea)
- Color picker: preset palette of 8-10 colors + custom hex input. Default `#D66853`.
- Icon picker: grid of ~20 Lucide icons (folder, briefcase, rocket, star, zap, heart, target, flag, code, globe, users, calendar, clipboard, layers, box, coffee, music, camera, book, lightbulb). Click to select. Default `folder`.
- Deadline (optional date picker)
- "Create Project" button → calls `createProject` from store → closes modal → navigates to new project board
**Files:** `frontend/src/components/pm/CreateProjectModal.tsx`
**Verify:** Manual: click FAB → modal opens → fill fields → create → redirected to kanban board with 4 empty columns

### T9: Build QuickAddTask inline input
**Do:** At top of each kanban column, a compact input row: text field + Enter to create. Creates task with title only, defaults (P3, no deadline, unassigned, source: manual). Inserts at position 0. Input clears after creation. Framer Motion: new card slides in from top with fade.
**Files:** `frontend/src/components/pm/QuickAddTask.tsx`
**Verify:** Manual: click "+" or focus input → type title → Enter → card appears at top of column

### T10: Wire optimistic UI for drag-drop
**Do:** In the Zustand store's `moveTask` action:
1. Call `optimisticMoveTask` to immediately update local state (move task between columns, update positions)
2. Fire API call `PUT /api/pm/tasks/:id/move` in background
3. On API error: revert to previous state (store snapshot before optimistic update)
4. On success: no-op (state already correct)
Also handle within-column reorder (same column, different position).
**Files:** `frontend/src/stores/pmStore.ts` (update moveTask logic)
**Verify:** Manual: drag card → card moves instantly → kill network → card reverts. With network → card persists after refresh.

### T11: Build `/api/pm/users` endpoint
**Do:** Simple endpoint that returns all admin users for the assignee dropdown. Query the existing admin users table (likely `users` or `organization_users`). Return `[{ id, display_name, email, avatar_url }]`.
**Files:** `src/routes/pm/users.ts`, update `src/routes/pm/index.ts`
**Verify:** `curl /api/pm/users` returns user list

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Project CRUD: create, list, get, update, archive, delete all work via API
- [ ] Task CRUD: create, update, move, assign, delete all work via API
- [ ] Activity log entries created for every mutation
- [ ] Kanban board renders with 4 columns and drag-drop
- [ ] Task cards show priority, deadline, assignee
- [ ] Task detail panel opens on click, all fields editable
- [ ] Project creation modal works end-to-end
- [ ] Quick-add creates tasks inline
- [ ] Drag-drop is optimistic (instant visual feedback)
