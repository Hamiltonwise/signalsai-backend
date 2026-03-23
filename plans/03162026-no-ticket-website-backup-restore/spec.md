# Website Backup & Restore

## Why
There's no way to snapshot a website's state and restore it later. If a site gets corrupted, misconfigured, or needs to be cloned, there's no recovery path. This protects against data loss and enables site migration.

## What
A "Backups" tab on the single website page that lets users create full backups (pages, posts, media, menus, code, forms, signups) as downloadable `.zip` files, and restore from them. Backups are async (BullMQ), capped at 5 per project, and restore wipes the target site first.

## Context

**Relevant files:**
- `signalsai-backend/src/workers/worker.ts` — worker registration (8 existing workers)
- `signalsai-backend/src/workers/queues.ts` — queue factory (`getMindsQueue`)
- `signalsai-backend/src/utils/core/s3.ts` — `uploadToS3`, `getFromS3`, `deleteFromS3`
- `signalsai-backend/src/controllers/admin-media/feature-utils/util.s3-helpers.ts` — `buildS3Url`, `buildMediaS3Key`
- `signalsai-backend/src/controllers/admin-media/feature-services/service.media-usage.ts` — URL scanning in page sections
- `signalsai-backend/src/controllers/admin-media/feature-services/service.media-delete.ts` — S3 + DB media cleanup
- `signalsai-backend/src/models/website-builder/` — all website-builder models
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — single website page with tab system
- `signalsai/src/components/Admin/` — tab components (MediaTab, PostsTab, MenusTab, etc.)

**Patterns to follow:**
- BullMQ: DB-based status tracking, polling from frontend (see `SeoGenerationJobModel`)
- Tab pattern: `detailTab` state, tab array, `motion.div` wrapper, separate component file
- S3 helpers: `buildS3Url()`, `buildMediaS3Key()`

**Key decisions already made:**
- New BullMQ prefix `{wb}` with queue factory `getWbQueue(name)` — separate from `{minds}`
- Include form submissions and newsletter signups in backup
- Exclude reviews (GBP-synced), user_edits (audit trail), seo_generation_jobs (transient)
- Max 5 backups per project, auto-delete oldest
- Pre-signed S3 URLs for download (not server-proxied streaming)
- Confirmation-gated restore (type project name to confirm)
- Backup size estimate shown before creating

## Constraints

**Must:**
- Sequential processing of artifacts (no parallel bulk loads)
- Worker concurrency of 1
- Wipe target site data before restore (if not empty)
- Rewrite S3 URLs in JSONB sections during restore
- Follow existing BullMQ processor pattern (IDs in job data, DB status tracking, polling)

**Must not:**
- No new dependencies beyond `archiver` (zip creation) and `unzipper` (zip extraction)
- Don't buffer entire zip in memory — stream to/from S3
- Don't proxy zip download through Express — use pre-signed S3 URLs
- Don't modify existing workers or queue infrastructure

**Out of scope:**
- Scheduled/automatic backups (manual only for now)
- Cross-project restore (restore only to the same project)
- Selective restore (all-or-nothing)
- Renaming the existing `{minds}` prefix

## Risk

**Level:** 2

**Risks identified:**
- S3 URL rewriting could miss URLs in unexpected locations (custom_fields edge cases) → **Mitigation:** Build comprehensive URL map, do a global string replace across all serialized JSON, log any orphaned old URLs found post-restore
- Large media libraries (up to 5GB) could cause long-running jobs → **Mitigation:** Sequential S3 downloads with progress tracking, BullMQ handles this gracefully with concurrency 1
- Restore wipe is destructive and irreversible → **Mitigation:** Confirmation gate (type project name), suggest creating a backup before restoring
- Zip file corruption on upload → **Mitigation:** Validate zip structure and manifest before starting restore processor

## S3 URL Rewriting Strategy

### The Problem

Pages and posts store absolute S3 URLs in their data:

