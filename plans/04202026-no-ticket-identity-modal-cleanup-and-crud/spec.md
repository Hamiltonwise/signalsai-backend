# Identity Modal Cleanup + CRUD

## Why
Five Identity modal issues surfaced while validating the prefill-fixed warmup run:

1. Warmup uploads scraped + GBP photos to S3 but skips the `media` table entirely — Images tab renders, but the Media Browser can't see any of them. Admins can't reuse warmup-captured photos in page generation.
2. Services + Doctors lists are read-only; admins can't add missing entries or fill in blank source URLs / blurbs. Warmup misses things (e.g. services without dedicated pages) and there's no recourse.
3. Chat Update tab is dead weight — the proposer flow is over-engineered for a bulk-edit use case that's better served by direct JSON editing.
4. JSON tab uses a plain `<textarea>` — no syntax highlighting, no validation, no indent guides. Makes debugging identity painful.
5. No surgical edit surface for doctors/services slices — admins currently have to open the full-identity JSON tab and hunt for the right section.

## What
Six tightly scoped changes:

1. **Media backfill** — warmup image pipeline inserts into `media` table alongside the JSONB write. Plus an idempotent backfill for existing projects.
2. **Add/edit services** — "Add service" row + per-row edit. Empty fields show the current value as placeholder (not clearing); explicit `null` clears.
3. **Add/edit doctors** — same UX as services.
4. **Remove Chat Update** — wire-rip frontend + backend (tab, component, state, controller handlers, routes, service file, frontend API).
5. **Monaco JSON editor** — replace the full-identity textarea with `@monaco-editor/react`, formatted, validated on keystroke.
6. **Edit-source bottom panel** — slide-up drawer on Doctors/Services tabs (matching `LeadgenSubmissionDetail` pattern) showing just that identity slice in Monaco. Invalid JSON shows a transient warning and empty main view; revert to last-saved on close.

## Context

