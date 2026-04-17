# Page Creation Enhancements

## Why
The manual page creation modal is missing key inputs (gradient support, GBP selection, page-specific dynamic slots). More structurally: the page pipeline currently generates wrapper/header/footer alongside every page, which is both wasteful (3 extra Claude calls per non-homepage page) and architecturally wrong — layouts are site-wide, not per-page. They deserve their own pipeline with their own prompts, own slots (logo URL, social links, etc.), and own tracking/preview.

## What
Nine changes, organized around two separate pipelines plus quality/autonomy enhancements:

**Page Creation Enhancements:**
1. **Gradient picker** — Gradient (from + to + direction) alongside solid brand colors.
2. **GBP profile picker** — Promoted from hidden "Advanced" to first-class.
3. **Dynamic slots per template page** — Page-level context slots bound by template page ID.
4. **Remove wrapper/header/footer from page pipeline** — Page generation only produces sections.

**New Layouts Pipeline (separate):**
5. **Layouts tab + dedicated generation pipeline** — Own BullMQ job, own prompts, own slots (logo URL, social links, etc.), live preview, shortcodes preserved byte-exact.

**Quality + Autonomy Enhancements:**
6. **Project warmup on creation** — When a project is created with a GBP, automatically fire `wb-project-scrape` in the background. Caches GBP/website/images/archetype/extracted slot hints so by the time admin opens Create Page, everything is ready.
7. **Smart slot pre-fill** — Modal pre-populates slot inputs from `project.extracted_slot_hints` (logo, socials, founding story excerpt, gallery URL, certifications mentioned). Admin reviews and tweaks, doesn't fill from scratch.
8. **Practice archetype classification** — One Claude call during warmup classifies the practice (`family-friendly`, `pediatric`, `luxury-cosmetic`, `specialist-clinical`, `budget-accessible`). Cached on `project.archetype`. All component generation prompts receive the archetype as a tone/style directive.
9. **Self-critique pass on each component** — After generating a section, a second Claude call reviews it (CTA clarity, headline benefit, archetype match, shortcode preservation). Regenerates once if issues found.
10. **Per-component regenerate** — Editor shows a regenerate icon on each section. Admin types a small instruction ("make CTA more urgent") → regenerates that single component in ~15s without rebuilding the page.

Done when: a fresh project auto-warms up on creation. Layouts tab is generate-able with smart-defaulted slots. Page modal opens with most slots pre-filled. Page pipeline runs sections-only with archetype-aware prompts and self-critique. Editor supports per-component regeneration.

## Context

**Relevant files (backend):**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — `buildComponentList` and `buildComponentMessage` need gradient + dynamic slot support
- `src/controllers/admin-websites/AdminWebsitesController.ts` — `startPipeline` handler passes params to pipeline
- `src/models/website-builder/TemplatePageModel.ts` — needs `dynamic_slots` field
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — prompt needs gradient instructions
- `src/database/migrations/` — new migration for schema changes

**Relevant files (frontend):**
- `frontend/src/components/Admin/CreatePageModal.tsx` — single-page creation modal (primary target)
- `frontend/src/pages/admin/WebsiteDetail.tsx` — build-all modal (lines 1338-1577)
- `frontend/src/components/Admin/ColorPicker.tsx` — existing hex color picker
- `frontend/src/api/websites.ts` — API types for pipeline params
- `frontend/src/api/templates.ts` — `TemplatePage` type

**Patterns to follow:**
- ColorPicker component pattern for gradient picker
- `searchPlaces` / `getPlaceDetails` API already used in CreatePageModal (line 22-23) for GBP search

**Reference file:** `frontend/src/components/Admin/ColorPicker.tsx` — closest analog for gradient picker component

## Constraints

**Must:**
- Gradient picker is optional — solid colors remain the default
- Dynamic slots and layout slots are all optional — skipped when empty
- GBP picker works in both single-page and build-all modals (shared component)
- Dynamic slot definitions live on `template_pages` (per page); layout slot definitions live on `templates` (per template)
- Page pipeline never generates wrapper/header/footer — those are owned exclusively by the layouts pipeline
- Page generation refuses to run when layouts are not yet generated (explicit error, not silent failure)
- Layout generation must preserve all shortcodes/tokens in the template byte-exact (`{{slot}}`, `[post_block]`, `[review_block]`, etc.)
- Layout generation starts from the template's actual wrapper/header/footer markup — does not generate structure from scratch
- Gradient CSS must work with CDN Tailwind — injected via wrapper `<style>` block, not Tailwind classes

**Must not:**
- Generate layouts implicitly as a side effect of page generation — Layouts pipeline is explicitly triggered
- Break existing projects that already have wrappers (backfill `layouts_generated_at`)
- Require gradients — they're an enhancement, not a mandate
- Modify the shortcode syntax or introduce new shortcodes

**Out of scope:**
- Template editor UI for defining/editing slot schemas (admin sets them via API or migration; follow-up for UI)
- Individual layout component editors (admin regenerates the whole layout if changes are needed)
- Radial gradients, multiple gradient stops, gradient overlays
- Changing the color system architecture

