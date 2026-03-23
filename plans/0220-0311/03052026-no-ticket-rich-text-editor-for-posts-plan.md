# Rich Text Editor for Post Content

**Ticket:** --no-ticket

## Problem Statement

The post content field in PostsTab uses a plain `<textarea>` where users type raw HTML. This is unfriendly for non-technical users. It should be a WYSIWYG rich text editor. The rendered output on the live site already handles raw HTML (`{{post.content}}` is injected unescaped), so no renderer changes are needed.

## Context Summary

- Content field is a plain `<textarea>` at PostsTab.tsx line ~283
- `{{post.content}}` is rendered as raw HTML in shortcodes.ts (line 116) — trusted, no escaping
- No rich text editor exists in the project — only Monaco (code editor)
- React 19 + Vite frontend

## Existing Patterns to Follow

- Monaco editor is used for code editing (PostBlocksTab, CodeSnippetModal)
- Component-per-feature pattern in `src/components/`

## Proposed Approach

### 1. Install TipTap

- `@tiptap/react` — React bindings
- `@tiptap/starter-kit` — bold, italic, headings, lists, blockquote, code, etc.
- `@tiptap/extension-link` — clickable links
- `@tiptap/extension-image` — inline images
- `@tiptap/extension-underline` — underline formatting

### 2. Create RichTextEditor component

`src/components/ui/RichTextEditor.tsx` — reusable component with:
- Toolbar: Bold, Italic, Underline, Strikethrough | H1-H3 | Bullet list, Ordered list | Blockquote | Link, Image | Clear formatting
- TipTap editor instance
- Props: `content: string`, `onChange: (html: string) => void`
- Styled to match existing form field aesthetics (border, rounded-lg)

### 3. Replace textarea in PostsTab

Swap the content `<textarea>` for `<RichTextEditor>` with `formContent` / `setFormContent`.

### 4. Rendering — Scoped Typography Styles

`{{post.content}}` is raw HTML but site CSS resets strip paragraph/heading margins. Fix:
- Added `wrapPostContent()` in `shortcodes.ts` that wraps content in `<div class="alloro-post-content">` with a scoped `<style>` block restoring `p`, `h1-h4`, `ul/ol`, `blockquote`, and `img` spacing.
- Updated default single template in `site.ts` to add `line-height: 1.7` on the content wrapper.

## Risk Analysis

- **Level 1**: New dependency (TipTap), UI-only change to PostsTab. Renderer change is scoped style injection — no impact on existing templates.

## Definition of Done

- [x] TipTap installed
- [x] RichTextEditor component created with toolbar
- [x] Post content field uses rich text editor
- [x] Rendered content has proper paragraph/heading spacing
- [x] Build passes clean
