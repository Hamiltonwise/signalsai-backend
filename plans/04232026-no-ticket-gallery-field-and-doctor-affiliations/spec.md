# Gallery Custom Field Type + Doctor Affiliations Prefill

## Why

The doctors single-post template (template `2d325d15-bcdb-4157-b983-3d7b21f72b82`) hardcodes two `<a><img>` blocks for AAE (American Board of Endodontics) and VDA (Virginia Dental Association) logos directly in the `single_template` markup. This template is used by 7 projects including orthodontic practices and non-VA endodontic practices. Every doctor on every site using this template renders the same two logos regardless of whether they hold those credentials — an accuracy issue with compliance exposure for medical/dental practices.

The root cause: the custom field system only supports scalar types (`text`, `textarea`, `media_url`, `number`, `date`, `boolean`, `select`). There is no way to store an authored array of image items, with per-item optional link, per a given doctor. The template author had to hardcode the logos to get any visual output at all.

## What

1. A new custom field type `gallery` whose value is an ordered array of `{ url, link?, alt, caption? }` items.
2. Shortcode grammar extension (`{{start_gallery_loop field='X'}}…{{end_gallery_loop}}` + `{{item.X}}` tokens + `{{if item.X}}…{{endif}}`) so templates can iterate a gallery field and define per-item layout inline.
3. An admin UI input for authoring gallery values (picker rows with add/remove/reorder + per-item link/alt/caption).
4. A data migration that: (a) adds an `affiliations` gallery field to the Doctors post-type schema on template `2d325d15-…`, (b) swaps the hardcoded AAE+VDA markup in that template's `single_template` for the new subloop, and (c) prefills the `affiliations` value with both AAE and VDA for the 8 published One Endodontics doctors only.

**Done =** admin can define a gallery field on any post type, author gallery values on a post, and have the renderer emit the template-authored layout with optional per-item links. The 8 One Endodontics doctors retain their current two-logo rendering. Doctors on the other 6 projects using this template render no affiliations section (section hidden) until someone adds data.

## Context

**This is a two-repo change.** Admin authoring lives in `alloro`; public-site rendering lives in `/Users/rustinedave/Desktop/website-builder-rebuild/`. A third duplication exists in the admin preview code path. All three copies of shortcode logic must be updated in lockstep or `/doctors/<slug>` pages will render `{{start_gallery_loop …}}` as literal text.

**Relevant files — alloro (this repo):**
- `src/controllers/admin-websites/feature-services/service.post-type-manager.ts:27-42` — `VALID_FIELD_TYPES` set; schema validation entry point
- `src/controllers/admin-websites/feature-services/service.post-manager.ts:124-188, 261-267` — post CRUD; custom_fields JSONB (no value-shape validation today — trusted input)
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts:256-426` — conditional engine + `renderPostBlock`; used by post_block shortcodes on page bodies and by admin previews
- `src/models/website-builder/PostTypeModel.ts:10-17` — `single_template` and `schema` typed as `unknown[]`/`Record<string,unknown>`
- `frontend/src/components/Admin/PostBlocksTab.tsx:34-42` — `FIELD_TYPES` dropdown the admin uses to pick a field type; also contains a duplicate of `processConditionals` for editor preview (per the NOTE at `shortcodeResolver.service.ts:265-267`)
- `frontend/src/components/Admin/PostsTab.tsx:114-236, 1113-1211` — `MediaPickerField` component + the per-field editor switchboard
- `frontend/src/api/posts.ts:19, 113, 130` — `PostType` interface; schema/single_template shape as sent to API

**Relevant files — website-builder-rebuild (separate repo):**
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/utils/shortcodes.ts` — public-site shortcode resolver; must mirror alloro's new grammar
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts:200-230` — dispatches single-post rendering using the post type's `single_template`
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/services/singlepost.service.ts` — loads post + post type for `/doctors/<slug>`

**Patterns to follow:**
- Data migration: seed-style Knex migration that UPDATEs JSONB (e.g., `src/database/migrations/20260319000001_seed_dental_review_blocks.ts`). Down migration should be a best-effort revert.
- Shortcode loop: current `{{start_post_loop}}…{{end_post_loop}}` in `renderPostBlock` at `shortcodeResolver.service.ts:331-426` — same shape, different data source.
- Field-type editor branch: existing cases in `PostsTab.tsx:1131-1204` (textarea, boolean, select, number, date, media_url).

