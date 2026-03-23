# SEO Scoring System — Full Plan

**Date:** 03/08/2026
**Ticket:** no-ticket
**Status:** Planning

---

## Problem Statement

Websites served by website-builder-rebuild have no per-page SEO control. Meta tags are hardcoded in the project-level wrapper — every page shares the same `<title>`, `<meta description>`, OG tags, and has zero schema markup. There's no way to optimize individual pages for search, no scoring system to measure SEO health, and no AI-assisted generation to make it easy.

Additionally, structured data (JSON-LD schema) requires business data (address, hours, phone, coordinates) that doesn't exist in a persisted, queryable form — it's fetched on-demand from Google APIs but never stored locally.

---

## Context Summary

### Rendering Pipeline (website-builder-rebuild)
- Express server on port 7777, serves HTML via string composition
- `renderPage()` assembles: `wrapper.replace('{{slot}}', header + sections + footer)`
- Code snippets injected at `head_start`, `head_end`, `body_start`, `body_end`
- Single posts rendered via `assembleSinglePostHtml()` through same pipeline
- No per-page meta tag override mechanism exists

### Page Editor (signalsai frontend)
- `PageEditor.tsx` — main editor with `EditorToolbar` (device tabs + code toggle) and `EditorSidebar` (Chat/Debug)
- Device tabs: Desktop | Tablet | Mobile buttons
- Code tab: toggle button, switches to Monaco editor
- No SEO tab or fields exist

### Post Editor (signalsai frontend)
- `PostsTab.tsx` — flat scrollable form, no tabs
- Fields: title, content, excerpt, featured_image, custom_fields, categories, tags, status
- No SEO fields exist

### Data Model
- `pages` table: has unused `meta_title`/`meta_description` columns
- `posts` table: no SEO columns
- `organizations` table: no `business_data` column
- `locations` table: no `business_data` column, but linked to `google_properties` with `external_id` (Google Places ID)
- `google_properties.metadata` JSONB exists but unused

### AI Pattern
- Lazy Anthropic SDK singleton
- System prompts from `admin_settings` table
- Structured JSON responses
- Established in page editor, minds chat, content analysis

### Settings
- 4 tabs: Integrations, Users & Roles, Billing, Account
- PropertiesTab manages locations within Integrations
- No website-level settings page exists
- WebsiteDetail has 7 tabs (Pages, Layouts, Media, Code Manager, Form Submissions, Posts, Menus)

---

## Existing Patterns to Follow

1. **Token replacement** — `{{slot}}`, `{{post.*}}` pattern for dynamic content injection
2. **Code snippet injection** — `injectCodeSnippets()` at 4 head/body positions
3. **AI generation** — Anthropic SDK singleton, system prompt from DB, JSON response parsing
4. **JSONB columns** — `custom_fields` on posts, `metadata` on google_properties
5. **Redis caching** — 2-5 min TTLs for rendered content
6. **Service layer** — dedicated service files per feature domain
7. **Settings tab pattern** — pill button bar, Framer Motion transitions, component per tab

---

## Proposed Approach

### Milestone 1: Database & Business Data Foundation

**1a. Migrations**

- Add `business_data` JSONB column to `organizations` table (org-level umbrella data)
- Add `business_data` JSONB column to `locations` table (per-location data)
- Add `seo_data` JSONB column to `pages` table
- Add `seo_data` JSONB column to `posts` table
- Remove `meta_title` and `meta_description` from `pages` table (verify nothing references them first)

**`organizations.business_data` schema:**
```json
{
  "name": "Practice Name",
  "description": "Full business description",
  "logo_url": "https://...",
  "founding_year": 2010,
  "service_area": "Greater Portland, OR",
  "social_profiles": {
    "facebook": "https://...",
    "instagram": "https://...",
    "linkedin": "https://...",
    "youtube": "https://...",
    "twitter": "https://..."
  },
  "specialties": ["General Dentistry", "Cosmetic Dentistry"],
  "refreshed_at": "2026-03-08T..."
}
```