**Relevant files:**
- `src/database/migrations/20260214000000_create_media_table.ts` — existing `media` schema (columns: `id`, `project_id`, `filename`, `display_name`, `s3_key`, `s3_url`, `file_size`, `mime_type`, `alt_text`, `width`, `height`, `thumbnail_s3_key`, `thumbnail_s3_url`, `original_mime_type`, `compressed`, `created_at`, `updated_at`).
- `src/controllers/admin-media/feature-services/service.media-upload.ts:172-186` — `MediaModel.create()` insertion pattern. Reference for T1.
- `src/controllers/admin-websites/feature-utils/util.image-processor.ts:71-173` — `processImages()` does S3 upload + Claude vision. T1 hooks media insert here, right after successful S3 upload.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts:460` — writes `extracted_assets.images` into JSONB. Unchanged in this plan.
- `src/models/website-builder/MediaModel.ts` (probably — locate during execution) — expose a `createFromWarmupImage(projectId, imageAnalysisResult)` helper.
- `frontend/src/components/Admin/IdentityModal.tsx` — owns the modal. Chat Update lives at line 1249 (tab button) + 1307-1322 (body). JSON tab textarea at line 1822. Both get rewritten here.
- `frontend/src/components/Admin/LeadgenSubmissionDetail.tsx` — **reference file** for slide-up panel pattern (line 397-512 shows `AnimatePresence` + `motion.aside` + backdrop).
- `src/controllers/admin-websites/AdminWebsitesController.ts:805-870` — `proposeIdentityUpdates` + `applyIdentityProposals` handlers — **delete** in T4.
- `src/controllers/admin-websites/feature-services/service.identity-proposer.ts` — **delete** entirely in T4.
- `src/routes/admin/websites.ts:301-305` — `POST /:id/identity/propose-updates` + `POST /:id/identity/apply-proposals` routes — **delete** in T4.
- `frontend/src/api/websites.ts:617-656` — `proposeIdentityUpdates()` + `applyIdentityProposals()` — **delete** in T4.

**Patterns to follow:**
- **Media insert:** existing `MediaModel.create()` call in `service.media-upload.ts:172`. Warmup images get `display_name` from Claude vision description, `alt_text` from same description, and the `use_case` tag stored either in `display_name` or a separate metadata field.
- **Slide-up drawer:** `LeadgenSubmissionDetail.tsx` (AnimatePresence + motion.aside + overlay backdrop, framer-motion spring).
- **Monaco integration:** `@monaco-editor/react` default `JSON` language, `vs-dark` theme, `automaticLayout: true`, `minimap.enabled: false`, `formatOnPaste: true`.
- **Idempotent backfill:** `INSERT ... ON CONFLICT (s3_url) DO NOTHING` (requires adding a unique index on `media.s3_url` scoped to project_id).
- **Slice PATCH endpoint:** one endpoint `PATCH /api/admin/websites/:id/identity/slice` with body `{path: "content_essentials.doctors", value: Array<...>}`. Value replaces the slice wholesale. Validator checks path is on an allow-list.

**Reference files:**
- `frontend/src/components/Admin/LeadgenSubmissionDetail.tsx` — slide-up drawer structure.
- `frontend/src/components/Admin/IdentityImagesTab.tsx` — sibling tab component pattern (already uses `identity.extracted_assets.images`; doesn't need changes, but shows the card layout that services/doctors tabs should match).

## Constraints

**Must:**
- Media backfill migration is idempotent: re-runs produce zero inserts. Use a unique index on `(project_id, s3_url)`.
- Warmup's inline media insert is **fire-and-forget** — a media DB error must not tank warmup. Log + continue.
- Add/edit merge semantics: **empty input field shows the current value as placeholder** (not clearing). The user must type a new value to overwrite. Explicit `null` via the JSON editor clears. Confirmed with Dave.
- Edit-source panel on invalid JSON: **transient warning** + empty main view behind the drawer. On drawer close with unsaved invalid input, revert to last-saved state. No persisted bad data.
- Slice PATCH endpoint accepts only an allow-list of paths: `content_essentials.doctors`, `content_essentials.services`, `locations`, `brand`, `content_essentials.featured_testimonials`, `content_essentials.core_values`, `content_essentials.certifications`, `content_essentials.service_areas`, `content_essentials.social_links`, `content_essentials.unique_value_proposition`, `content_essentials.founding_story`, `content_essentials.review_themes`, `voice_and_tone`. Reject everything else with 400.
- Monaco editor lazy-loads (`React.lazy` + `Suspense`) — don't force a 350kb bundle on every page.
- Chat Update removal is total: no orphan imports, no dead endpoints, no leftover prompt file.

**Must not:**
- Don't touch `identity.extracted_assets.images` shape — only the media table.
- Don't introduce a new migrations framework — use the existing Knex migration pattern.
- Don't rewrite `MediaModel` — just call its existing `create()`.
- Don't add a second JSON editor library (Monaco only).
- Don't wire the Edit-source panel for every tab — scope is Doctors + Services only. Locations already has its own CRUD via the Locations tab's add/set-primary/remove.

**Out of scope:**
- Redesigning the Images tab (already shipped).
- Media library dedup — if two projects have the same `s3_url` from the same upload (unlikely but possible), they each get their own media row. No cross-project dedup.
- Bulk operations on doctors/services (reorder, bulk delete, bulk edit).
- Revision history / undo for slice edits. Last-write-wins.
- Auto-suggesting services/doctors from reviews — that's the distillation LLM's job.

## Risk

**Level:** 2. T1 + T2 (media insert + backfill) touch shared DB state; rest is isolated frontend work + a Monaco dep.

**Risks identified:**
- **Media backfill race.** If a warmup is running while backfill executes, could double-insert. → **Mitigation:** unique index on `(project_id, s3_url)` makes the insert idempotent. Both paths use `ON CONFLICT DO NOTHING`.
- **Monaco bundle size.** `@monaco-editor/react` pulls in ~350kb gzipped. → **Mitigation:** lazy-load via `React.lazy`. Only loaded when JSON tab or Edit-source panel opens.
- **Slice PATCH allows arbitrary identity shape.** If caller sends garbage for `content_essentials.doctors`, we persist it. → **Mitigation:** runtime Zod validation per slice. Reject invalid shapes with 400.
- **Chat Update removal may have stale imports I missed.** → **Mitigation:** post-wire-rip, `tsc --noEmit` catches dead imports. Also grep for `proposeIdentityUpdates|applyIdentityProposals|IdentityChat|identity-proposer` after.
- **Monaco + React 19 compat.** `@monaco-editor/react` currently supports React 18+. R19 is officially supported on >=4.6.0. → **Mitigation:** pin to latest (4.6+), verify TS build succeeds.

**Blast radius:**
- Warmup: adds one fire-and-forget DB call per image. Negligible latency.
- Media backfill: one-time migration scanning all projects' JSONB. Read-heavy, bounded by project count × images-per-project (typically ~50 per project).
- Chat Update removal: pure deletion. No existing callers beyond the modal.
- Monaco: frontend bundle grows ~350kb lazy-loaded. Gated behind `<Suspense>` fallback.
- Slice PATCH endpoint: net-new. No existing consumers.

**Pushback:**
- **Chat Update could have been repurposed** as a natural-language edit path — but the proposer flow is 500+ lines of machinery for a feature that's better handled by direct JSON editing in Monaco. Dave's call stands: wire-rip.
- **Add-service / add-doctor as inline-editable rows vs. modal form.** Inline rows are lower-friction for quick fixes. The Edit-source panel covers bulk edits. Both are in scope.
- **Backfill could be a one-off script (`scripts/debug-warmup/`) instead of a migration** — cleaner because migrations aren't for data mutation. But Dave picked idempotent migration. Going with that; can revert if the migration approach feels wrong.

## Tasks

Two-lane dispatch. Lane A (backend) and Lane B (frontend) share the slice-PATCH contract but own disjoint files. Sequential tasks within each lane.

### Lane A — Backend (Agent 1)

#### T1: Media insert hook in warmup image pipeline
**Do:** In `src/controllers/admin-websites/feature-utils/util.image-processor.ts`, after the successful `uploadToS3` call around line 105, also insert a row into `media` via `MediaModel.create()` or a thin helper. Column mapping:
- `project_id` = warmup's projectId
- `filename` = `path.basename(s3Key)` or derived from the original `source_url`
- `display_name` = Claude vision `description` (truncated to 255 chars)
- `alt_text` = Claude vision `description`
- `s3_key` + `s3_url` = from the upload
- `mime_type` = detected from the fetch response
- `file_size` = buffer length
- `width`/`height` = skip (not available without running image-size lib); set to null
- `original_mime_type` = same as mime_type
- `compressed` = false (we upload as-is)

Wrap the insert in try/catch; log on failure and continue (fire-and-forget — must not tank warmup).

Signature change: `processImages(projectId, imageUrls, signal)` already takes `projectId` so no signature change needed.
**Files:** `src/controllers/admin-websites/feature-utils/util.image-processor.ts`.
**Depends on:** none.
**Verify:** Warm up a test project, then query `SELECT COUNT(*) FROM website_builder.media WHERE project_id = ?` — expect non-zero count matching `jsonb_array_length(project_identity->'extracted_assets'->'images')`.

#### T2: Media backfill migration + unique index
**Do:** Two migration files (timestamp sequentially):

1. `{ts}_add_unique_project_s3url_to_media.ts` — add unique index `idx_media_project_s3url` on `(project_id, s3_url)` where `s3_url IS NOT NULL`. Safe for new + existing data (duplicates can be handled pre-migration with a one-shot cleanup if they exist).
2. `{ts+1}_backfill_media_from_identity_images.ts` — iterate every `website_builder.projects` row; for each, read `project_identity->'extracted_assets'->'images'` JSONB array; for each image with `s3_url` set, insert into `media` with `ON CONFLICT (project_id, s3_url) DO NOTHING`. Log counts (projects processed, rows inserted, rows skipped).

Migration uses a streaming cursor so 100+ projects don't OOM.
**Files:** Two new migration files under `src/database/migrations/`, plus scaffolds in `plans/04202026-.../migrations/{pgsql.sql,mssql.sql,knexmigration.js}`.
**Depends on:** T1 (not strictly — T1 can ship separately — but logically the backfill comes after the live-insert path exists).
**Verify:** Run `npm run db:migrate`. Query `media` count for a project that warmed up before T1 shipped — expect the same count as its `extracted_assets.images` length.

#### T3: Slice PATCH endpoint
**Do:** New handler in `AdminWebsitesController.ts` — `patchIdentitySlice(req, res)`. Route: `PATCH /api/admin/websites/:id/identity/slice` with body `{path: string, value: unknown}`.

Allow-list (reject everything else with 400 + `INVALID_PATH`):
- `content_essentials.doctors`
- `content_essentials.services`
- `content_essentials.featured_testimonials`
- `content_essentials.core_values`
- `content_essentials.certifications`
- `content_essentials.service_areas`
- `content_essentials.social_links`
- `content_essentials.unique_value_proposition`
- `content_essentials.founding_story`
- `content_essentials.review_themes`
- `locations`
- `brand`
- `voice_and_tone`

Per-slice Zod validators enforce shape (e.g. `doctors` must be an array of `{name, source_url?, short_blurb?, credentials?, location_place_ids?, last_synced_at, stale?}`). On pass, write the slice with `lodash.set` or a hand-rolled path-set, then persist the whole `project_identity` JSONB.

Register route in `src/routes/admin/websites.ts`.

Add frontend API function `patchIdentitySlice(projectId, path, value)` in `frontend/src/api/websites.ts`.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/routes/admin/websites.ts`, `frontend/src/api/websites.ts`.
**Depends on:** none.
**Verify:** `curl -X PATCH /api/admin/websites/{id}/identity/slice -d '{"path":"content_essentials.doctors","value":[]}'` → 200 + clears doctors.

