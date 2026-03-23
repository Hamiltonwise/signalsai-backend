# Admin Websites Route Refactor Plan

## Executive Summary

**File**: `/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/websites.ts`
**Current Size**: 2,771 LOC
**Total Endpoints**: 44 routes
**Complexity Level**: VERY HIGH — Complete website builder system
**Risk Level**: Level 4 — Major Impact

This is the second most complex route file in the system. It encompasses:
- Complete project lifecycle management
- Template system with multi-page support
- Page versioning and publishing workflow
- AI-powered page editing via Claude
- Website scraping with HTML parsing
- N8N webhook integration for deployment pipeline
- Header/Footer Code Management (HFCM) system for both templates and projects
- Organization linking with DFY tier validation

---

## Current State Analysis

### File Statistics
- **Total Lines**: 2,771
- **Handlers**: ~1,500 LOC
- **Helper Functions**: ~250 LOC
- **Scraper Logic**: ~350 LOC
- **Constants**: ~10 LOC
- **Imports**: ~15 LOC

### Endpoint Inventory (44 Routes)

#### 1. Project Management (9 endpoints)
```
GET    /                           → List all projects with pagination + org join
POST   /                           → Create new project
GET    /statuses                   → Get unique project statuses
GET    /:id/status                 → Lightweight status polling
PATCH  /:id/link-organization      → Link/unlink organization (DFY validation)
GET    /:id                        → Get single project with pages
PATCH  /:id                        → Update project
DELETE /:id                        → Delete project (cascade pages)
POST   /start-pipeline             → Trigger N8N webhook for deployment
```

#### 2. Template Management (8 endpoints)
```
GET    /templates                  → List all templates
POST   /templates                  → Create template (validate {{slot}})
GET    /templates/:id              → Get template with pages
PATCH  /templates/:id              → Update template
DELETE /templates/:id              → Delete template
POST   /templates/:id/activate     → Set active template
GET    /editor/system-prompt       → Get page editor system prompt
POST   /scrape                     → Scrape website for content
```

#### 3. Template Pages (5 endpoints)
```
GET    /templates/:templateId/pages           → List template pages
POST   /templates/:templateId/pages           → Create template page
GET    /templates/:templateId/pages/:pageId   → Get template page
PATCH  /templates/:templateId/pages/:pageId   → Update template page
DELETE /templates/:templateId/pages/:pageId   → Delete template page
```

#### 4. Project Pages (10 endpoints)
```
GET    /:id/pages                     → List project pages (filter by path)
POST   /:id/pages                     → Create page version
POST   /:id/pages/:pageId/publish     → Publish page (unpublish others)
GET    /:id/pages/:pageId             → Get single page
PATCH  /:id/pages/:pageId             → Update draft page sections/chat
DELETE /:id/pages/by-path             → Delete all versions at path
DELETE /:id/pages/:pageId             → Delete page version (not published)
POST   /:id/pages/:pageId/create-draft → Clone published → draft (idempotent)
POST   /:id/pages/:pageId/edit        → AI edit page component (Claude)
POST   /:id/edit-layout               → AI edit layout component (Claude)
```

#### 5. Template HFCM (6 endpoints)
```
GET    /templates/:templateId/code-snippets           → List snippets
POST   /templates/:templateId/code-snippets           → Create snippet
PATCH  /templates/:templateId/code-snippets/:id       → Update snippet
DELETE /templates/:templateId/code-snippets/:id       → Delete snippet
PATCH  /templates/:templateId/code-snippets/:id/toggle → Toggle enabled
PATCH  /templates/:templateId/code-snippets/reorder   → Reorder snippets
```

#### 6. Project HFCM (6 endpoints)
```
GET    /:projectId/code-snippets           → List snippets
POST   /:projectId/code-snippets           → Create snippet
PATCH  /:projectId/code-snippets/:id       → Update snippet
DELETE /:projectId/code-snippets/:id       → Delete snippet
PATCH  /:projectId/code-snippets/:id/toggle → Toggle enabled
PATCH  /:projectId/code-snippets/reorder   → Reorder snippets
```

### Dependencies

**External Libraries**:
- `express` - routing
- `cheerio` - HTML parsing for scraper
- `sanitize-html` - code snippet sanitization
- `fs`, `path` - file logging for scraper

**Internal Dependencies**:
- `db` from `../../database/connection` - raw Knex instance
- `importsRouter` from `./imports` - sub-router
- `getPageEditorPrompt` from `../../prompts/pageEditorPrompt` - dynamic import
- `editHtmlComponent` from `../../services/pageEditorService` - dynamic import (Claude AI)

**Environment Variables**:
- `N8N_WEBHOOK_START_PIPELINE` - deployment webhook URL
- `SCRAPER_API_KEY` - scraper endpoint authentication

**Table Constants**:
```typescript
PROJECTS_TABLE = "website_builder.projects"
PAGES_TABLE = "website_builder.pages"
TEMPLATES_TABLE = "website_builder.templates"
TEMPLATE_PAGES_TABLE = "website_builder.template_pages"
HFC_TABLE = "website_builder.header_footer_code"
```

### Helper Functions (4)
1. **`normalizeSections(raw: unknown): any[]`** (~12 LOC)
   - Handles N8N webhook format variations
   - Extracts sections array from both `[...]` and `{sections: [...]}`

2. **`generateHostname(): string`** (~25 LOC)
   - Generates random project hostnames
   - Format: `{adjective}-{noun}-{4-digit-number}`
   - Lists: 8 adjectives, 8 nouns

3. **`sanitizeCodeSnippet(code: string)`** (~30 LOC)
   - HTML sanitization for HFCM snippets
   - Allows: script, style, link, meta, noscript, iframe tags
   - Validates: code not empty, returns `{sanitized, isValid, error?}`

4. **Scraper Helpers** (~185 LOC total)
   - `estimateTokens(text: string): number`
   - `toAbsoluteUrl(href: string, baseUrl: string): string | null`
   - `isInternalUrl(url: string, baseUrl: string): boolean`
   - `getPageName(url: string): string`
   - `isValidImageUrl(url: string): boolean`
   - `fetchPage(url: string): Promise<string | null>`
   - `extractInternalLinks(html: string, baseUrl: string): string[]`
   - `extractImages(html: string, baseUrl: string): string[]`
   - `scrapeLogger` object with file-based logging

### Direct Database Calls (83 total)

**Projects Table** (~28 calls):
- `db(PROJECTS_TABLE).count()` - count with status filter
- `db(PROJECTS_TABLE).leftJoin("organizations")` - list with org data
- `db(PROJECTS_TABLE).insert().returning("*")` - create
- `db(PROJECTS_TABLE).distinct("status")` - get statuses
- `db(PROJECTS_TABLE).select(...).where("id", id).first()` - get by id
- `db(PROJECTS_TABLE).update().returning("*")` - update
- `db(PROJECTS_TABLE).where("id", id).del()` - delete
- `db(PROJECTS_TABLE).where("organization_id", orgId)` - org linking checks
- `db("organizations").where("id", id).first()` - org validation

