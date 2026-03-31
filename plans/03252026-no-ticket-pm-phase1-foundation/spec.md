# PM Phase 1: Foundation — Database, API Skeleton, Route Shell

## Why
Alloro Projects needs its database schema, backend route skeleton, and frontend entry point before any feature work can begin. This phase lays the foundation all other phases depend on.

## What
- All `pm_` tables created with indexes and triggers
- Express router skeleton at `/api/pm/*` with auth middleware
- "Projects" tab added to AdminTopBar with routing
- Frontend route shell with empty dashboard component
- PM color tokens added to Tailwind config
- Dependencies installed: @dnd-kit/core, @dnd-kit/sortable, recharts, date-fns, zustand

## Context

**Relevant files:**
- `src/database/migrations/` — existing migrations use `YYYYMMDD000001_name.ts` naming, Knex format
- `src/database/connection.ts` — exports `db` (Knex instance)
- `src/index.ts` — route mounting point (add `app.use("/api/pm", pmRoutes)`)
- `src/middleware/auth.ts` — `authenticateToken` middleware
- `src/middleware/superAdmin.ts` — `superAdminMiddleware` for admin-only routes
- `src/routes/admin/schedules.ts` — reference route pattern: `express.Router()` + auth + controller
- `src/models/BaseModel.ts` — abstract base with `findById`, `findMany`, `create`, `updateById`, `deleteById`, `paginate`
- `frontend/src/components/Admin/AdminTopBar.tsx` — needs tab structure (currently just branding + user menu)
- `frontend/src/components/Admin/AdminLayout.tsx` — wraps admin content with sidebar + topbar
- `frontend/src/pages/Admin.tsx` — admin route definitions (add `/pm/*` routes here)
- `frontend/src/index.css` — Tailwind `@theme inline` with custom tokens

**Patterns to follow:**
- Migration: `20260325000001_create_pm_tables.ts` using Knex `up`/`down`
- Route: `express.Router()` with `authenticateToken` + `superAdminMiddleware` per route
- Route mounting in `src/index.ts`: `app.use("/api/pm", pmRoutes)`
- Model: extend `BaseModel` with static `tableName` and `jsonFields`

**Key decisions already made:**
- All PM tables use `pm_` prefix in public schema (no separate schema)
- UUIDs as PKs with `gen_random_uuid()`
- Fixed 4-column kanban model seeded per project
- Projects tab = full-width, no sidebar (different from current admin layout)

## Constraints

**Must:**
- Follow existing Knex migration `.ts` format
- Use `authenticateToken` + `superAdminMiddleware` on all PM routes
- Keep PM routes under `/api/pm/*` namespace
- Add `updated_at` trigger function shared across `pm_` tables
- Frontend route under `/admin/pm/*` (consistent with admin namespace)

**Must not:**
- Create separate database or schema
- Add new auth system — reuse existing
- Modify existing admin routes or sidebar behavior
- Install dependencies not listed in the spec

**Out of scope:**
- CRUD logic (Phase 2)
- Dashboard UI (Phase 3)
- AI features (Phase 4-5)

## Risk

**Level:** 1

**Risks identified:**
- Migration on shared RDS — **Mitigation:** `pm_` prefix prevents collisions, CASCADE only on own tables
- AdminTopBar tab change affects all admin pages — **Mitigation:** conditional rendering, Projects tab only changes layout when active

## Tasks

### T1: Create `pm_` tables migration
**Do:** Create Knex migration with 5 tables: `pm_projects`, `pm_columns`, `pm_tasks`, `pm_activity_log`, `pm_daily_briefs`. Include all columns per the spec schema (Section 3). Add all indexes (Section 3.6). Create `updated_at` trigger function and apply to `pm_projects`, `pm_tasks`.
**Files:** `src/database/migrations/20260325000001_create_pm_tables.ts`
**Verify:** `npx knex migrate:latest --knexfile src/database/config.ts` succeeds. Confirm tables exist with `\dt pm_*` in psql.

Schema details:
- `pm_projects`: id (UUID PK default gen_random_uuid()), name (VARCHAR 255 NOT NULL), description (TEXT), color (VARCHAR 7 default '#D66853'), icon (VARCHAR 50 default 'folder'), deadline (TIMESTAMPTZ), status (VARCHAR 20 default 'active'), created_by (UUID), created_at (TIMESTAMPTZ default now()), updated_at (TIMESTAMPTZ default now())
- `pm_columns`: id (UUID PK), project_id (UUID FK → pm_projects ON DELETE CASCADE), name (VARCHAR 50 NOT NULL), position (INTEGER NOT NULL), is_hidden (BOOLEAN default false)
- `pm_tasks`: id (UUID PK), project_id (UUID FK → pm_projects ON DELETE CASCADE), column_id (UUID FK → pm_columns), title (VARCHAR 500 NOT NULL), description (TEXT), priority (VARCHAR 5 default 'P3'), deadline (TIMESTAMPTZ), position (INTEGER NOT NULL default 0), assigned_to (UUID), created_by (UUID), completed_at (TIMESTAMPTZ), source (VARCHAR 20 default 'manual'), created_at (TIMESTAMPTZ default now()), updated_at (TIMESTAMPTZ default now())
- `pm_activity_log`: id (UUID PK), project_id (UUID FK → pm_projects ON DELETE CASCADE), task_id (UUID), user_id (UUID), action (VARCHAR 50 NOT NULL), metadata (JSONB), created_at (TIMESTAMPTZ default now())
- `pm_daily_briefs`: id (UUID PK), brief_date (DATE UNIQUE NOT NULL), summary_html (TEXT), tasks_completed_yesterday (INTEGER), tasks_overdue (INTEGER), tasks_due_today (INTEGER), recommended_tasks (JSONB), generated_at (TIMESTAMPTZ)

