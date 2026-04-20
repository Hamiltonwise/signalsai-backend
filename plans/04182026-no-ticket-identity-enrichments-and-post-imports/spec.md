# Identity Enrichments + Post Imports

## Why
Identity today captures the business profile but hides or omits details the admin still needs: hours are scraped but never shown, doctors and services aren't tracked at all, and there's no path from "things we discovered about the practice" to "posts we publish about them." CTAs also scatter to invented paths. We close these gaps in one coherent pass.

## What
Six tightly scoped changes:

1. **Surface hours** in the identity Summary tab (already captured, not rendered).
2. **Doctor, service, and location lightweight identity lists** — name + source URL + short blurb + `last_synced_at`. Locations also carry address/phone/hours (structured GBP data, not URL-dependent). No image downloads during warmup.
3. **Three new tabs in the Identity modal** — Doctors, Services, Locations — showing the lists with per-entry sync timestamp + manual re-sync action.
4. **Multi-location warmup** — `identity.locations[]` populated by scraping each selected `place_id`. `identity.business` remains a pointer to the primary location (`locations[0]` or the designated primary) so every existing consumer keeps working.
5. **"Import from Identity" button in Posts tab** — modal with checkbox selection; pipeline fetches each URL, downloads images to S3, creates posts rows. Scoped to `doctor`, `service`, and `location` post types.
6. **Canonical `/contact` CTA rule** — prompt directive + validator warning for any CTA `href` that isn't `/contact`, `tel:`, `mailto:`, or a same-page anchor.

## Context

**Relevant files:**
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — warmup pipeline. Already downloads logo to S3 (line 452-481 `downloadAndHostLogo`) and populates `business.hours` (line 420). New doctor/service extraction hooks here.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` — `ProjectIdentity` type + stable-context builder. New `content_essentials.doctors[]` and `content_essentials.services[]` lists land here; hours field already exists (`business.hours: unknown`).
- `src/controllers/admin-media/feature-utils/util.s3-helpers.ts` — `uploadToS3`, `buildMediaS3Key`, `buildS3Url`. Reuse for image downloads in the import pipeline.
- `src/database/migrations/20260305000001_create_posts_system.ts` — defines `website_builder.posts` (column `featured_image TEXT`) and `website_builder.post_types` (JSONB field config).
- `frontend/src/components/Admin/IdentityModal.tsx` (or wherever the Project Identity panel lives — locate in execution). Summary + JSON + Chat Update tabs today.
- `frontend/src/components/Admin/PostsTab.tsx` — mounts posts list per post type, uses `MediaPickerField` + `MediaBrowser` for S3 uploads. New "Import from Identity" button + modal.
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — add `/contact` rule.
- `src/utils/website-utils/htmlValidator.ts` — add CTA path check.

**Patterns to follow:**
- S3 upload: `uploadToS3` + `buildMediaS3Key` pattern used by `downloadAndHostLogo` in warmup. Mirror for doctor/service images.
- Content essentials list shape: `featured_testimonials[]` in `util.identity-context.ts:167-171` — follow that same array-of-structured-object pattern.
- Validator warning style: `checkLinks` in `htmlValidator.ts:209` — follow the same issue/fixInstruction shape.

**Reference files:**
- For the extraction helper: the existing `service.identity-warmup.ts` section that parses testimonials / extracts images from discovered pages — same mechanism, new schema.
- For the Import modal UX: closest analog is the Media Browser modal in `PostsTab.tsx` — checkbox list + confirm button.

## Constraints

**Must:**
- Doctor and service list entries in identity stay lightweight: `{name, source_url, short_blurb, last_synced_at, stale?}`. No full article text, no image URLs, no structured metadata beyond those fields.
- Location list entries carry structured GBP data: `{place_id, name, address, phone, hours, source_url?, last_synced_at, is_primary, stale?}` — these are sourced from GBP scrape, not page scraping, so they're structured from day one.
- `identity.business` always reflects the primary location. When `locations[]` exists, primary is whichever entry has `is_primary: true` (warmup sets the first/original place as primary). Backward compat: every existing consumer that reads `identity.business` keeps working without changes.
- Image downloads and S3 uploads happen **only inside the import pipeline** (Posts tab), never during warmup.
- Every import pipeline call is resumable — if the fetch or S3 upload fails mid-batch, successful rows persist; the failed row is marked with a retriable error.
- `last_synced_at` is set the moment a list entry is written to identity (warmup discovery time), and is re-stamped on every re-sync.
- CTA rule exempts: `tel:`, `mailto:`, absolute URLs (`http://`, `https://`), same-page anchors (`#section`), and the explicit booking URL if one is stored on the project.
- All image downloads in the import pipeline validate `content-type` is `image/*` and cap size at **15 MB** before upload.
- Hard caps on identity list sizes: **100 entries** per doctor/service list, **20 locations** per project. Blurb text capped at **400 chars**.

