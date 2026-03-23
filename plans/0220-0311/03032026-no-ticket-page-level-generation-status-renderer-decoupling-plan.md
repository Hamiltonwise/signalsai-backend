# Page-Level Generation Status & Renderer Decoupling

**Date:** 03/03/2026
**Ticket:** no-ticket
**Tier:** Structural Feature
**Apps touched:** `signalsai-backend`, `signalsai` (frontend), `website-builder-rebuild` (renderer)

---

## Problem Statement

The website building pipeline tracks generation progress at the project level using a 7-value status enum (`CREATED → GBP_SELECTED → GBP_SCRAPED → WEBSITE_SCRAPED → IMAGES_ANALYZED → HTML_GENERATED → READY`). This creates three problems:

1. **Renderer coupling** — the renderer gates site access on specific project status values, making it fragile to pipeline changes.
2. **No per-page visibility** — there is no way to see which individual pages are queued, generating, or failed during a bulk creation run.
3. **False project-level semantics** — N8N rescrapes GBP and the website per page anyway, so the scraping steps were never truly project-scoped. The project status is a proxy for page completion, not a real project state.

---

## Context Summary

- **Renderer gate** (`website-builder-rebuild/src/routes/site.ts:95-101`): checks `status !== 'HTML_GENERATED' && status !== 'READY'` before falling back to `hasPublishedPages()`. The fallback already exists and works correctly — the status check is redundant.
- **N8N pipeline**: fires via webhook from `startPipeline()`. Does not create a page row — it receives `projectId`, `templatePageId`, `path`, and calls back to `PATCH /api/admin/websites/:id` to update project status. N8N uses a PostgreSQL node for these writes.
- **Pages table** (`website_builder.pages`): has `status: draft | published | inactive` (content lifecycle). No generation tracking column exists.
- **Project status**: written only at creation (`CREATED`) and via N8N callbacks. No state machine enforcement.
- **Admin UI polling**: currently polls `GET /:id/status` for project-level status. The 7-step progress bar in `WebsiteDetail.tsx` reflects project status.
- **`startPipeline()`**: does NOT pre-create the page row. N8N is responsible for page creation today.

---

## Existing Patterns to Follow

- Knex migrations in `signalsai-backend/src/database/migrations/` using timestamped filenames
- PostgreSQL schema in `website_builder` schema namespace
- Enum modifications: create new type, add temp column, migrate data, swap, drop old type
- Backend services in `feature-services/` per domain
- Routes in `src/routes/admin/` with controllers calling service layer
- Frontend polling using `setInterval` + cleanup on unmount (see existing `pollWebsiteStatus`)
- TypeScript interfaces in `src/types/index.ts` for the renderer app

---

## Proposed Approach

### Step 1 — DB Migration: Add `generation_status` to pages

Create a new enum and column. Default is `null` (existing pages are unaffected).

```
website_builder.page_generation_status: 'queued' | 'generating' | 'ready' | 'failed'
```

Column: `pages.generation_status page_generation_status NULL DEFAULT NULL`

### Step 2 — DB Migration: Simplify project status enum

Reduce from 7 values to 3. Requires: add temp column → migrate data → swap → drop old enum.

Old → New mapping:
- `CREATED` → `CREATED`
- `GBP_SELECTED`, `GBP_SCRAPED`, `WEBSITE_SCRAPED`, `IMAGES_ANALYZED`, `HTML_GENERATED` → `IN_PROGRESS`
- `READY` → `LIVE`

New enum: `'CREATED' | 'IN_PROGRESS' | 'LIVE'`

### Step 3 — Backend: Update `startPipeline()` to pre-create the page row

Before firing the N8N webhook, `startPipeline()` must:
1. Create (or upsert) a page row with `generation_status = 'queued'`, `status = 'draft'`, for the given `path`
2. Pass the resulting `pageId` in the N8N webhook payload
3. Set project `status = 'IN_PROGRESS'` at this point

This gives N8N a concrete page ID to write against.

### Step 4 — Backend: New N8N callback endpoint for page generation status