#### T4: Chat Update wire-rip (backend half)
**Do:** Delete the following:
- `src/controllers/admin-websites/feature-services/service.identity-proposer.ts` (entire file)
- `AdminWebsitesController.ts` lines 805-870 (`proposeIdentityUpdates` + `applyIdentityProposals` handlers) — also delete the `identityProposer` import at the top
- `src/routes/admin/websites.ts` lines 301-305 (both routes)
- Any prompt file it loaded — look for `websiteAgents/identity/proposer*.md` or similar and delete.

Run `tsc --noEmit` to catch orphan imports. Grep `proposeIdentityUpdates|applyIdentityProposals|IdentityProposal|identity-proposer` — expect zero hits after.
**Files:** listed above.
**Depends on:** none (but do this LAST in Lane A so T3's patch endpoint doesn't get caught in any leftover references).
**Verify:** backend `npx tsc --noEmit` clean. Repo grep for proposer terms returns zero results.

---

### Lane B — Frontend (Agent 2)

#### T5: Monaco shared component + dependency
**Do:** Add `@monaco-editor/react@^4.6.0` (or latest) to `frontend/package.json`. New file `frontend/src/components/Admin/MonacoJsonEditor.tsx`:

```tsx
// Thin wrapper around @monaco-editor/react pre-configured for JSON.
interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  readOnly?: boolean;
  /** Fires whenever Monaco reports parse errors. */
  onValidationChange?: (isValid: boolean) => void;
}
```

