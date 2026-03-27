# Fix TypeScript Errors — Plan

## Problem Statement
10 TypeScript errors across 4 files (2 backend, 3 frontend). Backend errors are type mismatches between controller code and `PaginationParams`/`PaginatedResult` interfaces. Frontend errors are unused imports/variables.

## Context Summary
- `PaginationParams` = `{ limit?, offset? }` — controllers pass `{ page, limit }` instead
- `PaginatedResult<T>` = `{ data: T[], total: number }` — controllers access `result.pagination` which doesn't exist
- Frontend: 3 unused imports in MindParentingTab, 2 unused state vars in SlideProposalsReview, 1 unused import in MindsList

## Existing Patterns to Follow
- `BaseModel.paginate()` uses `offset` not `page` — convert page→offset at call site
- Response shape is `{ data, total }` — build pagination metadata from page/limit/total

## Proposed Approach

### Backend (2 files, same fix pattern)
1. Convert `{ page, limit }` to `{ offset: (page - 1) * limit, limit }` when calling `findByProjectId`
2. Build pagination response from `result.total`, `page`, and `limit` instead of accessing `result.pagination`

### Frontend (3 files)
1. Remove unused imports: `CheckCircle`, `XCircle`, `AlertCircle` from MindParentingTab
2. Remove unused state: `compileRunId`/`setCompileRunId`, `compileSteps`/`setCompileSteps` from SlideProposalsReview
3. Remove unused import: `useCallback` from MindsList

## Risk Analysis
- Level 1 — Suggestion. All changes are mechanical fixes. No behavioral change.

## Definition of Done
- `tsc --noEmit` passes for both backend and frontend with zero errors from these files
