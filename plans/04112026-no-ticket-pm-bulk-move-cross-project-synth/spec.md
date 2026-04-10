# PM Tool: Backlog Move, Multi-Select, Cross-Project AI Synth

## Why
The PM tool (`/admin/pm`) is rigid once tasks exist: a misfiled backlog item can't be moved between projects, bulk housekeeping means clicking one task at a time, and AI Synth can only extract tasks for the project you're already inside. These gaps create real friction for reorganizing work and for triaging messy input sources (emails, meeting notes) that produce tasks across multiple projects.

## What
Three composed features landed together because they share the same backbone (a hardened `is_backlog` column flag and a new set of bulk/cross-project task operations):

1. **Move backlog tasks to another project** — single and bulk, via context menu and floating action bar. Hard-gated: only tasks currently in a Backlog column are movable; To Do / In Progress / Done are non-movable.
2. **Multi-select with floating action bar** — checkbox-on-hover selection on `ProjectBoard` and `MeTabView`, reusing the existing `BulkActionBar` from `components/ui/DesignSystem.tsx`. Full bulk action set: delete, move to project, move to column, set priority, assign.
3. **Cross-project AI Synth** — a new top-level synth entry on `ProjectsDashboard` that extracts tasks without requiring an up-front project. Each proposed task is assigned a target project before approval. The LLM receives the active project list and suggests target projects; the user can override per task or set all at once.

Done when: (a) all three features work end-to-end in the UI, (b) the `is_backlog` flag replaces all name-based backlog detection server-side, (c) `pm_ai_synth_batches.project_id` is nullable and the cross-project flow produces tasks in the correct destination projects, (d) build passes, (e) manual smoke of each flow succeeds.

## Context

**Relevant files — backend:**
- `src/database/migrations/20260325000001_create_pm_tables.ts` — creates `pm_columns` (no `is_backlog`), `pm_tasks`, `pm_activity_log`
- `src/database/migrations/20260326000002_create_pm_ai_synth_batches.ts` — creates `pm_ai_synth_batches` with NOT NULL `project_id`, `pm_ai_synth_batch_tasks` with no `target_project_id`
- `src/controllers/pm/PmProjectsController.ts:14-19` — `DEFAULT_COLUMNS` seed list; Backlog is position 0
- `src/controllers/pm/PmProjectsController.ts:100-137` — project create tx that seeds columns
- `src/controllers/pm/PmTasksController.ts:76,223,225` — three name-based `column.name === "Backlog"` checks that must become `column.is_backlog === true`
- `src/controllers/pm/PmTasksController.ts:170-289` — `moveTask` reference for shifting positions inside a column; new `moveTaskToProject` will reuse the position shift pattern on two columns across two projects
- `src/controllers/pm/PmStatsController.ts:36` — another `name === "Backlog"` check to update
- `src/controllers/pm/PmAiSynthController.ts:17-239` — full synth controller; `extractBatch` requires `project_id`, `approveTask:156` hardcodes Backlog lookup by name
- `src/routes/pm/tasks.ts` — route registration pattern (auth + superAdmin middleware)
- `src/routes/pm/aiSynth.ts` — route registration for synth endpoints
- `src/routes/pm/index.ts:14` — note `tasksRoutes` is mounted at `/` (so new task routes use absolute paths like `/tasks/bulk/delete`)
- `src/models/PmColumnModel.ts` — thin BaseModel wrapper, no schema coupling; no change required
- `src/agents/service.prompt-loader.ts` (consumed at `PmAiSynthController.ts:48`) — agent prompt is loaded by name `pmAgents/AISynth`; new cross-project variant prompt will be added