**Must not:**
- Don't add dedicated `doctors`, `services`, or `locations` tables. Lists live in `identity` JSONB (`content_essentials.doctors`, `content_essentials.services`, `locations`).
- Don't add image downloads to warmup — keep warmup fast.
- Don't let the import pipeline block the Posts tab render. Run it in the background (BullMQ job) and show progress.
- Don't rewrite existing posts on re-import. Match by `source_url` (doctors/services) or `place_id` (locations); skip duplicates unless admin explicitly opts into "overwrite."
- Don't change the `featured_image` column from TEXT — we store the S3 URL as text.
- Don't rewrite existing callers of `identity.business`. Keep the field intact; `locations[]` is additive.

**Out of scope:**
- Footer/header template changes that fan out per-location (listing all locations in the footer). The data will be available in `identity.locations[]` and in the Location post type, but wiring templates to render "all locations" stays in a follow-up.
- Automatic "primary vs all" decision in the AI prompts. The generator will continue to read `identity.business` as the address/phone source. Using multiple locations inside a generated page (e.g. a multi-location services page) is a follow-up prompt/template change.
- Booking URL field (nice-to-have but not required by `/contact` CTA rule; add later).
- Post type seeding for "doctor", "service", "location" — assume the template already defines them. If it doesn't, flag in execution and add a separate task.
- Scheduled re-sync. Re-sync is manual only in this plan.
- Insurance / languages / new-patient-offer fields (future identity expansion).

## Risk

**Level:** 3 — structural. Multi-location touches warmup orchestration and the shape of `identity`. We keep `identity.business` as a pointer to primary so existing consumers don't change, but the warmup loop has to juggle N place_ids with per-place Apify failures. Posts tab import pipeline is new but follows established S3 helper patterns. CTA rule and hours rendering are Level 1.

**Risks identified:**
- **Scraping doctor/service URLs at import time can hit the same WAF/Cloudflare walls we already know about.** → **Mitigation:** reuse the existing URL-scrape strategy stack (fetch → browser-rendered fallback → screenshot extraction). It's already in `service.url-scrape-strategies.ts`. Mark the post with `import_warning` if fallback was needed.
- **Re-sync on identity can create orphaned entries.** If a doctor leaves the practice and their URL 404s on re-sync, we keep the stale record by default. → **Mitigation:** on re-sync, if a URL returns 4xx, mark the entry `stale: true` in identity but don't delete. Admin can manually remove.
- **Import modal can feel like a black box.** User clicks import on 8 doctors, 3 succeed, 2 fail on scrape, 3 succeed without images. → **Mitigation:** return per-row results; render a results panel with green/yellow/red status + "view detail" per row.
- **Identity JSONB bloat.** Doctors + services lists grow on large practices. → **Mitigation:** max 100 entries per doctor/service list, 20 locations per project, 400-char blurbs.
- **`/contact` enforcement will false-positive on legitimate deep links** (e.g. `/services/invisalign`, `/about`). → **Mitigation:** rule flags only CTA-shaped elements (buttons, `.btn`, `rounded-full` links with action words like "Schedule", "Book", "Contact", "Get Started"). Not every link.
- **Multi-location warmup latency scales linearly with location count.** 5 locations = 5 Apify calls + 5 image-analysis passes. → **Mitigation:** run additional-location scrapes in parallel (Promise.all with a concurrency limit of 3). Primary location still drives distillation + archetype classification — additional locations only populate `locations[]` entries, not re-run voice/tone analysis.
- **Partial warmup failures with multi-location are more common** — Apify can fail for one place_id and succeed for others. → **Mitigation:** per-location status in the `locations[]` entries (`warmup_status: "ready" | "failed"`). A single failure doesn't tank the whole warmup; the location is written with `stale: true` and can be re-synced manually.
- **`identity.business` vs `locations[0]` drift.** If a warmup re-runs and the order changes, `business` could point to a different primary. → **Mitigation:** primary is designated explicitly via `is_primary: true` (not just array position). On re-warmup, primary is preserved by `place_id` match, not index.

