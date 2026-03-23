# Admin Schedules Page

## Why
Proofline and ranking agents are triggered externally via n8n. There's zero visibility into when they last ran, when they'll run next, or whether they failed. Moving scheduling in-house gives us a single pane of glass to manage, monitor, and debug agent runs — and eliminates the n8n dependency for these two agents.

## What
A new "Schedules" admin page backed by two DB tables (`schedules`, `schedule_runs`) and a BullMQ scheduler worker. Proofline runs daily, ranking runs every 15 days. Each schedule shows a live countdown to next run, run history, and can be enabled/disabled or manually triggered.

## Context

**Relevant files:**
- `signalsai-backend/src/workers/worker.ts` — existing BullMQ worker orchestrator, schedule setup pattern
- `signalsai-backend/src/workers/queues.ts` — Redis connection pool, `getMindsQueue()` factory
- `signalsai-backend/src/controllers/agents/AgentsController.ts` — `runProoflineAgent()` (line 93), `runRankingAgent()` (line 1121) — both HTTP-coupled
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — `processDailyAgent()` core logic
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — `processLocationRanking()` core logic
- `signalsai-backend/src/index.ts` — route mounting
- `signalsai/src/pages/Admin.tsx` — admin router
- `signalsai/src/components/Admin/AdminSidebar.tsx` — sidebar nav

**Patterns to follow:**
- BullMQ worker setup: see `worker.ts` lines 31-111 (worker creation) and 113-257 (schedule setup)
- Admin route pattern: `routes/admin/organizations.ts` → `authenticateToken` + `superAdminMiddleware`
- Admin page pattern: `pages/admin/WebsitesList.tsx` (list page with AdminPageHeader, TanStack Query)
- Model pattern: `models/AgentResultModel.ts` (named exports, Knex queries)

**Key decisions:**
- Tables in `public` schema (not `website_builder`)
- Scheduler tick via BullMQ repeatable job (every 60s), DB is source of truth for what's due
- Support both `cron` and `interval_days` schedule types
- Agent registry is a code-side map — UI picks from registered agents, doesn't create arbitrary handlers
- `next_run_at` is pre-computed after each run; scheduler tick just checks `WHERE next_run_at <= NOW() AND enabled = true`

## Constraints

**Must:**
- Follow existing BullMQ worker patterns (prefix `{minds}`, concurrency 1)
- Follow existing admin page conventions (AdminPageHeader, dark sidebar, TanStack Query hooks)
- Extract proofline/ranking core logic into standalone functions — HTTP handlers become thin wrappers
- Prevent overlapping runs (skip if a `running` schedule_run exists for that schedule)
- Seed proofline (daily 6 AM UTC) and ranking (every 15 days) on first migration

**Must not:**
- Touch existing BullMQ workers (discovery, review-sync, etc.) — those stay as-is
- Add new npm dependencies beyond `cron-parser` (for next-run calculation)
- Modify the proofline/ranking business logic — only decouple from `req`/`res`

**Out of scope:**
- Migrating existing BullMQ workers to this system
- Failure notifications (email/Slack)
- Per-org schedule configuration
- Schedule-level parameter overrides

## Risk

**Level:** 2

**Risks identified:**
- Handler extraction changes existing code paths → **Mitigation:** Extract into separate exported functions, HTTP handlers call the extracted functions with zero behavior change. Both code paths are tested by hitting the existing HTTP endpoints.
- Scheduler tick reliability depends on worker process uptime → **Mitigation:** Same risk profile as existing 5 BullMQ scheduled jobs. No additional exposure.
- `cron-parser` dependency → **Mitigation:** Lightweight, widely used (25M+ weekly downloads), likely already a transitive dep of BullMQ.

## Tasks

### T1: Database migration — `schedules` and `schedule_runs` tables

**Do:**
Create Knex migration with two tables:

`schedules`:
- `id` SERIAL PK
- `agent_key` VARCHAR(100) NOT NULL UNIQUE — maps to registry
- `display_name` VARCHAR(255) NOT NULL
- `description` TEXT
- `schedule_type` VARCHAR(20) NOT NULL — `'cron'` or `'interval_days'`
- `cron_expression` VARCHAR(100) — for cron type
- `interval_days` INTEGER — for interval type
- `timezone` VARCHAR(50) NOT NULL DEFAULT `'UTC'`
- `enabled` BOOLEAN NOT NULL DEFAULT `true`
- `last_run_at` TIMESTAMPTZ
- `next_run_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

`schedule_runs`:
- `id` SERIAL PK
- `schedule_id` INTEGER NOT NULL FK → `schedules(id)` ON DELETE CASCADE
- `status` VARCHAR(20) NOT NULL DEFAULT `'running'` — running / completed / failed
- `started_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `completed_at` TIMESTAMPTZ
- `duration_ms` INTEGER
- `summary` JSONB — agent-specific stats (locations processed, successes, failures)
- `error` TEXT
- `created_at` TIMESTAMPTZ DEFAULT NOW()

Indexes: `idx_schedule_runs_schedule_id` on `schedule_id`, `idx_schedule_runs_status` on `status`.

Seed two rows:
1. `proofline` — cron `0 6 * * *`, enabled, `next_run_at` = next 6 AM UTC
2. `ranking` — interval_days `15`, enabled, `next_run_at` = 15 days from now

**Files:** `signalsai-backend/src/database/migrations/XXXXXXXX_create_schedules_tables.ts`
**Verify:** `npx knex migrate:latest` succeeds, tables exist with seed data