Indexes:
- `pm_tasks(project_id, column_id, position)`
- `pm_tasks(assigned_to, deadline)`
- `pm_tasks(deadline) WHERE completed_at IS NULL` (partial)
- `pm_activity_log(project_id, created_at DESC)`
- `pm_daily_briefs(brief_date DESC)`

### T2: Create PM models
**Do:** Create 5 model files extending `BaseModel`: `PmProjectModel`, `PmColumnModel`, `PmTaskModel`, `PmActivityLogModel`, `PmDailyBriefModel`. Each defines `tableName` and `jsonFields`. `PmActivityLogModel` has `jsonFields = ['metadata']`. `PmDailyBriefModel` has `jsonFields = ['recommended_tasks']`.
**Files:** `src/models/PmProjectModel.ts`, `src/models/PmColumnModel.ts`, `src/models/PmTaskModel.ts`, `src/models/PmActivityLogModel.ts`, `src/models/PmDailyBriefModel.ts`
**Verify:** `npx tsc --noEmit` passes

### T3: Create Express router skeleton at `/api/pm/*`
**Do:** Create PM router index that mounts sub-routers. Create empty controller files with placeholder handlers that return `{ success: true, data: [] }`. Wire into `src/index.ts`.
**Files:**
- `src/routes/pm/index.ts` — mounts sub-routers: projects, tasks, aiSynth, brief, activity, stats
- `src/routes/pm/projects.ts` — GET `/`, POST `/`, GET `/:id`, PUT `/:id`, DELETE `/:id`, PUT `/:id/archive`
- `src/routes/pm/tasks.ts` — POST `/projects/:id/tasks`, PUT `/tasks/:id`, PUT `/tasks/:id/move`, PUT `/tasks/:id/assign`, DELETE `/tasks/:id`
- `src/routes/pm/aiSynth.ts` — POST `/ai-synth`, POST `/ai-synth/batch-create`
- `src/routes/pm/brief.ts` — GET `/daily-brief`, GET `/daily-brief/history`
- `src/routes/pm/activity.ts` — GET `/activity`, GET `/projects/:id/activity`
- `src/routes/pm/stats.ts` — GET `/stats`
- `src/controllers/pm/PmController.ts` — placeholder handlers
- `src/index.ts` — add `import pmRoutes from "./routes/pm"` and `app.use("/api/pm", pmRoutes)`
**Verify:** `curl http://localhost:3000/api/pm/projects` returns `{ success: true, data: [] }` (with valid auth token)

### T4: Add "Projects" tab to AdminTopBar + frontend routing
**Do:**
1. Modify `AdminTopBar.tsx` to add a tab bar below the existing nav. Two tabs: "Process" (links to `/admin/action-items`, activates on any non-`/admin/pm` route) and "Projects" (links to `/admin/pm`). Tab styling: underline active tab with alloro-orange, semibold text.
2. Create `frontend/src/pages/admin/ProjectsDashboard.tsx` — empty shell component with "Projects Dashboard" heading.
3. Create `frontend/src/pages/admin/ProjectBoard.tsx` — empty shell component with "Project Board" heading.
4. Add routes in `Admin.tsx`: `pm` → `ProjectsDashboard`, `pm/:projectId` → `ProjectBoard`
5. When "Projects" tab is active, the sidebar should be hidden and content area should be full-width. Modify `AdminLayout.tsx` to detect `/admin/pm` routes and conditionally hide sidebar + remove margin.
**Files:** `frontend/src/components/Admin/AdminTopBar.tsx`, `frontend/src/pages/admin/ProjectsDashboard.tsx`, `frontend/src/pages/admin/ProjectBoard.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/components/Admin/AdminLayout.tsx`
**Verify:** Manual: Navigate to `/admin/pm` — see full-width empty dashboard. Navigate to `/admin/action-items` — see normal layout with sidebar. Tab switching works.

### T5: Add PM color tokens to Tailwind
**Do:** Add PM-specific design tokens to `frontend/src/index.css` under `@theme inline`. Add both dark and light mode tokens per Section 4.2 and 4.3 of the spec. Use CSS custom properties that can be toggled by a `dark` class on `<html>`.
Tokens to add:
- `--pm-bg-primary`, `--pm-bg-secondary`, `--pm-bg-tertiary`, `--pm-bg-hover`
- `--pm-border-default`, `--pm-border-hover`
- `--pm-text-primary`, `--pm-text-secondary`, `--pm-text-muted`
- `--pm-accent-primary` (#D66853), `--pm-accent-hover`, `--pm-accent-subtle`
- `--pm-priority-p1` (#E74C3C), `--pm-priority-p2` (#F5A623), `--pm-priority-p3` (#4CAF50)
- `--pm-success`, `--pm-warning`, `--pm-danger`
**Files:** `frontend/src/index.css`
**Verify:** Manual: Inspect element shows CSS custom properties applied. Tailwind classes like `bg-[var(--pm-bg-primary)]` work.

### T6: Install dependencies
**Do:** Install in `frontend/`: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `date-fns`, `zustand`
**Files:** `frontend/package.json`
**Verify:** `cd frontend && npm install` succeeds, `npm ls @dnd-kit/core recharts date-fns zustand` shows installed

## Done
- [ ] `npx knex migrate:latest` succeeds — all 5 `pm_` tables created
- [ ] `npx tsc --noEmit` passes (backend + frontend)
- [ ] `/api/pm/projects` returns valid JSON with auth
- [ ] "Projects" tab visible in admin header, routes to `/admin/pm`
- [ ] PM color tokens present in CSS
- [ ] All new dependencies installed
