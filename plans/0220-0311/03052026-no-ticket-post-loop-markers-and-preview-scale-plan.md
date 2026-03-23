# Post Loop Markers & Preview Scale

## Problem Statement

Post blocks currently iterate the entire block HTML per post, making it impossible to have a wrapper (e.g., grid container) around iterated items. Also, the post block preview iframe has no scale-down like the template page editors do.

## Context Summary

- Post block renderer in `website-builder-rebuild/src/services/postblock.service.ts` joins all sections, then duplicates the entire HTML per post
- `renderPostBlockHtml` in `shortcodes.ts` does token replacement per post
- Template page editors use `transform: scale(0.45)` on preview iframes
- PostBlocksTab preview iframe has no scale applied

## Existing Patterns to Follow

- Template page editor scale: `transform: scale(0.45)`, `width: ${100/0.45}%`, `height: ${100/0.45}%`, `transformOrigin: top left`
- Loop markers follow existing `{{token}}` convention

## Proposed Approach

### 1. Add loop markers to renderer (`postblock.service.ts`)

Split block HTML on `{{start_post_loop}}` / `{{end_post_loop}}`:
- `before` = everything before `{{start_post_loop}}`
- `template` = everything between markers
- `after` = everything after `{{end_post_loop}}`
- Result = `before + posts.map(render(template)).join('') + after`
- Fallback: if no markers found, iterate entire block (backward compatible)

### 2. Update preview in PostBlocksTab

- Apply same `transform: scale(0.45)` pattern to the preview iframe
- In preview, strip the loop markers and simulate 1 post (existing placeholder behavior)

### 3. Update token reference

- Add `{{start_post_loop}}` and `{{end_post_loop}}` to the token reference bar
- Update default block template to include markers
- Update documentation page

## Risk Analysis

- **Level 1**: Small, backward-compatible change. Existing blocks without markers keep working.

## Definition of Done

- [x] Loop markers split before/template/after in renderer
- [x] Fallback to full-block iteration when no markers present
- [x] Preview iframe scaled to 0.45 matching template editors
- [x] Token reference updated
- [x] Default new block template includes markers
- [x] Documentation page updated
