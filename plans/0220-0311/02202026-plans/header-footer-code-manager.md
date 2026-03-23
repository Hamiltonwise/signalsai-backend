# Header Footer Code Manager (HFCM) Architecture

Complete documentation for implementing the code injection management system. This extends the template & website architecture to support custom HTML/CSS/JavaScript snippets injected at specific positions in the final rendered HTML.

---

## High-Level Overview

The Header Footer Code Manager (HFCM) allows admins to inject custom code snippets into rendered pages at four precise locations: right after `<head>`, before `</head>`, after `<body>`, and before `</body>`. Common use cases include Google Analytics, Facebook Pixel, meta tags, custom CSS, and third-party widgets.

**Key Features:**
- Template-level snippets (apply to all projects using that template)
- Project-level snippets (override template snippets by name)
- Page targeting (apply to all pages OR specific pages)
- Manual ordering (drag-and-drop)
- Enable/disable toggle
- HTML sanitization for security

**Flow:**

```
Admin creates code snippet in template
    ↓
Snippet stored in database with location + order + page targeting
    ↓
Project inherits template snippets
    ↓
Project can override template snippet by creating one with same name+location
    ↓
Renderer fetches enabled snippets, merges template + project (override by name)
    ↓
Snippets injected into HTML at specified positions
    ↓
Final HTML rendered in preview and live site
```

---

## Data Model

### header_footer_code Table

New table storing code snippets with support for both template-level and project-level snippets.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PRIMARY KEY | Auto-generated UUID |
| template_id | UUID | FK → templates(id) ON DELETE CASCADE | NULL if project-level snippet |
| project_id | UUID | FK → projects(id) ON DELETE CASCADE | NULL if template-level snippet |
| name | VARCHAR(255) | NOT NULL | Human-readable name (e.g., "Google Analytics") |
| location | VARCHAR(20) | NOT NULL, CHECK | One of: `head_start`, `head_end`, `body_start`, `body_end` |
| code | TEXT | NOT NULL | HTML/CSS/JS code (sanitized on save) |
| is_enabled | BOOLEAN | NOT NULL DEFAULT true | Toggle on/off without deleting |
| order_index | INTEGER | NOT NULL DEFAULT 0 | Execution order within location (lower = earlier) |
| page_ids | JSONB | NOT NULL DEFAULT '[]' | Empty array = all pages, otherwise specific page UUIDs |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Constraints:**
```sql
CHECK (
  (template_id IS NOT NULL AND project_id IS NULL) OR
  (template_id IS NULL AND project_id IS NOT NULL)
)
```
Ensures exactly one of template_id or project_id is set.

**Indexes:**
```sql
CREATE INDEX idx_hfc_template ON header_footer_code(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_hfc_project ON header_footer_code(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_hfc_location ON header_footer_code(location);
CREATE INDEX idx_hfc_enabled ON header_footer_code(is_enabled);
```

**Rules:**
- Snippet belongs to either template OR project (never both)
- `location` must be one of 4 valid enum values (enforced by CHECK constraint)
- `page_ids` empty array `[]` means "apply to all pages"
- `order_index` determines execution order within same location (lower = first)
- Project snippets with same `name` + `location` override template snippets
- Cascade delete when parent template/project is deleted

---

## Injection Locations

Code snippets are injected at four precise positions in the HTML document:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- head_start snippets injected here -->
  <meta charset="UTF-8">
  <title>Page Title</title>
  <!-- head_end snippets injected here -->
</head>
<body>
  <!-- body_start snippets injected here -->
  <div id="app">Page content here</div>
  <!-- body_end snippets injected here -->
</body>
</html>
```

### Location Use Cases

| Location | Use Cases | Execution Timing |
|----------|-----------|------------------|
| **head_start** | Early meta tags, Google Tag Manager (dataLayer init), critical CSS | Before any other head content |
| **head_end** | Analytics (Google Analytics, Facebook Pixel), fonts, non-critical CSS | After head content, before page render |
| **body_start** | GTM noscript, immediate scripts that need to run before DOM | Right after body opens |
| **body_end** | Deferred scripts, widgets (Intercom, Hotjar), lazy-loaded assets | After DOM fully constructed |

---

## Inheritance & Override Logic

### Template-Level Snippets

- Created in template's Code Manager tab
- Inherited by all projects using that template
- Apply globally unless overridden by project

**Example:**
```
Template "Dental Basic" has:
- "Google Analytics" (head_end, GA4 tracking code)
- "Facebook Pixel" (head_end, Meta tracking)
```

All projects using "Dental Basic" automatically get these snippets.

### Project-Level Snippets

- Created in project's Code Manager tab
- Override template snippets with matching `name` + `location`
- Can add new snippets not in template

**Override Example:**
```
Template has: "Google Analytics" (location: head_end, code: GA4 ID UA-12345)
Project creates: "Google Analytics" (location: head_end, code: GA4 ID UA-67890)

