# Curate Page — Leaflet Map, Click Sync, Photo Thumbnails

## Why
The current map is a keyless Google Maps `pb` iframe with HTML pins overlaid via lat/lng-to-percent projection. It's fragile (Google has been progressively breaking keyless embeds), the pins drift on resize, and the iframe is non-interactive — which blocks the next obvious UX move: clicking a competitor row to highlight its pin (and vice versa). Rows also currently lack photo thumbnails, which makes the list feel like a database dump rather than a product. Two prior plans (`04282026-...-practice-ranking-v2-...` and `04282026-...-competitor-onboarding-map-rich-data-...`) shipped the v2 curate flow and the self-filter cache; this plan finishes the visual story.

## What
- Replace the Google iframe map with Leaflet so pins are real DOM markers we can click, animate, and z-order programmatically.
- Bidirectional click sync: clicking a list row scrolls the map into view and pulses the matching pin (which also pops above any overlapping neighbors); clicking a pin scrolls the matching row into view and pulses it. Both directions clear after ~2s.
- Add photo thumbnails to each row, sourced from the Google Places photos already returned by Text Search but currently dropped.
- Backfill phone/website/photo for the ~120 existing competitor rows that pre-date the column adds.

Done when: a real test location renders Leaflet markers + photo thumbnails, the click sync works in both directions, the selected pin/row pulses cleanly and auto-clears, and existing rows have phone/website/photo populated.

## Context

**Relevant files:**
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — `<CompetitorMap>` component (lines ~715-905) currently builds a Google Maps embed iframe + projects pins via lat/lng-to-percent. This component is the load-bearing surface for the swap.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx:520-700` — `CuratingStage` row layout; gets click sync state + pulse classes + photo column.
- `frontend/src/api/practiceRanking.ts` — `CuratedCompetitor` type; gets `photoName: string | null`.
- `frontend/package.json` — needs `leaflet` + `react-leaflet` + `@types/leaflet`.
- `frontend/vite.config.ts` — Leaflet's CSS imports; verify no extra config needed (it's CommonJS-friendly).
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — capture `photo_name` in `runDiscoveryForLocation` (already in `DiscoveredCompetitor.photosCount` payload, need to thread the actual `photos[0].name`) and in `addCustomCompetitor` (extend field mask first).
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts:200-228` — `placesToCompetitors` currently sets `photosCount` but discards `photos[0].name`; surface it.
- `src/controllers/places/feature-utils/fieldMasks.ts:6-20` — `PLACE_DETAILS_FIELD_MASK` does NOT include `photos` today; extend it so `addCustomCompetitor` (uses `getPlaceDetails`) gets the photo name too.
- `src/controllers/places/feature-services/GooglePlacesApiService.ts` — add a new `getPlacePhotoMedia(photoName, maxHeight)` function that proxies `places.googleapis.com/v1/{photoName}/media`.
- `src/routes/practiceRanking.ts` — register the new authed photo proxy route alongside existing curate endpoints (NOT under public `/api/places/*`, which is unauthenticated for leadgen-tool).
- `src/middleware/publicRateLimiter.ts` — add a `placesPhotoLimiter` (e.g. 60 req/min/user); applied behind auth.
- `src/models/LocationCompetitorModel.ts` — `ILocationCompetitor` + `AddCompetitorInput` get `photo_name: string | null`.
- `src/database/migrations/20260428000003_add_self_filter_and_rich_competitor_fields.ts` — analog for the new column-add migration shape.

**Patterns to follow:**
- React component layout — sub-components in same file initially, extract only if file grows past ~1000 lines.
- Knex `.ts` migrations matching existing format.
- Authed routes registered under `practiceRanking.ts` (not `places.ts`) when they require login.
- Express rate-limit middleware factories matching `publicRateLimiter.ts`.
- Pure utils in their own file (`util.distance.ts` is the analog).

**Reference file (analog):** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — the existing Google-iframe `<CompetitorMap>` IS the closest analog for what we're replacing. Match its prop shape (`competitors`, `practiceLocation`, `height`, `revealedCount`, `showLoadingFallback`) so callers don't change.

## Constraints

**Must:**
- Keep `<CompetitorMap>` prop shape backward-compatible — both `DiscoveringStage` and `CuratingStage` already call it with the same props; the swap should be invisible from the call site.
- Photo proxy endpoint MUST require auth. Placing it at `/api/practice-ranking/photo/:placeId` (or `/api/practice-ranking/photo` with photoName in query) with the existing JWT middleware. NOT under public `/api/places/*`.
- Selected pin uses `zIndexOffset >= 1000` so it pops above overlapping neighbors.
- Pulse animation auto-clears within 2.5s and clearing is debounced — rapid sequential clicks reset the timer instead of stacking pulses.
- Photo column is OPTIONAL — null thumbnail collapses cleanly without leaving an empty box.
- Backfill script is idempotent (skips rows that already have phone/website/photo_name set) and deletable after one run.
- OSM tile attribution (`© OpenStreetMap contributors`) rendered per their tile usage policy.

