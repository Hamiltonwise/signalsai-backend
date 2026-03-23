# Fix WebsiteDetail TypeScript Errors

## Problem Statement
Two TS errors in WebsiteDetail.tsx: unused `bulkSeoJobId` variable and missing `uuid` argument to `invalidateWebsite()`.

## Context Summary
- `useInvalidateAdminWebsiteDetail().invalidate` requires a `uuid: string` argument.
- `bulkSeoJobId` getter is never read — only `setBulkSeoJobId` is used.

## Existing Patterns to Follow
- The `id` variable (route param) is already available in scope and is the website UUID.

## Proposed Approach
1. Change `invalidateWebsite()` → `invalidateWebsite(id)` (line 255), guarded by the existing `if (!id) return` check above.
2. Destructure as `[, setBulkSeoJobId]` to drop the unused getter.

## Risk Analysis
- Level 1 — Trivial type fixes, zero runtime behavior change.

## Definition of Done
- `tsc -b` passes with 0 errors.
