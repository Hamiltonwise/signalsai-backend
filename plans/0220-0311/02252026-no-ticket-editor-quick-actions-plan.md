# Editor Quick Actions & Improved Labels

**Date:** 02/25/2026
**Ticket:** no-ticket
**Tier:** Structural Feature

---

## Problem Statement

The page editor's element labels show raw alloro class names (e.g., `section-hero-component-headline`) which are not user-friendly. When an element is selected, the only available action is hide/unhide. Users must type full instructions in the chat for common operations like changing text, swapping images, or updating links.

## Context Summary

### Current Behavior
- **Hover label**: Shows `getReadableLabel(cls)` — strips UUID prefix, still shows raw names like `section-hero-component-headline`
- **Selected label**: Same text, shown as a positioned `<div>` in the iframe DOM
- **Selected info bar** (sidebar): Shows label text + hide toggle button
- **Editing flow**: User types instruction in ChatPanel → `handleSendEdit` → API call → DOM mutation → section extraction → auto-save

### Key Files
- `hooks/useIframeSelector.ts` — Hover/click selection, label rendering, CSS injection
- `components/PageEditor/EditorSidebar.tsx` — Sidebar with selected element info bar + chat/debug tabs
- `components/PageEditor/ChatPanel.tsx` — Chat input, media upload/library, message display
- `pages/admin/PageEditor.tsx` — Orchestrator: handles edit flow, save, publish

### Existing Patterns
- Labels are injected as `<div>` elements in the iframe DOM, positioned absolutely
- CSS is injected into the iframe via a `<style>` tag
- `SelectedInfo` type has: `alloroClass`, `label`, `type`, `outerHtml`, `isHidden`
- `handleSendEdit` accepts `(instruction: string, attachedMedia?: MediaItem[])`
- Media library already exists inside ChatPanel (inline modal, fetches from `/api/admin/websites/{projectId}/media`)

---

## Proposed Approach

### 1. Human-Readable Labels (Hover + Selected)

Replace raw class names with friendly element descriptions based on the HTML tag and the component name.

**Tag-based label mapping:**
| Tag | Label |
|-----|-------|
| `h1`–`h6` | "Heading" |
| `p` | "Paragraph" |
| `a` | "Link" |
| `img` | "Image" |
| `button` | "Button" |
| `section` | "Section" |
| `div` | "Container" |
| `span` | "Text" |
| `nav` | "Navigation" |
| `form` | "Form" |
| `ul`/`ol` | "List" |
| `li` | "List Item" |
| `video` | "Video" |
| fallback | Tag name capitalized |

**Implementation:**
- Add the tag name to `SelectedInfo` (new field: `tagName: string`)
- In `useIframeSelector.ts`, when building hover/selected labels, read the element's `tagName` and the component name portion from the alloro class
- Label format: `"Heading"` or `"Image"` — clean and simple
- The full component name (e.g., `section-hero-component-headline`) still stored in `SelectedInfo.label` for reference

**Where:**
- `useIframeSelector.ts`: `showLabel()` function — change `label.textContent` to use tag-based name
- `useIframeSelector.ts`: Click handler — add `tagName` to `SelectedInfo`
- `EditorSidebar.tsx`: Show the friendly label in the info bar

### 2. Quick Actions in Selected Element Info Bar

When an element is selected (clicked), the sidebar info bar becomes an action toolbar with context-aware quick action buttons.

**Actions by element type:**

| Element Tags | Action | Icon | Behavior |
|-------------|--------|------|----------|
| All | Toggle visibility | Eye / EyeOff | Existing `onToggleHidden` |
| `p`, `span`, `h1`–`h6`, `a`, `button`, `li` | Edit text | Pencil | Opens inline text input → sends as prompt |
| `img`, `video` | Change source | ImagePlus | Opens media browser floating → attaches media + sends prompt |
| `a` | Change link | Link | Opens inline URL input → sends as prompt |

**Implementation:**

**A. Edit Text action (Pencil icon)**
- Click pencil → shows a small text input inline in the info bar (replaces the label text temporarily)
- User types new text, presses Enter
- Generates prompt: `Change the text content to "{newText}"`
- Calls `onSendEdit(prompt)` — same flow as chat
- Input dismisses on Enter or Escape

**B. Change Source action (ImagePlus icon for img/video)**
- Click icon → opens a floating media browser panel (extracted from ChatPanel's existing media library UI)
- User picks an image from library
- Generates prompt: `Replace this image with the one at {media.s3_url}`
- Calls `onSendEdit(prompt, [media])` — attaches the media item for context

**C. Change Link action (Link icon for `a` tags)**
- Click link icon → shows a small URL input inline in the info bar
- Pre-populated with the current `href` value (extracted from `outerHtml`)
- User edits URL, presses Enter
- Generates prompt: `Change the link href to "{newUrl}"`
- Calls `onSendEdit(prompt)`

**Where:**
- `EditorSidebar.tsx`: Rebuild the selected element info bar to show quick action icons based on `tagName`
- `EditorSidebar.tsx`: Add state for active quick action (text input, URL input, media picker)
- `EditorSidebar.tsx`: `onSendEdit` prop already exists — quick actions generate prompts and call it
- `useIframeSelector.ts`: Add `tagName` and `href` (for `a` tags) to `SelectedInfo`
- `ChatPanel.tsx`: Extract media library UI into a reusable component OR duplicate the fetch/display logic in EditorSidebar (simpler, less coupling)

### 3. Media Browser for Quick Actions

For the image/video source change, we need access to the media library outside ChatPanel.

**Approach:** Extract a `MediaBrowser` component from ChatPanel's existing media library code. Both ChatPanel and EditorSidebar use it.

**Component: `components/PageEditor/MediaBrowser.tsx`**
- Props: `projectId`, `onSelect(media)`, `onClose()`
- Renders the same grid UI currently in ChatPanel (lines 260-307)
- Handles its own fetch of media items
- Positioned as a floating panel below the quick action button

---

## Risk Analysis

**Escalation: Level 1 — Suggestion**

- UI-only changes, no API modifications
- No data model changes
- Quick actions reuse the existing `editPageComponent` API endpoint via `onSendEdit`
- The prompt-based approach means the AI still handles the actual HTML mutation — quick actions are just UI sugar for generating instructions
- If a quick action prompt fails, the user sees the same error flow as a chat message failure

**Minor risk:** Generated prompts need to be clear enough for the AI to execute correctly. The AI is already handling free-form instructions, so structured prompts like "Change the text content to X" should be reliable.

---

## Definition of Done

- [ ] Hover labels show friendly tag-based names (e.g., "Heading", "Image", "Paragraph")
- [ ] Selected labels show the same friendly names
- [ ] `SelectedInfo` includes `tagName` field
- [ ] Selected element info bar in sidebar shows quick action icons based on element type
- [ ] Pencil icon on text elements opens inline text input, submits as AI prompt
- [ ] ImagePlus icon on img/video opens media browser, submits as AI prompt with media
- [ ] Link icon on `a` elements opens inline URL input, submits as AI prompt
- [ ] Eye icon for visibility toggle preserved
- [ ] `MediaBrowser` extracted as reusable component used by both ChatPanel and quick actions
- [ ] All quick actions flow through the existing `onSendEdit` → `editPageComponent` pipeline