- **Page sections:** `[{name: "hero", content: "<img src=\"https://bucket.s3...amazonaws.com/uploads/{projectId}/{uuid}-file.webp\">"}]`
- **Post featured_image:** `"https://bucket.s3...amazonaws.com/uploads/{projectId}/{uuid}-file.webp"`
- **Post content:** Raw HTML with embedded S3 URLs
- **Post custom_fields:** `{"photo": "https://bucket.s3...amazonaws.com/uploads/..."}`

On restore, each media file gets a new S3 key (new UUID prefix). All references must be updated.

### The Solution

**During backup:**
- Export media metadata including `s3_key` and `s3_url` as-is
- Name media files in the zip using their `s3_key` basename (the `{uuid}-{filename}` part)

**During restore:**
1. Upload each media file to S3 with a **new** S3 key (`uploads/{projectId}/{newUuid}-{filename}`)
2. Build a **URL rewrite map**: `Map<oldS3Url, newS3Url>` (and same for thumbnails)
3. After all media is restored, serialize pages/posts/etc. as JSON strings
4. Run a single-pass `String.replace()` for each old URL → new URL across:
   - `pages.sections` (JSON stringified)
   - `posts.content`
   - `posts.featured_image`
   - `posts.custom_fields` (JSON stringified)
   - `post_attachments.url`
   - `header_footer_code.code`
5. Parse back to objects and insert into DB

This is safe because S3 URLs are unique (UUID prefix) and deterministic in format. A global string replace on serialized JSON won't produce false positives.

## Backup Zip Structure

```
backup-{projectName}-{YYYYMMDD-HHmmss}.zip
├── manifest.json
├── project.json
├── pages.json
├── posts.json
├── post_categories.json
├── post_tags.json
├── post_category_assignments.json
├── post_tag_assignments.json
├── post_attachments.json
├── post_blocks.json
├── menus.json
├── menu_items.json
├── header_footer_code.json
├── form_submissions.json
├── newsletter_signups.json
└── media/
    ├── media.json              (metadata records array)
    ├── {uuid}-filename.webp    (actual files, named by s3_key basename)
    └── thumbs/
        └── {uuid}-thumb.webp   (thumbnails)
```

### manifest.json

```json
{
  "version": 1,
  "created_at": "2026-03-16T...",
  "project_id": "uuid",
  "project_name": "Smith Dental",
  "template_id": "uuid",
  "counts": {
    "pages": 12,
    "posts": 45,
    "media": 87,
    "menus": 2,
    "menu_items": 14,
    "form_submissions": 230,
    "newsletter_signups": 55
  },
  "total_media_bytes": 1234567890
}
```

## Tasks

### T1: Database — backup_jobs table + model

**Do:**
- Create migration for `website_builder.backup_jobs` table:
  - `id` UUID PK
  - `project_id` UUID FK → projects (CASCADE DELETE)
  - `type` TEXT NOT NULL (`backup` | `restore`)
  - `status` TEXT NOT NULL (`queued` | `processing` | `completed` | `failed`)
  - `progress_message` TEXT (human-readable current step, e.g. "Downloading media 12/87")
  - `progress_current` INTEGER DEFAULT 0
  - `progress_total` INTEGER DEFAULT 0
  - `s3_key` TEXT (completed backup zip location)
  - `file_size` BIGINT (completed backup zip size)
  - `filename` TEXT (display name for download)
  - `error_message` TEXT
  - `created_at` TIMESTAMPTZ DEFAULT NOW()
  - `completed_at` TIMESTAMPTZ
- Create `BackupJobModel` with: `create`, `findById`, `findByProjectId` (list, ordered by created_at DESC), `markProcessing`, `updateProgress`, `markCompleted`, `markFailed`, `deleteById`, `countByProjectId`
- Index on `(project_id, created_at)`

