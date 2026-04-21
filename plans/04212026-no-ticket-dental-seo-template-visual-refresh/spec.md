# Dental SEO Template — Visual Refresh (Heroes, Gradients, Footer, CTAs)

## Why
Current "Alloro Dental Template" has inconsistent hero treatments (pastel gradients, dark solids, overlay images), inline `style=""` attributes scattered through markup, a footer that reads as a single block of brand color, and CTA text that doesn't adapt to specialty (endo vs ortho). Refresh unifies these surfaces so every generated site feels like one coherent system and stops leaking ad-hoc inline styles.

## What
Single forward Knex migration that updates JSONB `sections` on 17 `template_pages` rows and the `footer`/`wrapper` columns on the one `templates` row identified as the dental SEO template. Zero code changes. No new schema. No changes to page composition, slots, or controllers.

Done = template row visually refreshed; future sites generate with the new surfaces; a regenerated existing project picks up the new look; no `style=""` gradient/background inline remains on target sections; CTA text branches on `business.category` via AI-CONTENT directives.

## Context

**Target template (DB):**
- `website_builder.templates` row `id = 2d325d15-bcdb-4157-b983-3d7b21f72b82` (name = "Alloro Dental Template")
- Resolved at migration time by name lookup (not hardcoded UUID) — matches existing seed pattern in migration `20260417000003`
- 17 `template_pages` rows linked by `template_id`

