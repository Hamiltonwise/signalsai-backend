# Page Creation Enhancements

> **Depends on:** `plans/04172026-no-ticket-project-identity-architecture` must be executed first. This plan reads project data from `project_identity` JSONB (which Plan A introduces). Warmup, archetype classification, and slot extraction all live in Plan A.

## Why
The current page pipeline is sound but could be significantly improved: layouts are per-page instead of site-wide (architecturally wrong and wasteful), the create-page modal lacks gradient support and first-class GBP selection, there are no template-page-specific context slots, generated output quality could jump with a self-critique pass, iteration is painful (rebuilding whole pages to fix one section), and token spend per page is ~145k when it could be ~32k with tool calling + prompt caching.

## What
Eight enhancements on top of the Project Identity foundation:

**Page Creation:**
1. **Gradient picker** — gradient (from + to + direction) alongside solid brand colors. Written to project_identity.brand + mirrored to legacy columns.
2. **GBP profile picker (shared component)** — promoted from hidden "Advanced" to first-class in both the single-page modal and the build-all flow.
3. **Dynamic slots per template page** — page-level context slots (certifications, UVP, gallery URL, etc.) bound by template page ID. Pre-filled from `project_identity.content_essentials` and `project_identity.extracted_assets` where keys match.
4. **Remove wrapper/header/footer from page pipeline** — page generation produces only sections. Layouts owned by the new Layouts pipeline.

**New Layouts Pipeline (separate from page pipeline):**
5. **Layouts tab + dedicated BullMQ job** — own prompts, own slots (logo URL, social links, etc.), live preview with progress bar, shortcodes preserved byte-exact. Pre-fills from project_identity.

**Quality + Token Efficiency:**
6. **Self-critique pass** — after each generated component, a second Claude call (using `report_critique` tool) checks CTA clarity, headline benefit, archetype match, shortcode preservation. Regenerates once if issues found.
7. **Per-component regenerate** — editor shows a regenerate icon on each section. Admin types a small instruction ("make CTA more urgent") → only that component regenerates in ~15s.
8. **Tool-call image selection + prompt caching** — component generator calls `select_image` tool instead of receiving all images inline (eliminates URL hallucination, reduces tokens). System prompt + stable identity context cached across all component calls in a page via Anthropic's 5-min prompt cache (~60% input cost reduction).

Done when: generation pipelines read from `project_identity` (not `step_*`). Page pipeline never generates wrapper/header/footer. Layouts tab generates site-wide layouts with live preview. Modal shows gradient + GBP picker + template-specific slots pre-filled from identity. Every component goes through critique. Per-component regenerate works. Token spend per homepage drops from ~145k to ~32k effective tokens.

## Context

**Relevant files (backend):**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — refactor to read from `project_identity`; remove wrapper/header/footer branches; add tool calling for image selection; add prompt caching
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (new) — reads from `project_identity.brand` + passed layout slot values
- `src/agents/service.llm-runner.ts` — already extended with `runWithTools()` in Plan A; this plan adds prompt caching support (`cachedSystemBlocks`, `cachedUserPrefix` params)
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` (new) — builds per-component context subsets from full identity; pure function, no LLM
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — update: gradient rules, strip wrapper rules, archetype directive
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (new)
- `src/agents/websiteAgents/builder/ComponentCritic.md` (new)

**Relevant files (frontend):**
- `frontend/src/components/Admin/CreatePageModal.tsx` — slots pre-filled from `project_identity`, add gradient picker, promote GBP picker
- `frontend/src/pages/admin/WebsiteDetail.tsx` — add Layouts tab UI; keep 3-step onboarding card from Plan A
- `frontend/src/components/Admin/GbpSearchPicker.tsx` (new, shared) — may already exist from Plan A (inside IdentityModal); extract to shared if so
- `frontend/src/components/Admin/ColorPicker.tsx` — reference for GradientPicker
- `frontend/src/components/Admin/DynamicSlotInputs.tsx` (new) — shared slot renderer for page modal + layouts tab
- `frontend/src/api/websites.ts` — add gradient, dynamic slot values, layout generation, regenerate component APIs

**Patterns to follow:**
- ColorPicker component pattern for gradient picker
- BullMQ processor pattern: `websiteGeneration.processor.ts`
- Polling hook pattern: reusable for both page live preview (exists) and layouts live preview
- Tool calling: `runWithTools()` from Plan A's llm-runner extensions

**Reference file:** `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (as refactored after Plan A) — closest analog for new layouts pipeline structure

