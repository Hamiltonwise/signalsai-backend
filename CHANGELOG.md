# Alloro App Changelog

All notable changes to Alloro App are documented here.

## [0.0.15] - April 2026

### Identifier Migrated to SDK; Copy Companion, Guardian, Governance Disabled

Phase 2 of the n8n exit. The Identifier agent — the last n8n dependency inside the practice ranking pipeline — now calls Claude directly through the existing `runAgent` + `loadPrompt` plumbing. Three other n8n-backed agents (Copy Companion, Guardian, Governance) are reversibly disabled because we may want to restore them later: routes are commented out in `agentsV2.ts`, the "Run Guardian & Governance" button is removed from the admin AI Data Insights page, and all code stays in place behind `DISABLED 2026-04-12` markers.

**Key Changes:**

*Identifier agent off n8n*
- New prompt at `src/agents/rankingAgents/Identifier.md` — first file in a new prompt subdirectory parallel to `dailyAgents`, `monthlyAgents`, `pmAgents`, `pmsAgents`, `websiteAgents`. Holds the system prompt for the practice specialty / market location extractor.
- `identifyLocationMeta()` in `service.webhook-orchestrator.ts` no longer calls `IDENTIFIER_AGENT_WEBHOOK` via axios. It loads the prompt and calls `runAgent` directly. Same function signature, same `{specialty, marketLocation}` return shape — no consumer changes needed in `service.ranking-executor.ts` or `service.places-competitor-discovery.ts`.
- Fallback path is preserved: `getFallbackMeta(gbpData)` still runs on SDK error or unparseable output, returning hardcoded `"orthodontist"` plus city/state extracted from the GBP storefront address.
- The new prompt also produces `specialtyKeywords[]`, `city`, `state`, `county`, and `postalCode`. Path A migration: these new fields are ignored for now to keep the migration parity-only; wiring them into competitor discovery and geographic filtering is a separate follow-up.
- The `IDENTIFIER_AGENT_WEBHOOK` env var constant stays exported at module level so the code path is restorable if we ever want the n8n route back.

*Copy Companion, Guardian, Governance disabled (reversible)*
- `POST /api/agents/gbp-optimizer-run` and `POST /api/agents/guardian-governance-agents-run` route registrations commented out in `agentsV2.ts` with a dated `DISABLED` marker. JSDoc endpoint list updated to flag both routes as disabled. Controllers and downstream services (`runGbpOptimizer`, `runGuardianGovernance`, `service.governance-validator.ts`, etc.) are untouched and remain exported.
- The `COPY_COMPANION_AGENT_WEBHOOK`, `GUARDIAN_AGENT_WEBHOOK`, and `GOVERNANCE_AGENT_WEBHOOK` env var constants stay exported for restoration.
- Admin AI Data Insights page (`AIDataInsightsList.tsx`): "Run Guardian & Governance" `ActionButton`, the `handleRunAgents` handler, and the `renderProgressBar` helper are commented out with the same `DISABLED` marker. Both `<AnimatePresence>{renderProgressBar()}</AnimatePresence>` JSX call sites are commented in place. The empty-state copy is rewritten to neutral text — `"No agent insights available for this month yet."` — so users aren't told to click a button that no longer exists.
- `setIsRunning` is dropped from the destructure because nothing references the setter anymore (only the getter `isRunning` is still read, by the Clear button). Restoration requires uncommenting `handleRunAgents` and adding `setIsRunning` back to the destructure.
- Two now-unused imports trimmed to keep the build clean: `Play` from `lucide-react` and `AnimatePresence` from `framer-motion`. Both are referenced only inside the commented-out JSX and need re-importing on restore.

*Goal achieved*
- After this entry, every performing agent (Proofline, Summary, Opportunity, CRO, Referral Engine, Practice Ranking, Identifier) runs through the in-repo `runAgent` Claude SDK pipeline. No performing agent depends on n8n. The three disabled agents are inactive and can be restored — or fully retired in a future cleanup pass — without rushing.

**Commits:**
- `src/routes/agentsV2.ts` — comment out `gbp-optimizer-run` and `guardian-governance-agents-run` route registrations with `DISABLED` marker; mark both endpoints disabled in the JSDoc endpoint list
- `src/controllers/agents/feature-services/service.webhook-orchestrator.ts` — replace the `identifyLocationMeta()` axios webhook call with `runAgent` + `loadPrompt("rankingAgents/Identifier")`; preserve the fallback path; add a note about the ignored new prompt fields. Webhook constants stay exported.
- `src/agents/rankingAgents/Identifier.md` — new prompt file in a new prompt subdirectory. System prompt for the dental specialty / market location extractor; produces `specialty`, `marketLocation`, `specialtyKeywords[]`, and `city` / `state` / `county` / `postalCode`.
- `frontend/src/pages/admin/AIDataInsightsList.tsx` — comment out the Guardian & Governance run button, the `handleRunAgents` handler, the `renderProgressBar` helper, and both `AnimatePresence` call sites. Drop `setIsRunning` from the destructure. Replace empty-state copy with neutral text. Trim `Play` and `AnimatePresence` imports.
- `plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md` — new plan folder with the spec for this work.

