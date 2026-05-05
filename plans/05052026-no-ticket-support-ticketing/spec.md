---
id: spec-support-ticketing
created: 2026-05-05
ticket: no-ticket
mode: --start
status: planning
source_docs:
  - /Users/rustinedave/Downloads/Alloro_Support_System_SOP_v3.pdf
  - /Users/rustinedave/Downloads/alloro_support_widget_spec.pdf
---

# Client Support Ticketing

## Why
The current `/help` page is a one-way inquiry form. It POSTs to `/api/support/inquiry`, forwards an email, and gives clients no durable ticket record, status, or response history. Alloro needs a client-facing ticketing surface that keeps support requests in the product, groups work by client for the team, and replaces manual email-thread tracking.

## What
Replace the existing `/help` route with a full support console. Clients can create tickets, see their ticket history, view current status, and reply to staff responses. Add a third admin top tab, `Support`, beside `Process` and `Projects`, where Alloro staff triage and work tickets grouped by client/practice.

The PDF spec marked client ticket status/history as out of scope for its original V1. This plan intentionally changes that scope: client-visible ticket status and responses are in V1 because that is now the product requirement.

## Scope

### Client `/help`
`/help` remains the canonical client route. Do not add `/support` in V1.

The route becomes a support workspace with:
- A page header matching the main dashboard/PMS redesign: Fraunces serif headline, restrained copy, parchment/cream surfaces, Alloro orange actions.
- A `New request` composer using the three guided ticket types from the PDFs.
- A ticket list grouped by status, newest first.
- A selected ticket detail thread with:
  - Current status.
  - Ticket type, submitted date, public ticket ID, page URL when applicable.
  - Client-visible staff responses.
  - Client reply box for open tickets.
  - Resolution summary when closed.

Ticket types:
- `bug`
- `feature_request`
- `website_edit`

Guided questions:
- Bug: what the user was trying to do, what happened instead, impact, current page auto-captured.
- Feature request: desired capability, practice problem solved, importance.
- Website edit: change type, site location, requested copy/look, optional deadline.

### Admin `/admin/support`
Add a new top-level admin tab:

`Process | Projects | Support`

The route `/admin/support` is an operations workspace, not a PM board clone. It should support:
- Grouping tickets by practice/client.
- Saved views:
  - New and Untriaged
  - Bug Queue
  - Website Edit Queue
  - Feature Request Log
  - Active Sprint
  - By Practice
  - Resolved
- Filters by client, type, status, severity/priority, category, assignee, date.
- Ticket detail panel with internal triage fields, internal notes, client-visible replies, and resolution notes.
- Inline updates for status, category, severity/priority, assignee, sprint, and notes.

## Design Direction

The client `/help` surface should match the dashboard/PMS redesign rather than the old premium white-card Help page.

Use these existing tokens/patterns:
- Background: subtle parchment/light warm surface, anchored around `#F7F5F3` / `#F3F4F6`.
- Parchment callouts: `--color-cream: #FCFAED`.
- Parchment border: `--color-cream-line: #EDE5C0`.
- Display font: `font-display` / Fraunces.
- Body font: existing Plus Jakarta Sans.
- Accent: `alloro-orange` / `#D66853`.
- Cards: `rounded-2xl`, thin warm borders, `shadow-premium` or the focus-dashboard soft shadow pattern.
- Buttons: orange primary CTAs, quiet secondary buttons, no oversized marketing hero.

Client layout:
- Top page band: small uppercase eyebrow, Fraunces title, short operational copy, primary `New request` button.
- Main grid:
  - Left: ticket list and filters.
  - Right: selected ticket detail/thread.
- Empty state: parchment card with icon, short sentence, and `Create your first request`.
- Mobile: list first, detail opens as a full-screen drawer or route state. No side-by-side dependency.

Admin layout:
- Use the existing admin shell and top tab style.
- Support content should be dense, scannable, and operational.
- Do not use the client parchment treatment heavily in admin, except for low-emphasis callouts.

## Data Model

Create new support-specific tables. Do not overload `pm_tasks` or the existing one-way `support/inquiry` flow.

### `support_tickets`
Core fields:
- `id` UUID primary key
- `public_id` unique string, e.g. `BUG-0042`, `FEAT-0017`, `WEB-0008`
- `organization_id` integer, required
- `location_id` integer, nullable
- `created_by_user_id` integer, required
- `type` enum-like string: `bug`, `feature_request`, `website_edit`
- `status` enum-like string: `new`, `triaged`, `in_progress`, `waiting_on_client`, `resolved`, `wont_fix`
- `severity` nullable string for bugs: `P1`, `P2`, `P3`, `P4`
- `priority` nullable string for feature/web: `high`, `medium`, `low`
- `category` nullable string
- `assigned_to_user_id` integer, nullable
- `sprint` nullable string
- `title` string
- `current_page_url` nullable text
- `requested_completion_date` nullable date
- `guided_answers` JSONB
- `internal_notes` text, nullable
- `resolution_notes` text, nullable
- `ack_email_sent_at` timestamp, nullable
- `resolved_email_sent_at` timestamp, nullable
- `created_at`, `updated_at`, `resolved_at`