**Pages Table** (~22 calls):
- `db(PAGES_TABLE).where("project_id", id).orderBy()` - list pages
- `db(PAGES_TABLE).insert().returning("*")` - create page
- `db(PAGES_TABLE).where({...}).orderBy("version", "desc").first()` - get latest version
- `db(PAGES_TABLE).where({...}).update()` - update page/status
- `db(PAGES_TABLE).where({...}).del()` - delete page
- `db(PAGES_TABLE).count()` - count siblings for deletion check

**Templates Table** (~12 calls):
- `db(TEMPLATES_TABLE).orderBy("created_at", "desc")` - list templates
- `db(TEMPLATES_TABLE).insert().returning("*")` - create
- `db(TEMPLATES_TABLE).where("id", id).first()` - get by id
- `db(TEMPLATES_TABLE).where("is_active", true).first()` - get active
- `db(TEMPLATES_TABLE).update()` - update/activate
- `db(TEMPLATES_TABLE).del()` - delete

**Template Pages Table** (~8 calls):
- `db(TEMPLATE_PAGES_TABLE).where("template_id", id)` - list by template
- `db(TEMPLATE_PAGES_TABLE).insert().returning("*")` - create
- `db(TEMPLATE_PAGES_TABLE).where({id, template_id}).first()` - get by id
- `db(TEMPLATE_PAGES_TABLE).update()` - update
- `db(TEMPLATE_PAGES_TABLE).del()` - delete

**Header Footer Code Table** (~12 calls):
- `db(HFC_TABLE).where({template_id/project_id}).orderBy()` - list snippets
- `db(HFC_TABLE).insert().returning("*")` - create snippet
- `db(HFC_TABLE).where("id", id).first()` - get snippet
- `db(HFC_TABLE).update()` - update snippet
- `db(HFC_TABLE).del()` - delete snippet
- `db.transaction()` - reorder snippets atomically

**Media Table** (~1 call):
- `db("website_builder.media").where({project_id})` - fetch for AI context

---

## Target Architecture

### Folder Structure

```
src/
├── controllers/
│   └── admin-websites/
│       ├── AdminWebsitesController.ts          # Main controller (route definitions only)
│       ├── feature-services/
│       │   ├── service.project-manager.ts      # Project CRUD + org linking
│       │   ├── service.template-manager.ts     # Template + template page CRUD
│       │   ├── service.page-editor.ts          # Page versioning + AI editing
│       │   ├── service.hfcm-manager.ts         # Header/Footer Code Management
│       │   ├── service.website-scraper.ts      # Website scraping engine
│       │   └── service.deployment-pipeline.ts  # N8N webhook integration
│       └── feature-utils/
│           ├── util.hostname-generator.ts      # Random hostname generation
│           ├── util.html-sanitizer.ts          # Code snippet sanitization
│           ├── util.scraper-helpers.ts         # Scraping utility functions
│           └── util.section-normalizer.ts      # N8N section format handler
├── models/website-builder/
│   ├── ProjectModel.ts                         # ENHANCE with new methods
│   ├── PageModel.ts                            # ENHANCE with new methods
│   ├── TemplateModel.ts                        # ENHANCE with new methods
│   ├── TemplatePageModel.ts                    # ENHANCE with new methods
│   ├── HeaderFooterCodeModel.ts                # ENHANCE with new methods
│   └── MediaModel.ts                           # ENHANCE with new methods
└── routes/admin/
    └── websites.ts                             # STRIPPED to route definitions only
```

---

## Service Extraction Detail

### 1. ProjectManagerService (~450 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.project-manager.ts`

**Responsibilities**:
- Project CRUD operations
- Organization linking/unlinking with DFY validation
- Status polling
- Status enumeration

**Methods**:
```typescript
class ProjectManagerService {
  // Listing
  async listProjects(filters: { status?, page, limit }): Promise<PaginatedResult<ProjectWithOrg>>
  async getProjectStatuses(): Promise<string[]>

  // CRUD
  async createProject(data: { user_id?, hostname? }): Promise<Project>
  async getProjectById(id: string): Promise<ProjectWithPages>
  async updateProject(id: string, updates: ProjectUpdates): Promise<Project>
  async deleteProject(id: string): Promise<void>

  // Status polling
  async getProjectStatus(id: string): Promise<ProjectStatus>

  // Organization linking
  async linkOrganization(projectId: string, organizationId: number | null): Promise<Project>
  private async validateOrganization(orgId: number): Promise<void>
  private async checkExistingLink(orgId: number, excludeProjectId: string): Promise<boolean>
}
```

**Model Method Mapping**:
```
db(PROJECTS_TABLE).leftJoin().select()     → ProjectModel.listWithOrganization()
db(PROJECTS_TABLE).count()                 → ProjectModel.countByStatus()
db(PROJECTS_TABLE).insert()                → ProjectModel.create()
db(PROJECTS_TABLE).where().first()         → ProjectModel.findById()
db(PROJECTS_TABLE).update()                → ProjectModel.update()
db(PROJECTS_TABLE).del()                   → ProjectModel.delete()
db(PROJECTS_TABLE).distinct("status")      → ProjectModel.getDistinctStatuses()
db("organizations").where().first()        → Keep in service (external table)
```

**Error Handling**:
- Validate organization exists before linking
- Validate organization is DFY tier
- Check for existing organization links
- Validate project exists before update/delete
- Validate wrapper contains `{{slot}}`

---

### 2. TemplateManagerService (~580 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.template-manager.ts`

**Responsibilities**:
- Template CRUD with `{{slot}}` validation
- Template activation (single active template)
- Template page CRUD
- Page editor system prompt retrieval

**Methods**:
```typescript
class TemplateManagerService {
  // Template CRUD
  async listTemplates(): Promise<Template[]>
  async createTemplate(data: TemplateCreateInput): Promise<Template>
  async getTemplateById(id: string): Promise<TemplateWithPages>
  async updateTemplate(id: string, updates: TemplateUpdates): Promise<Template>
  async deleteTemplate(id: string): Promise<void>
  async activateTemplate(id: string): Promise<Template>
  async getActiveTemplate(): Promise<Template | null>

  // Template page CRUD
  async listTemplatePages(templateId: string): Promise<TemplatePage[]>
  async createTemplatePage(templateId: string, data: TemplatePageInput): Promise<TemplatePage>
  async getTemplatePage(templateId: string, pageId: string): Promise<TemplatePage>
  async updateTemplatePage(templateId: string, pageId: string, updates: any): Promise<TemplatePage>
  async deleteTemplatePage(templateId: string, pageId: string): Promise<void>

  // System prompt
  async getPageEditorSystemPrompt(): Promise<string>

  // Validation
  private validateSlotPlaceholder(wrapper: string): void
}
```