**Blast radius:**
- New fields on `content_essentials` — additive, no existing consumers to break.
- Hours rendering — UI-only, additive.
- `/contact` rule — prompt change affects every future page generation (existing pages unaffected). Validator warning, not hard reject — no rejection pressure on the pipeline.
- Import pipeline — net-new code path, doesn't touch existing posts-create flow.
- **Multi-location** — new `identity.locations[]` array and new `selected_place_ids text[]` column on `website_builder.projects`. `business` stays untouched so every existing consumer continues to read the primary's data. The warmup code path changes (adds a parallel loop for non-primary place_ids), but the primary-only code path is preserved for projects that don't opt in.

**Pushback:**
- **Multi-location is in scope, but with a clear primary/secondary split.** `identity.business` stays the single source of truth for "the business" so no existing code changes. `identity.locations[]` is the full list and powers the new Locations tab + Location post import. Prompts and templates still read `business` — wiring templates to render "all locations" is a follow-up, not this plan.
- **Should import pipeline live in Posts tab or Identity modal?** User asked for it in Posts. Agree — Posts tab is where post creation lives, so the import UX belongs there. Identity modal just surfaces the lists.
- **Identity becomes two classes of data: things we own (hours, logo, locations) vs things we track (doctors, services).** That's fine, but we should be honest in the UI — "Doctors" and "Services" tabs show a "Last synced" pill and a "URLs we're tracking" subtitle to manage expectations. Locations show real-time GBP-backed data so they don't need the same framing.

## Tasks

Dependency-aware grouping. **Wave 1 (parallel):** A, B, C, F1–F2. **Wave 2 (parallel):** D, E, F3–F4.

- Group A — Hours rendering (T1). Standalone.
- Group B — `/contact` CTA rule (T2, T3). Standalone.
- Group C — Doctor/service lists (T4, T5, T6). T4 → T5 → T6 sequential.
- Group F — Multi-location (F1, F2, F3, F4). F1 → F2 sequential; F3 depends on F2; F4 depends on F2 and T8.
- Group D — Identity modal tabs (T7). Depends on C + F2.
- Group E — Post import pipeline (T8, T9). T8 → T9 sequential. T9 reads doctor/service/location lists (C + F2).

### Group A — Hours in Summary tab (standalone)

#### T1: Render business hours in identity Summary
**Do:** Locate the identity Summary tab component (likely `frontend/src/components/Admin/IdentityModal.tsx` or a `ProjectIdentityPanel*.tsx` sibling). Add a "Hours" row under Business, formatting the GBP `openingHours` structure as a 7-day list (Mon–Sun). If hours are missing, render a muted "Not provided" row — don't hide the field. Normalize common GBP shapes (array of strings, `periods[]` object with weekday/open/close) in a local helper.
**Files:** Whichever file holds the Summary tab (find during execution via `grep "BUSINESS" + "Phone" + "Rating"` in `frontend/src/components/Admin/`).
**Depends on:** none.
**Verify:** Manual — open identity modal on a project with hours → Mon–Sun list renders in Business block.

---

### Group B — `/contact` CTA enforcement (standalone)

#### T2: Canonical CTA rule in builder prompts
**Do:** In `src/agents/websiteAgents/builder/ComponentGenerator.md` and `LayoutGenerator.md`, add a rule under Links:
> **Conversion CTAs.** Buttons, action links, and "call to action" elements (labels like "Schedule", "Book", "Contact", "Get Started", "Request a Consultation") MUST point to `/contact`, `tel:<phone>`, `mailto:<email>`, or a same-page `#` anchor. Never invent a path. Never use `href="#"` as a placeholder. Navigation links (services, about, home) are not CTAs and follow the existing link rules.
**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`, `src/agents/websiteAgents/builder/LayoutGenerator.md`.
**Depends on:** none.
**Verify:** Regenerate a page → CTAs in hero/header all resolve to `/contact` / `tel:` / `mailto:`.

#### T3: Validator warning for off-pattern CTAs
**Do:** Add `checkCtaPaths(html)` to `src/utils/website-utils/htmlValidator.ts`. Heuristic for "is this a CTA":
- `<a>` or `<button>` whose class list contains any of: `rounded-full`, `btn`, `cta`, or
- whose visible text matches `/\b(schedule|book|contact|get started|request|consult|appointment)/i`.

For each CTA, extract `href`. Fail allowed if:
- Starts with `/contact` (with or without trailing path/query/hash).
- Starts with `tel:`, `mailto:`.
- Starts with `#` AND matches a visible `id=` in the same HTML blob.
- Absolute URL (`http://`, `https://`).

