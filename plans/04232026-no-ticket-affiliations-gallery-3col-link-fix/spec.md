# Affiliations gallery — fix linked-logo visibility + switch to 3-col grid

## Why
Gallery items with a `link` are invisible in flex-row viewports (the `<a class="flex">` wrapper collapses to 0 width from a circular flex-basis resolution around `h-14 w-auto` img). Also user wants a cleaner 3-column grid that wraps when more logos are added.

## What
Update the dental SEO template's Doctors `single_template` affiliations subloop:
- Parent container: `flex flex-col sm:flex-row lg:flex-col xl:flex-row …` → `grid grid-cols-3 gap-5 lg:gap-4 xl:gap-8 place-items-center`.
- Linked-item wrapper: `<a class="flex items-center justify-center …">` → `<a class="inline-block …">`.
- Img: add `max-w-full` so wide logos don't overflow narrow cells.

## Context

**Relevant files:**
- `src/database/migrations/20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts` — prior migration that introduced the subloop. Source of the exact string we're replacing.

**Reference file:** `20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts` — matches the pattern (post_type single_template edit via verbatim string replace, idempotent, with symmetric down).

## Constraints

**Must:**
- Idempotent: skip if new markup already present, warn+skip if old shape not found (template re-authored).
- Symmetric `down` that restores the previous subloop verbatim.
- No schema changes — only the markup inside `post_types.single_template` for one post type.

**Must not:**
- Touch the `affiliations` schema field.
- Touch any authored `custom_fields.affiliations` data.
- Introduce new dependencies.

**Out of scope:**
- Column count other than 3.
- Changes to shortcode grammar or resolver.
- Visual tuning beyond the minimum (keep existing gap-5/lg:gap-4/xl:gap-8 ladder).

## Risk

**Level:** 2

**Risks identified:**
- String-verbatim replace breaks silently if any project re-authored the template → **Mitigation:** warn+skip; the migration is idempotent and leaves state untouched on mismatch.
- 3 columns on very narrow mobile with wide logos → **Mitigation:** `max-w-full` on img + `object-contain` ensures no overflow; logos shrink to cell width on aspect-ratio lock.

**Blast radius:**
- All 7 projects using `post_type_id = f9e028e1-d753-4257-9bb6-306f50322e2b` (dental SEO doctors). Template-driven, so a single row update propagates.

## Tasks

### T1: Migration — replace subloop markup
**Do:** Create `src/database/migrations/20260423000003_affiliations_gallery_3col_grid_and_link_visibility.ts`. Verbatim replace the old subloop string with the new one; symmetric `down` reverts.
**Files:** `src/database/migrations/20260423000003_affiliations_gallery_3col_grid_and_link_visibility.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit` → zero errors; `npm run db:migrate` runs clean; after apply, `curl https://calm-beauty-2180.sites.getalloro.com/doctors/dr-kyle-low` shows the grid markup + `inline-block` on linked `<a>` tags.

## Done
- [ ] `npx tsc --noEmit` — zero errors from these changes.
- [ ] `npm run db:migrate` applied cleanly, logged "Replaced flex-row/col layout with 3-col grid…".
- [ ] Live page for dr-kyle-low (or any One Endo doctor) now shows all 7 (or 2) logos in a 3-col grid; linked logos are visible.
- [ ] `npm run db:rollback` would cleanly revert (not executed, just verify shape of `down`).