**Reference files (pattern conformance):**
- `MediaPickerArrayField` (new): model on `MediaPickerField` at `frontend/src/components/Admin/PostsTab.tsx:114-236`. Match file location (inline in PostsTab.tsx or new sibling file — prefer new sibling file for isolation), export style, props convention, library/upload integration via `MediaBrowser`.
- Gallery loop pass (new): model on `renderPostBlock` at `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts:331-426` — extract before/body/after slices, iterate items, apply token replacement per item, concat.
- Item-scope conditional pass (new): model on `processConditionals` at `shortcodeResolver.service.ts:297-329` — same flat-only invariant, but the namespace is `item.*` and the value source is the current array item, not `post` or `customFields`.

**Key landmines to design around (non-obvious from a casual read):**
1. `processConditionals` is **flat-only** (`shortcodeResolver.service.ts:304-313`). Nested `{{if}}` aborts the pass with a warning. Therefore the gallery-loop pass **must run before** `processConditionals` so that any `{{if item.X}}` inside the loop body is fully resolved into plain HTML first. The outer `{{if post.custom.affiliations}}` is then the only remaining conditional — flat.
2. `isConditionalValueEmpty` at `shortcodeResolver.service.ts:276-278` treats `null | undefined | ""` as empty but **not** `[]`. An empty gallery would currently keep its surrounding `{{if}}` block, rendering an empty labeled section. The check must be extended to treat `Array.isArray(v) && v.length === 0` as empty.
3. Existing scalar custom-field replacement at `shortcodeResolver.service.ts:412-420` does `escapeHtml(String(val))`. A gallery value passed to this path without the loop would emit `[object Object],[object Object]`. The gallery-loop pass must consume the gallery tokens before this replacement runs; additionally, the scalar path should skip non-primitive custom-field values (emit empty string) to fail silent rather than ugly.

## Constraints