**Relevant files — frontend:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx:33-340` — overview + Me tab switcher; target for cross-project synth entry button
- `frontend/src/pages/admin/ProjectBoard.tsx:28-451` — single-project board; target for bulk bar + context menu wiring + move-to-project modal
- `frontend/src/components/pm/KanbanBoard.tsx:30-243` — dnd-kit integration; must pass selection state down and not interfere with drag
- `frontend/src/components/pm/KanbanColumn.tsx` — column container
- `frontend/src/components/pm/TaskCard.tsx:1-145` — card; gets a hover-checkbox, `onContextMenu` handler, selection outline
- `frontend/src/components/pm/MeKanbanBoard.tsx`, `MeTaskCard.tsx`, `MeTabView.tsx` — Me tab kanban; also gets multi-select
- `frontend/src/components/pm/AISynthModal.tsx:26-325` — project-scoped synth modal; needs per-task project picker in detail view for cross-project batches
- `frontend/src/components/pm/ProposedTaskList.tsx` — **dead/unused** per inspection (AISynthModal uses its own inline `BatchTaskCard` at line 277). Do not modify; do not reference.
- `frontend/src/components/ui/DesignSystem.tsx:618-735` — `BulkActionBar` reference component, reuse as-is
- `frontend/src/components/Admin/ActionItemsHub.tsx:400-807` — reference for multi-select state pattern (`selectedTaskIds: Set<number>`, toggleSelectAll, onClear)
- `frontend/src/stores/pmStore.ts:1-247` — Zustand store; add selection state + bulk action thunks
- `frontend/src/api/pm.ts:1-229` — API wrapper; add new endpoints
- `frontend/src/types/pm.ts:26-126` — add `is_backlog` to `PmColumn`, `target_project_id` to `PmAiSynthBatchTask`, relax `project_id` on `PmAiSynthBatch` to nullable
- `frontend/package.json` — currently only `@radix-ui/react-slot`; need to add `@radix-ui/react-context-menu`
- `frontend/src/components/ui/` — no existing `context-menu.tsx`; new file introduces the shadcn wrapper pattern

**Patterns to follow:**
- **Backend controllers:** `PmTasksController.moveTask` (src/controllers/pm/PmTasksController.ts:170) is the closest analog for any new task endpoint — transaction wrapper, position shifting, activity logging pattern, `handleError` helper.
- **Backend bulk:** `src/routes/tasks.ts:69-80` (`POST /api/tasks/bulk/delete`, `POST /api/tasks/bulk/status`) is the reference for bulk PM endpoints — POST body with `task_ids: string[]`, loop with transaction.
- **Frontend multi-select state:** `ActionItemsHub.tsx:404-611` — `Set<id>` in local or store state, `toggleSelect(id)`, `toggleSelectAll()`, `onClear`.
- **Frontend bulk bar usage:** `ActionItemsHub.tsx:798-807` — render `<BulkActionBar />` conditionally on `selectedIds.size > 0`, pass `actions` array with `{ label, icon, onClick, variant, disabled }`.
- **Frontend shadcn wrapper:** no existing radix wrapper in `components/ui/`, but `components/ui/DesignSystem.tsx` shows the project's export style (named exports, `React.FC`, className + variant props). New `context-menu.tsx` matches shadcn/ui's canonical wrapper around `@radix-ui/react-context-menu`.
- **Zustand thunks:** `pmStore.ts:101-182` — optimistic update, API call, revert on error.

**Reference files:**
- Closest analog for `moveTaskToProject` controller: `PmTasksController.moveTask` (src/controllers/pm/PmTasksController.ts:170-289)
- Closest analog for bulk task controller: `src/controllers/actionItems/` or `src/routes/tasks.ts:69-80` for the bulk endpoint shape
- Closest analog for `CrossProjectAISynthModal`: `frontend/src/components/pm/AISynthModal.tsx` (fork the grid/new/detail flow; add project picker in detail)
- Closest analog for `MoveToProjectModal`: `frontend/src/components/pm/CreateProjectModal.tsx` for modal chrome, small form modal pattern
- Closest analog for `ContextMenu` wrapper: shadcn/ui canonical `context-menu.tsx` (radix-ui primitive re-export)

## Constraints

**Must:**
- Replace every backend name-based `"Backlog"` check with `column.is_backlog === true`. No partial replacement; leaving one name check behind will silently break features if a future admin renames a column.
- All bulk endpoints accept `task_ids: string[]` as POST body, mirror the shape in `src/routes/tasks.ts:69-80`.
- Frontend selection state for ProjectBoard lives in `pmStore` (not local state) so the context menu and bulk bar can share it. Me-tab selection is a separate `Set` because tasks span projects.
- Multi-select must not break drag-drop. Selection checkbox clicks stop propagation; drag listeners on the card remain attached.
- Context menu opens on right-click; if the right-clicked task is part of the current selection, actions apply to the full selection, otherwise they apply to the single task only (the context menu does NOT modify the existing selection).
- Move-to-project action is disabled with a tooltip when any target task is outside Backlog. Tooltip text: "Only backlog items can be moved between projects."
- Cross-project synth batch has nullable `project_id`; per-task `target_project_id` must be set before that task can be approved. Reject is always allowed.
- LLM cross-project synth receives the active project list (id, name, description) in the system prompt so it can propose target projects. The new prompt is a separate file, not a modification of the existing `pmAgents/AISynth` prompt, so per-project synth behavior is untouched.
- All new actions log to `pm_activity_log`. Cross-project bulk actions log one row per affected task under that task's destination `project_id` (never skip logging because the UI origin was multi-project).
- TypeScript: zero new errors attributable to this execution. Run `npx tsc --noEmit` at root AND in `frontend/`.
- Migration scaffolds must be present for all three targets: `mssql.sql`, `pgsql.sql`, `knexmigration.js` under `plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/migrations/`.

**Must not:**
- Do not change the per-project AI Synth flow's UX or approval semantics. The existing flow (per-project button, hardcoded Backlog target on approve) stays intact for batches that have a `project_id`.
- Do not add new dependencies beyond `@radix-ui/react-context-menu` (and its transitive peers).
- Do not refactor `AISynthModal.tsx` into a shared component. Create a new `CrossProjectAISynthModal.tsx` to avoid risking regressions in the existing flow. Shared helpers can be extracted if genuinely duplicated, but default to duplication over premature abstraction.
- Do not modify `ProposedTaskList.tsx` — it is dead code (confirmed by grepping; `AISynthModal` uses its own inline `BatchTaskCard`). Touching it adds noise.
- Do not introduce cross-project drag-drop. Move-to-project is strictly menu/bulk-bar driven.
- Do not expand `pm_activity_log` schema. New actions are just new `action` string values; the column is free-form.
- Do not remove the server-side "must have assignee to move out of Backlog" rule (`KanbanBoard.tsx:191-202`); move-to-project doesn't change that rule for intra-project moves.

**Out of scope:**
- Undo for bulk delete (one-shot confirmation modal is sufficient for v1).
- Column renaming UI.
- Adding an `is_backlog` analog for any other column (Done, In Progress, etc.) — only Backlog gets the flag because only Backlog has special semantics (priority auto-clear, movable, synth default target).
- Permission/role changes. Inherit `authenticateToken + superAdminMiddleware` from existing PM routes.
- Server-side pagination for multi-select. v1 operates on whatever is loaded in the active project / Me tab.
- Keyboard shortcuts for selection (shift-click range, cmd-A select all beyond bar button).
- Project-level "move all backlog to X" one-shot — out of scope; achievable via select-all in the Backlog column + bulk move.

## Risk

**Level:** 4 (migration required + touches multiple controllers + cross-cutting frontend changes)

**Risks identified:**

1. **`is_backlog` backfill race with live writes.** If the migration runs against a production DB while a project is being created, the seed code may not yet be patched to set the flag, leaving a new project's Backlog column without `is_backlog = true`.
   - **Mitigation:** Migration runs in a single transaction. Deploy order: migration → backend code (with updated column seeding and updated checks) → frontend. The backfill step in the migration itself sets `is_backlog = true` for all existing rows where `name = 'Backlog'`. For the brief window before the new backend deploys, any newly-created project still gets `Backlog` by name; the controller patch handles both paths.

2. **Name-check leak.** Missing one `name === "Backlog"` site leaves a silent behavior regression (priority auto-clear stops working, or approve lands in the wrong column).
   - **Mitigation:** Mandatory grep sweep in T2 across `src/` for `'Backlog'` and `"Backlog"` as a verification step. Fail-closed if any non-migration, non-seed reference remains.

3. **Drag-drop regression from checkbox overlay.** `useSortable` attaches listeners to the card root; adding a checkbox child that intercepts pointer events could stall drags, especially on touch.
   - **Mitigation:** Checkbox uses `onClick` (not `onPointerDown`) + `stopPropagation`, and is positioned absolutely over the card corner, not inside the drag-handle surface. Visual QA on drag-drop required in the Done checklist.

4. **Cross-project synth LLM hallucinations.** The LLM may propose a `target_project_id` that doesn't exist (e.g., project archived mid-batch).
   - **Mitigation:** Server validates `target_project_id` against `pm_projects` (status = 'active') on the set-target endpoint and on approve. Invalid IDs reject with a clear error; UI shows a placeholder "Unassigned" until user picks manually.

5. **Nullable `project_id` on `pm_ai_synth_batches` breaks existing list/filter queries.** The current `listBatches` endpoint filters by `project_id`, which is fine for null-safe queries. The batch history grid on `ProjectsDashboard` will need a separate query for cross-project batches.
   - **Mitigation:** Keep the existing per-project `listBatches` endpoint untouched. Add a new `listCrossProjectBatches` endpoint that queries `WHERE project_id IS NULL`. `ProjectsDashboard` uses the new endpoint for the cross-project synth history; per-project boards continue to use the existing one.

6. **Activity log `project_id NOT NULL` blocks cross-project batch creation logging.** `pm_activity_log.project_id` is NOT NULL with CASCADE.
   - **Mitigation:** Skip batch-creation logging for cross-project batches. Log only on approve — at which point the task has a concrete destination project. Rejects produce no activity log entry (matches current behavior for per-project rejects).

7. **Bulk delete blast radius.** A user with a large selection hits Delete; the confirm modal must show the count and be unambiguous.
   - **Mitigation:** Confirm modal shows `"Delete N tasks? This cannot be undone."` with a prominent `N`. Count mismatches (selection changes mid-confirm) are impossible because the modal captures the ID list at open time.

8. **`PmColumnModel` has no `updated_at`.** Adding `is_backlog` is fine, but if any seed path re-uses existing `knex.insert()`, the new column must have a sensible default.
   - **Mitigation:** Migration adds `is_backlog BOOLEAN NOT NULL DEFAULT FALSE`. Seeding code explicitly sets `is_backlog: true` for the Backlog entry only.

**Blast radius:**
- `pm_columns` schema change affects: `PmProjectsController` (seed), `PmTasksController` (3 name checks), `PmAiSynthController` (1 name check), `PmStatsController` (1 name check), `PmColumnModel` (no code change, but type-wise), frontend `PmColumn` type.
- `pm_ai_synth_batches.project_id` nullability affects: `PmAiSynthController.extractBatch/listBatches/approveTask`, frontend `PmAiSynthBatch` type, `AISynthModal` (read-only, no change), `CrossProjectAISynthModal` (new consumer).
- Bulk endpoint addition affects: `src/routes/pm/tasks.ts`, `PmTasksController` (new handlers), frontend `pmStore`, frontend `api/pm.ts`, `ProjectBoard`, `MeTabView`.
- Context menu introduction affects: `frontend/package.json`, new `components/ui/context-menu.tsx`, `TaskCard`, `MeTaskCard`.

**Pushback (noted for the record):**
- The user accepted `-s` mode knowing this is Level 4. I recommended `-s` (not `-i`) precisely because of the migration + multi-controller blast radius. No architectural pushback beyond the mitigations above — the chosen designs (detached batch with nullable project_id, `is_backlog` flag, new cross-project synth modal as a fork rather than a refactor of the existing one) are the "future-us won't hate present-us" calls.

## Tasks

Tasks are decomposed to maximize parallelizability. The dependency chain is:

```
T1 ─┬→ T2 ─┬→ T3 ─→ T12 ─┬→ T13
    │      └→ T4 ┘        ├→ T14
    └→ T5 ─→ T6           └→ T15 ─→ T16
              ↓
    T7 ┬→ T8 ─→ T9 ─→ T10 ─→ T11
       └→ (T12–T16)