## Risk

**Level:** 3 (Structural Risk — introduces a new pipeline and shifts ownership of wrapper/header/footer)

**Risks identified:**
- Page pipeline now refuses to run without layouts. Existing automation that expects single-shot generation will break. → **Mitigation:** Backfill `layouts_generated_at` for projects with existing non-empty wrappers so they behave as "layouts already generated." New projects must go through the Layouts tab first.
- Shortcodes could be mangled by Claude despite explicit prompt instructions. Losing `{{slot}}` breaks every page on the site. → **Mitigation:** Post-generation validation — after each layout component generates, assert required tokens exist in the output. If `{{slot}}` is missing from the generated wrapper, reject and retry once; on second failure mark `layouts_generation_status = 'failed'` and preserve the previous good wrapper.
- Gradient CSS injection may conflict with CDN Tailwind's opacity modifiers → **Mitigation:** Inject `background` via custom CSS classes, not Tailwind gradient utilities. Same pattern as existing color injection.
- Two separate live-preview polling systems (pages + layouts) increase frontend complexity → **Mitigation:** Extract the polling hook into a reusable hook used by both surfaces.

**Blast radius:**
- `service.generation-pipeline.ts` — modified (layouts branches removed from buildComponentList)
- `CreatePageModal.tsx` and `WebsiteDetail.tsx` — modified (slot inputs, gradient picker, layouts tab)
- `worker.ts` — modified (new worker registration)
- New backend files: `service.layouts-pipeline.ts`, `LayoutGenerator.md`, `websiteLayouts.processor.ts`
- New frontend files: `DynamicSlotInputs.tsx`, `GradientPicker.tsx`, `GbpSearchPicker.tsx`

**Pushback:**
- Full gradient picker (arbitrary stops, angles, radial) is overengineered. A 2-color linear gradient with 4 direction presets covers 95% of the use case.
- Giving each layout component its own editable version history is premature. For now, regeneration overwrites — versioning is a follow-up if clients start asking for layout A/B tests.

## Recommendations

### Gradient Model
Instead of a full gradient editor, use this:
```
gradient_enabled: boolean (default false)
gradient_from: string (hex — defaults to primaryColor)
gradient_to: string (hex — defaults to accentColor)
gradient_direction: "to-r" | "to-br" | "to-b" | "to-tr" (default "to-br")
```