Anything else → warning: "CTA points to `{href}` — conversion CTAs should use `/contact`, `tel:`, or `mailto:`."
**Files:** `src/utils/website-utils/htmlValidator.ts`.
**Depends on:** none (T2 is prompt, T3 is lint — both additive).
**Verify:** Feed a hand-written HTML blob with a CTA pointing to `/book-now` into `validateHtml` → warning fires.

---

### Group C — Doctor/Service lists in identity (core)

#### T4: Extend identity schema — doctors, services, locations
**Do:** In `src/controllers/admin-websites/feature-utils/util.identity-context.ts`, extend `ProjectIdentity` with:

```ts
content_essentials?: {
  // ... existing fields
  doctors?: Array<{
    name: string;
    source_url: string | null;
    short_blurb: string | null;
    last_synced_at: string; // ISO timestamp
    stale?: boolean;
  }>;
  services?: Array<{
    name: string;
    source_url: string | null;
    short_blurb: string | null;
    last_synced_at: string;
    stale?: boolean;
  }>;
};

// Top-level field, sibling to `business`
locations?: Array<{
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  website_url: string | null;
  hours: unknown; // GBP openingHours shape
  last_synced_at: string;
  is_primary: boolean;
  warmup_status: "ready" | "failed" | "pending";
  warmup_error?: string;
  stale?: boolean;
}>;
```

No migration needed — JSONB is schemaless. Add a short section to `buildStableIdentityContext` under CONTENT ESSENTIALS listing doctor/service names as bullet points so the AI knows about them without needing full URLs. Locations are NOT surfaced in the stable context — prompts read `business` as today.
**Files:** `src/controllers/admin-websites/feature-utils/util.identity-context.ts`.
**Depends on:** none.
**Verify:** `npx tsc --noEmit` clean. Feed a synthetic identity with 2 doctors + 3 services + 2 locations into `buildStableIdentityContext` and eyeball the output — should mention doctors/services, NOT iterate locations.

#### T5: Extract doctor/service lists during warmup
**Do:** In `service.identity-warmup.ts`, during the `distillContent` Claude call, add two new structured outputs: `doctors: Array<{name, source_url, short_blurb}>` and `services: Array<{name, source_url, short_blurb}>`. Drive this from the already-scraped `discovered_pages[]` + the distillation LLM.

Rules for the LLM:
- Only include doctors/services explicitly named on the site. No invention.
- `source_url` must be a real URL from the discovered-pages array.
- Short blurb ≤ 200 chars.
- Cap at 50 entries per list.

On write: stamp `last_synced_at = new Date().toISOString()` for every entry.
**Files:** `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`, the Claude distillation prompt file if it's separate.
**Depends on:** T4.
**Verify:** Warmup a project with a public doctors/services page → `identity.content_essentials.doctors` + `.services` populate.

#### T6: Manual re-sync endpoint
**Do:** New `POST /api/admin/websites/:projectId/identity/resync-list` with body `{list: "doctors" | "services"}`. Handler re-runs the same extraction logic from T5 against the existing `discovered_pages` (no re-scrape of source site unless explicitly requested via `?rescrape=true` query). Updates `last_synced_at` per entry. Returns the updated list.

On re-sync: if an existing entry's `source_url` is not in the re-extracted set, mark `stale: true` rather than removing it.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts` (new handler), `src/routes/admin/websites.ts` (route registration).
**Depends on:** T5.
**Verify:** `curl -X POST /api/admin/websites/{id}/identity/resync-list -d '{"list":"doctors"}'` returns updated list with fresh timestamps.

---

### Group F — Multi-location (depends on C for schema awareness)