**`locations.business_data` schema:**
```json
{
  "name": "Downtown Office",
  "address": {
    "street": "123 Main St",
    "suite": "Suite 200",
    "city": "Portland",
    "state": "OR",
    "zip": "97201",
    "country": "US"
  },
  "phone": "+1-503-555-0100",
  "email": "downtown@practice.com",
  "website": "https://...",
  "coordinates": { "lat": 45.5152, "lng": -122.6784 },
  "hours": {
    "monday": { "open": "08:00", "close": "17:00" },
    "tuesday": { "open": "08:00", "close": "17:00" },
    ...
    "saturday": null,
    "sunday": null
  },
  "categories": ["Dentist", "Cosmetic Dentist"],
  "rating": 4.8,
  "review_count": 127,
  "photos": ["https://..."],
  "place_id": "ChIJ...",
  "refreshed_at": "2026-03-08T..."
}
```

**`pages.seo_data` / `posts.seo_data` schema:**
```json
{
  "location_context": "location_id" | "organization" | null,
  "meta_title": "Page Title | Practice Name",
  "meta_description": "155-char description with CTA and trust signal",
  "canonical_url": "/services/teeth-cleaning",
  "robots": "index, follow",
  "og_title": "Page Title | Practice Name",
  "og_description": "Description for social sharing",
  "og_image": "https://...",
  "og_type": "website",
  "max_image_preview": "large",
  "schema_json": [
    { "@context": "https://schema.org", "@type": "LocalBusiness", ... },
    { "@context": "https://schema.org", "@type": "FAQPage", ... }
  ],
  "scores": {
    "critical": { "score": 24, "max": 30, "items": { "1": true, "2": true, ... } },
    "high_impact": { "score": 20, "max": 25, "items": { ... } },
    "significant": { "score": 16, "max": 22, "items": { ... } },
    "moderate": { "score": 10, "max": 13, "items": { ... } },
    "low": { "score": 5, "max": 7, "items": { ... } },
    "negligible": { "score": 2, "max": 3, "items": { ... } },
    "total": 77
  }
}
```

**1b. Google Places API Integration**

- New backend service: `services/business-data.service.ts`
- Fetch location details using `external_id` (place_id) from `google_properties`
- Google Places API (New) — Place Details endpoint
- Fields to request: `displayName`, `formattedAddress`, `addressComponents`, `location` (coordinates), `regularOpeningHours`, `primaryType`, `types`, `rating`, `userRatingCount`, `photos`, `nationalPhoneNumber`, `websiteUri`
- Map response to `locations.business_data` schema
- For organization-level data: aggregate from primary location + manual overrides (name, logo, socials, description)

**1c. Settings UI — Business Data Management**

- New section in Settings > Integrations, below the existing PropertiesTab locations list
- OR: expandable panel within each location card in PropertiesTab
- Decision: **Expandable panel within each location card** — keeps location data co-located
- Each location card gets a "Business Data" expandable section showing:
  - Last refreshed timestamp
  - "Refresh from Google" button
  - Read-only display of fetched data (address, phone, hours, categories, rating)
  - Editable overrides for fields Google doesn't provide (email, specialties)
- Organization-level section at the top:
  - Business name, description, logo, social profiles, founding year, service area
  - These are manual inputs (not from Google)
  - "This data is used for Organization schema on your website"
- **Gate check:** If organization has no locations or no connected GBP profiles, show disabled state with message: "Connect a Google Business Profile to enable business data"

**1d. Backend API Endpoints for Business Data**

- `POST /api/locations/:id/refresh-business-data` — fetch from Google Places, store in `business_data`
- `PATCH /api/locations/:id/business-data` — manual overrides
- `PATCH /api/organizations/:id/business-data` — org-level umbrella data
- `GET /api/organizations/:id/business-data` — fetch org + all locations business data

---

### Milestone 2: Rendering Pipeline — Smart Meta Tag Override

**In website-builder-rebuild `src/utils/renderer.ts`:**

New function: `injectSeoMeta(html: string, seoData: SeoData, businessData: BusinessData | null): string`

**Logic:**
1. If `seo_data` is null/empty for this page → return HTML unchanged (backward compatible)
2. If `seo_data.meta_title` exists:
   - Find `<title>...</title>` in HTML → replace content
   - Find `<meta property="og:title"...>` → replace or inject
3. If `seo_data.meta_description` exists:
   - Find `<meta name="description"...>` → replace or inject if missing
   - Find `<meta property="og:description"...>` → replace or inject
4. If `seo_data.canonical_url` exists:
   - Find `<link rel="canonical"...>` → replace or inject