## Constraints

**Must:**
- Project Identity (Plan A) must be executed before this plan — all generation reads from `project_identity`
- Page and layout pipelines derive a per-component context from identity (never pass the full identity JSON to a generation call)
- Use Anthropic prompt caching (`cache_control: {type: "ephemeral"}`) for the stable system prompt + identity context across all component calls in a single page generation
- Component generator uses `select_image` tool — images are requested by `use_case`, not inlined in the prompt. Eliminates URL hallucination.
- Critique pass uses `report_critique` tool for structured output
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
- Read from `step_*_scrape` columns in new code (read from `project_identity` instead)
- Pass the full `project_identity` JSON to component generation calls (derive per-component context)
- Generate layouts implicitly as a side effect of page generation — Layouts pipeline is explicitly triggered
- Break existing projects that already have wrappers (backfill `layouts_generated_at`)
- Require gradients — they're an enhancement, not a mandate
- Modify the shortcode syntax or introduce new shortcodes

**Out of scope:**
- Template editor UI for defining/editing slot schemas (admin sets them via API or migration; follow-up for UI)
- Individual layout component editors (admin regenerates the whole layout if changes are needed)
- Radial gradients, multiple gradient stops, gradient overlays
- Changing the color system architecture
- Project identity creation / warmup (handled by Plan A)
- Removing `step_*_scrape` columns (Phase 2 follow-up)

## Risk

**Level:** 3 (Structural Risk — introduces a new pipeline, refactors the page pipeline data source, and adds prompt caching + tool calling complexity)

**Risks identified:**
- Plan A must be executed first. If this plan runs on stale code (pre-identity), the generation pipelines break. → **Mitigation:** Hard sequencing — do not merge this plan's PRs until Plan A is live. T1 of this plan depends on T1 of Plan A.
- Page pipeline refuses to run without layouts. → **Mitigation:** Backfill `layouts_generated_at` for projects with existing non-empty wrappers. New projects go through Layouts tab first.
- Shortcodes mangled by Claude. Losing `{{slot}}` breaks every page. → **Mitigation:** Post-generation validation asserts required tokens exist. If `{{slot}}` missing from generated wrapper, reject and retry once; on second failure mark status `failed` and preserve previous good wrapper.
- Prompt caching TTL is 5 minutes. If page generation takes longer than 5 minutes, cache hits degrade. → **Mitigation:** Concurrency limit of 2 on `wb-page-generate` and the critique call immediately follows component generation — all calls stay within the window for any single page.
- Tool calling for `select_image` could loop if Claude keeps requesting images. → **Mitigation:** Cap tool calls per component at 3. After 3, force Claude to finalize without additional tool use.
- Gradient CSS injection conflicts with CDN Tailwind opacity. → **Mitigation:** Inject `background` via custom CSS classes in the wrapper `<style>`, not Tailwind gradient utilities.

**Blast radius:**
- `service.generation-pipeline.ts` — significant refactor (read from identity, per-component context, tool calling, caching, critique pass)
- `service.llm-runner.ts` — extended (prompt caching params)
- `CreatePageModal.tsx`, `WebsiteDetail.tsx` — modified (gradient picker, slot pre-fill from identity, Layouts tab)
- `worker.ts` — modified (new Layouts worker)
- New backend files: `service.layouts-pipeline.ts`, `LayoutGenerator.md`, `ComponentCritic.md`, `websiteLayouts.processor.ts`, `util.identity-context.ts`
- New frontend files: `DynamicSlotInputs.tsx`, `GradientPicker.tsx`, `GbpSearchPicker.tsx` (if not already extracted in Plan A)