#### F1: `selected_place_ids` column on projects
**Do:** New migration adding `selected_place_ids TEXT[]` (Postgres array) to `website_builder.projects`, default `'{}'`. On migrate-up, backfill existing rows: if `selected_place_id` is set, write `selected_place_ids = ARRAY[selected_place_id]`. Keep `selected_place_id` as a convenience pointer to the primary (redundant but preserves existing call sites).

Add a `primary_place_id TEXT` column too, backfilled from `selected_place_id`. This makes "which location is primary" explicit even when array order shifts.
**Files:** `src/database/migrations/{YYYYMMDDHHMMSS}_add_multi_location_to_projects.ts`; scaffold in `plans/.../migrations/pgsql.sql` + `mssql.sql` + `knexmigration.js`.
**Depends on:** none.
**Verify:** `npm run db:migrate:status` shows pending → apply → `\d website_builder.projects` shows new columns. Spot-check existing rows backfilled correctly.

#### F2: Multi-location warmup
**Do:** In `service.identity-warmup.ts`, add a parallel loop that scrapes every `selected_place_ids[i]` via Apify (same client used today for the primary). Concurrency limit of 3. For each result:
- Build the location entry using the same GBP → business mapping helper already in the warmup code.
- Mark the entry with `is_primary: true` iff `place_id === project.primary_place_id` (fallback: the first in the array).
- Stamp `last_synced_at = now`.
- On Apify error: write an entry with `warmup_status: "failed"`, `warmup_error: <message>`, `stale: true`. Don't throw.

Primary location continues to drive the `identity.business` field + archetype classification + content distillation (no change to those code paths). Non-primary locations only populate `identity.locations[]`.

The existing `selected_place_id` code path still works unchanged — if `selected_place_ids` is empty, warmup falls back to the single-place path.
**Files:** `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`.
**Depends on:** F1, T4.
**Verify:** Warm up a project with `selected_place_ids = [placeA, placeB]` → `identity.business` matches placeA (primary), `identity.locations` has 2 entries with `is_primary: true` on placeA.

#### F3: Add/remove locations UI
**Do:** New "Locations" tab in the IdentityModal (placed after Services in the tab order). Renders:
- Header: `{N} location(s)` + `Add Location` button.
- List: each location entry shows name, address, phone, rating, `Last synced`, `Primary` badge if `is_primary`.
- Per-row actions: `Set as primary`, `Re-sync`, `Remove` (disabled on the primary).
- Add Location button opens the same GBP search modal used during onboarding (reuse the existing component). On select: POST to `/api/admin/websites/:projectId/locations` with `{place_id}` → backend appends to `selected_place_ids`, triggers a targeted warmup for that place_id only, returns the updated locations array.
- Set as primary: PATCH `/api/admin/websites/:projectId/locations/primary` with `{place_id}` → updates `primary_place_id` + flips `is_primary` flags in `identity.locations[]` + rewrites `identity.business` from the new primary. Warn with a confirm dialog: "This changes the main business data the AI uses for every page. Regenerate affected pages after switching."
- Remove: DELETE `/api/admin/websites/:projectId/locations/:place_id` → drops from `selected_place_ids` + removes from `locations[]`.