**Must not:**
- Break Stage 1 (DiscoveringStage). Whatever happens to the framer-motion staggered-reveal animation, the discovery flow must still land users on Stage 2 with a populated list.
- Add Leaflet to any other page in the app — scoped to the curate page only.
- Switch `getPlaceDetails` callers' return shape (the existing handler in `PracticeRankingController.ts` already passes `placeDetails` through); only the field mask widens.
- Cache photo bytes server-side (Redis/disk) — rely on browser HTTP cache via `Cache-Control: public, max-age=86400`. Server-side caching is a separate concern and out of scope.
- Backfill rows where the user has already curated — only refresh rows where the data is NULL. Don't trample fresh user_added entries.

**Out of scope:**
- "Open now" / hours UI
- Multiple photos per row / photo carousel
- Marker clustering (the cap is 10 + a YOU pin = trivial)
- Custom tile providers (Mapbox, MapTiler, CartoDB) — documented as a follow-up
- Stage 1 (DiscoveringStage) reveal animation overhaul beyond "make it work with Leaflet"
- Admin curate UI changes
- Server-side photo caching

## Risk

**Level:** 2 — additive schema, frontend dep swap on a load-bearing component, paid one-shot backfill (~$2). Contained to the curate page + one new authed endpoint.

**Risks identified:**
- **R1. Photo proxy cost exposure if route is misplaced.** → **Mitigation:** put it at `/api/practice-ranking/photo` behind the existing JWT middleware. Per-user rate limit (60/min). Browser-cached 24h via `Cache-Control`.
- **R2. Backfill spend (~$2 across 12 locations × ~10 rows).** → **Mitigation:** documented; idempotent (NULL-only); throwaway script (no commit).
- **R3. Leaflet bundle size (+~48KB).** → **Mitigation:** acceptable for the centerpiece visual. Could be code-split later if other pages don't need it.
- **R4. OSM tile rate limits in production.** → **Mitigation:** documented as a follow-up tile-provider swap; one-line `<TileLayer url={...}>` change.
- **R5. Pulse animation overdone.** → **Mitigation:** strict spec — single ring keyframe, ~1.5s, 2 cycles. Auto-clear at 2s.
- **R6. Stage 1 framer-motion reveal animation breaks under Leaflet.** → **Mitigation:** Stage 1 uses the same Leaflet component but skips reveal animation entirely; pins land all-at-once. Discovery typically completes in 5-10s, the staggered reveal was a secondary delight, not core UX. Acceptable loss.
- **R7. Existing rows with `lat`/`lng` precision off (decimal stored as string in PG numeric).** → **Mitigation:** controller already coerces with `Number(c.lat)`; verify Leaflet accepts `[number, number]` (it does).
- **R8. Leaflet's CSS interferes with Tailwind.** → **Mitigation:** scope via component-level class prefix; import `leaflet/dist/leaflet.css` once at the top of `LocationCompetitorOnboarding.tsx`; tested in a simple POC before wide changes.

**Blast radius:**
- `LocationCompetitorOnboarding.tsx` — single page, no other consumers. Self-contained.
- `location_competitors` table — read by curate flow + ranking pipeline (`findActiveByLocationId`). Adding a nullable column is safe; ranking pipeline ignores unknown columns.
- `PLACE_DETAILS_FIELD_MASK` — used by `getPlaceDetails` callers (curate add-flow + checkup route at `routes/checkup.ts:1022` per earlier grep). Adding a field to a field mask returns MORE data; existing callers ignore unknown fields. Safe.
- New `/api/practice-ranking/photo` route — no consumers yet, additive.
- Backfill script — runs once, touches data only on NULL columns.

**Pushback (resolved during Phase 2):**
- "Open now" and multi-photo carousels rejected. Photo + phone/website backfill is the only "more data" worth the spend.

## Tasks

### T1: Migration — `photo_name` column on `location_competitors`
**Do:**
- New migration `20260428000004_add_photo_name_to_location_competitors.ts`:
  - `ALTER TABLE location_competitors ADD COLUMN photo_name VARCHAR(500) NULL`
- Match docstring + alterTable shape of `20260428000003_add_self_filter_and_rich_competitor_fields.ts`.
- Down: drop column.

**Files:** `src/database/migrations/20260428000004_add_photo_name_to_location_competitors.ts`, `plans/.../migrations/{pgsql.sql, mssql.sql, knexmigration.js}`

**Depends on:** none

**Verify:** Apply (resolve cross-repo migration drift first, OR run via the same one-shot script pattern used for migration 003). `\d location_competitors` shows `photo_name` nullable.