Injected into the wrapper `<style>` block as:
```css
.bg-gradient-brand {
  background: linear-gradient(to bottom right, #064B9E, #8DC740) !important;
}
.text-gradient-brand {
  background: linear-gradient(to bottom right, #064B9E, #8DC740);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

The generator prompt gets: "This site uses a brand gradient from #064B9E to #8DC740 (bottom-right). Use `bg-gradient-brand` for hero backgrounds and CTAs. Use `text-gradient-brand` for accent headings."

This is 4 fields instead of an arbitrary gradient data structure. Simple, effective, covers the use case.

### Dynamic Slots — Bound to Template Page by ID

Slots live on each `template_pages` row as a JSONB column. **No runtime name matcher.** The pipeline and frontend always read `template_pages.dynamic_slots` directly by ID. If the column is `NULL` or `[]`, no slots render — that's the clean empty state.

**Slot schema on `template_pages.dynamic_slots` (JSONB):**
```json
[
  {
    "key": "certifications_credentials",
    "label": "Certifications & Credentials",
    "type": "text",
    "placeholder": "e.g., ADA member, Invisalign Diamond Provider, Board certified in Endodontics",
    "description": "Board certifications, awards, professional affiliations. Paste URL or text."
  }
]
```

`type`: `"text"` (textarea) or `"url"` (URL input — pipeline scrapes and extracts).

**Scope decision — what belongs in a slot vs. elsewhere:**
- ❌ Individual services, doctor bios, team members → **handled by posts** (post_block renders them)
- ❌ Office hours → **handled by GBP data**
- ❌ Business name, address, phone, reviews → **handled by GBP data**
- ✅ Practice-level narrative content (founding story, values, UVP)
- ✅ Page-specific policy content (insurance, billing, emergency protocols)
- ✅ External content URLs to scrape (gallery, certifications page)

Slots only exist for content the page genuinely needs that isn't already covered by posts, GBP, or website scrape.

**Seeding strategy (one-time, by direct ID):**
The migration identifies each dental SEO template page by its name within that template (one query to find IDs) and assigns the slots below by direct UPDATE. No fuzzy matching at runtime. New template pages start with `dynamic_slots: []` — admin configures them via the template page editor (separate follow-up).

**Slot definitions per dental SEO template page:**

#### Homepage
Sections: hero, upgrade-smile, orthodontist, services, why-choose-us, testimonials, faq, gallery, insurance, appointment
*(services/doctor sections render from posts — no slots needed for those)*
```json
[
  { "key": "certifications_credentials", "type": "text", "label": "Certifications & Credentials",
    "description": "Board certifications, awards, memberships. Used in 'Why Choose Us'." },
  { "key": "unique_value_proposition", "type": "text", "label": "What Makes This Practice Unique",
    "description": "1-2 sentences capturing the practice's differentiator. Used in hero and upgrade-smile." },
  { "key": "gallery_source_url", "type": "url", "label": "Gallery/Portfolio URL",
    "description": "URL to scrape before/after or portfolio photos from. Used in the gallery section." },
  { "key": "faq_focus_topics", "type": "text", "label": "FAQ Focus Topics",
    "description": "Topics the FAQ should cover (e.g., insurance, first visit, pediatric care)." }
]
```

#### About / Our Story
Sections: hero, values, doctor-bio, team, cta
*(doctor-bio and team render from posts — no slots needed for those)*
```json
[
  { "key": "practice_founding_story", "type": "text", "label": "Practice Founding Story",
    "description": "How and why the practice was founded. Used in hero and values sections." },
  { "key": "practice_values", "type": "text", "label": "Core Practice Values",
    "description": "3-5 core values or principles (e.g., patient-first, evidence-based, lifelong care)." }
]
```

#### Services List
Sections: hero, services-grid, cta
*(services-grid renders entirely from posts — generic page_context handles any hero intro tweak)*
```json
[]
```
Excluded from seeding. No slots needed.

#### Service Detail
*(Service detail is a post type with a single_template, not a template_page. Excluded from this spec.)*

#### Contact
Sections: hero, contact-content
```json
[
  { "key": "parking_directions", "type": "text", "label": "Parking & Directions",
    "description": "How to find and park at the office. Especially helpful in urban locations." },
  { "key": "insurance_accepted_list", "type": "text", "label": "Insurance Quick List",
    "description": "Brief list of accepted insurance carriers for the contact page. Full details go on the Insurance page." },
  { "key": "new_patient_forms_url", "type": "url", "label": "New Patient Forms URL",
    "description": "Link to downloadable new patient paperwork." }
]
```

#### Consultation
Sections: consultation-form
```json
[
  { "key": "consultation_types", "type": "text", "label": "Consultation Types Offered",
    "description": "e.g., Free 15-minute phone consult, in-person new patient exam, virtual consult." },
  { "key": "what_to_expect", "type": "text", "label": "What to Expect",
    "description": "What happens during a consultation. Helps build patient confidence." },
  { "key": "consultation_form_fields", "type": "text", "label": "Custom Form Fields",
    "description": "Additional fields needed beyond name/email/phone (e.g., preferred time, insurance)." }
]
```

#### Insurance & Financial Information
```json
[
  { "key": "accepted_insurance_list", "type": "text", "label": "Accepted Insurance Plans",
    "description": "Specific plans/carriers the practice is in-network or out-of-network with." },
  { "key": "payment_options", "type": "text", "label": "Payment & Financing Options",
    "description": "Financing partners (CareCredit, Sunbit), in-house membership plans, payment methods." },
  { "key": "billing_policy", "type": "text", "label": "Billing Policy",
    "description": "Payment due dates, deposit requirements, cancellation/no-show fees." },
  { "key": "cost_estimate_process", "type": "text", "label": "Cost Estimate Process",
    "description": "How patients get a cost estimate before treatment (consultation, phone quote, etc.)." }
]
```

#### Dental Emergencies
```json
[
  { "key": "emergency_hours_policy", "type": "text", "label": "After-Hours Availability",
    "description": "Is there an emergency line? After-hours coverage? On-call doctor?" },
  { "key": "common_emergencies_handled", "type": "text", "label": "Emergencies Handled",
    "description": "Specific situations the practice handles (knocked-out tooth, severe pain, broken crown)." },
  { "key": "emergency_contact_details", "type": "text", "label": "Emergency Contact",
    "description": "Emergency phone number or contact info if different from main office." },
  { "key": "first_aid_instructions", "type": "text", "label": "First-Aid Instructions",
    "description": "Advice patients can follow while waiting for their emergency appointment." }
]
```

### GBP Picker
Extract the existing GBP search logic from `CreatePageModal.tsx` (lines 81-87, the override section) into a shared `GbpSearchPicker` component. Use it in:
- CreatePageModal — as a top-level field (not hidden in Advanced)
- WebsiteDetail build-all modal — already has GBP search, just use the shared component

Pre-populate from the project's `step_gbp_scrape` / `selected_place_id`. The picker shows the currently selected profile with an option to search and change.

### Wrapper/Header/Footer — Remove From Page Pipeline
Page pipeline's `buildComponentList` no longer includes wrapper/header/footer. Ever. Sections only. This is enforced by deleting the wrapper/header/footer branches entirely from that function.

Layouts are owned by a **separate Layouts Pipeline** (see below) and live on the project row as they do today.

### Layouts Pipeline

**When it runs:** Explicitly triggered by admin from the Layouts tab. Never runs implicitly. Must run before pages are usable (the page renderer depends on project.wrapper/header/footer).

**Flow:**
1. Admin opens Layouts tab. If `layouts_generated_at IS NULL` → show "Generate Layouts" button + slot inputs.
2. Admin fills `layout_slots` (logo URL, social links, etc.) and clicks Generate.
3. Backend enqueues `wb-layout-generate` job.
4. Job runs:
   - If `logo_url` slot provided: download → upload to S3 → store the S3 URL on `project.logo_s3_url`
   - Read template's `wrapper`, `header`, `footer` markup (starting point — never generated from scratch)
   - Read cached GBP + website + image analysis data (reuse from project scrape)
   - For each layout component in order: wrapper → header → footer
     - Call Claude with the component's template markup + slots + business data + logo S3 URL
     - System prompt: `LayoutGenerator.md` (distinct from ComponentGenerator)
     - Write the generated HTML to `project.wrapper/header/footer` immediately
     - Update `project.layouts_generation_progress` JSONB
   - On complete: set `layouts_generated_at = now()`, clear progress
5. Frontend polls the project (same pattern as page live preview), renders partial layouts, animates new components in.

**Cancel:** Same `generation_cancel_requested` flag works for layouts too.

### LayoutGenerator Prompt — Critical Rules
- **Template markup is the starting point.** Don't invent structure — customize the given markup.
- **Shortcodes must be preserved byte-exact.** Any of these tokens must appear unchanged in the output: `{{slot}}`, `[post_block ...]`, `[review_block ...]`, `{{business_name}}`, `{{business_phone}}`, and any other `{{...}}` or `[...]` tokens in the template. The prompt explicitly states: "DO NOT modify or remove any shortcode/token. Only customize the surrounding HTML and content."
- **Wrapper rules:**
  - `{{slot}}` must appear exactly once
  - `<style>` block in `<head>` receives brand color + gradient CSS injection (same logic as current ComponentGenerator wrapper rules)
  - Fonts, meta tags, and analytics scripts in the template preserved
- **Header rules:**
  - If `logo_url` slot is provided and downloaded, use the S3 URL in the nav logo `<img>` src
  - Use business name as fallback text if no logo
  - Nav CTA button uses `nav_cta_text` slot or defaults to "Book Appointment"
- **Footer rules:**
  - Populate with GBP business info (name, address, phone)
  - Social links from `social_links` slot (one per line, parsed into icon links)
  - Service areas from `footer_service_areas` slot
  - Legal text from `custom_footer_legal_text` slot (fallback: "© {year} {business_name}. All rights reserved.")

### Layout Slots (seeded on dental SEO template)

Stored on `templates.layout_slots` (JSONB). One set per template since a template has one wrapper/header/footer.

```json
[
  { "key": "logo_url", "type": "url", "label": "Logo URL",
    "description": "URL to the practice's logo image. Downloaded, stored in S3, used in the header." },
  { "key": "logo_alt_text", "type": "text", "label": "Logo Alt Text",
    "description": "Alt text for the logo image (defaults to business name)." },
  { "key": "social_links", "type": "text", "label": "Social Media Links",
    "description": "One URL per line. Facebook, Instagram, LinkedIn, etc. Rendered as icon links in the footer." },
  { "key": "nav_cta_text", "type": "text", "label": "Nav CTA Button Text",
    "description": "Text for the primary CTA in the header (default: 'Book Appointment')." },
  { "key": "footer_service_areas", "type": "text", "label": "Service Areas",
    "description": "Cities or regions served. Shown in the footer (e.g., 'Serving Austin, Round Rock, and Cedar Park')." },
  { "key": "custom_footer_legal_text", "type": "text", "label": "Custom Legal/Disclaimer Text",
    "description": "Any custom legal text beyond standard copyright (e.g., ADA disclaimer, HIPAA notice)." }
]
```

## Tasks

### T1: Database migration + seeding
**Do:**
1. Add `dynamic_slots JSONB DEFAULT NULL` to `website_builder.template_pages`
2. Add `layout_slots JSONB DEFAULT NULL` to `website_builder.templates`
3. Add gradient columns to `website_builder.projects`:
   - `gradient_enabled BOOLEAN DEFAULT FALSE`
   - `gradient_from VARCHAR(255) DEFAULT NULL`
   - `gradient_to VARCHAR(255) DEFAULT NULL`
   - `gradient_direction VARCHAR(20) DEFAULT 'to-br'`
4. Add layout generation tracking to `website_builder.projects`:
   - `layouts_generated_at TIMESTAMPTZ DEFAULT NULL`
   - `layouts_generation_progress JSONB DEFAULT NULL` (shape: `{total, completed, current_component}`)
   - `layouts_generation_status VARCHAR(20) DEFAULT NULL` (values: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled')
   - `layout_slot_values JSONB DEFAULT NULL` (persisted slot inputs from last generation run)
   - `logo_s3_url VARCHAR(500) DEFAULT NULL` (the hosted logo after download)
5. Add warmup + quality columns to `website_builder.projects`:
   - `warmup_status VARCHAR(20) DEFAULT NULL` ('queued' | 'running' | 'ready' | 'failed')
   - `warmup_completed_at TIMESTAMPTZ DEFAULT NULL`
   - `archetype VARCHAR(50) DEFAULT NULL` (e.g., 'family-friendly', 'pediatric', 'luxury-cosmetic', 'specialist-clinical', 'budget-accessible')
   - `archetype_metadata JSONB DEFAULT NULL` (tone descriptor, color palette recommendation, voice samples)
   - `extracted_slot_hints JSONB DEFAULT NULL` (parsed logo/socials/excerpts/etc. for slot pre-fill)
6. Backfill: For existing projects with non-empty `wrapper` column, set `layouts_generated_at = updated_at`.
7. Seed `template_pages.dynamic_slots` for dental SEO template pages directly by ID with the slot JSONB defined in the spec.
8. Seed `templates.layout_slots` for the dental SEO template with the layout slot JSONB defined in the spec.

**Files:**
- `src/database/migrations/{timestamp}_page_creation_enhancements.ts`
**Depends on:** none
**Verify:** `npm run db:migrate` clean. All new columns present. Slots seeded on dental SEO template_pages and template. Existing projects backfilled.

### T2: Backend — page pipeline (sections-only) + gradient + dynamic slots
**Do:**
1. Modify `buildComponentList` in `service.generation-pipeline.ts`: **remove wrapper/header/footer entirely** — page pipeline now only generates sections. Delete those branches from the function.
2. Modify `generatePageComponents`:
   - Remove the homepage-specific project-write logic for wrapper/header/footer (no longer applicable)
   - If project has no generated layouts (`layouts_generated_at IS NULL`), return an error immediately: `"LAYOUTS_NOT_GENERATED"` — refuse to generate sections for a project without layouts
   - Accept `gradientEnabled`, `gradientFrom`, `gradientTo`, `gradientDirection`, and `dynamicSlotValues` params
3. Modify `buildComponentMessage`:
   - Include gradient info in the color/style section (tells Claude the site uses gradient and which classes to use)
   - Include dynamic slot values under "Page-Specific Content" section — only non-empty values
4. Update `ComponentGenerator.md` prompt:
   - Add gradient instructions: when to use `bg-gradient-brand` for backgrounds, `text-gradient-brand` for accent headings
   - Remove wrapper-specific rules (wrapper is no longer generated here)

**Files:**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — sections-only)
- `src/agents/websiteAgents/builder/ComponentGenerator.md` (modify — gradient instructions, strip wrapper rules)
**Depends on:** T1
**Verify:** Page pipeline generates only sections. Never calls Claude for wrapper/header/footer. Refuses to run if layouts not generated yet. Gradient + slot values appear in prompt output.

### T3: Backend — API param extensions
**Do:**
1. Extend `startPipeline` handler to accept `gradient` object and `dynamicSlotValues` record
2. Extend `createAllFromTemplate` handler to accept gradient and pass through
3. Extend `ProjectScrapeJobData` and `PageGenerateJobData` types with gradient + dynamic slot fields
4. Add `GET /templates/:templateId/pages/:pageId/slots` endpoint (returns dynamic_slots for a template page)
5. Add `PATCH /templates/:templateId/pages/:pageId` to allow updating dynamic_slots (admin tool)

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/workers/processors/websiteGeneration.processor.ts` (modify — pass new params)
- `src/routes/admin/websites.ts` (modify — add slots endpoint)
- `frontend/src/api/websites.ts` (modify — extend request types)
- `frontend/src/api/templates.ts` (modify — extend TemplatePage type, add slots fetch)
**Depends on:** T2
**Verify:** API accepts gradient and dynamicSlotValues params. Template page slots are fetchable.