**Must:**
- Keep all three shortcode-logic locations in sync (alloro resolver, rebuild resolver, frontend preview). Update all three in the same spec execution.
- Match existing template conventions: `rel="noopener noreferrer"` on linked items (that's what the template already uses); `target="_blank"` for links; layout is always the template author's responsibility, never baked into the field type or render pass.
- Preserve the flat-only invariant of `processConditionals`. Do not introduce generic nested-conditional support as part of this change.
- Use Knex data migration for the content updates (matches `20260319000001_seed_dental_review_blocks.ts` precedent).
- Author new admin components to be project-agnostic. `affiliations` must be a generic field slug like any other — nothing in the code should special-case it.

**Must not:**
- Introduce any new npm dependency.
- Refactor adjacent custom-field handling beyond what this change requires (no drive-by cleanup of `media_url`, no renaming of existing types).
- Break scalar custom fields — any post without gallery fields must render identically to today.
- Hardcode the prefill logo URLs anywhere beyond the migration file itself. Post-migration, those URLs must live in `posts.custom_fields.affiliations` JSONB only.
- Prefill anything outside the 8 One Endodontics doctors.

**Out of scope:**
- Generalized repeater field (FAQs, testimonials, etc.) — this change only ships `gallery`. The grammar is designed to generalize but the type name and UI are image-gallery-specific.
- Drag-to-reorder in the admin UI — add/remove + up/down buttons are sufficient for v1. Revisit later if the content team complains.
- Image lightbox / carousel behaviors — layout is 100% template-author's call.
- Cross-repo CI orchestration — deploy sequencing is a release-time concern, not a spec concern. Spec covers what files change.
- Updating templates other than `2d325d15-…` — if other templates have similar hardcoded affiliations, that's a follow-up.

## Risk

**Level:** 3 (Structural Risk)

**Risks identified:**

- **R1: Shortcode grammar extension affects every rendered page on every Alloro client site.** The gallery-loop pass and the item-scope conditional pass both execute inside `renderPostBlock`, which serves all post blocks on all sites. A regex bug cascades instantly.  
  → **Mitigation:** Add unit tests covering (a) 0 items, (b) 1 item with no link, (c) N items mixed link/no-link, (d) malformed item values, (e) the exact markup this spec produces. Tests must live next to the resolver file in both repos. Integration-verify against one real One Endodontics doctor post in dev before deploying.

- **R2: Three-location logic duplication already exists and is flagged as brittle in-code (`shortcodeResolver.service.ts:265-267`).** Adding a new grammar in three places triples the drift risk.  
  → **Mitigation:** Each task that touches one location names the other two in its `Do` block, and the Post-Execution Summary lists all three files under "Files changed" — skipping any one is a visible failure. Longer-term consolidation is out of scope.

- **R3: Deploy sequencing.** If the template `single_template` update lands before the resolver change is live in the rebuild repo, `/doctors/<slug>` pages render `{{start_gallery_loop field='affiliations'}}` as literal visible text on 7 live sites.  
  → **Mitigation:** Single Knex migration runs at deploy time. The resolver changes in both repos must be deployed first (rebuild repo → alloro repo → migration runs). Execution summary must spell out this order. No migration-first deploy under any circumstances.

- **R4: Accuracy regression on non-One-Endodontics projects.** The other 6 projects currently show AAE+VDA on every doctor. Post-migration they show nothing. That's the correct fix, but it is a visible change users will notice.  
  → **Mitigation:** Communicated and accepted (user direction). Only prefill One Endodontics. Other practices can author their own affiliations through the new UI.

- **R5: ABE Board Certified credential accuracy for the 8 One Endodontics doctors.** User has accepted the prefill of AAE+VDA on all 8. We're preserving current visual state, which the user has signed off on.  
  → **Mitigation:** User decision on record. The admin UI lets the practice trim per-doctor post-launch.

- **R6: The flat-only conditional invariant (`processConditionals` at `shortcodeResolver.service.ts:304-313`) would bail on the nested-looking `{{if post.custom.affiliations}} … {{if item.link}}…{{endif}} … {{endif}}` structure if run naively.** The gallery-loop pass must fully resolve inner `{{if item.X}}` tokens to HTML **before** the outer `{{if post.X}}` pass runs.  
  → **Mitigation:** Task ordering: new gallery-loop pass runs as Step A, `processConditionals` stays as Step B. Tests include this exact nesting shape to prove the outer conditional still evaluates correctly.

**Blast radius:**

- `alloro` backend: `service.post-type-manager.ts` (type whitelist), `shortcodeResolver.service.ts` (new pass + empty-array fix), `PostTypeModel.ts` (type shape). Consumers: all admin API surface area for post types + all admin previews of post blocks + all page-body post_block shortcodes on user sites.
- `alloro` frontend: `PostBlocksTab.tsx` (dropdown + duplicated conditional logic), `PostsTab.tsx` (switchboard), one new component file. Consumers: every admin user authoring post types, post-type schemas, and posts.
- `website-builder-rebuild`: `src/utils/shortcodes.ts` (mirror pass). Consumer: every published `/doctors/<slug>` (and by extension every single-post page for any post type on any site).
- Data: 1 post-type row (doctors on template `2d325d15-…`), 8 post rows (One Endodontics doctors' `custom_fields`). No schema (DDL) changes — all JSONB content updates.

**Pushback (from planning conversation):**  
I recommended prefilling only VDA on all 8 and AAE on an explicit subset because `ABE_BoardCertifiedLogo` is a real credential, not a general association logo. User accepted the risk and directed prefill of both on all 8. Noted here so a future reader understands this wasn't an oversight.

## Tasks

Dependency graph summary (for parallel orchestration):
- **Group A (backend grammar — parallel):** T1, T2, T3, T4
- **Group B (frontend UI — parallel, independent of A):** T5, T6
- **Group C (integration):** T7 depends on T5+T6
- **Group D (data — must deploy after A,B,C are live):** T8
- **Group E (verification):** T9 depends on all above

---

### T1: Register `gallery` as a valid custom-field type (alloro backend)
**Do:**
- Add `"gallery"` to the `VALID_FIELD_TYPES` set at `src/controllers/admin-websites/feature-services/service.post-type-manager.ts:27-35`.
- In `validateSchema` (same file, ~lines 46-96), no new per-field-config validation required — `gallery` has no extra schema-level config (unlike `select` which needs `options`). Add a single-line comment in the switch/chain that says "gallery has no additional schema config" to prevent future drift.
- In `src/controllers/admin-websites/feature-services/service.post-manager.ts:124-188` (post create) and `:261-267` (post update), add a minimal boundary check for gallery values: if a schema field is declared `gallery` and the incoming value is present but not `Array.isArray(value)`, reject with a 400. Items themselves are trusted (admin UI shape). No deep validation of item shape; malformed items render as empty strings via the resolver's skip-non-primitive rule in T2.
- Update `src/models/website-builder/PostTypeModel.ts:10-17` to narrow the `schema` field's type union so `gallery` is a recognized literal (add it to the discriminated union if one exists; otherwise leave as-is and add a code comment documenting the gallery shape).

**Files:** `src/controllers/admin-websites/feature-services/service.post-type-manager.ts`, `src/controllers/admin-websites/feature-services/service.post-manager.ts`, `src/models/website-builder/PostTypeModel.ts`  
**Depends on:** none  
**Verify:** `npx tsc --noEmit`; unit test that posting a post with `custom_fields.affiliations: "not-an-array"` returns 400; posting `custom_fields.affiliations: []` succeeds.

---

### T2: Add gallery-loop + item-conditional passes to alloro shortcode resolver
**Do:**
- In `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`, add a new function `renderGalleryLoops(html, customFields)` that:
  - Scans for `{{start_gallery_loop field='<slug>'}}…{{end_gallery_loop}}` (regex: `/\{\{\s*start_gallery_loop\s+field='([a-z0-9_-]+)'\s*\}\}([\s\S]*?)\{\{\s*end_gallery_loop\s*\}\}/gi`).
  - For each match: read `customFields[slug]`; if not an array or empty, replace the whole block with `""`; else iterate items, producing per-item HTML by running an `item`-namespace conditional pass (new function `processItemConditionals(body, item)` mirroring `processConditionals` but scoped to `item.*`), then replacing `{{item.url}}`, `{{item.link}}`, `{{item.alt}}`, `{{item.caption}}` with escaped values (empty string for missing keys).
  - Concatenate per-item results with newline, replace the whole block with that concatenation.
- In `renderPostBlock` (line 331-426), call `renderGalleryLoops(template, customFields)` as **Step A**, **before** `processConditionals` (Step B, unchanged) and before the existing scalar token replacement (unchanged). Preserves ordering: inner `{{if item.X}}` fully resolved → flat HTML → `processConditionals` sees only `post.*` conditionals.
- Extend `isConditionalValueEmpty` (line 276-278) to also treat `Array.isArray(v) && v.length === 0` as empty. This fixes `{{if post.custom.affiliations}}` on posts with `[]` values.
- Harden the existing scalar custom-field replacement at lines 412-420: if `val` is non-null but not a primitive (object/array), return `""` rather than coercing to string. Rationale: the gallery-loop pass consumed any valid gallery tokens already; anything reaching this replacement with a non-primitive value is a bug-emit scenario, and emitting `""` fails silently rather than visibly ugly.
- Update the `NOTE` comment at lines 265-267 to mention the gallery-loop pass must also be kept in sync across the three locations.

**Files:** `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`  
**Depends on:** none  
**Verify:** New unit tests in the same file's test neighbor (or added if absent): (a) 0-item gallery hides section via outer `{{if post.custom.X}}`, (b) 2-item mixed-link gallery emits the exact markup from the post-T8 template, (c) malformed item (`{ link: "x" }` missing `url`) emits empty `<img src="">` gracefully, (d) post with no gallery fields at all renders identically to pre-change. `npx tsc --noEmit`.

---

### T3: Mirror gallery-loop + item-conditional + empty-array fix in website-builder-rebuild
**Do:**
- In `/Users/rustinedave/Desktop/website-builder-rebuild/src/utils/shortcodes.ts`, port the exact same changes from T2:
  - New `renderGalleryLoops` function with identical regex and behavior.
  - Integration into the renderer's per-post pass, called before the existing conditional pass.
  - Empty-array fix for the existing conditional-empty check.
  - Scalar fallback hardening for non-primitive custom-field values.
- Do not reimplement differently — the two resolvers must produce byte-identical HTML for the same input. Copy the function body verbatim where the surrounding code allows; adjust only the import/export shape to match the rebuild repo's conventions.
- **Coordinate with T2.** If T2's resolver is revised during review, T3 must re-sync in the same commit.

**Files:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/utils/shortcodes.ts`  
**Depends on:** none (parallel with T2, but must be kept in lockstep)  
**Verify:** Same test cases as T2, ported to rebuild's test harness. Run the rebuild repo's build (`npm run build` or equivalent in that repo) — whatever tooling that repo uses; verify no TS errors introduced. Diff the gallery-loop function against alloro's copy; they should be structurally identical.

---

### T4: Update admin-preview conditional processor (frontend duplicate)
**Do:**
- In `frontend/src/components/Admin/PostBlocksTab.tsx`, locate the duplicated `processConditionals` logic referenced in the NOTE at `shortcodeResolver.service.ts:265-267`.
- Apply the empty-array fix (arrays of length 0 count as empty).
- Apply a minimal gallery-loop pass so admin previews render the new subloop correctly in the structured editor's preview pane. Can be a simplified port — it only needs to match server behavior visually, not be byte-identical. Missing items render as empty; conditional `{{if item.X}}` inside the loop body works.
- If the frontend preview is not materially consulted by the user (i.e., they work in Raw mode), this task may be scoped down to just the empty-array fix. Confirm at execution time by reading the current preview integration.

**Files:** `frontend/src/components/Admin/PostBlocksTab.tsx`  
**Depends on:** none (parallel)  
**Verify:** Load `PostBlocksTab`, open the Doctors single_template editor, preview shows post data correctly with the new subloop markup (after T8 lands the content). Before T8 lands, preview with manual markup matching the target shape.

---

### T5: Add "Gallery" option to the field-type dropdown
**Do:**
- In `frontend/src/components/Admin/PostBlocksTab.tsx:34-42`, append `{ value: "gallery", label: "Gallery" }` to `FIELD_TYPES`.
- In the same file's `updateSchemaField` (around line 337-359), `gallery` needs no per-field options/default scaffolding — leave the branch alone. The `delete updated.options` pattern at line 353-355 should remain so switching from `select` to `gallery` cleans up correctly.

**Files:** `frontend/src/components/Admin/PostBlocksTab.tsx`  
**Depends on:** none  
**Verify:** Open the schema editor for any post type, verify "Gallery" appears in the type dropdown, selecting it and saving persists `type: "gallery"` in the post-type schema (check via API response or direct DB query).

---

### T6: Build `MediaPickerArrayField` component
**Do:**
- Create `frontend/src/components/Admin/MediaPickerArrayField.tsx`.
- Export a default React component matching the signature:
  ```ts
  interface Props {
    projectId: string;
    value: Array<{ url: string; link?: string; alt: string; caption?: string }>;
    onChange: (next: Props["value"]) => void;
    label: string;
  }
  ```
- UI: a vertical stack of item rows. Each row has:
  - `MediaPickerField`-style thumbnail + `Browse Library` + `Upload` + `Paste URL` → writes to `url`.
  - `Link (optional)` text input → writes to `link`.
  - `Alt text *` text input (required in UI, but don't block save if empty — the render will just emit empty alt, which is a content issue, not a system error).
  - `Caption (optional)` text input → writes to `caption`.
  - Up / Down / Delete buttons.
- Bottom action: `+ Add item` button appends an empty row.
- Reference implementation: mirror the styling, button shape, and upload handler of `MediaPickerField` at `frontend/src/components/Admin/PostsTab.tsx:114-236` so the two UIs feel native to each other.
- **Do not** persist through its own API calls. The component is a controlled input; parent is responsible for save via the existing post-update flow.

**Files:** `frontend/src/components/Admin/MediaPickerArrayField.tsx` (new)  
**Depends on:** none  
**Verify:** Mount in isolation (storybook or a scratch page), add 3 items with mixed fields, confirm `value` callback receives the correct array shape. No TS errors.

---

### T7: Wire `gallery` into the post-editor switchboard
**Do:**
- In `frontend/src/components/Admin/PostsTab.tsx:1122-1207`, add a `field.type === "gallery"` branch just before the final `else` (plain text input). Render `<MediaPickerArrayField projectId={projectId} value={Array.isArray(value) ? value : []} onChange={(arr) => setFormCustomFields(prev => ({ ...prev, [slug]: arr }))} label="" />`.
- Import `MediaPickerArrayField` from T6.
- When loading an existing post whose `custom_fields[slug]` is `undefined`, default to `[]`. When saving, pass the array through unchanged — `JSON.stringify` in the post-manager (`service.post-manager.ts:188, 262`) handles serialization without modification.

**Files:** `frontend/src/components/Admin/PostsTab.tsx`  
**Depends on:** T5, T6  
**Verify:** Create a test post with a post type that has a `gallery`-type field, add 2 items, save, reload the editor, verify all fields round-trip. `npx tsc --noEmit`.

---

### T8: Data migration — schema, template markup, prefill
**Do:**
- Create `src/database/migrations/YYYYMMDDHHMMSS_add_affiliations_gallery_field_and_prefill_one_endo.ts` following the Knex data-migration pattern at `src/database/migrations/20260319000001_seed_dental_review_blocks.ts`.
- In the `up` function, execute three updates **in order**:

  **Step 1 — Add the `affiliations` field to the doctors post-type schema:**
  ```sql
  UPDATE website_builder.post_types
  SET schema = schema || '[{"name":"Professional Affiliations","slug":"affiliations","type":"gallery","required":false,"default_value":null}]'::jsonb
  WHERE id = 'f9e028e1-d753-4257-9bb6-306f50322e2b';
  ```
  Use `jsonb_set` / concatenation pattern consistent with prior seed migrations. **If the field already exists on the schema (idempotency guard), skip this update** — check via `jsonb_path_exists` or a subquery.

  **Step 2 — Update the template's `single_template` to use the subloop.** Fetch the current `single_template` value for the doctors post type, locate the hardcoded affiliations div (the outermost `<div class="w-full pt-6 border-t border-gray-100">` block containing both `<a>` tags), and replace it with the target shape from the Why/Context sections of this spec:
  ```html
  {{if post.custom.affiliations}}
  <div class="w-full pt-6 border-t border-gray-100">
    <p class="text-xs font-medium tracking-[0.18em] uppercase font-sans text-gray-400 text-center mb-5">Professional Affiliations</p>
    <div class="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-center gap-5 lg:gap-4 xl:gap-8">
      {{start_gallery_loop field='affiliations'}}
        {{if item.link}}<a href="{{item.link}}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center transition-all duration-300 hover:opacity-70 hover:scale-105">{{endif}}
          <img src="{{item.url}}" alt="{{item.alt}}" class="h-14 w-auto object-contain">
        {{if item.link}}</a>{{endif}}
      {{end_gallery_loop}}
    </div>
  </div>
  {{endif}}
  ```
  Do the string replacement via a regex or literal match inside the migration code (not a raw `REPLACE()` in SQL — too brittle). Read the JSONB, parse, mutate the `content` string for the `single-post` section, write back.

  **Step 3 — Prefill `custom_fields.affiliations` for the 8 One Endodontics doctors.** Hardcoded post IDs (captured during planning):
  ```
  d9ebfc01-2698-43c1-85f3-805e9e22b273  Dr. Ali Adil
  3e7605ca-b4be-48de-8522-b142171042bf  Dr. Eiman Khalili
  f3f35bfa-a1c3-4554-b166-be139638a741  Dr. Hashim Al-Hassany
  7337246c-0390-4919-b016-2f5b5adad0bd  Dr. James Lee
  9635ce07-c599-4dcf-8b3d-96c1873d6589  Dr. Maan Zuaitar
  4681d152-a438-4413-b24b-9eedf5f87290  Dr. Pei Wang
  25ab7a3a-f9c4-4031-a279-3128174d6593  Dr. Saif Kargoli
  edfd3e5b-9dc6-4a79-bbe2-186e5e5a76a8  Dr. Zied Diab
  ```
  Seed value (identical for all 8):
  ```json
  [
    {
      "url": "https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/7fb760c0-ABE_BoardCertifiedLogo_HIGH_RGB.webp.webp",
      "link": "https://www.aae.org/board/about-the-abe/",
      "alt": "American Board of Endodontics",
      "caption": ""
    },
    {
      "url": "https://alloro-main-bucket.s3.us-east-1.amazonaws.com/uploads/0dcad678-2845-4c20-a298-e9c62aed9ebc/88125724-VDA.webp.webp",
      "link": "https://www.vadental.org/",
      "alt": "Virginia Dental Association",
      "caption": ""
    }
  ]
  ```
  SQL:
  ```sql
  UPDATE website_builder.posts
  SET custom_fields = custom_fields || '{"affiliations": [...]}'::jsonb
  WHERE id IN (<8 IDs>);
  ```
  **Idempotency:** if `custom_fields -> 'affiliations'` already exists, skip that row. Log a summary to console.

- Implement a reasonable `down` migration: remove the `affiliations` key from the 8 posts; restore the hardcoded affiliations div in the template `single_template`; remove the schema field entry. If any step cannot be safely reversed (e.g., admins have authored other posts with gallery fields using the new type), the `down` should refuse and log. Document this explicitly in a comment at the top of the migration.

**Files:** `src/database/migrations/<timestamp>_add_affiliations_gallery_field_and_prefill_one_endo.ts` (new), scaffold copies in `plans/…/migrations/` (see below)  
**Depends on:** T1, T2, T3, T4 deployed and live on both repos. Running this migration before resolver changes go live will break `/doctors/<slug>` rendering across all 7 projects.  
**Verify:** Run migration against a dev DB restored from a prod snapshot. Verify (a) schema has new field, (b) `single_template` contains `start_gallery_loop`, (c) 8 One Endodontics doctors have 2-item affiliations arrays, (d) non-One-Endodontics doctors on this template are unchanged. Run `down`, verify everything restored. Run `up` again, verify idempotent.

---

### T9: Verification — full smoke test post-deploy
**Do:**
- Visit `https://1endodontics.com/doctors/dr-ali-adil` (or the equivalent preview URL). Verify two affiliation logos render with correct links and hover behavior. Inspect HTML — no `{{…}}` tokens leaking.
- Visit one doctor page on a non-One-Endodontics project (e.g., Artful Orthodontics). Verify the Professional Affiliations section is **absent** (not just empty).
- In the admin for any One Endodontics doctor, open the post editor. Verify the `affiliations` field renders via `MediaPickerArrayField` with the 2 prefilled items. Add a third item with no link, save, reload; verify persistence. Remove all items, save, reload; visit the public doctor page — section is hidden. Restore the 2 items.
- Run `npx tsc --noEmit` in both repos.
- Run the resolver unit tests in both repos.
- Log the result per doctor in the execution summary.

**Files:** none (verification only)  
**Depends on:** T1–T8  
**Verify:** Manual checklist completed; no visual regressions elsewhere; console clean.

## Done

- [ ] `npx tsc --noEmit` passes in alloro with zero new errors
- [ ] `npx tsc --noEmit` (or repo's equivalent) passes in website-builder-rebuild with zero new errors
- [ ] Resolver unit tests pass in both repos (new cases added per T2 and T3)
- [ ] Admin: can add a `gallery` field to any post type via the schema editor
- [ ] Admin: can author an arbitrary number of items in a gallery, each with optional link/caption, save, and round-trip correctly
- [ ] Admin: can remove/reorder items
- [ ] Public: the 8 One Endodontics doctor pages each render 2 affiliation logos with links to aae.org and vadental.org, matching pre-change visual state
- [ ] Public: doctors on the other 6 projects using template `2d325d15-…` render no Professional Affiliations section at all
- [ ] Idempotency: running the migration twice leaves the same final state
- [ ] Reversibility: `npx knex migrate:rollback` restores the pre-change template markup and removes the prefill values; verified on dev
- [ ] No regressions: doctors on these 7 projects still render bio/photo/request-appointment section identically to pre-change
- [ ] Empty-array case: a doctor with `affiliations: []` hides the section (proves the `isConditionalValueEmpty` fix works)