### T2: Model + interface updates
**Do:**
- `LocationCompetitorModel.ts`: add `photo_name: string | null` to `ILocationCompetitor`. Add `photoName?: string | null` to `AddCompetitorInput`. Thread through `addCompetitor` insert + revive paths (preserve existing on revive, accept input on new insert).

**Files:** `src/models/LocationCompetitorModel.ts`

**Depends on:** T1

**Verify:** `npx tsc --noEmit` clean.

### T3: Backend — extend field mask, capture photo_name, photo proxy endpoint
**Do:**
- `src/controllers/places/feature-utils/fieldMasks.ts`: add `"photos"` to `PLACE_DETAILS_FIELD_MASK`. Verify existing callers (curate add-flow, checkup) tolerate the extra field — they do (passthrough).
- `src/controllers/places/feature-services/GooglePlacesApiService.ts`: add `getPlacePhotoMedia(photoName, maxHeightPx): Promise<{ buffer: Buffer; contentType: string }>` that GETs `places.googleapis.com/v1/{photoName}/media?maxHeightPx={n}&key={GOOGLE_PLACES_API_KEY}` with `responseType: 'arraybuffer'`. Returns the bytes + content-type for the controller to stream.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts:200-228`: `placesToCompetitors` already maps photos count; ALSO surface `photoName: place.photos?.[0]?.name || null` on the `DiscoveredCompetitor` type.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`:
  - In `runDiscoveryForLocation`'s addCompetitor loop, pass `photoName: comp.photoName ?? null`.
  - In `addCustomCompetitor`, capture `photoName: placeDetails?.photos?.[0]?.name ?? null` and pass through.
- `src/controllers/practice-ranking/PracticeRankingController.ts`:
  - In `getLocationCompetitors` response, add `photoName: c.photo_name` to each competitor.
  - New handler `getCompetitorPhoto(req, res)` that:
    - Validates the `photoName` query param (must start with `places/` and contain `/photos/`)
    - Calls `getPlacePhotoMedia(photoName, 200)`
    - Sets `Cache-Control: public, max-age=86400` and `Content-Type` from the response
    - Streams the buffer
- `src/middleware/publicRateLimiter.ts`: add `placesPhotoLimiter` (60 req/min/IP).
- `src/routes/practiceRanking.ts`: register `GET /photo` (NOT `/photos/:name` — use query param to sidestep encoding pain) behind the existing auth middleware + new limiter.

**Files:** modified `fieldMasks.ts`, `GooglePlacesApiService.ts`, `service.places-competitor-discovery.ts`, `service.location-competitor-onboarding.ts`, `PracticeRankingController.ts`, `publicRateLimiter.ts`, `practiceRanking.ts` (routes)

**Depends on:** T2

**Verify:** Manual cURL: `curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/practice-ranking/photo?name=places%2FChIJ...%2Fphotos%2FAdDdOWp..."` returns image bytes. New `addCustomCompetitor` call populates `photo_name` for the new row. New discovery (on a fresh location) populates `photo_name` for all 10 initial_scrape rows. `npx tsc --noEmit` clean.