New route: `PATCH /api/admin/websites/pages/:pageId/generation-status`

Accepts:
```json
{
  "generation_status": "generating" | "ready" | "failed",
  "html_content": "...",   // only on ready
  "sections": [...],       // only on ready
  "wrapper": "...",        // only on ready — project-level layout update
  "header": "...",         // only on ready
  "footer": "..."          // only on ready
}
```

On `ready`:
- Sets `pages.generation_status = 'ready'`
- Sets `pages.status = 'draft'`
- Writes `html_content` and `sections`
- Updates `projects.wrapper/header/footer` if provided

On `failed`:
- Sets `pages.generation_status = 'failed'`

This endpoint replaces the N8N → `PATCH /api/admin/websites/:id` status update pattern.

### Step 5 — Backend: Per-page polling endpoint

New route: `GET /api/admin/websites/:projectId/pages/generation-status`

Returns:
```json
[
  { "id": "uuid", "path": "/", "name": "Home", "generation_status": "ready", "status": "draft" },
  { "id": "uuid", "path": "/about", "name": "About", "generation_status": "generating", "status": "draft" },
  { "id": "uuid", "path": "/services", "name": "Services", "generation_status": "queued", "status": "draft" }
]
```

Page `name` is inferred from the template page (joined via a `template_page_id` column — see Step 6).

### Step 6 — DB Migration: Add `template_page_id` to pages

To surface the page name in the polling UI without extra lookups, add:

```
pages.template_page_id UUID NULL REFERENCES website_builder.template_pages(id)
```

`startPipeline()` sets this when creating the page row.

### Step 7 — Backend: "Create All from Template" endpoint

New route: `POST /api/admin/websites/:projectId/create-all-from-template`

Accepts:
```json
{
  "templateId": "uuid",
  "placeId": "string",
  "pages": [
    { "templatePageId": "uuid", "path": "/", "websiteUrl": "https://..." },
    { "templatePageId": "uuid", "path": "/about", "websiteUrl": null }
  ],
  "businessName": "...",
  "formattedAddress": "...",
  "city": "...",
  "state": "...",
  "phone": "...",
  "category": "...",
  "primaryColor": "#...",
  "accentColor": "#..."
}
```

For each page entry:
1. Creates page row (`generation_status = 'queued'`, `status = 'draft'`, `template_page_id` set)
2. Fires `startPipeline()` with the new `pageId` included in the payload
3. After all pages queued, sets `project.status = 'IN_PROGRESS'`

Returns: `{ pages: [{ id, path, templatePageId, generation_status }] }`

### Step 8 — Frontend admin: New "Create All" UI

In `WebsiteDetail.tsx` (or a new sub-component), replace the single-page pipeline form with:

1. **GBP place selector** — reuse existing `searchPlaces()` / `getPlaceDetails()` (already wired)
2. **Template page list** — show each template page with: page name, path input (pre-filled from template slug), optional websiteUrl input per page
3. **"Create All Pages" button** — fires `POST /create-all-from-template`
4. **Per-page polling list** — after submission, polls `GET /:projectId/pages/generation-status` every 3 seconds, renders a row per page showing:
   - Page name + path
   - Status pill: `queued` (gray) → `generating` (amber, animated) → `ready` (green) → `failed` (red)
   - "View" link when `status = 'draft'` or `published`
5. **Remove the 7-step project status progress bar** — replace with a simpler project state indicator (`IN_PROGRESS` / `LIVE`) or remove entirely

### Step 9 — Renderer: Remove status gate

`website-builder-rebuild/src/routes/site.ts:95-101`:

Remove:
```typescript
if (project.status !== 'HTML_GENERATED' && project.status !== 'READY') {
  const hasPages = await hasPublishedPages(project.id);
  if (!hasPages) {
    res.type('html').send(siteNotReadyPage(project.status, businessName));
    return;
  }
}
```

Replace with:
```typescript
const hasPages = await hasPublishedPages(project.id);
if (!hasPages) {
  res.type('html').send(siteNotReadyPage(businessName));
  return;
}
```