**Relevant files (read-only for this spec — no code changes):**
- `src/models/website-builder/TemplateModel.ts` — template shape reference
- `src/models/website-builder/TemplatePageModel.ts:3-14` — model declares `title`, `path`, `sort_order`, `meta_title`, `meta_description` but DB has none. Ignore the model's type; operate on real columns: `id, template_id, name, sections, dynamic_slots, created_at, updated_at`.
- `src/database/migrations/20260417000003_page_creation_enhancements.ts:92-133` — reference analog for "locate dental SEO template + iterate template_pages + update JSONB"
- `src/controllers/admin-websites/feature-services/service.project-manager.ts:556-620` — confirms page cloning consumes `sections` JSONB
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts:43,227-236,932-933` — confirms generation reads `sections`

**Current inline-style and gradient footprint (measured from DB):**
| Pattern | Count | Pages |
|---|---|---|
| Pastel gradient `var(--gradient-bg, linear-gradient(301deg, #b3dbd9, ...))` on hero | 10 | Request Consultation, Reviews, First Visit, Insurance, Educational Content, Privacy Policy, Accessibility Notice, Referral Form, Articles, Success |
| Dark solid `#232323` + overlay `<img>` on hero | 5 | About Us, Services, Single Doctor, Single Location, Dental Emergencies |
| `bg-gradient-brand` class on hero (already clean) | 1 | Contact |
| Proper `background-image` style on hero (already clean) | 1 | Homepage |
| Pastel gradient on non-hero CTAs | 7 | Services/section-services-cta, About Us/section-consultation-cta, Reviews/section-cta, Educational Content/section-cta, Accessibility Notice/section-cta, Dental Emergencies/section-cta, Homepage/section-appointment, Single Doctor/section-consultation, Single Location/section-consultation, Request Consultation/section-consultation |
| Single Location `sections` stored as `{sections: [...]}` (non-array) | 1 | Single Location — normalize to array while we're rewriting |

**Reference analogs for new markup:**
- Hero pattern → Homepage `section-hero` (already uses `background-image:linear-gradient(overlay), url(...)` pattern with AI-IMAGE directive)
- Brand-gradient section → Contact `section-contact-hero` already uses `class="... bg-gradient-brand"` with no inline style
- Wrapper utilities → existing `.bg-primary`, `.bg-gradient-brand` blocks in `templates.wrapper` `<style>` block

## Constraints

**Must:**
- Single forward Knex migration in `src/database/migrations/` following `20260417000003` structure
- Resolve template by name (`ILIKE '%dental%'` fallback chain), not hardcoded UUID
- Snapshot current `template_pages.sections` + `templates.footer` + `templates.wrapper` into backup table `website_builder.template_pages_backup_20260421` and `website_builder.templates_backup_20260421` BEFORE any update, so `down()` has a restore path
- `down()` restores from backup tables; drops them last
- All subpage hero sections use one consistent **minimum** height class: `relative w-full min-h-[560px] md:min-h-[680px] flex items-center justify-center overflow-hidden py-20 md:py-24`. This is a floor, not a cap — heroes with more content (long headline, breadcrumb + subhead + CTA row, etc.) expand naturally. No fixed `h-[...]`, no `max-h-*`. The `py-20 md:py-24` preserves vertical padding when content pushes the section taller than min-h.
- Homepage hero keeps its size (`min-h-[600px] lg:min-h-[800px]`) — do not touch size
- Hero backgrounds via CSS `background-image:linear-gradient(overlay), url(...)` — no `<img>` element for background
- Each hero carries an AI-IMAGE directive with: unique slot key, search keywords relevant to the page topic, image requirements (landscape 1920x800 min), overlay behavior, fallback rule
- Dark gradient overlay on hero images uses the slate-deep token: `linear-gradient(to bottom, rgba(15,23,42,0.75), rgba(15,23,42,0.55), rgba(15,23,42,0.85))`
- All remaining `style=""` attributes on target sections → Tailwind utilities (see Mapping Table below). Exception: the Leaflet map container `style="height:380px"` stays (Leaflet requires measurable height inline/CSS; Tailwind arbitrary `h-[380px]` is acceptable replacement — use that)
- New wrapper utilities added as additive CSS inside the existing `<style>` block:
  ```css
  .bg-slate-deep { background-color: #0F172A !important; }
  .bg-slate-deep * { color: inherit; }
  .bg-slate-deep, .text-ivory { color: #F8FAFC; }
  .text-slate-deep { color: #0F172A; }
  ```
  Placed next to the existing `.bg-gradient-brand` block. Do not touch existing utilities.
- Footer: keep `bg-primary` on the `<section>` locations strip wrapper; change the main `<footer>` to `bg-slate-deep`. Keep text white inside both.
- Footer map AI-INSTRUCTIONS: append explicit "Populate `locations` array with EVERY location from identity (no subset, no single-pin fallback unless truly only one). Map must auto-center via `fitBounds` when >1 location."
- CTA text: replace hardcoded "Request Free Consultation" / "Book Appointment" strings in all target sections (header CTA button, header mobile CTA, footer CTA, and body-section CTAs) with this AI-CONTENT directive:
  ```
  AI-CONTENT: cta-label | Choose label based on business.category:
    - Endodontist / Endodontics → "Book Appointment"
    - Orthodontist / Orthodontics → "Schedule a Consultation"
    - Default (other dental) → "Request a Consultation"
  ```
  Keep the link target as `/consultation`.
- Normalize Single Location `sections` to array shape `[...]` (unwrap the `{sections: [...]}` container)

**Must not:**
- Add new dependencies
- Change page list (still 17 pages)
- Change section count or names per page
- Modify `dynamic_slots` or `layout_slots`
- Modify any controller/service/route
- Change `TemplatePageModel.ts` (schema drift exists but is out of scope)
- Touch Homepage hero size
- Touch non-target sections (only sections listed in Tasks)
- Introduce a new template row or new page rows
- Change `.bg-primary`, `.bg-accent`, or existing wrapper utility definitions

**Out of scope:**
- Header markup beyond the CTA button text (layout/structure stays)
- Fixing `TemplatePageModel.ts` drift
- Section redesigns beyond hero/gradient/style cleanup (section content stays, only chrome changes)
- Per-client brand gradient color overrides (handled elsewhere in generation pipeline)
- SaaS SEO Template (other template row) — not touched

## Risk

**Level:** 3

**Risks identified:**
- **Level 3 — Regeneration drift:** Existing live sites that trigger a regeneration will pick up the new markup. Any client currently mid-flight through generation gets a mixed result.
  **Mitigation:** Run migration during low-traffic window; confirm no active generation jobs before executing; keep backup tables for 14 days before dropping.
- **Level 3 — No per-row dry run:** Migration updates all 17 pages in one transaction. Partial failure could leave mixed state.
  **Mitigation:** Wrap all updates in single `knex.transaction`. On error the transaction rolls back; backup tables stay in place.
- **Level 2 — AI-CONTENT category matching:** Generation pipeline honors conditional AI-CONTENT directives (confirmed by user). The `cta-label` directive relies on that behavior; if the agent prompts drift later, labels silently fall back to the placeholder. **Mitigation:** placeholder text on each CTA is a safe default ("Request a Consultation"), so a silent failure degrades gracefully rather than breaking layout.
- **Level 1 — Consistent min-size resolved:** User confirmed single min-height for all 16 subpages with natural content-driven expansion. No further mitigation needed.
- **Level 2 — Single Location shape normalization:** Unwrapping `{sections: [...]}` to `[...]` changes the JSONB shape read by consumers. Any consumer currently accessing `.sections.sections` breaks, any expecting `.sections[0]` starts working.
  **Mitigation:** Confirm all readers iterate `Array.isArray(sections)` — the project-manager and generation-pipeline do (verified prior). No-change for consumers; fix for a latent bug.

**Blast radius:**
- All future dental-template project creations (service.project-manager.createAllFromTemplate)
- All regenerations of existing dental-template projects (service.generation-pipeline)
- AI agents in `src/agents/websiteAgents/aiCommand/*` that interpret AI-IMAGE and AI-CONTENT directives
- No impact on: SaaS SEO Template row, any non-dental project, slot prefill/generator, header menu shortcode rendering, footer map JS behavior

**Pushback (resolved):**
- Pastel → brand-dark tone shift: confirmed by user.
- Header CTA inclusion in specialty branching: confirmed by user.

## Style-attribute → Tailwind Mapping Table

Apply uniformly when scrubbing `style=""` across all target sections:

| Current inline | Tailwind replacement |
|---|---|
| `style="background:#232323;"` | `bg-[#0F172A]` (replace with slate-deep — matches new utility) |
| `style="opacity:0.25;"` / `0.35` / `0.9` | `opacity-25` / `opacity-35` / `opacity-90` |
| `style="background:linear-gradient(to bottom, rgba(35,35,35,0.85), rgba(35,35,35,0.6));"` | Hero overlay — encode in `background-image` shorthand on the section itself (keep as `background-image:linear-gradient(...), url(...)` — this is the one allowed background-image inline since Tailwind has no arbitrary gradient-over-image utility. Mark the AI-IMAGE directive so generator only rewrites the URL portion.) |
| `style="color:rgba(255,255,255,0.6);"` | `text-white/60` |
| `style="color:rgba(255,255,255,0.8);"` | `text-white/80` |
| `style="border-color:rgba(255,255,255,0.1);"` | `border-white/10` |
| `style="background:rgba(255,255,255,0.1);"` | `bg-white/10` |
| `style="background:rgba(255,255,255,0.6); border:1px solid rgba(255,255,255,0.8);"` | `bg-white/60 border border-white/80` |
| `style="background: var(--gradient-bg, linear-gradient(301deg, #b3dbd9 ...));"` on non-hero CTA | Remove entirely; add `bg-gradient-brand` class |
| `style="background: var(--color-primary, #232323);"` | `bg-primary` |
| `style="color:#0d2d4a;"` | `text-slate-deep` (use new utility) |
| `style="color:#1e4d6b;"` | `text-slate-deep` (use new utility — close enough; we're standardizing) |
| `style="height:380px;"` (footer map) | `h-[380px]` |
| `style="height:100%; width:100%; z-index:0; position:relative;"` (map inner div) | `h-full w-full relative z-0` |
| `style="background:rgba(255,255,255,0.1);"` on social icon | `bg-white/10` |
| `style="opacity:0.8;"` / `0.6` on text | `opacity-80` / `opacity-60` OR `text-white/80` / `text-white/60` if text |
| `style="font-family:sans-serif;min-width:180px;"` (inside map popup JS string) | Keep — inside JS string literal, not template markup |
| Inline `<style>` blocks for `#footer-map`, `#mobile-nav-inner` | Keep — CSS targeting specific IDs not expressible in Tailwind |
| `style="border-color:rgba(255,255,255,0.1);"` on footer divider | `border-white/10` |

**Exception list (inline style preserved):**
- Leaflet map `<style>` block (ID-scoped CSS, not expressible as classes)
- Mobile nav `<style>` block inside header (ID-scoped)
- Any `style=""` inside JS string literals building popup HTML

## Tasks

### T1: Template wrapper — add slate-deep utility classes
**Do:** Append `.bg-slate-deep`, `.bg-slate-deep *`, `.text-ivory`, `.text-slate-deep` blocks to `templates.wrapper` inside the existing `<style>` block, directly after `.bg-gradient-brand` definitions. No changes to existing utilities. No changes to fonts, body, or other blocks.
**Files:** `website_builder.templates.wrapper` (target template row)
**Depends on:** none
**Verify:** Fetched `templates.wrapper` contains exactly 4 new CSS rules; no existing rule modified; wrapper still parses as valid HTML/CSS.

### T2: Subpage heroes — Group A (dark-solid + overlay-img pages)
**Do:** Rewrite the hero section markup for: About Us (section-about-hero), Services (section-services-hero), Single Doctor (section-doctor-hero), Single Location (section-location-hero), Dental Emergencies (section-hero). Remove `<img>` overlay element. Replace with `style="background-image:linear-gradient(to bottom, rgba(15,23,42,0.75), rgba(15,23,42,0.55), rgba(15,23,42,0.85)), url('{placeholder_url}');"` on the `<section>` itself. Add `bg-center bg-cover bg-no-repeat` classes. Use subpage hero size class: `relative w-full min-h-[560px] md:min-h-[680px] flex items-center justify-center overflow-hidden py-20 md:py-0`. Keep the `alloro-tpl-v1-release-section-*-hero` class prefix. Replace all inline styles per Mapping Table. Update AI-IMAGE directive: unique slot key (`{page}-hero-bg`), page-specific SEARCH KEYWORDS, REQUIREMENTS (landscape min 1920x800), FALLBACK rule, and instruction "Replace ONLY the url() value inside background-image; keep overlay gradient intact". Content inside hero (headline, subhead, breadcrumbs) stays; only chrome changes. Text color → `text-ivory`.
**Files:** `website_builder.template_pages` rows for: About Us, Services, Single Doctor, Single Location, Dental Emergencies — update `sections` JSONB
**Depends on:** T1 (uses `text-ivory` utility)
**Verify:** Each hero section: zero `<img>` tags for background; exactly one `background-image` style with overlay + url; no `#232323` references; AI-IMAGE directive present with correct slot key; size tokens match spec.

### T3: Subpage heroes — Group B (pastel-gradient pages)
**Do:** Rewrite the hero section markup for: Request Consultation (section-consultation-hero), Reviews (section-hero), First Visit (section-hero), Insurance (section-hero), Educational Content (section-hero), Privacy Policy (section-hero), Accessibility Notice (section-hero), Referral Form (section-hero), Articles (section-hero), Success (section-success-hero), Contact (section-contact-hero). Replace `style="background: var(--gradient-bg, ...)"` with background-image hero pattern (same as T2). For Contact specifically: replace `class="... bg-gradient-brand"` with the background-image hero pattern as well — user requested ALL heroes use background image. Apply subpage size class. Apply overlay gradient + AI-IMAGE directive with page-specific keywords. Text → `text-ivory`. Strip all inline styles per Mapping Table.
**Files:** `website_builder.template_pages` rows for 11 pages listed — update `sections` JSONB
**Depends on:** T1
**Verify:** Each hero: no `--gradient-bg` references; no `bg-gradient-brand` class; background-image present; size class identical across all 11 pages; AI-IMAGE directive unique per page.

### T4: Homepage hero — cleanup only (no size change)
**Do:** Keep Homepage `section-hero` size (`min-h-[600px] lg:min-h-[800px]`). Strip remaining `style=""` attributes per Mapping Table. Keep existing `background-image:linear-gradient(overlay), url(...)` pattern — already correct. Polish AI-IMAGE directive to match T2/T3 format (requirements, fallback, explicit URL-replace-only instruction). Text → `text-ivory` where currently using `text-white`.
**Files:** `website_builder.template_pages` Homepage row — update `sections[0]`
**Depends on:** T1
**Verify:** Homepage hero size unchanged; AI-IMAGE directive matches sibling hero format; no new inline styles introduced.

### T5: Non-hero gradient sections → `.bg-gradient-brand`
**Do:** For each of these sections, replace `style="background: var(--gradient-bg, ...)"` (and any related inline gradient) with class `bg-gradient-brand`. Strip color-related inline styles (`color:#0d2d4a`, etc) — the `.bg-gradient-brand *` rule already forces white. Add `text-ivory` class on the section root as belt-and-suspenders.
  - Services / section-services-cta
  - About Us / section-consultation-cta
  - Reviews / section-cta
  - Educational Content / section-cta
  - Accessibility Notice / section-cta
  - Dental Emergencies / section-cta
  - Homepage / section-appointment
  - Single Doctor / section-consultation
  - Single Location / section-consultation
  - Request Consultation / section-consultation
**Files:** 10 `template_pages` rows — specific sections updated in-place
**Depends on:** T1
**Verify:** Zero `--gradient-bg` references remain in these sections; each has `bg-gradient-brand` on root; contained text legible against dark brand gradient.

### T6: Style-attribute scrub — remaining non-hero, non-gradient sections
**Do:** Walk every target template page's remaining sections (non-hero, non-CTA) and replace inline `style=""` per Mapping Table. Exceptions (keep inline): Leaflet map CSS block, mobile-nav CSS block, any `style` inside JS string literals. Log each replacement in migration console output for audit trail.
**Files:** All 17 `template_pages` rows — body sections
**Depends on:** T1
**Verify:** Post-migration scan: total `style="background:` and `style="color:` occurrences reduced to zero on target sections. Map and nav CSS blocks still present. Leaflet map renders.

### T7: Footer — split background (locations strip vs main footer)
**Do:** In `templates.footer`:
- Keep `<section class="alloro-tpl-v1-release-footer-locations bg-primary text-white ...">` as-is (bg-primary stays).
- Change `<footer class="alloro-tpl-v1-release-footer bg-primary text-white ...">` → swap `bg-primary` for `bg-slate-deep`. Keep `text-white`.
- Footer divider `style="border-color:rgba(255,255,255,0.1);"` → `border-white/10` class.
- Social icon backgrounds `style="background:rgba(255,255,255,0.1);"` → `bg-white/10` class.
- Brand tagline/copyright opacity inline → `text-white/80` / `text-white/60`.
- Column 1 logo wrapper: remove `bg-white p-2 rounded-md` if not needed on dark slate — actually keep, logo often needs white bg for dark transparent PNGs.
**Files:** `website_builder.templates.footer` (target template row)
**Depends on:** T1
**Verify:** `<section>` locations still `bg-primary`; `<footer>` uses `bg-slate-deep`; no inline style backgrounds or opacity values remain inside the `<footer>` tree (excluding Leaflet map block).

### T8: Footer map — explicit "all locations + auto-center" instruction
**Do:** Update the AI-INSTRUCTIONS comment block above the locations strip AND the `AI-CONTENT: map-locations` directive in `templates.footer`:
- Prepend to locations strip AI-INSTRUCTIONS: "MAP BEHAVIOR (REQUIRED): Populate the `locations` array in the inline <script> with EVERY location from the business identity — no subset, no sample data. The map MUST auto-center via `fitBounds` when there are 2+ locations, and `setView` at zoom 14 when exactly 1. Do not render the map if there are zero locations — hide the entire map div."
- Update `AI-CONTENT: map-locations` directive: "Replace `locations` array with ALL locations from identity.locations[]. Each entry: name, full formatted address, exact lat/lng (use place_id geocode if missing), gmaps URL. Do not drop duplicates; each physical location gets a pin."
- Replace inline `style="height:380px;"` on map container → `h-[380px]` class.
- Replace inline `style="height:100%; width:100%; z-index:0; position:relative;"` on `#footer-map` → `h-full w-full relative z-0`.
**Files:** `website_builder.templates.footer`
**Depends on:** T1
**Verify:** Map container uses Tailwind classes for height; AI-INSTRUCTIONS text matches spec verbatim; Leaflet JS logic unchanged.

### T9: CTA text — AI-CONTENT specialty branching (header + body + footer)
**Do:** Replace the hardcoded CTA label strings "Request Free Consultation" and "Book Appointment" wherever they appear in: header desktop nav CTA, header mobile nav CTA, body sections across all 17 pages, footer CTA. Replace with an AI-CONTENT directive. Format:
```html
<!-- AI-CONTENT: cta-label | Choose label by business.category:
     - Endodontist / Endodontics → "Book Appointment"
     - Orthodontist / Orthodontics → "Schedule a Consultation"
     - Default / other dental → "Request a Consultation"
     Apply same label consistently across header, body, and footer CTAs for this site. -->
```
Place the directive as a comment directly above each CTA element. Leave the button text as a safe-fallback placeholder (`Request a Consultation`) — the generator replaces based on category.
Links remain `href="/consultation"`. Placeholder text means a silent generator failure still renders readable copy instead of blank buttons.
**Files:** `templates.header` (desktop + mobile CTA); `templates.footer` (any CTA); all 17 `template_pages` rows (body-section CTAs).
**Depends on:** T1 (not strictly; can run in parallel)
**Verify:** `grep` across target template row + all target JSONB for "Request Free Consultation" and "Book Appointment" → zero hits; each CTA preceded by the directive comment; every CTA placeholder text exactly "Request a Consultation".

### T10: Single Location — normalize sections shape
**Do:** Current `sections` JSONB for Single Location is `{"sections": [...]}`. Unwrap to `[...]`. Verify no consumer relies on the object shape. Apply T2 hero rewrite on the inner array before unwrapping so output is already correct.
**Files:** `website_builder.template_pages` Single Location row
**Depends on:** T2
**Verify:** `jsonb_typeof(sections) = 'array'` post-migration; `jsonb_array_length(sections) = 4` (hero + info + services + consultation).

### T11: Migration authorship — single Knex migration file
**Do:** Write `src/database/migrations/20260421000001_dental_seo_template_visual_refresh.ts` following `20260417000003` structure:
- `up()`:
  1. Resolve template by name (dental template ILIKE pattern, oldest first) — abort with log if not found
  2. Create `website_builder.templates_backup_20260421` and `website_builder.template_pages_backup_20260421` tables; copy current rows for target template into them
  3. Open transaction
  4. Update `templates.wrapper` (T1 utilities added)
  5. Update `templates.footer` (T7, T8, T9 footer-CTA changes)
  6. Update `templates.header` (T9 desktop + mobile CTA branching — confirmed in scope)
  7. For each of 17 template_pages rows: fetch current `sections`; apply T2/T3/T4/T5/T6/T9/T10 transformations per page; update JSONB
  8. Log per-page summary (section count, byte delta, style-attr count before/after)
  9. Commit
- `down()`:
  1. Open transaction
  2. Restore `templates` row from `templates_backup_20260421`
  3. Restore `template_pages` rows from `template_pages_backup_20260421`
  4. Drop backup tables
  5. Commit
- Idempotency: if backup tables already exist, abort with instruction to drop them first (prevents double-apply from corrupting backup)
- All markup transformations implemented as pure string manipulations or small JSONB helpers inside the migration file — no external imports beyond `knex`
**Files:** `src/database/migrations/20260421000001_dental_seo_template_visual_refresh.ts` (new)
**Depends on:** T1-T10 content specification finalized
**Verify:** `npx knex migrate:list` shows the migration as pending; `npx tsc --noEmit` clean; dry-run against staging DB produces expected row-level updates; backup tables created and populated before any update.

## Done

- [ ] Migration file exists at `src/database/migrations/20260421000001_dental_seo_template_visual_refresh.ts`
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Migration runs clean against a staging DB
- [ ] Backup tables `website_builder.templates_backup_20260421` and `website_builder.template_pages_backup_20260421` created and populated
- [ ] Post-migration DB scan:
  - [ ] All 16 subpage hero sections: zero `--gradient-bg` references, zero background `<img>` overlay tags, exactly one `background-image` inline per hero, `min-h-[560px] md:min-h-[680px]` min-height class present, no fixed `h-[...]` or `max-h-*` applied
  - [ ] Homepage hero: size unchanged (`min-h-[600px] lg:min-h-[800px]`), AI-IMAGE directive polished
  - [ ] 10 non-hero gradient sections: `bg-gradient-brand` class present, zero `--gradient-bg` references
  - [ ] Zero `style="background:` and `style="color:` on target sections (excluding Leaflet + nav CSS blocks)
  - [ ] Single Location `sections` is array shape, length 4
  - [ ] Wrapper contains 4 new utility classes; existing classes untouched
  - [ ] Footer locations strip still `bg-primary`; main `<footer>` now `bg-slate-deep`
  - [ ] Footer map AI-INSTRUCTIONS contains the "ALL locations + auto-center" block
  - [ ] Zero hardcoded "Request Free Consultation" / "Book Appointment" in header, body sections, or footer; each CTA preceded by `AI-CONTENT: cta-label` directive; placeholder text = "Request a Consultation"
- [ ] Manual: regenerate one test project (one endo, one ortho if available); verify heroes render with image backgrounds, non-hero CTAs render with brand gradient, footer renders two-tone, CTA text branches correctly per specialty (endo = "Book Appointment", ortho = "Schedule a Consultation")
- [ ] Manual: verify tall-content hero (e.g., page with long headline + subhead + breadcrumb) expands past 680px without clipping
- [ ] Manual: verify no regressions on SaaS SEO Template (untouched)
- [ ] Down-migration test: run `migrate:rollback` on staging; confirm template row + pages restored to pre-migration state; backup tables dropped

## Decisions (all resolved)

1. **Header CTA:** ✅ included in specialty branching (header desktop + mobile).
2. **Subpage hero size:** ✅ single `min-h-[560px] md:min-h-[680px]` floor across all 16 subpages; content taller than floor expands naturally (no max-h, no fixed h).
3. **Pastel → brand-dark tone shift:** ✅ confirmed.
4. **AI-CONTENT branching support:** ✅ confirmed; placeholder text acts as safe fallback if generator skips directive.

## Revision Log

### Rev 1 — 2026-04-21 (post-render feedback)

**Change summary:**
- Subpage hero min-height reduced from `min-h-[560px] md:min-h-[680px]` → `min-h-[360px] md:min-h-[440px]`. Vertical padding from `py-20 md:py-24` → `py-12 md:py-16`.
- Homepage hero reduced from `min-h-[600px] lg:min-h-[800px]` → `min-h-[440px] lg:min-h-[560px]`.
- Hero section tags gain `text-center` class (Contact hero lost centering because the original relied on section-level `text-center` that was dropped during the rewrite; applying universally keeps ALL subpage hero content centered).
- `text-accent` usage inside heroes and inside `.bg-gradient-brand` sections flipped to `text-white` — blue accent on dark overlay was unreadable. Applies ONLY within these dark-surface sections; other `text-accent` usage on light surfaces stays.
- Slate-deep color family swapped to gray-800 (`#1F2937`): `.bg-slate-deep` and `.text-slate-deep` utilities redefined; hero overlay gradient stops updated from `rgba(15,23,42,X)` to `rgba(31,41,55,X)`; any `bg-[#0F172A]` class occurrences flipped to `bg-[#1F2937]`. The class names stay — only color values change.

**Reason:** Live rendering showed heroes too tall, Contact hero left-aligned, blue accent text unreadable over dark overlay, and slate-deep read more "cold blue" than the neutral deep gray the user wanted.

**Updated Done criteria:** Post-rev DB scan must show new min-height values, all hero section tags carrying `text-center`, zero `text-accent` inside hero or brand-gradient sections, and wrapper utility color = `#1F2937`.

**Implementation:** New Knex migration `20260421000002_dental_seo_refresh_rev_1.ts`. Creates its own backup tables (`..._r1`) for independent rollback; does not modify Rev-0 backup tables.

### Rev 2 — 2026-04-21 (second round of post-render feedback)

**Change summary:**
- `text-gradient-brand` usage inside hero sections and `.bg-gradient-brand` sections flipped to `text-white` — gradient text paints with the brand's dark hex range which is invisible against the dark overlay or the dark brand gradient surface. (Rev 1 only handled `text-accent`; this handles the other gradient-text pattern that remained unreadable.)
- Hero overlay darkened: from `rgba(31,41,55,0.75)/0.55/0.85` → `rgba(31,41,55,0.88)/0.78/0.95`. Flat-out more contrast for white text.
- Success page hero rewritten to a light surface — `bg-white`, dark text. Strips the background-image style, removes the AI-IMAGE directive, flips `text-white/*` / `text-ivory` inside back to `text-gray-*`. Keeps the subpage min-height + `text-center` + button (button's `bg-primary text-white` reads fine on white).

**Why:** User flagged: (1) `text-gradient-brand` highlighted words on dark surfaces were still unreadable after Rev 1 handled `text-accent`. (2) The overall overlay wasn't dark enough for confident white-text contrast. (3) Success page reads better as a calm confirmation in light mode, not a big dark image.

**Updated Done criteria:** Zero `text-gradient-brand` inside hero or brand-gradient sections. Hero overlay triple uses the new `0.88/0.78/0.95` opacities. Success hero has no background-image inline, has `bg-white`, and has no residual `text-white` / `text-ivory` classes inside.

**Implementation:** New Knex migration `20260421000003_dental_seo_refresh_rev_2.ts`. Creates its own backup tables (`..._r2`) for independent rollback.

### Rev 3 — 2026-04-21 (two gaps from Rev 2)

**Change summary:**
- Homepage hero overlay darkened and unified to the gray-800 rgba triplet used by all subpage heroes: `rgba(0,0,0,0.5), rgba(0,0,0,0.3), rgba(0,0,0,0.6)` → `rgba(31,41,55,0.88), rgba(31,41,55,0.78), rgba(31,41,55,0.95)`.
- Success hero checkmark SVG: restore `text-white` on the SVG inside the `bg-primary` icon circle. Rev 2's blanket `text-white → text-gray-900` flip inside Success broke this one icon (gray checkmark on blue circle = invisible).

**Why:** Rev 2 darkened only the subpage heroes; Homepage still had the original thinner overlay with pure-black rgba, visually lighter than the rest. Success light-mode rewrite caught a nested SVG whose foreground color is meant to contrast against its own bg-primary parent, not the page surface.

**Updated Done criteria:** Homepage hero overlay uses `rgba(31,41,55,0.88)/0.78/0.95`. No `rgba(0,0,0,0.5)` overlay remains on Homepage. Success hero icon SVG uses `text-white`.

**Implementation:** New Knex migration `20260421000004_dental_seo_refresh_rev_3.ts`. Backup tables suffix `_r3`.

### Rev 4 — 2026-04-21 (third accent class surfaced)

**Change summary:**
- Flip `text-primary` → `text-white` inside hero sections and `.bg-gradient-brand` sections. Also flip `hover:text-primary` → `hover:text-white` in the same scope.

**Why:** Rev 1 handled `text-accent` and Rev 2 handled `text-gradient-brand`, but the brand utility set has a third dark text token — `text-primary` (#273A84) — used on highlighted words (e.g., Services CTA: "Not sure which service you need? **We can help.**"). On a dark brand-gradient surface it reads as dark-on-dark. Same class of fix as Rev 1/2, just a third token I missed.

**Updated Done criteria:** Zero `text-primary` or `hover:text-primary` classes inside hero or `.bg-gradient-brand` sections.

**Implementation:** New Knex migration `20260421000005_dental_seo_refresh_rev_4.ts`. Backup tables suffix `_r4`.

### Rev 5 — 2026-04-21 (comprehensive sweep of remaining dark-on-dark)

**Change summary:**
- In hero + `.bg-gradient-brand` sections, flip ALL remaining dark tokens to readable equivalents:
  - `text-[#0d2d4a]`, `text-[#1a4a6e]`, `text-[#1e4d6b]`, `text-[#2d4a5e]`, `text-[#232323]`, `text-[#273A84]`, `text-[#2675BF]` (any case) → `text-white`
  - `border-[#<same set>]` → `border-white/40`
  - `border-primary` (not `-subtle`) → `border-white/40`; `border-accent` → `border-white/40`
  - `hover:border-primary`, `hover:border-accent` → `hover:border-white`
- Any element in the template (not just Success) whose class includes `bg-primary` / `bg-accent` / `bg-gradient-brand` has its own `text-gray-*` classes flipped to `text-white`. This catches the Success "Back to Homepage" button (same root bug as Rev 3 icon fix, just a different element) and guards against any future element of the same shape.

**Why:** Prior revs (1, 2, 4) tackled dark text classes one name at a time — `text-accent`, then `text-gradient-brand`, then `text-primary`. Each rev was too narrow. This rev closes the remaining pairs: the arbitrary-hex-class variants (`text-[#HEX]` / `border-[#HEX]`) that slipped past the plain-class flips, the matching border-color tokens (flipping text without flipping the adjacent border leaves outline buttons dark-on-dark), and the colored-bg element rule so text-gray inside a primary/accent button always flips.

**Updated Done criteria:** Zero dark-hex text/border classes inside hero or bg-gradient-brand sections. Zero `border-primary`/`border-accent` (non-subtle) in same. Zero elements with `bg-primary`/`bg-accent`/`bg-gradient-brand` + `text-gray-*` anywhere in the template.

**Implementation:** New Knex migration `20260421000006_dental_seo_refresh_rev_5.ts`. Backup tables suffix `_r5`.
