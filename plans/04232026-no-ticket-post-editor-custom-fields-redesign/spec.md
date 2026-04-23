# Post Editor Custom Fields — Full Redesign

## Why

The current Custom Fields panel in the post editor (`PostsTab.tsx:1113-1211`) is cluttered, wastes space, and makes gallery-heavy posts unusable. Concrete pain points observed on a real doctor record with a 2-item gallery:

- `grid-cols-2` container creates orphaned empty cells when row heights mismatch (Title single-line + Alt Photo tall block → empty cell under Title).
- Professional Affiliations breaks the grid and spans full width, destroying visual rhythm.
- Each gallery item row is ~230px tall; two items consume ~500px of vertical space.
- Fixed 80×80 thumbnails crop wide logos (VDA) and portraits (Alt Photo).
- The action trio (`Browse Library` / `Upload` / `Paste URL`) repeats on every item and on the single-image picker — visual noise.
- `Paste URL` is unstyled text, not a recognizable button.
- Red × on thumbnails overlaps the image corner and reads as a clipped badge, not an intentional control.
- Up/Down/× are three isolated icons on the right with no grouping or drag affordance.
- Labels stacked above every one of Link / Alt / Caption = 6 label-then-input rows per gallery item.
- Zero motion: adding, removing, and reordering are instant and jarring.

The underlying issue is that this is an **always-expanded form**: every field of every item is visible at all times. That's fine with 2 fields per post, not with 2+ gallery items × 4 sub-fields each plus 6+ other post-type fields.

## What

Replace the current custom-fields panel with a **Linear-inspired inline-edit form system**. Per field, the default state is a compact row (type icon + label + current value/summary). Click to edit inline; blur or Enter commits; Escape cancels. Complex types (gallery) present compact item cards with an expand affordance for secondary fields. Animations via existing `framer-motion`; drag-to-reorder via existing `@dnd-kit`. Desktop-only (explicit scope; no mobile polish).

**Done =**
- Every existing field type (text, textarea, number, date, boolean, select, media_url, gallery) has a dedicated inline-edit editor.
- The panel is a single vertical list with consistent row rhythm; no orphaned grid cells; no full-width breakouts.
- Gallery items are compact rows (drag handle + thumbnail + alt-text inline) that expand in-place for link/caption.
- Drag-to-reorder works on gallery items (pointer + keyboard).
- Copy row / paste row available on gallery items; bulk-paste multiple image URLs creates N items at once.
- Add/remove/reorder animate smoothly (180ms, ease-out). No bounce, no flash.
- Full keyboard navigation: Tab through fields, arrow keys inside galleries, Enter to edit/commit, Escape to cancel.
- Save semantics unchanged: `custom_fields` is still saved as `JSON.stringify(formCustomFields)` and loads identically.

## Context

**Reference UI chosen:** Linear (property editors on Issues / Projects). Rationale:
- Compact vertical list matches the Alloro sidebar-style admin layout.
- Click-to-edit is discoverable without cluttering the default view.
- Subtle framer-motion-style transitions match what's already in use in Alloro.
- Keyboard-first affordances are a natural fit for admins who work quickly.

Not copying Linear's visuals verbatim — using its *interaction model* against Alloro's existing design tokens (indigo/blue accents, rounded-xl, soft shadows, lucide-react icons, Tailwind).

**Dependencies (already installed — zero new deps):**
- `framer-motion@12.23.12` — `layout`, `AnimatePresence`, `motion.*` components
- `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10`, `@dnd-kit/utilities@3` — sortable list
- `lucide-react` — icons (already used everywhere)