### T4: Frontend — GbpSearchPicker component
**Do:**
Extract GBP search logic from CreatePageModal into a shared component:
- Shows current selection (name, address, rating)
- Search input with debounced Places API autocomplete
- Suggestion dropdown
- Selecting a suggestion calls `getPlaceDetails` and returns full GBP data
- "Clear" to reset to project default

**Files:**
- `frontend/src/components/Admin/GbpSearchPicker.tsx` (new)
**Depends on:** none
**Verify:** Component renders, search works, selection returns GBP data.

### T5: Frontend — GradientPicker component
**Do:**
Create a gradient picker component:
- Toggle: "Use gradient" checkbox
- When enabled: shows direction presets (→ ↘ ↓ ↗) as clickable icons
- Two color inputs: "From" and "To" (pre-filled from primary/accent)
- Live preview strip showing the gradient
- Emits: `{ enabled: boolean, from: string, to: string, direction: string }`

**Files:**
- `frontend/src/components/Admin/GradientPicker.tsx` (new)
**Depends on:** none
**Verify:** Component renders, toggle works, direction changes, colors editable, preview updates.

### T6: Frontend — CreatePageModal enhancements
**Do:**
1. Replace "Advanced: Override Business Data" GBP section with `GbpSearchPicker` as a top-level field
2. Add `GradientPicker` below Brand Colors
3. When a template page is selected, fetch its `dynamic_slots` and render input fields:
   - Each slot: label, description, type toggle (text/URL), textarea or URL input
   - All optional (skip if empty)