Indexes:
- `(organization_id, status, created_at desc)`
- `(type, status, created_at desc)`
- `(assigned_to_user_id, status)`
- `(public_id)` unique
- `(created_by_user_id, created_at desc)`

### `support_ticket_messages`
Core fields:
- `id` UUID primary key
- `ticket_id` UUID references `support_tickets`
- `author_user_id` integer, nullable for system messages
- `author_role` string: `client`, `admin`, `system`
- `visibility` string: `client_visible`, `internal`
- `body` text
- `created_at`, `updated_at`

Rules:
- Client route only reads `client_visible` messages.
- Admin route reads both `client_visible` and `internal`.
- Client replies always create `client_visible` messages.
- Admin internal notes should not create client-visible messages.

### `support_ticket_events`
Optional but recommended for auditability:
- `id` UUID primary key
- `ticket_id` UUID
- `actor_user_id` integer, nullable
- `event_type` string
- `metadata` JSONB
- `created_at`

Use for status changes, assignments, severity/priority changes, email sends, and resolution.

## API

All responses should follow the backend convention:

```ts
{
  success: true,
  data: {},
  error: null
}
```

### Client Routes
Mounted under `/api/support`.

- `POST /api/support/tickets`
  - Auth: `authenticateToken`, `rbacMiddleware`, `locationScopeMiddleware`
  - Creates a ticket scoped to the caller's organization.
  - Auto-generates `public_id`.
  - Auto-assigns by type.
  - Sends acknowledgment email.

- `GET /api/support/tickets`
  - Returns the caller organization's tickets.
  - Query params: `status`, `type`, `limit`, `offset`.
  - Client can see all tickets in their organization, not only their own, unless role policy changes later.

- `GET /api/support/tickets/:id`
  - Returns one organization-scoped ticket plus client-visible messages.

- `POST /api/support/tickets/:id/messages`
  - Adds a client-visible reply to an open ticket.
  - If ticket is `waiting_on_client`, move it back to `in_progress`.

### Admin Routes
Mounted under `/api/admin/support`.

- `GET /api/admin/support/tickets`
  - Auth: `authenticateToken`, `superAdminMiddleware`
  - Supports filters and pagination.
  - Includes organization/practice display data.

- `GET /api/admin/support/tickets/:id`
  - Returns full ticket detail, all messages, and event history.

- `PATCH /api/admin/support/tickets/:id`
  - Updates triage/status fields.
  - Validates status transitions.
  - Requires `resolution_notes` before `resolved` or `wont_fix`.
  - Triggers website edit completion email when a website edit moves to `resolved`.

- `POST /api/admin/support/tickets/:id/messages`
  - Body includes `body` and `visibility`.
  - `client_visible` messages appear in `/help`; `internal` messages are admin-only.

## Auto Routing

On ticket creation:
- Bug -> assign to Dave when a matching admin user exists.
- Feature Request -> assign to Jo when a matching admin user exists.
- Website Edit -> assign to Dave's Sister when a matching admin user exists.

Implementation should not hardcode user IDs. Use config by email:
- `SUPPORT_BUG_ASSIGNEE_EMAIL`
- `SUPPORT_FEATURE_ASSIGNEE_EMAIL`
- `SUPPORT_WEB_ASSIGNEE_EMAIL`
- `SUPPORT_EMAIL_FROM`

If a configured user is missing, leave `assigned_to_user_id` null and log a warning. The ticket still creates.

## Emails

Reuse existing email infrastructure. Replace the legacy inquiry-forward behavior only after ticket creation is live.

V1 email triggers:
- Bug submitted: immediate acknowledgment.
- Feature request submitted: immediate acknowledgment.
- Website edit submitted: immediate acknowledgment, including requested deadline when provided.
- Website edit resolved: automatic completion email using `resolution_notes`.

Manual in V1:
- Bug resolution email for P1/P2 remains manual, per SOP.

Dynamic fields:
- First name
- Ticket ID
- Requested completion date
- Resolution notes

## Frontend Architecture

### New Files
Client:
- `frontend/src/api/support.ts`
- `frontend/src/hooks/queries/useSupportQueries.ts`
- `frontend/src/pages/Help.tsx` rewritten as a thin composition
- `frontend/src/components/support/SupportPageHeader.tsx`
- `frontend/src/components/support/SupportTicketComposer.tsx`
- `frontend/src/components/support/SupportTicketList.tsx`
- `frontend/src/components/support/SupportTicketDetail.tsx`
- `frontend/src/components/support/SupportMessageThread.tsx`
- `frontend/src/components/support/SupportStatusBadge.tsx`
- `frontend/src/components/support/supportTypes.ts`

