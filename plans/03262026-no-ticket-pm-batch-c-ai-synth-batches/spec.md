# PM Batch C: AI Synth Batch System

## Why
The current AI Synth flow is fire-and-forget: paste text → get tasks → confirm → done. There's no history, no audit trail, no way to revisit what was synthesized. The new batch system treats each AI Synth extraction as a **batch** — a persistent record of what was submitted, what was extracted, and the review status of each proposed task. This turns AI Synth from a one-shot tool into a managed pipeline.

## What
1. New `pm_ai_synth_batches` database table
2. New `pm_ai_synth_batch_tasks` database table (proposed tasks per batch)
3. Backend CRUD for batches: create, list, get, approve/reject tasks
4. Revamped AI Synth modal: batch grid view + new synth button + batch detail view
5. Batch → task approval flow: proposed tasks get reviewed, approved tasks "move to backlog" as real tasks
6. AI Synth prompt updated to generate markdown descriptions + inferred priorities

## Context

**Relevant files:**
- `src/controllers/pm/PmAiSynthController.ts` — current `extractTasks` and `batchCreateTasks` handlers. These will be significantly refactored.
- `src/routes/pm/aiSynth.ts` — current routes: `POST /ai-synth`, `POST /ai-synth/batch-create`. Need new routes.
- `src/agents/pmAgents/AISynth.md` — Claude prompt for extraction
- `src/utils/pmFileExtract.ts` — file-to-text extraction (txt, pdf, docx, eml)
- `frontend/src/components/pm/AISynthPanel.tsx` — current right-slide panel with 3 phases (input → loading → review). Will be replaced with a modal-based design.
- `frontend/src/components/pm/ProposedTaskList.tsx` — current review interface. Will be repurposed for batch task review.
- `frontend/src/api/pm.ts` — API functions. Need new batch functions.
- `frontend/src/types/pm.ts` — need new batch types.
- `frontend/src/stores/pmStore.ts` — may need batch-related state or a separate store.
- `frontend/src/pages/admin/ProjectBoard.tsx` — AI Synth button opens the panel. Will open new modal.
- `src/models/BaseModel.ts` — base model pattern for new models
- `src/database/migrations/` — need new migration

**Patterns to follow:**
- Migration: `YYYYMMDD000001_name.ts`, Knex up/down
- Model: extend `BaseModel`, override `create()` if table lacks `created_at`/`updated_at` (or add them)
- Controller: static exports, `handleError` utility, `AuthRequest` type
- API: `{ path, passedData }` object syntax, response unwrap (no double `.data`)

## Constraints

**Must:**
- Each AI Synth extraction creates a persistent batch record
- Batch records include: source text (or filename), extraction timestamp, project association, status
- Each proposed task in a batch has its own status: `pending` → `approved` → `rejected`
- "Approve" = create a real task in the Backlog column with `source: 'ai_synth'`
- Batch list shows status summary: "3/10 approved, 2 rejected, 5 pending"
- AI Synth prompt must generate markdown descriptions with inferred priorities
- File uploads stored temporarily (text extracted, file discarded — current behavior preserved)

**Must not:**
- Break existing tasks that were created via the old batch-create flow
- Store full uploaded files permanently — extract text only
- Auto-approve tasks — user must explicitly approve each one

**Out of scope:**
- Editing proposed tasks before approval (v1: approve as-is or reject)
- Re-running AI Synth on a batch (if extraction was bad, create a new batch)
- Batch deletion (batches are audit records — never delete)

## Risk

**Level:** 3 — New tables, new data model, significant controller refactor, new modal UI. Recommend careful review before execution.

**Risks identified:**
- Data migration for existing AI Synth tasks → **Mitigation:** existing tasks retain `source: 'ai_synth'` flag but have no batch association. No backfill needed — batches are forward-looking.
- Batch table growth → **Mitigation:** batch records are small (text + metadata). Proposed tasks reference the batch. Index on `(project_id, created_at DESC)`.
- Long AI extraction times → **Mitigation:** show progress/loading state in modal. Consider moving extraction to a BullMQ job for very large documents (future enhancement, not v1).

**Pushback:** This adds significant complexity to the AI Synth feature. If the goal is a simple "paste → extract → create" flow, the current approach (without batches) is simpler. Batches are justified if there's a need for audit trail, repeated review, or team collaboration on extracted tasks. **Recommendation:** proceed if audit/review is a priority, otherwise keep the current simpler flow and add batch history later.

## Tasks

