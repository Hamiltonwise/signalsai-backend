# PM Batch B: Markdown Description Editor

## Why
Task descriptions are currently plain textareas. The spec calls for "rich text editor-ish but markdown under the hood" — users write markdown, see rendered output. AI Synth should also generate markdown descriptions that render properly. This makes task descriptions more expressive (headings, lists, bold, links, code) without the complexity of a full WYSIWYG editor.

## What
1. Install a markdown editor component (lightweight, dark-mode compatible)
2. Replace description textarea in TaskDetailPanel with markdown editor
3. Replace description textarea in CreateTaskModal with markdown editor
4. Render markdown descriptions in TaskCard hover/preview
5. AI Synth prompt updated to generate markdown descriptions
6. AI Synth batch-create stores markdown descriptions

## Context

**Relevant files:**
- `frontend/src/components/pm/TaskDetailPanel.tsx` — description is a plain `<textarea>` at ~line 90, saved on blur via `updateTask(taskId, { description })`
- `frontend/src/components/pm/CreateTaskModal.tsx` — description is a plain `<textarea>` (from Batch A, to be created)
- `frontend/src/components/pm/TaskCard.tsx` — currently shows no description preview
- `frontend/src/components/pm/ProposedTaskList.tsx` — shows `task.description` as plain text with `line-clamp-2`
- `frontend/src/components/pm/AISynthPanel.tsx` — passes proposed tasks to ProposedTaskList
- `src/agents/pmAgents/AISynth.md` — Claude prompt, currently says "a brief description if context is needed"
- `src/controllers/pm/PmAiSynthController.ts` — stores description as TEXT in pm_tasks
- `frontend/src/types/pm.ts` — `PmTask.description: string | null`

**Patterns to follow:**
- Dark mode theming via CSS custom properties
- Existing Tailwind typography plugin (`@tailwindcss/typography`) is installed

**Key decisions:**
- **Editor choice:** `@uiw/react-md-editor` — lightweight, dark mode support, toolbar, preview toggle. Alternative: `react-simplemde-editor` (heavier). Recommend `@uiw/react-md-editor` for its split/preview modes and small bundle.
- **Storage:** Markdown stored as-is in `pm_tasks.description` (TEXT column). No conversion to HTML on backend. Rendering happens client-side.
- **Rendering:** Use `react-markdown` (already transitively available via the md editor) or the editor's preview mode.

## Constraints

**Must:**
- Editor supports dark mode matching PM theme
- Editor has a toolbar for common formatting (bold, italic, heading, list, code, link)
- Editor has split mode (write left, preview right) and write-only mode
- Markdown renders properly in: task detail panel, proposed task list preview, anywhere description is displayed
- AI Synth prompt must instruct Claude to output markdown-formatted descriptions

**Must not:**
- Store HTML in the database — store raw markdown only
- Use a heavy WYSIWYG editor (Draft.js, Slate, TipTap) — keep it simple
- Break existing plain-text descriptions — they should render as-is (markdown passthrough)

**Out of scope:**
- Image uploads in descriptions
- @mentions or task linking in markdown
- Real-time collaborative editing

## Risk

**Level:** 1 — additive change, no data model modification. Existing plain-text descriptions render fine in markdown.

**Risks identified:**
- Editor bundle size → **Mitigation:** lazy-load the editor component via `React.lazy()`
- Dark mode styling conflicts → **Mitigation:** override editor CSS with PM token variables

## Tasks

### T1: Install markdown editor dependency
**Do:** Install `@uiw/react-md-editor` in `frontend/`. This package includes its own markdown parser and preview renderer.
**Files:** `frontend/package.json`
**Verify:** `npm ls @uiw/react-md-editor` shows installed

### T2: Create MarkdownEditor wrapper component
**Do:** Create `frontend/src/components/pm/MarkdownEditor.tsx`. A wrapper around `@uiw/react-md-editor` that:
- Applies PM dark mode theme (override CSS variables)
- Has controlled `value`/`onChange` props
- Supports `preview` prop: `"edit"` (default), `"live"` (split), `"preview"` (read-only)
- Has a `minHeight` prop (default 120)
- Toolbar: bold, italic, heading, unordered list, ordered list, code, link
- Background: `var(--color-pm-bg-primary)`, text: `var(--color-pm-text-primary)`

Also create `frontend/src/components/pm/MarkdownPreview.tsx` — a read-only renderer for displaying markdown content. Uses the same styling. Small, no toolbar.
**Files:** `frontend/src/components/pm/MarkdownEditor.tsx`, `frontend/src/components/pm/MarkdownPreview.tsx`
**Verify:** Component renders with dark theme, toolbar works, markdown preview renders

### T3: Replace TaskDetailPanel description textarea
**Do:** In `TaskDetailPanel.tsx`, replace the `<textarea>` for description with `<MarkdownEditor>`. The editor should:
- Show in "live" (split) mode when focused/editing
- Auto-save on blur (debounce 500ms to avoid excessive API calls)
- Show placeholder "Add a description..." when empty
**Files:** `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Open task detail → description shows markdown editor → type markdown → see preview → blur → saved

### T4: Add markdown preview to ProposedTaskList
**Do:** In `ProposedTaskList.tsx`, replace the plain `<p>` description display with `<MarkdownPreview>`. Keep the `line-clamp-2` constraint for compact display (apply via CSS on the preview container).
**Files:** `frontend/src/components/pm/ProposedTaskList.tsx`
**Verify:** AI-proposed tasks with markdown descriptions render formatted text

### T5: Update AI Synth prompt for markdown descriptions
**Do:** Update `src/agents/pmAgents/AISynth.md` to instruct Claude to generate markdown-formatted descriptions. Add to the prompt:
```
For descriptions, use markdown formatting where helpful: bullet lists for multiple items, **bold** for emphasis, `code` for technical terms. Keep descriptions concise — 1-3 sentences or a short bullet list. Not every task needs a description.
```
**Files:** `src/agents/pmAgents/AISynth.md`
**Verify:** AI Synth extraction returns descriptions with markdown formatting

### T6: Add MarkdownEditor to CreateTaskModal
**Do:** In the `CreateTaskModal` (from Batch A), replace the description textarea with `<MarkdownEditor>` in edit-only mode. Smaller min-height (80px) since it's a creation form, not an editing form.
**Files:** `frontend/src/components/pm/CreateTaskModal.tsx`
**Verify:** New task modal has markdown editor for description

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] `@uiw/react-md-editor` installed
- [ ] MarkdownEditor component renders with dark theme
- [ ] TaskDetailPanel uses markdown editor for description
- [ ] ProposedTaskList renders markdown descriptions
- [ ] AI Synth generates markdown-formatted descriptions
- [ ] CreateTaskModal uses markdown editor
- [ ] Existing plain-text descriptions render correctly (backward compatible)
