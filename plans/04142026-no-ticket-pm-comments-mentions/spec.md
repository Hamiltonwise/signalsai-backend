# PM Task Comments + @Mentions

## Why
Tasks today have a description and an activity log, but no discussion surface. Super-admins can't ask questions, leave context, or loop a teammate into a specific task without going to Slack/Notion. Adding threaded comments with @mentions and targeted notifications keeps conversation pinned to the work it's about.

## What
Add markdown comments to tasks with @-mention autocomplete and fan-out notifications.

- Storage: new `pm_task_comments` table (body markdown + separate `mentions INTEGER[]` column — no re-parsing the body to find mentions)
- Body: markdown, rendered via existing `react-markdown` with a strict sanitization config; no HTML passthrough
- Mentions: autocomplete from existing `/api/pm/users` endpoint (super-admin pool is small)
- Notification fan-out on new comment:
  - Every user id in `mentions` (except the author) → `mention_in_comment`
  - Task `assigned_to` (if not author, not already in mentions) → `task_commented`
  - Task `created_by` (if not author, not assignee, not already in mentions) → `task_commented`
- Edit: author-only. Sets `edited_at`. UI renders an "edited" label.
- Delete: author-only. Hard delete.
- `pm_notifications.type` enum extended with `mention_in_comment` and `task_commented`.

Done when: comments create/list/edit/delete works, @ autocomplete suggests users, notifications fire for mention + assignee + creator on new comment (with no duplicates, no self-notification), "edited" label appears after an edit, build passes, manual flow passes.

## Context

**Relevant files — backend:**
- `src/controllers/pm/PmTasksController.ts:9-20` — `insertNotification()` helper pattern; reuse/copy
- `src/controllers/pm/PmNotificationsController.ts` — read-side already supports arbitrary type + metadata; no changes needed for new types to appear in the feed
- `src/database/migrations/20260403000001_create_pm_notifications.ts:7-9` — the `type` column is a Knex `.enum()` which generates a `CHECK` constraint on a VARCHAR. Extending it = drop-and-recreate the check constraint with the wider list. **Not** a native PG `ALTER TYPE`.
- `src/controllers/pm/pmActivityLogger.ts` — log `comment_added`, `comment_edited`, `comment_deleted`
- `src/models/BaseModel.ts` — new `PmTaskCommentModel` extends this
- `src/routes/pm/users.ts` — already returns the super-admin list for autocomplete; no backend change required
- `src/routes/pm/index.ts:14` — tasks mounted at `/`; new comment routes use absolute paths under `/tasks/:id/comments`

**Relevant files — frontend:**
- `frontend/src/components/pm/MarkdownEditor.tsx` — reuse as the comment composer (supports `preview="edit"` mode)
- `frontend/src/components/pm/TaskDetailPanel.tsx` — target host for a `CommentsSection` under activity
- `frontend/src/components/pm/NotificationCard.tsx` — already renders generic notifications via `metadata`; update metadata shape to surface comment preview
- `frontend/src/api/pm.ts` — existing `getUsers()` returns the autocomplete source; add comment CRUD wrappers
- `frontend/src/types/pm.ts` — add `PmTaskComment` type
- `frontend/package.json` — `react-markdown@^10.1.0` already installed; no new deps

**Patterns to follow:**
- **Notifications insertion:** exact shape used in `PmTasksController.insertNotification` — `user_id`, `type`, `task_id`, `actor_user_id`, `metadata`
- **Activity logging:** `logPmActivity({ project_id, task_id, user_id, action, metadata })`
- **Controller error handling:** `handleError(res, error, operation)` local helper matching other PM controllers
- **Route middleware:** `authenticateToken` + `superAdminMiddleware`

**Reference file:** `src/controllers/pm/PmTasksController.ts` is the closest existing analog for the comments controller (transaction usage, notification emission, activity logging, enrichment with user name).

**Mention autocomplete source:** `GET /api/pm/users` already returns `[{ id, email, display_name }]` for super admins. This is the exact list for the `@` popup.

## Constraints