### T1: Create database migration for batch tables
**Do:** Create migration `20260326000002_create_pm_ai_synth_batches.ts`:

**`pm_ai_synth_batches`:**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| project_id | UUID FK → pm_projects | ON DELETE CASCADE |
| source_text | TEXT | The raw input text that was synthesized |
| source_filename | VARCHAR(255) | Filename if uploaded, null if pasted text |
| status | VARCHAR(20) | `synthesizing` \| `pending_review` \| `completed`. Default `synthesizing` |
| total_proposed | INTEGER | Count of proposed tasks |
| total_approved | INTEGER | Default 0, updated on approval |
| total_rejected | INTEGER | Default 0, updated on rejection |
| created_by | INTEGER | User who triggered the synth |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**`pm_ai_synth_batch_tasks`:**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| batch_id | UUID FK → pm_ai_synth_batches | ON DELETE CASCADE |
| title | VARCHAR(500) | Proposed task title |
| description | TEXT | Proposed description (markdown) |
| priority | VARCHAR(5) | Inferred priority: P1/P2/P3 |
| deadline_hint | VARCHAR(100) | Raw deadline hint from Claude |
| status | VARCHAR(20) | `pending` \| `approved` \| `rejected`. Default `pending` |
| created_task_id | UUID | References pm_tasks.id when approved. Null until approved |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:**
- `pm_ai_synth_batches(project_id, created_at DESC)`
- `pm_ai_synth_batch_tasks(batch_id, status)`

**Files:** `src/database/migrations/20260326000002_create_pm_ai_synth_batches.ts`
**Verify:** Migration runs, tables created

### T2: Create models for batch tables
**Do:** Create `PmAiSynthBatchModel` and `PmAiSynthBatchTaskModel` extending BaseModel. Both override `create()` to skip `updated_at` injection (tables only have `created_at`).
**Files:** `src/models/PmAiSynthBatchModel.ts`, `src/models/PmAiSynthBatchTaskModel.ts`
**Verify:** `npx tsc --noEmit` passes

### T3: Refactor AI Synth backend controller
**Do:** Refactor `PmAiSynthController.ts`:

**`POST /api/pm/ai-synth/extract`** (new, replaces old `POST /ai-synth`):
1. Accept `{ project_id, text }` or file upload
2. Create a batch record with `status: 'synthesizing'`
3. Call Claude with the AI Synth prompt (updated for markdown descriptions)
4. Parse response into proposed tasks
5. Insert each proposed task into `pm_ai_synth_batch_tasks` with `status: 'pending'`
6. Update batch: `status: 'pending_review'`, `total_proposed: tasks.length`
7. Return the full batch with its tasks

**`GET /api/pm/ai-synth/batches?project_id=X`** (new):
- List all batches for a project, newest first
- Include summary counts (total_proposed, total_approved, total_rejected)
- Paginated (20 per page)

**`GET /api/pm/ai-synth/batches/:batchId`** (new):
- Get a single batch with all its proposed tasks

**`PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/approve`** (new):
1. Find the proposed task, verify status is `pending`
2. Find the Backlog column for the batch's project
3. Create a real task in Backlog: title, description (markdown), priority from proposed task, `source: 'ai_synth'`
4. Update proposed task: `status: 'approved'`, `created_task_id: newTask.id`
5. Increment batch `total_approved`
6. If all tasks are approved or rejected, set batch `status: 'completed'`
7. Log activity: `task_created` with `{ source: 'ai_synth', batch_id }`

**`PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/reject`** (new):
1. Set proposed task `status: 'rejected'`
2. Increment batch `total_rejected`
3. If all tasks resolved, set batch `status: 'completed'`

Remove the old `POST /api/pm/ai-synth/batch-create` endpoint (deprecated).

**Files:** `src/controllers/pm/PmAiSynthController.ts`, `src/routes/pm/aiSynth.ts`
**Verify:** Full flow via curl: extract → list batches → get batch → approve task → verify real task in Backlog

