# PM Task Attachments

## Why
Tasks in the PM tool (`/admin/pm`) are currently text-only. Users need to reference screenshots, PDFs, CSVs, and other documents attached directly to a task instead of pasting S3 URLs into descriptions or maintaining them in Notion/Drive. Attachments keep context co-located with the work.

## What
Add per-task file attachments with inline preview for common types and download for everything else.

- Upload: multipart (multer memoryStorage) via new `POST /api/pm/tasks/:id/attachments`
- Storage: S3 via existing `uploadToS3` helper; key layout `pm-attachments/{task_id}/{uuid}-{sanitized-filename}`
- Delivery: short-lived presigned URLs (1 hour) via `generatePresignedUrl`; never expose raw S3 URLs
- Size: 100 MB per file
- Count: unlimited per task
- Delete: uploader only (or task creator as fallback)
- Previewable in-app: `jpg, jpeg, png, webp, pdf, csv, txt, md, mp4` — everything else presents a download button only
- CSV preview: rendered as an HTML table via `papaparse`
- PDF preview: `<embed type="application/pdf">` with download fallback
- Video preview: native `<video controls>` for mp4
- Image preview: `<img>` with fit-to-container
- txt/md preview: rendered as plain text block (md not rendered as markdown — avoid surprise execution of user-uploaded content)

Done when: upload works end-to-end for all listed previewable types + one non-previewable type (e.g. `.zip`), preview renders correctly per type, download works for all, delete works (uploader only, others see no delete button), build passes, no S3 orphan files after task delete.

## Context

**Relevant files — backend:**
- `src/utils/core/s3.ts:30-97` — existing S3 helpers; `uploadToS3`, `getFromS3`, `deleteFromS3`, `generatePresignedUrl` are ready-made and reusable
- `src/controllers/admin-media/AdminMediaController.ts` — closest full analog for a file-upload controller (multer + validation + S3 + DB record)
- `src/controllers/admin-media/feature-services/service.media-upload.ts` — upload orchestration pattern
- `src/controllers/admin-media/feature-utils/util.validation.ts` — MIME whitelist validation pattern
- `src/controllers/admin-media/feature-utils/util.s3-helpers.ts:16-29` — `buildMediaS3Key` is the pattern to clone for `buildAttachmentS3Key`
- `src/routes/admin/media.ts` — multer wiring + route ordering reference
- `src/controllers/pm/PmTasksController.ts` — where attachment deletion must cascade (on `deleteTask`)
- `src/controllers/pm/pmActivityLogger.ts` — log `attachment_added`, `attachment_deleted` activities
- `src/models/BaseModel.ts` — new `PmTaskAttachmentModel` extends this
- `src/routes/pm/index.ts:14` — `tasksRoutes` is mounted at `/`; new routes must use absolute paths (e.g. `/tasks/:id/attachments`)

**Relevant files — frontend:**
- `frontend/src/components/pm/TaskDetailPanel.tsx` — target host for an attachments section
- `frontend/src/api/pm.ts` — add wrappers: `uploadAttachment`, `listAttachments`, `getAttachmentUrl`, `deleteAttachment`
- `frontend/src/types/pm.ts` — add `PmTaskAttachment` type
- `frontend/src/stores/pmStore.ts` — optional state: attachments per active task (or component-local state)

**Patterns to follow:**
- **Multer config:** 100 MB, `memoryStorage`, accept all MIMEs (validate against whitelist server-side after receipt), single file per request (`upload.single("file")`)
- **Route registration:** `authenticateToken` + `superAdminMiddleware` like all other PM routes
- **Error shape:** `{ success: false, error: "..." }` matching existing PM controllers
- **DB model:** thin `BaseModel` wrapper — no `jsonFields` unless needed
- **S3 key sanitization:** same `replace(/[^a-zA-Z0-9._-]/g, "_")` + 8-char uuid prefix as `buildMediaS3Key`

**Reference file:** `src/controllers/admin-media/AdminMediaController.ts` is the closest existing analog for the backend controller. Match its structure (request → service → response), its `handleError` helper shape, and its multer integration pattern.

**New npm dependency:** `papaparse` (+ `@types/papaparse`) for CSV preview on the frontend.

## Constraints

**Must:**
- Validate MIME type server-side against the preview+download whitelist (reject executables, scripts — see T1 for list)
- Persist only S3 key + metadata in DB; never persist raw file bytes
- Use presigned URLs with 1-hour expiration for all downloads and previews
- Cascade-delete attachments (S3 + DB row) when parent task is deleted
- Sanitize filenames before building S3 keys
- Reuse existing `src/utils/core/s3.ts` — do not instantiate a new S3Client

**Must not:**
- Expose permanent public S3 URLs
- Add a new S3 bucket (use existing `alloro-imports`)
- Render uploaded `.md` files as rendered markdown (XSS/abuse risk — show as plain text)
- Allow uploading executables, shell scripts, or binaries outside the documented whitelist

**Out of scope:**
- Attachment versioning (replace = upload new + delete old; no history)
- Thumbnail generation (images display via `<img>` at fit-contain)
- Direct-to-S3 presigned uploads (server-mediated only for v1)
- Per-attachment access controls beyond task-level super-admin gate
- Comments referencing attachments (Plan C handles comments separately)