**Files:** `signalsai-backend/src/database/migrations/XXXXXXX_create_backup_jobs.ts`, `signalsai-backend/src/models/website-builder/BackupJobModel.ts`
**Verify:** Migration runs cleanly up and down

### T2: Backend — WB queue factory + backup/restore workers

**Do:**
- Create `signalsai-backend/src/workers/wb-queues.ts` — new queue factory with `{wb}` prefix:
  ```typescript
  export function getWbQueue(name: string): Queue {
    const queueName = `wb-${name}`;
    // same lazy-init pattern as queues.ts
  }
  export async function closeWbQueues(): Promise<void>
  ```
- Create `signalsai-backend/src/workers/processors/website-backup.processor.ts`:
  - Accept `{ jobId, projectId }`
  - Mark processing in DB
  - Query each table sequentially, serialize to JSON
  - Stream media files from S3 one at a time
  - Use `archiver` to build zip (streaming, not in-memory)
  - Upload finished zip to S3 at `backups/{projectId}/{jobId}.zip`
  - Update progress throughout (`updateProgress(jobId, message, current, total)`)
  - Mark completed with s3_key and file_size
- Create `signalsai-backend/src/workers/processors/website-restore.processor.ts`:
  - Accept `{ jobId, projectId, backupJobId }` (backupJobId = the backup to restore from)
  - Download and extract zip from S3
  - Validate manifest
  - **Wipe phase:** Delete all project data (pages, posts, media, menus, code, forms, signups) + delete media files from S3 using `deleteFromS3` per file
  - **Restore phase (sequential):**
    1. Restore media files to S3 (new keys), build URL rewrite map
    2. Insert media DB records with new IDs and new S3 URLs
    3. Restore pages — apply URL rewrite to `sections` JSONB, insert
    4. Restore posts — apply URL rewrite to `content`, `featured_image`, `custom_fields`, insert
    5. Restore post categories, tags, assignments (remap IDs)
    6. Restore post attachments — apply URL rewrite to `url`
    7. Restore post blocks (template-level — only if same template)
    8. Restore menus + menu items (remap IDs, preserve hierarchy)
    9. Restore header_footer_code — apply URL rewrite to `code`
    10. Restore form submissions
    11. Restore newsletter signups
  - Update progress throughout
  - Mark completed
- Register both workers in `worker.ts` with `{wb}` prefix, concurrency 1
- Add graceful shutdown for WB workers alongside existing ones

**Files:** `signalsai-backend/src/workers/wb-queues.ts`, `signalsai-backend/src/workers/processors/website-backup.processor.ts`, `signalsai-backend/src/workers/processors/website-restore.processor.ts`, `signalsai-backend/src/workers/worker.ts`
**Verify:** Workers start without error, queues connect to Redis

### T3: Backend — URL rewrite utility

**Do:**
- Create `signalsai-backend/src/workers/processors/backup-utils/url-rewriter.ts`:
  - `buildUrlRewriteMap(oldMedia: IMedia[], newMedia: {oldId, newS3Url, newThumbS3Url}[]): Map<string, string>`
  - `rewriteUrls(input: string, urlMap: Map<string, string>): string` — single-pass replace of all old URLs with new URLs in a serialized string
  - `rewriteSections(sections: Section[], urlMap: Map<string, string>): Section[]` — stringify → rewrite → parse
  - `rewritePostContent(post: IPost, urlMap: Map<string, string>): IPost` — rewrite `content`, `featured_image`, `custom_fields`
  - `rewriteHeaderFooterCode(code: string, urlMap: Map<string, string>): string`
- Use `String.replaceAll()` iterating over map entries. Since URLs contain UUIDs, collisions are impossible.

**Files:** `signalsai-backend/src/workers/processors/backup-utils/url-rewriter.ts`
**Verify:** Unit test with sample sections containing S3 URLs, verify correct replacement

### T4: Backend — API routes for backup management

