# Sections Editor Overhaul

## Why
The sections JS editor uses Monaco with `language="javascript"`, which means HTML inside template literal `content` fields gets zero syntax highlighting, no autocompletion, and no formatting. For templates that are 90% HTML, this is effectively editing blind. There's also no beautify/format tooling anywhere — content comes back however the AI wrote it.

## What
Replace the raw JS-only Monaco editor with a dual-mode `<SectionsEditor>` component used across all 6 sections-JS editor instances. **Structured mode** gives a section list with drag-and-drop + a pure HTML Monaco editor per section. **Raw mode** preserves the current full-JS view for power users. Both modes get beautify-on-save and a manual Beautify button via Prettier standalone.

## Context

**Relevant files:**
- `frontend/src/utils/templateRenderer.ts` — `serializeSectionsJs`, `parseSectionsJs`, `normalizeSections` (lines 211-255)
- `frontend/src/api/templates.ts:7-10` — `Section { name: string; content: string }`
- `frontend/src/pages/admin/PageEditor.tsx:807-850` — sections code view
- `frontend/src/pages/admin/TemplateDetail.tsx:829-845` — template page editor
- `frontend/src/components/Admin/ReviewBlocksTab.tsx:366-381` — review block editor
- `frontend/src/components/Admin/PostBlocksTab.tsx:496-512,612-628` — post block + single template editors
- `frontend/src/components/Admin/MenuTemplatesTab.tsx:409-424` — menu template editor

**Patterns to follow:**
- Existing Monaco options pattern (minimap off, fontSize 13, wordWrap on, tabSize 2, vs-dark)
- `@hello-pangea/dnd` already used in the project for drag-and-drop
- `serializeSectionsJs` / `parseSectionsJs` for raw mode serialization

**Key decisions:**
- Use `prettier/standalone` + `prettier/plugins/html` for formatting (browser-side, no server)
- Use `@hello-pangea/dnd` (already installed) for section reordering
- Single shared `<SectionsEditor>` component replaces all 6 raw Monaco instances
- Component is controlled: accepts `sections: Section[]` + `onChange: (sections: Section[]) => void`

## Constraints

**Must:**
- Preserve all existing preview/iframe integration (component only replaces the editor pane, not the preview)
- Preserve existing save/auto-save flows (component emits `Section[]` via onChange, parent handles persistence)
- Keep raw mode functional — some power-user workflows depend on seeing/editing the full JS array
- HTML Monaco editor must have `language="html"` for proper syntax highlighting + autocompletion
- Beautify must normalize: indentation (2-space), trailing whitespace, empty line collapse, consistent tag formatting

**Must not:**
- Break any existing save/load/preview flows
- Add dependencies beyond `prettier` standalone (already have dnd, monaco, etc.)
- Modify `parseSectionsJs` or `serializeSectionsJs` signatures (they work fine)
- Touch the preview iframe or `renderPage` logic

**Out of scope:**
- Layout editors (wrapper/header/footer) — they edit raw HTML, not sections JS
- Code snippet modal — different content type
- Import detail editor — CSS/JS files, not sections
- Visual/AI editing mode in PageEditor — only the code view is affected
- HTML validation (flagging broken tags) — separate follow-up

## Risk

**Level:** 2

**Risks identified:**
- Prettier standalone bundle size (~300KB gzipped) adds to frontend bundle → **Mitigation:** Dynamic import (`import()`) so it's only loaded when the editor is opened, not on page load
- Drag-and-drop reorder could desync with preview if onChange fires mid-drag → **Mitigation:** Only emit onChange on drag end, not during drag
- Raw mode parse errors could lose structured edits → **Mitigation:** When switching from structured to raw, serialize fresh from current sections state; when switching from raw to structured, parse and validate first — block switch on parse error with inline error message

**Pushback:** None. This is a clear UX improvement with no architectural concerns.

## Tasks

### T1: Install Prettier standalone + create beautify utility
**Do:**
- `npm install prettier` (the standalone build ships with the package)
- Create `frontend/src/utils/htmlBeautify.ts`:
  - `beautifyHtml(html: string): Promise<string>` — dynamic-imports `prettier/standalone` + `prettier/plugins/html`, formats with 2-space indent, 120 print width, HTML parser
  - `beautifySections(sections: Section[]): Promise<Section[]>` — maps over sections, beautifies each `content` field
**Files:** `frontend/package.json`, `frontend/src/utils/htmlBeautify.ts`
**Verify:** `npx tsc --noEmit` passes; manual test: `beautifyHtml("<div><p>test</p></div>")` returns properly indented HTML

### T2: Build `<SectionsEditor>` component — structured mode
**Do:**
- Create `frontend/src/components/Admin/SectionsEditor.tsx`
- Props: `sections: Section[]`, `onChange: (sections: Section[]) => void`, `height?: string`
- **Section list panel** (left, ~240px):
  - Renders section names in a `@hello-pangea/dnd` `<DragDropContext>` + `<Droppable>` + `<Draggable>` list
  - Click selects a section (highlights it)
  - Drag handle icon on each item
  - "Add Section" button at bottom (creates section with empty name + content)
  - Delete button per section (with confirmation or undo)
  - Inline rename (click section name to edit)
  - On reorder: emit new order via `onChange`