**Must:**
- Store `mentions` as an `INTEGER[]` column (not re-parsed from body)
- Render markdown only via `react-markdown` with `disallowedElements` configured; no raw HTML passthrough path
- Suppress self-notifications (author never notifies themselves)
- De-duplicate notifications per user per comment event (a user mentioned AND assigned gets one notification, not two — `mention_in_comment` wins)
- Preserve author-only edit/delete rules server-side (not just UI)

**Must not:**
- Use any HTML-injection render path; stay inside `react-markdown`'s safe AST
- Recompute mentions by re-parsing the body text after the fact (fragile with edits; use stored array)
- Modify `PmTasksController` beyond documentation of the pattern (comments controller has its own notification logic)

**Out of scope:**
- Threaded replies / nested comments (flat list only for v1)
- Comment reactions / emoji
- Comment editing history
- Real-time push (polling-based notifications remain unchanged)
- Email notifications (in-app only)
- Notification subscription preferences

## Risk

**Level:** 2 — pg CHECK constraint rewrite, XSS surface on markdown, notification fan-out correctness

**Risks identified:**
- **Extending `pm_notifications.type` CHECK constraint.** Knex `.enum()` on PG generates a named CHECK constraint on a VARCHAR. Extending requires `ALTER TABLE pm_notifications DROP CONSTRAINT <name>` then `ADD CONSTRAINT ... CHECK (type IN (...))`. **Mitigation:** T1 queries `information_schema.table_constraints` to locate the exact constraint name, then drops and recreates it in the migration; fall back to `ALTER TABLE ... ALTER COLUMN type TYPE VARCHAR(50)` + `ADD CHECK` if the constraint is unnamed.
- **XSS via markdown.** Users are super-admins only (trusted), but defense-in-depth still applies. **Mitigation:** `react-markdown` default rejects raw HTML; pass `disallowedElements={["script", "iframe", "object", "embed", "style"]}` and a `urlTransform` that returns empty string for non-http(s)/mailto schemes (blocks `javascript:` and `data:` on anchors).
- **Notification de-duplication.** If the assignee is also the creator and also @-mentioned, they should get exactly one notification. **Mitigation:** build recipient set in a specific priority order; a user in `mentions` gets `mention_in_comment`; then add assignee (if not in set) with `task_commented`; then add creator (if not in set) with `task_commented`; then exclude the author.
- **Mentions array drift on edit.** If an edit changes mentions, we do NOT re-send notifications for newly-added mentions in v1 (keeps edits quiet). **Mitigation:** document this explicitly; add a task-note that v2 may re-notify on newly-added edit mentions.
- **Blocking on comment delete when notifications reference it.** `pm_notifications.task_id` is FK but there is no FK to `pm_task_comments`. Deleting a comment leaves old notifications untouched — that's acceptable (notification already delivered).

**Blast radius:**
- `pm_notifications` — one-time CHECK constraint rewrite; existing rows untouched
- `pm_tasks` — no change
- `NotificationCard.tsx` — adds rendering for two new notification types
- `TaskDetailPanel.tsx` — gains a comments section; other PM components untouched

## Tasks

### T1: Migration — pm_task_comments + extend notification type enum
**Do:** Single migration with two operations:

**(a)** Create `pm_task_comments`:
- `id` UUID PK (`gen_random_uuid()`)
- `task_id` UUID NOT NULL, FK to `pm_tasks(id)` ON DELETE CASCADE
- `author_id` INTEGER NOT NULL (users.id)
- `body` TEXT NOT NULL
- `mentions` INTEGER[] NOT NULL DEFAULT '{}'
- `edited_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW() with `pm_update_timestamp` trigger
- Index `(task_id, created_at ASC)` — comments render oldest-first

**(b)** Extend `pm_notifications.type` CHECK constraint to include `mention_in_comment` and `task_commented`:
- Query `information_schema` to locate the existing CHECK constraint name
- Drop it, create a new CHECK with the full list: `task_assigned`, `task_unassigned`, `assignee_completed_task`, `mention_in_comment`, `task_commented`
- Idempotent: `IF EXISTS` on drop

Scaffold `mssql.sql` and `pgsql.sql` mirrors in `migrations/` folder.

**Files:** `src/database/migrations/20260414000002_pm_comments_and_notification_types.ts`, `plans/04142026-no-ticket-pm-comments-mentions/migrations/knexmigration.js`, `plans/04142026-no-ticket-pm-comments-mentions/migrations/pgsql.sql`, `plans/04142026-no-ticket-pm-comments-mentions/migrations/mssql.sql`
**Depends on:** none
**Verify:** `npx knex migrate:latest` succeeds. `\d pm_task_comments` confirms schema. `INSERT INTO pm_notifications (..., type='mention_in_comment', ...)` succeeds (no CHECK violation).

### T2: Model
**Do:** Create `src/models/PmTaskCommentModel.ts` — thin `BaseModel` subclass, `tableName = "pm_task_comments"`, no `jsonFields` (mentions is a native PG array, handled by knex).

**Files:** `src/models/PmTaskCommentModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` clean

### T3: Backend controller + routes
**Do:** Create `PmCommentsController.ts`:

- `createComment(req, res)` — body: `{ body, mentions: number[] }`. Validates: body non-empty, mentions is integer[]. Inside a transaction:
  1. Insert comment with body + mentions
  2. Fetch task to get `assigned_to`, `created_by`, `project_id`
  3. Build recipient set per de-duplication rule (see Risk section)
  4. Insert notifications (batch insert)
  5. Log `comment_added` activity
  6. Return enriched comment (with `author_name`, `mention_names`)
- `listComments(req, res)` — returns task's comments, oldest-first, joined with `users.email` for `author_name`. Also joins against users for `mentions` to resolve `mention_names` map.
- `updateComment(req, res)` — author-only (403 otherwise). Updates `body`, `mentions`, sets `edited_at = NOW()`. Logs `comment_edited`. Does NOT send new notifications in v1.
- `deleteComment(req, res)` — author-only. Hard delete. Logs `comment_deleted`.

Create `src/routes/pm/comments.ts`:
- `POST /tasks/:id/comments`
- `GET /tasks/:id/comments`
- `PUT /tasks/:id/comments/:commentId`
- `DELETE /tasks/:id/comments/:commentId`

Mount in `src/routes/pm/index.ts` under `/` (absolute paths).

**Files:** `src/controllers/pm/PmCommentsController.ts`, `src/routes/pm/comments.ts`, `src/routes/pm/index.ts`
**Depends on:** T2
**Verify:**
- POST creates row + notifications for mentioned user + assignee + creator (dedup correctly; self never notified)
- GET returns oldest-first with author_name
- PUT as non-author → 403; as author → updates + edited_at set
- DELETE as non-author → 403; as author → row gone
- Activity log shows `comment_added` / `comment_edited` / `comment_deleted` events

### T4: Frontend types + API wrappers
**Do:**
- Add `PmTaskComment` type in `frontend/src/types/pm.ts`:
  ```ts
  interface PmTaskComment {
    id: string;
    task_id: string;
    author_id: number;
    author_name: string;
    body: string;
    mentions: number[];
    mention_names: Record<number, string>;
    edited_at: string | null;
    created_at: string;
  }
  ```
- Add to `frontend/src/api/pm.ts`:
  - `listComments(taskId)`
  - `createComment(taskId, body, mentions)`
  - `updateComment(taskId, commentId, body, mentions)`
  - `deleteComment(taskId, commentId)`

**Files:** `frontend/src/types/pm.ts`, `frontend/src/api/pm.ts`
**Depends on:** T3
**Verify:** `npx tsc --noEmit` in `frontend/` clean

### T5: CommentComposer with @ autocomplete
**Do:** Create `frontend/src/components/pm/CommentComposer.tsx`:
- Wraps `MarkdownEditor` in `preview="edit"` mode
- Detects `@` typed in the textarea and opens a small popup listing users from `/api/pm/users` (use existing `getUsers()` API)
- Filter popup by substring of `display_name`
- Select with Enter or click → insert `@{display_name}` text into body AND push user_id into a controlled `mentions` state array
- Submit button disabled while body empty or submitting
- On submit: calls `createComment(taskId, body, mentions)`, clears state, calls `onCreated()`
- `ESC` closes popup; arrow keys navigate

Export a simpler variant `CommentEditor` that the list item uses for inline edit of an existing comment.

**Files:** `frontend/src/components/pm/CommentComposer.tsx`
**Depends on:** T4
**Verify:** Manual: type `@` → popup shows super-admins → arrow + Enter inserts name → submit creates comment with mentions populated

### T6: CommentsSection + safe rendering
**Do:** Create `frontend/src/components/pm/CommentsSection.tsx`:
- Fetches `listComments(taskId)` on mount + on comment events
- Renders list oldest-first
- Each item:
  - Avatar (initials circle), author_name, timestamp
  - Markdown body rendered via `react-markdown`. Configure:
    - `disallowedElements={["script", "iframe", "object", "embed", "style"]}`
    - `urlTransform` that returns empty string unless scheme is `http:`, `https:`, or `mailto:` (blocks `javascript:` and `data:` on anchors)
    - Do NOT enable `rehype-raw` or any raw-HTML plugin
  - Mentioned names highlighted (Alloro orange) — post-render pass over text nodes or pre-render substitute
  - If `edited_at` set: show small `(edited)` label with tooltip of edited timestamp
  - If author === current user: show edit + delete buttons on hover
  - Edit mode swaps the item for `CommentEditor` inline
- Below list: `CommentComposer`

Wire into `TaskDetailPanel.tsx` as a new "Comments" section (below Activity).

**Files:** `frontend/src/components/pm/CommentsSection.tsx`, `frontend/src/components/pm/TaskDetailPanel.tsx`
**Depends on:** T5
**Verify:** Manual:
- Post a comment with @mention → renders with highlighted name
- Edit own comment → updates, shows `(edited)` label
- Edit button not present on others' comments
- Delete confirms + removes
- Markdown renders (bold/italic/links/code); a comment body containing `<script>alert(1)</script>` renders as escaped text, never executes

### T7: NotificationCard — new types + click-through
**Do:** Update `frontend/src/components/pm/NotificationCard.tsx`:
- Add rendering branches for:
  - `mention_in_comment` → icon: `AtSign`, text: "{actor_name} mentioned you in {task_title}"
  - `task_commented` → icon: `MessageCircle`, text: "{actor_name} commented on {task_title}"
- Click navigates to the task (same pattern as existing `task_assigned`) and opens `TaskDetailPanel` scrolled to comments section

Update `PmCommentsController.createComment` metadata payload to include `{ task_title, project_name, comment_preview: body.slice(0, 100), actor_name }` so the card has everything it needs client-side (mirrors existing conventions).

**Files:** `frontend/src/components/pm/NotificationCard.tsx`, `src/controllers/pm/PmCommentsController.ts`
**Depends on:** T6, T3
**Verify:** Manual: trigger mention → bell count increments → notification card shows correct copy → click navigates to task with comments in view

## Done
- [ ] Migration applied; `pm_task_comments` table exists; `pm_notifications.type` accepts new values
- [ ] `npx tsc --noEmit` clean (backend + frontend)
- [ ] Commenting on a task creates row + notifications for mention + assignee + creator, de-duplicated, never self-notifying
- [ ] @ in composer opens autocomplete sourced from `/api/pm/users`
- [ ] Mentions stored as array, not re-parsed from body
- [ ] Markdown renders safely; `<script>` in body is escaped and does not execute
- [ ] Edit updates `edited_at`; UI shows `(edited)` label
- [ ] Delete works for author only; non-authors receive 403
- [ ] Notification card renders correct copy for `mention_in_comment` and `task_commented`
- [ ] Clicking a notification navigates to the task and scrolls to comments
- [ ] No regressions in existing notification types or task CRUD
