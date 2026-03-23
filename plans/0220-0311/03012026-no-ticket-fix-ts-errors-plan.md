# Fix TypeScript Errors in Parenting Components

## Problem Statement
Two TypeScript errors blocking compilation:
1. `ParentingProposals.tsx:164` — Missing `title` property in `onSessionUpdate` call (required by `ParentingSession` interface).
2. `ParentingReadingView.tsx:21` — `phase` declared but never read (TS6133). `setPhase` is used on line 104, but `phase` is never consumed.

## Context Summary
- `ParentingSession` interface (minds.ts:891) requires `title: string | null`.
- The `onSessionUpdate` call at line 164 constructs a synthetic session object during the "compiling" transition — it omits `title`.
- `phase` state in `ParentingReadingView` is set via SSE events but never rendered or passed anywhere.

## Existing Patterns to Follow
- All other `ParentingSession` constructions include every required field.
- Unused state variables should be prefixed with `_` or removed.

## Proposed Approach
1. **Error 1**: Add `title: null` to the object literal at `ParentingProposals.tsx:164`.
2. **Error 2**: Prefix `phase` with `_` → `const [_phase, setPhase]` to suppress TS6133 while preserving the state setter usage. (Removing the state entirely would break `setPhase` on line 104.)

## Risk Analysis
- **Level 1 — Suggestion**: Both are trivial, no behavioral change. Adding `title: null` is correct since a compiling session has no title yet. Prefixing unused var is standard TS convention.

## Definition of Done
- `tsc --noEmit` passes with zero errors for both files.
