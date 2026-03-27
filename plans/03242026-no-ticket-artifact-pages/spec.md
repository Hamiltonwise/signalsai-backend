# Artifact Pages — Host React App Builds at Website Endpoints

## Why
Alloro builds standalone React apps (savings calculators, onboarding forms, quiz apps) that currently have no way to be served as pages within client websites. Hosting them separately and iframing creates cross-origin issues and extra infrastructure. Artifact pages let admins upload a React app's build output and serve it natively at a website endpoint with full header/footer/SEO support.

## What
A new "Upload App" tab in the Create Page modal. Admin uploads a zip of a Vite/React build (containing `index.html` + assets). The system validates the base path, stores files in S3, and creates an artifact page record. The renderer serves the app at the assigned endpoint, injecting the site's header, footer, SEO meta, and code snippets into the React app's HTML.

Done when: an admin can upload a React app zip, assign it to `/calculator`, and `site.sites.getalloro.com/calculator` loads the React app wrapped with the site's header/footer and SEO tags. Sub-assets (`/calculator/assets/index-abc.js`) are served correctly.

## Context

**Relevant files (alloro):**
- `frontend/src/components/Admin/CreatePageModal.tsx` — modal with "From Template" / "Blank Page" tabs
- `frontend/src/api/websites.ts` — `createBlankPage()` API call
- `src/routes/admin/websites.ts` — admin routes including `POST /:id/pages`
- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — `createPage()` service
- `src/utils/core/s3.ts` — existing S3 upload/download utilities
- `src/database/migrations/` — Knex migration directory

**Relevant files (website-builder-rebuild):**
- `src/routes/site.ts` — `siteRoute()` main rendering orchestration, `assembleHtml()`
- `src/services/page.service.ts` — `getPageToRender()` page lookup
- `src/utils/renderer.ts` — `renderPage()`, `injectSeoMeta()`, `injectCodeSnippets()`
- `src/types/index.ts` — `Page`, `Project`, `Section` interfaces

**Patterns to follow:**
- Blank page creation flow (modal → API → service → DB insert)
- S3 key conventions from `s3.ts` (`imports/{name}/v{version}/{file}`)
- Renderer's SEO injection and code snippet injection patterns

**Key decisions:**
- React apps must be built with correct Vite `base` config (e.g., `--base=/calculator/`)
- Artifact pages are wrapped: header injected after `<body>`, footer before `</body>`, SEO into `<head>`
- Assets proxied from S3 through the renderer (browser-cached via immutable hashes)
- Admin-only — no DFY-tier user access in v1

## Constraints

**Must:**
- Third tab in CreatePageModal alongside existing "From Template" and "Blank Page"
- Validate that `index.html` asset references match the assigned slug/base path before accepting upload
- Store artifact files in S3 under a predictable key structure
- Renderer must serve artifact pages with header/footer/SEO/code-snippets injection
- Renderer must serve artifact sub-assets (JS/CSS/images) with correct content types
- Artifact page routing must not break existing page/post/redirect routing

**Must not:**
- No changes to existing sections-based page rendering
- No new npm dependencies unless absolutely required (zip extraction may need one)
- Don't modify the existing `renderPage()` function — artifact assembly is a separate code path

**Out of scope:**
- Re-upload / version management of artifacts (v1: delete and re-create)
- Editing artifact pages in the sections editor
- DFY-tier user access to artifact pages
- CLI or API-based upload (drag-drop only)
- Hot-reloading or development mode for artifacts

## Risk

**Level:** 2

**Risks identified:**
- Asset routing prefix matching could conflict with existing page/post routing → **Mitigation:** Only check for artifact asset matches after all existing routing has been exhausted (exact page, single post, redirect, home fallback). Artifact asset check is the last resort before 404.
- S3 proxying adds latency for asset requests → **Mitigation:** Set `Cache-Control: public, max-age=31536000, immutable` on proxied assets. Vite uses content-hashed filenames, so this is safe. First load is slower; subsequent loads are instant.
- Base path validation is imperfect for minified JS → **Mitigation:** Only validate `<script src>` and `<link href>` tags in `index.html`. If those are correct, internal chunk references will be too (Vite resolves relative to base).
- Header/footer injection into a React app's `<body>` may cause layout issues → **Mitigation:** This is accepted by the user. React apps need to account for header height (e.g., `padding-top`). Document this in the upload UI.

## Tasks

### T1: Database migration — add artifact columns to pages table
**Do:** Add `page_type VARCHAR DEFAULT 'sections'` and `artifact_s3_prefix VARCHAR` columns to `website_builder.pages`. Add index on `(project_id, page_type)` for artifact lookups.
**Files:** `src/database/migrations/20260324000001_add_artifact_page_columns.ts` (new), `src/database/migrations/pgsql.sql` (in migrations/ folder)
**Verify:** `npx knex migrate:latest` succeeds; columns visible in DB

