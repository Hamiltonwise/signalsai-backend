# Fix Breakline Rendering in Custom Fields

**Ticket:** --no-ticket
**Date:** 03/06/2026

## Problem Statement

Textarea custom fields (e.g., business hours) store newlines correctly but render them as literal `\n` or collapsed whitespace on the live site. The `escapeHtml()` function in the runtime renderer doesn't convert newline characters to `<br>` tags.

## Context Summary

- Admin textarea stores newlines as actual `\n` characters in custom field values
- Backend `JSON.stringify()` serializes to DB — newlines preserved in JSONB
- Runtime `renderPostBlockHtml()` replaces `{{post.custom.<slug>}}` tokens using `escapeHtml(String(value))`
- `escapeHtml()` only handles XSS characters (`& < > " '`), not newlines
- All custom field rendering paths converge at `shortcodes.ts:164-168`

## Existing Patterns to Follow

`escapeHtml` is the security boundary for post tokens. The fix must preserve XSS protection while adding newline-to-`<br>` conversion for custom fields only.

## Proposed Approach

Add a `nl2br` helper in `shortcodes.ts` that converts `\n` to `<br>` after HTML escaping. Apply it only to custom field values (line 167), not to single-line tokens like title/slug.

### File Changes

| File | Change |
|------|--------|
| `website-builder-rebuild/src/utils/shortcodes.ts` | Add `nl2br` after `escapeHtml` for custom fields |

## Risk Analysis

**Level 1 — Low risk.** Single-line change. `escapeHtml` runs first (XSS safe), then `\n` → `<br>` conversion. No other token types affected.

## Definition of Done

- [x] Custom field textarea values render with `<br>` line breaks on the live site
- [x] XSS protection preserved (escapeHtml runs first)
- [x] Build passes clean