### T4: Backfill script — refresh phone/website/photo for existing rows
**Do:**
- One-shot script `scripts/backfill-competitor-rich-data.ts` (deletable after one run):
  - SELECT `location_competitors` rows WHERE `removed_at IS NULL` AND (`phone IS NULL` OR `website IS NULL` OR `photo_name IS NULL`).
  - For each, `getPlaceDetails(place_id)`. Update phone/website/photo_name only where the existing column is NULL (don't trample).
  - Throttle to 5 req/sec to stay under Places quota.
  - Log per-row: row id, fields updated, skipped reasons.
  - Exit cleanly; print summary (`updated: N rows; failed: M; skipped: K`).
- Run once on dev DB. Then `rm` the file. NOT committed.

**Files:** `scripts/backfill-competitor-rich-data.ts` (untracked, deleted after run)

**Depends on:** T3

**Verify:** Pre-run query: count rows with NULL phone/website/photo_name. Run script. Post-run: same query returns ~0 (modulo Places not having the field for a given business). Spot-check 3 random rows in the UI — phone/website/thumbnail render.

### T5: Frontend — install Leaflet, replace `<CompetitorMap>` with Leaflet impl
**Do:**
- `frontend/package.json`: add `leaflet@^1.9` and `react-leaflet@^4.2` and `@types/leaflet@^1.9` to dependencies. `npm install` in `frontend/`.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`:
  - Import `MapContainer, TileLayer, Marker, useMap` from `react-leaflet`; import `L` from `leaflet`; import `leaflet/dist/leaflet.css`.
  - Replace the Google iframe + percent-projected pins inside `<CompetitorMap>` with `<MapContainer>` + `<TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />` + a `<Marker>` per competitor + a single distinct `<Marker>` for `practiceLocation` (YOU pin).
  - Use Leaflet's `bounds` API: `map.fitBounds([...competitorLatLngs, practiceLatLng], { padding: [40, 40] })` on mount and on data change. Replaces the manual padding math.
  - Custom `DivIcon` for competitor markers: orange circle with the index number (matches existing visual). For the YOU pin: navy circle with white "YOU" text.
  - Stage 1 reveal animation removed (acceptable per R6); pins land all at once.
  - Loading fallback (the radar shimmer + "Scanning Google…" copy) preserved as overlay rendered when `competitors.length === 0` and `showLoadingFallback`.
  - Accept new optional props: `selectedPlaceId: string | null`, `onPinClick: (placeId: string) => void`. Selected pin gets `zIndexOffset={1000}` and a CSS pulse class on its DivIcon's HTML.

**Files:** modified `frontend/package.json`, `frontend/package-lock.json`, modified `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`

**Depends on:** T3

**Verify:** Manual: dev server. Curate page renders Leaflet map with OSM tiles, competitor markers numbered 1-N, navy YOU marker, attribution visible, no console errors. `npm run build` in `frontend/` succeeds (Leaflet bundles cleanly).

### T6: Frontend — bidirectional click sync + pulse animation + photo thumbnails in row
**Do:**
- `frontend/src/api/practiceRanking.ts`: `CuratedCompetitor` gets `photoName: string | null`.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`:
  - New state at the page level: `selectedPlaceId: string | null` + `selectedFromList: boolean` flag (so we know whether to scroll the map or the row).
  - New ref: `rowRefs: Map<string, HTMLLIElement>` — list rows register their refs by placeId.
  - New ref: `mapContainerRef: React.RefObject<HTMLDivElement>` — map wrapper for `scrollIntoView`.
  - Pass `selectedPlaceId` + `onPinClick={(id) => { setSelectedFromList(false); setSelectedPlaceId(id); }}` to `<CompetitorMap>`.
  - Row `onClick`: `setSelectedFromList(true); setSelectedPlaceId(c.placeId);`.
  - Effect on `selectedPlaceId` change: if `selectedFromList`, `mapContainerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })` and let the map's internal effect do the pulse. If not, look up `rowRefs.get(selectedPlaceId)?.scrollIntoView({ block: "center", behavior: "smooth" })`. After 2000ms, `setSelectedPlaceId(null)`.
  - Clearing timer must be reset on each new selection (debounced, not stacked).
  - CSS keyframe in a top-level `<style>` block (or new `competitor-onboarding.css`): `@keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(244,116,54,0.6); } 100% { box-shadow: 0 0 0 12px rgba(244,116,54,0); } }`. Class `.is-selected` applies it.
  - Row gets `is-selected` class when its placeId === selectedPlaceId; rendered as a 1.5s 2-iteration ring around the row.
  - Pin DivIcon's HTML wraps the orange circle in a `<div class="alloro-pin {is-selected ? 'is-selected' : ''}">…</div>` so the same keyframe applies.
  - Photo thumbnail in the row: `{c.photoName && <img src={`/api/practice-ranking/photo?name=${encodeURIComponent(c.photoName)}`} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" alt={c.name} loading="lazy" />}`. Hide when null (no placeholder, row reflows).

**Files:** modified `frontend/src/api/practiceRanking.ts`, modified `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`

**Depends on:** T5

**Verify:** Manual:
- Click a list row → page scrolls to map, the matching pin pulses + is on top of any overlapping siblings, pulse stops within ~2s.
- Click a pin → page scrolls so the matching row is centered, row pulses with an orange ring, stops within ~2s.
- Rapid sequential clicks: pulse resets on each click, no stacking.
- Photo thumbnails render where data exists, row collapses cleanly when null.
- `npm run build` in `frontend/` succeeds.

## Done
- [ ] `npx knex migrate:latest` (or one-shot script) applies migration `20260428000004` cleanly; rollback reverses cleanly.
- [ ] `npx tsc --noEmit` clean (backend + frontend).
- [ ] `npm run build` in `frontend/` succeeds with Leaflet imports.
- [ ] Manual: Stage 2 renders Leaflet map with OSM tiles, numbered competitor pins, navy YOU pin, OSM attribution.
- [ ] Manual: clicking a list row scrolls to map and pulses the matching pin (which is z-ordered on top); auto-clears within 2s.
- [ ] Manual: clicking a pin scrolls the row into view and pulses it; auto-clears within 2s.
- [ ] Manual: photo thumbnails render in rows where Google has them; rows without a photo collapse cleanly.
- [ ] Backfill script run once on dev DB; existing rows now show phone/website/photo where Places has them.
- [ ] No regressions on existing finalized locations or v1-legacy rows.
- [ ] Lint passes for changed files.
