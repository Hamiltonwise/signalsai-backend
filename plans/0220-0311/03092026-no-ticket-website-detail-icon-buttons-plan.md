# WebsiteDetail Icon-Only Buttons

## Problem Statement
Delete and View Live Site buttons take up too much horizontal space. Add a refresh button. All three should be icon-only.

## Context Summary
- Buttons are in the `AdminPageHeader` `actionButtons` slot (line ~1112-1135)
- View Live Site is an `<a>` tag with text + ExternalLink icon
- Delete is an `ActionButton` with text + Trash2 icon
- Refresh needs RefreshCw icon import + calls `loadWebsite()`

## Existing Patterns to Follow
- Icon-only buttons elsewhere use `p-2` padding, `rounded-lg`, and `title` for accessibility

## Proposed Approach
1. Add `RefreshCw` to lucide imports
2. Replace View Live Site `<a>` with icon-only styled link
3. Replace Delete `ActionButton` with icon-only button
4. Add Refresh icon-only button that calls `loadWebsite()`

## Risk Analysis
| Risk | Level | Mitigation |
|------|-------|------------|
| Discoverability without labels | Level 1 | `title` tooltips on all three |

## Definition of Done
- [x] Three icon-only buttons: Refresh, View Live, Delete
- [x] Refresh triggers cache invalidation
- [x] Build passes