Backend handlers for the three endpoints live in `AdminWebsitesController.ts`, routes in `routes/admin/websites.ts`.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx` (or identity panel file), `frontend/src/components/Admin/GbpLocationSearch.tsx` if a reusable one exists or extract from CreatePageModal's GBP search, `frontend/src/api/websites.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/routes/admin/websites.ts`.
**Depends on:** F2.
**Verify:** Manual — add a second location via GBP search → list shows both → set the new one as primary → identity.business updates → remove the secondary → list back to 1.

#### F4: Location post-type import support
**Do:** Extend T8's import pipeline to recognize `postType === "location"`. For location entries, skip the URL scrape + extraction step entirely — location data is already structured in `identity.locations[]`. Pipeline for each selected location:
1. Match by `place_id` → skip if existing post has `source_url = place_id` (we overload `source_url` to store the place_id for locations, keeping the column TEXT).
2. Build post content from structured fields: title = `name`, content = formatted markdown (`**Address:** ...\n**Phone:** ...\n**Hours:** ...`).
3. If the GBP scrape captured a hero image or photo URL on the location, download to S3 → `featured_image`.
4. Insert post row.

UI in T9 renders the location list (instead of doctor/service list) when `postType === "location"`, using address + phone + primary badge as the per-row preview instead of URL + blurb.
**Files:** `src/controllers/admin-websites/feature-services/service.post-importer.ts` (extended from T8), `frontend/src/components/Admin/ImportFromIdentityModal.tsx` (extended from T9).
**Depends on:** T8, F2.
**Verify:** Add 2 locations → Posts tab → Location type → Import from Identity → pick both → posts created with address/phone/hours in content, featured_image set if GBP returned a photo.

---

### Group D — Identity modal Doctors/Services tabs (depends on C + F)

#### T7: Three new tabs in IdentityModal
**Do:** Add "Doctors", "Services", and "Locations" tabs to the identity modal tab bar (after Chat Update, before Re-run warmup). Each tab renders:
- Header: `List last synced {humanizeTimestamp(most_recent_in_list)}` + `Re-sync` button (for doctors/services) or `Add Location` button (for locations — handled by F3).
- Body: table-style list. Doctors/services show name, source URL (external link), short blurb, per-row `Last synced`, `stale` badge if set. Locations show name, address, phone, primary badge, per-row `Last synced`.
- Empty state: doctors/services → "Warmup didn't find any {doctors|services} on the site — they may live on a page that wasn't discovered. You can still add them manually via the Posts tab." Locations → "No locations yet. Click Add Location to import from Google Business Profile."

API: new `fetchProjectIdentityList(projectId, list)` + `resyncProjectIdentityList(projectId, list)` in `frontend/src/api/websites.ts` for doctors/services. Locations use F3's endpoints.

**Note:** Doctors and Services tab bodies are implemented in T7. Locations tab body is implemented in F3 (Add Location flow, primary switching, remove). T7 adds only the tab button + empty-state shell for Locations; F3 fills it in.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx` (or the identity panel file), `frontend/src/api/websites.ts`.
**Depends on:** T6 (for doctors/services data); F3 collaborates on the Locations body.
**Verify:** Manual — open identity modal → three new tabs appear → lists render → Re-sync updates timestamps → Locations tab shows entries after F3 Add Location.

---

### Group E — Import-from-Identity in Posts tab (depends on C)

#### E1 is heavy and warrants splitting:

#### T8: Import pipeline service
**Do:** New `src/controllers/admin-websites/feature-services/service.post-importer.ts` exposing `importFromIdentity(projectId, {postType: "doctor" | "service", entries: string[] /* source_urls to import */, overwrite?: boolean})`. Pipeline per entry:
1. Fetch source URL via existing `service.url-scrape-strategies.ts` stack (fetch → browser → screenshot fallback).
2. Parse: extract main content text, first meaningful image `src`. Use cheerio.
3. If image found: download with content-type + size guards, `uploadToS3` via `buildMediaS3Key(projectId, "post-images/{hash}")`.
4. Insert row into `website_builder.posts` with: `post_type_id`, `project_id`, `title = entry.name`, `content = extracted_text`, `featured_image = s3_url || null`, `source_url = entry.source_url`, `status = "draft"`.
5. On duplicate `source_url` for same project + post_type: skip unless `overwrite=true`.

Returns per-entry `{source_url, status: "created" | "skipped" | "failed", post_id?, error?, used_fallback?}`.

Enqueue as a BullMQ job so long scrapes don't block the HTTP request.
**Files:** `src/controllers/admin-websites/feature-services/service.post-importer.ts` (new), `src/workers/processors/postImporter.processor.ts` (new BullMQ processor), `src/database/migrations/{next-timestamp}_add_source_url_to_posts.ts` (add `source_url TEXT` column + unique index on `(project_id, post_type_id, source_url)`).
**Depends on:** none within this plan, but logically after T5 (so entries exist to import).
**Verify:** Curl or invoke handler with a list of URLs → BullMQ processes → posts rows appear with S3 image URLs + original content.

#### T9: Posts tab "Import from Identity" UI
**Do:** In `PostsTab.tsx`, when the active post type is `doctor`, `service`, or `location`, add an "Import from Identity" button in the toolbar next to the existing Create button. Clicking opens a modal:
- Title: "Import {Doctors | Services | Locations} from Identity"
- Subtitle: doctors/services → "Pick which entries to import. We'll fetch each page, download images, and create draft posts." Locations → "Pick which locations to import. Content is built from the structured GBP data — no scraping needed."
- List:
  - **Doctors/Services:** checkbox per entry from `identity.content_essentials.doctors` / `.services` with name + source_url + last_synced_at.
  - **Locations:** checkbox per entry from `identity.locations` with name + address + primary badge + last_synced_at.
