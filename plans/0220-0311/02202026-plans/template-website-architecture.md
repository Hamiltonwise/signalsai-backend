# Template & Website Architecture

Complete documentation of how the website builder system works across the full stack. This is the single source of truth for the current implementation.

---

## High-Level Overview

The template system is a **website builder** for small businesses (dental clinics, orthodontists, etc.). Admins create structured HTML templates, assign them to projects, and an N8N pipeline populates them with real business data (scraped from Google Business Profile + existing websites). End users then fine-tune individual components via an AI-powered visual editor (Claude Haiku).

**Flow:**

```
Template (wrapper + header + footer + page blueprints with sections)
    ↓
Project created (selects template + GBP business)
    ↓
Pipeline triggered (N8N: scrape GBP → scrape website → analyze images → generate HTML)
    ↓
N8N writes pages back to DB (sections populated with real content)
    ↓
AI Editor (user clicks components in iframe, chats with Claude to edit)
    ↓
Publish page → live at *.sites.getalloro.com
```

---

## Data Model

### Relationships

```
Templates 1──N Template Pages (blueprints)
Templates 1──N Projects (via projects.template_id)
Projects  1──N Pages (actual rendered content)
```

### Templates

The root template record. Defines the shared page chrome (wrapper, header, footer) used across all pages.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(255) | Human-readable name |
| wrapper | TEXT | Full HTML document shell with `{{slot}}` placeholder |
| header | TEXT | Navigation + mobile menu HTML |
| footer | TEXT | Footer HTML |
| is_active | BOOLEAN | Only ONE template can be active at a time |
| status | VARCHAR(50) | `draft` or `published` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Rules:**
- `wrapper` MUST contain the literal string `{{slot}}` — this is where page content gets injected
- Only published templates can be activated
- Only one template can be active at a time (used as default for new projects)

### Template Pages

Pre-built page blueprints within a template. Each template page is a set of sections that serve as the starting point when generating a new project page.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| template_id | UUID | FK → templates(id), ON DELETE CASCADE |
| name | VARCHAR(255) | e.g., "Homepage", "Services", "About Us" |
| sections | JSONB | Array of `{ name, content }` objects |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Projects

A website project for a specific business. Gets its own copy of wrapper/header/footer (initially from template, can diverge via editing).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | VARCHAR(255) | |
| generated_hostname | VARCHAR(255) | UNIQUE, auto-generated (e.g., "bright-dental-4821") |
| template_id | UUID | FK → templates(id), ON DELETE SET NULL |
| wrapper | TEXT | Project's own HTML shell with `{{slot}}` |
| header | TEXT | Project's own header HTML |
| footer | TEXT | Project's own footer HTML |
| status | ENUM | See Status Workflows below |
| selected_place_id | TEXT | Google Place ID |
| selected_website_url | TEXT | Business website URL for scraping |
| step_gbp_scrape | JSONB | GBP scrape results (name, address, phone, rating, etc.) |
| step_website_scrape | JSONB | Website scrape results |
| step_image_analysis | JSONB | Image analysis results |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Rules:**
- `wrapper` MUST contain `{{slot}}` — backend validates this on every save
- wrapper/header/footer are populated by the N8N pipeline (customized from template)
- `step_*` fields store intermediate pipeline data

### Pages

Actual rendered pages belonging to a project. Supports versioning and draft/publish workflow.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| project_id | UUID | FK → projects(id), ON DELETE CASCADE |
| path | VARCHAR(255) | URL slug (e.g., `/`, `/services`, `/about-us`) |
| version | INTEGER | Auto-incrementing version number |
| status | ENUM | `draft`, `published`, `inactive` |
| sections | JSONB | Array of `{ name, content }` objects |
| edit_chat_history | JSONB | Per-component AI chat history |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Rules:**
- Multiple versions can exist per (project_id, path)
- Only ONE published version per path at a time
- Publishing a new version demotes the old published version to `inactive`
- Only `draft` pages can be edited