5. If `seo_data.og_image` exists:
   - Find `<meta property="og:image"...>` → replace or inject
6. If `seo_data.robots` exists:
   - Find `<meta name="robots"...>` → replace or inject
7. If `seo_data.max_image_preview` exists:
   - Inject `<meta name="robots" content="max-image-preview:large">`
8. If `seo_data.og_type` exists:
   - Find `<meta property="og:type"...>` → replace or inject
9. If `seo_data.schema_json` exists and is non-empty array:
   - Inject `<script type="application/ld+json">` blocks at `head_end`
   - One script tag per schema object

**Smart duplicate handling:**
- Use regex to find existing tags by attribute (e.g., `<meta name="description"` or `<meta property="og:title"`)
- If found → replace the entire tag
- If not found → inject before `</head>`
- Never duplicate — always replace-or-inject

**Integration point in `src/routes/site.ts`:**
- After `renderPage()` and shortcode resolution, before `res.send()`
- Fetch `seo_data` from page record (already fetched)
- Fetch `business_data` from location if `seo_data.location_context` is set
- Call `injectSeoMeta(html, seoData, businessData)`
- Same flow for `assembleSinglePostHtml()` (single posts)

**New service needed in website-builder-rebuild:**
- `src/services/seo.service.ts` — fetch business data by location_id or organization_id
- Redis cache: 10 min TTL (business data changes infrequently)

---

### Milestone 3: SEO Tab in Page Editor

**3a. Tab Restructuring in EditorToolbar**

Current: `[ Desktop ] [ Tablet ] [ Mobile ] [ Code ]`

New: `[ 🖥️ 📱 📱 ] [ </> Code ] [ 📊 SEO ]`

- Device tabs become icon-only, grouped tightly
- Code remains a separate tab
- SEO is a new separate tab
- When SEO tab is active: main content area shows SEO panel instead of iframe/code editor
- Device tabs disabled when SEO or Code is active
- Only one of Code/SEO can be active at a time

**3b. SEO Panel Component**

