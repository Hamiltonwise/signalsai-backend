# Alloro App Changelog

All notable changes to Alloro App are documented here.

## [0.0.25] - April 2026

### Website Builder — Page Editor Preview & Regenerate Fixes

Follow-up bug sweep after the progressive-preview + shortcode-marker work.
Surfaces three issues hit during real use on the ARCS and One Endodontics
projects and lands guardrails so the same silent failures can't repeat.

**Progressive preview stayed stuck on "Loading preview…":**
The `initialSrcDoc` memo in `ProgressivePagePreview.tsx` used a ref guard
that made every render after the first return `null`, which re-triggered
the loading state even once valid data had arrived. Moved the built
srcDoc into component state so it persists across renders.

**Regenerating a section wiped its body down to just the shortcode:**
`enforceShortcodeMarkers` in the post-generation HTML normalizer would
strip every non-heading/paragraph direct child of any element carrying
the `<!-- ALLORO_SHORTCODE: doctors -->` marker. Section templates
(Meet Our Team, Testimonials) place the marker at the `<section>` level
while the shortcode lives two divs deep, so the wrapper div holding the
credentials, CTA, and everything else got nuked. Normalizer now only
enforces when the shortcode token is a **direct** text child of the
marker's element — wider-scope markers are treated as documentation.

**Regenerate silently no-op'd on legacy pages:**
Pages whose `template_page_id` is null (common for projects whose v0
kept the link but later revisions dropped it) would hit
`buildComponentList(null) → []` and the worker marked the page "ready"
without doing anything. The editor saw a 200 with no toast and no
content change. Pipeline now fails loudly with `NO_TEMPLATE_PAGE` when
a single-component regen lands on an unlinked page. Broader backfill
script walks any sibling version (not just `published`) to inherit the
link — fixed 69 homepage versions for the One Endodontics project.

**Shortcode-only sections now render + overlay correctly in preview:**
Sections whose content is just `{{ post_block … }}` used to render as
raw text in the iframe, and because `tagSectionRoot` couldn't find a
root HTML element they never received the `data-alloro-section` marker
either — meaning the "Rebuilding section…" pulse + pill skipped them
during regenerate. `renderPage()` now swaps shortcode tokens for a
styled gray-bg placeholder div, which becomes the section's root and
receives both the section marker and the regenerate overlay.

**Commits:**
- `frontend/src/components/Admin/ProgressivePagePreview.tsx` — srcDoc
  held in state, not `useMemo` with a one-shot ref gate.
- `frontend/src/utils/templateRenderer.ts` —
  `renderShortcodePlaceholders` swaps `{{ post_block … }}`, `{{ review_block … }}`,
  `{{ menu … }}`, and `[post_block …]` / `[review_block …]` tokens
  with a centered placeholder before `tagSectionRoot` runs.
- `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts`
  — `enforceShortcodeMarkers` checks for a **direct** shortcode text
  child before stripping siblings; skips when the marker is at a wider
  scope.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
  — guard marks the page failed with `NO_TEMPLATE_PAGE` instead of
  silently flipping to ready on single-component regen against an
  unlinked page.
- `scripts/debug-warmup/fix-draft-template-link.ts` — backfill now
  inherits `template_page_id` from any sibling version at the same
  project+path, not just published.
- `scripts/debug-warmup/diagnose-one-endo.ts`,
  `scripts/debug-warmup/fix-one-endo-homepage.ts` — one-shot diagnostics
  and targeted link for the One Endodontics homepage lineage.

## [0.0.24] - April 2026

### Website Builder — Agent Accuracy, Progressive Section Reveal, Shortcode Markers, Slot LLM-Fill

Quality and UX pass landing three plan folders —
`04202026-no-ticket-agent-accuracy-fixes`,
`04202026-no-ticket-progressive-section-reveal`,
`04202026-no-ticket-template-shortcode-audit` — plus a Create Page modal
feature for on-demand LLM slot fill and a doctor-credentials fallback on
the deterministic prefill. Driven by the Coastal homepage audit: button
shape drift, fabricated doctor/service/review sections, missing shortcode
coverage, inline styles, and a build experience that scrolled the viewport
on every section completion.

**Agent accuracy — prompts + normalizer + whole-page critic:**
- **`ComponentGenerator.md` tightened** — four new contract sections:
  - **Button System (MANDATORY)** — two allowed shapes (`rounded-full` pill
    or `rounded-lg` rectangle), two variants each. Pick ONE shape per page
    and apply everywhere. Badges are `<span>`, never `<a>`.
  - **Thin/empty slot preservation** — if a template section is a thin
    wrapper with just a heading + shortcode slot / marker comment / empty
    body, customize heading/subheading only and preserve the slot verbatim.
    No more invented cards to fill empty regions.
  - **Shortcode emission fallback** — if a section is clearly about
    doctors / services / reviews but no shortcode token is present, emit
    the canonical token (`[post_block type="doctors"]` etc.) as the only
    body content. Never fill these slots with hand-written HTML.
  - **Alt-text grounding** — use the image manifest's `description` field
    verbatim for `alt` attributes. No more fabricated "Reception Desk" /
    "Treatment Bay" alts.
- **`ComponentCritic.md`** — three new checks: #10 no inline styles (fail
  `INLINE_STYLE_USED`), #11 button shape consistency within a section
  (fail `BUTTON_SHAPE_DRIFT`), #12 badge-as-anchor (fail `BADGE_AS_ANCHOR`).
- **New `util.html-normalizer.ts`** — deterministic cheerio pass between
  generator and critic: strips LLM-emitted `style="..."` attributes
  (whitelisting `<section style="background: var(...)">`), converts
  credential-pill `<a>` elements to `<span>`, normalizes mixed button
  radii to the dominant shape, and enforces `ALLORO_SHORTCODE` markers
  (strips fabricated children, injects canonical shortcode token). Wired
  in `service.generation-pipeline.ts` before each per-component critic
  call so the critic evaluates normalized output.
- **New `WholePageCritic.md` + `runWholePageCritique()`** — single LLM
  pass over the concatenated page after all components complete. Checks
  cross-section button uniformity, border-weight drift on secondary
  buttons, shortcode coverage for expected content types, no inline
  styles anywhere, no duplicate primary CTAs. Soft gate: logs issues, does
  not block publish.

**Progressive section reveal — Page Editor build experience:**
- **New `GET /:id/pages/:pageId/progressive-state`** endpoint and
  `getPageProgressiveState()` service — returns the template section
  scaffolding (name + template markup) plus whichever sections have been
  generated so far. Polling-ready; mirrors the existing page-status shape.
- **New `ProgressivePagePreview.tsx`** — single sandboxed iframe that
  renders every template section from tick zero. Pending sections show
  their template markup dimmed with a centered "Building {section}…"
  pill; completed sections swap in with a CSS fade-in, in place.
  **Viewport stays put** — no scroll-to-top on section completion. Sticky
  progress bar at the top of the preview keeps "section-gallery (9/11)"
  visible without overlaying content.
- **`PageEditor.tsx` wired** — when `isLivePreview` is true, the old
  single-iframe-plus-overlay-card is replaced by `ProgressivePagePreview`.
  When generation completes, the existing preview takes over as before.

**Template shortcode markers — 6 sections annotated:**
- **`ALLORO_SHORTCODE` convention documented** at top of
  `shortcodeResolver.service.ts` with the full type vocabulary (doctors,
  services, reviews, posts, menus, locations). The resolver itself never
  reads the marker — it's advisory metadata for the ComponentGenerator +
  normalizer.
- **New `scripts/debug-warmup/audit-template-shortcodes.ts`** — scans
  every `templates` + `template_pages` row, reports regions that look
  like they should be owned by a shortcode but aren't marked. Heuristic
  based on heading keywords + structural thinness; output is reviewable,
  never auto-applies.
- **New `scripts/debug-warmup/apply-template-markers.ts`** — one-off
  write script for the 5 accepted candidates. Dry-run by default,
  `--apply` writes. Idempotent — re-run is a no-op.
- **6 sections marked in the DB** across both active templates:
  - Alloro Dental (2d325d15): `section-meet-our-team` → doctors,
    `section-testimonials` → reviews, `section-location-services` → services
  - Alloro SaaS (4c8da173): `section-google-reviews` → reviews,
    `section-testimonials` → reviews, `section-testimonials-grid` → reviews

**Create Page modal — on-demand LLM slot fill + smarter prefill:**
- **"Rewrite all from identity" button** in the Create Page modal's
  Section Content header. Single click triggers one Sonnet call over all
  text-type slots using the full identity context (voice, locations,
  doctors, services), replies with concrete text for every slot, and
  populates the form inline so the admin can review/edit before
  Continue. URL slots skipped. Replaces the older "Generate all empty"
  sentinel-flip button — admin now sees materialized text, not a "you'll
  see it after the page is built" surprise.
- **New `service.slot-generator.ts`** — reuses
  `buildStableIdentityContext()` so multi-location rules + doctor roster
  + service blurbs all land in the prompt. Response values are key-allow-
  listed against the template_page's slot definitions so the LLM can't
  inject extra keys. Returns 409 when identity isn't ready, 400 on
  missing `templatePageId`.
- **New `POST /:id/slot-generate`** endpoint and
  `generateSlotValues()` controller handler + `generateSlotValues` API
  client in `frontend/src/api/websites.ts`.
- **Deterministic prefill gains a fallback** —
  `certifications_credentials` now falls back to a deduped union of
  `doctors[].credentials` when `content_essentials.certifications` is
  empty. For Coastal, the previously-empty "Certifications & Credentials"
  slot now auto-fills with DDS / Diplomate ABE / Board Certified
  Endodontist / etc. Helper `uniqueDoctorCredentials()` (case-insensitive
  dedup, skips stale doctors).