**Relevant files:**
- `frontend/src/components/Admin/PostsTab.tsx:114-236` — existing inline `MediaPickerField` helper (~120 lines); absorbed into the new `MediaUrlFieldEditor`, helper deleted.
- `frontend/src/components/Admin/PostsTab.tsx:1113-1211` — existing custom-fields switchboard panel; replaced by `<CustomFieldsPanel />` import.
- `frontend/src/components/Admin/PostsTab.tsx:347` (and related) — `formCustomFields` state and setter; **not moved**, passed down unchanged.
- `frontend/src/components/Admin/MediaPickerArrayField.tsx` — the gallery v1 component; deprecated and deleted as part of this work (content absorbed into `GalleryFieldEditor`).
- `frontend/src/components/Admin/PageEditor/MediaBrowser.tsx` — external dep (`MediaItem` type, default export). No changes.
- `frontend/src/components/ui/AnimatedSelect.tsx` (verify path — used by the current `select` branch) — reused as-is inside the new `SelectFieldEditor`.
- `frontend/src/api/posts.ts` — no changes (data shape unchanged except optional `id` in gallery items, see Constraints).

**Patterns to follow:**
- Existing `motion.div layout` usage in the app (grep `motion.div\|AnimatePresence` in `frontend/src`) — copy the exit/enter timings and easings for consistency.
- Existing dnd-kit usage (grep `useSortable\|SortableContext` in `frontend/src`) — same props wiring, same drag-handle pattern.
- Existing button/input Tailwind classes in `MediaPickerField` (rounded-lg, text-xs, `bg-gray-100 hover:bg-gray-200`) — keep the visual tokens; the redesign is layout + interaction, not a style system overhaul.
- Focus rings: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1` — apply to every interactive element. Don't suppress.

**Reference file (pattern conformance) for new component scaffolding:** `MediaPickerField` (inline in `PostsTab.tsx:114-236`) — mirrors props style (controlled value + onChange + projectId + label), upload path, MediaBrowser integration, and visual tokens. All new editor components match this contract.

**Known dependency in-file:**
- `PostsTab.tsx` uses `MediaPickerField` in two places: line ~1106 (Featured Image — NOT custom fields, don't break) and line ~1187 (inside the custom fields switchboard — being replaced). The Featured Image call must continue working. Simplest path: `MediaPickerField` stays inlined (only its *usage inside the switchboard* goes away); the new `MediaUrlFieldEditor` is a separate component for the custom-fields world. Ugly duplication short-term; we accept it because redesigning Featured Image is out of scope.
  - Alternative: extract `MediaPickerField` to a sibling file and have both the Featured Image row and the new `MediaUrlFieldEditor` consume it. Cleaner but 3× more surface area to review. **Decision:** keep it inline for now, note a TODO comment above it to extract later.

## Constraints

**Must:**
- All eight existing field types (text, textarea, number, date, boolean, select, media_url, gallery) have dedicated components in a new `frontend/src/components/Admin/postEditor/fieldEditors/` folder.
- Save payload shape is unchanged. `formCustomFields[slug]` still stores the same primitive/array each type stored before.
- Gallery items gain an **optional** per-item `id: string` (crypto.randomUUID) for stable framer-motion + dnd-kit keys. The render/shortcode pipeline must ignore this field (it already will; it's just an extra key in the JSONB). Items loaded without `id` get one synthesized on first mount, lazily, then persisted on next save. Backwards-compatible.
- Every interactive element has a visible focus ring.
- Keyboard flow works without a mouse: Tab through fields; inside galleries, arrow keys move between items; Enter to edit/commit; Escape cancels.
- Animation budget: 180ms entrance, 140ms exit, ease-out. No bouncing, no overshoot, no spring physics. Subtle.
- Desktop-only. Layout assumes viewport ≥ 1024px. No mobile CSS work — but don't break below 1024px in a broken-layout sense (squish gracefully, don't overlap).
- Zero new npm dependencies.

**Must not:**
- Change save/load semantics. `custom_fields` JSONB in → same JSONB out.
- Introduce a new field type. This spec is pure UI.
- Re-style the Featured Image picker on the post form, the identity modal, layout slot inputs, or dynamic slot inputs. Out of scope.
- Change the public shortcode grammar or the render path. Backend untouched.
- Add mobile-specific media queries or responsive breakpoints for viewports < 1024px (beyond graceful degradation).
- Use `any` in new code. Pre-existing `any` in `PostsTab.tsx` stays (not this spec's job).
- Hide fields behind advanced toggles that make them undiscoverable. Expand affordances must be visible at a glance.

**Out of scope:**
- Identity modal redesign, layout slots redesign, dynamic slots redesign. Tracked for a future spec.
- Accessibility screen-reader announcements for reorder (ARIA live region). Nice-to-have; tracked separately.
- Feature flags / gradual rollout. Ship direct on `dev/dave`, test manually, merge.
- Undo/redo history of edits within the editor.
- Storybook stories.
- Unit tests (no test infra in the frontend per CLAUDE.md-level repo convention; relying on tsc + manual QA).

## Risk

**Level:** 2 (Concern)

**Risks identified:**

- **R1: `PostsTab.tsx` is 1,388 lines; `formCustomFields` state flows through multiple paths** (line ~347 state, ~994 post-type dropdown, ~1060 post-type pre-save write, ~1122-1207 custom-fields switchboard). Refactoring the switchboard must preserve save semantics exactly.  
  → **Mitigation:** The new `<CustomFieldsPanel />` receives `{ projectId, postTypes, formPostTypeId, formCustomFields, setFormCustomFields }` and does nothing more than render. State lives in `PostsTab.tsx` unchanged. Existing save path untouched.

- **R2: framer-motion + unstable keys = flicker.** Current gallery items use index-based keys. Reordering or removing items mid-list would cause `AnimatePresence` to misidentify which item exited. Required for reorder animation to look correct.  
  → **Mitigation:** Per-item `id` synthesized lazily on load; used as the React `key` and dnd-kit sortable id.

- **R3: Focus management during framer-motion transitions.** Animations can disrupt browser focus if the animated element is focused during an exit.  
  → **Mitigation:** Never animate a focused element. On delete, blur first (via imperative `ref.current?.blur()`) then trigger removal. Tested per-editor.

- **R4: Click-to-edit reduces discoverability for first-time admins.** If a user doesn't realize a row is clickable, they can't edit.  
  → **Mitigation:** Every row has a visible right-aligned chevron or edit-state affordance. Hover state lightens the row background. Tooltip on first-interaction: "Click to edit" (show once, dismiss forever via localStorage flag). If the tooltip tech debt is too much, skip — the visual edit affordance alone is sufficient given desktop-admin audience.

- **R5: PostsTab's existing lint errors stay pre-existing** (10 `no-explicit-any` + 2 warnings per prior lint run, all outside this work). Not fixing them — out of scope. If our edits to `PostsTab.tsx` land next to those lines, do not touch them.

**Blast radius:**
- Frontend-only change.
- New folder: `frontend/src/components/Admin/postEditor/` — ~15 new files.
- Deleted: `frontend/src/components/Admin/MediaPickerArrayField.tsx` (content absorbed).
- Edited: `frontend/src/components/Admin/PostsTab.tsx` (lines ~1113-1211 replaced with 1–2 lines importing and rendering `<CustomFieldsPanel />`; the deprecated import of `MediaPickerArrayField` removed; the inline `MediaPickerField` helper at 114-236 stays since the Featured Image row still uses it).
- Consumers: zero backend changes. `/doctors/<slug>` rendering unchanged. Published sites unaffected.

**Pushback (notes from design conversation):**
- User requested drag-to-reorder; I explicitly folded it in (was out of scope in gallery v1). Confirmed available via existing @dnd-kit.
- User requested copy/paste rows + bulk paste — included as requirements. Implementation uses the browser clipboard API (no new deps).
- User requested "pick what you think is best" for reference UI — I picked **Linear**. If they disagree, easy to revisit via `-c` before implementation lands.

## Tasks

Dependency groups (for parallel orchestration):
- **Group A (foundations — parallel):** T1, T2, T3, T4
- **Group B (simple-type editors — parallel after Group A):** T5, T6, T7, T8, T9, T10
- **Group C (media editors — parallel after Group A):** T11, T12
- **Group D (assembly — sequential, after B and C):** T13, T14
- **Group E (polish + verify — sequential):** T15, T16

---

### T1: Folder scaffolding + shared types
**Do:**
- Create `frontend/src/components/Admin/postEditor/` with subfolders `fieldEditors/`, `hooks/`, `primitives/`.
- New file `postEditor/types.ts` defines:
  - `SchemaField` type (from existing shape in `PostBlocksTab.tsx` — deduplicated into this shared file).
  - `GalleryItem` type: `{ id: string; url: string; link?: string; alt: string; caption?: string }`.
  - `FieldEditorProps<T>`: `{ field: SchemaField; value: T; onChange: (next: T) => void; projectId: string }`.
- New file `postEditor/primitives/FieldTypeIcon.tsx` — maps each type to a lucide icon (text → `Type`, textarea → `AlignLeft`, number → `Hash`, date → `Calendar`, boolean → `ToggleLeft`, select → `ChevronDown`, media_url → `Image`, gallery → `Images`). Pure component, ~20 lines.
- New file `postEditor/primitives/InlineEditRow.tsx` — reusable row shell: icon column (32px), label column (160px), value column (flex-1), edit chevron column (24px). Hover state + click handler. All editor components wrap their `<InlineEditRow>` to get consistent chrome.

**Files:** all new under `postEditor/`  
**Depends on:** none  
**Verify:** `npx tsc --noEmit` in `frontend/` — zero new errors.

---

### T2: `useInlineEdit` hook
**Do:**
- New file `postEditor/hooks/useInlineEdit.ts`.
- Exports `useInlineEdit<T>({ value, onCommit, onCancel })` returning `{ editing, startEdit, commit, cancel, bindInput }`.
- `bindInput` returns spread props for the wrapped input: `{ onKeyDown, onBlur, ref }` handling Enter → commit, Escape → cancel, blur → commit.
- Internal state: `isEditing: boolean`, `draftValue: T`. Ref to the input for imperative focus on edit start.
- Does not dispatch `onCommit` if draft equals current value (no-op guard).

**Files:** `postEditor/hooks/useInlineEdit.ts`  
**Depends on:** none  
**Verify:** unit-visual check — text editor uses it, confirms enter/escape/blur behavior at manual QA time.

---

### T3: `useClipboardRow` hook
**Do:**
- New file `postEditor/hooks/useClipboardRow.ts`.
- Exports `useClipboardRow<T>()` returning `{ copy(item: T), paste(): Promise<T | null> }`.
- `copy` serializes to JSON and writes via `navigator.clipboard.writeText`. Wraps in a namespaced shape: `{ __alloro_clipboard: "gallery-item", payload: T }` so foreign clipboard contents don't corrupt state.
- `paste` reads clipboard, parses, validates the namespace marker, returns `payload` or `null`.
- Surface errors via console.warn only (don't throw). Empty/invalid clipboard is a silent no-op.

**Files:** `postEditor/hooks/useClipboardRow.ts`  
**Depends on:** none  
**Verify:** used by T12. Manual test: copy an item → paste into another gallery on another post.

---

### T4: `useBulkPaste` hook
**Do:**
- New file `postEditor/hooks/useBulkPaste.ts`.
- Exports `useBulkPaste({ onAddItems })` returning `{ promptBulkPaste() }`.
- `promptBulkPaste` opens a simple modal (use existing modal primitives if available; otherwise inline `<dialog>` with Tailwind styling) containing a single textarea. On submit, splits input by newlines and commas, filters for URL-like strings (`/^https?:\/\//.test`), constructs `GalleryItem[]` with `{ id: crypto.randomUUID(), url, alt: "" }` each, calls `onAddItems(items)`.
- No URL validation beyond the prefix check; admins can paste any URL.

