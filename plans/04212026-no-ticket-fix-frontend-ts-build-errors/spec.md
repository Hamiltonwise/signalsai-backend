# Fix Frontend TS Build Errors

## Why
`npm run build` fails in `frontend/` with 38 TS errors, blocking CI, dev-server stability, and any downstream deploy. The errors split into three real defects (type drift, signature drift, missing required field) and one cleanup (dead code from the removed manual-website-setup flow).

## What
`cd frontend && npx tsc --noEmit` exits with zero errors. `npm run build` completes. No runtime behavior changes except the two `confirm()` prompts, which upgrade from browser `window.confirm` semantics to the app's `ConfirmModal` dialog (already the intended behavior — the string args were a bug).

## Context

**Relevant files:**
- `frontend/src/api/websites.ts` — `ProjectIdentity` type definition (line 51). Missing `locations`, `content_essentials.doctors`, `content_essentials.services` fields despite backend returning them and `websites.ts` itself declaring those return shapes at lines 1956-1971 (`ProjectIdentityLocation`), 1947-1953 (`ProjectIdentityListEntry`), and 1973 (`IdentityListName = "doctors" | "services"`).
- `frontend/src/components/Admin/IdentityModal.tsx` — reads `content_essentials.doctors/services` (1112-1119) and `(identity as any).locations` (1122-1124, currently cast around the type gap). Brand save call at 1406 spreads possibly-undefined `brand` into an object assigned to `ProjectIdentityBrand`.
- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` — reads `identity.locations` (128-129) and `content_essentials.doctors/services` (154-155) without casts.
- `frontend/src/pages/admin/PageEditor.tsx` — `livePreviewProgress` state reader unused (437); setter used at 562, 568, 594, 645.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — carries a dead cluster from the removed manual-website-setup flow (commit `8dbe2be2` added it, later replaced by the template + warmup pipeline). Dead cluster: 5 handlers (`handleTemplateChange`, `handleSearchChange`, `handleKeyDown`, `handleConfirmSelection`, `handleClearSelection`), state only read inside those handlers (`searchQuery`, `searching`, `searchError`, `templates`, `loadingTemplates`, `primaryColor`, `accentColor`, `dataSource`, `scrapedData`, `pageWebsiteUrls`, `pagePathInputs`, `isSkipping`), and unused imports (`MapPin`, `Phone`, `Search`, `ArrowRight`, `DynamicSlotInputs`, `ColorPicker`). Also two `confirm("…")` calls (692, 1060) pass strings where `ConfirmOptions` is required (the hook from `useConfirm()`, not `window.confirm`). Line 861 maps to `PageGenerationStatusItem[]` but omits the required `generation_progress` field.
- `frontend/src/components/ui/ConfirmModal.tsx` — `ConfirmOptions = { title; message?; confirmLabel?; cancelLabel?; variant? }`. Matches the existing passing calls in the same file (474, 894, 922, 951, 1951, 2028, 2116).

**Patterns to follow:**
- Type drift → fix the type in `websites.ts`, not at call sites. The existing `(identity as any).locations` cast at `IdentityModal.tsx:1122-1124` is a workaround that should be removed once the type is correct.
- `ConfirmOptions` shape → match the `variant: "danger"` pattern already used at `WebsiteDetail.tsx:474, 894, 922, 951` for cancel/delete prompts.
- Dead code removal → delete, do not rename with `_` prefix. Git history preserves it. No `// removed` comments.

**Reference file:** `frontend/src/pages/admin/WebsiteDetail.tsx:474` — canonical example of a `confirm(...)` call with the correct `ConfirmOptions` shape for a destructive action.

## Constraints

**Must:**
- Extend `ProjectIdentity` in `websites.ts` with optional `locations`, and extend `content_essentials` with optional `doctors`/`services`. Use existing `ProjectIdentityLocation` and `ProjectIdentityListEntry` types — do not re-declare.
- Remove the `(identity as any)` cast at `IdentityModal.tsx:1122` after the type is corrected.
- For the brand save in `IdentityModal.tsx:1406`, explicitly set `logo_s3_url: brand?.logo_s3_url ?? null` and `logo_alt_text: brand?.logo_alt_text ?? null` inside the `onSave` call so the output always satisfies `ProjectIdentityBrand`'s required nullable fields.
- Convert the two stray `confirm("…")` calls in `WebsiteDetail.tsx` to `await confirm({ title: "…", variant: "danger" })`. `handleCancelLayouts` (690) must become `async` if not already, and the `if (!…)` branch must be adjusted since `confirm` is now async.
- For `PageEditor.tsx:437`, destructure as `const [, setLivePreviewProgress] = useState<…>(…)` (reader unused, setter used).
- For `WebsiteDetail.tsx:861`, add `generation_progress: null` to the mapped object so the shape matches `PageGenerationStatusItem`.