Result: Project's GA snippet replaces template's GA snippet (by name match)
```

**Append Example:**
```
Template has: "Google Analytics" (head_end)
Project creates: "Hotjar Tracking" (head_end)

Result: Both snippets execute (different names, so no override)
```

### Merge Algorithm

When rendering a project page:

1. Fetch all enabled template snippets (where `template_id` = project's template)
2. Fetch all enabled project snippets (where `project_id` = current project)
3. For each project snippet:
   - If template has snippet with same `name` + `location` → replace template snippet
   - Otherwise → append project snippet
4. Group by location, sort by `order_index` ASC
5. Inject into HTML at each location

**Code (conceptual):**
```typescript
function mergeSnippets(templateSnippets, projectSnippets) {
  const result = [...templateSnippets];

  for (const projectSnippet of projectSnippets) {
    const overrideIndex = result.findIndex(
      s => s.name === projectSnippet.name && s.location === projectSnippet.location
    );

    if (overrideIndex >= 0) {
      result[overrideIndex] = projectSnippet; // Override
    } else {
      result.push(projectSnippet); // Append
    }
  }

  return result;
}
```

---

## Page Targeting

Snippets can apply to all pages or specific pages via the `page_ids` JSONB field.

### All Pages
```json
page_ids: []
```
Empty array means snippet applies to every page in the project.

### Specific Pages
```json
page_ids: ["550e8400-e29b-41d4-a716-446655440000", "660e8400-e29b-41d4-a716-446655440001"]
```
Array of page UUIDs. Snippet only executes on these pages.

### Filtering Logic

```typescript
function filterByPage(snippets, currentPageId) {
  return snippets.filter(snippet => {
    if (snippet.page_ids.length === 0) return true; // All pages
    return snippet.page_ids.includes(currentPageId);
  });
}
```

### UI Representation

- Multi-select dropdown showing: `PageName (slug)`
- Example: "Homepage (/)", "Services (/services)", "About Us (/about)"
- Empty selection = "Applies to all pages" badge
- Selected pages = "3 pages" badge with tooltip showing page names

---

## Security: HTML Sanitization

All code snippets are sanitized on the backend before saving using the `sanitize-html` library.

### Sanitization Rules

**Allowed tags:**
- Standard HTML: `div`, `span`, `p`, `a`, `img`, etc.
- Head tags: `script`, `style`, `link`, `meta`, `noscript`
- Embed tags: `iframe` (for widgets)

**Allowed attributes:**
- `script`: `src`, `type`, `async`, `defer`, `crossorigin`, `integrity`
- `link`: `rel`, `href`, `type`, `sizes`, `media`, `crossorigin`, `integrity`
- `meta`: `name`, `content`, `property`, `charset`, `http-equiv`
- `iframe`: `src`, `width`, `height`, `frameborder`, `allowfullscreen`, `loading`
- All tags: `class`, `id`, `data-*`

**Blocked:**
- Inline event handlers (`onclick`, `onerror`, `onload`, etc.)
- `javascript:` protocol in links
- Unsafe schemes (`file://`, `data:`, etc.)
- Tags not in allowlist

### Example Sanitization

**Input:**
```html
<script src="https://www.googletagmanager.com/gtag/js"></script>
<img src="x" onerror="alert('xss')">
<a href="javascript:alert('xss')">Click</a>
```

**Output (sanitized):**
```html
<script src="https://www.googletagmanager.com/gtag/js"></script>
<img src="x">
<a>Click</a>
```

**Result:** Script tag allowed (external HTTPS source), but `onerror` handler and `javascript:` href stripped.

### Backend Implementation

