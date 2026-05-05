# Staff Post Type + Grid Post Block + Single Page Template

## Why
The dental SEO template has `doctors`, `services`, and `locations` post types but no way to showcase non-clinical staff (hygienists, office managers, front desk coordinators, treatment coordinators, dental assistants). Practices want to highlight their full team, not just the providers. Staff members need a simpler presentation than doctors — no affiliations gallery, no extensive credentials — but they still need a grid listing and individual detail pages.

## What
A Knex migration that seeds onto the existing dental SEO template (`2d325d15-bcdb-4157-b983-3d7b21f72b82`):
1. A `staff` post type with a lighter schema than doctors
2. A `staff-grid` post block for listing staff in a card grid
3. A `single_template` for individual `/staff/<slug>` detail pages

Done when: the post type, post block, and single_template exist in the DB, the shortcode resolver and HTML normalizer recognize the `staff` type, and the frontend PostsTab renders staff posts correctly (no import-from-identity — staff are manually created, not scraped).

## Context

**Relevant files:**
- `src/database/migrations/20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts` — reference migration for modifying post types on this template
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — ALLORO_SHORTCODE vocabulary list (needs `staff` added to comment)
- `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts:208` — `SHORTCODE_TOKEN_BY_TYPE` map (needs `staff` entry)
- `src/controllers/admin-websites/feature-services/service.post-type-manager.ts` — CRUD for post types (no changes needed, generic)
- `frontend/src/components/Admin/PostsTab.tsx:733-739` — importable post type slug matcher (no changes needed — staff won't support import-from-identity)

**Patterns to follow:**
- Migration format matches `20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts`
- Post block HTML follows the `{{start_post_loop}}...{{end_post_loop}}` convention
- Single template HTML follows the `{{post.*}}` / `{{post.custom.*}}` / `{{if post.*}}` token convention
- Visual style matches the dental SEO template: Tailwind utilities, `bg-gradient-brand`, `text-ivory`, AI-IMAGE/AI-CONTENT directives

**Reference file:** The doctors single_template (in DB, modified by migration `20260423000003`) is the closest analog. Staff version strips affiliations gallery, simplifies credentials, adds `role` field prominence.

## Constraints

**Must:**
- Use the same template ID (`2d325d15-bcdb-4157-b983-3d7b21f72b82`)
- Be idempotent — skip if `staff` post type already exists on that template
- Use `parseJsonb` helper pattern from existing migrations
- Match the visual language of the existing doctors grid and single page (Tailwind, hero pattern, CTA pattern)
- Include AI-IMAGE and AI-CONTENT directives in the single_template hero for the generation pipeline

**Must not:**
- Touch the doctors post type or any existing post types/blocks
- Add import-from-identity support (staff are manually created)
- Modify existing frontend components (PostsTab already handles arbitrary post types generically)
- Create a template page — the `staff` listing page is created per-project via the admin UI or generation pipeline, not seeded here

**Out of scope:**
- Staff import pipeline (no `content_essentials.staff` exists in identity)
- Frontend custom field editor changes (generic editor already handles all field types)
- Template page seed for "Our Team" / "Meet the Team" (separate task)

## Risk

**Level:** 1 — Suggestion

**Risks identified:**
- Slug collision: if a template somehow already has a `staff` post type → **Mitigation:** idempotent guard, skip if exists
- Post block HTML may need tuning after seeing it rendered → **Mitigation:** HTML is in DB JSONB, easily updated via admin UI or follow-up migration

**Blast radius:** None. New records only. No existing rows modified. No consumers affected.

## Tasks

### T1: Migration — create staff post type + post block + single_template
**Do:**
Create `src/database/migrations/20260501200000_create_staff_post_type.ts`:

1. **Post type** `staff` on template `2d325d15-bcdb-4157-b983-3d7b21f72b82` with schema:
   - `role` (text, required) — "Dental Hygienist", "Office Manager", etc.
   - `years_at_practice` (text, optional) — "5 years", "Since 2019"
   - `certifications` (text, optional) — "RDH, CPR Certified"
   - `fun_fact` (textarea, optional) — personal touch for the team page
   - `education` (text, optional) — "University of Virginia, B.S. Dental Hygiene"

2. **single_template** with one section `single-post`:
   - Hero: shorter than doctors (`min-h-[400px] md:min-h-[480px]`), background image with slate overlay, AI-IMAGE directive
   - Content area: staff photo (featured_image) floated left, name + role badge, bio content
   - Conditional sections for certifications, education, fun fact — all wrapped in `{{if post.custom.*}}`
   - No affiliations gallery (key difference from doctors)
   - CTA section at bottom (same `bg-gradient-brand` pattern)

3. **Post block** `staff-grid` linked to the new post type, with one section `grid`:
   - Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
   - Card: photo top (rounded, object-cover), name, role, excerpt, link to detail page
   - Uses `{{start_post_loop}}...{{end_post_loop}}` with `{{post.featured_image}}`, `{{post.title}}`, `{{post.custom.role}}`, `{{post.excerpt}}`, `{{post.url}}`
   - No hover-heavy animations — clean, approachable

**Files:** `src/database/migrations/20260501200000_create_staff_post_type.ts`
**Depends on:** none
**Verify:** `npx knex migrate:latest --knexfile knexfile.ts` runs without error; query `website_builder.post_types` confirms `staff` row; query `website_builder.post_blocks` confirms `staff-grid` row

### T2: Add `staff` to ALLORO_SHORTCODE vocabulary
**Do:**
1. In `shortcodeResolver.service.ts` line ~28, add `staff` to the ALLORO_SHORTCODE marker vocabulary comment:
   ```
   *   - staff        → {{ post_block items='<id>' ... }} (post type `staff`)
   ```
2. In `util.html-normalizer.ts` line ~208, add to `SHORTCODE_TOKEN_BY_TYPE`:
   ```
   staff: "[post_block type=\"staff\"]",
   ```

**Files:** `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`, `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` passes

## Done
- [ ] `npx tsc --noEmit` — zero errors from these changes
- [ ] Migration runs successfully against the dev database
- [ ] `website_builder.post_types` has a `staff` row on template `2d325d15-...`
- [ ] `website_builder.post_blocks` has a `staff-grid` row linked to the new post type
- [ ] `SHORTCODE_TOKEN_BY_TYPE` includes `staff`
- [ ] Shortcode resolver vocabulary comment includes `staff`
- [ ] No regressions in existing doctors/services/locations post types