New component: `components/PageEditor/SeoPanel.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Overall SEO Score: 77/100  [████████░░] 77%        │
│  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐       │
│  │ 24  ││ 20  ││ 16  ││ 10  ││  5  ││  2  │       │
│  │ /30 ││ /25 ││ /22 ││ /13 ││  /7 ││  /3 │       │
│  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘       │
│                                                     │
│  Location Context: [ ▼ Organization-wide ]          │
│                                                     │
│  [ 🤖 Generate All with AI ]                        │
│  (disabled if no business data — shows tooltip)     │
│                                                     │
│  ┌─ 🔴 CRITICAL — Page Title & Canonical (24/30) ──┐│
│  │  [████████░░] 80%                                ││
│  │                                                  ││
│  │  1. Canonical Tag [8pts] ✅                      ││
│  │  ┌──────────────────────────────────────┐        ││
│  │  │ /services/teeth-cleaning             │        ││
│  │  └──────────────────────────────────────┘        ││
│  │                                                  ││
│  │  2. Page Title with keyword + city [7pts] ✅     ││
│  │  ┌──────────────────────────────────────┐        ││
│  │  │ Teeth Cleaning Portland | Practice   │        ││
│  │  └──────────────────────────────────────┘        ││
│  │  Character count: 42/60 ✅                       ││
│  │                                                  ││
│  │  3. Unique title [6pts] ⚠️ (auto-checked)       ││
│  │  4. Title length [5pts] ✅ (auto-scored)         ││
│  │  5. Indexing [4pts] ✅                           ││
│  │  ┌──────────────────────────────────────┐        ││
│  │  │ index, follow  ▼                     │        ││
│  │  └──────────────────────────────────────┘        ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ 🟠 HIGH IMPACT — Search Snippet (20/25) ───────┐│
│  │  ...meta description fields...                   ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ 🟡 SIGNIFICANT — Structured Data (16/22) ──────┐│
│  │  Schema blocks (AI-generated JSON-LD)            ││
│  │  Code viewer with edit capability                 ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ 🔵 MODERATE — Social Share (10/13) ────────────┐│
│  │  ...OG fields + image picker...                  ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ ⚪ LOW — Page Speed Tags (5/7) ────────────────┐│
│  │  Read-only. Auto-detected from wrapper.          ││
│  │  "Update via Layouts tab"                        ││
│  └──────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ ⬜ NEGLIGIBLE — Housekeeping (2/3) ────────────┐│
│  │  Read-only. Auto-detected from wrapper.          ││
│  │  "Update via Layouts tab"                        ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**3c. Scoring Engine**

Client-side scoring function: `calculateSeoScore(seoData, wrapperHtml, allPageTitles): SeoScores`

Auto-scored criteria (no user input needed):
- #3 Unique title — compare against all other page titles (fetched on SEO tab open)
- #4 Title length — character count check (50-60)
- #8 Description length — character count check (140-160)
- #9 Unique description — compare against all other page descriptions
- #20 Viewport tag — detect in wrapper HTML
- #21 Script defer — detect in wrapper HTML
- #22 Preload hints — detect in wrapper HTML
- #23 UTF-8 charset — detect in wrapper HTML
- #24 Language declaration — detect in wrapper HTML

User-input criteria (fields in the form):
- #1 Canonical tag — text input (auto-prefilled with page path)
- #2 Title with keyword + city — text input
- #5 Robots/indexing — dropdown (index,follow / noindex,nofollow / etc.)
- #6 Description with CTA — textarea
- #7 Description with trust signal — part of #6 (manual check or AI-detected)
- #10 Max image preview — checkbox/toggle
- #16-17 OG image — media picker
- #18 OG title — text input (defaults to meta title)
- #19 OG URL matches canonical — auto-checked
- #25 OG type — dropdown (website/article)
- #26 OG description — text input (defaults to meta description)

AI-generated criteria (via Generate button):
- #11-15 Schema markup — AI generates JSON-LD blocks, stored in `seo_data.schema_json`

**3d. Progress Bars**

- Per-section: colored bar matching section emoji color
  - Critical (red/green gradient based on score)
  - High Impact (orange/green gradient)
  - Significant (yellow/green gradient)
  - Moderate (blue/green gradient)
  - Low (gray/green gradient)
  - Negligible (light gray)
- Overall: large bar at top, color based on score interpretation
  - 90-100: green
  - 75-89: yellow-green
  - 55-74: orange
  - 35-54: red
  - Below 35: dark red
- Animated: CSS transition on width changes, smooth fill on load

**3e. Save Behavior**

- SEO data auto-saves on field blur (debounced 800ms, same pattern as section edits)
- Scores recalculate on every field change (client-side, instant)
- Save endpoint: `PATCH /api/admin/websites/:projectId/pages/:pageId/seo`
- Body: `{ seo_data: { ... } }`

---

### Milestone 4: AI Generation

**4a. Backend Endpoint**

`POST /api/admin/websites/:projectId/pages/:pageId/seo/generate`

**Request body:**
```json
{
  "section": "critical" | "high_impact" | "significant" | "moderate" | "negligible",
  "location_context": "location_id" | "organization",
  "page_content": "full HTML of current page sections",
  "homepage_content": "full HTML of homepage sections",
  "header_html": "project header",
  "footer_html": "project footer",
  "wrapper_html": "project wrapper",
  "existing_seo_data": { ... },
  "all_page_titles": ["Home | ...", "About | ...", ...],
  "all_page_descriptions": ["...", "..."]
}
```

**Response:**
```json
{
  "section": "critical",
  "generated": {
    "meta_title": "...",
    "canonical_url": "...",
    "robots": "index, follow"
  }
}
```

**4b. AI Service**

New service: `services/seo-generation.service.ts`

- Model: `claude-sonnet-4-6`
- One call per section for accuracy (5 sequential calls for full generation)
- System prompt stored in `admin_settings` table (key: `seo_generation_system_prompt`)
- Each section gets a specialized prompt:
  - **Critical:** Generate title (keyword + city, 50-60 chars, unique), canonical URL, robots directive
  - **High Impact:** Generate meta description (CTA + trust signal, 140-160 chars, unique)
  - **Significant:** Generate JSON-LD schema blocks (LocalBusiness/Organization, FAQ if Q&A detected, Service if service page, BreadcrumbList)
  - **Moderate:** Generate OG title, OG description, recommend OG image from page content
  - **Negligible:** Generate OG type, confirm OG description matches
- Business data (org or location) injected into every prompt as context
- All existing page titles/descriptions passed in to ensure uniqueness

**4c. Frontend UX**

- "Generate All with AI" button at top of SEO panel
- On click: sequential section generation with visual progress
  - Section currently generating shows spinner + "Generating..." label
  - Completed sections show checkmark animation
  - Fields pre-fill as each section completes
  - Scores update in real-time as fields populate
- Gate check: if `business_data` is null for selected location context:
  - Button disabled
  - Tooltip: "Refresh business data in Settings > Integrations first"
- After all sections complete: auto-save
- User can edit any generated field after generation

---

### Milestone 5: SEO for Posts

**5a. Post Editor Restructuring**

Current: flat scrollable form in PostsTab.tsx

New: add tab system to post editor
```
[ ✏️ Content ] [ 📊 SEO ]
```

- Content tab: existing form (title, content, excerpt, featured image, custom fields, categories, tags, status)
- SEO tab: same SeoPanel component used in page editor (shared component)
- SeoPanel receives different props for posts vs pages but scoring/generation logic is identical

**5b. Backend API for Post SEO**

- `PATCH /api/admin/websites/:projectId/posts/:postId/seo` — save SEO data
- `POST /api/admin/websites/:projectId/posts/:postId/seo/generate` — AI generation
- Same request/response format as page SEO endpoints

**5c. Rendering Pipeline for Posts**

- `assembleSinglePostHtml()` in website-builder-rebuild already fetches the post record
- Add `seo_data` to the post query
- Call same `injectSeoMeta()` function after assembly
- Backward compatible: null `seo_data` = no changes

---

## Risk Analysis

### Level 3 — Structural Risk

**Rendering pipeline change:**
- Touches the serving path for ALL websites
- Mitigation: null-check on `seo_data` ensures zero behavioral change for existing sites
- Regex-based meta tag replacement could be fragile with malformed HTML
- Mitigation: use conservative regex patterns, test against real wrapper HTML from existing sites

**Google Places API dependency:**
- External API — rate limits, downtime, cost
- Mitigation: aggressive caching (business data rarely changes), manual override fields, graceful degradation if API fails
- Cost: ~$17 per 1000 requests — minimal for refresh-on-demand pattern

**Large surface area:**
- 3 codebases, 4 tables, new AI endpoints, new UI components
- Mitigation: phased milestones, each independently shippable

**Post editor restructuring:**
- PostsTab.tsx is 500+ lines, flat form → adding tabs changes the component structure
- Mitigation: minimal restructuring — wrap existing form in Content tab, add SEO tab alongside

### Level 2 — Concern

**AI generation accuracy:**
- Claude may generate suboptimal titles/descriptions without good context
- Mitigation: feed full page content + homepage + business data; per-section prompts; user can edit after generation

**Schema validation:**
- Invalid JSON-LD hurts more than helps (Google Search Console warnings)
- Mitigation: validate generated schema against schema.org specs before saving; show validation errors in UI

---

## Definition of Done

1. **Database:** `business_data` columns on organizations and locations, `seo_data` columns on pages and posts, `meta_title`/`meta_description` removed from pages
2. **Settings:** Business data management UI in Settings > Integrations — org-level fields + per-location Google Places refresh + data display
3. **Page Editor:** Tab restructuring (device icons grouped, Code tab, SEO tab) + full SeoPanel with 26-criteria scoring, 6 collapsible sections, progress bars, location context selector
4. **Post Editor:** Tab system (Content, SEO) with shared SeoPanel component
5. **AI Generation:** "Generate All with AI" button, sequential per-section generation via claude-sonnet-4-6, pre-fills all fields, respects business data gate
6. **Rendering:** Smart meta tag override in website-builder-rebuild — page/post level `seo_data` replaces hardcoded wrapper tags, JSON-LD schema injected at head_end
7. **Backward Compatibility:** All existing sites render identically when `seo_data` is null
8. **Scoring:** Real-time client-side scoring with animated progress bars, auto-detection for wrapper-level criteria

---

## Security Considerations

- Google Places API key must be server-side only (env var), never exposed to frontend
- Business data may contain PII (phone, address) — already public via GBP, low risk
- AI-generated schema should be sanitized (no script injection via JSON-LD)
- SEO data save endpoints must validate org ownership (existing auth middleware covers this)

---

## Performance Considerations

- SEO tab loads all page titles/descriptions for uniqueness check — paginated if site has 50+ pages
- AI generation: 5 sequential API calls × ~2-4s each = ~10-20s total — progress UI keeps user engaged
- Rendering: `injectSeoMeta()` adds ~1-2ms per request (regex operations on string) — negligible
- Business data cached in Redis (10 min TTL) in website-builder-rebuild

---

## Dependency Impact

- New dependency: Google Places API (New) — requires API key with Places API enabled
- No new npm packages required (Anthropic SDK already installed, regex is native)
- Shared SeoPanel component creates coupling between page editor and post editor — acceptable, it's the same feature

---

## Blast Radius Analysis

- **Rendering pipeline:** All websites affected, but null-check makes it safe
- **Page editor:** Only the toolbar restructuring changes existing UI — device tabs become icons
- **Post editor:** Adding tabs is additive, existing form untouched inside Content tab
- **Settings:** New section is additive, no existing settings modified
- **Database:** New columns are nullable, no impact on existing queries

---

## Revision Log

### Revision 1 — 2026-03-08

**Summary:** Gate all AI generation behind business data, not just schema.

**Reason:** User confirmed all SEO generation should include business data context for better accuracy. A dental practice's title tag benefits from knowing the business name, city, specialties — not just page content.

**Changes:**
1. **Gate ALL generation** (all 5 sections) behind `business_data` existing on at least one location — not just schema (criteria 11-15). The "Generate All with AI" button is fully disabled without business data.
2. **Inject business data into ALL AI prompts** — every section's generation prompt receives org-level + location-level business data as context, not just the schema section.
3. **Placement confirmed:** Business data management lives in **Org Settings > Integrations** (PropertiesTab), with org-level umbrella fields at top + expandable business data panels per location card.

**Updated Definition of Done:**
- Item 5 revised: AI generation gated behind business data for ALL sections, not just schema. All prompts receive business data context.

### Revision 2 — 2026-03-08

**Summary:** Execution progress log.

**Milestones Completed:**

1. **Milestone 1: Database & Business Data Foundation** — DONE
   - Migration: `20260308000001_add_seo_and_business_data.ts`
   - Models updated: OrganizationModel, LocationModel, PageModel, PostModel
   - Backend service: `BusinessDataService.ts` (Google Places API integration)
   - Backend SEO service: `service.seo-generation.ts` (Claude Sonnet 4.6 AI generation)
   - API endpoints: locations routes (business data CRUD), admin/websites routes (SEO CRUD + generation)
   - Frontend API: `locations.ts` (business data functions), `websites.ts` (SeoData interface + functions)

2. **Milestone 2: Rendering Pipeline** — DONE
   - `website-builder-rebuild/src/utils/renderer.ts`: Added `injectSeoMeta()` function with smart replace-or-inject for title, description, canonical, robots, OG tags, and JSON-LD schema blocks
   - `website-builder-rebuild/src/services/seo.service.ts`: New service for fetching business data with Redis caching (10-min TTL)
   - `website-builder-rebuild/src/routes/site.ts`: Integrated SEO injection in both `assembleHtml()` (pages) and `assembleSinglePostHtml()` (posts)
   - `website-builder-rebuild/src/services/singlepost.service.ts`: Added `seo_data` to post query select
   - `website-builder-rebuild/src/types/index.ts`: Added `SeoData` interface, `organization_id` to Project, `seo_data` to Page

3. **Milestone 3: SEO Tab in Page Editor** — DONE
   - `EditorToolbar.tsx`: Restructured tabs (device icons grouped, Code tab, SEO tab)
   - `SeoPanel.tsx`: Full 26-criteria scoring engine, 6 collapsible sections, progress bars, location context selector, AI generation
   - `PageEditor.tsx`: Tri-state view system (visual/code/seo), SeoPanel integration

4. **Milestone 4: AI Generation** — DONE (bundled with Milestone 1 backend + Milestone 3 frontend)

5. **Milestone 5: SEO for Posts** — DONE
   - `PostsTab.tsx`: Added Content/SEO tab bar in post editor, SeoPanel integration for existing posts
   - Backend endpoints already support posts (Milestone 1)
   - Rendering pipeline already supports posts (Milestone 2)

**Remaining:**
- PropertiesTab Business Data UI (org settings) — not yet implemented
- This is a settings UI enhancement, not blocking core SEO functionality