## [0.0.14] - April 2026

### PM Backlog Move, Multi-Select, Cross-Project AI Synth

Three composed features land together because they share the same backbone — a hardened `is_backlog` column flag and a new set of bulk / cross-project task operations. Backlog items can now be reassigned to another project without losing context. A floating multi-action bar (reusing the Action Items Hub pattern) lands on both the project board and the Me tab, with a right-click context menu on every card. A new top-level "Cross-project AI Synth" extracts tasks from raw text or files and routes each proposed task to its best-fit project before approval.

**Key Changes:**

*Move backlog tasks between projects*
- New endpoint `POST /api/pm/tasks/bulk/move-to-project` accepts `{ task_ids, target_project_id }`; the single-task right-click path calls the same endpoint with a one-element array so there is one code path to maintain
- Hard-gated to backlog-only: server rejects with `400 + offending_task_ids` metadata if any source task's column is not `is_backlog = true`. The UI also disables the bulk bar and context menu item with an explanatory tooltip, so the rule is enforced at both layers
- Tasks are appended to the end of the destination project's Backlog; source columns are compacted in the same transaction so positions stay contiguous
- One `pm_activity_log` row per moved task, logged under the **destination** project with `action: "task_moved_to_project"` and `metadata: { from_project_id, from_column_id, to_column_id, title }`