### Supporting Tables

**alloro_imports** — Self-hosted assets (CSS, JS, images, fonts) with versioning. Multiple versions per filename, one `published` at a time. CSS/JS stored inline in `text_content`; binary files in S3.

**admin_settings** — Key-value config store. Currently holds the AI editor system prompt (category: `websites`, key: `editing_system_prompt`).

---

## Section Format

Every page (template_page or project page) stores content as a `sections` JSONB array:

```json
[
  { "name": "hero", "content": "<section class=\"...\">Full-screen banner</section>" },
  { "name": "about", "content": "<section class=\"...\">About us</section>" },
  { "name": "services", "content": "<section class=\"...\">Service cards grid</section>" },
  { "name": "testimonials", "content": "<section class=\"...\">Review slider</section>" },
  { "name": "faq", "content": "<section class=\"...\">FAQ accordion</section>" },
  { "name": "contact", "content": "<section class=\"...\">Appointment form</section>" }
]
```

- `name` — identifier used for filtering, reordering, and AI edit targeting
- `content` — raw HTML for that section

### Component Naming Convention (alloro-tpl classes)

Templates use a CSS class naming convention to identify editable regions:

```
alloro-tpl-{hash}-section-{sectionName}                              → Section (top-level)
alloro-tpl-{hash}-section-{sectionName}-component-{componentName}    → Component (nested)
```

These classes are **stable identifiers** that:
- The AI editor uses to scope edits to a single component
- The iframe selector uses for hover/click targeting
- The serializer preserves during DOM mutations
- The LLM is instructed to NEVER remove from its output

### AI Content Markers

Templates can include comment markers in HTML for dynamic content population by the pipeline:
- `<!-- AI-CONTENT -->` — text content to be generated
- `<!-- AI-IMAGE -->` — image to be sourced
- `<!-- AI-INSTRUCTIONS: ... -->` — specific instructions for the LLM

---

## Rendering Logic

All rendering follows the same pattern across the entire stack:

```js
function renderPage(wrapper, header, footer, sections, sectionFilter?) {
  const sectionsToRender = sectionFilter
    ? sections.filter(s => sectionFilter.includes(s.name))
    : sections;

  const mainContent = sectionsToRender.map(s => s.content).join('\n');
  const pageContent = [header, mainContent, footer].join('\n');
  return wrapper.replace('{{slot}}', pageContent);
}
```

**Assembly order:** `wrapper` → inject `header + sections + footer` at `{{slot}}`

This function exists in three places:
1. `signalsai/src/utils/templateRenderer.ts` — frontend preview assembly
2. `website-builder-rebuild/src/utils/renderer.ts` — live site rendering
3. Conceptually in N8N — pipeline generates content that follows this structure

**Error handling:** If `wrapper` doesn't contain `{{slot}}`:
- Frontend editors (PageEditor, LayoutEditor) show an error message
- Site renderer returns a styled error page
- Backend PATCH endpoints reject the save with 400 `INVALID_WRAPPER`

---

## Wrapper Format

The wrapper is a full HTML document shell. It MUST contain the literal string `{{slot}}` exactly once.

**Example:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Business Name</title>
  <link rel="stylesheet" href="https://imports.getalloro.com/styles.css">
  <script src="https://imports.getalloro.com/scripts.js" defer></script>
</head>
<body class="font-sans antialiased">
  {{slot}}
