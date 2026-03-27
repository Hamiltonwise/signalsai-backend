# Add Code Editor View to Page & Layout Editors

## Problem Statement
The admin page editor and layout editor (header/footer) only offer visual iframe editing. Users want a code editor view toggle beside the device switcher to directly edit raw HTML and save.

## Context Summary
- `EditorToolbar.tsx` has the device switcher (desktop/tablet/mobile) — code button goes here
- `PageEditor.tsx` manages sections as `Section[]` (name + content HTML). Already has `renderPage()` for assembly and `extractSectionsFromDom()` for parsing back.
- `LayoutEditor.tsx` already uses Monaco for wrapper mode. Header/footer have iframe-only visual mode.
- Monaco (`@monaco-editor/react`) is already installed and used in LayoutEditor.
- `templateRenderer.ts` has `serializeSectionsJs()` / `parseSectionsJs()` for round-tripping sections to/from editable code.

## Existing Patterns to Follow
- Device switcher: `bg-gray-100 rounded-lg p-0.5` pill group with active `bg-white shadow-sm` style
- Monaco config in LayoutEditor: `vs-dark` theme, minimap off, fontSize 13, wordWrap on
- State patterns: `isDirty`, `setContent()`, `handleSave()`

## Proposed Approach

### 1. EditorToolbar.tsx
- Add `codeView` boolean prop and `onCodeViewChange` callback
- Add `Code` (lucide) icon button next to the device switcher pill group, separated by a thin divider
- Active state matches device switcher styling. When code view is active, device buttons become disabled/muted.

### 2. PageEditor.tsx
- Add `codeView` state
- When toggling TO code: build code string from sections using `serializeSectionsJs()`
- When toggling FROM code: parse code back to sections using `parseSectionsJs()`, rebuild htmlContent, reload iframe
- When code view is active: show Monaco editor instead of iframe, hide EditorSidebar
- Monaco changes update a local `codeContent` state + mark dirty
- Save in code view: parse sections from code, persist via existing `updatePageSections()`

### 3. LayoutEditor.tsx (header/footer)
- Add `codeView` state (only relevant when `isVisualMode`)
- Toggle shows Monaco with raw `content` HTML (same as wrapper mode)
- When toggling back to visual: rebuild `previewHtml` from updated content, reload iframe
- EditorSidebar hidden in code view

### No backend changes. No new dependencies.

## Risk Analysis
- **Level 1 — Low risk.** Additive UI toggle, no backend changes, no data model changes.
- Section round-tripping already works (serializeSectionsJs / parseSectionsJs exist and are used elsewhere).

## Definition of Done
- Code button visible in toolbar beside device switcher (both editors)
- Clicking Code shows Monaco editor with editable HTML
- Changes in code editor are saveable via existing Save button
- Switching back to visual mode reflects code changes in iframe
- EditorSidebar hidden during code view (no AI editing while in code)
