# Fix EditorSidebar TypeScript Error

## Problem Statement
`setActiveAction(externalAction)` fails because `QuickActionType` includes `"text-up"` and `"text-down"` which aren't valid `activeAction` values.

## Context Summary
- `activeAction` state: `"text" | "link" | "media" | null` — controls which sidebar panel is open.
- `externalAction` (`QuickActionType`): `"text" | "link" | "media" | "hide" | "text-up" | "text-down"`.
- `"hide"` is already filtered at line 89. `"text-up"` / `"text-down"` are reorder actions that don't open a sidebar panel — they need the same filtering.

## Existing Patterns to Follow
- `"hide"` is handled via early return before reaching `setActiveAction`.

## Proposed Approach
Filter `"text-up"` and `"text-down"` the same way `"hide"` is filtered — handle them before the `setActiveAction` call. Since their handlers should be called but no sidebar panel should open, add them to the early-exit branch.

## Risk Analysis
- Level 1 — Type narrowing fix, preserves existing runtime behavior.

## Definition of Done
- `tsc -b` passes with 0 errors.