</body>
</html>
```

At render time, `{{slot}}` gets replaced with: `header HTML + all section HTML + footer HTML`.

**Validation:**
- Backend rejects any wrapper save that doesn't contain `{{slot}}` (400 error)
- Frontend editors check for `{{slot}}` on load and show an error if missing
- Site renderer returns an error page if wrapper is missing `{{slot}}`

---

## Status Workflows

### Project Status (Pipeline Progression)

```
CREATED → GBP_SELECTED → GBP_SCRAPED → WEBSITE_SCRAPED → IMAGES_ANALYZED → HTML_GENERATED → READY
```

- `CREATED` — project exists, no business selected yet
- `GBP_SELECTED` — business selected, pipeline triggered
- `GBP_SCRAPED` through `HTML_GENERATED` — pipeline stages (updated by N8N)
- `READY` — all pages generated, site is live

### Page Status (Draft/Publish)

```
draft → published → inactive
```

- `draft` — editable, not visible on live site (unless no published version exists)
- `published` — visible on live site, not directly editable (must create draft first)
- `inactive` — previous published version, archived

### Template Status

```
draft ↔ published
```

Only published templates can be activated. Only one active template at a time.

---

## Pipeline (N8N)

### How Pages Get Generated

1. **User creates a project** and selects a Google Business Profile
2. **User clicks "Generate Page"** in the admin UI → opens CreatePageModal
3. **CreatePageModal** collects:
   - Template page (blueprint to use)
   - Page slug (e.g., `/services`)
   - Page context (optional description: "Orthodontic services including braces and Invisalign")
   - Business data overrides (optional)
4. **Frontend calls** `POST /api/admin/websites/start-pipeline`
5. **Backend**:
   - Fetches template data (wrapper, header, footer, template page sections)
   - Sends webhook to N8N with all data inline:
     ```json
     {
       "projectId": "uuid",
       "templateId": "uuid",
       "templatePageId": "uuid",
       "templateData": {
         "wrapper": "<!doctype html>...{{slot}}...</html>",
         "header": "<nav>...</nav>",
         "footer": "<footer>...</footer>",
         "sections": [{ "name": "hero", "content": "<section>...</section>" }]
       },
       "path": "/services",
       "placeId": "ChIJ...",
       "websiteUrl": "https://example.com",
       "pageContext": "Orthodontic services...",
       "businessName": "Bright Dental",
       "formattedAddress": "123 Main St...",
       "phone": "(555) 123-4567",
       "category": "Orthodontist",
       "rating": 4.8,
       "reviewCount": 127
     }
     ```
6. **N8N orchestrates**:
   - Scrape GBP data (if not cached)
   - Scrape business website (if URL provided)
   - Analyze images
   - Use Claude to generate page content using template sections as blueprint
   - Write customized wrapper/header/footer to the project
   - Write generated page sections to the pages table
   - Update project status through the pipeline stages
7. **Frontend polls** for the new page to appear (3-second intervals, up to 60 seconds)

### What N8N Writes Back

N8N writes directly to the database:
- **Project:** Updates `wrapper`, `header`, `footer` (customized from template for this business)
- **Pages:** Creates new page record with `sections` JSONB populated with real business content

**Important:** N8N must preserve `{{slot}}` in the wrapper. The backend validates this on PATCH, so if N8N drops it, the save will fail with a 400 error.

---

## AI Page Editor

### How Component Editing Works

**Service:** `signalsai-backend/src/services/pageEditorService.ts`
**Model:** `claude-haiku-4-5-20251001`

1. User opens PageEditor (`/admin/websites/:id/pages/:pageId/edit`)
2. Page loads: fetches page sections + project wrapper/header/footer
3. Assembles full HTML via `renderPage()` and displays in iframe
4. User hovers elements — alloro-tpl components highlight with dashed blue outline
5. User clicks a component — solid blue outline, chat panel opens
6. User types instruction (e.g., "Change the heading to 'Premium Orthodontics'")
7. Frontend sends to backend:
   ```json
   {
     "alloroClass": "alloro-tpl-abc123-section-hero-component-heading",
     "currentHtml": "<h1 class=\"alloro-tpl-abc123-section-hero-component-heading\">...</h1>",
     "instruction": "Change the heading to 'Premium Orthodontics'",
     "chatHistory": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }]
   }
   ```
8. Backend calls Claude with system prompt (from admin_settings) + conversation
9. Claude returns edited HTML (must preserve the alloro-tpl class)
10. Frontend validates the response, then:
    - Mutates iframe DOM directly (no full re-render, no flash)
    - Extracts updated section HTML from iframe DOM
    - Updates the section in the sections array
    - Auto-saves to DB (800ms debounce)
11. Chat history persists per-component in `edit_chat_history` JSONB

### System Prompt Rules

The AI editor system prompt (stored in admin_settings) instructs Claude to:
- Preserve the alloro-tpl class exactly as given
- Never add `<script>` tags or inline event handlers
- Never create new alloro classes
- Keep responsive design patterns (Tailwind md:, lg: prefixes)
- Return only the edited HTML (no markdown fences)
- Can reject unsafe edits by returning `{ "error": true, "message": "..." }`

### Layout Editing

The same AI editing flow works for project-level header and footer via the LayoutEditor (`/admin/websites/:id/layout/:field`). The wrapper is edited via Monaco code editor (no visual editing since it's the document shell).

---

## Backend API Reference

All routes under `/api/admin/websites` (file: `signalsai-backend/src/routes/admin/websites.ts`).

### Projects

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | List projects (paginated, filterable by status) |
| POST | `/` | Create project (auto-generates hostname) |
| GET | `/:id` | Get project detail with all pages |
| PATCH | `/:id` | Update project (validates `{{slot}}` in wrapper) |
| DELETE | `/:id` | Delete project (cascades to pages) |
| GET | `/:id/status` | Lightweight status poll |
| GET | `/statuses` | Get unique status values for filter dropdown |

### Pages

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/:id/pages` | List pages (optional path filter) |
| POST | `/:id/pages` | Create page (sections JSONB, optional publish) |
| GET | `/:id/pages/:pageId` | Get single page |
| PATCH | `/:id/pages/:pageId` | Update draft (sections + chat history) |
| POST | `/:id/pages/:pageId/publish` | Publish draft (demotes old published) |
| POST | `/:id/pages/:pageId/create-draft` | Clone published → new draft (idempotent) |
| DELETE | `/:id/pages/:pageId` | Delete version (not published, not last) |
| DELETE | `/:id/pages/by-path?path=...` | Delete all versions at path |