- **HTML editor panel** (right, flex-1):
  - Monaco `<Editor>` with `language="html"`, `theme="vs-dark"`, standard options
  - Shows selected section's `content`
  - On change: update the section's content in the sections array, emit via `onChange`
  - When no section selected: empty state message "Select a section to edit"
- **Toolbar** above editor:
  - "Beautify" button — runs `beautifySections()` on all sections, emits onChange
  - "Raw" toggle button — switches to raw mode (T3)
  - Section name display for current selection
**Files:** `frontend/src/components/Admin/SectionsEditor.tsx`
**Verify:** Component renders with mock data; section list shows names; clicking selects and shows HTML; drag reorders; add/delete/rename work

### T3: Build `<SectionsEditor>` — raw mode toggle
**Do:**
- Add raw mode state to `SectionsEditor`
- **Entering raw mode:** serialize current sections via `serializeSectionsJs()`, show in full Monaco editor with `language="javascript"` (current behavior)
- **Leaving raw mode:** parse via `parseSectionsJs()`, if error → show inline error message and block switch; if valid → update sections state and switch to structured mode
- **Raw toolbar:** "Structured" toggle button, "Beautify" button (beautifies HTML inside each section's content in the JS)
- Raw mode preserves the exact same look as the current editor (vs-dark, same options)
**Files:** `frontend/src/components/Admin/SectionsEditor.tsx`
**Verify:** Toggle between modes preserves data; raw → structured with broken JS shows error; beautify in raw mode formats HTML inside template literals

### T4: Add beautify-on-save hook
**Do:**
- `SectionsEditor` accepts optional `onBeforeSave?: (sections: Section[]) => Promise<Section[]>` — but simpler: just expose a `beautifyOnSave: boolean` prop (default true)
- When `beautifyOnSave` is true, the component runs `beautifySections()` before emitting `onChange` on blur / Cmd+S / explicit save — actually, simpler: the parent controls save, so add an exported `useBeautify` hook or just have each parent call `beautifySections()` before persisting
- **Revised approach:** Add a `Cmd+S` handler inside `SectionsEditor` that:
  1. Beautifies all sections
  2. Emits `onChange` with beautified sections
  3. Calls an `onSave?: () => void` callback so parent can trigger its persist flow
- Also beautify when switching from structured to raw mode (so raw view is always clean)
**Files:** `frontend/src/components/Admin/SectionsEditor.tsx`, `frontend/src/utils/htmlBeautify.ts`
**Verify:** Cmd+S in editor beautifies and triggers save callback; switching to raw shows beautified output

### T5: Integrate into PageEditor
**Do:**
- Replace the code-view Monaco `<Editor>` block (lines ~807-850) with `<SectionsEditor>`
- Pass `sections` state directly (no more `serializeSectionsJs` on view switch — component handles it internally)
- Wire `onChange` to update `sections` + `setIsDirty(true)` + trigger `scheduleSave`
- Wire `onSave` to `handleSave`
- Remove `codeContent` state and `serializeSectionsJs`/`parseSectionsJs` calls from `handleViewChange` — the component manages its own serialization
- Keep the preview iframe alongside (split layout stays the same)
**Files:** `frontend/src/pages/admin/PageEditor.tsx`
**Verify:** Code view shows structured section editor; switching visual↔code preserves data; save works; live preview updates on changes

### T6: Integrate into TemplateDetail
**Do:**
- Replace the template page sections Monaco editor (lines ~829-845) with `<SectionsEditor>`
- Wire `onChange` → `setHasUnsavedChanges(true)` + `rebuildPreview()` equivalent
- Wire `onSave` → existing save handler
- Remove manual `serializeSectionsJs`/`parseSectionsJs` calls from page open/save flows
**Files:** `frontend/src/pages/admin/TemplateDetail.tsx`
**Verify:** Template page editor shows structured view; preview updates on section edits; save persists correctly

### T7: Integrate into ReviewBlocksTab, PostBlocksTab, MenuTemplatesTab
**Do:**
- Replace all 4 remaining Monaco instances (ReviewBlocks ×1, PostBlocks ×2, MenuTemplates ×1) with `<SectionsEditor>`
- Each follows same pattern: pass `sections`, wire `onChange` for preview update + dirty state, wire `onSave`
- Remove manual serialize/parse calls from each component's open/save/change handlers
**Files:** `frontend/src/components/Admin/ReviewBlocksTab.tsx`, `frontend/src/components/Admin/PostBlocksTab.tsx`, `frontend/src/components/Admin/MenuTemplatesTab.tsx`
**Verify:** All four editors show structured view; preview updates; save works; drag-and-drop reorders sections

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] All 6 editor instances replaced with `<SectionsEditor>`
- [ ] Structured mode: section list with drag-and-drop, HTML-highlighted Monaco editor per section
- [ ] Raw mode: full JS array editor (existing behavior preserved)
- [ ] Beautify button works in both modes
- [ ] Cmd+S beautifies + triggers save
- [ ] Mode switching preserves data (structured ↔ raw)
- [ ] Live preview updates on section content changes in all 5 parent components
- [ ] No regressions in save/publish/auto-save flows