Update `siteNotReadyPage()` signature — remove `status` parameter. Remove the `Status: ${status}` display line and the `statusMessages` map.

### Step 10 — Renderer: Update TypeScript types

`website-builder-rebuild/src/types/index.ts`:
- `ProjectStatus` → `'CREATED' | 'IN_PROGRESS' | 'LIVE'`
- `Page` interface → add `generation_status: 'queued' | 'generating' | 'ready' | 'failed' | null`

---

## N8N Manual Changes Required (Out of Code Scope)

The following changes must be made manually in the N8N workflow after deployment:

1. **Receive `pageId`** from the webhook payload (it will now be included)
2. **Remove** the PostgreSQL node that updates `website_builder.projects.status`
3. **Replace with** HTTP Request nodes (or PostgreSQL nodes) that call:
   - `PATCH /api/admin/websites/pages/:pageId/generation-status` with `{ "generation_status": "generating" }` at pipeline start
   - `PATCH /api/admin/websites/pages/:pageId/generation-status` with `{ "generation_status": "ready", "html_content": "...", "sections": [...] }` at pipeline end
   - `PATCH /api/admin/websites/pages/:pageId/generation-status` with `{ "generation_status": "failed" }` on error branch

---

## Risk Analysis

**Level 3 — Structural: PostgreSQL ENUM modification**
PostgreSQL does not allow removing values from an existing enum. The migration strategy (add temp column, migrate data, swap columns, drop old type, rename new type) must execute in a single transaction. If it fails mid-flight, the table could be in an inconsistent state. The migration must be tested against a staging DB before prod.

**Level 3 — Structural: Renderer is a separate deployed app**
The renderer must be deployed BEFORE the backend migration. If the backend migration runs first and sets project status to `IN_PROGRESS` for existing rows, but the old renderer is still checking for `HTML_GENERATED` / `READY`, existing live sites will start showing "not ready" pages. Deployment order is non-negotiable.

**Level 2 — Concern: N8N is an external system**
N8N workflow changes cannot be automated. There is a window between backend deployment and N8N update where the old N8N callbacks (PATCH project status) will still fire. These will succeed (endpoint still accepts PATCH), but they'll try to write old status values that no longer exist in the simplified enum — this will cause a PostgreSQL error. Mitigation: keep the old `PATCH /api/admin/websites/:id` endpoint tolerant of unknown status values (silently ignore), or update N8N immediately after backend deploy.

**Level 2 — Concern: Existing in-flight projects**
Projects currently in `GBP_SCRAPED` / `WEBSITE_SCRAPED` / etc. states will be migrated to `IN_PROGRESS`. Their pages may not have `generation_status` set (null). The polling UI should handle null gracefully — show these pages as "legacy / no tracking data."

**Level 1 — Suggestion: `LIVE` status derivation**
`LIVE` could be derived from whether any published pages exist rather than stored. Stored is simpler and consistent with the current pattern. Keep it stored.

---

## Deployment Order

1. Deploy renderer (`website-builder-rebuild`) — status gate removed, `hasPublishedPages()` only
2. Deploy backend DB migrations (pages `generation_status`, project status simplified, `template_page_id` on pages)
3. Deploy backend API changes (new endpoints, updated `startPipeline()`)
4. Deploy frontend admin changes
5. Manually update N8N workflow nodes

---

## Migration Strategy

### Migration A — Add `generation_status` to pages

```sql
CREATE TYPE website_builder.page_generation_status AS ENUM (
  'queued', 'generating', 'ready', 'failed'
);

ALTER TABLE website_builder.pages
  ADD COLUMN generation_status website_builder.page_generation_status DEFAULT NULL;

ALTER TABLE website_builder.pages
  ADD COLUMN template_page_id UUID REFERENCES website_builder.template_pages(id) ON DELETE SET NULL;
```

### Migration B — Simplify project status enum

