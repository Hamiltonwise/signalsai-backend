# Curate Page — Map Theme + Layout Polish

## Why
First in-browser look at the leaflet curate page surfaced three small UX issues:
1. Default OSM tiles read as "satellite-like" — too much road/landcover noise for what's meant to be a quiet neighborhood backdrop. User wants a warmer, minimal beige/cream theme.
2. Rating + review count are present in each row but get visually buried in the meta line that now also carries distance, phone, website, and address.
3. Map sits ABOVE the list, capping its useful height at 300px. With 10 markers + a YOU pin and a real interactive map, side-by-side (map left, list right) is the better fit so the map can grow and stay sticky while the user scrolls.

## What
- Swap the OSM tile layer to **CartoDB Voyager** (free, no API key, warm cream base, subtle orange road accents) — pins stay alloro-orange.
- Promote ⭐ rating + review count to the row's primary line (next to the name) so they're not competing with distance/phone/website/address in the wrapping meta line.
- Convert the curating section card to a 2-column grid on `lg+`: map left (sticky, 560px tall, rounded), list right. Stacks back on small screens.

## Context

**Relevant files:**
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — single file, three localized edits.

**Reference file:** none — the existing component IS the analog.

## Constraints

**Must:**
- Preserve all existing functionality (click sync, pulse, photos, self-filter notice, finalize button, search/add/remove).
- Tile attribution must read `&copy; OpenStreetMap contributors &copy; CARTO` per Carto's free tile policy.
- Map column on lg+ uses `position: sticky` so it stays visible as the list scrolls.
- Stack vertically on `<lg` (no horizontal scrolling, no map crush).
- Rating chip on the primary line uses the same Star icon + size as the existing meta-line version (visual consistency).

**Must not:**
- Change the API response shape, the model, the migration, or the click-sync state machine.
- Touch DiscoveringStage's map height (Stage 1 stays 480px, full width — only Stage 2 changes layout).

**Out of scope:**
- Custom tile providers requiring keys (Mapbox, MapTiler).
- Photo carousel, "open now" hours.
- Stage 1 redesign.

## Risk

**Level:** 1 — single file, frontend-only, no schema, no API. Tile URL change is reversible by editing one line.

**Risks identified:**
- **R1. CartoDB free tiles' usage policy.** → **Mitigation:** Carto offers free tiles for "occasional use" — small-scale apps. Production traffic should swap to a paid Carto plan or self-host. Documented as a follow-up.
- **R2. Sticky-positioning breaks on browsers without sticky support.** → **Mitigation:** falls back to normal flow gracefully; not a regression.
- **R3. Bigger map (560px) on smaller laptops looks dominant.** → **Mitigation:** sticky behavior plus ~1.2:1 grid ratio (list slightly wider) keeps it balanced.

**Blast radius:** `LocationCompetitorOnboarding.tsx` only. Page is consumed by one route. Self-contained.

## Tasks

### T1: Theme swap + rating promotion + side-by-side layout
**Do:**
- Swap the `<TileLayer>` URL inside `<CompetitorMap>` from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` to `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`. Update attribution.
- In the row template, move the `rating` + `reviewCount` chips out of the wrapping meta line and place them inline next to the name (after the `<a>` link, before the `primaryType` tag).
- Convert the existing `<div className="px-8 py-6">` block in `CuratingStage` (which wraps counter + add + search + list) to a 2-column grid on `lg+`. Map column wraps the existing `<CompetitorMap>` call (height bumped from 300 → 560) with `lg:sticky lg:top-6 lg:self-start rounded-2xl overflow-hidden border border-black/5`. List column holds counter + add + search + list.
- Move the `<CompetitorMap>` invocation from its current position (between header and notice) INTO the new grid's left column. The self-filter notice stays in its current spot below the header.

**Files:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`

**Depends on:** none

**Verify:**
- Manual: dev server (already running per user's import-resolution error). Map shows CartoDB Voyager warm tiles with orange-accent roads. Rating + review count appear on the primary row line next to the practice name. On `lg+` viewport (>1024px), map is left-column and sticks while list scrolls. On mobile, stacks vertically.
- `npx tsc --noEmit` clean.
- Lint clean for the file.

## Done
- [ ] Map renders CartoDB Voyager tiles (warm cream/beige), attribution shows OpenStreetMap + CARTO.
- [ ] Rating ⭐ and review count appear inline next to each row's name, not in the wrapping meta line.
- [ ] On `lg+` (≥1024px) the curate stage shows map left + list right, with the map sticky as the list scrolls.
- [ ] On `<lg` viewports, the layout stacks (map on top, list below).
- [ ] `npx tsc --noEmit` clean.
- [ ] No regressions in click sync, pulse, photos, or finalize flow.
