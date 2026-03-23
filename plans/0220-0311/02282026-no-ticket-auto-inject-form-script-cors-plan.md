# Auto-Inject Form Script & Custom Domain CORS

## Problem Statement

Rendered sites require a manually-loaded external JS file to handle form submissions. This script uses element-specific attributes (`data-form-submit`, `data-project-id`, `data-form-name`, `data-label`) to collect form data — overly complex for what's just a key-value POST.

Additionally, CORS only allows `*.sites.getalloro.com` subdomains. Sites served from custom domains (e.g. `www.brightdental.com`) get CORS-blocked when submitting forms to `app.getalloro.com`.

## Context Summary

- **`templateRenderer.ts`** (frontend) assembles HTML for editor preview: `wrapper.replace('{{slot}}', header + sections + footer)` + code snippet injection
- **`service.deployment-pipeline.ts`** (backend) sends `{ wrapper, header, footer, sections }` to N8N which generates and deploys the final site HTML
- **Code snippets are NOT sent to N8N** — only injected in the frontend preview via `injectCodeSnippets()`
- **`/api/websites/form-submission`** already accepts `{ projectId, formName, contents }` where `contents` is a simple `Record<string, string>` — no changes needed
- **CORS middleware** in `index.ts` uses a static allowlist + regex for `*.sites.getalloro.com`
- **Custom domains** stored on `website_builder.projects` as `custom_domain` and `custom_domain_alt`, with `domain_verified_at` timestamp
- **`ProjectModel`** exists but has no method to query all verified custom domains — needs one

## Existing Patterns to Follow

- Code snippet injection pattern in `templateRenderer.ts` (inject before `</body>`)
- CORS middleware is inline in `index.ts` (not a separate middleware file)
- Service layer pattern for business logic (`feature-services/`)
- `ProjectModel` extends `BaseModel` with static methods

## Proposed Approach

### 1. Create the form handler script as a shared string builder

**New file:** `signalsai-backend/src/utils/website-utils/formScript.ts`

Export a function `buildFormScript(projectId: string, apiBase: string): string` that returns an inline `<script>` tag.

The script:
- Runs on `DOMContentLoaded`
- Finds all `<form>` elements that do NOT have the `data-alloro-ignore` attribute
- Intercepts `submit` event
- Collects all `input`, `select`, `textarea` values as `{ [name || placeholder || label]: value }` key-value pairs
- Skips honeypot fields (`tabIndex === -1`), submit buttons, hidden inputs
- Groups checkboxes by name (comma-joined)
- Gets `formName` from the form's `name` attribute, `data-form-name` attribute, or falls back to `"Contact Form"`
- Shows loading/success/error states on the submit button
- POSTs to `{apiBase}/api/websites/form-submission` with `{ projectId, formName, contents }`

The `data-alloro-ignore` attribute allows any form to opt out of auto-submission (e.g. search bars, filter forms) by adding `<form data-alloro-ignore>`.

This utility lives in the backend so the deployment pipeline can import it directly.

### 2. Inject in `templateRenderer.ts` (editor preview)