**Pushback:**
- Full gradient picker (arbitrary stops, angles, radial) is overengineered. 2-color linear + 4 direction presets covers the use case.
- Giving each layout component its own editable version history is premature. Regeneration overwrites for now.
- Multi-turn agentic loops for component generation (Claude requests data, gets it, generates, etc.) would improve quality but kills live-preview latency. Keep single-turn per component with tool-call image selection as the only multi-step feature.

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
3. Add gradient columns to `website_builder.projects` (mirrored to `project_identity.brand`):
   - `gradient_enabled BOOLEAN DEFAULT FALSE`
   - `gradient_from VARCHAR(255) DEFAULT NULL`
   - `gradient_to VARCHAR(255) DEFAULT NULL`
   - `gradient_direction VARCHAR(20) DEFAULT 'to-br'`
4. Add layout generation tracking to `website_builder.projects`:
   - `layouts_generated_at TIMESTAMPTZ DEFAULT NULL`
   - `layouts_generation_progress JSONB DEFAULT NULL` (shape: `{total, completed, current_component}`)
   - `layouts_generation_status VARCHAR(20) DEFAULT NULL` ('queued' | 'generating' | 'ready' | 'failed' | 'cancelled')
   - `layout_slot_values JSONB DEFAULT NULL` (persisted slot inputs from last generation run)
5. Backfill: For existing projects with non-empty `wrapper`, set `layouts_generated_at = updated_at`.
6. Seed `template_pages.dynamic_slots` for dental SEO template pages by direct ID lookup with the slot JSONB defined in the spec.
7. Seed `templates.layout_slots` for the dental SEO template with the layout slot JSONB defined in the spec.

Note: warmup/archetype/extracted_slot_hints/logo_s3_url are NOT added here — they live in `project_identity` (introduced by Plan A).

**Files:**
- `src/database/migrations/{timestamp}_page_creation_enhancements.ts`
**Depends on:** Plan A T1 (project_identity column must exist)
**Verify:** `npm run db:migrate` clean. New columns + seeded slots present. Existing projects backfilled with `layouts_generated_at`.

### T2: Backend — Extend service.llm-runner.ts for prompt caching
**Do:**
1. Add parameters to `runAgent` (and `runWithTools` from Plan A T2):
   - `cachedSystem?: Array<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>` — allows splitting the system prompt into cached and variable blocks
   - `cachedUserPrefix?: string` — optional cached prefix prepended to the user message
2. Construct the Anthropic API call with the system blocks array when `cachedSystem` is provided (passes `cache_control: { type: 'ephemeral' }` on the appropriate blocks)
3. Log cache hit/miss metrics from the response (`cache_creation_input_tokens`, `cache_read_input_tokens`) so we can monitor savings
4. Keep the existing `systemPrompt: string` param for backward compatibility — when `cachedSystem` is omitted, behavior unchanged

**Files:**
- `src/agents/service.llm-runner.ts` (modify — add cached variants)
**Depends on:** Plan A T2
**Verify:** Call `runAgent` with `cachedSystem` twice within 5 minutes. Second call logs show `cache_read_input_tokens > 0`.

### T3: Backend — Per-component context builder + page pipeline refactor
**Do:**
1. Create `src/controllers/admin-websites/feature-utils/util.identity-context.ts`:
   - Exports `buildStableIdentityContext(identity): string` — returns the per-page cached context (business basics, brand colors + gradient, archetype + voice) as a formatted text block used in cached system for ALL component calls of a single page
   - Exports `buildComponentContext(identity, componentName, slotValues, imageManifest): ComponentContext` — returns the per-component variable payload (filtered content_essentials + filtered images + slot values + template markup + any component-specific directives)
   - Image filtering rules per component encoded here (see "For Very Good Outputs" recommendations — hero gets 2 high-res, gallery gets 6, etc.)
   - Image manifest contains ONLY `{ id, description, use_case, resolution }` — no URLs. URLs retrieved via the `select_image` tool call
2. Refactor `generatePageComponents` in `service.generation-pipeline.ts`:
   - Read `project_identity` from the project row (fall back to reading step_* for defensive compat, though backfill should cover this)
   - Remove the distillation step (identity is already distilled during warmup)
   - Remove wrapper/header/footer branches from `buildComponentList` — sections only
   - If project has no layouts (`layouts_generated_at IS NULL`), return `LAYOUTS_NOT_GENERATED` error
   - For each component:
     - Build cached stable context + variable component context
     - Call `runAgent` with `cachedSystem` (ComponentGenerator prompt + stable identity context) and user message (variable component context)
     - Handle `select_image` tool calls (see T13) — loop at most 3 times
     - Parse HTML from response
     - Write to page.sections JSONB
     - (Critique pass added in T12)