### AI Editing

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/:id/pages/:pageId/edit` | AI edit a page component |
| POST | `/:id/edit-layout` | AI edit a layout component (header/footer) |
| GET | `/editor/system-prompt` | Fetch AI system prompt |

### Templates

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/templates` | List all templates |
| POST | `/templates` | Create template (validates `{{slot}}` in wrapper) |
| GET | `/templates/:templateId` | Get template with pages |
| PATCH | `/templates/:templateId` | Update template (validates `{{slot}}`) |
| DELETE | `/templates/:templateId` | Delete template (cascades) |
| POST | `/templates/:templateId/activate` | Set as active template |

### Template Pages

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/templates/:templateId/pages` | List template pages |
| POST | `/templates/:templateId/pages` | Create template page |
| GET | `/templates/:templateId/pages/:pageId` | Get template page |
| PATCH | `/templates/:templateId/pages/:pageId` | Update template page |
| DELETE | `/templates/:templateId/pages/:pageId` | Delete template page |

### Pipeline

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/start-pipeline` | Trigger N8N webhook for page generation |
| POST | `/scrape` | Scrape a website for content/images |

### Imports (Assets)

Mounted at `/api/admin/websites/imports` (file: `signalsai-backend/src/routes/admin/imports.ts`).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/imports` | List imports (grouped by filename) |
| POST | `/imports` | Upload new asset (S3 + DB) |
| GET | `/imports/:id` | Get import with all versions |
| POST | `/imports/:id/new-version` | Upload new version |
| PATCH | `/imports/:id/status` | Change version status |
| DELETE | `/imports/:id` | Delete all versions |

### Contact Form (Public)

Route: `POST /api/websites/contact` (no auth, file: `signalsai-backend/src/routes/websiteContact.ts`)

- Validates reCAPTCHA token
- Extracts site hostname from Origin/Referer
- Sanitizes input, builds HTML email
- Forwards to N8N email webhook

---

## Frontend Architecture

### Key Files

| File | Purpose |
|------|---------|
| `signalsai/src/api/templates.ts` | API client for template CRUD + template pages |
| `signalsai/src/api/websites.ts` | API client for projects, pages, pipeline, editing |
| `signalsai/src/utils/templateRenderer.ts` | `renderPage()`, `normalizeSections()`, `parseSectionsJs()`, `serializeSectionsJs()` |
| `signalsai/src/utils/htmlReplacer.ts` | DOM mutation, section extraction, HTML validation |
| `signalsai/src/hooks/useIframeSelector.ts` | Hover/click selection of alloro-tpl elements in iframe |
| `signalsai/src/pages/admin/TemplateDetail.tsx` | Template editor (Layouts + Pages + Settings tabs) |
| `signalsai/src/pages/admin/PageEditor.tsx` | Full-screen AI page editor |
| `signalsai/src/pages/admin/LayoutEditor.tsx` | Layout editor (wrapper/header/footer) |
| `signalsai/src/pages/admin/WebsiteDetail.tsx` | Project detail (status, pages, layouts) |
| `signalsai/src/pages/admin/WebsitesList.tsx` | Project list view |
| `signalsai/src/pages/admin/TemplatesList.tsx` | Template list view |
| `signalsai/src/components/Admin/CreatePageModal.tsx` | Page creation modal |
| `signalsai/src/components/PageEditor/EditorSidebar.tsx` | AI chat sidebar |
| `signalsai/src/components/PageEditor/ChatPanel.tsx` | Per-component chat interface |
| `signalsai/src/components/PageEditor/DebugPanel.tsx` | LLM debug output |
| `signalsai/src/components/PageEditor/EditorToolbar.tsx` | Save, publish, undo toolbar |

### TypeScript Interfaces

```typescript
// Section — the atomic content unit
interface Section {
  name: string;    // e.g., "hero", "services", "contact"
  content: string; // raw HTML
}