## Risk

**Level:** 2 — adds S3 write surface, new MIME whitelist, new cascade behavior

**Risks identified:**
- **S3 orphans on task delete.** If DB delete succeeds but S3 delete fails, files leak. **Mitigation:** wrap attachment S3 deletes in `Promise.allSettled`; log failures but do not block task delete. Add a janitor note to backlog (not this plan) for periodic cleanup.
- **Malicious file uploads.** MIME from the client can be spoofed. **Mitigation:** validate against whitelist AND reject clearly-dangerous MIMEs (`application/x-msdownload`, `application/x-sh`, `application/javascript`, `text/html`, `application/xhtml+xml`). Store original filename for display but always use the sanitized uuid-prefixed key in S3.
- **100 MB buffer in-memory per request.** With multiple concurrent uploads, RAM pressure. **Mitigation:** acceptable for current admin-only traffic; note in spec for future move to streaming/direct-to-S3.
- **CSV preview can be huge.** A 50 MB CSV rendered as a table would kill the browser. **Mitigation:** papaparse preview capped at first 1000 rows + a "Download for full file" notice.
- **MP4 streaming from presigned URL.** Range requests work with S3 presigned GETs — verify during T5.

**Blast radius:**
- `PmTasksController.deleteTask` — gains an attachment-cleanup step; no other callers
- `pm_tasks` — no schema change; new child table only
- Frontend `TaskDetailPanel.tsx` — adds a section; other PM components untouched
- `package.json` (frontend) — adds `papaparse`

## Tasks

### T1: Migration — pm_task_attachments table
**Do:** Create migration for `pm_task_attachments`:
- `id` UUID PK (`gen_random_uuid()`)
- `task_id` UUID NOT NULL, FK to `pm_tasks(id)` ON DELETE CASCADE
- `uploaded_by` INTEGER NOT NULL (users.id)
- `filename` VARCHAR(500) NOT NULL (original, for display)
- `s3_key` VARCHAR(1000) NOT NULL (unique storage key)
- `mime_type` VARCHAR(100) NOT NULL
- `size_bytes` BIGINT NOT NULL
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- Index `(task_id, created_at DESC)`

Also scaffold `mssql.sql` and `pgsql.sql` mirrors in `migrations/` folder.

**Files:** `src/database/migrations/20260414000001_create_pm_task_attachments.ts`, `plans/04142026-no-ticket-pm-task-attachments/migrations/knexmigration.js`, `plans/04142026-no-ticket-pm-task-attachments/migrations/pgsql.sql`, `plans/04142026-no-ticket-pm-task-attachments/migrations/mssql.sql`
**Depends on:** none
**Verify:** `npx knex migrate:latest --knexfile src/database/config.ts` succeeds. `\dt pm_task_attachments` + `\d pm_task_attachments` in psql confirms schema.

### T2: Model + constants + helpers
**Do:**
- Create `src/models/PmTaskAttachmentModel.ts` — thin `BaseModel` subclass, `tableName = "pm_task_attachments"`, no `jsonFields`
- Create `src/controllers/pm/pm-attachments-utils/constants.ts` with:
  - `ALLOWED_MIME_TYPES` — full whitelist (see below)
  - `PREVIEWABLE_MIME_TYPES` — subset previewable inline
  - `BLOCKED_MIME_TYPES` — explicit reject list
  - `MAX_FILE_SIZE_BYTES` = `100 * 1024 * 1024`
- Create `src/controllers/pm/pm-attachments-utils/s3-key.ts`:
  - `buildAttachmentS3Key(taskId, filename)` → `pm-attachments/{taskId}/{uuid8}-{sanitized}`

**Whitelist (ALLOWED):** `image/jpeg, image/png, image/webp, image/gif, application/pdf, text/csv, text/plain, text/markdown, video/mp4, application/zip, application/x-zip-compressed, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/json, application/octet-stream`

**Previewable subset:** `image/jpeg, image/png, image/webp, image/gif, application/pdf, text/csv, text/plain, text/markdown, video/mp4`

**Blocked:** `application/x-msdownload, application/x-sh, application/javascript, text/html, application/xhtml+xml, application/x-executable`

**Files:** `src/models/PmTaskAttachmentModel.ts`, `src/controllers/pm/pm-attachments-utils/constants.ts`, `src/controllers/pm/pm-attachments-utils/s3-key.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit` clean

### T3: Backend controller + routes
**Do:** Create `PmAttachmentsController.ts` exporting:
- `uploadAttachment(req, res)` — validates `req.file`, checks MIME whitelist + blocked list + size, calls `uploadToS3`, inserts row, logs `attachment_added` activity, returns enriched row
- `listAttachments(req, res)` — returns `{ attachments: [...] }` for task id, joined with `users.email` for `uploaded_by_name`
- `getAttachmentDownloadUrl(req, res)` — verifies attachment exists for the task, returns `{ url: presigned, expires_at }` via `generatePresignedUrl(s3Key, 3600)`
- `deleteAttachment(req, res)` — verifies caller is uploader (or task creator fallback). Deletes S3 object via `deleteFromS3`, deletes row, logs `attachment_deleted`. Returns `{ deleted: true }`.