3. Update `ComponentGenerator.md` prompt:
   - Add gradient rules: use `bg-gradient-brand` for CTAs and hero backgrounds, `text-gradient-brand` for accent headings
   - Remove wrapper-specific rules (layouts own those now)
   - Add archetype directive: "This practice's archetype is {archetype}. Match the tone: {tone_descriptor}."
   - Describe the `select_image` tool and when to use it
4. Delete the old distillation user-message builder (`buildDataAnalysisMessage`) — no longer called

**Files:**
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` (new)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (significant refactor)
- `src/agents/websiteAgents/builder/ComponentGenerator.md` (modify)
**Depends on:** T1, T2, Plan A T3 (identity warmup must populate `project_identity`)
**Verify:** Page pipeline generates sections only. Never calls wrapper/header/footer. Reads from `project_identity`. Cached tokens appear in logs. Per-component context stays ~1-3kb.

### T4: Backend — API param extensions
**Do:**
1. Extend `startPipeline` handler to accept `gradient: { enabled, from, to, direction }` and `dynamicSlotValues: Record<string, string>` — both optional
2. Extend `createAllFromTemplate` handler similarly
3. Extend `ProjectScrapeJobData` + `PageGenerateJobData` types
4. Add `GET /templates/:templateId/pages/:pageId/slots` — returns `dynamic_slots` for a template page
5. Add `PATCH /templates/:templateId/pages/:pageId` — allow admin to update `dynamic_slots` (admin tool; no UI in this plan)

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts`
- `src/workers/processors/websiteGeneration.processor.ts`
- `src/routes/admin/websites.ts`
- `frontend/src/api/websites.ts`
- `frontend/src/api/templates.ts`
**Depends on:** T3
**Verify:** API accepts new params. `GET /slots` returns seeded slot definitions.

### T5: Frontend — GbpSearchPicker component
**Do:**
Extract the GBP search/pick UI from Plan A's IdentityModal into a reusable component (if Plan A already did this, this task becomes "verify and polish"):
- Shows current selection with name, address, rating
- Search input with debounced Places autocomplete
- Suggestion dropdown
- Selecting a suggestion calls `getPlaceDetails` and returns full GBP data
- "Clear" to reset

**Files:**
- `frontend/src/components/Admin/GbpSearchPicker.tsx` (new or polish)
**Depends on:** none (can start in parallel with backend)
**Verify:** Component renders; search + select flow works.

### T6: Frontend — GradientPicker component
**Do:**
Gradient picker with:
- "Use gradient" toggle
- When enabled: direction presets (→ ↘ ↓ ↗) as clickable icons
- Two color inputs (From, To) pre-filled from primary/accent
- Live preview strip rendering the gradient
- Emits `{ enabled, from, to, direction }`

**Files:**
- `frontend/src/components/Admin/GradientPicker.tsx` (new)
**Depends on:** none
**Verify:** Toggle works, colors + direction update preview.

### T7: Frontend — CreatePageModal enhancements (slot pre-fill from identity)
**Do:**
1. Replace "Advanced: Override Business Data" GBP section with `GbpSearchPicker` as a top-level field. Default selection comes from `project_identity.business.place_id`.
2. Add `GradientPicker` below Brand Colors. Default values from `project_identity.brand.gradient_*`.
3. When a template page is selected, fetch its `dynamic_slots` + call `GET /:id/slot-prefill?templatePageId=X` (see T11) to get pre-filled values from identity. Render slot inputs with initial values.
4. Each slot: label, description, type toggle (text/URL), textarea or URL input. All optional (empty skipped).
5. On submit: pass gradient, selected GBP, dynamic slot values to `startPipeline` call.
6. Same treatment for build-all modal in WebsiteDetail.tsx.

**Files:**
- `frontend/src/components/Admin/CreatePageModal.tsx` (modify)
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — build-all modal)
**Depends on:** T4, T5, T6, T11
**Verify:** Open modal → see GBP + gradient + slots pre-filled from identity. Dynamic slot inputs reflect template page selection.