- Use `lazy` from React + `<Suspense fallback={<Spinner/>}>` so the Monaco bundle loads on-demand.
- Configure: `language="json"`, `theme="vs-light"` (to match app look), `options={{minimap: {enabled: false}, formatOnPaste: true, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2}}`.
- `onValidate` callback → call `onValidationChange(markers.length === 0)`.
**Files:** `frontend/package.json`, `frontend/src/components/Admin/MonacoJsonEditor.tsx` (new).
**Depends on:** none.
**Verify:** `npm install` succeeds, `npx tsc --noEmit` passes.

#### T6: Replace JSON tab textarea with Monaco
**Do:** In `IdentityModal.tsx`, the `IdentityJsonEditor` component (around line 1804) — swap the `<textarea>` for `<MonacoJsonEditor>`. Pipe `draft` + `setDraft` through. Disable Save button when `isValid === false`.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`.
**Depends on:** T5.
**Verify:** Open JSON tab — Monaco renders with current identity, syntax-highlighted, editable. Paste invalid JSON → Save button disables.

#### T7: Edit-source slide-up panel component
**Do:** New file `frontend/src/components/Admin/IdentitySliceEditor.tsx` — generic slide-up drawer matching `LeadgenSubmissionDetail.tsx`'s pattern:

```tsx
interface Props {
  open: boolean;
  title: string;                          // e.g. "Edit Doctors Source"
  slicePath: string;                      // e.g. "content_essentials.doctors"
  initialValue: unknown;                  // pulled from identity
  onSave: (newValue: unknown) => Promise<void>;  // calls patchIdentitySlice
  onClose: () => void;
}
```

Structure:
- `AnimatePresence` + `motion.aside` sliding from the **bottom** (not right like leadgen). Height: 70vh. Rounded top corners.
- Backdrop click closes with a "Discard changes?" confirm if there are unsaved edits.
- Body: `<MonacoJsonEditor value={JSON.stringify(initialValue, null, 2)} onChange={setDraft} onValidationChange={setIsValid} height="calc(70vh - 120px)">`
- Footer: Cancel + Save (disabled when invalid or unchanged).
- Transient invalid state: when `isValid === false`, show inline warning ("Invalid JSON — fix before saving") but the main view behind the drawer does **not** re-render with invalid data. The calling tab passes a `onInvalidPreview?: () => void` hook so it can clear its own render while editing; on close (saved OR cancelled), the calling tab re-reads from identity.
**Files:** `frontend/src/components/Admin/IdentitySliceEditor.tsx` (new).
**Depends on:** T5.
**Verify:** Render the component in isolation with a mock slice — slides up, edits persist on save, cancel reverts.

#### T8: Wire Edit-source into Doctors + Services tabs
**Do:** In the doctors + services tab components (whichever section of `IdentityModal.tsx` owns them), add an "Edit source" button in the header (next to Re-sync). Clicking opens `<IdentitySliceEditor>` with the right path + value. On save, call `patchIdentitySlice` and refresh the identity.

Handle the transient invalid-main-view rule: tab tracks `isEditingSource` + `sourceIsInvalid`; when both are true, render empty state with a warning banner.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`.
**Depends on:** T3 (backend endpoint), T7 (panel).
**Verify:** Doctors tab → Edit source → Monaco loads → edit → save → doctors re-render with new data.