```

Parallel groups:
- **Group A (sequential):** T1 → T2 → (T3 ∥ T4) → T12
- **Group B (parallel to A after T2):** T5 → T6
- **Group C (sequential):** T7 → T8 → T9 → T10 → T11
- **Group D (after A, B, C):** T12 → (T13 ∥ T14 ∥ T15) → T16

### T1: Schema migration — `is_backlog` flag + nullable synth batch project
**Do:**
- Write new Knex migration `src/database/migrations/20260412000001_pm_backlog_flag_and_cross_project_synth.ts`:
  - `ALTER TABLE pm_columns ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE;`
  - `UPDATE pm_columns SET is_backlog = TRUE WHERE name = 'Backlog';`
  - `CREATE INDEX idx_pm_columns_is_backlog ON pm_columns(project_id) WHERE is_backlog = TRUE;` (partial index for fast lookup)
  - `ALTER TABLE pm_ai_synth_batches ALTER COLUMN project_id DROP NOT NULL;`
  - `ALTER TABLE pm_ai_synth_batch_tasks ADD COLUMN target_project_id UUID REFERENCES pm_projects(id) ON DELETE SET NULL;`
- Provide full `up` and `down` functions. `down` is best-effort (drop column, re-assert NOT NULL only if all rows have non-null — otherwise refuse with clear error).
- Scaffold `plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/migrations/{mssql.sql, pgsql.sql, knexmigration.js}` with the same DDL adapted to each target. The `knexmigration.js` file mirrors the committed migration exactly.

**Files:** `src/database/migrations/20260412000001_pm_backlog_flag_and_cross_project_synth.ts` (new), `plans/.../migrations/mssql.sql` (new), `plans/.../migrations/pgsql.sql` (new), `plans/.../migrations/knexmigration.js` (new)
**Depends on:** none
**Verify:** `npx knex migrate:latest` runs clean; spot-check SQL: `SELECT name, is_backlog FROM pm_columns WHERE project_id = ANY(...)` returns `is_backlog = true` only for Backlog rows; `\d pm_ai_synth_batches` shows `project_id` nullable.

### T2: Backend — replace name-based Backlog checks with `is_backlog`
**Do:**
- `src/controllers/pm/PmProjectsController.ts:14-19` — update `DEFAULT_COLUMNS` seed to `{ name: "Backlog", position: 0, is_backlog: true }` and add `is_backlog: false` to the other three entries. Pass through to `PmColumnModel.create()`.
- `src/controllers/pm/PmTasksController.ts:76` (createTask) — `const effectivePriority = column.is_backlog ? null : (priority || "P4");`
- `src/controllers/pm/PmTasksController.ts:223-227` (moveTask) — replace both name checks with `targetCol?.is_backlog` and `sourceCol?.is_backlog`.
- `src/controllers/pm/PmStatsController.ts:36` — replace `.where("pm_columns.name", "Backlog")` with `.where("pm_columns.is_backlog", true)`.
- `src/controllers/pm/PmAiSynthController.ts:156` (approveTask) — replace `.where({ project_id: batch.project_id, name: "Backlog" })` with `.where({ project_id: batch.project_id, is_backlog: true })`.
- Grep sweep: run `grep -rn '"Backlog"' src/` — only the `DEFAULT_COLUMNS` seed entry should remain as a name literal. Any other hit is a bug.
- Add `is_backlog: boolean` to any backend type definitions for `PmColumn` (if they exist; otherwise the model uses untyped rows and no change is needed).

**Files:** `src/controllers/pm/PmProjectsController.ts`, `src/controllers/pm/PmTasksController.ts`, `src/controllers/pm/PmStatsController.ts`, `src/controllers/pm/PmAiSynthController.ts`
**Depends on:** T1
**Verify:** `grep -rn '"Backlog"\|'\''Backlog'\''' src/ | grep -v DEFAULT_COLUMNS` returns zero lines. `npx tsc --noEmit` at repo root passes.