### T8: Backend — Layouts Pipeline service + LayoutGenerator prompt
**Do:**
1. Create `src/agents/websiteAgents/builder/LayoutGenerator.md`:
   - System prompt with the Critical Rules from the spec (template as starting point, shortcodes byte-exact, wrapper/header/footer specific rules, color/gradient injection)
   - Component type passed in user message
2. Create `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts`:
   - Exports `generateLayouts(projectId, slotValues, signal?): Promise<void>`
   - Reads `project_identity` (requires warmup completed — returns `IDENTITY_NOT_READY` if not)
   - Reads active template's wrapper/header/footer markup + `layout_slots` definitions
   - If `logo_url` slot value differs from `project_identity.brand.logo_s3_url`: download → upload to S3 → update identity
   - Initializes `layouts_generation_progress` + sets `layouts_generation_status = 'generating'`
   - Persists `layout_slot_values` on the project row
   - For each component [wrapper, header, footer]:
     - Check cancel flag + abort signal
     - Build stable identity context (cached) + variable component context
     - Call `runAgent` with cached system (LayoutGenerator + stable context) and variable user message
     - **Shortcode validation**: assert tokens from the template exist in the output. If `{{slot}}` missing from wrapper, retry once with "the previous attempt removed {{slot}} — this is required". On second failure mark `'failed'` and preserve previous good layout.
     - Write to `project.wrapper/header/footer` immediately
     - Increment progress
   - On complete: `layouts_generated_at = now()`, status `'ready'`, clear progress
3. Also mirror generated `logo_s3_url` to `project_identity.brand.logo_s3_url` on update

**Files:**
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (new)
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (new)
**Depends on:** T1, T2, Plan A T3
**Verify:** Given a warmed-up project, function produces 3 Claude calls, writes wrapper/header/footer. All shortcodes preserved byte-exact. Retry kicks in if wrapper loses `{{slot}}`.

### T9: Backend — Layouts BullMQ processor + API endpoints
**Do:**
1. Create `src/workers/processors/websiteLayouts.processor.ts`:
   - `processLayoutGenerate(job)` wraps `generateLayouts()` with cancel polling + AbortController
2. Register `wb-layout-generate` worker in `worker.ts` (concurrency 1, lockDuration 600000)
3. Endpoints in `AdminWebsitesController.ts`:
   - `POST /:id/generate-layouts` — body: `{ slotValues }` → enqueues job
   - `GET /:id/layouts-status` — returns `{ status, progress, generated_at, wrapper, header, footer }`
4. Routes in `routes/admin/websites.ts`
5. Existing `cancelGeneration` endpoint handles layout jobs too (shared `generation_cancel_requested` flag)

