# PM: OVERVIEW / ME Tab System + Notifications

## Why
Stats and the board are all global-facing right now. There's no personal view showing a user their own tasks across projects, no per-person velocity, and no way to know when something is assigned to you. The team needs a "me" layer on top of the global PM.

## What
- Projects page gets OVERVIEW and ME tabs
- OVERVIEW = current global dashboard (stats are already global — no change needed)
- ME tab = personal kanban (TODO / IN PROGRESS / DONE across all projects), personal stats (Focus Today mine, This Week mine, Velocity mine), notification card
- Assignment catch: moving a task from Backlog to any other column requires an assignee first
- Notification card shows: assigned to me, unassigned from me, "X completed the task you assigned"

## Context

**Relevant files:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — becomes the tab host
- `src/controllers/pm/PmController.ts:27` — `listUsers` uses fake sequential IDs, must fix to real DB IDs
- `src/controllers/pm/PmStatsController.ts` — add `getMyStats` + `getMyVelocity` variants
- `src/controllers/pm/PmTasksController.ts` — add `getMyTasks`; notification creation in `assignTask` + `moveTask`
- `src/routes/pm/` — new routes for `/stats/me`, `/tasks/mine`, `/notifications`
- `frontend/src/components/pm/TaskCard.tsx` — already shows `creator_name`; add `assignee_name`
- `frontend/src/components/pm/TaskDetailPanel.tsx` — add Assigned To section (from original spec)
- `frontend/src/types/pm.ts` — new types for notifications, my-tasks response
- `frontend/src/api/pm.ts` — new API functions

**Patterns to follow:**
- Stats variants follow exact same shape as `getStats`/`getVelocity`, just filtered by `assigned_to = req.user.userId`
- `getProject` enrichment pattern (join + derive `creator_name`) applies to `assignee_name`
- Notification creation goes inside transactions in `assignTask` and `moveTask`

**Key decisions:**
- ME kanban tasks include `project_column_ids` so frontend can move without extra fetches
- Notification polling: simple 30-second `setInterval` refetch (no websockets)
- Tab state stored in URL param: `/admin/pm?view=me` vs `/admin/pm` (default = overview)

## Constraints

**Must:**
- `listUsers` must use real DB user IDs (critical — ME tab relies on `req.user.userId` matching stored `assigned_to`)
- ME kanban is cross-project — tasks come from all active projects where `assigned_to = me`
- ME kanban has only 3 columns: TO DO / IN PROGRESS / DONE (no Backlog)
- Assignment catch shows inline warning (toast + cancel drag) — does NOT hard-block via API
- Notifications are in-app only (no email)

**Must not:**
- Change OVERVIEW tab behavior — it's the current view, untouched
- Modify the Kanban DnD logic beyond adding the assignee check guard
- Add websockets — polling is fine
- Touch project board columns or tasks API shapes

**Out of scope:**
- Push notifications
- Email notifications
- Assignee filtering on the project board
- ME kanban reordering (positions within a column)

## Risk

**Level:** 3 — cross-cutting: new DB table, new backend endpoints, new cross-project aggregation, multi-component frontend

**Risks identified:**
- `listUsers` fake IDs breaking existing `assigned_to` data → **Mitigation:** Fix T0 before any other task. Existing records with fake IDs will be stale but harmless (no UI showed them before).
- ME kanban cross-project task fetch could be slow at scale → **Mitigation:** Add index on `pm_tasks(assigned_to)` in migration.
- DnD assignment catch — optimistic move already happened before we can check assignee → **Mitigation:** Check assignee BEFORE initiating drag (in `onDragEnd` handler) and rollback immediately with toast.

**Pushback:**
- Notification polling every 30s is inefficient long-term. Acceptable for now given team size (< 10 admins). Flag to revisit with SSE when team grows.

**Recommendation:** Split into 2 execution sessions:
- **Session A** (T0–T5): Fix users, tab system, ME kanban, personal stats, assignment catch
- **Session B** (T6–T8): Notifications DB, backend, frontend card