```typescript
import sanitizeHtml from 'sanitize-html';

function sanitizeCodeSnippet(code: string) {
  const sanitized = sanitizeHtml(code, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'script', 'style', 'link', 'meta', 'noscript', 'iframe'
    ]),
    allowedAttributes: {
      script: ['src', 'type', 'async', 'defer', 'crossorigin', 'integrity'],
      link: ['rel', 'href', 'type', 'sizes', 'media', 'crossorigin', 'integrity'],
      meta: ['name', 'content', 'property', 'charset', 'http-equiv'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'loading'],
      '*': ['class', 'id', 'data-*']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      script: ['https'],
      link: ['https']
    }
  });

  if (!sanitized.trim()) {
    throw new Error('Code cannot be empty after sanitization');
  }

  return sanitized;
}
```

### Logging

Backend logs all snippet operations:
```
[HFCM] Created template snippet: Google Analytics at head_end
[HFCM] Updated project snippet: abc123 - changed code
[HFCM] Deleted template snippet: xyz789 (Facebook Pixel)
[HFCM] Toggled project snippet: def456 to enabled
```

---

## Rendering Integration

Code snippets are injected during the final HTML assembly step in all three rendering locations:
1. Frontend preview iframe (`signalsai/src/utils/templateRenderer.ts`)
2. Live site renderer (`website-builder-rebuild/src/utils/renderer.ts`)
3. Future N8N exports (same logic)

### Injection Algorithm

```typescript
function injectCodeSnippets(html: string, snippets: CodeSnippet[], currentPageId: string): string {
  // 1. Filter enabled snippets
  const enabled = snippets.filter(s => s.is_enabled);

  // 2. Filter by page targeting
  const targeted = enabled.filter(s => {
    if (s.page_ids.length === 0) return true; // All pages
    return s.page_ids.includes(currentPageId);
  });

  // 3. Group by location and sort by order_index
  const byLocation = {
    head_start: targeted.filter(s => s.location === 'head_start').sort((a, b) => a.order_index - b.order_index),
    head_end: targeted.filter(s => s.location === 'head_end').sort((a, b) => a.order_index - b.order_index),
    body_start: targeted.filter(s => s.location === 'body_start').sort((a, b) => a.order_index - b.order_index),
    body_end: targeted.filter(s => s.location === 'body_end').sort((a, b) => a.order_index - b.order_index),
  };

  // 4. Inject at each location
  let result = html;

  if (byLocation.head_start.length > 0) {
    const code = byLocation.head_start.map(s => s.code).join('\n');
    result = result.replace(/<head>/i, `<head>\n${code}`);
  }

  if (byLocation.head_end.length > 0) {
    const code = byLocation.head_end.map(s => s.code).join('\n');
    result = result.replace(/<\/head>/i, `${code}\n</head>`);
  }

  if (byLocation.body_start.length > 0) {
    const code = byLocation.body_start.map(s => s.code).join('\n');
    result = result.replace(/<body([^>]*)>/i, `<body$1>\n${code}`);
  }

  if (byLocation.body_end.length > 0) {
    const code = byLocation.body_end.map(s => s.code).join('\n');
    result = result.replace(/<\/body>/i, `${code}\n</body>`);
  }

  return result;
}
```

### Updated renderPage Function

**Before:**
```typescript
function renderPage(wrapper, header, footer, sections) {
  const mainContent = sections.map(s => s.content).join('\n');
  const pageContent = [header, mainContent, footer].join('\n');
  return wrapper.replace('{{slot}}', pageContent);
}
```

**After:**
```typescript
function renderPage(
  wrapper,
  header,
  footer,
  sections,
  sectionFilter,
  codeSnippets,  // NEW
  currentPageId  // NEW
) {
  const mainContent = sections.map(s => s.content).join('\n');
  const pageContent = [header, mainContent, footer].join('\n');
  let finalHtml = wrapper.replace('{{slot}}', pageContent);

  // Inject code snippets
  if (codeSnippets && codeSnippets.length > 0) {
    finalHtml = injectCodeSnippets(finalHtml, codeSnippets, currentPageId);
  }

  return finalHtml;
}
```

### Live Site Rendering

**File:** `website-builder-rebuild/src/routes/site.ts`

When rendering a project page:

```typescript
// 1. Fetch project and page data (existing logic)
const project = await db('projects').where('id', projectId).first();
const page = await db('pages').where({ project_id: projectId, path: requestPath }).first();

// 2. Fetch code snippets (NEW)
const templateSnippets = project.template_id
  ? await db('header_footer_code')
      .where({ template_id: project.template_id, is_enabled: true })
      .orderBy('order_index', 'asc')
  : [];

const projectSnippets = await db('header_footer_code')
  .where({ project_id: projectId, is_enabled: true })
  .orderBy('order_index', 'asc');

// 3. Merge snippets (project overrides template by name)
const mergedSnippets = mergeCodeSnippets(templateSnippets, projectSnippets);

// 4. Render with snippets
const html = renderPage(
  project.wrapper,
  project.header,
  project.footer,
  page.sections,
  undefined,
  mergedSnippets,
  page.id
);

res.send(html);
```

