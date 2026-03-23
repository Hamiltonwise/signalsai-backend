# Fix TypeScript Errors in SkillUpgradeTab

## Problem Statement
Two TS6133 (unused declaration) errors:
1. `toParentingSession` function (line 101) — defined but never called.
2. `mindName` destructured prop (line 116) — never referenced in the component body.

## Context Summary
- `toParentingSession` was likely scaffolded for future adapter use but is dead code.
- `mindName` is in the props interface but the component uses `skillName` for the `mindName` prop on child components (lines 364, 394).

## Existing Patterns to Follow
- Remove dead code entirely rather than prefixing with `_`.

## Proposed Approach
1. Delete the `toParentingSession` function (lines 100–114) and its `ParentingSession` import if no longer needed.
2. Prefix `mindName` with `_` in the destructure since it's part of the public props interface (removing it from the interface would be a breaking change for callers).

## Risk Analysis
- **Level 1 — Suggestion**: Removing dead code, no behavioral change.

## Definition of Done
- `tsc --noEmit` passes with zero errors.