**Files:** `postEditor/hooks/useBulkPaste.ts`, optionally `postEditor/primitives/BulkPasteDialog.tsx`  
**Depends on:** none  
**Verify:** used by T12. Manual test: paste 5 newline-separated URLs, gallery populates 5 items.

---

### T5: `TextFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/TextFieldEditor.tsx`.
- Uses `<InlineEditRow>` + `useInlineEdit`. Default view shows current value (or placeholder "Empty" in muted gray). Click → swap to `<input type="text">` with focus + select-all. Enter/blur commits.
- Consumes `FieldEditorProps<string>`.

**Files:** `postEditor/fieldEditors/TextFieldEditor.tsx`  
**Depends on:** T1, T2  
**Verify:** edit a text field, confirm value round-trips, escape cancels.

---

### T6: `TextareaFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/TextareaFieldEditor.tsx`.
- `<InlineEditRow>` value column renders a truncated one-line preview (`line-clamp-1`). Click expands to a full-width `<textarea>` (min 3 rows, max 8 rows, resize-y). Ctrl/Cmd+Enter commits; Escape cancels; plain Enter inserts newline (as expected in textarea).

**Files:** `postEditor/fieldEditors/TextareaFieldEditor.tsx`  
**Depends on:** T1, T2  
**Verify:** edit a textarea field, confirm line breaks preserved, commit shortcut works.