**Files:**
- `src/workers/processors/websiteLayouts.processor.ts` (new)
- `src/workers/worker.ts` (modify)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/routes/admin/websites.ts` (modify)
**Depends on:** T8
**Verify:** POST enqueues, worker runs, polling reflects progress, cancel works.

### T10: Frontend — Layouts tab UI with live preview
**Do:**
1. Restructure the Layouts tab in `WebsiteDetail.tsx`:
   - **Empty state** (`layouts_generated_at IS NULL`): "Generate Layouts" panel with:
     - Intro explaining layouts
     - `layout_slots` rendered as inputs, pre-filled via `GET /:id/slot-prefill?layout=true` (T11)
     - "Generate Layouts" button
   - **Generating state** (`layouts_generation_status === 'generating'`): progress bar with current_component label; iframe rendering partial layout; cancel button; 2s polling
   - **Ready state**: preview + slot values that produced this generation (editable) + "Regenerate Layouts" button
2. Add API calls: `generateLayouts(projectId, slotValues)`, `fetchLayoutsStatus(projectId)`
3. Extract shared `<DynamicSlotInputs>` component used by page modal (T7) and Layouts tab (here)

**Files:**
- `frontend/src/pages/admin/WebsiteDetail.tsx` (modify — Layouts tab)
- `frontend/src/api/websites.ts` (modify)
- `frontend/src/components/Admin/DynamicSlotInputs.tsx` (new — shared slot renderer)
**Depends on:** T9, T11
**Verify:** Manual flow: open tab → pre-filled form → Generate → live preview → completion → Regenerate option.

### T11: Backend — Slot pre-fill mapper + endpoint
**Do:**
1. Create `src/controllers/admin-websites/feature-services/service.slot-prefill.ts`:
   - Exports `getPrefilledSlotValues(projectId, slotDefinitions): Record<string, string>`
   - Reads `project_identity` (not `extracted_slot_hints` — that was a Plan B design artifact that got consolidated into identity)
   - Deterministic mapping:
     - `certifications_credentials` ← `identity.content_essentials.certifications.join(", ")`
     - `unique_value_proposition` ← `identity.content_essentials.unique_value_proposition`
     - `gallery_source_url` ← find an image with `use_case: "gallery"` from `identity.extracted_assets.images` → return its `source_url`
     - `faq_focus_topics` ← `identity.content_essentials.review_themes.join(", ")`
     - `practice_founding_story` ← `identity.content_essentials.founding_story`
     - `practice_values` ← `identity.content_essentials.core_values.join(", ")`
     - `logo_url` (layout slot) ← `identity.brand.logo_s3_url` (already hosted — use S3 URL directly)
     - `social_links` (layout slot) ← format `identity.content_essentials.social_links` as one-per-line
     - `footer_service_areas` (layout slot) ← `identity.content_essentials.service_areas.join(", ")`
     - etc. for all other slot keys
2. Endpoints:
   - `GET /:id/slot-prefill?templatePageId=X` — page slots
   - `GET /:id/slot-prefill?layout=true` — layout slots
3. Frontend API `fetchSlotPrefill`

**Files:**
- `src/controllers/admin-websites/feature-services/service.slot-prefill.ts` (new)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/routes/admin/websites.ts` (modify)
- `frontend/src/api/websites.ts` (modify)
**Depends on:** T1, Plan A T3
**Verify:** Hit endpoint for a warmed-up project → returns slot values populated from identity.

### T12: Backend — Self-critique pass with report_critique tool + prompt caching
**Do:**
1. Create `src/agents/websiteAgents/builder/ComponentCritic.md`:
   - System prompt: check CTA clarity, benefit-driven headline, archetype tone match, shortcode preservation, obvious issues (broken markup, invented URLs, orphan elements)
   - Instructs to call the `report_critique` tool with structured output
2. Define `report_critique` tool schema: `{ pass: boolean, issues: string[], suggested_improvements: string }`
3. Modify `generatePageComponents` + `generateLayouts`:
   - After generating a component, call `runWithTools` with:
     - Cached system: `ComponentCritic.md` + archetype + business_name
     - Variable user message: the generated HTML
     - Tools: `[report_critique]`
   - Extract the tool call result
   - If `pass: false`, regenerate the component once, appending critique to the user message. If second attempt also fails, accept and log.
4. Component + critique calls share the 5-min cache window — critique runs immediately after each component

**Files:**
- `src/agents/websiteAgents/builder/ComponentCritic.md` (new)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — critique pass)
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (modify — critique pass for layouts)
- `src/agents/websiteAgents/builder/ComponentGenerator.md` (modify — note that critique may request regeneration)
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (modify — same)
**Depends on:** T3, T8, Plan A T2
**Verify:** Logs show critique tool call for each component. Regenerate fires when `pass: false`. Output quality measurably better.

### T13: Backend + Frontend — Image selection via `select_image` tool
**Do:**
1. Define `select_image` tool schema for the component generator:
   - Input: `{ use_case: string, required_resolution?: "high"|"mid"|"low", description_match?: string }`
   - Output: `{ image_url: string, description: string }` (or null if no match)
2. Backend tool handler in `service.generation-pipeline.ts`:
   - Given the current identity, filter images matching `use_case` (and optional filters)
   - Return the top match (highest `usability_rank`)
   - If no match, return null — generator proceeds with a placeholder div
3. Modify `generatePageComponents` to use `runWithTools` for component generation (replacing current `runAgent` call):
   - Tools: `[select_image]`
   - Max 3 tool calls per component
   - After each tool call, loop back to Claude with the tool result and let it finalize the HTML
4. Update `ComponentGenerator.md` prompt: describe the tool, give examples of good `use_case` values ("hero", "about-doctor", "team-group", "office-interior", "before-after"), forbid inventing image URLs