### T2: Model + agent registry + handler extraction

**Do:**
1. Create `ScheduleModel.ts` — CRUD for schedules + schedule_runs (list, getById, create, update, delete, listRuns, createRun, completeRun, failRun, updateNextRunAt)
2. Create agent registry (`services/agentRegistry.ts`) — a map of `agent_key → { displayName, description, handler }` where handler is `() => Promise<{ summary: object }>`. Register `proofline` and `ranking`.
3. Extract proofline core logic from `AgentsController.ts` lines 93-260 into `executeProoflineAgent(referenceDate?: string): Promise<ProoflineResult>` in `service.agent-orchestrator.ts`. The HTTP handler becomes a thin wrapper that calls this and formats the response.
4. Extract ranking core logic from `AgentsController.ts` lines 1121-1350+ into `executeRankingAgent(connectionIdFilter?: number): Promise<RankingResult>` in a similar fashion. The HTTP handler wraps it.

**Files:** `signalsai-backend/src/models/ScheduleModel.ts`, `signalsai-backend/src/services/agentRegistry.ts`, `signalsai-backend/src/controllers/agents/AgentsController.ts`, `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Verify:** Existing HTTP endpoints `/proofline-run` and `/ranking-run` still work identically

### T3: Scheduler BullMQ worker

**Do:**
1. Create `scheduler.processor.ts` — the tick handler:
   - Query `schedules WHERE enabled = true AND next_run_at <= NOW()`
   - For each due schedule: check no active run exists (status = `running`), look up handler in registry, create `schedule_runs` row, execute handler, update run status + summary, compute and set `next_run_at`
   - `next_run_at` computation: for cron → use `cron-parser` to get next occurrence; for interval_days → `last_run_at + interval_days`
2. Add `scheduler` worker to `worker.ts` — new BullMQ Worker on queue `minds-scheduler`, repeatable job every 60 seconds
3. Add to graceful shutdown list

**Files:** `signalsai-backend/src/workers/processors/scheduler.processor.ts`, `signalsai-backend/src/workers/worker.ts`
**Verify:** Worker starts, logs scheduler tick, processes due schedules

### T4: Admin API — routes + controller

**Do:**
Create admin schedules endpoints:
- `GET /api/admin/schedules` — list all schedules with latest run status
- `GET /api/admin/schedules/registry` — list available agent keys (for "create" dropdown)
- `GET /api/admin/schedules/server-time` — current server timestamp (for countdown sync)
- `GET /api/admin/schedules/:id/runs` — paginated run history (query param `limit`, default 20)
- `POST /api/admin/schedules` — create schedule (agent_key, schedule_type, cron/interval, enabled)
- `PATCH /api/admin/schedules/:id` — update (cron/interval, enabled, display_name)
- `DELETE /api/admin/schedules/:id` — delete schedule
- `POST /api/admin/schedules/:id/run` — manual trigger (enqueues immediately)

All routes: `authenticateToken` + `superAdminMiddleware`.

**Files:** `signalsai-backend/src/routes/admin/schedules.ts`, `signalsai-backend/src/controllers/admin-schedules/AdminSchedulesController.ts`, `signalsai-backend/src/index.ts` (mount route)
**Verify:** `curl` each endpoint returns expected shape

### T5: Frontend — Schedules admin page

**Do:**
1. Create `Schedules.tsx` admin page:
   - Header: "Schedules" with `Clock` icon (lucide)
   - Schedule cards/rows: agent name, schedule description (cron human-readable or "Every X days"), enabled toggle, last run status badge, **countdown to next run** (ticking, computed from `next_run_at` minus server-synced time), "Run Now" button
   - Expandable run history per schedule (last 20 runs with status, duration, timestamp, summary/error)
   - "Add Schedule" button → modal/form with agent dropdown (from registry endpoint), schedule type picker, cron/interval input, enabled toggle
   - Edit/delete existing schedules
2. Create `api/schedules.ts` — typed API functions
3. Create `hooks/queries/useScheduleQueries.ts` — TanStack Query hooks with 30s refetch interval (for countdown accuracy)
4. Add to `AdminSidebar.tsx` — new key `"schedules"` in `BOTTOM_ITEMS` (before Settings), `Clock` icon
5. Add to `Admin.tsx` — route `<Route path="schedules" element={<Schedules />} />`
6. Server time sync: fetch `/server-time` once on mount, compute offset, use for countdown

**Files:** `signalsai/src/pages/admin/Schedules.tsx`, `signalsai/src/api/schedules.ts`, `signalsai/src/hooks/queries/useScheduleQueries.ts`, `signalsai/src/components/Admin/AdminSidebar.tsx`, `signalsai/src/pages/Admin.tsx`
**Verify:** Manual: navigate to `/admin/schedules`, see proofline + ranking schedules, countdown ticks, run history loads, enable/disable works, "Run Now" triggers

## Done
- [ ] `npx knex migrate:latest` — tables created with seed data
- [ ] `npx tsc --noEmit` — zero TS errors
- [ ] Existing `/proofline-run` and `/ranking-run` HTTP endpoints unchanged behavior
- [ ] Scheduler worker starts and ticks every 60s
- [ ] Manual: `/admin/schedules` page renders with countdown, history, toggle, run-now
- [ ] Manual: "Run Now" triggers agent and run appears in history
- [ ] Manual: Enable/disable toggle persists and prevents/allows scheduled runs