**Model Method Mapping**:
```
db(TEMPLATES_TABLE).orderBy()              → TemplateModel.list()
db(TEMPLATES_TABLE).insert()               → TemplateModel.create()
db(TEMPLATES_TABLE).where().first()        → TemplateModel.findById()
db(TEMPLATES_TABLE).where("is_active")     → TemplateModel.findActive()
db(TEMPLATES_TABLE).update()               → TemplateModel.update()
db(TEMPLATES_TABLE).del()                  → TemplateModel.delete()
db(TEMPLATES_TABLE).where({is_active: true}).update() → TemplateModel.deactivateAll()

db(TEMPLATE_PAGES_TABLE).where()           → TemplatePageModel.listByTemplate()
db(TEMPLATE_PAGES_TABLE).insert()          → TemplatePageModel.create()
db(TEMPLATE_PAGES_TABLE).where().first()   → TemplatePageModel.findById()
db(TEMPLATE_PAGES_TABLE).update()          → TemplatePageModel.update()
db(TEMPLATE_PAGES_TABLE).del()             → TemplatePageModel.delete()
```

**Validation Rules**:
- Template wrapper must contain `{{slot}}`
- Template name required
- Template page name required
- Cascade validation on update

---

### 3. PageEditorService (~650 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.page-editor.ts`

**Responsibilities**:
- Page versioning workflow
- Draft/published lifecycle
- Page creation, updating, publishing
- AI-powered component editing (Claude integration)
- Layout editing (header/footer)
- Media library context injection

**Methods**:
```typescript
class PageEditorService {
  // Page CRUD
  async listPages(projectId: string, pathFilter?: string): Promise<Page[]>
  async createPage(projectId: string, data: PageCreateInput): Promise<Page>
  async getPageById(projectId: string, pageId: string): Promise<Page>
  async updatePage(projectId: string, pageId: string, updates: PageUpdates): Promise<Page>
  async deletePage(projectId: string, pageId: string): Promise<void>
  async deletePagesByPath(projectId: string, path: string): Promise<number>

  // Publishing workflow
  async publishPage(projectId: string, pageId: string): Promise<Page>
  async createDraft(projectId: string, sourcePageId: string): Promise<Page>

  // AI editing
  async editPageComponent(
    projectId: string,
    pageId: string,
    editRequest: ComponentEditRequest
  ): Promise<EditResult>

  async editLayoutComponent(
    projectId: string,
    editRequest: ComponentEditRequest
  ): Promise<EditResult>

  // Helpers
  private async getNextVersion(projectId: string, path: string): Promise<number>
  private async unpublishOtherVersions(projectId: string, path: string, excludeId: string): Promise<void>
  private async buildMediaContext(projectId: string): Promise<string>
  private validateDraftStatus(page: Page): void
}
```

**Model Method Mapping**:
```
db(PAGES_TABLE).where().orderBy()          → PageModel.listByProject()
db(PAGES_TABLE).insert()                   → PageModel.create()
db(PAGES_TABLE).where().first()            → PageModel.findById()
db(PAGES_TABLE).orderBy("version", "desc") → PageModel.getLatestVersion()
db(PAGES_TABLE).update()                   → PageModel.update()
db(PAGES_TABLE).del()                      → PageModel.delete()
db(PAGES_TABLE).where({status: "published"}).update() → PageModel.unpublishByPath()
db(PAGES_TABLE).count()                    → PageModel.countByPath()
db("website_builder.media").where()        → MediaModel.listByProject()
```

**Business Rules**:
- Only draft pages can be edited
- Cannot delete published pages
- Cannot delete last remaining version
- Publishing unpublishes other versions at same path
- Draft creation is idempotent (returns existing draft)
- Version numbers increment sequentially

**External Service Integration**:
- `editHtmlComponent` from `../../services/pageEditorService`
- Dynamic import to avoid circular dependencies
- Injects media library context into AI prompts

---

### 4. HFCMManagerService (~520 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.hfcm-manager.ts`

**Responsibilities**:
- Header/Footer Code Management for templates AND projects
- Code snippet CRUD with HTML sanitization
- Toggle enabled/disabled
- Reordering with transaction safety

**Methods**:
```typescript
class HFCMManagerService {
  // Template snippets
  async listTemplateSnippets(templateId: string): Promise<CodeSnippet[]>
  async createTemplateSnippet(templateId: string, data: SnippetInput): Promise<CodeSnippet>
  async updateTemplateSnippet(templateId: string, snippetId: string, updates: any): Promise<CodeSnippet>
  async deleteTemplateSnippet(templateId: string, snippetId: string): Promise<void>
  async toggleTemplateSnippet(templateId: string, snippetId: string): Promise<boolean>
  async reorderTemplateSnippets(templateId: string, snippetIds: string[]): Promise<void>

  // Project snippets
  async listProjectSnippets(projectId: string): Promise<CodeSnippet[]>
  async createProjectSnippet(projectId: string, data: SnippetInput): Promise<CodeSnippet>
  async updateProjectSnippet(projectId: string, snippetId: string, updates: any): Promise<CodeSnippet>
  async deleteProjectSnippet(projectId: string, snippetId: string): Promise<void>
  async toggleProjectSnippet(projectId: string, snippetId: string): Promise<boolean>
  async reorderProjectSnippets(projectId: string, snippetIds: string[]): Promise<void>

  // Validation
  private validateSnippetInput(data: SnippetInput): void
  private validateLocation(location: string): void
  private async verifyOwnership(snippetId: string, templateId?: string, projectId?: string): Promise<CodeSnippet>
}
```

**Model Method Mapping**:
```
db(HFC_TABLE).where({template_id}).orderBy() → HeaderFooterCodeModel.listByTemplate()
db(HFC_TABLE).where({project_id}).orderBy()  → HeaderFooterCodeModel.listByProject()
db(HFC_TABLE).insert()                        → HeaderFooterCodeModel.create()
db(HFC_TABLE).where("id").first()             → HeaderFooterCodeModel.findById()
db(HFC_TABLE).update()                        → HeaderFooterCodeModel.update()
db(HFC_TABLE).del()                           → HeaderFooterCodeModel.delete()
db.transaction()                              → HeaderFooterCodeModel.reorderBatch()
```

**Validation Rules**:
- Name, location, code required
- Location must be: `head_start`, `head_end`, `body_start`, `body_end`
- Code must pass sanitization
- Ownership verification before update/delete
- Reorder must be atomic (transaction)

**Sanitization Integration**:
- Uses `util.html-sanitizer.ts`
- Allows script, style, link, meta, iframe tags
- Validates code not empty after sanitization

---

### 5. WebsiteScraperService (~450 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.website-scraper.ts`

**Responsibilities**:
- Multi-page website scraping
- Internal link discovery
- Image extraction (inline + background)
- Token estimation
- File-based logging