**Must not:**
- Do not add new runtime dependencies.
- Do not refactor files beyond what the errors force. No drive-by cleanups in `IdentityModal`, `ImportFromIdentityModal`, or `PageEditor`.
- Do not reintroduce `window.confirm` — the project standardized on the `useConfirm()` modal.
- Do not silence errors with `@ts-ignore` / `@ts-expect-error` / `as any`.

**Out of scope:**
- Any other TS warnings that surface after the build passes are not this task. Record them but do not fix them here.
- The backend shape of `ProjectIdentity` — we're aligning the frontend type with what the backend already returns, not changing the backend.
- Any redesign of the brand save flow or removed manual-setup flow — we delete dead code, we do not revive or reshape it.

## Risk

**Level:** 2 — Concern (tech-debt removal in `WebsiteDetail.tsx` has modest blast radius; everything else is mechanical).

**Risks identified:**
- **Dead-code deletion hides in-progress work.** → **Mitigation:** verified via grep that the 5 handlers in `WebsiteDetail.tsx` are never invoked from JSX or elsewhere, and that the state variables are only read inside those handlers. The branch `dev/dave` has no uncommitted work touching these identifiers. If user recalls any in-progress plan that depends on this code, halt before executing.
- **`ProjectIdentity` type extension could mask a real shape mismatch somewhere else.** → **Mitigation:** making the new fields optional (`locations?`, `content_essentials?.doctors?`, etc.) preserves defensive `Array.isArray(...)` checks already in the consumers. No runtime behavior change.
- **`confirm` change at 692/1060 flips sync→async.** → **Mitigation:** both call sites are already inside `async` functions; the `if (!confirm(…)) return;` pattern becomes `if (!(await confirm({ … }))) return;`. No other logic around the prompts depends on timing.

**Blast radius:**
- `ProjectIdentity` type change — consumers: `IdentityModal.tsx`, `ImportFromIdentityModal.tsx`, `IdentityImagesTab.tsx`, `PostsTab.tsx`, `AddLocationModal.tsx`, `websites.ts` internals. All benefit from the correction; none should break.
- `PageGenerationStatusItem` — only consumer mapping in new shape is `WebsiteDetail.tsx:861`; all other usages already read `generation_progress`.
- Dead-code delete in `WebsiteDetail.tsx` — zero external consumers (nothing imports these identifiers).
- `PageEditor.tsx` destructuring tweak — isolated to one state hook.

**Pushback:** None. Every change is a forced move from the error set. The dead-code cleanup is compelled because TS `noUnusedLocals` flags the setters — we either delete the setters (breaking the readers), delete both, or suppress. Delete both is the only sound option.

## Tasks

### T1: Extend `ProjectIdentity` type to match backend reality
**Do:**
- In `frontend/src/api/websites.ts` at the `ProjectIdentity` interface (line 51-105):
  - Add top-level `locations?: ProjectIdentityLocation[];` (use the type defined at line 1956).
  - Inside `content_essentials`, add `doctors?: ProjectIdentityListEntry[];` and `services?: ProjectIdentityListEntry[];` (type defined at line 1947).
- Note: declaration order matters — if `ProjectIdentityLocation` / `ProjectIdentityListEntry` are declared after `ProjectIdentity`, either move them above or use a forward declaration. TS interface references are hoisted within a file, so no move should be needed — verify by running `tsc --noEmit` after the change.

**Files:** `frontend/src/api/websites.ts`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit` — errors on `IdentityModal.tsx:1112,1114,1117,1119` and `ImportFromIdentityModal.tsx:128,129,154,155` disappear.

### T2: Remove stale `as any` cast in IdentityModal
**Do:** In `frontend/src/components/Admin/IdentityModal.tsx` lines 1121-1125, replace the `(identity as any).locations` double-cast with `identity.locations` now that the type is correct.

**Files:** `frontend/src/components/Admin/IdentityModal.tsx`
**Depends on:** T1
**Verify:** `cd frontend && npx tsc --noEmit` — no new errors introduced; `as any` grep for this block returns empty.

### T3: Fix `ProjectIdentityBrand` save shape
**Do:** In `frontend/src/components/Admin/IdentityModal.tsx:1406-1416`, inside the `onSave({...})` call, explicitly include `logo_s3_url: brand?.logo_s3_url ?? null` and `logo_alt_text: brand?.logo_alt_text ?? null`. Keep the spread of `(brand || {})` above them so other fields (e.g., `fonts`) carry over.

**Files:** `frontend/src/components/Admin/IdentityModal.tsx`
**Depends on:** none
**Verify:** error `TS2345` at line 1406 disappears; `tsc --noEmit` clean on this file.

### T4: Fix `PageGenerationStatusItem` mapping
**Do:** In `frontend/src/pages/admin/WebsiteDetail.tsx:861-868`, add `generation_progress: null` to the mapped object literal alongside the existing fields.

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`
**Depends on:** none
**Verify:** TS2345 at line 861 disappears.