**Do:**
- Create controller `signalsai-backend/src/controllers/admin-websites/BackupController.ts`:
  - `POST /api/admin/websites/:projectId/backups` — create backup
    - Check backup count, delete oldest if >= 5 (DB + S3)
    - Calculate estimated size (`SUM(file_size)` from media table)
    - Create `backup_jobs` record (type=backup, status=queued)
    - Enqueue `wb-backup` job
    - Return job ID + estimated size
  - `GET /api/admin/websites/:projectId/backups` — list all backup jobs for project
  - `GET /api/admin/websites/:projectId/backups/:jobId/status` — poll status (progress_message, progress_current, progress_total, status)
  - `GET /api/admin/websites/:projectId/backups/:jobId/download` — generate pre-signed S3 URL (1 hour expiry), return URL
  - `POST /api/admin/websites/:projectId/backups/:jobId/restore` — start restore
    - Require `confirmation` body field matching project name
    - Create `backup_jobs` record (type=restore, status=queued)
    - Enqueue `wb-restore` job
    - Return job ID
  - `DELETE /api/admin/websites/:projectId/backups/:jobId` — delete a backup (S3 + DB)
- Register routes in `signalsai-backend/src/routes/admin/websites.ts`

**Files:** `signalsai-backend/src/controllers/admin-websites/BackupController.ts`, `signalsai-backend/src/routes/admin/websites.ts`
**Verify:** Manual: API calls return expected responses

### T5: Frontend — BackupsTab component

**Do:**
- Create `signalsai/src/components/Admin/BackupsTab.tsx`:
  - **Backup list:** Table showing previous backups (date, size, status, download/restore/delete actions)
  - **Create backup button:** Shows estimated size, confirms before starting
  - **Progress indicator:** When a backup/restore is in progress, show status with progress bar and message (poll every 3s)
  - **Restore flow:** Select a backup → confirmation modal (type project name) → progress indicator
  - **Delete backup:** Confirm dialog before deleting
  - **Empty state:** "No backups yet" with create button
  - Style consistent with existing tabs (motion.div, same card/table patterns)
- Add API module `signalsai/src/api/backups.ts`:
  - `createBackup(projectId)`
  - `listBackups(projectId)`
  - `getBackupStatus(projectId, jobId)`
  - `getBackupDownloadUrl(projectId, jobId)`
  - `restoreBackup(projectId, jobId, confirmation)`
  - `deleteBackup(projectId, jobId)`
- Add "backups" to the tab array in `WebsiteDetail.tsx`
- Add `detailTab` type union

**Files:** `signalsai/src/components/Admin/BackupsTab.tsx`, `signalsai/src/api/backups.ts`, `signalsai/src/pages/admin/WebsiteDetail.tsx`
**Verify:** Manual: Tab renders, create/list/download/restore/delete flows work end-to-end

### T6: Dependencies + integration test

**Do:**
- Install `archiver` + `@types/archiver` in signalsai-backend
- Install `unzipper` + `@types/unzipper` in signalsai-backend (or `yauzl` if unzipper types are poor)
- Add `generatePresignedUrl` to `signalsai-backend/src/utils/core/s3.ts` using `@aws-sdk/s3-request-presigner` + `GetObjectCommand`
- Verify full backup → download → restore cycle manually

**Files:** `signalsai-backend/package.json`, `signalsai-backend/src/utils/core/s3.ts`
**Verify:** `npm install` succeeds, pre-signed URL generation works

## Done
- [ ] `npx tsc --noEmit` passes in both signalsai and signalsai-backend
- [ ] Migration runs up and down cleanly
- [ ] Backup creates a valid zip with all expected files
- [ ] Download returns a working pre-signed URL
- [ ] Restore wipes existing data and restores all tables
- [ ] S3 URLs in restored pages/posts point to new valid media files
- [ ] Progress polling shows meaningful updates during backup and restore
- [ ] Max 5 backups enforced (oldest auto-deleted)
- [ ] Restore confirmation gate requires typing project name
- [ ] No regressions in existing website management features