### T3: Backend — move-to-project endpoint (single + bulk)
**Do:**
- Add `moveTaskToProject` in `src/controllers/pm/PmTasksController.ts`:
  - Signature: `POST /api/pm/tasks/bulk/move-to-project` with body `{ task_ids: string[]; target_project_id: string }`.
  - For each `task_id`: load the task, load its current column; reject (400) the whole request if any task's column has `is_backlog !== true`.
  - Load target project; load target project's backlog column (`is_backlog = true`). Reject (400) if not found.
  - In a single transaction: for each task, decrement positions in source backlog (where position > task.position), then append to end of target backlog (position = current max + 1, then increment counter). Update `project_id`, `column_id`, `position`, clear `priority` (backlog semantics already enforce null — explicit set belt-and-braces).
  - Log one `pm_activity_log` entry per moved task under `project_id = target_project_id`, action `"task_moved_to_project"`, metadata `{ from_project_id, from_column_id, to_column_id, title }`.
  - Return `{ success: true, data: { moved_task_ids: string[] } }`.
- Register route in `src/routes/pm/tasks.ts` with `authenticateToken + superAdminMiddleware`.
- Single-task convenience: do NOT create a separate endpoint. The frontend's single-item context menu action calls the bulk endpoint with a one-element array.

**Files:** `src/controllers/pm/PmTasksController.ts`, `src/routes/pm/tasks.ts`
**Depends on:** T2
**Verify:** Unit-style manual curl against dev DB: `curl -X POST /api/pm/tasks/bulk/move-to-project -d '{"task_ids":["<id>"],"target_project_id":"<id>"}'` → 200, task appears in target Backlog. Try same with a To Do task → 400 with clear message. `npx tsc --noEmit` passes.