// Template
interface Template {
  id: string;
  name: string;
  wrapper: string;   // HTML shell with {{slot}}
  header: string;    // nav HTML
  footer: string;    // footer HTML
  status: "draft" | "published";
  is_active: boolean;
  template_pages?: TemplatePage[];
  created_at: string;
  updated_at: string;
}

// Template Page (blueprint)
interface TemplatePage {
  id: string;
  template_id: string;
  name: string;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

// Project
interface WebsiteProject {
  id: string;
  user_id: string;
  generated_hostname: string;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  template_id: string | null;
  wrapper: string;
  header: string;
  footer: string;
  step_gbp_scrape: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Page
interface WebsitePage {
  id: string;
  project_id: string;
  path: string;
  version: number;
  status: string;    // "draft" | "published" | "inactive"
  sections: Section[];
  edit_chat_history: Record<string, ChatHistoryMessage[]> | null;
  created_at: string;
  updated_at: string;
}
```

### Template Editor (TemplateDetail.tsx)

**Route:** `/admin/templates/:id`

Three tabs:

**Layouts tab:**
- Field selector: wrapper | header | footer
- Monaco editor (HTML mode) for the selected field
- Wrapper must contain `{{slot}}`
- Cmd+S to save

**Pages tab:**
- Left sidebar: list of template pages (create, select, delete, rename)
- Monaco editor in JS mode for sections (backtick template literal syntax for HTML content)
- Live preview: assembles full page via `renderPage()` in iframe
- Desktop/Mobile/SEO preview modes

**Settings tab:**
- Name, status (draft/published), is_active toggle
- Publish/unpublish, activate as default
- Delete (danger zone)

### Page Editor (PageEditor.tsx)

**Route:** `/admin/websites/:id/pages/:pageId/edit`

Full-screen visual editor:
- Left: iframe preview with selector UX (hover/click alloro-tpl components)
- Right: EditorSidebar with AI chat panel + debug tab

**Flow:**
1. Load page sections + project wrapper/header/footer
2. If page is published → auto-create draft for editing
3. Assemble HTML: `renderPage(wrapper, header, footer, sections)` → iframe
4. User selects component → chat opens
5. User types instruction → AI edits component → iframe DOM mutated
6. Section extracted from DOM → sections array updated → auto-saved (800ms debounce)
7. Undo stack stores previous sections arrays

**Device modes:** Desktop (100%), Tablet (768px), Mobile (375px)

### Layout Editor (LayoutEditor.tsx)

**Route:** `/admin/websites/:id/layout/:field`

- **Wrapper:** Monaco code editor only (raw HTML with `{{slot}}`)
- **Header/Footer:** Iframe preview + AI editor sidebar (same UX as PageEditor)

### Create Page Modal (CreatePageModal.tsx)

Opened from WebsiteDetail. Fields:
1. **Template Page** — select a blueprint from the template
2. **Page Slug** — URL path (validated: starts with `/`, no spaces, alphanumeric + hyphens)
3. **Page Context** — textarea describing what the page should be about (fed to AI pipeline)
4. **Advanced: Override Business Data** — override GBP and website URL for this page only

Triggers `POST /start-pipeline` → N8N generates the page asynchronously.

### Iframe Selector Hook (useIframeSelector.ts)

Provides hover/click selection of alloro-tpl elements in the iframe:

- **CSS injection:** Disables native interactivity, enables alloro elements for selection
- **Event delegation:** Listeners on iframe body (survives DOM mutations)
- **Hover:** Blue dashed outline + floating label
- **Click:** Blue solid outline + persisted selection
- **Labels:** Purple for sections, blue for components

```typescript
interface SelectedInfo {
  alloroClass: string;                    // full class name
  label: string;                          // readable label (e.g., "section-hero")
  type: "section" | "component";
  outerHtml: string;                      // element's current outerHTML
}
```

### Utility Functions

**templateRenderer.ts:**
- `renderPage()` — assembles full HTML from parts
- `normalizeSections()` — unwraps `Section[]` or `{ sections: Section[] }` (handles N8N format)
- `parseSectionsJs()` — parses JS expression with backtick syntax → `Section[]`
- `serializeSectionsJs()` — inverse of parseSectionsJs (for editor display)

**htmlReplacer.ts:**
- `replaceComponentInDom()` — mutate iframe DOM directly (no flash)
- `extractSectionsFromDom()` — read updated section HTML from iframe after mutation
- `validateHtml()` — check HTML is parseable
- `serializeDocument()` — serialize iframe document, stripping editor artifacts

---

## Site Renderer (website-builder-rebuild)

**Location:** Separate project at `/Users/rustinedave/Desktop/website-builder-rebuild/`
**Framework:** Express.js, Node.js
**Port:** 7777 (PM2 managed)
**Domain:** `*.sites.getalloro.com` (wildcard DNS)
**Database:** Same PostgreSQL RDS as backend (`website_builder` schema)

### Request Flow

```
End user visits bright-dental-4821.sites.getalloro.com/services
    │
    ▼
subdomain.ts middleware
    → Extracts "bright-dental-4821" from host header
    │
    ▼
site.ts route
    1. getProjectByHostname("bright-dental-4821")
    2. Check project.status is HTML_GENERATED or READY
    3. getPageToRender(project.id, "/services")
       → Tries published page first, falls back to draft
    4. renderPage(project.wrapper, project.header, project.footer, page.sections)
    5. res.type('html').send(fullHtml)
    │
    ▼
Fallbacks:
    - Path not found → try home page ("/")
    - Home page not found → "Page Not Found" template
    - Project not ready → status page (shows current pipeline stage)
    - Project not found → "Site Not Found" page
    - DB connection error → "Something went wrong" error page
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, port 7777, error handler, graceful shutdown |
| `src/middleware/subdomain.ts` | Extract hostname from `*.sites.getalloro.com` |
| `src/routes/site.ts` | Main rendering — assemble and serve HTML |
| `src/services/project.service.ts` | Query projects by hostname |
| `src/services/page.service.ts` | Fetch published/draft pages |
| `src/utils/renderer.ts` | `renderPage()` + `normalizeSections()` |
| `src/types/index.ts` | TypeScript interfaces (Project, Page, Section) |
| `src/lib/db.ts` | Knex PostgreSQL connection (pool min: 0, idle timeout: 30s) |
| `src/templates/` | Error page templates (site-not-found, page-not-found, site-not-ready) |

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Admin (app.getalloro.com)                                   │
│  signalsai (React) → signalsai-backend (Express, port 3001)  │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────▼────────────────┐
          │  PostgreSQL RDS             │
          │  alloro-pgsql.*.rds.amazon  │
          │  website_builder schema     │
          └────────────▲────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────────┐
│  Site Renderer (*.sites.getalloro.com)                        │
│  website-builder-rebuild (Express, port 7777, PM2)            │
│  Wildcard DNS → subdomain extraction → DB lookup → render     │
└──────────────────────────────────────────────────────────────┘
                       │
          ┌────────────▼────────────────┐
          │  N8N (n8napp.getalloro.com) │
          │  Pipeline orchestration     │
          │  Email delivery             │
          └─────────────────────────────┘
```

All three systems share the same PostgreSQL database and `website_builder` schema.

---

## Key Dependencies

### Backend (signalsai-backend)
- `express` v5 — HTTP framework
- `knex` v3 — SQL query builder
- `pg` v8 — PostgreSQL driver
- `@anthropic-ai/sdk` — Claude API for AI editing
- `cheerio` — HTML parsing (scraping)
- `aws-sdk` / S3 — Asset storage

### Frontend (signalsai)
- `react` v19
- `react-router-dom` v7
- `@monaco-editor/react` v4 — HTML/JS code editor
- `framer-motion` v12 — Animations
- `tailwindcss` v4 — Styling
- `lucide-react` — Icons

### Site Renderer (website-builder-rebuild)
- `express` v4
- `knex` + `pg` — Same DB
- `express-async-errors` — Global error catching
- PM2 — Process management

---

## Database Details

**Engine:** PostgreSQL (AWS RDS)
**Schema:** `website_builder` (all tables prefixed)
**ORM:** Knex.js (query builder)
**Config:** `signalsai-backend/src/database/config.ts`
**Connection:** `signalsai-backend/src/database/connection.ts`
**Migrations:** `signalsai-backend/src/database/migrations/`

### Table: website_builder.alloro_imports

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| filename | VARCHAR(255) | |
| display_name | VARCHAR(255) | |
| type | VARCHAR(50) | `css`, `javascript`, `image`, `font`, `file` |
| version | INTEGER | |
| status | VARCHAR(20) | `published`, `active`, `deprecated` |
| mime_type | VARCHAR(100) | |
| file_size | INTEGER | |
| s3_key | TEXT | S3 storage path |
| s3_bucket | VARCHAR(255) | |
| content_hash | VARCHAR(64) | SHA256 |
| text_content | TEXT | Inline content for CSS/JS |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

UNIQUE: `(filename, version)`

### Table: website_builder.admin_settings

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| category | VARCHAR(100) | e.g., `websites` |
| key | VARCHAR(255) | e.g., `editing_system_prompt` |
| value | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

UNIQUE: `(category, key)`

---

## Frontend Routing

```
/admin/templates                           → TemplatesList
/admin/templates/:id                       → TemplateDetail
/admin/websites                            → WebsitesList
/admin/websites/:id                        → WebsiteDetail
/admin/websites/:id/pages/:pageId/edit     → PageEditor (full-screen, no admin layout)
/admin/websites/:id/layout/:field          → LayoutEditor (full-screen, no admin layout)
```

PageEditor and LayoutEditor render outside the admin sidebar layout for full-screen editing.
