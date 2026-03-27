# Fix Two TypeScript Errors

## Problem Statement
Two TypeScript compilation errors blocking the build:
1. `PostsTab.tsx:174` — `taxonomyLoading` declared but never read (TS6133)
2. `RichTextEditor.tsx:86` — `false` passed where `SetContentOptions` expected (TS2559)

## Context Summary
- `taxonomyLoading` getter is unused but `setTaxonomyLoading` is actively used (lines 240, 247). Underscore prefix suppresses the warning.
- TipTap's `setContent` signature changed — second arg is now an options object, not a boolean.

## Existing Patterns to Follow
- Underscore-prefixed unused destructured vars are already used elsewhere in the codebase.

## Proposed Approach
1. Rename `taxonomyLoading` → `_taxonomyLoading` in PostsTab.tsx
2. Replace `false` with `{ emitUpdate: false }` in RichTextEditor.tsx

## Risk Analysis
- **Level 1 — Suggestion**: Both are minimal, isolated fixes with zero behavioral change.

## Definition of Done
- `tsc --noEmit` passes with no errors for both files.