### T4: Backend — bulk delete endpoint
**Do:**
- Add `bulkDeleteTasks` in `src/controllers/pm/PmTasksController.ts`:
  - Signature: `POST /api/pm/tasks/bulk/delete` with body `{ task_ids: string[] }`.
  - In a transaction: for each task, log a `task_deleted` activity row before delete (matches the single-delete pattern at line 368), then delete, then recompute positions in the source column.
  - Return `{ success: true, data: { deleted_count: number } }`.
- Register route in `src/routes/pm/tasks.ts`.

**Files:** `src/controllers/pm/PmTasksController.ts`, `src/routes/pm/tasks.ts`
**Depends on:** T2
**Verify:** `curl -X POST /api/pm/tasks/bulk/delete -d '{"task_ids":["a","b"]}'` → 200, both tasks gone, activity log shows two `task_deleted` rows, remaining tasks in source columns have contiguous positions. `npx tsc --noEmit` passes.

### T5: Backend — cross-project AI Synth
**Do:**
- Modify `extractBatch` in `src/controllers/pm/PmAiSynthController.ts:17`:
  - Accept body `{ project_id?: string; text?: string; scope?: "project" | "cross_project" }`.
  - If `scope === "cross_project"`:
    - `project_id` must be absent/null.
    - Fetch active projects: `db("pm_projects").where({ status: "active" }).select("id", "name", "description")`.
    - Load prompt `pmAgents/AISynthCrossProject` (new prompt, see T6).
    - Inject project list into the system prompt as JSON.
    - Create batch with `project_id: null`.
    - On task insert, attempt to populate `target_project_id` from LLM output if provided and if it matches a real project id; otherwise leave null.
  - If `scope === "project"` or absent: existing behavior, unchanged.
- Add new controller `setBatchTaskTargetProject`:
  - `PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/target-project` with body `{ target_project_id: string }`.
  - Validate `batchId` matches batch task, batch task is `status === "pending"`, `target_project_id` is an active project.
  - Update the batch task row's `target_project_id`.
  - Return the updated batch task.
- Modify `approveTask` in `src/controllers/pm/PmAiSynthController.ts:146`:
  - Load the batch; if `batch.project_id` is null (cross-project), require `batchTask.target_project_id` to be set — reject 400 with "Assign a project to this task before approving" otherwise.
  - Resolve the destination project id: `batch.project_id ?? batchTask.target_project_id`.
  - Resolve the Backlog column via `is_backlog = true` lookup on that project (T2 already changed this line; update the lookup to use the resolved project id).
  - Rest of the flow is identical: create task in backlog, log activity under the resolved project id, update batch counters.
- Add new controller `listCrossProjectBatches`:
  - `GET /api/pm/ai-synth/batches/cross-project?limit=20&offset=0`.
  - Returns batches where `project_id IS NULL`, plus their task counts.
- Register the three new/modified endpoints in `src/routes/pm/aiSynth.ts`.
- Do not change `listBatches` or `getBatch` behavior for the per-project case.

**Files:** `src/controllers/pm/PmAiSynthController.ts`, `src/routes/pm/aiSynth.ts`
**Depends on:** T2 (for `is_backlog` lookup on approve), T6 runs in parallel
**Verify:** Manual: extract cross-project batch → batch row has `project_id = null` → approve a task without target → 400 → set target via new endpoint → approve → task appears in target project's backlog, activity log row exists under target project. `npx tsc --noEmit` passes.

### T6: Agent prompt — cross-project synth system prompt
**Do:**
- Create new prompt file under the agents prompt directory (inspect `src/agents/service.prompt-loader.ts` to confirm the exact directory convention; the existing prompt is loaded as `pmAgents/AISynth`, so the new one lives alongside as `pmAgents/AISynthCrossProject`).
- Prompt instructs the LLM to: extract actionable tasks from input text, and for each task, propose a `target_project_id` from a list of active projects provided in the system prompt as JSON `{projects: [{id, name, description}]}`. The model may leave `target_project_id: null` if no project clearly fits.
- Output format: array of `{ title, description, priority (P1–P3), deadline_hint, target_project_id | null }`.
- Reference the existing `pmAgents/AISynth` prompt for style, temperature expectations, and JSON contract.

**Files:** `src/agents/prompts/pmAgents/AISynthCrossProject.md` (or wherever existing prompts live — to be verified in Phase 1 of execution)
**Depends on:** none (parallel to T5)
**Verify:** Manual: trigger a cross-project extract against real data, check the parsed output matches the contract. LLM output may legitimately leave `target_project_id` null; UI must handle that (see T15).

### T7: Frontend types update
**Do:**
- `frontend/src/types/pm.ts`:
  - Add `is_backlog: boolean` to `PmColumn` (line 26).
  - Relax `PmAiSynthBatch.project_id` to `string | null` (line 104).
  - Add `target_project_id: string | null` to `PmAiSynthBatchTask` (line 116).
  - Add new type `PmTaskSelection` for the store: `{ ids: Set<string>; anchorId: string | null }`.

**Files:** `frontend/src/types/pm.ts`
**Depends on:** T1 (API contract side only; code changes in T2-T5 produce matching responses)
**Verify:** `cd frontend && npx tsc --noEmit` passes.

