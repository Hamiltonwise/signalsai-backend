# Fix Frontend TypeScript Compilation Errors

## Problem Statement

7 TypeScript errors across 5 frontend files prevent clean compilation. All are unused variables/imports or dead code with type mismatches.

## Context Summary

These are pre-existing errors unrelated to recent backend work. They fall into two categories:
1. **Unused imports/params (TS6133)**: Dead references left after feature evolution
2. **Type mismatches on dead code (TS2339)**: `PropertiesTab.tsx` has an `integration.property` branch that can never be reached (property is always `null` for GBP), causing `displayName` and `idValue` type errors

## Existing Patterns to Follow

- Underscore prefix (`_item`) for intentionally unused callback params
- Remove unused imports entirely

## Proposed Approach

### 1. `PropertiesTab.tsx` — 3 errors
- **Line 104**: `handleSelectProperty(item)` — prefix unused param: `_item`
- **Lines 350-370**: Remove the dead `integration.property` branch entirely (property is always `null`, this code is unreachable, and it references non-existent type properties)

### 2. `PropertySelectionModal.tsx` — 1 error
- **Line 39**: Destructured `type` is unused — prefix with underscore: `_type`

### 3. `Admin.tsx` — 1 error
- **Line 1**: Remove unused `import * as Sentry from "@sentry/react"`

### 4. `Settings.tsx` — 1 error
- **Line 362**: `handleSelectProperty(item)` — prefix unused param: `_item`

### 5. `VerifyEmail.tsx` — 1 error
- **Line 4**: Remove `Mail` from the lucide-react import

## Risk Analysis

**Escalation: Level 1 — Suggestion.** Pure dead code cleanup. No behavioral changes.

## Definition of Done

- Frontend compiles with zero TypeScript errors
- No behavioral changes to any component