Admin:
- `frontend/src/pages/admin/SupportDashboard.tsx`
- `frontend/src/components/Admin/support/AdminSupportFilters.tsx`
- `frontend/src/components/Admin/support/AdminSupportClientGroups.tsx`
- `frontend/src/components/Admin/support/AdminSupportTicketPanel.tsx`
- `frontend/src/components/Admin/support/AdminSupportTriageFields.tsx`
- `frontend/src/components/Admin/support/AdminSupportMessageComposer.tsx`

Backend:
- `src/database/migrations/YYYYMMDDHHMMSS_create_support_ticketing.ts`
- `src/models/SupportTicketModel.ts`
- `src/models/SupportTicketMessageModel.ts`
- `src/models/SupportTicketEventModel.ts`
- `src/routes/admin/support.ts`
- `src/controllers/support/SupportTicketsController.ts`
- `src/controllers/support/AdminSupportTicketsController.ts`
- `src/controllers/support/support-services/SupportTicketService.ts`
- `src/controllers/support/support-services/SupportEmailService.ts`
- `src/controllers/support/support-utils/supportTicketValidation.ts`

### Existing Files To Update
- `frontend/src/pages/Help.tsx` — replace current form implementation.
- `frontend/src/components/Sidebar.tsx` — keep route path `/help`, change label from `Help Center` to `Support`.
- `frontend/src/pages/Admin.tsx` — add `/admin/support` route.
- `frontend/src/components/Admin/AdminTopBar.tsx` — add Support tab and active route handling.
- `frontend/src/components/Admin/AdminLayout.tsx` — hide admin sidebar for `/admin/support` if Support uses a full-width workspace like Projects.
- `frontend/src/lib/queryClient.ts` — add support query keys.
- `src/index.ts` — mount `/api/admin/support`.
- `src/routes/support.ts` — add authenticated ticket routes while keeping legacy `/inquiry` during migration.

## Validation Rules

Ticket creation:
- Type is required and must be one of the three allowed types.
- Required guided answers depend on type.
- Optional free text max length: 4000 chars.
- Title is system-derived but can be edited by admin later.
- Client cannot set status, severity, priority, category, assignee, sprint, or internal notes.
- Current page URL is accepted only from the authenticated app and stored as text; do not fetch or crawl it.

Admin updates:
- `resolved` and `wont_fix` require `resolution_notes`.
- Bug severity only allowed for bug tickets.
- Priority only allowed for feature requests and website edits.
- `wont_fix` requires internal notes or resolution notes documenting rationale.

## Permissions

Client:
- Must be authenticated.
- Must belong to an organization.
- Can create and view tickets for their organization.
- Can add messages only to tickets in their organization.
- Cannot see internal messages or admin-only fields.

Admin:
- Must be super admin.
- Can view all tickets.
- Can update triage and internal fields.
- Can send client-visible replies.

Open question for later:
- Whether managers/admins in a client org can see all organization tickets while viewers only see their own. V1 defaults to organization-wide visibility because Alloro client dashboards are practice operations surfaces.

## Out Of Scope For V1

- Real-time chat/websockets.
- File or screenshot upload.
- External ticketing integrations.
- Public roadmap status for feature requests.
- Client ticket deletion.
- SLA automation/escalation bots.
- Feature voting.
- Separate `/support` route.

## Risks

**Level:** 3

Reasons:
- Adds persisted support data and client-visible message history.
- Replaces an existing production route.
- Adds admin workflow and emails.
- Touches both authenticated client and super-admin surfaces.

Mitigations:
- Keep legacy `/api/support/inquiry` until the new ticket route is verified.
- Build `/help` replacement behind the new ticket APIs, but keep the route path stable.
- Use support-specific tables to avoid corrupting PM/project behavior.
- Add clear role/visibility tests around message reads.
- Require `resolution_notes` before resolution-triggered emails.

## Decisions

- D1: `/help` remains the route for client support.
- D2: The old Help page is replaced, not wrapped.
- D3: Client ticket status/history/responses are in V1.
- D4: Support tickets use new support tables, not `pm_tasks`.
- D5: Admin support is `/admin/support`, a third top tab beside Process and Projects.
- D6: Client design follows the dashboard/PMS redesign: Fraunces, cream/parchment cards, warm light background, Alloro orange CTAs.
- D7: Admin design stays operational and dense inside the admin shell.
- D8: File uploads are excluded from V1.
- D9: Legacy `/api/support/inquiry` stays temporarily for migration safety, then can be retired after rollout.

## Tasks