### T8: Frontend API wrapper additions
**Do:**
- `frontend/src/api/pm.ts`:
  - `bulkMoveTasksToProject(taskIds: string[], targetProjectId: string): Promise<{ moved_task_ids: string[] }>` → `POST /pm/tasks/bulk/move-to-project`
  - `bulkDeleteTasks(taskIds: string[]): Promise<{ deleted_count: number }>` → `POST /pm/tasks/bulk/delete`
  - `extractCrossProjectBatch(text?: string, file?: File): Promise<PmAiSynthBatch>` → `POST /pm/ai-synth/extract` with `scope: "cross_project"`; handles both text and File upload paths (mirrors existing `extractBatch`)
  - `setBatchTaskTargetProject(batchId: string, taskId: string, targetProjectId: string): Promise<PmAiSynthBatchTask>` → `PUT /pm/ai-synth/batches/:batchId/tasks/:taskId/target-project`
  - `fetchCrossProjectBatches(limit?: number, offset?: number): Promise<{ data: PmAiSynthBatch[]; total: number }>` → `GET /pm/ai-synth/batches/cross-project`

**Files:** `frontend/src/api/pm.ts`
**Depends on:** T7
**Verify:** `cd frontend && npx tsc --noEmit` passes.

### T9: Frontend — install radix context menu + shadcn wrapper
**Do:**
- `cd frontend && npm install @radix-ui/react-context-menu`
- Create `frontend/src/components/ui/context-menu.tsx` — shadcn-canonical wrapper around `@radix-ui/react-context-menu`. Export: `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuLabel`, `ContextMenuShortcut`, `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent`, `ContextMenuRadioGroup`, `ContextMenuRadioItem`, `ContextMenuCheckboxItem`.
- Style to match the PM dark theme (use `var(--color-pm-bg-secondary)`, `var(--color-pm-border)`, etc. — see `TaskCard.tsx:55-60` for the variable names).
- Use the project's `cn` utility if it exists; otherwise plain template strings.

**Files:** `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/components/ui/context-menu.tsx` (new)
**Depends on:** none (parallel to backend work)
**Verify:** `cd frontend && npx tsc --noEmit` passes. Import `ContextMenu` from a test file and render a trivial menu; right-click works.

### T10: Frontend — pmStore multi-select + bulk action thunks
**Do:**
- Extend `frontend/src/stores/pmStore.ts`:
  - State:
    - `selectedTaskIds: Set<string>` (project-scoped; lives alongside `activeProject`)
    - `meSelectedTaskIds: Set<string>` (Me-tab-scoped; separate because tasks span projects)
  - Actions:
    - `toggleTaskSelection(id: string): void`
    - `clearTaskSelection(): void`
    - `selectAllTasksInColumn(columnId: string): void`
    - `isTaskSelected(id: string): boolean` (selector)
    - `bulkDeleteSelectedTasks(): Promise<void>` (optimistic remove from `activeProject`, call `pmApi.bulkDeleteTasks`, clear selection on success, refetch on failure)
    - `bulkMoveSelectedTasksToProject(targetProjectId: string): Promise<void>` (validate all selected are in an `is_backlog` column, call `pmApi.bulkMoveTasksToProject`, refetch `activeProject` on success since positions shift)
  - Equivalent Me-tab variants: `toggleMeTaskSelection`, `clearMeTaskSelection`, `bulkDeleteMeSelectedTasks`, `bulkMoveMeSelectedTasksToProject`.
- Me-tab bulk move requires loading each task's column to check `is_backlog` — store already has this via `PmMyTask` shape; add the check before calling the API.
- When `activeProject` changes (project switch), auto-clear `selectedTaskIds`.

**Files:** `frontend/src/stores/pmStore.ts`
**Depends on:** T8
**Verify:** `cd frontend && npx tsc --noEmit` passes. Unit-free: manual check via React devtools that selection state updates on toggle and clears on project switch.

### T11: Frontend — TaskCard selection checkbox + context menu trigger
**Do:**
- `frontend/src/components/pm/TaskCard.tsx`:
  - Accept new props: `isSelected: boolean`, `onToggleSelect: () => void`, `onContextMenuAction: (action: 'delete' | 'moveToProject' | 'open' | 'assign' | 'setPriority' | 'moveToColumn', payload?: any) => void`.
  - Add a checkbox positioned `absolute top-2 left-2` that shows on `group-hover` and persists via `isSelected || selectionActive` (selection active when any card is selected, passed via another prop `selectionActive: boolean`).
  - Checkbox `onClick` calls `e.stopPropagation()` then `onToggleSelect()`.
  - When `isSelected`, add an outline ring to the card (`box-shadow: 0 0 0 2px var(--color-pm-accent) inset` or similar, matching the PM theme).
  - Wrap the card in `<ContextMenu>` with a `<ContextMenuTrigger asChild>` that wraps the existing motion.div. Content is a `<ContextMenuContent>` with items:
    - "Open" → calls existing `onClick` handler
    - "Assign…" → `onContextMenuAction('assign')`
    - "Set priority" → submenu with P1–P5 options
    - "Move to column" → submenu with sibling columns (passed via props as `siblingColumns: PmColumn[]`)
    - separator
    - "Move to project…" → disabled if `!isBacklog`, tooltip explains why; calls `onContextMenuAction('moveToProject')`
    - "Delete" → `onContextMenuAction('delete')`
  - Context menu semantics: if the right-clicked task is part of the current selection, the action applies to the whole selection. Otherwise the menu operates on this single task. This is enforced by the parent (`ProjectBoard`) in how it handles the action, not by `TaskCard`.