### T5: Convert stray `confirm("…")` calls to `ConfirmOptions`
**Do:**
- `frontend/src/pages/admin/WebsiteDetail.tsx:692` — replace `if (!confirm("Cancel layouts generation?")) return;` with `if (!(await confirm({ title: "Cancel layouts generation?", confirmLabel: "Cancel generation", variant: "danger" }))) return;`. The enclosing `handleCancelLayouts` at line 690 is already `async`.
- `frontend/src/pages/admin/WebsiteDetail.tsx:1060` — replace `if (!confirm("Cancel all in-progress page generation?")) return;` with `if (!(await confirm({ title: "Cancel all in-progress page generation?", confirmLabel: "Cancel all", variant: "danger" }))) return;`. Verify the enclosing function is `async`; if not, mark it `async`.

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`
**Depends on:** none
**Verify:** TS2345 at lines 692 and 1060 disappear; clicking the corresponding UI buttons in the admin dashboard opens the existing `ConfirmModal` dialog.

### T6: Destructure unused reader in PageEditor
**Do:** In `frontend/src/pages/admin/PageEditor.tsx:437`, change `const [livePreviewProgress, setLivePreviewProgress] = useState<…>(…)` to `const [, setLivePreviewProgress] = useState<…>(…)`. Preserve the full type argument.

**Files:** `frontend/src/pages/admin/PageEditor.tsx`
**Depends on:** none
**Verify:** TS6133 at line 437 disappears.

### T7: Delete dead cluster in WebsiteDetail.tsx
**Do:** In `frontend/src/pages/admin/WebsiteDetail.tsx`, remove (in one sweep, preserving surrounding code and hooks order):
- Unused icon imports from `lucide-react`: `MapPin`, `Phone`, `Search`, `ArrowRight` (keep `ArrowRightLeft`, still used at 1585).
- Unused component imports: `DynamicSlotInputs` (line 81), `ColorPicker` (line 85).
- Unused state hooks: `searchQuery/setSearchQuery` (243), `searching/setSearching` (245), `isSkipping/setIsSkipping` (249), `searchError/setSearchError` (253), `templates/setTemplates` (257), `loadingTemplates/setLoadingTemplates` (264), `primaryColor/setPrimaryColor` (353), `accentColor/setAccentColor` (354), `dataSource/setDataSource` (357), `scrapedData/setScrapedData` (358), `pageWebsiteUrls/setPageWebsiteUrls` (396), `pagePathInputs/setPagePathInputs` (398).
- Unused handlers and their bodies: `handleTemplateChange` (532), `handleSearchChange` (726), `handleKeyDown` (751), `handleConfirmSelection` (798), `handleClearSelection` (886).
- After deletion, scan the remaining file for any now-unused identifiers that were only referenced inside the removed cluster (e.g., `searchTimeoutRef`, `suggestions`, `setSuggestions`, `isDropdownOpen`, `setIsDropdownOpen`, `highlightedIndex`, `setHighlightedIndex`) — only delete them if the post-tsc run confirms they're unused. Do not speculatively delete items the build doesn't flag.

**Caution:** Run `tsc --noEmit` after deletion. If new unused-identifier errors surface, either delete them (if they truly were orphans of this cluster) or restore the reference (if they turn out to be live). No silent extends of scope.

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`
**Depends on:** T5 (both touch this file; T5 first to keep the delta readable)
**Verify:** `cd frontend && npx tsc --noEmit` — zero errors from this file; `cd frontend && npm run build` — completes.

## Done
- [ ] `cd frontend && npx tsc --noEmit` — zero errors
- [ ] `cd frontend && npm run build` — exits 0
- [ ] `rg "as any\).locations" frontend/src` — zero matches
- [ ] `rg "confirm\(\"" frontend/src/pages/admin/WebsiteDetail.tsx` — zero matches (no string-arg `confirm` calls remain)
- [ ] Manual: in admin dashboard, click "Cancel layouts generation" and "Cancel all in-progress page generation" — each opens the dark-theme `ConfirmModal` with the danger (red) variant
- [ ] Manual: open Identity modal on a project with `locations`, `doctors`, and `services` populated — tabs render without console errors
- [ ] No regressions in the Website Detail page (pages list, generation status polling, bulk SEO)