### T4: Update AI Synth prompt for markdown + better priority inference
**Do:** Update `src/agents/pmAgents/AISynth.md`:
```
You are a task extraction assistant for a project management tool. Analyze the provided text and extract actionable tasks.

For each task, provide:
- **title**: Clear, concise, verb-first (e.g. "Review proposal" not "Proposal review"). Max 80 characters.
- **description**: Markdown-formatted context. Use bullet lists for multiple items, **bold** for emphasis, `code` for technical terms. Keep it concise — 1-3 sentences or a short bullet list. Use null if no additional context is needed beyond the title.
- **priority**: P1 (blocking/urgent, needs immediate attention), P2 (important, should be done this week), P3 (nice to have, can be deferred). Default to P3 unless the text clearly indicates urgency.
- **deadline_hint**: A human-readable deadline if mentioned or inferable (e.g. "by Friday", "end of March", "ASAP"). Use null if no deadline is mentioned.

Respond ONLY with a JSON array. No markdown fencing, no preamble, no commentary.
```
**Files:** `src/agents/pmAgents/AISynth.md`
**Verify:** Extraction returns markdown descriptions with proper priorities

### T5: Add batch types and API functions to frontend
**Do:**
Add to `frontend/src/types/pm.ts`:
```typescript
export interface PmAiSynthBatch {
  id: string;
  project_id: string;
  source_text: string;
  source_filename: string | null;
  status: "synthesizing" | "pending_review" | "completed";
  total_proposed: number;
  total_approved: number;
  total_rejected: number;
  created_by: number;
  created_at: string;
  tasks?: PmAiSynthBatchTask[];
}

export interface PmAiSynthBatchTask {
  id: string;
  batch_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3";
  deadline_hint: string | null;
  status: "pending" | "approved" | "rejected";
  created_task_id: string | null;
  created_at: string;
}
```

Add to `frontend/src/api/pm.ts`:
```typescript
extractBatch(projectId, text, file?)
fetchBatches(projectId, limit?, offset?)
fetchBatch(batchId)
approveBatchTask(batchId, taskId)
rejectBatchTask(batchId, taskId)
```
**Files:** `frontend/src/types/pm.ts`, `frontend/src/api/pm.ts`
**Verify:** `npx tsc --noEmit` passes

### T6: Build AISynthModal (replaces AISynthPanel)
**Do:** Create `frontend/src/components/pm/AISynthModal.tsx`. A centered modal (not a side panel) with two views:

**View 1: Batch Grid (default)**
- Header: "AI Synth" title + "New Synth" button (orange, sparkle icon)
- Grid of batch cards (2 columns). Each card shows:
  - Source preview (first 100 chars of source_text, or filename)
  - Status badge: "Synthesizing..." (amber pulse), "Review" (blue), "Completed" (green)
  - Mini stats: "3/10 approved · 2 rejected · 5 pending"
  - Timestamp: "2 hours ago"
  - Click to open View 2

**View 2: Batch Detail**
- Back button to grid
- Source text preview (collapsible)
- List of proposed tasks as cards:
  - Title + priority triangle + description preview (markdown rendered)
  - Deadline hint if present
  - Status badge: pending (gray), approved (green checkmark), rejected (red x)
  - Action buttons for pending tasks: "Approve" (green, creates task in Backlog) and "Reject" (red outline)
  - Approved tasks show "Created → view task" link

**View 3: New Synth (opened from "New Synth" button)**
- Text area + file upload (same as current AISynthPanel input phase)
- "Extract Tasks" button
- On submit: creates batch, switches to View 2 showing the new batch in "synthesizing" → "pending_review" state

Framer Motion: view transitions with `AnimatePresence` and `layoutId` for smooth switching.
**Files:** `frontend/src/components/pm/AISynthModal.tsx`
**Verify:** Modal opens, shows batch grid, "New Synth" creates batch, batch detail shows tasks, approve/reject works

### T7: Wire AISynthModal into ProjectBoard
**Do:** Replace `AISynthPanel` import in `ProjectBoard.tsx` with `AISynthModal`. The AI Synth button in the kanban header opens the new modal. Remove old `AISynthPanel.tsx` and `ProposedTaskList.tsx` (they're replaced by the modal's internal views).
**Files:** `frontend/src/pages/admin/ProjectBoard.tsx`
**Verify:** AI Synth button opens new modal, full batch flow works end-to-end

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Migration creates batch tables
- [ ] `POST /api/pm/ai-synth/extract` creates batch + proposed tasks
- [ ] `GET /api/pm/ai-synth/batches` lists batches with summary stats
- [ ] `PUT .../approve` creates real task in Backlog with markdown description
- [ ] `PUT .../reject` marks proposed task as rejected
- [ ] AI Synth modal shows batch grid with status indicators
- [ ] "New Synth" creates a batch and shows proposed tasks
- [ ] Approve moves task to Backlog, reject marks as rejected
- [ ] Batch auto-completes when all tasks are resolved
- [ ] Old AI Synth tasks (`source: 'ai_synth'`) still display correctly