### T1: Database Foundation
**Do:** Create support ticket, message, and event migrations with indexes and safe down migration. Add models extending `BaseModel`, with JSON fields for guided answers and event metadata.
**Files:** `src/database/migrations/*support_ticketing.ts`, `src/models/SupportTicketModel.ts`, `src/models/SupportTicketMessageModel.ts`, `src/models/SupportTicketEventModel.ts`
**Verify:** `npx knex migrate:latest --knexfile src/database/config.ts`

### T2: Support Service Layer
**Do:** Build ticket creation, public ID generation, auto-assignment, scoped fetches, message creation, event logging, and status transition helpers. Keep all DB access inside models.
**Files:** `src/controllers/support/support-services/SupportTicketService.ts`, support models
**Verify:** Unit-style service smoke via API once routes are wired.

### T3: Client Support API
**Do:** Add authenticated client ticket routes under `/api/support/tickets`. Keep `/api/support/inquiry` untouched for now.
**Files:** `src/routes/support.ts`, `src/controllers/support/SupportTicketsController.ts`, validation utils
**Verify:** Create, list, detail, and reply with a client token.

### T4: Admin Support API
**Do:** Add `/api/admin/support` routes for list, detail, patch, and admin messages. Use `authenticateToken` + `superAdminMiddleware`.
**Files:** `src/routes/admin/support.ts`, `src/controllers/support/AdminSupportTicketsController.ts`, `src/index.ts`
**Verify:** Filtered admin list and detail return full fields/messages/events.

### T5: Email Triggers
**Do:** Add support email templates and send hooks for ticket acknowledgments and website edit resolution. Store sent timestamps.
**Files:** `src/controllers/support/support-services/SupportEmailService.ts`, `src/emails/templates/*`, support service
**Verify:** Create each ticket type and confirm the correct template path is invoked.

### T6: Frontend API + Query Keys
**Do:** Add typed support API functions and React Query hooks. Add `QUERY_KEYS.support.*` and `QUERY_KEYS.adminSupport.*`.
**Files:** `frontend/src/api/support.ts`, `frontend/src/hooks/queries/useSupportQueries.ts`, `frontend/src/lib/queryClient.ts`
**Verify:** `cd frontend && npx tsc -b`

### T7: Replace Client `/help`
**Do:** Rewrite `Help.tsx` as a thin composition. Build ticket composer, ticket list, detail thread, statuses, empty/loading/error states, and reply flow. Use the parchment dashboard/PMS design language.
**Files:** `frontend/src/pages/Help.tsx`, `frontend/src/components/support/*`
**Verify:** Client can create a ticket, see it in the list, open it, and add a reply.

### T8: Client Navigation Copy
**Do:** Keep path `/help` but change sidebar label to `Support`. Make active state still match `/help`.
**Files:** `frontend/src/components/Sidebar.tsx`
**Verify:** Sidebar navigates to `/help` and active state works.

### T9: Admin Support Route + Tab
**Do:** Add `Support` to `AdminTopBar`, active for `/admin/support`. Add route and dashboard shell. Decide whether to hide `AdminSidebar` for Support like PM does; default to full-width for a queue workspace.
**Files:** `frontend/src/components/Admin/AdminTopBar.tsx`, `frontend/src/components/Admin/AdminLayout.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/pages/admin/SupportDashboard.tsx`
**Verify:** `Process | Projects | Support` tab behavior works across admin routes.

### T10: Admin Support Workspace
**Do:** Build grouped client queues, saved view filters, ticket detail panel, triage fields, internal notes, and client-visible reply composer.
**Files:** `frontend/src/components/Admin/support/*`, `frontend/src/pages/admin/SupportDashboard.tsx`
**Verify:** Admin can triage a new ticket, assign it, move status, reply to client, and resolve with notes.

### T11: Regression + Cleanup
**Do:** Verify legacy Help behavior is replaced only at UI level; decide when to remove `/api/support/inquiry`. Add focused tests where the project has test patterns available.
**Files:** support frontend/backend files
**Verify:** `cd frontend && npx tsc -b`; backend typecheck command if available; manual smoke for `/help` and `/admin/support`.

## Done

- [ ] `/help` renders the new support ticketing surface.
- [ ] Old one-way inquiry form is gone from `Help.tsx`.
- [ ] Client can create Bug, Feature Request, and Website Edit tickets.
- [ ] Client can view ticket history/status/responses.
- [ ] Client can reply on open tickets.
- [ ] Admin top bar shows `Process`, `Projects`, and `Support`.
- [ ] `/admin/support` groups tickets by client/practice.
- [ ] Admin can triage tickets and send client-visible replies.
- [ ] Resolution requires resolution notes.
- [ ] Website edit resolution email fires on resolved status.
- [ ] Client cannot see internal notes/messages.
- [ ] TypeScript checks pass or unrelated pre-existing failures are documented.