**Coastal homepage audit findings (concrete):** button shapes mixed
`rounded-full` with `rounded-lg` in the Specialists section, the whole
Specialists block was hand-rolled with no `alloro-tpl-v1-release-*` class
namespace, doctor roster never rendered (comment stub, no shortcode
emitted), services section was heading-only, footer columns empty, alt
text invented. All six root causes are addressed by the prompt contract
changes + normalizer + shortcode markers above.

**Commits:**
- `feat(website-builder): agent accuracy + progressive reveal + shortcode markers`

## [0.0.23] - April 2026

### Website Builder — Identity Rebuild, Warmup Quality, Multi-Location + Doctor Enrichment

A multi-plan arc hardening the website-builder identity pipeline end to end.
Three plan folders landed together in one shippable slice —
`04192026-no-ticket-warmup-quality-fixes`,
`04192026-no-ticket-warmup-autodiscover-and-distill-tuning`,
`04202026-no-ticket-identity-modal-cleanup-and-crud` — plus post-audit
refinements around multi-location rendering, doctor / service prompt
enrichment, and content-hash image dedup.

**Warmup — Quality Fixes:**
- **Prefill 400 across 5 callers** — `claude-sonnet-4-6` silently dropped
  assistant-prefill support. `classifyArchetype`, `distillContent`, image
  vision analysis, and two other callers were failing with 400 and falling
  back to defaults. Removed `prefill: "{"` everywhere; added a strip+warn
  guardrail in `runAgent` so future callers can't re-break it.
- **URL normalization** — GBP-returned `http://example.com/` was getting
  blocked by Chromium. Added `normalizeScrapeUrl()` with fallback-once
  retry (http → https + www).
- **Clean-before-cap** — `MAX_SOURCE_CHARS` was applied to raw HTML before
  cleaning, leaving ~3-5k of usable text out of 50k scaffolding. Swapped
  to clean first, then cap. Raised cap to 100k. Distillation slice bumped
  8k → 15k.
- **Browser scrape lazy-image capture** — 5s flat wait missed
  IntersectionObserver loaders. Added `autoScroll` helper, absolutize
  relative URLs, bumped timeout to 25s.

**Warmup — Auto-Discover + Distillation Tuning:**
- **Auto-discover sub-pages** — homepage scrape emits a `discovered_pages`
  list (doctor pages, contact, practice pages); distillation uses them to
  populate per-doctor credentials and per-service blurbs not visible from
  the homepage alone.
- **Distillation prompt tightened** — `IdentityDistiller.md` stops emitting
  empty `certifications[]` when nothing was found, and populates
  `doctors[i].credentials[]` per-doctor rather than a single catch-all list.

**Identity Modal — Rebuild:**
- **Monaco JSON editor** replaces the raw textarea on the JSON tab.
  Lazy-loaded via `React.lazy` + `Suspense`. Validation-gated save.
- **Slice PATCH endpoint** — `PATCH /:id/identity/slice` with Zod validators
  per slice and a 13-path allow-list (`content_essentials.*`, `locations`,
  `brand`, `voice_and_tone`). `brand` and `voice_and_tone` remain
  permissive-shaped.
- **Doctors / Services CRUD with merge semantics** — add + per-row edit
  with placeholder = current value, empty = no change, null = clear.
  Stamps `last_synced_at` on every edit.
- **Slide-up source editor** — bottom sheet panel matching the
  LeadgenSubmissionDetail pattern (70vh, rounded-t-2xl). Wired to the
  Doctors + Services tabs so admins can edit the raw source behind any row
  inline.
- **New Images tab** — renders `extracted_assets.images[]` with
  description, use_case, and S3 URL. Logo thumbnail surfaced.
- **Re-run warmup "Keep sources" dialog** — three-button replacement for
  the native `confirm()`: Keep / Replace / Cancel. Prevents accidental
  destruction of manually-edited identity data.
- **Chat Update tab removed (wire-rip)** — deleted
  `service.identity-proposer.ts`, `IdentityProposer.md`, both handlers,
  routes, imports, and all frontend plumbing.

**Media Backfill:**
- **New migration `20260420000001_add_unique_project_s3url_to_media.ts`** —
  unique partial index on `(project_id, s3_url) WHERE s3_url IS NOT NULL`
  so repeat warmups + backfill are idempotent via ON CONFLICT DO NOTHING.
- **New migration `20260420000002_backfill_media_from_identity_images.ts`** —
  streams projects, inserts `website_builder.media` rows from each
  project's `project_identity.extracted_assets.images[]`, `.onConflict`
  ignored.
- **`util.image-processor.ts`** — warmup image pipeline now mirrors every
  analyzed image into the `media` table as a fire-and-forget insert so the
  Media Browser picks up warmup-captured photos. Insert failure is
  non-fatal and logged.

**Layouts Tab — Modal Extraction:**
- **New `LayoutInputsModal.tsx`** — mirrors the IdentityModal shell (fixed
  inset, max-w-3xl, 75vh body). Houses slot inputs + generate / regenerate
  / cancel. The Layouts tab now shows a compact summary card + single
  button to open the modal, letting "Edit Layouts Directly" sit right
  under without a wall of inputs pushing it off-screen.

**Prompt Enrichment — Multi-Location, Doctors, Services:**
- **Multi-location** — `util.identity-context.ts` emits a
  `## LOCATIONS (N total)` block in stable context whenever >1 active
  location exists, listing each as `Name — City, ST (primary)`. Footer
  components also get a full list with phone per row. About / story /
  values components get a plural-framing nudge. Hero / upgrade / wrapper
  components get city-list context with CTA guidance. Prompts explicitly
  forbid hyperlinks to `/location/<slug>` until the public route lands
  (deferred follow-up).
- **Doctor roster** — stable context emits credentials verbatim
  (`— DDS, Diplomate ABE, Board Certified`) with the short blurb indented.
  Component-specific block for doctor / team / meet / staff / provider
  components includes the full roster + guidance to match photos by
  description ("name embroidered on scrubs").
- **Service blurbs** — stable context + service / treatment / procedure
  component blocks include `services[].short_blurb` with an
  anti-hallucination guardrail ("don't invent services not listed").

