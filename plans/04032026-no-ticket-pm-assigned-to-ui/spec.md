# PM: Assigned To UI

## Why
`assigned_to` exists in the DB and the assign endpoint exists on the backend, but there is no UI to set or display it. Users can only see `created_by` ("by dave") on task cards.

## What
A user dropdown in the task detail panel to assign a task, and an assignee name shown on the task card. Tasks with an assignee show both creator ("by dave") and assignee ("→ kuda") or just the assignee when it differs from the creator.

## Context

**Relevant files:**
- `src/controllers/pm/PmProjectsController.ts:153` — `getProject` already joins `users` for `creator_email`. Needs a second aliased join for `assigned_to`.
- `frontend/src/components/pm/TaskDetailPanel.tsx` — already has Priority, Deadline, Completed sections. Assignee section goes here.
- `frontend/src/components/pm/TaskCard.tsx:132` — already renders `creator_name`. Assignee rendered alongside.
- `frontend/src/types/pm.ts:35` — `PmTask` type. Add `assignee_name?: string | null`.
- `frontend/src/api/pm.ts:161` — `fetchPmUsers()` already exists.
- `frontend/src/stores/pmStore.ts:158` — `assignTask()` already exists.

**Patterns to follow:**
- `creator_name` enrichment in `PmProjectsController.getProject` — alias join, same pattern for `assignee_name`
- `TaskDetailPanel` sections use a label + control pattern (see Priority, Deadline)
- `TaskCard` row 2 shows deadline left + "by {creator}" right — assignee fits here

**Key decisions:**
- No new routes, no new API functions — all plumbing already exists
- `listUsers` endpoint reads from `SUPER_ADMIN_EMAILS` env var (no DB query) — fine for small admin teams
- Users loaded once per `TaskDetailPanel` open via `useEffect` + local state

## Constraints

**Must:**
- Use existing `PUT /api/pm/tasks/:id/assign` endpoint
- Use existing `fetchPmUsers()` + `assignTask()` from store
- Show assignee on `TaskCard` only when set
- Show "Unassign" / clear option in the dropdown

**Must not:**
- Add new routes or API functions
- Modify `pmStore` (all plumbing is there)
- Touch any other component

**Out of scope:**
- Assignee filtering on the board
- Email notifications on assignment
- Assignee avatar images

## Risk
**Level:** 1

**Risks identified:**
- Aliased join for `assigned_to` in `getProject` may conflict if user doesn't exist — handled with `LEFT JOIN` (returns null gracefully).

## Tasks

### T1: Enrich tasks with `assignee_name` in backend getProject
**Do:** In `PmProjectsController.getProject` (line 153), add `users AS assignees` as a second aliased LEFT JOIN on `pm_tasks.assigned_to = assignees.id`, select `assignees.email as assignee_email`, derive `assignee_name` in the `enrichedTasks.map()` same way as `creator_name`.
**Files:** `src/controllers/pm/PmProjectsController.ts`
**Verify:** `GET /api/pm/projects/:id` response includes `assignee_name` on tasks that have `assigned_to` set.

### T2: Add `assignee_name` to frontend PmTask type
**Do:** Add `assignee_name?: string | null` to `PmTask` interface.
**Files:** `frontend/src/types/pm.ts`
**Verify:** TypeScript compiles clean.

### T3: Add Assigned To section in TaskDetailPanel
**Do:** Add a section between Description and Priority that:
- Loads users once on mount via `fetchPmUsers()` into local state
- Renders a styled `<select>` with an "Unassigned" option + one option per user
- On change calls `usePmStore(s => s.assignTask)(task.id, userId | null)`
- Shows current assignee pre-selected based on `task.assigned_to`
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Selecting a user calls `/api/pm/tasks/:id/assign`, the card updates.

### T4: Show assignee on TaskCard
**Do:** In Row 2 of TaskCard, show assignee name (from `task.assignee_name`) after the creator line when set. Format: `→ {assignee_name}` in muted text. If assignee === creator, don't show separately — just show one name.
**Files:** `frontend/src/components/pm/TaskCard.tsx`
**Verify:** Cards with assignee show the name; cards without show nothing extra.

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Task with `assigned_to` set shows `assignee_name` in API response
- [ ] Assigned To dropdown visible in task detail panel
- [ ] Selecting user calls assign API, card updates without page refresh
- [ ] Unassigning works (clears name from card)
- [ ] TaskCard shows assignee name when set