4. Pass gradient, GBP data, and dynamic slot values to `startPipeline` call
5. Update the build-all modal in WebsiteDetail.tsx: add `GradientPicker`, use shared `GbpSearchPicker`

**Files:**
- `frontend/src/components/Admin/CreatePageModal.tsx` (modify)
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — build-all modal)
**Depends on:** T3, T4, T5
**Verify:** Manual: open create page modal, see GBP picker + gradient picker + dynamic slots for selected template page.

### T7: Backend — Layouts Pipeline service + prompt
**Do:**
1. Create `LayoutGenerator.md` prompt in `src/agents/websiteAgents/builder/`:
   - System prompt covering the Critical Rules in the spec (template as starting point, shortcodes preserved byte-exact, wrapper/header/footer specific rules)
   - Takes component type as part of user message (wrapper/header/footer)
2. Create `service.layouts-pipeline.ts` in `src/controllers/admin-websites/feature-services/`:
   - Exports `generateLayouts(projectId: string, slotValues: Record<string, string>, signal?: AbortSignal): Promise<void>`
   - Reads project (requires cached scrape data — returns error if missing)
   - Reads active template's wrapper/header/footer markup + layout_slots definitions
   - If `logo_url` provided: download → upload to S3 (reuse `processImages` pattern from generation-pipeline.ts) → store on `project.logo_s3_url`
   - Initializes `layouts_generation_progress = {total: 3, completed: 0, current_component: 'wrapper'}`, `layouts_generation_status = 'generating'`
   - For each component [wrapper, header, footer]:
     - Check cancel flag + abort signal
     - Call Claude via `runAgent({systemPrompt: LayoutGenerator, userMessage: componentMarkup + slots + gbp + colors, prefill: "{"})`
     - Write to `project.wrapper/header/footer` immediately
     - Increment progress, update current_component
   - On complete: `layouts_generated_at = now()`, `layouts_generation_status = 'ready'`, clear progress
   - On failure: `layouts_generation_status = 'failed'`, preserve partial layouts