**Image Dedup:**
- **Content-hash dedup in `util.image-processor.ts`** — SHA-1 of the
  downloaded buffer; byte-identical images served from CDN + origin
  (WordPress' `tdosites.com` vs `www.*.com` pattern) upload + analyze
  once. Logs dedup count. Prior warmups still have dupes in
  `extracted_assets.images[]`; re-run warmup to clear.

**One-off Ops (Coastal project):**
- **Template assignment** — project was created without the confirm flow
  so `template_id` was NULL and the Layouts tab had nothing to render.
  Assigned Alloro Dental Template via
  `scripts/debug-warmup/assign-coastal-template.ts`.
- **Media backfill** — 58 identity images backfilled into
  `website_builder.media` via
  `scripts/debug-warmup/backfill-coastal-media.ts` (idempotent per-row
  existence check, works without the unique index migration applied).

**Debug Scripts:**
- New `scripts/debug-warmup/` with: `inspect-identity`, `inspect-images`,
  `inspect-template`, `list-templates`, `e2e-pipeline`,
  `repro-distill-prod`, `test-url-normalize`, `test-autodiscover`,
  `check-cost-events`, `find-project`, `backfill-coastal-media`,
  `assign-coastal-template`.

**Commits:**
- `feat(website-builder): identity rebuild + warmup quality + prompt enrichment`

## [0.0.22] - April 2026

### Leadgen Audit Retry — Public Endpoint, Admin Rerun, 3-Retry Cap

Adds a self-service retry path for failed leadgen audits (public endpoint
hit by the FAB "Try again" button on the leadgen tool) and an admin
rerun override in the Leadgen Submissions detail drawer. Both reuse the
SAME `audit_id`, preserving session → audit continuity in the admin
timeline — no more orphaned failed rows with brand-new retry rows alongside.

**Key Changes:**
- **New migration `20260418000000_add_retry_count_to_audit_processes.ts`** —
  adds `retry_count INTEGER NOT NULL DEFAULT 0` to `audit_processes`. The
  column is read as part of a row-scoped UPDATE; no index needed.
- **New shared service `service.audit-retry.ts`** with
  `retryAuditById(auditId, options)`. A single atomic UPDATE
  (`WHERE id=:id AND status='failed' AND retry_count < 3`) resets the row
  and increments the counter in one shot, so two concurrent retries
  cannot both slip past the cap. Never throws to the caller. Admin
  callers pass `{skipLimit:true, countsTowardLimit:false}` to bypass the
  cap without touching the user's retry budget.
- **New public endpoint `POST /api/audit/:auditId/retry`**, gated by the
  existing `X-Leadgen-Key` shared secret (non-silent 401 variant — this
  is fetch, not beacon). Returns 200 `{ok:true, audit_id, retry_count}`
  on success, 404 when the audit is missing, 409 when not in failed
  state, and **429** `{error:"limit_exceeded", retry_count, max_retries}`
  on the 4th attempt. Re-enqueues the same BullMQ job shape as the
  original kickoff in `auditWorkflowService.ts`.
- **New admin endpoint `POST /api/admin/leadgen-submissions/:id/rerun`** —
  JWT + super-admin gated. Resolves the submission's `audit_id`, calls
  the shared service with the admin bypass flags. Logs the admin email +
  user id on every rerun for auditability.
- **Admin detail drawer gains a "Rerun" button** (only visible when
  `audit.status === 'failed'`). Click → confirm modal → hits the admin
  endpoint → optimistically flips local status to "pending" so the UI
  reflects the change before the next live-poll tick. Inline notice
  banner surfaces success ("Rerun queued") or error messages.
- **`retry_count` surfaced in the AuditPayloadBar** — `Retries: N/3`
  badge next to the status pill so admins can see how many times the
  user already tried before escalating.
- **Frontend types updated** — `AuditProcess.retry_count: number` added
  and `audit_retried` added to the `LeadgenCtaEvent` union (enriches
  timelines without advancing `final_stage`).
- Request handler added to `audit.ts` wraps ONLY the new `/retry` route
  with the tracking-key gate so the existing `/start`, `/:auditId`,
  `/:auditId/status`, and `PATCH /:auditId` routes remain unchanged.

**Commits:**
- `feat(leadgen): audit retry endpoint + admin rerun + 3-retry cap`

## [0.0.21] - April 2026

### Identity Enrichments + Multi-Location + Post Imports

Closes the gap between "what we know about the practice" and "content we
publish about them." Identity now captures hours, doctors, services, and
multiple locations. Posts tab imports from identity in one click (fetch
pages, download images to S3, create draft rows). Also lands the
canonical `/contact` CTA rule and a simplified 3-step setup checklist on
the website detail page.

**Key Changes:**
- **Multi-location support** — `identity.locations[]` top-level array
  populated by scraping every `project.selected_place_ids[]` entry
  (concurrency 3). `identity.business` stays as a pointer to the
  designated primary (`project.primary_place_id`) so every existing
  consumer keeps working unchanged. Scrape failures on individual
  locations write `warmup_status: "failed"` + `stale: true` entries
  instead of tanking the whole warmup.
- **Locations tab in Identity modal** — list view with primary badge,
  address/phone/hours, per-row re-sync, set-as-primary, and remove
  actions. Add Location opens a modal that reuses the existing
  `GbpSearchPicker`. Primary removal is blocked; set-as-primary warns
  that affected pages should be regenerated.
- **Doctor + service lightweight lists** — extracted during the
  existing warmup distillation pass. `{name, source_url,
  short_blurb, last_synced_at, stale?}` only, no images, no full
  content. Capped at 100 entries per list; 400-char blurbs;
  `source_url` must match a real discovered page.
- **Doctors / Services tabs** — same list view with per-row
  timestamps, stale badges, and a Re-sync button that re-runs
  extraction against cached `discovered_pages` without re-scraping.
- **Hours rendered in Summary** — normalizes three GBP shapes
  (array-of-strings, `weekdayDescriptions[]`, `periods[]` object)
  into a Mon–Sun table. "Not provided" row when missing.
- **Import from Identity** — new toolbar button on Posts tab for
  `doctor`, `service`, and `location` post types. Modal shows
  checkbox-selectable entries; already-imported rows flip to
  "Overwrite" toggles. Import fires a `wb-post-import` BullMQ job:
  doctors/services run the existing URL-scrape strategy stack
  (fetch → browser → screenshot), extract main content, download
  the first meaningful image to S3, insert a post row.
  Locations build content from structured GBP data without
  scraping. Partial unique index on
  `(project_id, post_type_id, source_url)` enforces dedup.
- **Canonical `/contact` CTA rule** — prompt rule in
  `ComponentGenerator.md` + `LayoutGenerator.md` plus a new
  `checkCtaPaths` validator that flags CTA-shaped elements pointing
  outside `/contact`, `tel:`, `mailto:`, or matching same-page
  anchors. Absolute URLs pass through for external booking portals.
- **Simpler 3-step setup UI** — replaced the onboarding-wizard style
  card rows on `WebsiteDetail` with a compact admin checklist
  (checkbox · title · inline action link). Locked rows dim; running
  shows a small spinner; completed shows a green check.

**Commits:**
- `src/database/migrations/20260418000002_add_multi_location_to_projects.ts` —
  adds `selected_place_ids TEXT[]` + `primary_place_id TEXT` on
  `website_builder.projects`; backfills from the existing
  `selected_place_id`.
- `src/database/migrations/20260418000003_add_source_url_to_posts.ts` —
  adds `posts.source_url TEXT` + partial unique index for import
  dedup.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` —
  `buildLocationsArray` + `runWithConcurrency` helpers; primary
  reuses its already-fetched GBP data, additional place_ids run
  through `scrapeGbp` with concurrency 3; distillation now emits
  `doctors[]`/`services[]` with URL allow-listing against
  `discovered_pages`.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` —
  `ProjectIdentity.locations[]`, `content_essentials.doctors[]`,
  `content_essentials.services[]`. `buildStableIdentityContext`
  lists doctor/service names under CONTENT ESSENTIALS; does NOT
  iterate locations (prompts still read `business`).
- `src/controllers/admin-websites/AdminWebsitesController.ts` —
  6 new handlers: `resyncIdentityList`, `addProjectLocation`,
  `setPrimaryLocation`, `removeProjectLocation`,
  `resyncProjectLocation`, `startPostImport`, `getPostImportStatus`.
- `src/controllers/admin-websites/feature-services/service.post-importer.ts` —
  `importFromIdentity(projectId, {postType, entries, overwrite})`
  branches on `location` vs doctor/service; reuses existing
  `scrapeUrl` fallback strategy, `uploadToS3`, and `buildMediaS3Key`.
  15 MB image cap with `content-type: image/*` guard.
- `src/workers/processors/postImporter.processor.ts` +
  `src/workers/worker.ts` — `wb-post-import` BullMQ worker;
  concurrency 1, 10-min lock; progress via
  `job.updateProgress({total, completed, results[]})`.
- `src/agents/websiteAgents/builder/IdentityDistiller.md` — extended
  output schema + hard rules for the new doctor/service lists.
- `src/agents/websiteAgents/builder/{ComponentGenerator,LayoutGenerator}.md` —
  CTA canonical-path rule.
- `src/utils/website-utils/htmlValidator.ts` — `checkCtaPaths`
  function; flags off-pattern CTAs with per-offender detail.
- `frontend/src/components/Admin/IdentityModal.tsx` — three new
  tabs (Doctors, Services, Locations); hours rendering; pulls in
  `AddLocationModal` + `useConfirm` for primary-switch and removal.
- `frontend/src/components/Admin/AddLocationModal.tsx` — thin
  wrapper around `GbpSearchPicker` for the Locations tab Add flow.
- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` —
  checkbox list, "Already imported → Overwrite" rows, live progress
  polling against the BullMQ job, per-row results with Retry.
- `frontend/src/components/Admin/PostsTab.tsx` — "Import from
  Identity" toolbar button on doctor/service/location post types.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — simplified setup
  checklist; earlier placeId-required, wizard, and Preview/Stop/
  Delete actions from 0.0.20 remain in place.
- `frontend/src/api/websites.ts` + `posts.ts` —
  `resyncProjectIdentityList`, `addProjectLocation`,
  `setPrimaryLocation`, `removeProjectLocation`,
  `resyncProjectLocation`, `startPostImport`,
  `fetchPostImportStatus`, and the corresponding types.

## [0.0.20] - April 2026

### Website Builder — Costs Tab, Quality Hardening, Skip Fix, Rebuild UX

Rolls up two coherent improvement bundles for the AI website builder:
(a) a **Costs tab** per project that logs every Anthropic call with
model, tokens, and frozen USD estimate; (b) a quality/UX pass that fixes
the broken "Skip section" behavior, stops em-dash tells, forces serif
headings globally, tightens template structural fidelity, adds mandatory
contrast pairings, and finally gives the per-section rebuild a real
pulsing overlay + toast. Also folds in the page-creation wizard refactor,
URL scrape-blocked detection, and the per-page Preview/Stop/Delete
actions that shipped earlier in the same thread.

**Key Changes:**
- **Costs tab** — new `website_builder.ai_cost_events` table (frozen
  `estimated_cost_usd` at write time, nested tool-call roll-ups via
  `parent_event_id`). Cost capture is fire-and-forget: the pipeline
  never fails because a cost row failed to write. Wired into nine
  Anthropic call sites: warmup, page-generate, section-regenerate,
  layouts-build, identity-propose, seo-generation, editor-chat,
  ai-command, minds-chat, plus the `critic` pass and nested
  `select-image` tool turns.
- **Costs UI** — header shows total USD + per-bucket token breakdown
  (input / output / cache write / cache read). Event list with
  expandable metadata JSON. Auto-refreshes when any generation
  transitions from active to idle.
- **Skip slot actually skips** — `__skip__` used to be advisory; the
  AI regularly ignored it. Now: `stripSkippedSlotGroups()` pre-strips
  tied subtrees via a `SLOT_TO_SECTION_KEYWORDS` map (cheerio-based,
  `data-slot-group` annotations win when present). If every slot in
  a component is skipped, the pipeline short-circuits and saves an
  LLM call. The critic also hard-rejects `SKIPPED_SLOT_LEAKED`.
- **Em-dash ban** — `ComponentGenerator`, `LayoutGenerator`, and
  `ComponentCritic` prompts all forbid em-dashes and en-dashes.
  `htmlValidator.checkProseStyle` scans visible text (not shortcodes)
  and flags every `—` / `–`.
- **Serif headings** — wrapper `<style>` injection forces `h1`–`h6`
  to a serif stack globally. Component prompt tells the generator
  not to add `font-sans` to headings.
- **Structural fidelity** — critic rejects output that changes the
  number of top-level children under the root `<section>` by more
  than one. Validator flags outputs with more than one `<section>`.
- **Contrast pairing** — explicit allow-list in the prompts. Validator
  flags `text-white` on light backgrounds and `text-gray-7/8/900` on
  dark backgrounds per class attribute.
- **Section rebuild UX** — `PageEditor` tracks
  `regeneratingSectionNames` and injects `opacity-50 animate-pulse
  pointer-events-none` + a "Rebuilding section…" overlay into the
  iframe `srcDoc` for the target section. On content change detected
  by the existing live-preview poll: overlay clears, toast fires via
  existing `showSuccessToast`, section scrolls into view.
- **Per-page actions during generation** — in the Pages list, a row
  in `generating` state now shows Preview / Stop / Delete buttons.
  Preview opens the editor where sections stream in live; Stop
  cancels the project's generation; Delete removes the page entirely.
- **Page creation wizard** — template mode is now a 3-step wizard
  (Page → Style → Content) with progress indicator, Back/Continue
  footer, and the new `TemplatePageSelect` searchable combobox
  replacing the scrolling button list.
- **Slot UX enhancements** — each slot gets per-row **Generate** and
  **Skip** action buttons. URL-type slots get a **Test** button that
  probes for WAF / Cloudflare / anti-bot blocks and reports a clear
  verdict before generation spends cycles.
- **`placeId` requirement relaxed** — pipeline only requires `placeId`
  when the project has no cached `project_identity` or `step_gbp_scrape`.
  Existing projects with warmup data no longer error on page create.

**Commits:**
- `src/database/migrations/20260418000001_create_ai_cost_events.ts` —
  new per-LLM-call table with project FK, vendor, model, token
  breakdown, frozen USD, optional `metadata` JSONB, and
  `parent_event_id` self-reference.
- `src/services/ai-cost/service.ai-cost.ts` +
  `src/services/ai-cost/pricing.ts` — hardcoded Anthropic pricing
  map (Sonnet/Opus/Haiku 4.x), `estimateCost()`, `logAiCostEvent()`,
  `safeLogAiCostEvent()` (never-throws).
- `src/agents/service.llm-runner.ts` — `CostContext` option on
  `runAgent()` and `runWithTools()`; returns `costEventId` for
  nested tool-call threading.
- `src/agents/websiteAgents/builder/{ComponentGenerator,LayoutGenerator,ComponentCritic}.md` —
  em-dash ban, serif rule, structural fidelity, contrast pairings,
  skip-slot enforcement.
- `src/utils/website-utils/htmlValidator.ts` — `checkProseStyle`,
  `checkContrastPairs`, and multi-section detection added to the
  validator loop.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` —
  `stripSkippedSlotGroups()` + `SLOT_TO_SECTION_KEYWORDS` map,
  automatically applied inside `buildComponentContext`.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` —
  short-circuit when `ctx.skipGeneration` is true; cost-context
  wiring; `section-regenerate` vs `page-generate` event differentiation.
- `src/controllers/admin-websites/feature-services/service.{identity-warmup,layouts-pipeline,identity-proposer,seo-generation,page-editor,ai-command}.ts` —
  cost-context threading at every call site.
- `src/controllers/admin-websites/AdminWebsitesController.ts` —
  `getProjectCosts` handler; `placeId` requirement relaxed when
  identity cache exists.
- `src/routes/admin/websites.ts` — `GET /:projectId/costs` route.
- `src/controllers/minds/feature-services/service.minds-chat.ts` —
  cost logging for non-streaming and streaming paths.
- `src/workers/processors/seoBulkGenerate.processor.ts` — threads
  `projectId` + `entity.id` so bulk SEO runs attribute costs correctly.
- `src/utils/website-utils/{aiCommandService,pageEditorService}.ts` —
  direct SDK calls instrumented via internal helpers.
- `frontend/src/components/Admin/CostsTab.tsx` — total card,
  tokens pills, scrollable event list with expandable metadata.
- `frontend/src/components/Admin/CreatePageModal.tsx` — 3-step
  wizard refactor, integrates `TemplatePageSelect`.
- `frontend/src/components/Admin/TemplatePageSelect.tsx` — new
  searchable combobox for template pages.
- `frontend/src/components/Admin/DynamicSlotInputs.tsx` — per-slot
  Generate/Skip actions, URL slot Test button with block detection.
- `frontend/src/components/Admin/RegenerateComponentModal.tsx` —
  passes section name to `onRegenerated`.
- `frontend/src/pages/admin/PageEditor.tsx` — pulse/overlay injection,
  content-change detection via snapshot map, toast + scroll on
  completion.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — Costs tab mount,
  Preview/Stop/Delete row actions during generation.
- `frontend/src/api/websites.ts` — `fetchProjectCosts()`,
  `AiCostEvent` / `ProjectCostsResponse` types; `placeId` made
  optional on `StartPipelineRequest`.

## [0.0.19] - April 2026

### Live Admin Leadgen — Polling + Multi-Select Bulk Delete

Makes the admin leadgen submissions page feel live: detail drawer polls
for updates while open, list refreshes every 5s, pulsing indicator shows
active fetches, and admins can now multi-select rows for bulk delete
without clicking the row delete button one at a time.

**Key Changes:**
- Detail drawer — **request-after-response polling** with a 500ms gap
  between ticks. Pauses when the browser tab is hidden (admin switches
  away), resumes seamlessly on visible. Initial fetch surfaces errors;
  subsequent tick failures log and retry next tick (no flashing red
  banner over a rendered drawer).
- **`LiveIndicator`** in drawer header — static green dot between ticks,
  pulses (expanding ring animation) during the in-flight request.
  Label: "LIVE TRACKING".
- **`onDetailUpdate` callback** — every fresh detail snapshot merges
  back into the matching list row, so `final_stage` / `last_seen_at`
  stay in sync on the list without a full re-fetch.
- **Animated event timeline** — `AnimatePresence` + `layout` on event
  items so new events fade/slide in; stage pill remounts on
  `final_stage` change and plays a scale + green ring flash.
- Table — multi-select: header checkbox (indeterminate when partial),
  per-row checkbox with click-propagation stopped. Active-drawer row
  highlighted in brand orange tint; selected rows in blue tint.
- New `LeadgenBulkActionBar` — floating bottom card with count badge,
  Clear, and "Delete N sessions" CTA. Confirm modal reuses the existing
  `useConfirm` pattern. Slides up/down via framer-motion.
- Page — **5s list polling** while the Submissions tab is visible;
  pauses on hidden, refreshes immediately on visible.
- Backend — new `POST /api/admin/leadgen-submissions/bulk-delete` with
  `{ ids: [] }`. Caps at 500 ids/request, UUID-validates every id, cascades
  via existing FK `ON DELETE CASCADE`. Returns `{ deleted: number }`.

**Commits:**
- `feat(admin): live leadgen polling + multi-select bulk delete`

## [0.0.18] - April 2026

### Mobile Responsive Refactor — Client-Facing Pages

Standardized the Tailwind class vocabulary across the post-login client
app so onboarding, settings, billing, and the new-account-setup flow
render cleanly on iPhone 16 (393px) instead of overflowing horizontally
with desktop-sized headlines and padding. Establishes a canonical
responsive doc that future devs (and DesignSystem additions) must follow.

**Key Changes:**
- New `frontend/docs/responsive-vocabulary.md` — the canonical class-ladder
  table for typography, padding, card max-widths, and layout direction.
  Linked from the top of `DesignSystem.tsx`. Acts as the convention
  enforced at PR review time.
- `DesignSystem.tsx` — `MetricCard` now uses `p-4 sm:p-5 lg:p-6` and
  `text-2xl sm:text-3xl` value scaling; `PageHeader` has responsive
  padding ladder and shrinks the avatar/icon on narrow screens. Header
  comment enforces responsive-by-default for all primitives.
- Onboarding wizard (`OnboardingContainer`, `Step0`–`Step3` files):
  card padding ladders, `text-xl sm:text-2xl lg:text-3xl` headlines,
  `w-full max-w-md` ordering rule applied to all card-like containers.
- `Step3_PlanChooser`: plan card now scales `w-full max-w-md sm:max-w-lg`
  and price uses `text-2xl sm:text-3xl lg:text-4xl` ladder.
- `NewAccountOnboarding`: headline `text-2xl sm:text-3xl lg:text-4xl`;
  all four step cards use the standard padding ladder; title + REQUIRED
  badge container stacks `flex-col sm:flex-row` so the badge wraps
  below the title on narrow screens.
- `Settings.tsx`: page padding `px-4 sm:px-6 md:px-8 lg:px-10`; tab bar
  gains `overflow-x-auto` so 4 tabs scroll horizontally at 393px instead
  of clipping; headline scales smoothly through every breakpoint.
- `BillingTab.tsx`: card padding ladders applied to every state
  (skeleton / locked / cancelled / active / subscribe-CTA / invoice
  history); plan card matches `Step3_PlanChooser` aesthetic; feature
  grid stacks `grid-cols-1 sm:grid-cols-2` on mobile.

**Commits:**
- `feat(frontend): mobile responsive refactor — client-facing pages + standardized vocabulary`

## [0.0.17] - April 2026

### Account-Link Gap Fix + LocalStorage Session Persistence

Fixes the silent failure of the `account_created` funnel step. Two
compounding bugs were preventing every prod signup from being credited
as a conversion in the leadgen funnel.

**Key Changes:**
- **`linkAccountCreation` now wired into `AuthPasswordController.verifyEmail`** —
  the actual prod signup path. Was previously only in `AuthOtpController`,
  which the public signup flow doesn't go through. Reads optional
  `leadgen_session_id` from request body, validates UUID, fires
  fire-and-forget after `setEmailVerified`.
- **Diagnostic log when `linkAccountCreation` finds zero candidates** —
  `[LeadgenAccountLinking] no candidate sessions { email, sessionId, userId }`.
  No more silent failures masking real bugs.
- **New `POST /api/leadgen/email-paywall` endpoint** — server-authoritative
  event recording for the in-tab paywall submit. Patches `session.email`,
  advances `final_stage`, idempotently writes `email_gate_shown` +
  `email_submitted` events. No queue, no n8n send (paywall flow already
  sends client-side).
- `recordServerSideEvent` helper now accepts a `source` param so paywall
  vs FAB events are distinguishable in `event_data.source` for admin.
- `Signup.tsx` captures `?ls=<uuid>` from the URL on mount and persists
  to localStorage so the value survives the redirect to `/verify-email`
  AND the time the user spends checking their inbox for the OTP code.
- `VerifyEmail.tsx` reads the persisted leadgen session id (URL fallback)
  and forwards it to `verifyEmail()`. Cleared on success — single-use,
  doesn't leak into a different account later.
- `api/auth-password.ts:verifyEmail` accepts an optional `leadgenSessionId`
  arg, includes it in the POST body when provided.

**Commits:**
- `fix: account-link hook + ?ls= forwarding + paywall server-authoritative endpoint`

## [0.0.16] - April 2026

### Leadgen "Email Me When Ready" FAB — Server-Driven Send-on-Complete

Adds the backend half of the floating "Email me when ready" button that
appears in the leadgen tool when an audit takes longer than 1:20 (or
errors). The leadgen-tool client posts the email to a new public endpoint
which queues it; when the audit worker finishes (or fails), the queue is
drained and the report email goes out via the existing n8n webhook —
durable, server-driven, doesn't depend on the user's tab staying open.

**Key Changes:**
- New `leadgen_email_notifications` queue table with cascade FKs to
  `leadgen_sessions` and `audit_processes`. Unique on
  `(session_id, audit_id)` so re-submissions upsert (latest email wins,
  but never overwrites a row already marked `sent`).
- New `POST /api/leadgen/email-notify` — UUID-validated, gated by the
  existing `X-Leadgen-Key`. Server-authoritatively writes
  `email_gate_shown` + `email_submitted` events to `leadgen_events` so
  the funnel reflects FAB submissions even when the JS `trackEvent` call
  doesn't land. Patches `leadgen_sessions.email` (write-once) and
  promotes `final_stage`.
- `enqueueEmailNotification` checks `audit_processes.status` — if the
  audit is already complete or failed, the report email is sent inline
  (closes the race where the FAB submit and audit completion land
  within the same second).
- Audit worker now drains the queue at `realtime_status=5` AND inside
  the failure catch block, so users who tapped the FAB still get their
  report whether the pipeline succeeds or errors out.
- Backend mirrors the leadgen-tool's email HTML in
  `service.n8n-email-sender.ts` so the worker can POST the same body
  shape as the client. New `N8N_EMAIL_URL` env var (same value as the
  leadgen-tool's `VITE_N8N_EMAIL_URL`).

**Commits:**
- `feat: leadgen email-notify FAB queue + audit-complete worker drain`

## [0.0.15] - April 2026

### Identifier Migrated to SDK; Copy Companion, Guardian, Governance Disabled

Phase 2 of the n8n exit. The Identifier agent — the last n8n dependency inside the practice ranking pipeline — now calls Claude directly through the existing `runAgent` + `loadPrompt` plumbing. Three other n8n-backed agents (Copy Companion, Guardian, Governance) are reversibly disabled because we may want to restore them later: routes are commented out in `agentsV2.ts`, the "Run Guardian & Governance" button is removed from the admin AI Data Insights page, and all code stays in place behind `DISABLED 2026-04-12` markers.

**Key Changes:**

*Identifier agent off n8n*
- New prompt at `src/agents/rankingAgents/Identifier.md` — first file in a new prompt subdirectory parallel to `dailyAgents`, `monthlyAgents`, `pmAgents`, `pmsAgents`, `websiteAgents`. Holds the system prompt for the practice specialty / market location extractor.
- `identifyLocationMeta()` in `service.webhook-orchestrator.ts` no longer calls `IDENTIFIER_AGENT_WEBHOOK` via axios. It loads the prompt and calls `runAgent` directly. Same function signature, same `{specialty, marketLocation}` return shape — no consumer changes needed in `service.ranking-executor.ts` or `service.places-competitor-discovery.ts`.
- Fallback path is preserved: `getFallbackMeta(gbpData)` still runs on SDK error or unparseable output, returning hardcoded `"orthodontist"` plus city/state extracted from the GBP storefront address.
- The new prompt also produces `specialtyKeywords[]`, `city`, `state`, `county`, and `postalCode`. Path A migration: these new fields are ignored for now to keep the migration parity-only; wiring them into competitor discovery and geographic filtering is a separate follow-up.
- The `IDENTIFIER_AGENT_WEBHOOK` env var constant stays exported at module level so the code path is restorable if we ever want the n8n route back.

*Copy Companion, Guardian, Governance disabled (reversible)*
- `POST /api/agents/gbp-optimizer-run` and `POST /api/agents/guardian-governance-agents-run` route registrations commented out in `agentsV2.ts` with a dated `DISABLED` marker. JSDoc endpoint list updated to flag both routes as disabled. Controllers and downstream services (`runGbpOptimizer`, `runGuardianGovernance`, `service.governance-validator.ts`, etc.) are untouched and remain exported.
- The `COPY_COMPANION_AGENT_WEBHOOK`, `GUARDIAN_AGENT_WEBHOOK`, and `GOVERNANCE_AGENT_WEBHOOK` env var constants stay exported for restoration.
- Admin AI Data Insights page (`AIDataInsightsList.tsx`): "Run Guardian & Governance" `ActionButton`, the `handleRunAgents` handler, and the `renderProgressBar` helper are commented out with the same `DISABLED` marker. Both `<AnimatePresence>{renderProgressBar()}</AnimatePresence>` JSX call sites are commented in place. The empty-state copy is rewritten to neutral text — `"No agent insights available for this month yet."` — so users aren't told to click a button that no longer exists.
- `setIsRunning` is dropped from the destructure because nothing references the setter anymore (only the getter `isRunning` is still read, by the Clear button). Restoration requires uncommenting `handleRunAgents` and adding `setIsRunning` back to the destructure.
- Two now-unused imports trimmed to keep the build clean: `Play` from `lucide-react` and `AnimatePresence` from `framer-motion`. Both are referenced only inside the commented-out JSX and need re-importing on restore.

*Goal achieved*
- After this entry, every performing agent (Proofline, Summary, Opportunity, CRO, Referral Engine, Practice Ranking, Identifier) runs through the in-repo `runAgent` Claude SDK pipeline. No performing agent depends on n8n. The three disabled agents are inactive and can be restored — or fully retired in a future cleanup pass — without rushing.

**Commits:**
- `src/routes/agentsV2.ts` — comment out `gbp-optimizer-run` and `guardian-governance-agents-run` route registrations with `DISABLED` marker; mark both endpoints disabled in the JSDoc endpoint list
- `src/controllers/agents/feature-services/service.webhook-orchestrator.ts` — replace the `identifyLocationMeta()` axios webhook call with `runAgent` + `loadPrompt("rankingAgents/Identifier")`; preserve the fallback path; add a note about the ignored new prompt fields. Webhook constants stay exported.
- `src/agents/rankingAgents/Identifier.md` — new prompt file in a new prompt subdirectory. System prompt for the dental specialty / market location extractor; produces `specialty`, `marketLocation`, `specialtyKeywords[]`, and `city` / `state` / `county` / `postalCode`.
- `frontend/src/pages/admin/AIDataInsightsList.tsx` — comment out the Guardian & Governance run button, the `handleRunAgents` handler, the `renderProgressBar` helper, and both `AnimatePresence` call sites. Drop `setIsRunning` from the destructure. Replace empty-state copy with neutral text. Trim `Play` and `AnimatePresence` imports.
- `plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md` — new plan folder with the spec for this work.

## [0.0.14] - April 2026

### PM Backlog Move, Multi-Select, Cross-Project AI Synth

Three composed features land together because they share the same backbone — a hardened `is_backlog` column flag and a new set of bulk / cross-project task operations. Backlog items can now be reassigned to another project without losing context. A floating multi-action bar (reusing the Action Items Hub pattern) lands on both the project board and the Me tab, with a right-click context menu on every card. A new top-level "Cross-project AI Synth" extracts tasks from raw text or files and routes each proposed task to its best-fit project before approval.

**Key Changes:**

*Move backlog tasks between projects*
- New endpoint `POST /api/pm/tasks/bulk/move-to-project` accepts `{ task_ids, target_project_id }`; the single-task right-click path calls the same endpoint with a one-element array so there is one code path to maintain
- Hard-gated to backlog-only: server rejects with `400 + offending_task_ids` metadata if any source task's column is not `is_backlog = true`. The UI also disables the bulk bar and context menu item with an explanatory tooltip, so the rule is enforced at both layers
- Tasks are appended to the end of the destination project's Backlog; source columns are compacted in the same transaction so positions stay contiguous
- One `pm_activity_log` row per moved task, logged under the **destination** project with `action: "task_moved_to_project"` and `metadata: { from_project_id, from_column_id, to_column_id, title }`

*Multi-select with floating action bar*
- New `pmStore` state: `selectedTaskIds: Set<string>` scoped to `activeProject`, plus a separate `meSelectedTaskIds` for the Me tab (tasks span projects there, so the Sets can't be shared)
- Selection auto-clears on project switch via `fetchProject` state reset — stale ids from the previous project can never leak into a bulk action
- Checkbox appears on card hover and stays pinned when any card is selected; clicks use `onClick` + `onPointerDown` stopPropagation so the dnd-kit drag sensor never fires from a checkbox tap
- Reuses the existing `BulkActionBar` from `components/ui/DesignSystem.tsx` — the same component Action Items Hub uses — with spring animation, count badge, and variant-styled action buttons. No new bar component was created
- Context menu semantics: right-clicking a **selected** card applies the action to the whole selection; right-clicking an **unselected** card acts on that single task only and does not modify the selection
- Bulk actions wired in the bar: Delete (with count-aware confirm modal), Move to project (disabled with tooltip unless every target is in Backlog). The context menu adds Open, Assign…, Set priority (P1–P5 + clear), Move to column, and Delete

*Cross-project AI Synth*
- New top-level "Cross-project AI Synth" button on `/admin/pm` dashboard, separate from the existing per-project button. The existing per-project synth flow is **completely untouched** — forked a new `CrossProjectAISynthModal` rather than refactoring `AISynthModal` to avoid regression risk
- Detached batch model: `pm_ai_synth_batches.project_id` is now nullable, and each `pm_ai_synth_batch_tasks` row gets a new `target_project_id` FK that must be set before the task can be approved
- LLM receives the active project list (id + name + description) as JSON in the system prompt and proposes a `target_project_id` per task. New prompt file `src/agents/pmAgents/AISynthCrossProject.md` lives alongside the existing `AISynth.md` — neither file modifies the other
- Server validates LLM-suggested `target_project_id` against the active project list on insert; invalid ids land as `null` for the user to fill manually — no LLM hallucination ever reaches the DB
- Approval UX: per-task project picker plus a "Set all pending to…" dropdown at the top of the task list. Approve button is disabled (with tooltip "Assign a project first") until `target_project_id` is set. Reject is always allowed
- On approve, the server re-validates the destination project is still `active` (guards the archived-between-extract-and-approve race), resolves its Backlog column via `is_backlog = true`, and creates the real task there with `source: "ai_synth"`

*Architectural lift — `is_backlog` flag*
- Every backend site that previously identified the Backlog column by name literal (`column.name === "Backlog"`) now reads `column.is_backlog`. This includes `PmTasksController.createTask`/`moveTask`, `PmStatsController.listStats`, `PmAiSynthController.approveTask`, and the frontend `pmStore.moveTask`, `CreateTaskModal`, `KanbanBoard`, `KanbanColumn`. Single grep sweep confirms only three name literals remain, all expected: migration backfill, migration comment, and the `DEFAULT_COLUMNS` seed constant
- Adding this flag in the same migration batch as the cross-project synth schema change was the "future-us won't hate present-us" call — if a column ever gets renamed or reordered, priority auto-clear, approval routing, and move-to-project validation keep working

*New primitives*
- `frontend/src/components/ui/context-menu.tsx` — shadcn-canonical wrapper around `@radix-ui/react-context-menu` (new dep), styled to the PM dark theme. First `radix-ui` primitive beyond `react-slot` in this repo; exports the full family (`ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSub`/`SubTrigger`/`SubContent`, etc.)
- `frontend/src/components/pm/MoveToProjectModal.tsx` — searchable project picker with backlog counts per project, used by both the bulk bar and the context menu move-to-project paths
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — the forked cross-project variant of AISynthModal (grid / new / detail views, per-task project picker, set-all dropdown, cross-project badge on history cards)

**Migration:**
- `20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — additive, forward-compatible:
  - `ALTER TABLE pm_columns ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE` + backfill `WHERE name = 'Backlog'` + partial index `idx_pm_columns_is_backlog` on `(project_id) WHERE is_backlog = TRUE`
  - `ALTER TABLE pm_ai_synth_batches ALTER COLUMN project_id DROP NOT NULL`
  - `ALTER TABLE pm_ai_synth_batch_tasks ADD COLUMN target_project_id UUID REFERENCES pm_projects(id) ON DELETE SET NULL`
- Down migration refuses to restore `NOT NULL` on `project_id` if any cross-project batches exist — loud-by-design so a rollback never nukes detached batches

**Commits:**
- `src/database/migrations/20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — new migration (is_backlog flag, nullable project_id, target_project_id FK, partial index)
- `src/controllers/pm/PmTasksController.ts` — `bulkMoveTasksToProject` + `bulkDeleteTasks` controllers; `createTask` and `moveTask` switched from name checks to `is_backlog`
- `src/controllers/pm/PmAiSynthController.ts` — `extractBatch` gains `scope: "project" | "cross_project"` parameter and injects the active project list into the cross-project prompt; `approveTask` resolves destination via `batch.project_id ?? batchTask.target_project_id` with active-status revalidation; new `setBatchTaskTargetProject` and `listCrossProjectBatches` controllers
- `src/controllers/pm/PmProjectsController.ts` — `DEFAULT_COLUMNS` seed now sets `is_backlog: true` for the Backlog entry and `false` for the other three, threaded through `PmColumnModel.create`
- `src/controllers/pm/PmStatsController.ts` — backlog count query updated to `is_backlog = true`
- `src/routes/pm/tasks.ts` — registered `POST /tasks/bulk/move-to-project` and `POST /tasks/bulk/delete`
- `src/routes/pm/aiSynth.ts` — registered `GET /batches/cross-project` (before `/batches/:batchId` to avoid route collision) and `PUT /batches/:batchId/tasks/:taskId/target-project`
- `src/agents/pmAgents/AISynthCrossProject.md` — new system prompt for cross-project extraction; receives `{{PROJECTS_JSON}}` block and proposes `target_project_id` per task
- `frontend/src/types/pm.ts` — `PmColumn.is_backlog: boolean`, `PmAiSynthBatch.project_id: string | null`, `PmAiSynthBatchTask.target_project_id: string | null` (and P4/P5 added to the priority union + `"failed"` status)
- `frontend/src/api/pm.ts` — `bulkMoveTasksToProject`, `bulkDeleteTasks`, `extractCrossProjectBatch`, `fetchCrossProjectBatches`, `setBatchTaskTargetProject`
- `frontend/src/stores/pmStore.ts` — selection state (`selectedTaskIds` + `meSelectedTaskIds`), toggle/clear actions, `bulkDeleteSelectedTasks`, `bulkMoveSelectedTasksToProject`, `bulkDeleteMeSelectedTasks`; selection auto-clear on project switch; name checks replaced with `is_backlog`
- `frontend/src/components/ui/context-menu.tsx` — new shadcn primitive wrapper
- `frontend/src/components/pm/MoveToProjectModal.tsx` — new searchable picker modal
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — new forked cross-project synth modal with per-task project picker and set-all dropdown
- `frontend/src/components/pm/TaskCard.tsx` — hover checkbox (with `stopPropagation` + `onPointerDown` guard against drag sensor), selection outline, `<ContextMenu>` wrapper with Open / Assign / Set priority / Move to column / Move to project / Delete
- `frontend/src/components/pm/MeTaskCard.tsx` — same treatment, minus Move-to-column (tasks span projects on Me tab)
- `frontend/src/components/pm/KanbanBoard.tsx` — pass selection props through to columns; `name === "Backlog"` checks and the assignee-required rule switched to `is_backlog`
- `frontend/src/components/pm/KanbanColumn.tsx` — forward selection props to each `TaskCard`; `isBacklog` derived from `column.is_backlog`
- `frontend/src/components/pm/MeKanbanBoard.tsx` — forward selection props through `DroppableColumn` → `DraggableCard` → `MeTaskCard`
- `frontend/src/components/pm/MeTabView.tsx` — Me-tab `BulkActionBar`, bulk delete confirm modal, context action handler, store selection subscription
- `frontend/src/components/pm/CreateTaskModal.tsx` — `selectedColumnIsBacklog` derived from `column.is_backlog`
- `frontend/src/pages/admin/ProjectBoard.tsx` — selection subscription, `BulkActionBar` with Move-to-project + Delete actions, `MoveToProjectModal` wiring, bulk delete confirm modal, `handleContextAction` that routes single-vs-multi based on whether the right-clicked task is in the selection, `allTargetsInBacklog` guard, `is_backlog` lookup for `TaskDetailPanel` prop
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — "Cross-project AI Synth" entry button + modal mount
- `frontend/package.json` / `package-lock.json` — added `@radix-ui/react-context-menu`
- `plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/spec.md` + `migrations/{pgsql.sql, mssql.sql, knexmigration.js}` — full spec with 16 tasks, Risk Level 4 section, and three migration scaffolds per convention

## [0.0.13] - April 2026

### Conditional Rendering for Post Tokens

Post blocks and single post templates can now hide markup when a field or custom field is empty, eliminating broken-image icons, empty labels, and orphan wrapper elements. Template authors wrap markup in `{{if post.X}}...{{endif}}` or `{{if_not post.X}}...{{endif}}` to conditionally render based on field presence. Supports standard post tokens and `post.custom.<slug>` custom fields. Evaluated before token replacement so the stripped markup never reaches the output.

**Key Changes:**
- New syntax: `{{if post.featured_image}}<img src="{{post.featured_image}}"/>{{endif}}` keeps the image only when set; pair with `{{if_not post.featured_image}}...{{endif}}` for a fallback branch
- "Empty" is strictly `null`, `undefined`, or empty string `""`. The values `"0"`, `0`, `false`, whitespace strings, and empty arrays/objects are intentionally **not** empty — authors writing `{{if post.custom.count}}` with a zero count see the block render as expected
- Flat only in v1 — nested conditionals trigger a `console.warn` and leave the template unchanged so the raw markers render visibly. Loud-by-design so silent template bugs don't ship
- Custom fields supported via `{{if post.custom.<slug>}}` in both post block loops and single post templates
- Works in five render paths with identical semantics: production post blocks, production single post pages, editor page preview with embedded post block shortcodes, editor post block template preview (client-side), and editor single post template preview (client-side)
- Existing templates with zero `{{if}}` tokens pass through a fast-path early return — zero behavioral change for all current data
- Known preview limitation documented in the Posts Docs page: the editor's client-side preview treats `post.custom.*` as empty because placeholder data doesn't model custom fields. Live site reflects real values.
- Companion change in `website-builder-rebuild` (production renderer) ships the same `processConditionals` logic in `src/utils/shortcodes.ts` — required for production parity. Three source-of-truth copies are kept in sync via cross-reference header comments in each file.

**Commits:**
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — added `processConditionals` helper (local, non-exported) with field resolver handling the backend's `_categories`/`_tags` naming convention and derived `url` field; wired into `renderPostBlock`'s `posts.map` body after `customFields` is parsed. Header comment names the two sibling copies.
- `frontend/src/components/Admin/PostBlocksTab.tsx` — added `processConditionals` helper that resolves fields by looking up literal token strings in `PLACEHOLDER_POST`; invoked in both the loop path (per-post, so different preview posts can resolve differently) and the single-template fallback path of `replacePlaceholders`. Documents the custom-field preview limitation inline.
- `frontend/src/pages/admin/AlloroPostsDocs.tsx` — new "Conditional Rendering" section between "Shortcode Syntax" and "Examples" with syntax reference, empty-definition explainer, two worked examples (featured image fallback, video embed), and a rules/limits list covering flat-only constraint, absence of `{{else}}`/comparisons, preview limitation, and the supported field list.
- `plans/04112026-no-ticket-conditional-post-token-rendering/spec.md` — full spec covering why/what/context/constraints/risk/tasks/done for the cross-repo change.

## [0.0.12] - April 2026

### Allow Manager Role to Rename a Location

Manager-role users can now rename a location from Settings → Properties without escalating to an org admin. Rename is lightweight metadata and no longer requires full `canManageConnections` admin privilege. All other location management actions (Change GBP, Set Primary, Delete, Add Location, change domain) remain admin-only.

**Key Changes:**
- Backend `PUT /api/locations/:id` is now accessible to both `admin` and `manager` roles
- Server-side field-level guard rejects non-admin attempts to modify `domain` or `is_primary` with `403` — defense in depth, the client is not authoritative
- Frontend `PropertiesTab` exposes a distinct `canRenameLocation` flag (admin OR manager); the inline name-edit affordance uses this flag while every other action remains gated on `canManageConnections` (admin-only)
- Viewer role remains fully read-only; no edit affordance is rendered

**Commits:**
- `src/routes/locations.ts` — widened role gate on `PUT /:id` from `admin` to `admin, manager`; added field-level guard blocking `domain`/`is_primary` modification for non-admin roles
- `frontend/src/components/settings/PropertiesTab.tsx` — added `canRenameLocation` flag; swapped `canManageConnections` → `canRenameLocation` on the two call sites that gate the name-edit UI (click handler and hover pencil icon)

## [0.0.11] - April 2026

### PM QA Bug Fixes + UX Polish

Full Playwright QA pass on the PM feature surfaced five confirmed bugs and five friction points. All fixed before production rollout.

**Bug Fixes:**
- Task cards now immediately show "by dave" (creator name) and "→ dave" (assignee name) on creation and assignment — backend `createTask` and `assignTask` responses now enrich with LEFT JOIN on users
- Deadline panel display no longer shows the wrong date (off-by-one) — changed from `.slice(0, 10)` on a UTC ISO string to `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` to get the correct PST date
- ME kanban card clicks now open the task detail panel — moved click handler to outer draggable div with a `didDrag` ref to distinguish click vs drag
- Text no longer selects during ME kanban drag — added `userSelect: "none"` to draggable elements
- ME kanban drag to DONE column now works reliably — replaced `pointerWithin` collision detection with `rectIntersection` filtered to column droppables only
- Fixed missing `format` import in `pmDateFormat.ts` that would crash for far-future deadlines

**UX Improvements:**
- Truncated task titles show full text as native browser tooltip (`title` attribute) on both kanban and ME kanban cards
- Task detail panel now shows "Created by {name} · X ago" metadata row at the bottom
- ME kanban columns show an orange border ring + subtle scale on drag-over for clearer drop targeting
- ME task cards show assignee name (`→ name`) when set
- Old notifications without `actor_name` in metadata are now enriched server-side via actor email fallback

**Commits:**
- `src/controllers/pm/PmTasksController.ts` — `enrichTask()` helper, applied to createTask + assignTask
- `frontend/src/components/pm/TaskDetailPanel.tsx` — PST deadline display fix, creator metadata row
- `frontend/src/components/pm/MeKanbanBoard.tsx` — click vs drag fix, column collision detection, drop zone ring
- `frontend/src/components/pm/MeTaskCard.tsx` — no-select on drag, assignee display, title tooltip
- `frontend/src/components/pm/TaskCard.tsx` — title tooltip
- `frontend/src/utils/pmDateFormat.ts` — `format` import fix
- `src/controllers/pm/PmNotificationsController.ts` — server-side actor_name enrichment

## [0.0.10] - April 2026

### Session Expired Crash Fix (ALLORO-FRONTEND-Q)

Users with expired JWT tokens hitting `/settings/billing` saw a white screen — "Something went wrong." — because the billing page crashed trying to render a 403 error response as billing data. The app now detects expired tokens globally and shows a "Session Expired" modal prompting re-login.

**Key Changes:**
- Global 403 axios interceptor in `api/index.ts` — detects `"Invalid or expired token"` responses, dispatches `session:expired` event with dedup flag to prevent multiple modals
- `SessionExpiredModal` component — non-dismissible dark glassmorphic modal, clears all auth state (localStorage, sessionStorage, query cache, cookies), broadcasts logout to other tabs, redirects to `/signin`
- Mounted in `App.tsx` at top level alongside `<Toaster />`
- `BillingTab.tsx` defensive guard — changed `success !== false` to `success === true` so malformed API responses never set state

**Commits:**
- `frontend/src/api/index.ts` — 403 interceptor with `sessionExpiredFired` dedup flag
- `frontend/src/components/SessionExpiredModal.tsx` — new modal component
- `frontend/src/App.tsx` — mount SessionExpiredModal
- `frontend/src/components/settings/BillingTab.tsx` — tighten response guards

## [0.0.9] - March 2026

### Billing Quantity Override for Flat-Rate Legacy Clients

Caswell Orthodontics and One Endodontics have flat-rate deals — they pay for a single unit regardless of how many locations they have. A new `billing_quantity_override` column on organizations allows per-org override of the Stripe subscription quantity, bypassing the automatic location count.

**Key Changes:**
- Migration `20260323000001_add_billing_quantity_override` — adds nullable integer column, seeds `1` for Caswell (org 25) and One Endo (org 39)
- `BillingService.createCheckoutSession()` — uses override when set, falls back to location count
- `BillingService.syncSubscriptionQuantity()` — uses override when set, prevents location add/remove from changing the billed quantity
- `IOrganization` interface — added `billing_quantity_override: number | null`

**Commits:**
- `src/database/migrations/20260323000001_add_billing_quantity_override.ts` — column + seed data
- `src/controllers/billing/BillingService.ts` — guard clauses in checkout and quantity sync
- `src/models/OrganizationModel.ts` — interface update

## [0.0.8] - March 2026

### Stripe Subscription Quantity Sync on Location Change

Adding or removing a location now automatically updates the Stripe subscription quantity and sends an email notification to org admins with the billing change details.

**Key Changes:**
- `syncSubscriptionQuantity()` in BillingService — retrieves Stripe subscription, compares item quantity to current location count, updates if different
- Hooked into `LocationService.createLocation()` and `removeLocation()` as fire-and-forget after transaction commits
- Email notification to org admins: old/new quantity, unit price, new monthly total, proration note
- Best-effort: Stripe failures are logged but never block location operations
- No-op for admin-granted orgs (no `stripe_subscription_id`)

**Commits:**
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Add syncSubscriptionQuantity() with Stripe update + email notification
- `signalsai-backend/src/controllers/locations/LocationService.ts` — Hook sync into createLocation() and removeLocation()

## [0.0.7] - March 2026

### Rybbit Analytics Integration & Proofline Migration

Automated Rybbit website analytics provisioning, migrated Proofline from N8N to direct Claude calls, and enriched both daily and monthly agents with website analytics data from Rybbit.

**Key Changes:**
- Automated Rybbit site creation when a custom domain is verified — creates site via Rybbit API and auto-injects tracking script into project header code
- Migrated Proofline agent from N8N webhook to direct Claude LLM call with proper JSON output schema (title, proof_type, trajectory, explanation)
- Proofline daily agent now includes Rybbit website analytics (sessions, pageviews, bounce rate) alongside GBP data for yesterday vs day-before comparison
- Monthly Summary agent now includes Rybbit website analytics (current month vs previous month) alongside GBP and PMS data
- New shared Rybbit data fetcher utility with daily and monthly comparison functions, reused across both agent types
- Added `rybbit_site_id` column to projects table for linking to Rybbit sites
- Added `ProoflineAgentOutput` and `ProoflineSkippedOutput` backend type definitions
- Added `trajectory` field to frontend `ProoflineAgentData` type

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts` — Add rybbit_site_id to projects
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts` — Rybbit site provisioning on domain verification
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — Hook provisioning into verifyDomain
- `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts` — Shared Rybbit data fetcher (daily + monthly comparison)
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — Output schema added to prompt
- `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts` — ProoflineAgentOutput type
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — Proofline migration to direct Claude call, Rybbit data wiring for daily + monthly
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — websiteAnalytics param in proofline + summary payloads
- `signalsai/src/types/agents.ts` — Add trajectory to ProoflineAgentData

## [0.0.6] - March 2026

### Stripe Production Billing — Org Type Pricing + Dynamic Quantity

Billing was hardcoded to a single $2,000 flat price with `quantity: 1`. Now supports per-location/per-team pricing driven by organization type, dynamic quantity based on location count, and a persistent subscribe banner for unpaid users.

**Key Changes:**
- Checkout resolves Stripe price by organization type: `health` ($2,000/location/mo) or `saas` ($3,500/team/mo)
- Checkout quantity dynamically set to org's location count from DB (minimum 1)
- New `organization_type` column on organizations (nullable, immutable once set, null = health)
- Admin org detail page: type dropdown (Health / SaaS) with confirmation, locked after save
- `PATCH /api/admin/organizations/:id/type` endpoint with 409 immutability enforcement
- Persistent amber banner for admin-granted users without Stripe subscription ("Subscribe in Settings > Billing")
- ENV restructured: `STRIPE_DFY_PRICE_ID` renamed to `STRIPE_HEALTH_PRICE_ID`, added `STRIPE_SAAS_PRICE_ID`, comment-swap blocks for test/prod keys

**Commits:**
- `signalsai-backend/src/database/migrations/20260312000002_add_organization_type.ts` — Add organization_type column
- `signalsai-backend/src/config/stripe.ts` — Replace `getPriceId(tier)` with `getPriceIdByOrgType(orgType)`
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Dynamic price + quantity in checkout session
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Add updateOrganizationType handler
- `signalsai-backend/src/routes/admin/organizations.ts` — Add PATCH /:id/type route
- `signalsai-backend/src/models/OrganizationModel.ts` — Add organization_type to IOrganization
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — Org type dropdown with immutability lock
- `signalsai/src/components/PageWrapper.tsx` — Persistent non-subscriber amber banner
- `signalsai/src/api/admin-organizations.ts` — Add organization_type to types, adminUpdateOrganizationType function

## [0.0.5] - March 2026

### SEO Data Version Propagation & Backfill

SEO data was siloed on individual page versions. Bulk generation targeted the highest version number (often an inactive version), and manual SEO edits only wrote to one row. The page list showed score 77 from an old inactive version while the editor showed 15 (draft had null seo_data). The public renderer serves from the published row — if that row had no seo_data, zero SEO tags were injected.

**Key Changes:**
- Added `propagateSeoToSiblings` helper — when SEO data is written to any page version, all sibling versions of the same path with null seo_data are backfilled (additive only, never overwrites)
- Fixed bulk SEO generation to target the published page per path (fallback to draft, then highest version) instead of blindly picking the highest version number
- Fixed page list SEO score to use `displayPage` (published or latest) instead of scanning all versions for any with seo_data
- Fixed `getAllSeoMeta` endpoint to deduplicate pages by path (one entry per path) — prevents false uniqueness failures between draft and published versions of the same page
- Fixed SeoPanel uniqueness filter to exclude by page path instead of entity ID, preventing score flicker (77 → 66) when sibling metadata loads
- One-time backfill migration: copied best seo_data to all 79 page versions across 13 page groups that had gaps

**Commits:**
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add propagateSeoToSiblings helper, call from updatePageSeo
- `signalsai-backend/src/workers/processors/seoBulkGenerate.processor.ts` — Fix getPageEntities to prefer published, add sibling propagation after bulk save
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — Deduplicate getAllSeoMeta by path
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — List score uses displayPage, allPageSeoMeta uses published/latest per group
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Uniqueness filter excludes by path for pages
- `signalsai-backend/src/database/migrations/20260310000001_backfill_seo_data_across_versions.ts` — One-time backfill migration

## [0.0.4] - March 2026

### Fix Monthly Agents 400 Error (Org-Centered Alignment)

Removed vestigial `domain` requirement from the monthly-agents-run endpoint — a leftover from the domain-centered execution model replaced in February. Organizations without a domain set caused silent 400 failures in the PMS pipeline.

**Key Changes:**
- `domain` no longer required in `POST /api/agents/monthly-agents-run` — endpoint resolves display name from its internal org join
- PMS retry and approval services no longer resolve org domain just to pass it back; removed unnecessary `OrganizationModel` lookups
- Fire-and-forget axios calls replaced with `await` so errors propagate correctly instead of being swallowed
- `notifyAdminsMonthlyAgentComplete` parameter renamed from `domain` to `practiceName`

**Commits:**
- `src/controllers/agents/AgentsController.ts` — Remove domain validation, use org join for admin email
- `src/utils/core/notificationHelper.ts` — Rename domain param to practiceName
- `src/controllers/pms/pms-services/pms-retry.service.ts` — Remove org lookup, domain payload, fix await
- `src/controllers/pms/pms-services/pms-approval.service.ts` — Same cleanup

### Fix SEO Data Lost on Page Draft Creation

SEO scores displayed correctly in the website page list but appeared empty when opening a page for editing. The `createDraft` function was not copying `seo_data` from the published page to the draft.

**Key Changes:**
- Draft creation now copies `seo_data` from the published source page
- Stale draft refresh now syncs `seo_data` from the published version

**Commits:**
- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add seo_data to draft insert and stale refresh update

## [0.0.3] - March 2026

### SEO Scoring System & Meta Injection

Full SEO scoring, editing, and meta injection pipeline across admin frontend, backend, and website-builder-rebuild rendering server.

**Key Changes:**
- SEO scoring panel with sidebar navigation, per-section scores, colored dot indicators, and inline field editing for meta title, description, canonical URL, robots, OG tags, and JSON-LD schema
- SEO meta injection in website-builder-rebuild renderer: smart replace-or-inject for `<title>`, meta tags, canonical, OG tags, and JSON-LD schema blocks
- Business data service with Redis-cached lookups (10-min TTL) for org + location data
- Post-level SEO support: Content/SEO tab bar in post editor with auto-save
- Backend: `seo_data` JSONB column on pages and posts, business_data on organizations/locations, SEO generation endpoint
- Migration: `20260308000001_add_seo_and_business_data.ts`

### Admin Sidebar Collapsed Spacing

Fixed collapsed admin sidebar overlaying PageEditor and LayoutEditor content. Content now reserves 72px left margin when sidebar is collapsed.

### SeoPanel Redesign

Restructured SeoPanel from a full-width scrolling list to a sidebar+main split layout. Removed emoji indicators, added colored dot score indicators, section navigation sidebar, and business data warning CTA linking to organization settings.

### Project Display Name & Custom Domain in List

Added editable display name to website projects and custom domain preference in the list view.

**Key Changes:**
- `display_name` column on `website_builder.projects` (migration `20260309000001`)
- Inline-editable display name in WebsitesList (pencil icon, Enter to save)
- "View Site" link and domain display prefer `custom_domain` over generated subdomain
- Backend: `display_name` and `custom_domain` included in list query, set on project create

### Misc Fixes
- Removed unused imports (`Download`, `HelpCircle`, `FileText`, `Upload`, `Sparkles`) and dead `LocationFormRow` component to fix TS6133 errors

**Commits:**
- `website-builder-rebuild/src/utils/renderer.ts` — SEO meta injection with `injectSeoMeta()`, `replaceOrInjectMeta()`, `replaceOrInjectLink()`
- `website-builder-rebuild/src/services/seo.service.ts` — Business data fetch with Redis caching
- `website-builder-rebuild/src/routes/site.ts` — SEO injection in page and post assembly
- `website-builder-rebuild/src/services/singlepost.service.ts` — Added `seo_data` to post query
- `website-builder-rebuild/src/types/index.ts` — `SeoData` interface, `organization_id` on Project, `seo_data` on Page
- `signalsai-backend/src/database/migrations/20260308000001_add_seo_and_business_data.ts` — SEO + business_data columns
- `signalsai-backend/src/database/migrations/20260309000001_add_display_name_to_projects.ts` — display_name column
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.project-manager.ts` — display_name in list/create, `updateProjectDisplayName()`
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.seo-generation.ts` — SEO generation service
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — SEO endpoints
- `signalsai-backend/src/routes/admin/websites.ts` — SEO routes
- `signalsai-backend/src/routes/locations.ts` — Business data routes
- `signalsai-backend/src/controllers/locations/BusinessDataService.ts` — Business data service
- `signalsai-backend/src/models/LocationModel.ts` — Fixed create signature for optional business_data
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Redesigned SEO panel with sidebar navigation
- `signalsai/src/components/Admin/PostsTab.tsx` — Content/SEO tab bar, post SEO editing
- `signalsai/src/pages/admin/PageEditor.tsx` — SEO tab integration, sidebar margin fix
- `signalsai/src/pages/admin/LayoutEditor.tsx` — Sidebar margin fix
- `signalsai/src/pages/admin/WebsitesList.tsx` — Inline display name editing, custom domain links
- `signalsai/src/api/websites.ts` — `display_name`, `custom_domain`, SEO API functions
- `signalsai/src/api/locations.ts` — Business data API functions
- `signalsai/src/components/PMS/PMSUploadWizardModal.tsx` — Removed unused imports
- `signalsai/src/components/PMS/PMSVisualPillars.tsx` — Removed unused imports
- `signalsai/src/pages/admin/PracticeRanking.tsx` — Removed unused `LocationFormRow` and `Sparkles`

## [0.0.2] - February 2026

### Admin Set Password & User Profile Account Tab

Enables password management for legacy Google-only accounts via admin tools and user self-service.

**Key Changes:**
- Admin can now see password status (PW / No PW badge) on each user card in Organization Detail
- Admin can set a temporary auto-generated password for any user with optional email notification
- New "Account" tab in Settings (after Billing) where users can set or change their password
- Smart UX: legacy users (no password) see "Set Password" without current password requirement; users with a password must enter their current one to change it
- Password validation enforces existing rules (8+ chars, 1 uppercase, 1 number)

**Commits:**
- `signalsai-backend/src/models/OrganizationUserModel.ts` — Added password_hash to user join query
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Added has_password mapping + setUserPassword handler with temp password generation and email notification
- `signalsai-backend/src/controllers/settings/SettingsController.ts` — Added getPasswordStatus and changePassword handlers
- `signalsai-backend/src/routes/admin/organizations.ts` — Added POST /users/:userId/set-password route
- `signalsai-backend/src/routes/settings.ts` — Added GET /password-status and PUT /password routes
- `signalsai/src/api/admin-organizations.ts` — Added has_password to AdminUser, adminSetUserPassword API function
- `signalsai/src/api/profile.ts` — Added getPasswordStatus and changePassword API functions
- `signalsai/src/components/settings/ProfileTab.tsx` — New password set/change component
- `signalsai/src/pages/Settings.tsx` — Added Account tab
- `signalsai/src/pages/admin/OrganizationDetail.tsx` — Password status badges, Set Password modal with notify checkbox