Update `PmTasksController.deleteTask` to:
- Before deleting the task row, select attachments by `task_id`
- Call `deleteFromS3` on each key via `Promise.allSettled` (log failures, do not throw)
- Rely on FK `ON DELETE CASCADE` to remove `pm_task_attachments` rows

Create `src/routes/pm/attachments.ts`:
- `POST /tasks/:id/attachments` (multer `upload.single("file")`, 100MB limit)
- `GET /tasks/:id/attachments`
- `GET /tasks/:id/attachments/:attachmentId/url`
- `DELETE /tasks/:id/attachments/:attachmentId`

Mount in `src/routes/pm/index.ts` under `/` (so absolute paths work).

**Files:** `src/controllers/pm/PmAttachmentsController.ts`, `src/routes/pm/attachments.ts`, `src/routes/pm/index.ts`, `src/controllers/pm/PmTasksController.ts`
**Depends on:** T2
**Verify:**
- `curl -F file=@test.pdf localhost:3000/api/pm/tasks/<id>/attachments` returns row
- `curl localhost:3000/api/pm/tasks/<id>/attachments` lists it
- `curl localhost:3000/api/pm/tasks/<id>/attachments/<aid>/url` returns presigned URL; `curl <url>` downloads the file
- Reject `.sh` upload with 400
- Reject 150 MB upload with 413
- Delete task → verify S3 objects gone via `aws s3 ls` spot check

### T4: Frontend types + API wrappers
**Do:**
- Add `PmTaskAttachment` type in `frontend/src/types/pm.ts` (mirror backend row + `uploaded_by_name`)
- Add to `frontend/src/api/pm.ts`:
  - `uploadAttachment(taskId, file, onProgress?)` — uses `FormData`, axios `onUploadProgress`
  - `listAttachments(taskId)`
  - `getAttachmentDownloadUrl(taskId, attachmentId)`
  - `deleteAttachment(taskId, attachmentId)`

**Files:** `frontend/src/types/pm.ts`, `frontend/src/api/pm.ts`
**Depends on:** T3
**Verify:** `npx tsc --noEmit` in `frontend/` clean

### T5: Attachment UI components
**Do:** Create `frontend/src/components/pm/AttachmentsSection.tsx` — the section hosted inside `TaskDetailPanel.tsx`:
- Drop zone (drag-and-drop + click-to-browse), shows filename + progress bar during upload
- List of attachments: icon by type (Lucide `FileImage`, `FileText`, `FileSpreadsheet`, `Film`, `File`), filename, uploader, size, timestamp
- Click attachment → open preview modal
- Hover → show download button and delete button (delete only for uploader)

Create `frontend/src/components/pm/AttachmentPreviewModal.tsx`:
- Image: `<img>` fit-contain, dark backdrop
- PDF: `<embed type="application/pdf" width="100%" height="100%" src={presignedUrl}>`
- Video: `<video controls src={presignedUrl}>`
- CSV: papaparse parse, render `<table>` capped at 1000 rows with footer "Showing first 1000 rows — download for full file"
- TXT/MD: fetch → `<pre>` block (no markdown rendering for safety)
- Non-previewable: icon + filename + big "Download" button
- ESC + backdrop click to close

Wire into `frontend/src/components/pm/TaskDetailPanel.tsx` — new "Attachments" section between description and activity.

**Files:** `frontend/src/components/pm/AttachmentsSection.tsx`, `frontend/src/components/pm/AttachmentPreviewModal.tsx`, `frontend/src/components/pm/TaskDetailPanel.tsx`
**Depends on:** T4, T6 (papaparse)
**Verify:** Manual for each file type: upload → appears in list → click → correct preview renders → download works → delete removes from list and S3.

### T6: Frontend dependency — papaparse
**Do:** Add `papaparse` + `@types/papaparse` to `frontend/package.json`. Run `npm install` in `frontend/`.
**Files:** `frontend/package.json`, `frontend/package-lock.json`
**Depends on:** none (can run in parallel with T1-T4)
**Verify:** `npm list papaparse` shows installed version

## Done
- [ ] Migration applied; `pm_task_attachments` table exists with correct schema and FK cascade
- [ ] Upload via `POST /api/pm/tasks/:id/attachments` persists to S3 and DB
- [ ] Blocked MIME types rejected with 400
- [ ] Files > 100 MB rejected with 413
- [ ] `GET /api/pm/tasks/:id/attachments/:aid/url` returns working presigned URL
- [ ] Deleting the parent task removes all S3 objects + rows
- [ ] Only the uploader sees a delete button; non-uploader cannot delete
- [ ] Preview renders correctly for each previewable type
- [ ] CSV preview caps at 1000 rows and indicates truncation
- [ ] Non-previewable types show download-only UI
- [ ] `npx tsc --noEmit` clean (backend + frontend)
- [ ] Activity log shows `attachment_added` and `attachment_deleted` entries
- [ ] No regressions in existing task operations (create, update, move, delete, bulk)