3. Persist `layout_slot_values` on the project row before generation so reruns keep the last inputs as defaults

**Files:**
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (new)
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (new)
**Depends on:** T1
**Verify:** Function can be called directly, produces 3 Claude calls, writes wrapper/header/footer to project, preserves `{{slot}}` and any `[...]` shortcodes from the template.

### T8: Backend — Layouts BullMQ processor + API endpoints
**Do:**
1. Create `websiteLayouts.processor.ts` in `src/workers/processors/`:
   - Exports `processLayoutGenerate(job)` handling `wb-layout-generate` jobs
   - Wraps `generateLayouts()` with cancel polling + AbortController (same pattern as websiteGeneration.processor.ts)
2. Register `wb-layout-generate` worker in `worker.ts` (concurrency 1, lockDuration 600000)
3. Add endpoints in `AdminWebsitesController.ts`:
   - `POST /:id/generate-layouts` — accepts `slotValues: Record<string,string>`, enqueues the BullMQ job
   - `GET /:id/layouts-status` — returns `{ status, progress, generated_at, wrapper, header, footer, logo_s3_url }` for polling
4. Add routes in `routes/admin/websites.ts`
5. Ensure the existing `cancelGeneration` endpoint also handles layout jobs (it already sets the project flag, which the layout processor polls)

**Files:**
- `src/workers/processors/websiteLayouts.processor.ts` (new)
- `src/workers/worker.ts` (modify — register new worker)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — add handlers)
- `src/routes/admin/websites.ts` (modify — add routes)
**Depends on:** T7
**Verify:** POST `/generate-layouts` enqueues job, worker runs, polling endpoint reflects progress, cancel works.

### T9: Frontend — Layouts tab UI with live preview
**Do:**
1. Identify the existing Layouts tab in `WebsiteDetail.tsx` and restructure its content:
   - **Empty state** (`layouts_generated_at IS NULL`): show a "Generate Layouts" panel with:
     - Heading + intro explaining what layouts are
     - Fetched `layout_slots` for the project's template rendered as input fields (logo URL, social links, etc.), same slot renderer as the dynamic slots on pages
     - **Pre-fill from `project.extracted_slot_hints`** (T11) — logo URL, social links, etc. populated automatically; admin reviews and tweaks
     - "Generate Layouts" button → calls `POST /:id/generate-layouts` with slot values
   - **Generating state** (`layouts_generation_status === 'generating'`): show live preview + progress bar:
     - Progress bar with `completed/total` and `current_component` label
     - Iframe rendering the partial layout (wrapper + header + footer assembled with an empty sections array)
     - Cancel button → calls existing cancel endpoint
     - Poll `/:id/layouts-status` every 2s (same pattern as page live preview in PageEditor.tsx)
   - **Ready state**: show the generated layouts preview, the slot values that produced them (editable), and a "Regenerate Layouts" button