---

## API Endpoints

### Template Code Snippets

Base path: `/api/admin/websites/templates/:templateId/code-snippets`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all snippets for template |
| POST | `/` | Create new snippet |
| PATCH | `/:id` | Update snippet |
| DELETE | `/:id` | Delete snippet |
| PATCH | `/:id/toggle` | Toggle is_enabled |
| PATCH | `/reorder` | Bulk update order_index |

### Project Code Snippets

Base path: `/api/admin/websites/:projectId/code-snippets`

Same 6 endpoints as template snippets, but filtered by `project_id`.

### Request/Response Examples

**POST Create Snippet**
```json
{
  "name": "Google Analytics",
  "location": "head_end",
  "code": "<script async src=\"https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID\"></script>",
  "page_ids": [],
  "order_index": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "template_id": "abc123",
    "project_id": null,
    "name": "Google Analytics",
    "location": "head_end",
    "code": "<script async src=\"https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID\"></script>",
    "is_enabled": true,
    "order_index": 0,
    "page_ids": [],
    "created_at": "2026-02-15T10:00:00Z",
    "updated_at": "2026-02-15T10:00:00Z"
  }
}
```

**PATCH Reorder**
```json
{
  "snippetIds": ["id1", "id2", "id3"]
}
```
Sets `order_index` to 0, 1, 2 respectively.

**PATCH Toggle**
```json
{}
```
Request body empty. Flips `is_enabled` boolean.

**Response:**
```json
{
  "success": true,
  "data": {
    "is_enabled": false
  }
}
```

---

## UI Components

### 1. Code Manager Tab (in TemplateDetail and WebsiteDetail)

**Location in UI:** 4th tab after "Layouts", "Pages", "Settings"

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Code Manager                    [+ Create]     │
├─────────────────────────────────────────────────┤
│                                                 │
│  HEAD START (2 snippets)                       │
│  ┌───────────────────────────────────────────┐ │
│  │ ☰ Google Tag Manager        [●] On       │ │
│  │   All pages                  [Edit] [Del] │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ ☰ Meta Tags                 [○] Off      │ │
│  │   3 pages                    [Edit] [Del] │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  HEAD END (1 snippet)                          │
│  ┌───────────────────────────────────────────┐ │
│  │ ☰ Google Analytics          [●] On       │ │
│  │   All pages                  [Edit] [Del] │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  BODY START (0 snippets)                       │
│  [Empty state]                                 │
│                                                 │
│  BODY END (1 snippet)                          │
│  ┌───────────────────────────────────────────┐ │
│  │ ☰ Intercom Widget           [●] On       │ │
│  │   Homepage only              [Edit] [Del] │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Features:**
- Grouped by location with color-coded headers
- Drag handle (☰) for reordering within location
- Toggle switch for enable/disable (instant save)
- Page targeting summary ("All pages" or "3 pages")
- Edit/Delete buttons per snippet

