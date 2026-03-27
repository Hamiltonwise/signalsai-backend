# Show generation_status in Pages List Instead of Plain "draft"

## Problem Statement
Pages with `generation_status: "generating"` or `"queued"` display as "draft" in the normal pages list because the badge only reads `status` and ignores `generation_status`.

## Context Summary
- `WebsitePage` interface (`api/websites.ts:38`) lacks `generation_status` field
- Backend `listPages` returns all columns (including `generation_status`) — no backend change needed
- `WebsiteDetail.tsx` line 1612 renders `displayPage.status` for the badge
- `getGenStatusStyles()` (line 722) and `getPageStatusStyles()` (line 743) both exist
- The generation status polling view (lines 1485-1516) already handles this correctly with spinner + amber badge

## Existing Patterns to Follow
- `getGenStatusStyles()` for generating/queued/ready/failed colors
- Loader2 spinner for "generating"/"queued" states

## Proposed Approach
1. Add `generation_status?: string` to `WebsitePage` interface
2. In the pages list badge (line 1611-1615): if `generation_status` is "generating" or "queued", show that with amber styling + spinner instead of the plain `status`
3. In the expanded version list badge (line 1658-1662): same logic
4. Hide "Edit" button when generation is in progress (can't edit a page that's still generating)

## Risk Analysis
- **Level 1 — Low risk.** Additive display change, no data mutations.

## Definition of Done
- Pages with `generation_status: "generating"` show amber "generating" badge with spinner
- Pages with `generation_status: "queued"` show gray "queued" badge
- Pages with `generation_status: "failed"` show red "failed" badge
- "Edit" button hidden when generation not ready
- Pages with `generation_status: "ready"` or null show normal `status` badge (no change)
