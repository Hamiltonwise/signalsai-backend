# Code View: Side-by-Side Preview in Layout & Page Editors

## Problem Statement
When toggling to code view in the Layout Editor (header/footer) and Page Editor, the iframe preview disappears entirely. User wants the preview visible alongside the code editor (split view).

## Context Summary
- **LayoutEditor.tsx** (lines 505-527): Code view renders full-width Monaco only, no preview.
- **PageEditor.tsx** (lines 751-772): Code view renders full-width Monaco only, no preview.
- Both editors already maintain preview state (`previewHtml` / `htmlContent`) while in code view.
- No AI sidebar needed in code view — user is manually editing code.

## Existing Patterns to Follow
- Both editors use `flex-1 flex overflow-hidden` container for side-by-side layouts.
- Preview iframe already uses device-responsive width container with rounded shadow.
- Visual mode already uses split layout (iframe left, AI sidebar right).

## Proposed Approach

### 1. LayoutEditor.tsx — Code view split
Replace the full-width Monaco (lines 505-527) with a 50/50 split:
- Left: Monaco editor (flex-1)
- Right: iframe preview (flex-1) — same device-responsive container used in visual mode, read-only (no selector interaction)

### 2. PageEditor.tsx — Code view split
Replace the full-width Monaco (lines 751-772) with a 50/50 split:
- Left: Monaco editor (flex-1)
- Right: iframe preview (flex-1) — reuses existing device/width logic, no selector needed

### 3. No changes to
- EditorSidebar (stays hidden in code view)
- EditorToolbar
- Any backend files
- useIframeSelector (not active in code view)

## Risk Analysis
- **Level 1 — Low risk.** UI-only change in two files. No logic changes. No API changes.
- Preview in code view is read-only (no selector hooks attached) so no interaction side effects.

## Definition of Done
- Code view in LayoutEditor shows Monaco + iframe preview side by side
- Code view in PageEditor shows Monaco + iframe preview side by side
- Preview respects current device mode (desktop/tablet/mobile)
- Visual mode behavior unchanged
- No regressions in save/publish/undo flows