**Methods**:
```typescript
class WebsiteScraperService {
  async scrapeWebsite(url: string): Promise<ScrapeResult>

  private async fetchHomePage(url: string): Promise<string>
  private async fetchLinkedPages(links: string[], maxPages: number): Promise<Record<string, string>>
  private selectImages(homeImages: string[], otherImages: string[], maxImages: number): string[]
  private estimateTokens(text: string): number

  // Uses scraper helpers from util.scraper-helpers.ts
}
```

**Scraper Helpers** (extracted to `util.scraper-helpers.ts`):
- `toAbsoluteUrl(href: string, baseUrl: string): string | null`
- `isInternalUrl(url: string, baseUrl: string): boolean`
- `getPageName(url: string): string`
- `isValidImageUrl(url: string): boolean`
- `fetchPage(url: string): Promise<string | null>`
- `extractInternalLinks(html: string, baseUrl: string): string[]`
- `extractImages(html: string, baseUrl: string): string[]`
- `scrapeLogger` - file logger

**Scrape Algorithm**:
1. Fetch home page HTML
2. Extract all internal links
3. Fetch up to 10 linked pages concurrently
4. Extract images from home page (priority)
5. Extract images from other pages
6. Deduplicate images, select max 10 (home priority)
7. Estimate token count for all content
8. Return pages object + selected images

**Authentication**:
- Requires `x-scraper-key` header
- Validates against `SCRAPER_API_KEY` env var

**Logging**:
- File-based logging to `../logs/website-scrape.log`
- Logs: start, link count, completion, errors
- Includes: URL, page count, image counts, token estimate, elapsed time

---

### 6. DeploymentPipelineService (~180 LOC)

**File**: `src/controllers/admin-websites/feature-services/service.deployment-pipeline.ts`

**Responsibilities**:
- N8N webhook triggering
- Template data inline injection
- Active template resolution

**Methods**:
```typescript
class DeploymentPipelineService {
  async startPipeline(params: PipelineStartParams): Promise<void>

  private async resolveTemplate(templateId?: string): Promise<string>
  private async fetchTemplateData(templateId: string, templatePageId?: string): Promise<TemplateData>
  private async triggerWebhook(url: string, payload: any): Promise<void>
}
```

**Pipeline Flow**:
1. Resolve template (provided, active, or first published)
2. Fetch template wrapper, header, footer
3. Fetch template page sections if `templatePageId` provided
4. Normalize sections using `util.section-normalizer.ts`
5. Build payload with template data + business info
6. POST to N8N webhook
7. Validate response

**Template Resolution Priority**:
1. `templateId` from request
2. Active template (`is_active = true`)
3. First published template (`status = "published"`)
4. Error if none available

**Payload Structure**:
```typescript
{
  projectId: string
  templateId: string
  templatePageId?: string
  templateData: {
    wrapper: string
    header: string
    footer: string
    sections: any[]
  }
  path: string
  placeId: string
  websiteUrl?: string
  pageContext?: string
  practiceSearchString?: string
  businessName?: string
  formattedAddress?: string
  city?: string
  state?: string
  phone?: string
  category?: string
  rating?: number
  reviewCount?: number
}
```

---

## Utility Extraction Detail

### 1. util.hostname-generator.ts (~25 LOC)

**Function**: `generateHostname(): string`

**Logic**:
- 8 adjectives: bright, swift, calm, bold, fresh, prime, smart, clear
- 8 nouns: dental, clinic, care, health, smile, wellness, medical, beauty
- Random selection + random 4-digit number
- Format: `{adjective}-{noun}-{number}`

**Example**: `bright-dental-3847`

---

### 2. util.html-sanitizer.ts (~35 LOC)

**Function**: `sanitizeCodeSnippet(code: string): SanitizeResult`

**Configuration**:
- Allowed tags: default + script, style, link, meta, noscript, iframe
- Allowed attributes:
  - script: src, type, async, defer, crossorigin, integrity
  - link: rel, href, type, sizes, media, crossorigin, integrity
  - meta: name, content, property, charset, http-equiv
  - iframe: src, width, height, frameborder, allowfullscreen, loading
  - all: class, id, data-*
- Schemes: http, https, mailto, tel
- Script/link restricted to https only
- `allowVulnerableTags: true` (required for script/style)

**Return Type**:
```typescript
{
  sanitized: string
  isValid: boolean
  error?: string
}
```

**Validation**:
- Code cannot be empty after sanitization
- Catches sanitization errors

---

### 3. util.section-normalizer.ts (~15 LOC)

**Function**: `normalizeSections(raw: unknown): any[]`

**Purpose**: Handle N8N webhook format variations

**Input Formats**:
1. Direct array: `[{...}, {...}]`
2. Wrapped object: `{sections: [{...}, {...}]}`

**Returns**: Array of sections or empty array

---

### 4. util.scraper-helpers.ts (~185 LOC)

**Exports**:
- `estimateTokens(text: string): number` - text.length / 3.5
- `toAbsoluteUrl(href: string, baseUrl: string): string | null` - resolve relative URLs
- `isInternalUrl(url: string, baseUrl: string): boolean` - same hostname check
- `getPageName(url: string): string` - extract page name from URL path
- `isValidImageUrl(url: string): boolean` - extension + path patterns
- `fetchPage(url: string): Promise<string | null>` - fetch HTML with timeout
- `extractInternalLinks(html: string, baseUrl: string): string[]` - parse <a href>
- `extractImages(html: string, baseUrl: string): string[]` - parse img src/srcset + CSS backgrounds
- `scrapeLogger` - file-based logger object

**Logger Methods**:
- `info(msg: string, data?: object)`
- `error(msg: string, data?: object)`
- `warn(msg: string, data?: object)`
- Appends to `../logs/website-scrape.log`
- Format: `[timestamp] [SCRAPE] [level] message | data`

**Image Extraction Sources**:
1. `<img src="...">`
2. `<img srcset="...">`
3. Inline styles: `style="background: url(...)"`