- Apply the same changes to `frontend/src/components/pm/MeTaskCard.tsx` with the Me-tab variant of the actions (no move-to-column for Me tab since it spans projects).

**Files:** `frontend/src/components/pm/TaskCard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Depends on:** T9, T10
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual: right-click opens menu; menu disabled state works; checkbox click does not start a drag; drag still works when clicking card body.

### T12: Frontend — MoveToProjectModal
**Do:**
- Create `frontend/src/components/pm/MoveToProjectModal.tsx`:
  - Props: `{ isOpen: boolean; onClose: () => void; taskIds: string[]; onConfirm: (targetProjectId: string) => Promise<void>; currentProjectId: string | null }`.
  - Fetches projects from `pmStore.projects` (already populated). Excludes `currentProjectId`.
  - Shows a searchable dropdown / list of projects with their icons and names.
  - Shows the count: `"Move N task(s) to:"`.
  - Confirm button: disabled until a project is selected. On click, calls `onConfirm(selectedProjectId)`, awaits, then closes.
  - Modal chrome matches `CreateProjectModal.tsx` for visual consistency.

**Files:** `frontend/src/components/pm/MoveToProjectModal.tsx` (new)
**Depends on:** T8
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual: opens, lists projects, excludes current, confirms and closes.

### T13: Frontend — ProjectBoard integration
**Do:**
- `frontend/src/pages/admin/ProjectBoard.tsx`:
  - Subscribe to `selectedTaskIds` from `pmStore`.
  - Compute `selectionActive = selectedTaskIds.size > 0`.
  - Compute `allSelectedInBacklog = [...selectedTaskIds].every(id => findTask(id)?.column.is_backlog)` — expensive but selection sizes are small.
  - Render `<BulkActionBar>` when `selectionActive`:
    - Count badge
    - Actions:
      - "Delete" (danger variant) → open a confirm modal showing the count; on confirm call `bulkDeleteSelectedTasks()`
      - "Move to project" (primary variant) → open `MoveToProjectModal` with `taskIds = [...selectedTaskIds]`; disabled with tooltip if `!allSelectedInBacklog`
      - "Move to column" (secondary) → dropdown/submenu of the current project's columns; calls bulk move within project (can reuse single-task move endpoint in a loop, or add a new bulk endpoint — scope decision: for v1 loop the existing move endpoint client-side since cross-column bulk is cosmetic)
      - "Set priority" (secondary) → dropdown; calls existing `updateTask` per selected id
      - "Assign" (secondary) → opens a small user picker; calls existing `assignTask` per id
    - `onClear` → `clearTaskSelection()`
  - Context menu handler on each card: if the right-clicked task is in the selection, forward the action to the bulk path (same handlers as the bar); otherwise operate on the single task only (temporary single-item array for move-to-project/delete).
  - Pass `isSelected`, `onToggleSelect`, `selectionActive`, `onContextMenuAction`, `siblingColumns` down through `KanbanBoard` → `KanbanColumn` → `TaskCard`.
  - Clear selection on project switch (already in store, verify it works here).

**Files:** `frontend/src/pages/admin/ProjectBoard.tsx`, `frontend/src/components/pm/KanbanBoard.tsx`, `frontend/src/components/pm/KanbanColumn.tsx`
**Depends on:** T10, T11, T12
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual flow: (a) hover card → checkbox appears → click → selection bar appears → select more → bar count updates → click "Move to project" → modal → pick → tasks move; (b) select non-backlog task → "Move to project" disabled with tooltip; (c) right-click card → menu works; (d) drag-drop still works with cards selected.

### T14: Frontend — MeTabView multi-select integration
**Do:**
- `frontend/src/components/pm/MeTabView.tsx`:
  - Subscribe to `meSelectedTaskIds`.
  - Render `<BulkActionBar>` when selection non-empty.
  - Actions for Me tab:
    - "Delete" → confirm modal → `bulkDeleteMeSelectedTasks`
    - "Move to project" → only enabled if all selected are in a backlog column (use the `column_ids` shape in `PmMyTask` to detect — note: `PmMyTask` currently exposes only `todo_id`, `in_progress_id`, `done_id` but not `backlog_id` because Me tab hides backlog. If a user selects a non-backlog task and hits move-to-project, disable with tooltip. For Me tab v1, move-to-project is effectively always disabled since Me tab doesn't show backlog tasks — document this in a comment and still wire the button for completeness and consistency.)
  - Pass selection props into `MeKanbanBoard` → `MeTaskCard`.
  - Me-tab context menu: subset of ProjectBoard's (no move-to-column since tasks span projects).

**Files:** `frontend/src/components/pm/MeTabView.tsx`, `frontend/src/components/pm/MeKanbanBoard.tsx`, `frontend/src/components/pm/MeTaskCard.tsx`
**Depends on:** T10, T11, T12
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual: select Me tasks, bulk delete works; move-to-project disabled (expected — backlog hidden from Me tab).

### T15: Frontend — CrossProjectAISynthModal
**Do:**
- Create `frontend/src/components/pm/CrossProjectAISynthModal.tsx` by forking `AISynthModal.tsx`:
  - Props: `{ isOpen: boolean; onClose: () => void }` (no `projectId`).
  - Uses `extractCrossProjectBatch`, `fetchCrossProjectBatches`, `fetchBatch`, `setBatchTaskTargetProject`, `approveBatchTask`, `rejectBatchTask`, `deleteBatch` from `pmApi`.
  - Grid view lists cross-project batches (new endpoint).
  - New view: extract form, same as existing (text + file upload).
  - Detail view: same as existing, but the `BatchTaskCard` inline component gains:
    - A project picker select per task, populated from `pmStore.projects` (active only).
    - When the task has `target_project_id` null, the Approve button is disabled with tooltip "Assign a project first".
    - On project selection, call `setBatchTaskTargetProject` and update local batch state.
    - A "Set all to…" dropdown at the top of the task list that sets `target_project_id` for every still-pending task (client-side loop over `setBatchTaskTargetProject`).
  - Cross-project batch cards in the grid view show a "Cross-project" badge.
  - After approving the last task in a cross-project batch, refresh `usePmStore.fetchProjects()` so dashboard project counts update.

**Files:** `frontend/src/components/pm/CrossProjectAISynthModal.tsx` (new)
**Depends on:** T8
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual: open cross-project synth modal, extract a batch, pick a project per task, approve, task appears in the target project.

### T16: Frontend — ProjectsDashboard cross-project synth entry
**Do:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx`:
  - Add a "Cross-project AI Synth" button in the top header area (near the existing tab switcher or the FAB). Use `Sparkles` icon from lucide-react to match per-project synth styling.
  - Clicking opens `CrossProjectAISynthModal`.
  - Show the count of pending cross-project batches as a small badge on the button (optional polish; if it adds complexity, skip and surface count inside the modal only).