---

### T7: `NumberFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/NumberFieldEditor.tsx`.
- Default view shows formatted number (or "Empty"). Click → `<input type="number">`. Enter/blur commits as Number; empty string stored as `""`. No validation beyond what HTML input enforces.

**Files:** `postEditor/fieldEditors/NumberFieldEditor.tsx`  
**Depends on:** T1, T2  
**Verify:** enter a number, confirm `typeof formCustomFields[slug] === "number"`.

---

### T8: `DateFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/DateFieldEditor.tsx`.
- Default view shows formatted `en-US` date string (or "Empty"). Click → `<input type="date">`. Commits the YYYY-MM-DD string (matches existing `type="date"` value behavior).

**Files:** `postEditor/fieldEditors/DateFieldEditor.tsx`  
**Depends on:** T1, T2  
**Verify:** set a date, confirm round-trip.

---

### T9: `BooleanFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/BooleanFieldEditor.tsx`.
- No edit-mode swap. Always renders a toggle (Tailwind-styled switch component: ~w-10 h-6 pill, indigo when on). Value column shows "Yes" / "No" text alongside for clarity. Clicking toggles.

**Files:** `postEditor/fieldEditors/BooleanFieldEditor.tsx`  
**Depends on:** T1  
**Verify:** toggle a boolean, confirm `true`/`false` saved.