### T2: Backend — artifact upload endpoint
**Do:** New endpoint `POST /api/admin/websites/:id/pages/artifact` that:
1. Accepts multipart form with `file` (zip), `path` (slug), `display_name` (optional)
2. Extracts zip in memory (use `adm-zip` or `jszip` — check what's already available)
3. Finds `index.html` in the extracted files
4. Validates that `<script src>` and `<link href>` tags in `index.html` start with the provided path (base path check)
5. Uploads all files to S3 under key `artifacts/{projectId}/{pageId}/...`
6. Creates page record with `page_type: 'artifact'`, `artifact_s3_prefix`, `status: 'published'`, `sections: null`
7. Returns the created page
**Files:** `src/routes/admin/websites.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.artifact-upload.ts` (new), `src/utils/core/s3.ts` (may need `listObjects` or bulk upload helper)
**Verify:** `curl -F file=@dist.zip -F path=/calculator POST /api/admin/websites/:id/pages/artifact` creates page and files appear in S3

### T3: Frontend — "Upload App" tab in CreatePageModal
**Do:** Add third tab "Upload App" to the mode toggle. UI includes:
1. Slug input (reuse existing `validateSlug`)
2. Display name input (optional, same as blank page)
3. Drag-and-drop zone for zip file (with click-to-browse fallback)
4. File size display after selection
5. Info box: "Upload a React/Vite app build (zip). The app must be built with base path matching the slug (e.g., vite build --base=/calculator/)."
6. On submit: POST multipart to the artifact endpoint
7. Validation feedback if base path check fails
**Files:** `frontend/src/components/Admin/CreatePageModal.tsx`, `frontend/src/api/websites.ts` (new `uploadArtifactPage()` function)
**Verify:** Manual: modal shows three tabs, zip upload works, validation errors display correctly

### T4: Renderer — serve artifact pages
**Do:** In `siteRoute()`, after `getPageToRender()` returns a page, check `page.page_type`. If `'artifact'`:
1. New function `assembleArtifactHtml(project, page)`:
   - Fetch `index.html` from S3 at `{artifact_s3_prefix}/index.html`
   - Inject header HTML after `<body>` tag (same pattern as code snippet body_start injection)
   - Inject footer HTML before `</body>` tag
   - Inject SEO meta tags via existing `injectSeoMeta()`
   - Inject code snippets via existing pattern
   - Do NOT run Tailwind compilation (React app has its own CSS)
   - Do NOT inject form handler script (React app handles its own forms)
2. For asset sub-requests (e.g., `/calculator/assets/index-abc.js`):
   - In `siteRoute()`, when no exact page match found, before the single-post/home-fallback logic, check if the path starts with any artifact page's path
   - New function `resolveArtifactAsset(projectId, path)` — queries for artifact pages, checks if path is a sub-path, fetches from S3, streams response with correct content type and cache headers
**Files:** `src/routes/site.ts`, `src/services/page.service.ts` (add `getArtifactPageByPrefix()`), `src/services/artifact.service.ts` (new — S3 fetch + stream), `src/types/index.ts` (update `Page` interface)
**Verify:** Deploy, create artifact page via admin, load `hostname.sites.getalloro.com/calculator` — React app renders with header/footer. Check network tab: assets load with correct MIME types and cache headers.

### T5: Renderer — update Page type and page service
**Do:** Update `Page` interface to include `page_type` and `artifact_s3_prefix`. Update `getPageToRender()` to return these fields (they're already in the table after migration, just need to be typed). Add `getArtifactPageByPrefix()` query that finds an artifact page whose path is a prefix of the requested URL.
**Files:** `src/types/index.ts`, `src/services/page.service.ts`
**Verify:** TypeScript compiles clean

## Done
- [ ] `npx knex migrate:latest` passes (alloro)
- [ ] `npx tsc --noEmit` passes (alloro)
- [ ] `npx tsc --noEmit` passes (website-builder-rebuild)
- [ ] Manual: CreatePageModal shows three tabs — From Template, Blank Page, Upload App
- [ ] Manual: Upload a Vite build zip with correct base path → page created, appears in page list
- [ ] Manual: Upload a zip with wrong base path → validation error shown
- [ ] Manual: Visit `hostname.sites.getalloro.com/{slug}` → React app loads with site header/footer
- [ ] Manual: Assets (JS/CSS) load correctly with immutable cache headers
- [ ] Manual: SEO meta tags present in page source
- [ ] No regressions in existing section-based page rendering