2. Add API calls in `frontend/src/api/websites.ts`:
   - `generateLayouts(projectId, slotValues)` → POST `/:id/generate-layouts`
   - `fetchLayoutsStatus(projectId)` → GET `/:id/layouts-status`
3. Extract the slot renderer into a reusable component `<DynamicSlotInputs>` used by both the page modal (T6) and the Layouts tab (T9).

**Files:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — Layouts tab content)
- `frontend/src/api/websites.ts` (modify — add layouts endpoints)
- `frontend/src/components/Admin/DynamicSlotInputs.tsx` (new — shared slot renderer)
**Depends on:** T8, T11
**Verify:** Manual: open Layouts tab on a warmup-completed project, see Generate Layouts form with logo URL / social links pre-filled from extraction. Click Generate, watch progress bar + live preview. Cancel works. After completion, "Regenerate" option appears.

### T10: Backend — Project warmup + smart slot extraction + archetype
**Do:**
1. Trigger `wb-project-scrape` automatically when a project is created with a `selected_place_id`. Modify the project creation handler in `AdminWebsitesController.ts` to enqueue the warmup job after the project is inserted. Set `warmup_status = 'queued'`.
2. Extend `scrapeAndCacheProject` in `service.generation-pipeline.ts` (or wrap it) to:
   - Set `warmup_status = 'running'` at start
   - After GBP + website + image analysis steps, run two new steps:
     - **Smart slot extraction** — parse the cached HTML for `logo_url` (from `<link rel="icon">`, `og:image`, `<img alt*="logo">`), `social_links` (regex for facebook/instagram/linkedin URLs), `founding_story_excerpt` (scan for an /about page in scraped pages, take first 2 paragraphs), `gallery_url` (look for /gallery, /portfolio, /smile-gallery), `certifications_mentioned` (regex for ADA, Invisalign, board certified, AAO, Diamond Provider), `service_areas_mentioned` (parse from footer/contact pages), `team_member_names` (look for "Dr. " patterns)
     - **Practice archetype classification** — one Claude call with `ArchetypeClassifier.md` system prompt. Input: GBP category + top 5 reviews + business description. Output: `{ archetype, tone_descriptor, color_palette_recommendation, voice_samples }`
   - Persist results to `extracted_slot_hints` and `archetype` / `archetype_metadata` columns
   - Set `warmup_status = 'ready'`, `warmup_completed_at = now()`
3. Create new prompt: `src/agents/websiteAgents/builder/ArchetypeClassifier.md`
4. Create new utility: `src/controllers/admin-websites/feature-utils/util.slot-extractor.ts` — pure HTML parsing functions, no DB or LLM
5. Add `GET /:id/warmup-status` endpoint for the frontend to poll warmup progress (returns `warmup_status`, `extracted_slot_hints`, `archetype`)

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — auto-enqueue warmup on project create, add status endpoint)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — add extraction + archetype steps)
- `src/controllers/admin-websites/feature-utils/util.slot-extractor.ts` (new)
- `src/agents/websiteAgents/builder/ArchetypeClassifier.md` (new)
- `src/routes/admin/websites.ts` (modify — add warmup-status route)
**Depends on:** T1
**Verify:** Create a new project with a place_id. Within 1-2 minutes, project row has `warmup_status='ready'`, `extracted_slot_hints` populated with parsed values, `archetype` set.

### T11: Backend — Slot pre-fill mapper + endpoint
**Do:**
1. Create `src/controllers/admin-websites/feature-services/service.slot-prefill.ts`:
   - Exports `getPrefilledSlotValues(projectId, slotDefinitions): Record<string, string>`
   - Reads `project.extracted_slot_hints` and the slot definitions
   - Maps hints to slots by key (deterministic table — `certifications_credentials` ← `certifications_mentioned.join(", ")`, `gallery_source_url` ← `gallery_url`, `practice_founding_story` ← `founding_story_excerpt`, etc.)
   - Returns `{ slotKey: extractedValue }` for any slots with matching hints
2. Add `GET /:id/slot-prefill?templatePageId=X` and `GET /:id/slot-prefill?layout=true` endpoints — return pre-filled slot values for the page or layout slots respectively
3. Use the pre-filled values in `T6` (page modal) and `T9` (Layouts tab) — modal renders slots with these as initial values, admin edits if needed

**Files:**
- `src/controllers/admin-websites/feature-services/service.slot-prefill.ts` (new)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — add prefill endpoint)
- `src/routes/admin/websites.ts` (modify)
- `frontend/src/api/websites.ts` (modify — add `fetchSlotPrefill`)
**Depends on:** T10
**Verify:** Hit the prefill endpoint for a warmup-completed project — returns slot values matching the extracted hints.

### T12: Backend — Self-critique pass on component generation
**Do:**
1. Create new prompt `src/agents/websiteAgents/builder/ComponentCritic.md`:
   - System prompt: "Review this generated HTML section. Check: (1) Is the CTA actionable and clear? (2) Is the headline benefit-driven, not feature-listed? (3) Does the tone match the practice archetype? (4) Are all shortcodes preserved (`{{slot}}`, `[post_block]`, `[review_block]`)? (5) Are there any obvious issues (broken markup, invented URLs, orphan elements)?"
   - Output: `{ pass: boolean, issues: string[], suggested_improvements: string }`