---

### T10: `SelectFieldEditor`
**Do:**
- New file `postEditor/fieldEditors/SelectFieldEditor.tsx`.
- Reuse the existing `AnimatedSelect` component (find via grep: `grep -rn "AnimatedSelect" frontend/src/components/Admin/PostsTab.tsx` — confirmed usage at ~1153). Same options shape (`{value, label}[]`).
- Default view shows selected label; click on row expands `AnimatedSelect`. Consider whether `AnimatedSelect` already handles the trigger UI sufficiently — if so, embed directly in the value column without a click-to-edit swap.

**Files:** `postEditor/fieldEditors/SelectFieldEditor.tsx`  
**Depends on:** T1  
**Verify:** pick an option, confirm saved value.

---

### T11: `MediaUrlFieldEditor` (single image)
**Do:**
- New file `postEditor/fieldEditors/MediaUrlFieldEditor.tsx`.
- Consumes `FieldEditorProps<string>`.
- Default view (no value): compact "Add image ▾" split-button (click primary → Browse Library; dropdown → Upload / Paste URL). Entire trio behind one affordance.
- Default view (has value): 56×56 `object-contain` thumbnail + URL filename badge truncated + "Replace ▾" split-button + trash icon.
- No edit-mode swap needed (the picker IS the edit mode).
- Upload POST path identical to current `MediaPickerField` (`/api/admin/websites/${projectId}/media`, form-data, read `data.data[0].s3_url`).
- Browse Library reuses `MediaBrowser` from `../PageEditor/MediaBrowser`; props `{ projectId, onSelect, onClose, compact: true }`.
- Remove uses same red × but positioned **outside** the thumbnail (right side of the row), not overlapping the image.

