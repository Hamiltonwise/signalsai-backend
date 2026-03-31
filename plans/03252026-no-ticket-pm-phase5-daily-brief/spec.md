# PM Phase 5: Daily Brief Cron System

## Why
The daily brief is the AI-powered morning summary that makes Alloro Projects feel alive. It generates overnight and greets users with a narrative briefing, overdue alerts, and recommended focus tasks.

## What
- BullMQ recurring job at 22:00 UTC (6:00 AM PHT)
- Task data aggregation query for brief context
- Claude Sonnet prompt for narrative brief generation
- Store brief in `pm_daily_briefs` table
- `GET /api/pm/daily-brief` + `/history` endpoints
- Connect DailyBriefCard to real data
- Clickable recommended tasks (navigate to project + task)
- Brief history page

**Depends on:** Phase 1 (database), Phase 2 (task data), Phase 3 (DailyBriefCard placeholder)

## Context

**Relevant files:**
- `src/workers/queues.ts` — existing BullMQ queue factory using IORedis. Pattern: `getMindsQueue(name)` creates queue with Redis connection.
- `src/workers/worker.ts` — worker process that registers processors. Add PM daily brief processor here.
- `src/workers/processors/` — existing processor files (reference pattern)
- `src/agents/service.llm-runner.ts` — `runAgent()` for Claude calls
- `src/models/PmDailyBriefModel.ts` — model from Phase 1
- `src/models/PmTaskModel.ts` — for aggregation queries
- `frontend/src/components/pm/DailyBriefCard.tsx` — placeholder from Phase 3

**Patterns to follow:**
- Queue: use `getMindsQueue()` factory or create `getPmQueue()` following same pattern
- Worker processor: dedicated file in `src/workers/processors/`
- Prompt: `.md` file in `src/agents/pmAgents/`

## Constraints

**Must:**
- Use existing BullMQ + Redis infrastructure (ElastiCache)
- Run at 22:00 UTC daily (6:00 AM PHT)
- Use existing `runAgent()` for Claude call
- Store brief in `pm_daily_briefs` with `brief_date` as unique key (one brief per day)
- Handle case where no tasks exist (generate a "nothing to report" brief)
- Brief history endpoint paginated (10 per page)

**Must not:**
- Create a new Redis connection — reuse existing
- Run the cron in the main Express process — it runs in the worker process
- Store user-specific briefs — one brief for the whole team per day

**Out of scope:**
- Per-user brief customization
- Slack/email delivery of briefs

## Risk

**Level:** 1

**Risks identified:**
- Cron fails silently → **Mitigation:** log errors to console/Sentry, store failed attempts with error flag
- No tasks in system → **Mitigation:** handle gracefully with a "no activity" brief

## Tasks

### T1: Create Daily Brief prompt file
**Do:** Create `src/agents/pmAgents/DailyBrief.md` with system prompt from Section 8.3:
```
You are a friendly, concise project manager assistant. Based on the task data provided, generate a morning brief. Include: a warm 1-sentence greeting, a summary of what was accomplished yesterday, highlight any overdue items that need attention, recommend 3-5 tasks to focus on today (with brief reasoning for each), and note any approaching deadlines this week. Keep the tone professional but human — like a helpful colleague, not a robot. Output JSON: { greeting, yesterday_summary, overdue_alert, recommended_focus: [{ task_id, title, reason }], upcoming_deadlines }.
```
**Files:** `src/agents/pmAgents/DailyBrief.md`
**Verify:** Loadable via `loadPrompt("pmAgents/DailyBrief")`

### T2: Build task data aggregation query
**Do:** Create `src/controllers/pm/pmBriefDataQuery.ts`. Function `aggregateBriefData()` returns:
```typescript
{
  tasks_completed_yesterday: PmTask[]  // completed_at between yesterday 00:00 and today 00:00
  tasks_overdue: PmTask[]              // deadline < now() AND completed_at IS NULL
  tasks_due_today: PmTask[]            // deadline between today 00:00 and tomorrow 00:00 AND completed_at IS NULL
  tasks_due_this_week: PmTask[]        // deadline between now() and end of week AND completed_at IS NULL
  all_active_tasks: PmTask[]           // completed_at IS NULL, with project name joined
}
```
Each task includes: id, title, priority, deadline, project_id, project_name (joined), assigned_to.
Single efficient query with CASE/conditional or multiple small queries. Use Knex query builder.
**Files:** `src/controllers/pm/pmBriefDataQuery.ts`
**Verify:** Call function, verify counts match manual DB check