2. Modify `generatePageComponents` in `service.generation-pipeline.ts`:
   - After generating a section, call critic with the generated HTML + archetype
   - If `pass: false`, regenerate ONCE with the critique appended to the user message ("Previous attempt had these issues: [issues]. Please regenerate addressing them.")
   - If second attempt also fails critique, accept the output anyway (don't block) — log the failure for observability
3. Pass `archetype` from project row into the prompt context (both for ComponentGenerator and ComponentCritic)
4. Same pattern in `service.layouts-pipeline.ts` for layout components

**Files:**
- `src/agents/websiteAgents/builder/ComponentCritic.md` (new)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — critique pass)
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (modify — critique pass for layouts)
- `src/agents/websiteAgents/builder/ComponentGenerator.md` (modify — accept archetype directive)
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (modify — accept archetype directive)
**Depends on:** T2, T7, T10
**Verify:** Generate a page, log shows critic ran for each component, regenerate fired only when critique failed. Output quality measurably better.

### T13: Per-component regenerate (backend + frontend)
**Do:**
1. **Backend**:
   - Add endpoint `POST /:id/pages/:pageId/regenerate-component` accepting `{ componentName: string, instruction?: string }`
   - Enqueue a `wb-page-generate` job with a `singleComponent` flag — processor regenerates only that one component (calls Claude once + critique once, writes only that section to the `sections` array by index/name match)
2. **Frontend (PageEditor.tsx)**:
   - When in `ready` state, render a small regenerate icon overlay on each section in the iframe (via the existing iframe selector hook)
   - Click → modal: "What should change?" textarea + Regenerate button
   - On submit → POST to regenerate endpoint → switch back to live preview mode briefly while just that component regenerates → animate the swap when ready
   - Same polling/animation pattern as full live preview, but scoped to one section

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — regenerate endpoint)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — accept singleComponent param)
- `src/workers/processors/websiteGeneration.processor.ts` (modify — pass singleComponent through)
- `src/routes/admin/websites.ts` (modify)
- `frontend/src/pages/admin/PageEditor.tsx` (modify — regenerate icons, modal, swap animation)
- `frontend/src/api/websites.ts` (modify — `regenerateComponent` API call)
**Depends on:** T12
**Verify:** Open a generated page, hover over a section, click regenerate icon, type "make CTA more urgent", click Regenerate. Section regenerates in ~15s, swaps in with animation. Other sections unchanged.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend)
- [ ] `cd frontend && npx tsc --noEmit` — zero errors (frontend)
- [ ] **Pipeline architecture**
  - [ ] Page pipeline generates sections only — never calls Claude for wrapper/header/footer
  - [ ] Page generation refuses to run if project has no layouts (error: LAYOUTS_NOT_GENERATED)
- [ ] **Layouts pipeline**
  - [ ] Layouts tab shows Generate Layouts form when empty, with layout slot inputs
  - [ ] Layout slot inputs are pre-filled from `extracted_slot_hints` (logo, socials, etc.)
  - [ ] Generate Layouts triggers BullMQ job, live preview shows progress, components appear as generated
  - [ ] Logo URL slot: image downloaded, uploaded to S3, used in generated header
  - [ ] All shortcodes (`{{slot}}`, `[post_block]`, etc.) preserved byte-exact in generated layouts
  - [ ] Template wrapper/header/footer markup used as starting point — structure not invented
  - [ ] Cancel button stops layout generation, marks status 'cancelled'
- [ ] **Project warmup + smart pre-fill**
  - [ ] Creating a project auto-enqueues `wb-project-scrape` warmup job
  - [ ] Warmup populates `extracted_slot_hints`, `archetype`, `archetype_metadata`
  - [ ] Page modal opens with slots pre-filled from `extracted_slot_hints`
  - [ ] Layouts tab opens with slots pre-filled from `extracted_slot_hints`
- [ ] **Archetype-aware generation + critique**
  - [ ] All Claude generation calls receive the project archetype as a tone directive
  - [ ] Each generated component runs through ComponentCritic; if `pass: false`, regenerates once
- [ ] **Per-component regenerate**
  - [ ] Editor shows regenerate icons on each section
  - [ ] Click regenerate, type instruction, single component regenerates in ~15s with animation
- [ ] **Page modal enhancements**
  - [ ] Gradient picker renders with direction presets and color inputs
  - [ ] Gradient CSS classes injected in wrapper `<style>` when enabled
  - [ ] GBP search picker is top-level (not hidden in Advanced) in both modals
  - [ ] Dynamic slots render for selected template page, values pass to generator prompt
  - [ ] Empty slots are skipped (no noise in prompt)
- [ ] **Backward compat**
  - [ ] Existing projects with wrappers are backfilled (`layouts_generated_at` set), no regression
  - [ ] No regressions in page editor, page list, or template system
