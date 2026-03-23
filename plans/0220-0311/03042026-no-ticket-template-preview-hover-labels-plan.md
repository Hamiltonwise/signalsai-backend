# Template Preview — Hover Labels for alloro-tpl Components

## Problem Statement
The template detail preview page (`/admin/templates/:id`) renders page previews in iframes but doesn't show the hover/click selection labels that the page editor has. Users want to see which `alloro-tpl-*` components exist when hovering, matching the page editor UX.

## Context Summary
- `TemplateDetail.tsx` renders desktop (scaled 0.45x) and mobile (1:1) iframe previews via `srcDoc`
- `useIframeSelector` hook already provides hover/click labels, CSS injection, and selection state
- The hook accepts an optional `onQuickAction` callback — omitting it makes it hover/select labels only (action buttons render but are inert)
- Both iframes use `sandbox="allow-same-origin allow-scripts"` (required for contentDocument access)
- Only one iframe is rendered at a time (conditional on `previewMode`)

## Existing Patterns to Follow
- PageEditor/LayoutEditor both use `useIframeSelector(iframeRef, onQuickAction)` + `prepareHtmlForPreview()`
- `onLoad={handleIframeLoad}` → calls `setupListeners()`

## Proposed Approach
1. Import `useIframeSelector` and `prepareHtmlForPreview` in TemplateDetail
2. Add `useRef<HTMLIFrameElement>` for the preview iframe
3. Call `useIframeSelector(iframeRef)` with no `onQuickAction` (hover/select labels only)
4. Add `ref={iframeRef}` and `onLoad` to both desktop and mobile iframes
5. Wrap `previewContent` with `prepareHtmlForPreview()` before passing to `srcDoc`

## Risk Analysis
- **Level 1 — Low risk.** Read-only visual enhancement, no data mutations, no backend changes.
- Labels at 0.45x desktop scale will be small but hover outlines remain visible. Mobile is 1:1 and fully readable.

## Definition of Done
- Hovering over alloro-tpl components in template preview shows colored labels (purple for sections, blue for components)
- Clicking shows selected state with label
- No editing functionality (no sidebar, no quick actions)