---

## Tasks

### T0: Fix listUsers to return real DB user IDs
**Do:** In `PmController.ts:listUsers`, replace the sequential `id: i+1` mapping with a DB query: `db('users').whereIn('email', emails).select('id', 'email')`. Return `display_name: email.split('@')[0]` as before. Handle users not found in DB gracefully (filter them out).
**Files:** `src/controllers/pm/PmController.ts`
**Verify:** `GET /api/pm/users` returns `id` values that match actual `users.id` in DB.

### T1: Enrich tasks with `assignee_name` in getProject (from original spec)
**Do:** In `PmProjectsController.getProject` (line 153), add `LEFT JOIN users AS assignees ON pm_tasks.assigned_to = assignees.id`, select `assignees.email as assignee_email`, derive `assignee_name: t.assignee_email?.split('@')[0] ?? null` in the `enrichedTasks.map()`.
**Files:** `src/controllers/pm/PmProjectsController.ts`, `frontend/src/types/pm.ts` (add `assignee_name?: string | null`)
**Verify:** Task with `assigned_to` set has `assignee_name` in API response.

### T2: Add Assigned To section in TaskDetailPanel (from original spec)
**Do:** Add an "Assigned To" section between Description and Priority. Load users once on mount via `fetchPmUsers()` into local state. Render a styled `<select>` with "Unassigned" + one option per user. On change call `usePmStore(s => s.assignTask)(task.id, userId | null)`. Pre-select current `task.assigned_to`.
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Selecting user calls assign API; clearing calls with null.

### T3: Show assignee on TaskCard
**Do:** In row 2 of TaskCard, after "by {creator}", add `→ {assignee_name}` when `task.assignee_name` is set AND differs from `task.creator_name`. Use same muted text style.
**Files:** `frontend/src/components/pm/TaskCard.tsx`
**Verify:** Cards with assignee show name; unassigned cards unchanged.

### T4: OVERVIEW / ME tab switcher in ProjectsDashboard
**Do:** Add tab bar at the top of `ProjectsDashboard.tsx` with "Overview" and "Me" buttons. Tab state via URL search param `?view=me`. When `view=me`, render `<MeTabView />` instead of current content. When `view=overview` (default), render current content unchanged.
**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`, new `frontend/src/components/pm/MeTabView.tsx` (scaffold only for now)
**Verify:** Clicking tabs switches URL param and renders different content.

### T5: Personal stats endpoints + ME kanban data endpoint
**Do:**
1. `GET /api/pm/stats/me` — same shape as `getStats` but filtered by `assigned_to = req.user.userId`. No backlog stat (ME has no backlog). Returns `{ focus_today, this_week }`.
2. `GET /api/pm/stats/velocity/me` — same as `getVelocity` but filtered by `assigned_to = req.user.userId`.
3. `GET /api/pm/tasks/mine` — returns tasks assigned to current user from all active projects, excluding Backlog column. Groups into `{ todo: [], in_progress: [], done: [] }`. Each task includes `project_name`, `assignee_name`, `creator_name`, and `project_column_ids: { todo_id, in_progress_id, done_id }` for that task's project (pre-joined).

Wire routes in `src/routes/pm/`.
**Files:** `src/controllers/pm/PmStatsController.ts` (add `getMyStats`, `getMyVelocity`), new `src/controllers/pm/PmMyTasksController.ts`, `src/routes/pm/stats.ts`, `src/routes/pm/index.ts`, `frontend/src/api/pm.ts`
**Verify:** All 3 endpoints return correct data filtered to current user.

### T6: MeTabView component (personal kanban + stats)
**Do:** Build `MeTabView.tsx`:
- Top: 2 stat cards (Focus Today mine, This Week mine) + Velocity chart (mine) using `/stats/me` and `/stats/velocity/me`
- Below: 3-column kanban (TO DO / IN PROGRESS / DONE) using `/tasks/mine`
- Each card shows task title, project name (smaller), deadline, assignee
- Moving a card calls existing `moveTask(taskId, targetColumnId, 0)` using `project_column_ids` from the task data
- Refreshes every 60s
**Files:** `frontend/src/components/pm/MeTabView.tsx`, `frontend/src/components/pm/MeKanbanBoard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Verify:** Tasks assigned to current user appear; moving them reflects on project board.

