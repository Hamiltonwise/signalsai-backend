# ALLORO PROJECTS

**Internal Project Management Module**
**Instruction Document & Technical Specification**
Version 1.0 • March 2026

---

## Table of Contents

1. [Product Vision & Philosophy](#1-product-vision--philosophy)
2. [Architecture & Stack](#2-architecture--stack)
3. [Database Schema](#3-database-schema)
4. [Color System & Design Tokens](#4-color-system--design-tokens)
5. [UI/UX Specification](#5-uiux-specification)
6. [Feature Specification](#6-feature-specification)
7. [AI Synth Engine](#7-ai-synth-engine)
8. [Daily Brief Cron System](#8-daily-brief-cron-system)
9. [API Endpoints](#9-api-endpoints)
10. [Implementation Phases & Tasks](#10-implementation-phases--tasks)
11. [File Structure](#11-file-structure)

---

## 1. Product Vision & Philosophy

### 1.1 Why This Exists

Alloro Projects is born from frustration with existing PM tools. Every project management app on the market feels like it was designed by people who love complexity. Jira is a labyrinth. Asana is bloated. Monday.com is a spreadsheet wearing a costume. Linear is close but still feels like it was built for engineers, not humans.

We want a PM tool that feels like a breath of fresh air. Something you actually want to open. Something that makes work feel lighter, not heavier.

### 1.2 Core Design Principles

**Breathable.** Generous whitespace everywhere. No element should feel crowded. The UI should feel like a well-designed magazine, not a control panel.

**Gamified.** Completing tasks should feel satisfying. Micro-animations, progress indicators, and visual feedback make work feel rewarding. Confetti is not off the table.

**Intuitive.** Zero learning curve. If a new user can't figure out the interface in under 30 seconds, we've failed. Icons, spatial hierarchy, and obvious affordances do the heavy lifting.

**Beautiful.** This is a tool you're proud to have open on your screen. Warm color palette, smooth animations, considered typography. Every pixel matters.

**Fast.** Interactions must feel instant. Optimistic UI updates, skeleton loaders, and smart caching. No spinners blocking your flow.

### 1.3 Target Users

All authenticated Alloro admin users automatically have access. No roles, no permissions hierarchy — every user is an admin with full create/edit/delete capability. This is intentional for v1. Roles can be layered on later if needed.

---

## 2. Architecture & Stack

### 2.1 Integration Model

Alloro Projects is NOT a separate application. It is a new module within the existing Alloro admin app, accessible via a top-level header tab called "Projects" alongside the existing "Process" tab.

**Key architectural decisions:**

- Lives inside existing Alloro frontend (React 19 + Vite 7)
- Uses existing Alloro backend (Express 5.1)
- Same RDS Postgres instance, new `pm_` table prefix
- Same authentication system — no separate login
- Same EC2 deployment pipeline
- New `/api/pm/*` route namespace on backend
- New `/pm/*` route namespace on frontend (under admin shell)

### 2.2 Technology Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 with Vite 7 |
| Styling | Tailwind CSS 4 |
| Animations | Framer Motion 11+ |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Charts | Recharts with Framer Motion wrappers |
| Icons | Lucide React (consistent, clean line icons) |
| State Management | Zustand (lightweight, no boilerplate) |
| Backend | Express 5.1 (existing Alloro server) |
| Database | PostgreSQL on existing RDS (`pm_` schema) |
| Queue | BullMQ + Redis (existing ElastiCache) for daily cron |
| AI | Claude Sonnet API for AI Synth + Daily Brief |
| Date Handling | date-fns (readable relative formatting) |

---

## 3. Database Schema

All tables live under the `pm_` prefix in the existing Alloro Postgres database. No separate schema creation needed — just prefixed table names in the public schema.

### 3.1 pm_projects

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `gen_random_uuid()` |
| name | VARCHAR(255) | Project name, required |
| description | TEXT | Optional project description |
| color | VARCHAR(7) | Hex color for project card/avatar, default `#D66853` |
| icon | VARCHAR(50) | Lucide icon name, default `'folder'` |
| deadline | TIMESTAMPTZ | Explicit deadline. If NULL, auto-inherits latest task deadline |
| status | VARCHAR(20) | `active` \| `archived` \| `completed` |
| created_by | UUID FK | References alloro admin users table |
| created_at | TIMESTAMPTZ | `DEFAULT NOW()` |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger |

### 3.2 pm_columns

Fixed 4-column kanban model. Seeded per project on creation. Ordering via position integer.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `gen_random_uuid()` |
| project_id | UUID FK | References `pm_projects.id` ON DELETE CASCADE |
| name | VARCHAR(50) | `Backlog` \| `To Do` \| `In Progress` \| `Done` |
| position | INTEGER | 0, 1, 2, 3 for ordering |
| is_hidden | BOOLEAN | Default false. Backlog can be hidden per user pref |

### 3.3 pm_tasks

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `gen_random_uuid()` |
| project_id | UUID FK | References `pm_projects.id` ON DELETE CASCADE |
| column_id | UUID FK | References `pm_columns.id` |
| title | VARCHAR(500) | Task title, required |
| description | TEXT | Optional rich text description |
| priority | VARCHAR(5) | `P1` \| `P2` \| `P3`. Default `P3` |
| deadline | TIMESTAMPTZ | Task-level due date |
| position | INTEGER | Order within column (for drag-drop reorder) |
| assigned_to | UUID FK | References admin users. Nullable |
| created_by | UUID FK | References admin users |
| completed_at | TIMESTAMPTZ | Set when moved to Done column |
| source | VARCHAR(20) | `manual` \| `ai_synth`. Track how task was created |
| created_at | TIMESTAMPTZ | `DEFAULT NOW()` |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger |

### 3.4 pm_activity_log

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `gen_random_uuid()` |
| project_id | UUID FK | References `pm_projects.id` ON DELETE CASCADE |
| task_id | UUID FK | Nullable — some events are project-level |
| user_id | UUID FK | Who performed the action |
| action | VARCHAR(50) | `task_created` \| `task_moved` \| `task_completed` \| `task_updated` \| `task_deleted` \| `task_assigned` \| `project_created` \| `deadline_changed` |
| metadata | JSONB | Flexible payload: `{ from_column, to_column, old_value, new_value }` |
| created_at | TIMESTAMPTZ | `DEFAULT NOW()` |

### 3.5 pm_daily_briefs

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Default `gen_random_uuid()` |
| brief_date | DATE | The date this brief covers (UNIQUE) |
| summary_html | TEXT | AI-generated narrative HTML |
| tasks_completed_yesterday | INTEGER | Count snapshot |
| tasks_overdue | INTEGER | Count snapshot |
| tasks_due_today | INTEGER | Count snapshot |
| recommended_tasks | JSONB | Array of `{ task_id, reason }` AI picks |
| generated_at | TIMESTAMPTZ | When the cron produced this brief |

### 3.6 Indexes

- `pm_tasks(project_id, column_id, position)` — kanban board queries
- `pm_tasks(assigned_to, deadline)` — user task views + overdue queries
- `pm_tasks(deadline) WHERE completed_at IS NULL` — upcoming deadline queries
- `pm_activity_log(project_id, created_at DESC)` — activity feed
- `pm_daily_briefs(brief_date DESC)` — latest brief lookup

---

## 4. Color System & Design Tokens

### 4.1 Philosophy

The visual identity mirrors Claude's warm dark theme: a rich, warm charcoal background (not cold blue-blacks) with Alloro's signature orange as the primary accent. The feel should be cozy, inviting, and premium. Light mode retains the same orange-forward identity but with clean, airy whites.

### 4.2 Dark Mode (Primary)

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#1A1A1A` | Main background (warm near-black) |
| `--bg-secondary` | `#242424` | Cards, sidebar panels |
| `--bg-tertiary` | `#2E2E2E` | Elevated surfaces, modals |
| `--bg-hover` | `#353535` | Hover states on cards/rows |
| `--border-default` | `#3A3A3A` | Subtle dividers |
| `--border-hover` | `#4A4A4A` | Interactive element borders |
| `--text-primary` | `#FFFFFF` | Headlines, primary content |
| `--text-secondary` | `#A0A0A0` | Descriptions, metadata |
| `--text-muted` | `#6B6B6B` | Timestamps, placeholders |
| `--accent-primary` | `#D66853` | Alloro orange — buttons, links, active states |
| `--accent-hover` | `#E07A66` | Orange hover state |
| `--accent-subtle` | `rgba(214,104,83,0.12)` | Orange tinted backgrounds |
| `--priority-p1` | `#E74C3C` | Critical priority dot + badge |
| `--priority-p2` | `#F5A623` | Medium priority |
| `--priority-p3` | `#4CAF50` | Low priority |
| `--success` | `#4CAF50` | Completed states, positive feedback |
| `--warning` | `#F5A623` | Approaching deadlines |
| `--danger` | `#E74C3C` | Overdue, destructive actions |

### 4.3 Light Mode

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#FAFAFA` | Main background (warm off-white) |
| `--bg-secondary` | `#FFFFFF` | Cards |
| `--bg-tertiary` | `#F2F2F2` | Elevated surfaces |
| `--bg-hover` | `#F0EDED` | Hover states |
| `--border-default` | `#E5E5E5` | Dividers |
| `--text-primary` | `#1A1A1A` | Headlines |
| `--text-secondary` | `#6B6B6B` | Descriptions |
| `--accent-primary` | `#D66853` | Same orange. Never changes between modes. |
| `--accent-subtle` | `rgba(214,104,83,0.08)` | Orange tinted backgrounds (lighter) |

### 4.4 Typography

- Font family: Plus Jakarta Sans (existing Alloro identity), fallback to Inter, system sans-serif
- Dashboard title: 28px / 700 weight
- Section headers: 20px / 600 weight
- Card titles: 16px / 600 weight
- Body/descriptions: 14px / 400 weight
- Metadata/timestamps: 12px / 400 weight, text-muted color
- Line height: 1.5 globally, 1.3 for headings

### 4.5 Spacing System

All spacing uses a 4px base grid. Components use the following scale:

- `4px` — tight internal padding (between icon and label)
- `8px` — compact spacing (within card sections)
- `12px` — standard padding (card internal padding)
- `16px` — card gaps, section separators
- `24px` — section padding, major element gaps
- `32px` — page section gaps
- `48px` — major page sections

*Rule: when in doubt, add more space. The UI should feel spacious, never cramped.*

---

## 5. UI/UX Specification

### 5.1 Navigation Model

The existing Alloro admin header gains a new tab structure:

- **Process** — the existing admin (all current sidebar tabs)
- **Projects** — the new PM module (no sidebar, full-width content)

When "Projects" is selected, the left sidebar disappears entirely. The content area expands to full width. This gives maximum space for the kanban board and dashboard views.

### 5.2 Dashboard View (Projects Home)

The dashboard is the landing page when clicking "Projects." It serves as a command center, not just a project list. Layout from top to bottom:

**A) Daily Brief Card (top of page, full width)**

A prominent card showing the AI-generated daily brief. Contains: a friendly narrative greeting, count badges (completed yesterday, overdue, due today), and a "Recommended Focus" section listing 3–5 tasks the AI suggests working on next with reasons. The brief has a subtle pulsing dot indicator if it's fresh (generated today). Past briefs accessible via a "View history" link.

**B) Stats Row (3–4 animated metric cards)**

Horizontal row of stat cards with animated counters (Framer Motion number spring): Total Active Tasks, Tasks Due This Week, Completion Rate (animated ring chart), Overdue Count (red accent if > 0). Each card has an icon (Lucide) and subtle background gradient.

**C) Project Grid**

Cards in a responsive grid (3 columns on desktop, 2 on tablet, 1 on mobile). Each project card shows: project icon + color accent dot, project name, task progress bar (animated, e.g. "12/18 tasks done"), deadline indicator using readable format ("this week", "3 days", "today", "overdue"), member avatars (small stack), and recent activity snippet. Clicking a card opens the project kanban board.

**D) Activity Timeline (right column or below grid)**

A scrolling feed of recent activity across all projects: "Dave moved 'Fix hero section' to Done", "New task created via AI Synth", etc. Each entry has the user avatar, action text, timestamp in readable format, and project color dot.

**E) New Project Button**

Prominent floating action button (FAB) in bottom-right, Alloro orange, with a "+" icon. Opens a creation modal/slide-over.

### 5.3 Project Kanban View

When you click into a project from the dashboard, you enter the kanban board view.

**Header Bar:**

- Back arrow to dashboard
- Project name (editable inline on click)
- Project icon + color picker
- Deadline display (readable: "due this week") with click-to-edit
- Member avatars row
- AI Synth button (sparkle icon) — opens the AI input panel
- Focus Mode toggle (expand icon)
- More menu (…) — archive, delete project

**Kanban Board:**

Four columns: Backlog (hideable), To Do, In Progress, Done. Each column has: a header with column name + task count badge, an "Add task" button (+ icon) at top of column, and the task card stack.

**Task Cards:**

Each card displays: priority dot (P1 red, P2 amber, P3 green) in top-left, task title (16px, semibold), deadline in readable format with color coding (green = plenty of time, amber = this week, red = overdue), assigned user avatar (bottom-right), and a subtle drag handle icon on hover. Cards are draggable via @dnd-kit between columns and within columns for reordering.

**Task Detail Panel:**

Clicking a task card opens a slide-over panel from the right (Framer Motion slide + backdrop blur). Contains: editable title, description (rich text or markdown), priority selector (P1/P2/P3 pills), deadline picker, assignee dropdown, source badge ("Manual" or "AI Synth" with sparkle icon), activity history for this specific task, and delete button (with confirmation).

### 5.4 Focus Mode

Activated via the expand icon in the project header bar. Behavior: header collapses to a minimal top bar (just project name + exit button), any remaining chrome disappears, the kanban board fills the entire viewport, and a subtle ambient gradient animation plays on the background (very slow color shift between warm tones, almost subliminal). Exiting Focus Mode smoothly transitions everything back with Framer Motion layout animations.

### 5.5 Deadline Display Format

All dates are displayed in human-readable relative format using date-fns:

- **"overdue"** — past deadline, red text
- **"today"** — due today, amber text
- **"top of the hour"** — due within the current hour
- **"3 days"** — due within 3 days, amber text
- **"this week"** — due within the current week, green text
- **"2 weeks"** — further out, muted text
- Hover tooltip always shows the exact date/time

### 5.6 Animations & Micro-Interactions

All animations use Framer Motion. Key interactions:

- **Card drag:** smooth shadow elevation + slight scale on pickup (1.02x)
- **Card drop:** spring animation to final position (stiffness: 300, damping: 25)
- **Column task count:** animated number transition on add/remove
- **Progress bars:** animated width transition (0.4s ease-out)
- **Stat counters on dashboard:** spring-based number animation on mount
- **Task completion:** checkmark animation + card briefly pulses green
- **New task creation:** card slides in from top with fade
- **Delete:** card shrinks + fades out, remaining cards reflow smoothly
- **Charts:** Recharts with custom animated entry (stagger per data point)
- **Page transitions:** shared layout animation between dashboard and kanban view
- **Focus Mode enter/exit:** layout animation (300ms ease-in-out)
- **Command palette (Cmd+K):** scale + fade from center

### 5.7 Command Palette (Cmd+K)

Global keyboard shortcut opens a centered search/action modal (like Linear, Raycast, or Spotlight). Actions available: create new task (in any project), create new project, search tasks by title, jump to any project, and toggle Focus Mode. Results filter as you type with fuzzy matching. This is the power-user fast path for everything.

---

## 6. Feature Specification

### 6.1 Project Management

**Create Project:**

- Modal with fields: name (required), description, color (preset palette or custom hex), icon (Lucide icon picker grid), deadline (optional date picker)
- On creation, auto-seeds 4 columns: Backlog (position 0), To Do (1), In Progress (2), Done (3)
- Logs `pm_activity_log` entry: `project_created`

**Edit Project:**

- Inline-edit project name by clicking on it in kanban header
- Full edit via More (…) menu > Edit Project
- All fields are mutable

**Delete Project:**

- Requires confirmation modal ("Delete [project name]? This will delete all tasks.")
- CASCADE deletes all columns, tasks, and activity log entries

**Archive Project:**

- Sets status to `'archived'`, hides from dashboard grid
- Accessible via "Archived" filter toggle on dashboard

### 6.2 Task Management

**Create Task:**

- Quick-add: click "+" at top of any column, type title, press Enter. Creates with defaults (P3, no deadline, unassigned)
- Full-add: Cmd+K > "New task" > full form with all fields
- Position: new tasks are inserted at position 0 (top of column)
- Source: `'manual'` for hand-created tasks

**Edit Task:**

- Click card > slide-over panel with all editable fields
- Inline title edit: double-click title on card directly
- All changes log to `pm_activity_log` with old/new values in metadata

**Move Task (Drag & Drop):**

- @dnd-kit handles: cross-column move, within-column reorder
- Optimistic UI: card moves immediately, API call fires in background
- On move to Done: auto-sets `completed_at` timestamp
- On move out of Done: clears `completed_at`
- All moves logged to activity log with `from_column`/`to_column`

**Assign Task:**

- Dropdown in task detail panel showing all admin users
- Shows user avatar + display name
- Assignment logged to activity log

**Delete Task:**

- Available in task detail panel, requires confirmation
- Logs `task_deleted` event before hard delete

### 6.3 Project Deadline Inheritance

Project deadlines follow this logic:

1. If a project has an explicitly set deadline, use that deadline
2. If no explicit deadline is set, the project's displayed deadline auto-inherits the latest (furthest-out) task deadline within that project
3. If no tasks have deadlines either, the project shows "No deadline" in muted text

This is a display-only calculation — not stored. Computed at query time via a subquery or in the frontend from the task data already loaded.

---

## 7. AI Synth Engine

### 7.1 Overview

AI Synth allows users to paste or upload raw text (emails, meeting notes, Slack threads, documents) and have it automatically converted into structured, actionable tasks. This is the signature differentiator of Alloro Projects.

### 7.2 Input Methods

- **Paste text:** large textarea in the AI Synth panel
- **Upload file:** `.txt`, `.pdf`, `.docx`, `.eml` file upload (drag-and-drop supported)
- The input area shows a placeholder: "Paste an email, meeting notes, or any document…" with a sparkle icon

### 7.3 Processing Pipeline

1. User pastes/uploads content in the AI Synth panel
2. Frontend sends raw text to `POST /api/pm/ai-synth`
3. Backend calls Claude Sonnet API with structured extraction prompt
4. Claude returns JSON array of proposed tasks
5. Frontend displays proposed tasks in a review interface
6. User can: edit titles, adjust priorities, change deadlines, remove tasks, reassign
7. User clicks "Create Tasks" to confirm
8. Tasks are batch-inserted into the selected column (default: To Do)
9. All created tasks have `source: 'ai_synth'` and show a sparkle badge

### 7.4 Claude API Prompt Design

System prompt for the AI Synth extraction:

> You are a task extraction assistant for a project management tool. Analyze the provided text and extract actionable tasks. For each task, provide: a clear, concise title (verb-first: "Review proposal" not "Proposal review"), a brief description if context is needed, priority (P1 = blocking/urgent, P2 = important/this week, P3 = nice to have), and a deadline hint if mentioned or inferable from context. Respond ONLY with a JSON array. No markdown, no preamble.

Expected response schema:

```json
[
  {
    "title": "string",
    "description": "string | null",
    "priority": "P1 | P2 | P3",
    "deadline_hint": "string | null"
  }
]
```

### 7.5 Review Interface

After Claude returns proposed tasks, they appear in a review card list within the AI Synth panel. Each proposed task card shows: editable title, priority pill (clickable to cycle P1/P2/P3), deadline (editable, pre-populated from hint), checkbox to include/exclude, and an "Add to" column selector (default: To Do). A "Create X Tasks" button at the bottom creates all checked tasks in a single batch API call.

---

## 8. Daily Brief Cron System

### 8.1 Architecture

A BullMQ recurring job runs daily at **6:00 AM PHT** (22:00 UTC previous day) on the existing Alloro Redis/ElastiCache infrastructure.

### 8.2 Cron Job Pipeline

1. BullMQ triggers the `daily-brief` job at 22:00 UTC
2. Job queries: tasks completed yesterday, tasks currently overdue, tasks due today, tasks due this week, all active tasks with priorities and deadlines
3. Assembled data payload sent to Claude Sonnet API
4. Claude generates a narrative brief + recommends 3–5 focus tasks with reasoning
5. Response stored in `pm_daily_briefs` table
6. Dashboard reads the latest brief on load

### 8.3 Claude Prompt for Daily Brief

System prompt:

> You are a friendly, concise project manager assistant. Based on the task data provided, generate a morning brief. Include: a warm 1-sentence greeting, a summary of what was accomplished yesterday, highlight any overdue items that need attention, recommend 3–5 tasks to focus on today (with brief reasoning for each), and note any approaching deadlines this week. Keep the tone professional but human — like a helpful colleague, not a robot. Output JSON: `{ greeting, yesterday_summary, overdue_alert, recommended_focus: [{ task_id, title, reason }], upcoming_deadlines }`.

### 8.4 Dashboard Display

The daily brief card at the top of the dashboard renders the AI output in a warm, readable format. The greeting is slightly larger text (18px). Stats are shown as inline badges. Recommended tasks are clickable — clicking one navigates to that task's project kanban with the task detail panel pre-opened. If no brief exists for today (cron hasn't run yet or it's a fresh install), show a placeholder: "Your daily brief will appear here tomorrow morning."

---

## 9. API Endpoints

All endpoints are prefixed with `/api/pm` and use the existing Alloro auth middleware. Standard Alloro response shape: `{ success, data, error: { code, message, details } }`.

### 9.1 Projects

| Method | Path | Description |
|---|---|---|
| **GET** | `/projects` | List all projects with task count summaries and computed deadlines |
| **POST** | `/projects` | Create project (auto-seeds 4 columns) |
| **GET** | `/projects/:id` | Get project with columns and tasks |
| **PUT** | `/projects/:id` | Update project fields |
| **DELETE** | `/projects/:id` | Delete project (CASCADE) |
| **PUT** | `/projects/:id/archive` | Toggle archive status |

### 9.2 Tasks

| Method | Path | Description |
|---|---|---|
| **POST** | `/projects/:id/tasks` | Create task in specified column |
| **PUT** | `/tasks/:id` | Update task fields |
| **PUT** | `/tasks/:id/move` | Move task to column + position (drag-drop) |
| **PUT** | `/tasks/:id/assign` | Assign task to user |
| **DELETE** | `/tasks/:id` | Delete task |

### 9.3 AI Synth & Brief

| Method | Path | Description |
|---|---|---|
| **POST** | `/ai-synth` | Send raw text, returns proposed tasks JSON |
| **POST** | `/ai-synth/batch-create` | Confirm and create reviewed tasks in batch |
| **GET** | `/daily-brief` | Get latest daily brief (or 404 if none today) |
| **GET** | `/daily-brief/history` | List past briefs with pagination |

### 9.4 Activity & Users

| Method | Path | Description |
|---|---|---|
| **GET** | `/activity` | Global activity feed (paginated, all projects) |
| **GET** | `/projects/:id/activity` | Project-specific activity feed |
| **GET** | `/users` | List admin users (for assignment dropdowns) |
| **GET** | `/stats` | Dashboard stats (totals, this week, completion rate) |

---

## 10. Implementation Phases & Tasks

Implementation is split into 6 phases. Each phase is independently shippable and testable. Total estimated effort: **5–7 working days** for a solo developer.

### Phase 1: Foundation (Day 1)

**Goal:** Database schema, API skeleton, and route shell in the frontend.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 1.1 | Create `pm_` tables migration (projects, columns, tasks, activity_log, daily_briefs) | 45m | `migrations/` |
| 1.2 | Add indexes on all specified columns | 15m | `migrations/` |
| 1.3 | Create `updated_at` trigger function for `pm_` tables | 15m | `migrations/` |
| 1.4 | Build Express router skeleton: `/api/pm/*` with auth middleware | 30m | `routes/pm/` |
| 1.5 | Add "Projects" tab to admin header navigation | 30m | `AdminHeader.jsx` |
| 1.6 | Create `/pm` route shell with empty dashboard component | 20m | `pages/pm/` |
| 1.7 | Set up Tailwind CSS variables for PM color tokens (dark + light) | 30m | `tailwind config` |
| 1.8 | Install dependencies: @dnd-kit, recharts, date-fns, zustand | 10m | `package.json` |

### Phase 2: Core CRUD & Kanban (Day 2–3)

**Goal:** Full project + task CRUD, kanban board with drag-and-drop.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 2.1 | Build Project CRUD API endpoints (list, create, get, update, delete, archive) | 2h | `routes/pm/projects.js` |
| 2.2 | Build Task CRUD API endpoints (create, update, move, assign, delete) | 2h | `routes/pm/tasks.js` |
| 2.3 | Build activity logging middleware (auto-log all task/project mutations) | 1h | `middleware/pmActivity.js` |
| 2.4 | Build Zustand store for PM state (projects, tasks, active project) | 1h | `stores/pmStore.js` |
| 2.5 | Build KanbanBoard component with 4 columns | 2h | `components/pm/KanbanBoard.jsx` |
| 2.6 | Build TaskCard component with priority dot, deadline, avatar | 1h | `components/pm/TaskCard.jsx` |
| 2.7 | Integrate @dnd-kit for cross-column drag + within-column reorder | 2h | `KanbanBoard.jsx` |
| 2.8 | Build TaskDetailPanel slide-over (edit all fields) | 2h | `components/pm/TaskDetailPanel.jsx` |
| 2.9 | Build CreateProjectModal with icon picker + color picker | 1.5h | `components/pm/CreateProjectModal.jsx` |
| 2.10 | Build quick-add task input at top of each column | 45m | `components/pm/QuickAddTask.jsx` |
| 2.11 | Wire optimistic UI updates for drag-drop moves | 1h | `stores/pmStore.js` |

### Phase 3: Dashboard & UI Polish (Day 3–4)

**Goal:** Complete dashboard with animated stats, project grid, activity feed.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 3.1 | Build `/api/pm/stats` endpoint (aggregate counts, completion rate) | 1h | `routes/pm/stats.js` |
| 3.2 | Build `/api/pm/activity` endpoint (global feed, paginated) | 45m | `routes/pm/activity.js` |
| 3.3 | Build DailyBriefCard component (placeholder until Phase 5) | 1h | `components/pm/DailyBriefCard.jsx` |
| 3.4 | Build StatsRow with 4 animated metric cards (Framer spring counters) | 2h | `components/pm/StatsRow.jsx` |
| 3.5 | Build ProjectGrid with responsive card layout (3/2/1 col) | 2h | `components/pm/ProjectGrid.jsx` |
| 3.6 | Build ProjectCard with progress bar, deadline, avatars | 1.5h | `components/pm/ProjectCard.jsx` |
| 3.7 | Build ActivityTimeline scrolling feed component | 1.5h | `components/pm/ActivityTimeline.jsx` |
| 3.8 | Implement readable deadline formatting utility (date-fns) | 30m | `utils/dateFormat.js` |
| 3.9 | Add all Framer Motion animations (card enter/exit, page transitions) | 2h | Various components |
| 3.10 | Build dark/light mode toggle using Tailwind `dark:` class strategy | 1h | `ThemeProvider` + config |

### Phase 4: AI Synth Engine (Day 4–5)

**Goal:** Full AI task extraction pipeline with review interface.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 4.1 | Build `POST /api/pm/ai-synth` endpoint with Claude Sonnet integration | 2h | `routes/pm/aiSynth.js` |
| 4.2 | Build file upload handling (txt, pdf, docx, eml) with text extraction | 2h | `utils/fileExtract.js` |
| 4.3 | Build `POST /api/pm/ai-synth/batch-create` for confirmed task creation | 1h | `routes/pm/aiSynth.js` |
| 4.4 | Build AISynthPanel slide-over component (textarea + file drop zone) | 2h | `components/pm/AISynthPanel.jsx` |
| 4.5 | Build ProposedTaskList review interface (edit, toggle, priority cycle) | 2h | `components/pm/ProposedTaskList.jsx` |
| 4.6 | Add sparkle badge/icon to AI-created tasks throughout the UI | 30m | `TaskCard.jsx` |
| 4.7 | Add loading state with skeleton animation during Claude API call | 30m | `AISynthPanel.jsx` |
| 4.8 | Error handling: rate limits, malformed responses, retry logic | 1h | `routes/pm/aiSynth.js` |

### Phase 5: Daily Brief Cron (Day 5–6)

**Goal:** Automated daily brief generation and dashboard integration.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 5.1 | Create BullMQ recurring job: `daily-brief` at 22:00 UTC (6 AM PHT) | 1h | `jobs/dailyBrief.js` |
| 5.2 | Build task data aggregation query for brief context | 1h | `queries/briefData.js` |
| 5.3 | Build Claude Sonnet prompt for narrative brief generation | 1h | `prompts/dailyBrief.js` |
| 5.4 | Store generated brief in `pm_daily_briefs` table | 30m | `jobs/dailyBrief.js` |
| 5.5 | Build `GET /api/pm/daily-brief` endpoint | 30m | `routes/pm/brief.js` |
| 5.6 | Connect DailyBriefCard to real data (replace placeholder) | 1h | `DailyBriefCard.jsx` |
| 5.7 | Add clickable recommended tasks (navigate to project + open task) | 1h | `DailyBriefCard.jsx` |
| 5.8 | Build brief history view (past briefs, paginated) | 1h | `pages/pm/BriefHistory.jsx` |

### Phase 6: Power Features & Polish (Day 6–7)

**Goal:** Command palette, Focus Mode, animated charts, final QA.

| # | Task | Est. | File(s) |
|---|---|---|---|
| 6.1 | Build CommandPalette component (Cmd+K) with fuzzy search | 3h | `components/pm/CommandPalette.jsx` |
| 6.2 | Build Focus Mode (sidebar collapse, full-viewport kanban, ambient gradient) | 2h | `KanbanBoard.jsx` + CSS |
| 6.3 | Build animated Recharts: tasks-over-time line chart for dashboard | 2h | `components/pm/Charts.jsx` |
| 6.4 | Build animated completion ring chart for stat card | 1h | `components/pm/CompletionRing.jsx` |
| 6.5 | Add task completion confetti/celebration micro-animation | 1h | `TaskCard.jsx` |
| 6.6 | Add skeleton loaders for all async data loads | 1h | `components/pm/Skeletons.jsx` |
| 6.7 | Responsive testing and mobile breakpoint fixes | 2h | Various |
| 6.8 | Dark mode / light mode comprehensive QA pass | 1h | Various |
| 6.9 | Error boundary and empty state designs for all views | 1h | Various |
| 6.10 | Performance audit: memoization, virtualization for large boards | 1h | Various |

---

## 11. File Structure

### 11.1 Backend (Express)

```
signalsai-backend/
├── src/
│   ├── routes/pm/
│   │   ├── index.js              — PM router mount point
│   │   ├── projects.js           — Project CRUD endpoints
│   │   ├── tasks.js              — Task CRUD + move + assign endpoints
│   │   ├── aiSynth.js            — AI Synth extraction + batch create
│   │   ├── brief.js              — Daily brief read endpoints
│   │   ├── activity.js           — Activity feed endpoints
│   │   └── stats.js              — Dashboard aggregate stats
│   ├── middleware/
│   │   └── pmActivity.js         — Auto-logging middleware
│   ├── jobs/
│   │   └── dailyBrief.js         — BullMQ cron job definition
│   ├── queries/
│   │   └── briefData.js          — Data aggregation queries for AI brief
│   ├── prompts/
│   │   ├── dailyBrief.js         — Claude prompt template
│   │   └── aiSynth.js            — Claude prompt template for task extraction
│   └── utils/
│       └── fileExtract.js        — File-to-text extraction (pdf, docx, eml, txt)
└── migrations/
    └── xxxx_create_pm_tables.sql — Schema migration
```

### 11.2 Frontend (React + Vite)

```
signalsai/
└── src/
    ├── pages/pm/
    │   ├── Dashboard.jsx          — Projects home / command center
    │   ├── ProjectBoard.jsx       — Kanban board view for single project
    │   └── BriefHistory.jsx       — Past daily briefs
    ├── components/pm/
    │   ├── KanbanBoard.jsx        — 4-column board + @dnd-kit
    │   ├── KanbanColumn.jsx       — Single column with droppable zone
    │   ├── TaskCard.jsx           — Draggable task card
    │   ├── TaskDetailPanel.jsx    — Slide-over task editor
    │   ├── CreateProjectModal.jsx — New project form
    │   ├── QuickAddTask.jsx       — Inline task creation
    │   ├── DailyBriefCard.jsx     — AI brief display
    │   ├── StatsRow.jsx           — Animated metric cards
    │   ├── ProjectGrid.jsx        — Dashboard project cards
    │   ├── ProjectCard.jsx        — Individual project card
    │   ├── ActivityTimeline.jsx   — Activity feed
    │   ├── AISynthPanel.jsx       — AI input + review
    │   ├── ProposedTaskList.jsx   — AI task review cards
    │   ├── CommandPalette.jsx     — Cmd+K modal
    │   ├── Charts.jsx             — Recharts wrappers
    │   ├── CompletionRing.jsx     — Animated ring chart
    │   ├── Skeletons.jsx          — Loading skeleton components
    │   └── FocusMode.jsx          — Focus mode wrapper
    ├── stores/
    │   └── pmStore.js             — Zustand store
    ├── utils/
    │   └── dateFormat.js          — Readable deadline formatter
    └── hooks/
        └── usePmApi.js            — API call hooks with error handling
```

---

*End of Document*