### T3: Build BullMQ recurring job + processor
**Do:**
1. Create `src/workers/processors/pmDailyBrief.ts` — processor function:
   - Calls `aggregateBriefData()`
   - Formats data as user message for Claude
   - Calls `runAgent()` with DailyBrief prompt
   - Parses response JSON
   - Stores in `pm_daily_briefs`: brief_date, summary_html (render greeting + summaries as simple HTML), tasks_completed_yesterday (count), tasks_overdue (count), tasks_due_today (count), recommended_tasks (JSON array from Claude), generated_at
   - If brief for today already exists, skip (idempotent)
2. Register in `src/workers/worker.ts` — add PM queue worker
3. Create job scheduling: use BullMQ `Queue.upsertJobScheduler()` or `add()` with repeat config for daily at 22:00 UTC
**Files:** `src/workers/processors/pmDailyBrief.ts`, `src/workers/worker.ts`, `src/workers/queues.ts`
**Verify:** Manually trigger job → brief appears in `pm_daily_briefs` table

### T4: Build brief API endpoints
**Do:**
- `GET /api/pm/daily-brief` — returns latest brief (today or most recent). If none exists, return `{ success: true, data: null }`.
- `GET /api/pm/daily-brief/history` — paginated list of past briefs (limit/offset, default 10). Returns `{ data: [...briefs], total: N }`.
**Files:** `src/controllers/pm/PmBriefController.ts`, `src/routes/pm/brief.ts`
**Verify:** `curl /api/pm/daily-brief` returns latest brief after manual trigger

### T5: Connect DailyBriefCard to real data
**Do:** Update `DailyBriefCard.tsx` to fetch from `/api/pm/daily-brief`. Display:
- Greeting text (18px, slightly larger)
- Yesterday summary
- Overdue alert (red accent if any)
- Count badges: completed yesterday, overdue, due today
- "Recommended Focus" section: 3-5 task cards with title + reason
- Pulsing green dot if brief was generated today
- If no brief: keep placeholder text "Your daily brief will appear here tomorrow morning."
- "View history" link at bottom
**Files:** `frontend/src/components/pm/DailyBriefCard.tsx`
**Verify:** Manual: brief card shows real data after triggering cron job

### T6: Add clickable recommended tasks
**Do:** In DailyBriefCard, each recommended task is clickable. Clicking navigates to `/admin/pm/:projectId` and auto-opens the TaskDetailPanel for that task. Pass `?taskId=xxx` query param; ProjectBoard reads it on mount and opens the panel.
**Files:** `frontend/src/components/pm/DailyBriefCard.tsx`, `frontend/src/pages/admin/ProjectBoard.tsx`
**Verify:** Manual: click recommended task → navigate to project → task detail panel opens

### T7: Build BriefHistory page
**Do:** Create `frontend/src/pages/admin/BriefHistory.tsx`. Lists past briefs in a vertical timeline layout. Each entry: date, greeting snippet, stats badges (completed, overdue, due today). Click to expand full brief content. Pagination: "Load more" button. Add route in `Admin.tsx`: `/admin/pm/briefs` → BriefHistory.
**Files:** `frontend/src/pages/admin/BriefHistory.tsx`, update `frontend/src/pages/Admin.tsx`
**Verify:** Manual: navigate to brief history → see past briefs → expand one → full content shown

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] BullMQ job registered and schedulable
- [ ] Manual trigger produces brief in database
- [ ] `GET /api/pm/daily-brief` returns brief data
- [ ] DailyBriefCard shows real AI-generated content
- [ ] Recommended tasks are clickable and navigate to correct project/task
- [ ] Brief history page shows past briefs with pagination