- Entries already imported (matching `source_url` in existing posts — or `place_id` for locations) show a "Already imported — overwrite" toggle per row instead of a checkbox.
- Footer: "Import {N} selected" button → fires T8 endpoint with `postType` → closes modal + shows a toast "Import started. We'll let you know when it's done." Subscribes to the BullMQ job status via an existing polling hook (same pattern as page generation polling) and on completion shows a results panel: `3 created, 1 skipped (duplicate), 2 failed (scrape blocked)`. Per-failed row has a Retry button.
**Files:** `frontend/src/components/Admin/PostsTab.tsx`, new `frontend/src/components/Admin/ImportFromIdentityModal.tsx`, `frontend/src/api/websites.ts` (new `importPostsFromIdentity` + status poll endpoint).
**Depends on:** T8 (doctors/services), F4 (locations).
**Verify:** Manual — open Posts tab → Doctor/Service/Location type → click Import → pick 3 → watch toast → results panel shows outcomes.

## Done
- [ ] `npx tsc --noEmit` in both `/` and `/frontend` — zero (a)-class errors.
- [ ] `npm run db:migrate` applies F1 migration (multi-location columns) + T8 migration (posts.source_url) cleanly; existing projects backfilled.
- [ ] Warmup a new project with a public doctors/services page → `identity.content_essentials.doctors` + `.services` populate, each row stamped `last_synced_at`.
- [ ] Warmup with `selected_place_ids` of length 2 → `identity.locations` has 2 entries, one flagged `is_primary`, `identity.business` reflects the primary.
- [ ] Identity modal renders Hours row under Business (or "Not provided" for projects without).
- [ ] Identity modal Doctors tab lists entries with source URLs clickable and per-row sync timestamps.
- [ ] Identity modal Locations tab lists entries with address/phone/primary badge and Add/Set-Primary/Remove actions.
- [ ] Re-sync button on Doctors tab updates timestamps and marks missing entries `stale`.
- [ ] Set-as-primary on a secondary location → `identity.business` updates, confirm dialog warns about regeneration.
- [ ] Posts tab shows "Import from Identity" button on Doctor + Service + Location post types.
- [ ] Doctor/service imports scrape URLs, download images to S3, mark duplicates as skipped, report failures per-row.
- [ ] Location imports build post content from GBP data without scraping, include featured_image if GBP returned a photo.
- [ ] Generate a new page → CTAs point only to `/contact`, `tel:`, `mailto:`, or same-page anchors.
- [ ] Validator run against a page with a bad CTA fires the warning.
- [ ] No regression: existing warmup flows (single-location), existing post creation, existing page generation still work.

## Revision Log

### Rev 1 — 2026-04-18 (pre-execution)
**Change:** Multi-location pulled in from follow-up to this plan (user decision — wants location post import alongside doctor/service import). New Group F (F1–F4) added. T7 extended to include Locations tab. T8/T9 extended to support `location` post type. Hard caps increased per user request.

**Why:** Admin wants one coherent "identity enrichment" pass that covers everything visible in the Project Identity modal + all three importable post types (doctor/service/location).

**New approach:**
- `identity.locations[]` as a top-level identity field. `identity.business` stays as the primary pointer so existing consumers don't break.
- `selected_place_ids TEXT[]` + `primary_place_id TEXT` on `website_builder.projects`. Existing `selected_place_id` column preserved as a sync'd convenience pointer.
- Warmup scrapes N place_ids in parallel (concurrency 3), primary location drives archetype/distillation, secondaries only populate `locations[]`.
- Location post import uses structured GBP data — no URL scrape needed.
- Hard caps bumped: 100 entries per doctor/service list (was 50), 20 locations per project (new), 400-char blurbs (was 200), 15 MB image cap (was 10).

**Updated Done criteria:** added multi-location warmup checks, Locations tab checks, set-as-primary check, location post import check. Existing doctor/service checks retained.

**Risk level:** bumped from 2 → 3 (multi-location is a structural addition to warmup + identity shape, even with back-compat guarantees).