```sql
-- 1. Add new enum type
CREATE TYPE website_builder.project_status_v2 AS ENUM ('CREATED', 'IN_PROGRESS', 'LIVE');

-- 2. Add temp column
ALTER TABLE website_builder.projects
  ADD COLUMN status_v2 website_builder.project_status_v2 DEFAULT 'CREATED';

-- 3. Migrate data
UPDATE website_builder.projects SET status_v2 = 'CREATED'     WHERE status = 'CREATED';
UPDATE website_builder.projects SET status_v2 = 'IN_PROGRESS' WHERE status IN ('GBP_SELECTED','GBP_SCRAPED','WEBSITE_SCRAPED','IMAGES_ANALYZED','HTML_GENERATED');
UPDATE website_builder.projects SET status_v2 = 'LIVE'        WHERE status = 'READY';

-- 4. Drop old column and rename
ALTER TABLE website_builder.projects DROP COLUMN status;
ALTER TABLE website_builder.projects RENAME COLUMN status_v2 TO status;
ALTER TABLE website_builder.projects ALTER COLUMN status SET NOT NULL;
ALTER TABLE website_builder.projects ALTER COLUMN status SET DEFAULT 'CREATED';

-- 5. Swap enum type
DROP TYPE website_builder.project_status;
ALTER TYPE website_builder.project_status_v2 RENAME TO project_status;
```

---

## Security Considerations

- The new `PATCH /api/admin/websites/pages/:pageId/generation-status` endpoint must require admin or service-level authentication. N8N will call it — ensure the N8N → backend connection uses the existing service auth pattern (API key or internal network restriction), not unauthenticated.

---

## Definition of Done

- [ ] `generation_status` column exists on `website_builder.pages`
- [ ] `template_page_id` column exists on `website_builder.pages`
- [ ] Project status enum has exactly 3 values: `CREATED`, `IN_PROGRESS`, `LIVE`
- [ ] Existing project rows migrated to new status values without data loss
- [ ] `startPipeline()` pre-creates the page row and passes `pageId` to N8N webhook
- [ ] `POST /api/admin/websites/:projectId/create-all-from-template` endpoint exists and creates all pages as `queued` then fires N8N per page
- [ ] `PATCH /api/admin/websites/pages/:pageId/generation-status` endpoint exists and handles `generating`, `ready`, `failed` transitions
- [ ] `GET /api/admin/websites/:projectId/pages/generation-status` endpoint returns per-page status
- [ ] Admin UI shows GBP selector, per-page config, and polling list with generation status per page
- [ ] Renderer `site.ts` gate no longer references project status
- [ ] Renderer `siteNotReadyPage()` signature no longer accepts status parameter
- [ ] Renderer `ProjectStatus` type updated to 3 values
- [ ] N8N workflow updated (manual step, documented above)
- [ ] No live sites show "not ready" after deployment

---

## Revision Log

### 03/03/2026 — Bug fix discovered during execution

**Change:** Added `existingPageId?: string` parameter to `PipelineStartParams` in `service.deployment-pipeline.ts`.

**Reason:** `createAllFromTemplate` pre-creates page rows first, then calls `startPipeline` per page. Without this parameter, `startPipeline` would create a second page row for each page, resulting in duplicate rows per pipeline invocation.

**Resolution:** When `existingPageId` is provided, `startPipeline` skips the page row insert and uses the provided ID. The `createAllFromTemplate` controller passes `existingPageId: createdPage.id` for each page it fires. Single-page flow (no `existingPageId`) is unchanged.

### 03/03/2026 — Missed file: WebsitesList.tsx not updated during execution

**Change:** Updated `WebsitesList.tsx` to use new 3-value project status enum.

**Reason:** `WebsiteDetails.tsx` was updated during execution but `WebsitesList.tsx` was missed. It still referenced `READY`, `HTML_GENERATED`, and old intermediate statuses, causing `LIVE` projects to render with a spinner instead of green status.

**Resolution:** Updated `getStatusStyles()`, `getIconStyles()`, `getIconColor()`, `isProcessingStatus()`, subdomain link gate, "View Site" button gate, and stats counters in `WebsitesList.tsx`.