### 2. Create/Edit Code Snippet Modal

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Create Code Snippet                      [×]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Name *                                        │
│  [Google Analytics                        ]    │
│                                                 │
│  Injection Location *                          │
│  [Head End                             ▼]     │
│                                                 │
│  Target Pages                                  │
│  [☐ All pages                                ] │
│  [☐ Homepage (/)                             ] │
│  [☐ Services (/services)                     ] │
│  [☑ About Us (/about)                        ] │
│                                                 │
│  Code *                                        │
│  ┌─────────────────────────────────────────┐  │
│  │ 1  <script async src="https://www.goo  │  │
│  │ 2  "></script>                          │  │
│  │ 3  <script>                             │  │
│  │ 4    window.dataLayer = window.dataL    │  │
│  │ 5    gtag('js', new Date());            │  │
│  │ 6    gtag('config', 'GA_MEASUREMENT_ID');│  │
│  │ 7  </script>                            │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│              [Cancel]  [Save Snippet]          │
└─────────────────────────────────────────────────┘
```

**Form Fields:**
- **Name** (text input, required, max 255 chars)
- **Injection Location** (dropdown, 4 options):
  - Head Start — "Right after `<head>` (early meta tags, GTM)"
  - Head End — "Before `</head>` (analytics, fonts)"
  - Body Start — "Right after `<body>` (GTM noscript)"
  - Body End — "Before `</body>` (deferred scripts, widgets)"
- **Target Pages** (multi-select with "All pages" option):
  - Checkbox for "All pages" (when checked, disables page selection)
  - Multi-select dropdown showing page name + slug
- **Code** (Monaco editor, HTML mode, 400px tall):
  - Syntax highlighting
  - Line numbers
  - Cmd+S to save
  - Minimap disabled

**Validation:**
- Name: 1-255 characters
- Location: Must be one of 4 enum values
- Code: Cannot be empty
- Backend sanitizes code and returns error if invalid

### 3. Project View: Template Snippets Inheritance

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Code Manager                    [+ Create]     │
├─────────────────────────────────────────────────┤
│                                                 │
│  [▼] Template Snippets (2)                     │
│  ┌───────────────────────────────────────────┐ │
│  │ 🔒 Google Analytics         [●] Enabled   │ │
│  │    From template: Dental Basic            │ │
│  │    ⚠️  Overridden by project snippet      │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ 🔒 Facebook Pixel           [●] Enabled   │ │
│  │    From template: Dental Basic            │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  PROJECT SNIPPETS                              │
│  HEAD END (1 snippet)                          │
│  ┌───────────────────────────────────────────┐ │
│  │ ☰ Google Analytics (Custom) [●] On       │ │
│  │   All pages                  [Edit] [Del] │ │
│  │   ⚠️  Overrides template snippet          │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Features:**
- Template snippets shown in collapsible section (read-only)
- Lock icon (🔒) indicates inherited from template
- Warning badge if project snippet overrides template snippet
- Project snippets fully editable (same UI as template view)

---

## UI Flow: Creating a Snippet

1. User clicks "+ Create" button
2. Modal opens with empty form
3. User enters:
   - Name: "Google Analytics"
   - Location: "Head End"
   - Target Pages: Select "All pages" checkbox
   - Code: Pastes GA4 tracking code
4. User clicks "Save Snippet" (or Cmd+S)
5. Frontend calls `POST /api/admin/websites/templates/:id/code-snippets`
6. Backend:
   - Validates fields
   - Sanitizes code (strips unsafe attributes)
   - Saves to database
   - Returns created snippet
7. Frontend:
   - Closes modal
   - Adds snippet to list under "HEAD END" section
   - Shows success toast: "Snippet created"
8. User can now drag to reorder, toggle on/off, edit, or delete

---

## Migration

**File:** `signalsai-backend/src/database/migrations/20260215000000_create_header_footer_code.ts`

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.header_footer_code (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      project_id UUID REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(20) NOT NULL CHECK (location IN ('head_start', 'head_end', 'body_start', 'body_end')),
      code TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      order_index INTEGER NOT NULL DEFAULT 0,
      page_ids JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (template_id IS NOT NULL AND project_id IS NULL) OR
        (template_id IS NULL AND project_id IS NOT NULL)
      )
    );

    CREATE INDEX idx_hfc_template ON website_builder.header_footer_code(template_id) WHERE template_id IS NOT NULL;
    CREATE INDEX idx_hfc_project ON website_builder.header_footer_code(project_id) WHERE project_id IS NOT NULL;
    CREATE INDEX idx_hfc_location ON website_builder.header_footer_code(location);
    CREATE INDEX idx_hfc_enabled ON website_builder.header_footer_code(is_enabled);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.header_footer_code;`);
}
```

**Run migration:**
```bash
cd signalsai-backend
npm run migrate:latest
```

---

## Critical Files

### Backend
- **Migration:** `signalsai-backend/src/database/migrations/20260215000000_create_header_footer_code.ts` (NEW)
- **Routes:** `signalsai-backend/src/routes/admin/websites.ts` (MODIFY: add 12 endpoints + sanitizer)

### Frontend
- **API Client:** `signalsai/src/api/codeSnippets.ts` (NEW)
- **Template Detail:** `signalsai/src/pages/admin/TemplateDetail.tsx` (MODIFY: add tab)
- **Website Detail:** `signalsai/src/pages/admin/WebsiteDetail.tsx` (MODIFY: add tab)
- **Code Manager Tab:** `signalsai/src/components/Admin/CodeManagerTab.tsx` (NEW)
- **Snippet Modal:** `signalsai/src/components/Admin/CodeSnippetModal.tsx` (NEW)
- **Renderer:** `signalsai/src/utils/templateRenderer.ts` (MODIFY: add injection)

### Live Site
- **Renderer:** `website-builder-rebuild/src/utils/renderer.ts` (MODIFY: add injection)
- **Site Route:** `website-builder-rebuild/src/routes/site.ts` (MODIFY: fetch + merge snippets)

---

## Dependencies

**Backend:**
```bash
npm install sanitize-html @types/sanitize-html
```

**Frontend:**
```bash
npm install react-beautiful-dnd @types/react-beautiful-dnd
```

---

## Testing Checklist

### Backend
- [ ] Create snippet with valid HTML → saves sanitized version
- [ ] Create snippet with XSS (`<img onerror>`) → strips dangerous attributes
- [ ] Toggle snippet on/off → updates `is_enabled` field
- [ ] Delete snippet → removes from database
- [ ] Reorder snippets → updates `order_index` correctly
- [ ] Page targeting: empty array vs specific page IDs
- [ ] Template/project inheritance: project snippet overrides template by name

### Frontend
- [ ] Create snippet → appears in list grouped by location
- [ ] Drag-and-drop reorder → persists after refresh
- [ ] Edit snippet → changes saved correctly
- [ ] Monaco editor → syntax highlighting works, Cmd+S saves
- [ ] Page targeting dropdown → multi-select works, "All pages" option
- [ ] Enable/disable toggle → updates immediately
- [ ] Delete confirmation → requires confirmation, actually deletes

### Rendering
- [ ] Template preview → snippets appear in correct positions
- [ ] Live site → snippets appear in published site
- [ ] Project override → project snippet replaces template snippet
- [ ] Page targeting → snippet only on targeted pages
- [ ] Disabled snippets → do not appear in HTML
- [ ] Multiple snippets same location → execute in order_index order

### Security
- [ ] XSS attempts → sanitized before saving
- [ ] SQL injection in name → escaped by Knex
- [ ] Invalid JSON in page_ids → validation error
- [ ] Malformed HTML → sanitizer handles gracefully

---

## Known Limitations

1. **Regex-based injection:** Uses regex to find `<head>`, `<body>` tags. Could break with unusual HTML structures (uppercase tags, comments). Mitigation: Use case-insensitive regex with attribute matching.

2. **No CSP nonce support:** If wrapper has strict Content-Security-Policy, injected scripts must comply. Future: Add nonce injection.

3. **No snippet variables:** Code is static. Cannot inject dynamic values like `{{business_name}}`. Future enhancement.

4. **No scheduling:** Cannot enable/disable snippets based on date ranges. Future enhancement.

5. **Drag-and-drop mobile:** `react-beautiful-dnd` doesn't work well on touch devices. Fallback: Show up/down arrow buttons.

---

## Future Enhancements (Out of Scope)

- **Snippet Library:** Pre-built snippets for GA4, Facebook Pixel, Hotjar, etc.
- **Versioning:** Track edit history, rollback capability
- **Scheduling:** Enable/disable based on date ranges
- **A/B Testing:** Show different snippets to different users
- **Variables:** Replace `{{business_name}}` with project GBP data
- **Conditional Logic:** "Show only on mobile", "Show only if logged in"
- **URL Pattern Matching:** Target pages by regex (e.g., `/blog/.*`)
- **Import/Export:** Download snippets as JSON, import to another template
- **Audit Trail:** Database table tracking all changes with user attribution

---

## Success Criteria

✅ Admin can create code snippets in template with name, location, code, page targeting
✅ Admin can enable/disable snippets without deleting
✅ Admin can reorder snippets via drag-and-drop
✅ Admin can edit/delete snippets
✅ Code is sanitized on backend before saving (XSS protection)
✅ Snippets inject correctly into `<head>` and `<body>` at 4 positions
✅ Preview iframe shows injected code
✅ Live site renders injected code
✅ Project-level snippets override template snippets by name
✅ Page targeting works (all pages vs specific pages)
✅ Monaco editor provides syntax highlighting
✅ No console errors, no XSS vulnerabilities
✅ Page load time increase <100ms

---

## Questions Resolved

1. **Inheritance:** Override by name (not append)
2. **Sanitizer:** `sanitize-html` library
3. **Page targeting:** Empty array = all pages (no boolean flag)
4. **Audit:** Console logs only (no database table in v1)
5. **Editor:** Monaco (consistent with layouts)