**Files:** `postEditor/fieldEditors/MediaUrlFieldEditor.tsx`  
**Depends on:** T1  
**Verify:** pick an image, replace it, delete it, confirm round-trip.

---

### T12: `GalleryFieldEditor` + `GalleryItemCard`
**Do:**
- New files:
  - `postEditor/fieldEditors/GalleryFieldEditor.tsx`
  - `postEditor/fieldEditors/GalleryItemCard.tsx`
- `GalleryFieldEditor` receives `FieldEditorProps<GalleryItem[]>`. Wraps content in a `<DndContext>` + `<SortableContext strategy={verticalListSortingStrategy}>`. Maps items to `<GalleryItemCard>`, keyed by `item.id`.
- On mount: any item missing `id` gets one synthesized (pure function `ensureIds(items)`; returns new array with every item guaranteeing an id). Call `onChange(ensureIds(value))` in a `useEffect` — only if any ids were missing, to avoid loops.
- Bottom bar: compact action row with buttons: `+ Add item` (primary), `+ Add from URLs` (opens T4's bulk-paste dialog), overflow `⋯` menu for "Paste copied item" (calls `useClipboardRow().paste`).
- `<AnimatePresence>` wraps the list with `initial={{ opacity: 0, height: 0 }}` / `animate={{ opacity: 1, height: "auto" }}` / `exit={{ opacity: 0, height: 0 }}` with 180ms ease-out.
- `GalleryItemCard`:
  - Uses `useSortable({ id: item.id })` from @dnd-kit/sortable. Applies `attributes` to the root, `listeners` to the drag handle only (not the whole card — otherwise edit clicks would trigger drag).
  - Compact row: drag handle (`GripVertical` icon, opacity-0 group-hover:opacity-100, cursor-grab) + 56×56 `object-contain` thumbnail + `<alt text>` as inline-editable via `useInlineEdit` + expand chevron + overflow menu (copy row, delete).
  - Expanded state (via `AnimatePresence height: auto`): Link input + Caption input + Replace-image split-button. Entrance 180ms, exit 140ms.
  - Focus management: on delete, blur first then remove from list (R3).
  - Clicking outside an expanded card collapses it (optional — if implementation cost > 1h, skip).
- Keyboard: `↑` / `↓` arrow keys on a focused drag handle move the item (wiring via @dnd-kit's keyboard sensor).
- Empty state: single call-to-action centered ("Add your first item" + big Add button + tiny "Or paste URLs" link).

**Files:** `postEditor/fieldEditors/GalleryFieldEditor.tsx`, `postEditor/fieldEditors/GalleryItemCard.tsx`  
**Depends on:** T1, T2, T3, T4  
**Verify:** add 5 items, reorder via drag, reorder via keyboard, copy item 2, paste into another gallery on another post, delete item 3, bulk-paste 3 URLs, confirm save round-trip preserves IDs and order.

---

### T13: `CustomFieldsPanel` assembly
**Do:**
- New file `postEditor/CustomFieldsPanel.tsx`.
- Props: `{ projectId, postTypes, formPostTypeId, formCustomFields, setFormCustomFields }`.
- Reads the active post type's `schema: SchemaField[]`. For each field, picks the matching editor component from a type → component map. Renders them in a single vertical list with 1px dividers between rows and a subtle card wrapper (same indigo-ish tint as today, but without `grid-cols-2`).
- Header: "Custom Fields" label + small collapse-all / expand-all button (operates on gallery items across all gallery fields on the post).
- Empty state (post type has no custom fields): muted text "This post type has no custom fields" + (if admin role detected — out of scope check, skip role logic) link to schema editor. Keep simple: just the muted text, no link.

**Files:** `postEditor/CustomFieldsPanel.tsx`, `postEditor/fieldEditors/index.ts` (barrel export)  
**Depends on:** T5, T6, T7, T8, T9, T10, T11, T12  
**Verify:** renders every field type correctly from a synthetic post type with one of each.

---

### T14: `PostsTab.tsx` refactor
**Do:**
- Import `<CustomFieldsPanel />` at the top of `PostsTab.tsx`.
- Locate the existing custom-fields block at lines ~1113-1211 (the `(() => { const activeType = ...; return <div>...<grid>...{schema.map(...)}</grid></div>; })()` IIFE). Replace the entire IIFE with:
  ```tsx
  <CustomFieldsPanel
    projectId={projectId}
    postTypes={postTypes}
    formPostTypeId={formPostTypeId}
    formCustomFields={formCustomFields}
    setFormCustomFields={setFormCustomFields}
  />
  ```
- Remove the `MediaPickerArrayField` import (now absorbed into `GalleryFieldEditor`).
- **Keep** the existing `MediaPickerField` helper at lines 114-236 — it's still used by the Featured Image row at ~line 1106. Add a `// TODO: extract to a shared file, see plans/04232026-no-ticket-post-editor-custom-fields-redesign/spec.md` above the helper.
- Delete `frontend/src/components/Admin/MediaPickerArrayField.tsx` since all its behavior is now in `GalleryFieldEditor`.

**Files:** `frontend/src/components/Admin/PostsTab.tsx`, `frontend/src/components/Admin/MediaPickerArrayField.tsx` (deleted)  
**Depends on:** T13  
**Verify:** `npx tsc --noEmit` zero new errors; `npm run build` in frontend succeeds.

---

### T15: Visual + keyboard QA pass
**Do:**
- Test each field type end-to-end: create → edit → save → reload.
- Gallery-specific: add, remove, reorder (drag + keyboard), copy/paste row, bulk-paste, expand/collapse item.
- Keyboard-only pass: unplug mouse. Tab through every field. Confirm Enter/Escape/arrows work as specified.
- Save a post, reload from DB, confirm every custom field value survived.
- Check focus rings visible on every interactive element.
- Animation sanity check: no flash, no jump, no layout thrashing in DevTools timeline.

**Files:** none  
**Depends on:** T14  
**Verify:** manual checklist.

---

### T16: TypeScript + build + lint gate
**Do:**
- `cd frontend && npx tsc -b --noEmit` — zero new errors.
- `cd frontend && npm run build` — succeeds.
- `cd frontend && npx eslint src/components/Admin/postEditor/ src/components/Admin/PostsTab.tsx` — classify errors: any caused by this work are auto-fixed; pre-existing `PostsTab.tsx` errors stay (outside this spec's scope).

**Files:** none  
**Depends on:** T15  
**Verify:** clean tsc + build; lint errors all pre-existing.

## Done

- [ ] `frontend/src/components/Admin/postEditor/` folder exists with 14 new files (1 types, 1 panel, 1 icon primitive, 1 row primitive, 3 hooks, 1 bulk-paste dialog, 8 field editors + 1 gallery item card + 1 barrel)
- [ ] `frontend/src/components/Admin/MediaPickerArrayField.tsx` deleted
- [ ] `frontend/src/components/Admin/PostsTab.tsx`: `<CustomFieldsPanel />` replaces the custom-fields IIFE; `MediaPickerArrayField` import removed; inline `MediaPickerField` helper retains a TODO comment
- [ ] `npx tsc --noEmit` in `frontend/` — zero new errors
- [ ] `npm run build` in `frontend/` — succeeds
- [ ] Every existing field type renders and round-trips save/load
- [ ] Gallery: add, remove, drag-reorder, keyboard-reorder, copy row, paste row, bulk-paste all work
- [ ] Animations: 180ms in / 140ms out, ease-out, no flash/flicker
- [ ] Full keyboard flow works; focus rings visible on all interactive elements
- [ ] No regressions on Featured Image picker, Categories, Tags, or any other panel in `PostsTab.tsx`
- [ ] Lint: no NEW errors introduced (pre-existing stay)