**Fetch Configuration**:
- User-Agent: Mozilla/5.0 (compatible; AlloroBot/1.0; +https://getalloro.com)
- Timeout: 10 seconds
- Content-Type validation: text/html only

---

## Model Enhancement Requirements

### ProjectModel

**New Methods**:
```typescript
class ProjectModel {
  // Existing methods assumed present

  static async listWithOrganization(filters: {
    status?: string
    page: number
    limit: number
  }): Promise<{ data: ProjectWithOrg[], total: number }>
  // LEFT JOIN organizations
  // Returns json_build_object for organization

  static async countByStatus(status?: string): Promise<number>

  static async getDistinctStatuses(): Promise<string[]>
  // distinct("status").whereNotNull("status").orderBy("status", "asc")

  static async findByIdWithOrganization(id: string): Promise<ProjectWithOrg | null>
  // LEFT JOIN organizations, returns single project

  static async findByOrganization(organizationId: number, excludeProjectId?: string): Promise<Project | null>
  // Check for existing org link
}
```

---

### PageModel

**New Methods**:
```typescript
class PageModel {
  static async listByProject(projectId: string, pathFilter?: string): Promise<Page[]>
  // orderBy path, version desc

  static async getLatestVersion(projectId: string, path: string): Promise<Page | null>
  // orderBy version desc, first()

  static async countByPath(projectId: string, path: string): Promise<number>
  // For last version deletion check

  static async unpublishByPath(projectId: string, path: string, excludeId?: string): Promise<void>
  // Update status = "inactive" where status = "published"

  static async markDraftsInactive(projectId: string, path: string): Promise<void>
  // Update status = "inactive" where status = "draft"

  static async deleteByPath(projectId: string, path: string): Promise<number>
  // Delete all versions at path, return count
}
```

---

### TemplateModel

**New Methods**:
```typescript
class TemplateModel {
  static async findActive(): Promise<Template | null>
  // where({ is_active: true }).first()

  static async findFirstPublished(): Promise<Template | null>
  // where({ status: "published" }).first()

  static async deactivateAll(): Promise<void>
  // update({ is_active: false }) where is_active = true

  static async findByIdWithPages(id: string): Promise<TemplateWithPages | null>
  // Include template_pages join
}
```

---

### TemplatePageModel

**New Methods**:
```typescript
class TemplatePageModel {
  static async listByTemplate(templateId: string): Promise<TemplatePage[]>
  // orderBy created_at asc

  static async findByIdAndTemplate(id: string, templateId: string): Promise<TemplatePage | null>
}
```

---

### HeaderFooterCodeModel

**New Methods**:
```typescript
class HeaderFooterCodeModel {
  static async listByTemplate(templateId: string): Promise<CodeSnippet[]>
  // orderBy location, order_index asc

  static async listByProject(projectId: string): Promise<CodeSnippet[]>
  // orderBy location, order_index asc

  static async reorderBatch(
    snippetIds: string[],
    templateId?: string,
    projectId?: string
  ): Promise<void>
  // Transaction: update order_index for all snippets
}
```

---

### MediaModel

**New Methods**:
```typescript
class MediaModel {
  static async listByProject(projectId: string): Promise<Media[]>
  // orderBy created_at desc
  // select: display_name, s3_url, alt_text, mime_type, width, height
}
```

---

## Migration Strategy

### Phase 1: Setup (No Production Impact)

**Create folder structure**:
```bash
mkdir -p src/controllers/admin-websites/feature-services
mkdir -p src/controllers/admin-websites/feature-utils
```

**Create utility files first** (no dependencies):
1. `util.hostname-generator.ts`
2. `util.section-normalizer.ts`
3. `util.html-sanitizer.ts`
4. `util.scraper-helpers.ts`

**Test each utility in isolation**.

---

### Phase 2: Model Enhancement (Low Risk)

**Enhance models in order**:
1. `ProjectModel` - add methods
2. `PageModel` - add methods
3. `TemplateModel` - add methods
4. `TemplatePageModel` - add methods
5. `HeaderFooterCodeModel` - add methods
6. `MediaModel` - add methods

**For each model**:
- Add new methods
- Keep existing methods intact
- Unit test new methods
- Do NOT remove old methods yet

---

### Phase 3: Service Extraction (Parallel Work)

**Extract services in order of independence**:

1. **DeploymentPipelineService** (least dependencies)
   - Uses: util.section-normalizer, TemplateModel, TemplatePageModel
   - Test with mock webhook

2. **WebsiteScraperService**
   - Uses: util.scraper-helpers
   - Test with real/mock URLs

3. **HFCMManagerService**
   - Uses: util.html-sanitizer, HeaderFooterCodeModel
   - Test CRUD + reordering

4. **TemplateManagerService**
   - Uses: TemplateModel, TemplatePageModel
   - Test CRUD + activation

5. **ProjectManagerService**
   - Uses: ProjectModel
   - Test CRUD + org linking

6. **PageEditorService** (most complex)
   - Uses: PageModel, MediaModel, pageEditorService (external)
   - Test versioning workflow + AI integration

**For each service**:
- Write service file
- Write unit tests
- Test in isolation (no route changes yet)

---

### Phase 4: Controller Creation (No Prod Impact)

**Create**: `src/controllers/admin-websites/AdminWebsitesController.ts`

**Structure**:
```typescript
import express from "express";
import { ProjectManagerService } from "./feature-services/service.project-manager";
import { TemplateManagerService } from "./feature-services/service.template-manager";
import { PageEditorService } from "./feature-services/service.page-editor";
import { HFCMManagerService } from "./feature-services/service.hfcm-manager";
import { WebsiteScraperService } from "./feature-services/service.website-scraper";
import { DeploymentPipelineService } from "./feature-services/service.deployment-pipeline";
import importsRouter from "../../routes/admin/imports";

const router = express.Router();

// Instantiate services
const projectManager = new ProjectManagerService();
const templateManager = new TemplateManagerService();
const pageEditor = new PageEditorService();
const hfcmManager = new HFCMManagerService();
const scraper = new WebsiteScraperService();
const pipeline = new DeploymentPipelineService();

// ===================================================================
// PROJECTS
// ===================================================================

router.get("/", async (req, res) => {
  try {
    const { status, page = "1", limit = "50" } = req.query;
    const result = await projectManager.listProjects({
      status: status as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
    return res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error.message });
  }
});

// ... 43 more route definitions ...
// Each calls appropriate service method
// All error handling in controller
// All response formatting in controller

export default router;
```

**Guidelines**:
- Route definitions ONLY
- No business logic
- No database calls
- Call service methods
- Handle errors
- Format responses

---

### Phase 5: Route Switchover (Production Deployment)

**Step 1**: Create feature flag (optional but recommended):
```typescript
const USE_NEW_CONTROLLER = process.env.USE_NEW_ADMIN_WEBSITES_CONTROLLER === "true";
```

**Step 2**: Modify route registration in main app:
```typescript
// In src/routes/admin/index.ts or equivalent
if (USE_NEW_CONTROLLER) {
  app.use("/api/admin/websites", newWebsitesController);
} else {
  app.use("/api/admin/websites", oldWebsitesRouter);
}
```

**Step 3**: Deploy with flag OFF
- New code deployed but not active
- Validate deployment successful
- No production impact

**Step 4**: Enable flag ON (gradual rollout)
- Enable for 10% of traffic
- Monitor errors, response times
- Compare old vs new metrics
- Gradually increase to 100%

**Step 5**: Remove old route file
- Once 100% traffic on new controller for 1 week
- Delete `src/routes/admin/websites.ts`
- Remove feature flag
- Clean up imports

---

## Detailed Mapping: Route → Service → Model

### Projects

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /` | `projectManager.listProjects()` | Query with pagination + org join | `ProjectModel.listWithOrganization()` |
| `POST /` | `projectManager.createProject()` | Generate hostname, insert | `ProjectModel.create()` |
| `GET /statuses` | `projectManager.getProjectStatuses()` | Distinct statuses | `ProjectModel.getDistinctStatuses()` |
| `GET /:id/status` | `projectManager.getProjectStatus()` | Select status fields only | `ProjectModel.findById()` (select specific) |
| `PATCH /:id/link-organization` | `projectManager.linkOrganization()` | Validate org, check existing, update | `ProjectModel.update()` + validation queries |
| `GET /:id` | `projectManager.getProjectById()` | Get with pages | `ProjectModel.findByIdWithOrganization()` + `PageModel.listByProject()` |
| `PATCH /:id` | `projectManager.updateProject()` | Validate, update | `ProjectModel.update()` |
| `DELETE /:id` | `projectManager.deleteProject()` | Delete (cascade) | `ProjectModel.delete()` |
| `POST /start-pipeline` | `pipeline.startPipeline()` | Resolve template, trigger webhook | `TemplateModel.findActive()`, `TemplatePageModel.findById()` |

---

### Templates

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /templates` | `templateManager.listTemplates()` | List all | `TemplateModel.list()` |
| `POST /templates` | `templateManager.createTemplate()` | Validate {{slot}}, deactivate others if active, create | `TemplateModel.deactivateAll()`, `TemplateModel.create()` |
| `GET /templates/:id` | `templateManager.getTemplateById()` | Get with pages | `TemplateModel.findByIdWithPages()` |
| `PATCH /templates/:id` | `templateManager.updateTemplate()` | Validate {{slot}}, update | `TemplateModel.update()` |
| `DELETE /templates/:id` | `templateManager.deleteTemplate()` | Delete | `TemplateModel.delete()` |
| `POST /templates/:id/activate` | `templateManager.activateTemplate()` | Deactivate all, activate one | `TemplateModel.deactivateAll()`, `TemplateModel.update()` |
| `GET /editor/system-prompt` | `templateManager.getPageEditorSystemPrompt()` | Dynamic import | `getPageEditorPrompt()` from prompts |

---

### Template Pages

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /templates/:tid/pages` | `templateManager.listTemplatePages()` | List by template | `TemplatePageModel.listByTemplate()` |
| `POST /templates/:tid/pages` | `templateManager.createTemplatePage()` | Create | `TemplatePageModel.create()` |
| `GET /templates/:tid/pages/:pid` | `templateManager.getTemplatePage()` | Get by id + template | `TemplatePageModel.findByIdAndTemplate()` |
| `PATCH /templates/:tid/pages/:pid` | `templateManager.updateTemplatePage()` | Validate, update | `TemplatePageModel.update()` |
| `DELETE /templates/:tid/pages/:pid` | `templateManager.deleteTemplatePage()` | Delete | `TemplatePageModel.delete()` |

---

### Pages

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /:id/pages` | `pageEditor.listPages()` | List with optional path filter | `PageModel.listByProject()` |
| `POST /:id/pages` | `pageEditor.createPage()` | Get next version, mark old drafts inactive, create | `PageModel.getLatestVersion()`, `PageModel.markDraftsInactive()`, `PageModel.create()` |
| `POST /:id/pages/:pid/publish` | `pageEditor.publishPage()` | Unpublish others, publish this | `PageModel.unpublishByPath()`, `PageModel.update()` |
| `GET /:id/pages/:pid` | `pageEditor.getPageById()` | Get by id | `PageModel.findById()` |
| `PATCH /:id/pages/:pid` | `pageEditor.updatePage()` | Validate draft status, update | `PageModel.update()` |
| `DELETE /:id/pages/by-path` | `pageEditor.deletePagesByPath()` | Delete all versions at path | `PageModel.deleteByPath()` |
| `DELETE /:id/pages/:pid` | `pageEditor.deletePage()` | Validate not published, check not last, delete | `PageModel.countByPath()`, `PageModel.delete()` |
| `POST /:id/pages/:pid/create-draft` | `pageEditor.createDraft()` | Check existing draft (idempotent), clone published | `PageModel.findById()` (check draft exists), `PageModel.create()` |
| `POST /:id/pages/:pid/edit` | `pageEditor.editPageComponent()` | Fetch media context, call AI service | `MediaModel.listByProject()`, `editHtmlComponent()` from external service |
| `POST /:id/edit-layout` | `pageEditor.editLayoutComponent()` | Fetch media context, call AI service | `MediaModel.listByProject()`, `editHtmlComponent()` from external service |

---

### HFCM (Template)

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /templates/:tid/code-snippets` | `hfcmManager.listTemplateSnippets()` | List by template | `HeaderFooterCodeModel.listByTemplate()` |
| `POST /templates/:tid/code-snippets` | `hfcmManager.createTemplateSnippet()` | Validate, sanitize, create | `HeaderFooterCodeModel.create()` |
| `PATCH /templates/:tid/code-snippets/:id` | `hfcmManager.updateTemplateSnippet()` | Verify ownership, validate, sanitize, update | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.update()` |
| `DELETE /templates/:tid/code-snippets/:id` | `hfcmManager.deleteTemplateSnippet()` | Verify ownership, delete | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.delete()` |
| `PATCH /templates/:tid/code-snippets/:id/toggle` | `hfcmManager.toggleTemplateSnippet()` | Verify ownership, toggle | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.update()` |
| `PATCH /templates/:tid/code-snippets/reorder` | `hfcmManager.reorderTemplateSnippets()` | Reorder batch (transaction) | `HeaderFooterCodeModel.reorderBatch()` |

---

### HFCM (Project)

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `GET /:pid/code-snippets` | `hfcmManager.listProjectSnippets()` | List by project | `HeaderFooterCodeModel.listByProject()` |
| `POST /:pid/code-snippets` | `hfcmManager.createProjectSnippet()` | Validate, sanitize, create | `HeaderFooterCodeModel.create()` |
| `PATCH /:pid/code-snippets/:id` | `hfcmManager.updateProjectSnippet()` | Verify ownership, validate, sanitize, update | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.update()` |
| `DELETE /:pid/code-snippets/:id` | `hfcmManager.deleteProjectSnippet()` | Verify ownership, delete | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.delete()` |
| `PATCH /:pid/code-snippets/:id/toggle` | `hfcmManager.toggleProjectSnippet()` | Verify ownership, toggle | `HeaderFooterCodeModel.findById()`, `HeaderFooterCodeModel.update()` |
| `PATCH /:pid/code-snippets/reorder` | `hfcmManager.reorderProjectSnippets()` | Reorder batch (transaction) | `HeaderFooterCodeModel.reorderBatch()` |

---

### Scraper

| Route | Controller Calls | Service Method | Model Method |
|-------|-----------------|----------------|--------------|
| `POST /scrape` | `scraper.scrapeWebsite()` | Validate API key, fetch pages, extract links/images, estimate tokens | None (external scraping) |

---

## Risk Analysis

### Level 4 Risks (High Impact)

**1. AI Page Editing Integration**
- **Risk**: External `pageEditorService` failure cascade
- **Mitigation**:
  - Dynamic import already present (avoid circular deps)
  - Keep error handling at controller level
  - No changes to AI service itself
  - Test media context injection thoroughly

**2. N8N Webhook Integration**
- **Risk**: Pipeline failures due to payload changes
- **Mitigation**:
  - Preserve exact payload structure
  - Keep `normalizeSections` logic intact
  - Test template data inline injection
  - Document expected webhook response

**3. Page Versioning Workflow**
- **Risk**: Version conflicts, lost drafts, orphaned pages
- **Mitigation**:
  - Preserve transaction boundaries
  - Test idempotent draft creation
  - Test publish/unpublish atomicity
  - Verify cascade deletion behavior

**4. HFCM Code Sanitization**
- **Risk**: XSS vulnerabilities if sanitization changes
- **Mitigation**:
  - Extract sanitizer to utility unchanged
  - Test with malicious payloads
  - Preserve allowed tags/attributes exactly
  - Document security rationale

### Level 3 Risks (Structural)

**5. Organization Linking Validation**
- **Risk**: Invalid links (non-DFY, already linked)
- **Mitigation**:
  - Test DFY tier validation
  - Test duplicate link prevention
  - Test null unlinking
  - Preserve all validation logic

**6. Template Activation Logic**
- **Risk**: Multiple active templates or none
- **Mitigation**:
  - Test deactivate-all before activate
  - Test fallback to first published
  - Test no-template error case

**7. Scraper Performance**
- **Risk**: Timeout, memory issues on large sites
- **Mitigation**:
  - Preserve 10-second timeout
  - Preserve 10-page limit
  - Preserve 10-image limit
  - Test with large sites

### Level 2 Risks (Concerns)

**8. File-Based Logging**
- **Risk**: Log directory not writable
- **Mitigation**:
  - Preserve error suppression (`try/catch` in logger)
  - Test log directory creation
  - Document log file location

**9. Wrapper {{slot}} Validation**
- **Risk**: Invalid templates break rendering
- **Mitigation**:
  - Extract validation to template manager
  - Test on create and update
  - Preserve exact error message

**10. JSON Stringification**
- **Risk**: JSONB field compatibility
- **Mitigation**:
  - Preserve `JSON.stringify()` for sections, page_ids, chat history
  - Test pg driver compatibility
  - Test round-trip serialization

---

## Testing Strategy

### Unit Tests

**Utilities** (100% coverage required):
- `util.hostname-generator` - test format, randomness
- `util.section-normalizer` - test both input formats
- `util.html-sanitizer` - test allowed/blocked tags, XSS payloads
- `util.scraper-helpers` - test URL parsing, image detection, token estimation

**Services** (mock models):
- Test all public methods
- Test error cases (not found, validation failures)
- Test business logic (versioning, activation, ownership)
- Mock model methods

**Models** (real database):
- Test all new methods
- Use test database
- Test transactions
- Test cascades

### Integration Tests

**Controller → Service → Model**:
- Test full request/response cycle
- Use test database
- Test error responses
- Test pagination
- Test filters

**External Services**:
- Mock `pageEditorService.editHtmlComponent`
- Mock N8N webhook (nock or similar)
- Test scraper with real/mock URLs

### E2E Tests (Critical Paths)

1. **Project Lifecycle**:
   - Create → Link Org → Add Pages → Publish → Delete

2. **Template Management**:
   - Create Template → Add Pages → Activate → Use in Pipeline

3. **Page Editing Workflow**:
   - Create Draft → Edit with AI → Publish → Create New Draft

4. **HFCM Management**:
   - Create Snippet → Toggle → Reorder → Delete

5. **Website Scraping**:
   - Scrape → Parse → Extract Images → Return Results

---

## Files to Create

| File | Responsibility | Approx LOC |
|------|---------------|------------|
| `src/controllers/admin-websites/AdminWebsitesController.ts` | Route definitions only | ~600 |
| `src/controllers/admin-websites/feature-services/service.project-manager.ts` | Project CRUD + org linking | ~450 |
| `src/controllers/admin-websites/feature-services/service.template-manager.ts` | Template + template page CRUD | ~580 |
| `src/controllers/admin-websites/feature-services/service.page-editor.ts` | Page versioning + AI editing | ~650 |
| `src/controllers/admin-websites/feature-services/service.hfcm-manager.ts` | Code snippet management | ~520 |
| `src/controllers/admin-websites/feature-services/service.website-scraper.ts` | Website scraping engine | ~450 |
| `src/controllers/admin-websites/feature-services/service.deployment-pipeline.ts` | N8N webhook integration | ~180 |
| `src/controllers/admin-websites/feature-utils/util.hostname-generator.ts` | Random hostname generation | ~25 |
| `src/controllers/admin-websites/feature-utils/util.section-normalizer.ts` | N8N section format handler | ~15 |
| `src/controllers/admin-websites/feature-utils/util.html-sanitizer.ts` | Code snippet sanitization | ~35 |
| `src/controllers/admin-websites/feature-utils/util.scraper-helpers.ts` | Scraping utilities + logger | ~185 |
| **Total New Code** | | **~3,690 LOC** |

---

## Files to Modify

| File | Changes | Est. LOC Delta |
|------|---------|----------------|
| `src/models/website-builder/ProjectModel.ts` | Add 5 methods | +150 |
| `src/models/website-builder/PageModel.ts` | Add 6 methods | +180 |
| `src/models/website-builder/TemplateModel.ts` | Add 4 methods | +100 |
| `src/models/website-builder/TemplatePageModel.ts` | Add 2 methods | +40 |
| `src/models/website-builder/HeaderFooterCodeModel.ts` | Add 3 methods | +80 |
| `src/models/website-builder/MediaModel.ts` | Add 1 method | +20 |
| `src/routes/admin/websites.ts` | **DELETE ENTIRE FILE** after migration | -2771 |
| **Total Model Enhancement** | | **+570 LOC** |

---

## Files to Delete (Post-Migration)

- `src/routes/admin/websites.ts` (2,771 LOC)

---

## Success Criteria

### Functional Requirements
- ✅ All 44 endpoints return identical responses
- ✅ Page versioning workflow unchanged
- ✅ AI editing integration functional
- ✅ N8N webhook payload unchanged
- ✅ HFCM sanitization security preserved
- ✅ Organization linking validation enforced
- ✅ Scraper performance within limits
- ✅ Template activation logic correct

### Non-Functional Requirements
- ✅ Response times within 5% of baseline
- ✅ No database query regressions (N+1 queries)
- ✅ Memory usage stable
- ✅ Error rates unchanged
- ✅ Log output equivalent

### Code Quality
- ✅ 80%+ test coverage on services
- ✅ No direct database calls in controllers
- ✅ All models use type-safe methods
- ✅ Utilities pure functions
- ✅ No circular dependencies

### Security
- ✅ HTML sanitization unchanged
- ✅ API key validation preserved
- ✅ Organization tier validation enforced
- ✅ Ownership checks in HFCM

---

## Rollback Plan

### Stage 1 Rollback (Pre-Switchover)
- **Trigger**: Test failures during Phase 1-4
- **Action**: Delete new files, no production impact
- **Downtime**: None

### Stage 2 Rollback (Feature Flag Active)
- **Trigger**: Error rate spike, performance degradation
- **Action**: Set `USE_NEW_ADMIN_WEBSITES_CONTROLLER=false`
- **Downtime**: None (instant switchback)
- **Investigation**: Compare logs, metrics, error traces

### Stage 3 Rollback (Flag Removed)
- **Trigger**: Critical bug discovered post-migration
- **Action**:
  1. Revert controller import
  2. Re-deploy old route file
  3. Hotfix and re-test
- **Downtime**: ~5-10 minutes (deploy time)

---

## Performance Considerations

### Database Queries

**Before**: Raw Knex queries scattered in handlers
**After**: Model methods with proper indexing

**Optimization Opportunities**:
1. **Project Listing**: Already uses LEFT JOIN for org data
2. **Page Listing**: Add composite index on `(project_id, path, version)`
3. **Template Pages**: Add index on `template_id`
4. **HFCM**: Add composite index on `(template_id, location, order_index)` and `(project_id, location, order_index)`

### Caching Opportunities

**Active Template** (read-heavy):
- Cache `TemplateModel.findActive()` with TTL
- Invalidate on template activation

**System Prompt** (read-heavy):
- Cache `getPageEditorSystemPrompt()` with TTL
- Invalidate on prompt update

**Media Library Context** (per-project):
- Cache `MediaModel.listByProject()` with short TTL
- Invalidate on media upload/delete

### Concurrent Operations

**Page Publishing**:
- Race condition: two simultaneous publishes
- Mitigation: Transaction wrapping unpublish + publish

**Snippet Reordering**:
- Already uses transaction for atomic update
- Preserve this pattern

**Template Activation**:
- Race condition: simultaneous activations
- Mitigation: Transaction wrapping deactivate-all + activate

---

## Monitoring & Observability

### Metrics to Track

**Latency**:
- P50, P95, P99 per endpoint
- Compare old vs new
- Alert on >10% regression

**Error Rates**:
- 4xx errors (validation, not found)
- 5xx errors (server errors)
- By endpoint
- Alert on spike

**Database**:
- Query count per request
- Query duration
- Connection pool utilization

**External Services**:
- N8N webhook success rate
- Claude AI edit success rate
- Scraper fetch success rate

### Logging

**Keep Existing Logs**:
- `[Admin Websites]` prefix for project/template/page operations
- `[HFCM]` prefix for snippet operations
- `[SCRAPE]` prefix for scraper operations (file-based)

**Add Service-Level Logs**:
- Service method entry/exit
- Business rule violations
- External service calls
- Performance timings

### Alerts

**Critical**:
- Error rate > 5% for any endpoint
- N8N webhook failures > 10%
- Claude AI edit failures > 20%

**Warning**:
- P95 latency > 2x baseline
- Database connection pool > 80%
- Scraper timeouts > 30%

---

## Dependencies & Prerequisites

### Before Starting

1. **Review existing models**:
   - Understand current structure
   - Identify missing methods
   - Plan additions

2. **Audit tests**:
   - Check existing test coverage
   - Plan new test files
   - Set up test database

3. **Document edge cases**:
   - Page versioning conflicts
   - Template activation race conditions
   - Organization linking validation

4. **Set up monitoring**:
   - Baseline metrics collection
   - Dashboard for comparison
   - Alert thresholds

### External Dependencies

**No Changes Required**:
- `pageEditorService` - consumed as-is
- `getPageEditorPrompt` - consumed as-is
- N8N webhook - expects unchanged payload
- Database schema - no migrations needed

**Optional Enhancements**:
- Database indexes (recommended)
- Caching layer (optional)
- Rate limiting (optional)

---

## Timeline Estimate

| Phase | Duration | Parallelizable? |
|-------|----------|-----------------|
| Phase 1: Setup | 1 day | No |
| Phase 2: Model Enhancement | 3 days | Partially (6 models) |
| Phase 3: Service Extraction | 5 days | Partially (6 services) |
| Phase 4: Controller Creation | 2 days | No |
| Phase 5: Route Switchover | 1 day | No |
| Testing & Validation | 3 days | Ongoing |
| **Total** | **15 days** | ~10 days with parallelization |

**Assumptions**:
- 1 senior engineer full-time
- Test database available
- Code reviews included in timeline
- No major blockers

---

## Conclusion

This refactor extracts **2,771 LOC** into:
- **6 feature services** (~2,830 LOC)
- **4 utility modules** (~260 LOC)
- **6 enhanced models** (+570 LOC)
- **1 clean controller** (~600 LOC)

**Benefits**:
- **Maintainability**: Clear separation of concerns
- **Testability**: Isolated business logic
- **Reusability**: Services consumable by other routes
- **Scalability**: Easy to add features per domain
- **Type Safety**: Model methods replace raw queries

**Risks Mitigated**:
- Feature flag for gradual rollout
- No schema changes required
- External services unchanged
- Security validations preserved

This is the **second most complex** route in the system. Success here establishes pattern for future large-scale refactors.

---

## Appendix: Quick Reference

### Helper Function Locations
- `normalizeSections` → `util.section-normalizer.ts`
- `generateHostname` → `util.hostname-generator.ts`
- `sanitizeCodeSnippet` → `util.html-sanitizer.ts`
- Scraper helpers → `util.scraper-helpers.ts`

### Service Responsibilities
- `ProjectManagerService` → Projects + Org Linking
- `TemplateManagerService` → Templates + Template Pages
- `PageEditorService` → Pages + AI Editing
- `HFCMManagerService` → Code Snippets (both types)
- `WebsiteScraperService` → Multi-page scraping
- `DeploymentPipelineService` → N8N webhooks

### Model Enhancements Priority
1. ProjectModel (high impact)
2. PageModel (high impact)
3. TemplateModel (medium impact)
4. HeaderFooterCodeModel (medium impact)
5. TemplatePageModel (low impact)
6. MediaModel (low impact)

### Critical Test Scenarios
- Page versioning conflicts
- Template activation race conditions
- Organization linking validation
- HFCM sanitization security
- AI editing integration
- N8N webhook payload
- Scraper performance limits