*Multi-select with floating action bar*
- New `pmStore` state: `selectedTaskIds: Set<string>` scoped to `activeProject`, plus a separate `meSelectedTaskIds` for the Me tab (tasks span projects there, so the Sets can't be shared)
- Selection auto-clears on project switch via `fetchProject` state reset — stale ids from the previous project can never leak into a bulk action
- Checkbox appears on card hover and stays pinned when any card is selected; clicks use `onClick` + `onPointerDown` stopPropagation so the dnd-kit drag sensor never fires from a checkbox tap
- Reuses the existing `BulkActionBar` from `components/ui/DesignSystem.tsx` — the same component Action Items Hub uses — with spring animation, count badge, and variant-styled action buttons. No new bar component was created
- Context menu semantics: right-clicking a **selected** card applies the action to the whole selection; right-clicking an **unselected** card acts on that single task only and does not modify the selection
- Bulk actions wired in the bar: Delete (with count-aware confirm modal), Move to project (disabled with tooltip unless every target is in Backlog). The context menu adds Open, Assign…, Set priority (P1–P5 + clear), Move to column, and Delete

*Cross-project AI Synth*
- New top-level "Cross-project AI Synth" button on `/admin/pm` dashboard, separate from the existing per-project button. The existing per-project synth flow is **completely untouched** — forked a new `CrossProjectAISynthModal` rather than refactoring `AISynthModal` to avoid regression risk
- Detached batch model: `pm_ai_synth_batches.project_id` is now nullable, and each `pm_ai_synth_batch_tasks` row gets a new `target_project_id` FK that must be set before the task can be approved
- LLM receives the active project list (id + name + description) as JSON in the system prompt and proposes a `target_project_id` per task. New prompt file `src/agents/pmAgents/AISynthCrossProject.md` lives alongside the existing `AISynth.md` — neither file modifies the other
- Server validates LLM-suggested `target_project_id` against the active project list on insert; invalid ids land as `null` for the user to fill manually — no LLM hallucination ever reaches the DB
- Approval UX: per-task project picker plus a "Set all pending to…" dropdown at the top of the task list. Approve button is disabled (with tooltip "Assign a project first") until `target_project_id` is set. Reject is always allowed
- On approve, the server re-validates the destination project is still `active` (guards the archived-between-extract-and-approve race), resolves its Backlog column via `is_backlog = true`, and creates the real task there with `source: "ai_synth"`

*Architectural lift — `is_backlog` flag*
- Every backend site that previously identified the Backlog column by name literal (`column.name === "Backlog"`) now reads `column.is_backlog`. This includes `PmTasksController.createTask`/`moveTask`, `PmStatsController.listStats`, `PmAiSynthController.approveTask`, and the frontend `pmStore.moveTask`, `CreateTaskModal`, `KanbanBoard`, `KanbanColumn`. Single grep sweep confirms only three name literals remain, all expected: migration backfill, migration comment, and the `DEFAULT_COLUMNS` seed constant
- Adding this flag in the same migration batch as the cross-project synth schema change was the "future-us won't hate present-us" call — if a column ever gets renamed or reordered, priority auto-clear, approval routing, and move-to-project validation keep working

*New primitives*
- `frontend/src/components/ui/context-menu.tsx` — shadcn-canonical wrapper around `@radix-ui/react-context-menu` (new dep), styled to the PM dark theme. First `radix-ui` primitive beyond `react-slot` in this repo; exports the full family (`ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSub`/`SubTrigger`/`SubContent`, etc.)
- `frontend/src/components/pm/MoveToProjectModal.tsx` — searchable project picker with backlog counts per project, used by both the bulk bar and the context menu move-to-project paths
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — the forked cross-project variant of AISynthModal (grid / new / detail views, per-task project picker, set-all dropdown, cross-project badge on history cards)

**Migration:**
- `20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — additive, forward-compatible:
  - `ALTER TABLE pm_columns ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE` + backfill `WHERE name = 'Backlog'` + partial index `idx_pm_columns_is_backlog` on `(project_id) WHERE is_backlog = TRUE`
  - `ALTER TABLE pm_ai_synth_batches ALTER COLUMN project_id DROP NOT NULL`
  - `ALTER TABLE pm_ai_synth_batch_tasks ADD COLUMN target_project_id UUID REFERENCES pm_projects(id) ON DELETE SET NULL`
- Down migration refuses to restore `NOT NULL` on `project_id` if any cross-project batches exist — loud-by-design so a rollback never nukes detached batches

**Commits:**
- `src/database/migrations/20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — new migration (is_backlog flag, nullable project_id, target_project_id FK, partial index)
- `src/controllers/pm/PmTasksController.ts` — `bulkMoveTasksToProject` + `bulkDeleteTasks` controllers; `createTask` and `moveTask` switched from name checks to `is_backlog`
- `src/controllers/pm/PmAiSynthController.ts` — `extractBatch` gains `scope: "project" | "cross_project"` parameter and injects the active project list into the cross-project prompt; `approveTask` resolves destination via `batch.project_id ?? batchTask.target_project_id` with active-status revalidation; new `setBatchTaskTargetProject` and `listCrossProjectBatches` controllers
- `src/controllers/pm/PmProjectsController.ts` — `DEFAULT_COLUMNS` seed now sets `is_backlog: true` for the Backlog entry and `false` for the other three, threaded through `PmColumnModel.create`
- `src/controllers/pm/PmStatsController.ts` — backlog count query updated to `is_backlog = true`
- `src/routes/pm/tasks.ts` — registered `POST /tasks/bulk/move-to-project` and `POST /tasks/bulk/delete`
- `src/routes/pm/aiSynth.ts` — registered `GET /batches/cross-project` (before `/batches/:batchId` to avoid route collision) and `PUT /batches/:batchId/tasks/:taskId/target-project`
- `src/agents/pmAgents/AISynthCrossProject.md` — new system prompt for cross-project extraction; receives `{{PROJECTS_JSON}}` block and proposes `target_project_id` per task
- `frontend/src/types/pm.ts` — `PmColumn.is_backlog: boolean`, `PmAiSynthBatch.project_id: string | null`, `PmAiSynthBatchTask.target_project_id: string | null` (and P4/P5 added to the priority union + `"failed"` status)
- `frontend/src/api/pm.ts` — `bulkMoveTasksToProject`, `bulkDeleteTasks`, `extractCrossProjectBatch`, `fetchCrossProjectBatches`, `setBatchTaskTargetProject`
- `frontend/src/stores/pmStore.ts` — selection state (`selectedTaskIds` + `meSelectedTaskIds`), toggle/clear actions, `bulkDeleteSelectedTasks`, `bulkMoveSelectedTasksToProject`, `bulkDeleteMeSelectedTasks`; selection auto-clear on project switch; name checks replaced with `is_backlog`
- `frontend/src/components/ui/context-menu.tsx` — new shadcn primitive wrapper
- `frontend/src/components/pm/MoveToProjectModal.tsx` — new searchable picker modal
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — new forked cross-project synth modal with per-task project picker and set-all dropdown
- `frontend/src/components/pm/TaskCard.tsx` — hover checkbox (with `stopPropagation` + `onPointerDown` guard against drag sensor), selection outline, `<ContextMenu>` wrapper with Open / Assign / Set priority / Move to column / Move to project / Delete
- `frontend/src/components/pm/MeTaskCard.tsx` — same treatment, minus Move-to-column (tasks span projects on Me tab)
- `frontend/src/components/pm/KanbanBoard.tsx` — pass selection props through to columns; `name === "Backlog"` checks and the assignee-required rule switched to `is_backlog`
- `frontend/src/components/pm/KanbanColumn.tsx` — forward selection props to each `TaskCard`; `isBacklog` derived from `column.is_backlog`
- `frontend/src/components/pm/MeKanbanBoard.tsx` — forward selection props through `DroppableColumn` → `DraggableCard` → `MeTaskCard`
- `frontend/src/components/pm/MeTabView.tsx` — Me-tab `BulkActionBar`, bulk delete confirm modal, context action handler, store selection subscription
- `frontend/src/components/pm/CreateTaskModal.tsx` — `selectedColumnIsBacklog` derived from `column.is_backlog`
- `frontend/src/pages/admin/ProjectBoard.tsx` — selection subscription, `BulkActionBar` with Move-to-project + Delete actions, `MoveToProjectModal` wiring, bulk delete confirm modal, `handleContextAction` that routes single-vs-multi based on whether the right-clicked task is in the selection, `allTargetsInBacklog` guard, `is_backlog` lookup for `TaskDetailPanel` prop
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — "Cross-project AI Synth" entry button + modal mount
- `frontend/package.json` / `package-lock.json` — added `@radix-ui/react-context-menu`
- `plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/spec.md` + `migrations/{pgsql.sql, mssql.sql, knexmigration.js}` — full spec with 16 tasks, Risk Level 4 section, and three migration scaffolds per convention

## [0.0.13] - April 2026

### Conditional Rendering for Post Tokens

Post blocks and single post templates can now hide markup when a field or custom field is empty, eliminating broken-image icons, empty labels, and orphan wrapper elements. Template authors wrap markup in `{{if post.X}}...{{endif}}` or `{{if_not post.X}}...{{endif}}` to conditionally render based on field presence. Supports standard post tokens and `post.custom.<slug>` custom fields. Evaluated before token replacement so the stripped markup never reaches the output.

**Key Changes:**
- New syntax: `{{if post.featured_image}}<img src="{{post.featured_image}}"/>{{endif}}` keeps the image only when set; pair with `{{if_not post.featured_image}}...{{endif}}` for a fallback branch
- "Empty" is strictly `null`, `undefined`, or empty string `""`. The values `"0"`, `0`, `false`, whitespace strings, and empty arrays/objects are intentionally **not** empty — authors writing `{{if post.custom.count}}` with a zero count see the block render as expected
- Flat only in v1 — nested conditionals trigger a `console.warn` and leave the template unchanged so the raw markers render visibly. Loud-by-design so silent template bugs don't ship
- Custom fields supported via `{{if post.custom.<slug>}}` in both post block loops and single post templates
- Works in five render paths with identical semantics: production post blocks, production single post pages, editor page preview with embedded post block shortcodes, editor post block template preview (client-side), and editor single post template preview (client-side)
- Existing templates with zero `{{if}}` tokens pass through a fast-path early return — zero behavioral change for all current data
- Known preview limitation documented in the Posts Docs page: the editor's client-side preview treats `post.custom.*` as empty because placeholder data doesn't model custom fields. Live site reflects real values.
- Companion change in `website-builder-rebuild` (production renderer) ships the same `processConditionals` logic in `src/utils/shortcodes.ts` — required for production parity. Three source-of-truth copies are kept in sync via cross-reference header comments in each file.

**Commits:**
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — added `processConditionals` helper (local, non-exported) with field resolver handling the backend's `_categories`/`_tags` naming convention and derived `url` field; wired into `renderPostBlock`'s `posts.map` body after `customFields` is parsed. Header comment names the two sibling copies.
- `frontend/src/components/Admin/PostBlocksTab.tsx` — added `processConditionals` helper that resolves fields by looking up literal token strings in `PLACEHOLDER_POST`; invoked in both the loop path (per-post, so different preview posts can resolve differently) and the single-template fallback path of `replacePlaceholders`. Documents the custom-field preview limitation inline.
- `frontend/src/pages/admin/AlloroPostsDocs.tsx` — new "Conditional Rendering" section between "Shortcode Syntax" and "Examples" with syntax reference, empty-definition explainer, two worked examples (featured image fallback, video embed), and a rules/limits list covering flat-only constraint, absence of `{{else}}`/comparisons, preview limitation, and the supported field list.
- `plans/04112026-no-ticket-conditional-post-token-rendering/spec.md` — full spec covering why/what/context/constraints/risk/tasks/done for the cross-repo change.

## [0.0.12] - April 2026

### Allow Manager Role to Rename a Location

Manager-role users can now rename a location from Settings → Properties without escalating to an org admin. Rename is lightweight metadata and no longer requires full `canManageConnections` admin privilege. All other location management actions (Change GBP, Set Primary, Delete, Add Location, change domain) remain admin-only.

**Key Changes:**
- Backend `PUT /api/locations/:id` is now accessible to both `admin` and `manager` roles
- Server-side field-level guard rejects non-admin attempts to modify `domain` or `is_primary` with `403` — defense in depth, the client is not authoritative
- Frontend `PropertiesTab` exposes a distinct `canRenameLocation` flag (admin OR manager); the inline name-edit affordance uses this flag while every other action remains gated on `canManageConnections` (admin-only)
- Viewer role remains fully read-only; no edit affordance is rendered

**Commits:**
- `src/routes/locations.ts` — widened role gate on `PUT /:id` from `admin` to `admin, manager`; added field-level guard blocking `domain`/`is_primary` modification for non-admin roles
- `frontend/src/components/settings/PropertiesTab.tsx` — added `canRenameLocation` flag; swapped `canManageConnections` → `canRenameLocation` on the two call sites that gate the name-edit UI (click handler and hover pencil icon)

## [0.0.11] - April 2026

### PM QA Bug Fixes + UX Polish

Full Playwright QA pass on the PM feature surfaced five confirmed bugs and five friction points. All fixed before production rollout.

**Bug Fixes:**
- Task cards now immediately show "by dave" (creator name) and "→ dave" (assignee name) on creation and assignment — backend `createTask` and `assignTask` responses now enrich with LEFT JOIN on users
- Deadline panel display no longer shows the wrong date (off-by-one) — changed from `.slice(0, 10)` on a UTC ISO string to `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` to get the correct PST date
- ME kanban card clicks now open the task detail panel — moved click handler to outer draggable div with a `didDrag` ref to distinguish click vs drag
- Text no longer selects during ME kanban drag — added `userSelect: "none"` to draggable elements
- ME kanban drag to DONE column now works reliably — replaced `pointerWithin` collision detection with `rectIntersection` filtered to column droppables only
- Fixed missing `format` import in `pmDateFormat.ts` that would crash for far-future deadlines

**UX Improvements:**
- Truncated task titles show full text as native browser tooltip (`title` attribute) on both kanban and ME kanban cards
- Task detail panel now shows "Created by {name} · X ago" metadata row at the bottom
- ME kanban columns show an orange border ring + subtle scale on drag-over for clearer drop targeting
- ME task cards show assignee name (`→ name`) when set
- Old notifications without `actor_name` in metadata are now enriched server-side via actor email fallback

**Commits:**
- `src/controllers/pm/PmTasksController.ts` — `enrichTask()` helper, applied to createTask + assignTask
- `frontend/src/components/pm/TaskDetailPanel.tsx` — PST deadline display fix, creator metadata row
- `frontend/src/components/pm/MeKanbanBoard.tsx` — click vs drag fix, column collision detection, drop zone ring
- `frontend/src/components/pm/MeTaskCard.tsx` — no-select on drag, assignee display, title tooltip
- `frontend/src/components/pm/TaskCard.tsx` — title tooltip
- `frontend/src/utils/pmDateFormat.ts` — `format` import fix
- `src/controllers/pm/PmNotificationsController.ts` — server-side actor_name enrichment

## [0.0.10] - April 2026

### Session Expired Crash Fix (ALLORO-FRONTEND-Q)

Users with expired JWT tokens hitting `/settings/billing` saw a white screen — "Something went wrong." — because the billing page crashed trying to render a 403 error response as billing data. The app now detects expired tokens globally and shows a "Session Expired" modal prompting re-login.

**Key Changes:**
- Global 403 axios interceptor in `api/index.ts` — detects `"Invalid or expired token"` responses, dispatches `session:expired` event with dedup flag to prevent multiple modals
- `SessionExpiredModal` component — non-dismissible dark glassmorphic modal, clears all auth state (localStorage, sessionStorage, query cache, cookies), broadcasts logout to other tabs, redirects to `/signin`
- Mounted in `App.tsx` at top level alongside `<Toaster />`
- `BillingTab.tsx` defensive guard — changed `success !== false` to `success === true` so malformed API responses never set state

**Commits:**
- `frontend/src/api/index.ts` — 403 interceptor with `sessionExpiredFired` dedup flag
- `frontend/src/components/SessionExpiredModal.tsx` — new modal component
- `frontend/src/App.tsx` — mount SessionExpiredModal
- `frontend/src/components/settings/BillingTab.tsx` — tighten response guards

## [0.0.9] - March 2026

### Billing Quantity Override for Flat-Rate Legacy Clients

Caswell Orthodontics and One Endodontics have flat-rate deals — they pay for a single unit regardless of how many locations they have. A new `billing_quantity_override` column on organizations allows per-org override of the Stripe subscription quantity, bypassing the automatic location count.

**Key Changes:**
- Migration `20260323000001_add_billing_quantity_override` — adds nullable integer column, seeds `1` for Caswell (org 25) and One Endo (org 39)
- `BillingService.createCheckoutSession()` — uses override when set, falls back to location count
- `BillingService.syncSubscriptionQuantity()` — uses override when set, prevents location add/remove from changing the billed quantity
- `IOrganization` interface — added `billing_quantity_override: number | null`

**Commits:**
- `src/database/migrations/20260323000001_add_billing_quantity_override.ts` — column + seed data
- `src/controllers/billing/BillingService.ts` — guard clauses in checkout and quantity sync
- `src/models/OrganizationModel.ts` — interface update

## [0.0.8] - March 2026

### Stripe Subscription Quantity Sync on Location Change

Adding or removing a location now automatically updates the Stripe subscription quantity and sends an email notification to org admins with the billing change details.

**Key Changes:**
- `syncSubscriptionQuantity()` in BillingService — retrieves Stripe subscription, compares item quantity to current location count, updates if different
- Hooked into `LocationService.createLocation()` and `removeLocation()` as fire-and-forget after transaction commits
- Email notification to org admins: old/new quantity, unit price, new monthly total, proration note
- Best-effort: Stripe failures are logged but never block location operations
- No-op for admin-granted orgs (no `stripe_subscription_id`)

**Commits:**
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Add syncSubscriptionQuantity() with Stripe update + email notification
- `signalsai-backend/src/controllers/locations/LocationService.ts` — Hook sync into createLocation() and removeLocation()

## [0.0.7] - March 2026

### Rybbit Analytics Integration & Proofline Migration

Automated Rybbit website analytics provisioning, migrated Proofline from N8N to direct Claude calls, and enriched both daily and monthly agents with website analytics data from Rybbit.

**Key Changes:**
- Automated Rybbit site creation when a custom domain is verified — creates site via Rybbit API and auto-injects tracking script into project header code
- Migrated Proofline agent from N8N webhook to direct Claude LLM call with proper JSON output schema (title, proof_type, trajectory, explanation)
- Proofline daily agent now includes Rybbit website analytics (sessions, pageviews, bounce rate) alongside GBP data for yesterday vs day-before comparison
- Monthly Summary agent now includes Rybbit website analytics (current month vs previous month) alongside GBP and PMS data
- New shared Rybbit data fetcher utility with daily and monthly comparison functions, reused across both agent types
- Added `rybbit_site_id` column to projects table for linking to Rybbit sites
- Added `ProoflineAgentOutput` and `ProoflineSkippedOutput` backend type definitions
- Added `trajectory` field to frontend `ProoflineAgentData` type

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts` — Add rybbit_site_id to projects
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts` — Rybbit site provisioning on domain verification
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — Hook provisioning into verifyDomain
- `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts` — Shared Rybbit data fetcher (daily + monthly comparison)
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — Output schema added to prompt
- `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts` — ProoflineAgentOutput type
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — Proofline migration to direct Claude call, Rybbit data wiring for daily + monthly
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — websiteAnalytics param in proofline + summary payloads
- `signalsai/src/types/agents.ts` — Add trajectory to ProoflineAgentData

## [0.0.6] - March 2026

### Stripe Production Billing — Org Type Pricing + Dynamic Quantity

Billing was hardcoded to a single $2,000 flat price with `quantity: 1`. Now supports per-location/per-team pricing driven by organization type, dynamic quantity based on location count, and a persistent subscribe banner for unpaid users.

**Key Changes:**
- Checkout resolves Stripe price by organization type: `health` ($2,000/location/mo) or `saas` ($3,500/team/mo)
- Checkout quantity dynamically set to org's location count from DB (minimum 1)
- New `organization_type` column on organizations (nullable, immutable once set, null = health)
- Admin org detail page: type dropdown (Health / SaaS) with confirmation, locked after save
- `PATCH /api/admin/organizations/:id/type` endpoint with 409 immutability enforcement
- Persistent amber banner for admin-granted users without Stripe subscription ("Subscribe in Settings > Billing")
- ENV restructured: `STRIPE_DFY_PRICE_ID` renamed to `STRIPE_HEALTH_PRICE_ID`, added `STRIPE_SAAS_PRICE_ID`, comment-swap blocks for test/prod keys

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000002_add_organization_type.ts` — Add organization_type column
- `signalsai-backend/src/config/stripe.ts` — Replace `getPriceId(tier)` with `getPriceIdByOrgType(orgType)`
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Dynamic price + quantity in checkout session
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Add updateOrganizationType handler
- `signalsai-backend/src/routes/admin/organizations.ts` — Add PATCH /:id/type route
- `signalsai-backend/src/models/OrganizationModel.ts` — Add organization_type to IOrganization
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — Org type dropdown with immutability lock
- `signalsai/src/components/PageWrapper.tsx` — Persistent non-subscriber amber banner
- `signalsai/src/api/admin-organizations.ts` — Add organization_type to types, adminUpdateOrganizationType function

## [0.0.5] - March 2026

### SEO Data Version Propagation & Backfill

SEO data was siloed on individual page versions. Bulk generation targeted the highest version number (often an inactive version), and manual SEO edits only wrote to one row. The page list showed score 77 from an old inactive version while the editor showed 15 (draft had null seo_data). The public renderer serves from the published row — if that row had no seo_data, zero SEO tags were injected.

**Key Changes:**
- Added `propagateSeoToSiblings` helper — when SEO data is written to any page version, all sibling versions of the same path with null seo_data are backfilled (additive only, never overwrites)
- Fixed bulk SEO generation to target the published page per path (fallback to draft, then highest version) instead of blindly picking the highest version number
- Fixed page list SEO score to use `displayPage` (published or latest) instead of scanning all versions for any with seo_data
- Fixed `getAllSeoMeta` endpoint to deduplicate pages by path (one entry per path) — prevents false uniqueness failures between draft and published versions of the same page
- Fixed SeoPanel uniqueness filter to exclude by page path instead of entity ID, preventing score flicker (77 → 66) when sibling metadata loads
- One-time backfill migration: copied best seo_data to all 79 page versions across 13 page groups that had gaps

**Commits:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add propagateSeoToSiblings helper, call from updatePageSeo
- `signalsai-backend/src/workers/processors/seoBulkGenerate.processor.ts` — Fix getPageEntities to prefer published, add sibling propagation after bulk save
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — Deduplicate getAllSeoMeta by path
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — List score uses displayPage, allPageSeoMeta uses published/latest per group
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Uniqueness filter excludes by path for pages
- `signalsai-backend/src/database/migrations/20260310000001_backfill_seo_data_across_versions.ts` — One-time backfill migration

## [0.0.4] - March 2026

### Fix Monthly Agents 400 Error (Org-Centered Alignment)

Removed vestigial `domain` requirement from the monthly-agents-run endpoint — a leftover from the domain-centered execution model replaced in February. Organizations without a domain set caused silent 400 failures in the PMS pipeline.

**Key Changes:**
- `domain` no longer required in `POST /api/agents/monthly-agents-run` — endpoint resolves display name from its internal org join
- PMS retry and approval services no longer resolve org domain just to pass it back; removed unnecessary `OrganizationModel` lookups
- Fire-and-forget axios calls replaced with `await` so errors propagate correctly instead of being swallowed
- `notifyAdminsMonthlyAgentComplete` parameter renamed from `domain` to `practiceName`

**Commits:**
- `src/controllers/agents/AgentsController.ts` — Remove domain validation, use org join for admin email
- `src/utils/core/notificationHelper.ts` — Rename domain param to practiceName
- `src/controllers/pms/pms-services/pms-retry.service.ts` — Remove org lookup, domain payload, fix await
- `src/controllers/pms/pms-services/pms-approval.service.ts` — Same cleanup

### Fix SEO Data Lost on Page Draft Creation

SEO scores displayed correctly in the website page list but appeared empty when opening a page for editing. The `createDraft` function was not copying `seo_data` from the published page to the draft.

**Key Changes:**
- Draft creation now copies `seo_data` from the published source page
- Stale draft refresh now syncs `seo_data` from the published version

**Commits:**
- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add seo_data to draft insert and stale refresh update

## [0.0.3] - March 2026

### SEO Scoring System & Meta Injection

Full SEO scoring, editing, and meta injection pipeline across admin frontend, backend, and website-builder-rebuild rendering server.

**Key Changes:**
- SEO scoring panel with sidebar navigation, per-section scores, colored dot indicators, and inline field editing for meta title, description, canonical URL, robots, OG tags, and JSON-LD schema
- SEO meta injection in website-builder-rebuild renderer: smart replace-or-inject for `<title>`, meta tags, canonical, OG tags, and JSON-LD schema blocks
- Business data service with Redis-cached lookups (10-min TTL) for org + location data
- Post-level SEO support: Content/SEO tab bar in post editor with auto-save
- Backend: `seo_data` JSONB column on pages and posts, business_data on organizations/locations, SEO generation endpoint
- Migration: `20260308000001_add_seo_and_business_data.ts`

### Admin Sidebar Collapsed Spacing

Fixed collapsed admin sidebar overlaying PageEditor and LayoutEditor content. Content now reserves 72px left margin when sidebar is collapsed.

### SeoPanel Redesign

Restructured SeoPanel from a full-width scrolling list to a sidebar+main split layout. Removed emoji indicators, added colored dot score indicators, section navigation sidebar, and business data warning CTA linking to organization settings.

### Project Display Name & Custom Domain in List

Added editable display name to website projects and custom domain preference in the list view.

**Key Changes:**
- `display_name` column on `website_builder.projects` (migration `20260309000001`)
- Inline-editable display name in WebsitesList (pencil icon, Enter to save)
- "View Site" link and domain display prefer `custom_domain` over generated subdomain
- Backend: `display_name` and `custom_domain` included in list query, set on project create

### Misc Fixes
- Removed unused imports (`Download`, `HelpCircle`, `FileText`, `Upload`, `Sparkles`) and dead `LocationFormRow` component to fix TS6133 errors

**Commits:**
- `website-builder-rebuild/src/utils/renderer.ts` — SEO meta injection with `injectSeoMeta()`, `replaceOrInjectMeta()`, `replaceOrInjectLink()`
- `website-builder-rebuild/src/services/seo.service.ts` — Business data fetch with Redis caching
- `website-builder-rebuild/src/routes/site.ts` — SEO injection in page and post assembly
- `website-builder-rebuild/src/services/singlepost.service.ts` — Added `seo_data` to post query
- `website-builder-rebuild/src/types/index.ts` — `SeoData` interface, `organization_id` on Project, `seo_data` on Page
- `signalsai-backend/src/database/migrations/20260308000001_add_seo_and_business_data.ts` — SEO + business_data columns
- `signalsai-backend/src/database/migrations/20260309000001_add_display_name_to_projects.ts` — display_name column
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.project-manager.ts` — display_name in list/create, `updateProjectDisplayName()`
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.seo-generation.ts` — SEO generation service
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — SEO endpoints
- `signalsai-backend/src/routes/admin/websites.ts` — SEO routes
- `signalsai-backend/src/routes/locations.ts` — Business data routes
- `signalsai-backend/src/controllers/locations/BusinessDataService.ts` — Business data service
- `signalsai-backend/src/models/LocationModel.ts` — Fixed create signature for optional business_data
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Redesigned SEO panel with sidebar navigation
- `signalsai/src/components/Admin/PostsTab.tsx` — Content/SEO tab bar, post SEO editing
- `signalsai/src/pages/admin/PageEditor.tsx` — SEO tab integration, sidebar margin fix
- `signalsai/src/pages/admin/LayoutEditor.tsx` — Sidebar margin fix
- `signalsai/src/pages/admin/WebsitesList.tsx` — Inline display name editing, custom domain links
- `signalsai/src/api/websites.ts` — `display_name`, `custom_domain`, SEO API functions
- `signalsai/src/api/locations.ts` — Business data API functions
- `signalsai/src/components/PMS/PMSUploadWizardModal.tsx` — Removed unused imports
- `signalsai/src/components/PMS/PMSVisualPillars.tsx` — Removed unused imports
- `signalsai/src/pages/admin/PracticeRanking.tsx` — Removed unused `LocationFormRow` and `Sparkles`

## [0.0.2] - February 2026

### Admin Set Password & User Profile Account Tab

Enables password management for legacy Google-only accounts via admin tools and user self-service.

**Key Changes:**
- Admin can now see password status (PW / No PW badge) on each user card in Organization Detail
- Admin can set a temporary auto-generated password for any user with optional email notification
- New "Account" tab in Settings (after Billing) where users can set or change their password
- Smart UX: legacy users (no password) see "Set Password" without current password requirement; users with a password must enter their current one to change it
- Password validation enforces existing rules (8+ chars, 1 uppercase, 1 number)

**Commits:**
- `signalsai-backend/src/models/OrganizationUserModel.ts` — Added password_hash to user join query
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Added has_password mapping + setUserPassword handler with temp password generation and email notification
- `signalsai-backend/src/controllers/settings/SettingsController.ts` — Added getPasswordStatus and changePassword handlers
- `signalsai-backend/src/routes/admin/organizations.ts` — Added POST /users/:userId/set-password route
- `signalsai-backend/src/routes/settings.ts` — Added GET /password-status and PUT /password routes
- `signalsai/src/api/admin-organizations.ts` — Added has_password to AdminUser, adminSetUserPassword API function
- `signalsai/src/api/profile.ts` — Added getPasswordStatus and changePassword API functions
- `signalsai/src/components/settings/ProfileTab.tsx` — New password set/change component
- `signalsai/src/pages/Settings.tsx` — Added Account tab
- `signalsai/src/pages/admin/OrganizationDetail.tsx` — Password status badges, Set Password modal with notify checkbox