- Add optional `projectId` parameter to `renderPage()`
- After code snippet injection, if `projectId` is provided, inject the form script before `</body>`
- The script string is duplicated here (frontend can't import from backend), but it's a static template — no logic drift risk
- Update all `renderPage()` call sites in `PageEditor.tsx` and `DFYWebsite.tsx` to pass `projectId`

### 3. Inject in deployment pipeline (deployed sites)

- In `service.deployment-pipeline.ts`, after building `templateData`, inject the form script into `templateData.wrapper` before `</body>`
- The `projectId` is already available in the pipeline params
- N8N receives the wrapper with the script baked in — no N8N changes needed

### 4. CORS: Add custom domain support with in-memory cache

**New file:** `signalsai-backend/src/middleware/corsCustomDomains.ts`

- On startup, query all verified custom domains: `SELECT custom_domain, custom_domain_alt FROM website_builder.projects WHERE domain_verified_at IS NOT NULL`
- Store in a `Set<string>` for O(1) lookup
- Refresh every 5 minutes via `setInterval`
- Export `isAllowedCustomDomain(origin: string): boolean` that extracts the hostname from the origin and checks the Set
- Add `refreshCustomDomainCache()` export for manual refresh after domain verification

**Modify `index.ts` CORS middleware:**
- After the existing `*.sites.getalloro.com` regex check, add a third branch:
- `else if (origin && isAllowedCustomDomain(origin))` → allow

**Add method to `ProjectModel`:**
- `static async findAllVerifiedDomains(): Promise<{ custom_domain: string; custom_domain_alt: string | null }[]>`

**Call `refreshCustomDomainCache()`** in `service.custom-domain.ts` after successful domain verification, so newly verified domains are immediately CORS-allowed without waiting for the 5-minute refresh.

### 5. Configurable recipients on projects

**Migration:** Add `recipients` column to `website_builder.projects`

```sql
ALTER TABLE website_builder.projects
  ADD COLUMN recipients JSONB DEFAULT '[]'::jsonb;
```

Stores an array of email strings, e.g. `["dr.smith@brightdental.com", "office@brightdental.com"]`.

**Default behavior:** When `recipients` is empty (`[]`), fall back to current logic (first admin of the organization). When populated, use the stored recipients exclusively.

**Modify `formSubmissionController.ts`:**
- After fetching the project, check `project.recipients`
- If non-empty array, use those emails directly
- If empty, fall back to existing org admin resolution
- This replaces the current hardcoded admin-only logic

**Update `IProject` interface** in `ProjectModel.ts`:
- Add `recipients: string[] | null`

**Backend endpoints (admin):**

Add to `AdminWebsitesController.ts`:
- `GET /:id/recipients` — returns current recipients list + available org users
- `PUT /:id/recipients` — updates the recipients array (validates email format)

**Backend endpoints (user):**

Add to user website controller:
- `GET /api/user/website/recipients` — returns current recipients
- `PUT /api/user/website/recipients` — updates recipients (scoped to their org's project)

**Admin UI — WebsiteDetail.tsx:**
- Add a "Recipients" section within the existing project detail view (not a new tab — it's a setting, not a data view)
- Shows list of current recipients with remove buttons
- Dropdown/combobox to add org users by name/email
- Option to type a custom email address
- Save button persists to backend

**User UI — DFYWebsite.tsx:**
- Add a "Recipients" settings section (gear icon or settings panel)
- Same UX as admin: list current, add from org users, add custom email, save

### 6. Form submissions storage & UI

**New table:** `website_builder.form_submissions`

```sql
CREATE TABLE website_builder.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  form_name VARCHAR(255) NOT NULL,
  contents JSONB NOT NULL,
  recipients_sent_to TEXT[] NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_form_submissions_project_id ON website_builder.form_submissions(project_id);
CREATE INDEX idx_form_submissions_submitted_at ON website_builder.form_submissions(submitted_at DESC);
```

**New model:** `signalsai-backend/src/models/website-builder/FormSubmissionModel.ts`
- `create(data)` — insert new submission
- `findByProjectId(projectId, pagination)` — paginated list, ordered by `submitted_at DESC`
- `findById(id)` — single submission detail
- `markAsRead(id)` / `markAsUnread(id)` — toggle read status
- `countUnreadByProjectId(projectId)` — for badge counts
- `deleteById(id)` — delete a submission

**Modify `formSubmissionController.ts`:**
- After sanitizing contents and resolving recipients, **save to `form_submissions` table** before sending email
- Store which recipients the email was sent to in `recipients_sent_to`
- Email sending remains fire-and-forget — submission is recorded regardless of email success

**Backend endpoints (admin):**

Add to `AdminWebsitesController.ts`:
- `GET /:id/form-submissions` — paginated list with `?page=1&limit=20&read=false` filters
- `GET /:id/form-submissions/:submissionId` — single submission detail
- `PATCH /:id/form-submissions/:submissionId/read` — mark read/unread
- `DELETE /:id/form-submissions/:submissionId` — delete submission

**Backend endpoints (user):**

Add to user website routes:
- `GET /api/user/website/form-submissions` — paginated list (scoped to their org's project)
- `GET /api/user/website/form-submissions/:id` — single submission detail
- `PATCH /api/user/website/form-submissions/:id/read` — mark read/unread

**Admin UI — WebsiteDetail.tsx:**
- Add `"form-submissions"` to the existing tab system: `"pages" | "layouts" | "media" | "code-manager" | "form-submissions"`
- Tab shows unread count badge (e.g. "Form Submissions (3)")
- Table columns: Form Name, Submitted At (relative time), Read status, Preview of first 2 fields
- Click row → expandable detail or slide-over showing all key-value pairs
- Actions: mark read/unread, delete
- Pagination at bottom

**User UI — DFYWebsite.tsx:**
- Add a "Form Submissions" tab alongside the page tabs at the top
- Same table layout as admin but without delete
- Click row → expandable detail showing all submitted fields
- Mark as read/unread
- Unread count badge on the tab

## Risk Analysis

**Level 1 — Low risk:**
- Form script injection is additive — doesn't modify existing behavior
- CORS cache is a well-understood pattern with minimal DB load (one query per 5 min)
- Recipients column is nullable with graceful fallback to existing behavior

**Level 2 — Concern:**
- All `<form>` elements are intercepted (unless they have `data-alloro-ignore`). If a template has a search bar or filter form, it will submit to the endpoint unless explicitly opted out. The `data-alloro-ignore` escape hatch covers this.
- Form script is duplicated between frontend (`templateRenderer.ts`) and backend (`formScript.ts`). Acceptable because it's a static string template with no shared logic.
- Form submissions table will grow unbounded per project. Mitigated with index on `project_id` + `submitted_at DESC` and pagination. Consider a retention policy later if needed.

## Definition of Done

### Form Script & Injection
- [x] `buildFormScript()` utility created in backend (`signalsai-backend/src/utils/website-utils/formScript.ts`)
- [x] `data-alloro-ignore` attribute respected — forms with this attribute are skipped
- [x] `templateRenderer.ts` injects form script when `projectId` is provided
- [x] All `renderPage()` call sites pass `projectId` (PageEditor.tsx + DFYWebsite.tsx inline)
- [x] Deployment pipeline injects form script into wrapper before sending to N8N

### CORS
- [x] `corsCustomDomains.ts` middleware created with cached domain lookup
- [x] CORS middleware in `index.ts` checks custom domains via cache
- [x] `ProjectModel.findAllVerifiedDomains()` added
- [x] Cache refresh called after domain verification in `service.custom-domain.ts`
- [x] Form submissions from `*.sites.getalloro.com` work (existing behavior preserved)
- [x] Form submissions from verified custom domains work (new behavior)

### Recipients
- [x] Migration adds `recipients` JSONB column to `website_builder.projects`
- [x] `IProject` interface updated with `recipients` field
- [x] `formSubmissionController.ts` uses `project.recipients` when non-empty, falls back to org admins
- [x] Admin endpoints: GET/PUT `/:id/recipients`
- [x] User endpoints: GET/PUT `/api/user/website/recipients`
- [x] Admin UI: recipients config section in WebsiteDetail (`RecipientsConfig.tsx`)
- [x] User UI: recipients config in DFYWebsite (via `RecipientsConfig` with user API overrides)

### Form Submissions Storage & UI
- [x] Migration creates `website_builder.form_submissions` table with indexes
- [x] `FormSubmissionModel` created with CRUD + pagination
- [x] `formSubmissionController.ts` saves submission to DB before sending email
- [x] Admin endpoints: list, detail, mark-read, delete form submissions
- [x] User endpoints: list, detail, mark-read form submissions
- [x] Admin UI: "Form Submissions" tab in WebsiteDetail with table, detail view, unread badge
- [x] User UI: "Form Submissions" tab in DFYWebsite with table, detail view (no delete — user view)

---

## Revision Log

### Rev 1 — 2026-02-28
**Summary:** Added configurable recipients and form submission storage/UI.
**Reason:** Form submissions need to be recorded (not just emailed), and recipients should be configurable per project rather than always defaulting to org admins.
**Changes:**
- Added Section 5: Configurable recipients on projects (new column, endpoints, admin + user UI)
- Added Section 6: Form submissions storage & UI (new table, model, endpoints, admin + user tabs)
- Updated `formSubmissionController.ts` scope: now saves submissions AND respects custom recipients
- Updated Risk Analysis and Definition of Done to cover new scope

### Rev 2 — 2026-02-28
**Summary:** Added custom page picker dropdown, version history with preview/restore.
**Reason:** Native `<select>` doesn't match the UI polish standard. Users need to see and manage page version history with the ability to preview old versions and restore them.
**Changes:**
- Replaced native `<select>` page picker with custom animated dropdown (framer-motion)
- Added version history backend: `listPageVersions`, `getPageVersionContent`, `restorePageVersion` in `userWebsite.service.ts`
- Added version history controller functions and routes: `GET /pages/:pageId/versions`, `GET /pages/:pageId/versions/:versionId`, `POST /pages/:pageId/versions/:versionId/restore`
- Created `VersionHistoryTab.tsx` component with version list, status badges, preview/restore buttons
- Modified `EditorSidebar.tsx` with `showHistory` prop and History tab rendering
- Added preview mode to `DFYWebsite.tsx`: version preview state, floating overlay with restore/exit buttons, iframe switches to previewed version's HTML
- Restore flow: marks current draft/published as inactive, creates new published + draft versions from the restored version's sections

### Definition of Done (Rev 2 additions)
- [x] Custom animated page picker dropdown with framer-motion
- [x] Backend: `GET /pages/:pageId/versions` returns all versions for a page path
- [x] Backend: `GET /pages/:pageId/versions/:versionId` returns version content
- [x] Backend: `POST /pages/:pageId/versions/:versionId/restore` restores an old version
- [x] Frontend: `VersionHistoryTab` component with version list, preview, restore
- [x] Frontend: `EditorSidebar` supports History tab via `showHistory` prop
- [x] Frontend: Preview mode with floating overlay and restore/exit controls
- [x] TypeScript compiles with zero errors