### T7: Assignment catch on Backlog → non-Backlog move
**Do:** In `ProjectBoard.tsx` `handleDragEnd`, before committing the optimistic move, check: if `sourceColumn.name === 'Backlog'` and `targetColumn.name !== 'Backlog'` and `task.assigned_to === null` → cancel the move, rollback, show toast `"Assign someone to this task before moving it out of Backlog"`.
**Files:** `frontend/src/pages/admin/ProjectBoard.tsx`
**Verify:** Dragging unassigned task out of Backlog shows toast and snaps back. Assigned task moves normally.

### T8: Notifications — DB migration
**Do:** Create migration with `pm_notifications` table:
- `id` UUID PK
- `user_id` INTEGER (recipient)
- `type` VARCHAR(50): `task_assigned | task_unassigned | assignee_completed_task`
- `task_id` UUID FK → pm_tasks CASCADE DELETE
- `actor_user_id` INTEGER (who triggered)
- `metadata` JSONB (task_title, project_name)
- `is_read` BOOLEAN DEFAULT false
- `created_at` TIMESTAMP DEFAULT now()
- Index: `(user_id, is_read, created_at DESC)`
**Files:** `src/database/migrations/20260403000001_create_pm_notifications.ts`
**Verify:** Migration runs clean.

### T9: Notifications — backend create + fetch
**Do:**
1. In `PmTasksController.assignTask`: after updating, if `assigned_to` changed to a non-null value → insert `task_assigned` notification for `assigned_to` user. If changed to null from non-null → insert `task_unassigned` for old assignee.
2. In `PmTasksController.moveTask`: if task moved to Done AND `task.assigned_to` is set AND `task.created_by !== task.assigned_to` → insert `assignee_completed_task` notification for `created_by`.
3. New `GET /api/pm/notifications` controller: returns last 50 notifications for `req.user.userId`, ordered by `created_at DESC`. Marks none as read automatically.
4. New `PUT /api/pm/notifications/read-all`: marks all as read for current user.

Wire routes.
**Files:** `src/controllers/pm/PmTasksController.ts`, new `src/controllers/pm/PmNotificationsController.ts`, new `src/models/PmNotificationModel.ts`, `src/routes/pm/index.ts`
**Verify:** Assigning a task creates a DB row in `pm_notifications`; `GET /notifications` returns it.

### T10: Notification card in ME tab
**Do:** Add `<NotificationCard />` component at the top-right of `MeTabView.tsx`. Shows last 10 notifications. Polls every 30s. Shows unread count badge. Each entry: icon (bell/check/x), message (e.g. "Dave assigned you 'Fix footer heading'"), relative time. "Mark all read" button calls `PUT /notifications/read-all`. Unread entries have subtle highlight.
**Files:** `frontend/src/components/pm/NotificationCard.tsx`, `frontend/src/api/pm.ts` (add `fetchNotifications`, `markNotificationsRead`), `frontend/src/types/pm.ts` (add `PmNotification` type)
**Verify:** Assigning task to a user shows notification in their ME tab within 30s.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] `GET /api/pm/users` returns real DB user IDs
- [ ] OVERVIEW tab unchanged from current
- [ ] ME tab accessible via `?view=me`
- [ ] ME kanban shows only tasks assigned to current user
- [ ] Moving task in ME updates project board
- [ ] Dragging unassigned task out of Backlog shows toast + snaps back
- [ ] Assigning task creates notification; unassigning creates notification
- [ ] Completing assigned task notifies creator
- [ ] Notification card visible in ME tab with polling
- [ ] No regressions on project board DnD