**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`
**Depends on:** T15
**Verify:** `cd frontend && npx tsc --noEmit` passes. Manual: button visible on dashboard, opens modal, modal closes cleanly.

## Done

**Build & type-check:**
- [ ] `npx tsc --noEmit` at repo root — zero new errors
- [ ] `cd frontend && npx tsc --noEmit` — zero new errors
- [ ] `cd frontend && npm run lint` (if configured) — no new warnings
- [ ] Backend build (if configured) passes

**Migration:**
- [ ] `npx knex migrate:latest` runs clean on dev DB
- [ ] Verify: `SELECT name, is_backlog FROM pm_columns` shows `is_backlog = true` only for `name = 'Backlog'` rows
- [ ] Verify: `\d pm_ai_synth_batches` shows `project_id` is nullable
- [ ] Verify: `\d pm_ai_synth_batch_tasks` shows `target_project_id` column present, nullable, FK to `pm_projects`
- [ ] All three migration scaffolds (`mssql.sql`, `pgsql.sql`, `knexmigration.js`) exist and contain the full DDL

**Name-check sweep:**
- [ ] `grep -rn '"Backlog"' src/ | grep -v DEFAULT_COLUMNS` returns zero lines (only the seed constant survives)

**Feature 1 — Move backlog to another project:**
- [ ] Single-task: right-click a backlog task → "Move to project…" → pick → task appears in target project's backlog
- [ ] Single-task: right-click a To Do / In Progress / Done task → "Move to project…" is disabled with tooltip
- [ ] Bulk: select multiple backlog tasks → bulk bar "Move to project" → all appear in target
- [ ] Bulk: selection includes a non-backlog task → bulk "Move to project" is disabled with tooltip
- [ ] Source project's Backlog positions are contiguous after move
- [ ] Activity log row exists under target project with action `task_moved_to_project`

**Feature 2 — Multi-select & floating bar:**
- [ ] Hover a card → checkbox appears in the corner
- [ ] Click checkbox → card gets selected outline, bulk bar appears at bottom
- [ ] Select multiple across columns → count updates
- [ ] Drag-drop still works on a selected card
- [ ] Right-click a non-selected card → menu acts on that single task
- [ ] Right-click a selected card when N tasks are selected → menu acts on the full selection
- [ ] Bulk delete → confirm modal shows correct count → tasks gone → bar dismisses
- [ ] Bulk set priority → all selected tasks get the chosen priority
- [ ] Bulk assign → all selected tasks get the chosen assignee
- [ ] Clear button dismisses the bar and clears selection
- [ ] Switching projects clears selection automatically
- [ ] Me tab: multi-select works for delete (move-to-project disabled as documented since backlog is hidden)

**Feature 3 — Cross-project AI Synth:**
- [ ] New "Cross-project AI Synth" button visible on `/admin/pm` dashboard
- [ ] Clicking opens the cross-project modal
- [ ] Extract flow (text and file upload) both work
- [ ] Batch row created with `project_id = NULL` in DB
- [ ] Tasks parsed; LLM-suggested `target_project_id` populates the per-task picker
- [ ] User can override per task via dropdown
- [ ] "Set all to…" dropdown applies to all pending tasks
- [ ] Approve is disabled for any task without a `target_project_id`
- [ ] Approve with a target project → real task appears in that project's Backlog
- [ ] Reject still works without requiring a target project
- [ ] Cross-project batches show in the modal grid with a "Cross-project" badge
- [ ] Per-project synth flow (existing AISynthModal) is unchanged — regression check on any project's "AI Synth" button

**No regressions:**
- [ ] Drag-drop within a project works as before (backlog → to do, reorder, etc.)
- [ ] Backlog → non-Backlog still blocks if task has no assignee (existing rule at `KanbanBoard.tsx:191`)
- [ ] Per-project AI Synth still drops approved tasks into Backlog
- [ ] Project creation still seeds four columns; new project's Backlog has `is_backlog = true`
- [ ] PmStatsController's backlog counts still work
- [ ] Activity timeline still renders cleanly (new action strings display as-is, no crash)
