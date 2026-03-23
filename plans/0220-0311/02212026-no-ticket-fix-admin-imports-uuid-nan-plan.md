# Fix Admin Imports UUID NaN Error

## Problem Statement

The Admin Imports feature crashes with `invalid input syntax for type uuid: "NaN"` because the backend controller wraps route params in `Number(id)` before passing them to model queries. The `alloro_imports.id` column is a UUID — `Number("550e8400-...")` produces `NaN`, which PostgreSQL rejects.

## Context Summary

- **DB schema**: `website_builder.alloro_imports.id` is `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Frontend**: Correctly passes UUID strings via React Router params and fetch calls
- **BaseModel**: `findById()`, `updateById()`, `deleteById()` all accept `number | string` — no issue at this layer
- **AlloroImportModel**: Overrides `findById` with `id: number` type — incorrect for UUID
- **IAlloroImport interface**: Types `id` as `number` — incorrect for UUID
- **ImportStatusService**: `changeStatus(id: number, ...)` — incorrect for UUID
- **AdminImportsController**: 4 call sites wrap `id` in `Number()` — the direct cause of the bug

## Existing Patterns to Follow

- `BaseModel.findById(id: number | string)` — already supports string UUIDs
- Route params from Express are always strings — no conversion needed for UUID columns

## Proposed Approach

### 1. Fix `IAlloroImport` interface (AlloroImportModel.ts)
- Change `id: number` → `id: string`

### 2. Fix `AlloroImportModel` method signatures (AlloroImportModel.ts)
- `findById(id: number)` → `findById(id: string)`
- `updateStatus(id: number)` → `updateStatus(id: string)`
- `findPublishedVersionExcludingId(filename, excludeId: number)` → `excludeId: string`
- `updateStatusReturning(id: number)` → `updateStatusReturning(id: string)`
- `findVersionsForDeletion` return type: `id: number` → `id: string`

### 3. Fix `ImportStatusService` (ImportStatusService.ts)
- `changeStatus(id: number, ...)` → `changeStatus(id: string, ...)`
- `StatusChangeResult.previouslyPublished.id: number` → `id: string`

### 4. Fix `AdminImportsController` (AdminImportsController.ts)
- Line 131: `AlloroImportModel.findById(Number(id))` → `AlloroImportModel.findById(id)`
- Line 180: `AlloroImportModel.findById(Number(id))` → `AlloroImportModel.findById(id)`
- Line 258: `importStatusService.changeStatus(Number(id), status)` → `importStatusService.changeStatus(id, status)`
- Line 297: `AlloroImportModel.findById(Number(id))` → `AlloroImportModel.findById(id)`

## Risk Analysis

**Escalation: Level 1 — Suggestion**

Low risk. This is a type correction to match the actual DB schema. All changes are confined to the admin imports feature. No other models or controllers reference `AlloroImportModel`.

## Definition of Done

- All 4 `Number(id)` calls removed from `AdminImportsController.ts`
- `IAlloroImport.id` typed as `string`
- All model and service method signatures updated from `number` to `string` for ID params
- Backend compiles without type errors
- Admin imports CRUD operations work with UUID IDs (no more NaN error)