**Files:**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — tool calling loop)
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` (modify — tool calling loop for logo selection in header)
- `src/agents/websiteAgents/builder/ComponentGenerator.md` (modify)
- `src/agents/websiteAgents/builder/LayoutGenerator.md` (modify)
**Depends on:** T3, T8, Plan A T2 (`runWithTools`)
**Verify:** Generate a hero section — logs show `select_image` tool called with `use_case: "hero"`, generator uses the returned S3 URL. No invented image URLs in output.

### T14: Per-component regenerate (backend + frontend)
**Do:**
1. **Backend:**
   - Endpoint `POST /:id/pages/:pageId/regenerate-component` — body: `{ componentName, instruction? }`
   - Enqueue `wb-page-generate` with `singleComponent: componentName` flag
   - Processor: regenerates only that one component (generator + critique), writes only that section into `sections` JSONB (match by name/index)
   - Goes through full tool-calling + caching pipeline
2. **Frontend (PageEditor.tsx):**
   - In `ready` state, render a small regenerate icon overlay on each section in the iframe (via existing iframe selector hook)
   - Click → modal with "What should change?" textarea + Regenerate button
   - On submit → POST → brief live-preview mode for that single component → animate swap when ready
   - Polling pattern reused from existing live preview, scoped to one section

**Files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (modify — accept singleComponent)
- `src/workers/processors/websiteGeneration.processor.ts` (modify)
- `src/routes/admin/websites.ts` (modify)
- `frontend/src/pages/admin/PageEditor.tsx` (modify)
- `frontend/src/api/websites.ts` (modify)
**Depends on:** T12, T13
**Verify:** Hover section → click regenerate → type instruction → section regenerates in ~15s with animation. Other sections untouched.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend)
- [ ] `cd frontend && npx tsc --noEmit` — zero errors (frontend)
- [ ] **Foundation alignment**
  - [ ] All generation pipelines read from `project_identity` (not `step_*`)
  - [ ] Per-component context derived from identity (full identity never passed to component call)
  - [ ] Prompt caching active — cache hit tokens visible in logs for pages with 2+ component calls
- [ ] **Pipeline architecture**
  - [ ] Page pipeline generates sections only — never calls Claude for wrapper/header/footer
  - [ ] Page generation refuses with `LAYOUTS_NOT_GENERATED` error if project has no layouts
  - [ ] Page generation refuses with `IDENTITY_NOT_READY` error if warmup hasn't completed
- [ ] **Layouts pipeline**
  - [ ] Layouts tab shows Generate form when empty, pre-filled from identity
  - [ ] Generate triggers BullMQ job, live preview renders components as they land
  - [ ] Logo used in header comes from `identity.brand.logo_s3_url`
  - [ ] All shortcodes preserved byte-exact (validated post-generation)
  - [ ] Cancel stops layout generation
- [ ] **Tool calling**
  - [ ] Component generator uses `select_image` tool — no inline image URLs in prompts
  - [ ] Zero invented image URLs in generated output
  - [ ] Critique pass uses `report_critique` tool for structured output
- [ ] **Self-critique**
  - [ ] Each generated component runs through critique
  - [ ] Failed critique triggers regenerate-once with critique attached
  - [ ] Critique + component stay within cache window (5 min)
- [ ] **Per-component regenerate**
  - [ ] Editor shows regenerate icons on each section
  - [ ] Single component regenerates in ~15s with animation
- [ ] **Page modal enhancements**
  - [ ] Gradient picker renders with direction presets + color inputs
  - [ ] Gradient CSS classes injected in wrapper `<style>`
  - [ ] GBP picker is top-level in both modals
  - [ ] Dynamic slots render per template page, pre-filled from identity
  - [ ] Empty slots skipped (no prompt noise)
- [ ] **Token efficiency**
  - [ ] Homepage generation: ~32k effective tokens (75%+ reduction from baseline)
  - [ ] Build-all (8 pages): cache stays hot across pages — cumulative savings
- [ ] **Backward compat**
  - [ ] Existing projects with wrappers are backfilled (`layouts_generated_at` set)
  - [ ] Projects without `project_identity` return a clear "identity required" error; don't silently break
  - [ ] No regressions in page editor, page list, template system