#### T9: Add/edit services + doctors UX
**Do:** In the same tab bodies (doctors + services), add an "Add" button in the header. Each row gets an "Edit" action.

- **Add**: inline row at the bottom with blank fields. Placeholder text shows what goes there ("e.g. Dr. John Smith"). Save pushes a new entry onto the array via `patchIdentitySlice` with the full updated array.
- **Edit**: inline expand-to-edit the row. Each field shows the **current value** as placeholder (Dave's call). Empty input = no change. Explicit `null` isn't reachable from this UI (only via Edit-source JSON) — this is deliberate.
- Validation: `name` is required. URLs validated with `new URL()` try/catch. Blurb max 400 chars (matches distillation cap).
- Save calls `patchIdentitySlice('content_essentials.doctors', updatedArray)` (or `.services`).

Stamp `last_synced_at` to `new Date().toISOString()` on any manual edit — marks it as admin-touched.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`.
**Depends on:** T3 (backend endpoint).
**Verify:** Services tab → Add → fill name + blurb → save → row appears. Edit existing service → source_url field shows current URL as placeholder → type new URL → save → updates.

#### T10: Chat Update wire-rip (frontend half)
**Do:** In `IdentityModal.tsx`:
- Delete the `<TabButton label="Chat Update" />` at line ~1249.
- Delete the Chat Update body at lines 1307-1322 (the `<IdentityChat>` render).
- Delete the component file `frontend/src/components/Admin/IdentityChat.tsx` if it exists.
- Delete state: `chatInstruction`, `setChatInstruction`, `proposals`, `setProposals`, `approvedIds`, `setApprovedIds`, `criticalAcknowledged`, `setCriticalAcknowledged`, `applyingProposals`, `chatLoading`, `chatToast`.
- Delete handlers: `handleChatSubmit`, `handleApplyProposals`, `handleDiscardProposals`, `handleToggleProposal`.
- Delete imports: `IdentityProposal` type, `proposeIdentityUpdates`, `applyIdentityProposals`.
- Remove `"chat"` from the `IdentityTab` union.

Frontend API: delete `proposeIdentityUpdates` + `applyIdentityProposals` + `IdentityProposal` type from `frontend/src/api/websites.ts`.

Grep sweep: `IdentityChat|proposeIdentityUpdates|applyIdentityProposals|chatInstruction|chat_update` — expect zero hits.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`, `frontend/src/components/Admin/IdentityChat.tsx` (delete), `frontend/src/api/websites.ts`.
**Depends on:** none (frontend-side only; T4 handles backend).
**Verify:** Frontend `npx tsc --noEmit` clean. Identity modal tab bar shows Summary / JSON / Doctors / Services / Locations / Images (no Chat Update).

## Done
- [ ] `npx tsc --noEmit` clean in both `/` and `/frontend`.
- [ ] `npm run db:migrate` applies both T2 migrations cleanly.
- [ ] After migrations, Media tab on the Coastal project shows every image that Images tab shows.
- [ ] A fresh warmup on a different project inserts media rows live (not just backfill).
- [ ] Chat Update tab is gone from the UI. Backend routes return 404. Grep for `IdentityChat|propose_updates|apply-proposals` across the repo returns zero hits.
- [ ] JSON tab renders Monaco with syntax highlighting + validation.
- [ ] Save button on JSON tab disables when the editor reports invalid JSON.
- [ ] Doctors tab has Add + per-row Edit + Edit source buttons.
- [ ] Services tab has Add + per-row Edit + Edit source buttons.
- [ ] Edit source slides up from the bottom, edits persist on save, invalid JSON blocks save and shows a warning, cancel reverts.
- [ ] No regression: warmup still produces doctors/services/images/UVP correctly.

## Revision Log
_(empty — populate during --continue if scope changes)_
