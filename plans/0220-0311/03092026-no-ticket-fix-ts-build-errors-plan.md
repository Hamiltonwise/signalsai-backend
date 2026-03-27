# Fix TypeScript Build Errors

## Problem Statement
`npm run build` fails with 8 TypeScript errors in two admin components.

## Context Summary
- **OrgSettingsSection.tsx** (7 errors): `Record<string, unknown>` values used in JSX conditionals like `{orgBd.name && (<p>...</p>)}`. Since `unknown` is not assignable to `ReactNode`, TypeScript rejects the expression when the short-circuit could resolve to `unknown`.
- **OrgUsersSection.tsx** (1 error): `orgId` destructured but never used (TS6133).

## Existing Patterns to Follow
- File already uses `as string` casts for rendering values — consistent with that approach.

## Proposed Approach
1. Convert `{val && (<jsx/>)}` patterns to `{val ? (<jsx/>) : null}` so the expression always resolves to `ReactNode` (JSX or null), never `unknown`.
2. Remove unused `orgId` from destructuring in OrgUsersSection.

## Risk Analysis
- **Level 1 — Suggestion**: Trivial type fixes, zero runtime impact.

## Definition of Done
- `tsc -b` passes with 0 errors.
