# Fix PMS Upload Broken Domain Lookup

## Problem Statement
`processManualEntry()` in `pms-upload.service.ts` calls `GoogleConnectionModel.findByDomain(domain)` which queries `google_connections.domain_name` — a column dropped in migration `20260221000004`. This crashes the monthly agent pipeline on manual PMS entry.

## Context Summary
- Migration `20260221000004` renamed `google_accounts` → `google_connections` and dropped `domain_name`
- `GoogleConnectionModel` still has 4 deprecated methods referencing `domain_name` directly on the table
- `AgentsController` already solved this by joining through `organizations.domain`
- `organizationId` is already resolved at line 25-28 of `processManualEntry()` before the broken call at line 96
- `GoogleConnectionModel.findOneByOrganization(orgId)` exists and returns the connection by org

## Existing Patterns to Follow
- `AgentsController.ts` joins `google_connections` ↔ `organizations` via `organization_id` and aliases `o.domain as domain_name`
- `OrganizationModel.findByDomain()` is the canonical domain lookup (works fine, queries `organizations` table)

## Proposed Approach

### 1. Fix the call site (`pms-upload.service.ts:96`)
Replace `GoogleConnectionModel.findByDomain(domain)` with `GoogleConnectionModel.findOneByOrganization(organizationId)`. The `organizationId` is already in scope and resolved.

### 2. Clean up broken deprecated methods in `GoogleConnectionModel`
Remove the 4 methods that query `domain_name` directly — they're all broken and marked `@deprecated`:
- `findOnboardedAccounts()` — replaced by `AgentsController` join pattern
- `findOnboardedClients()` — replaced by `AgentsController` join pattern
- `getDomainFromAccountId()` — use org lookup instead
- `findByDomain()` — use `findOneByOrganization()` or `OrganizationModel.findByDomain()`

Also remove the transitional interface fields (`domain_name`, `practice_name`, etc.) that correspond to dropped columns.

### 3. Verify no other callers reference the removed methods
Grep for all usages before deleting.

## Risk Analysis
**Level 1 — Suggestion.** Minimal risk.
- The call site fix is a one-liner swap using an already-resolved variable
- The deprecated methods are all broken (query nonexistent columns), so removing them can't break working code
- `AgentsController` already uses the correct pattern

## Revision Log

### Rev 1 — Cascading breakage from interface cleanup
Removing transitional fields from `IGoogleConnection` surfaced two additional broken callers:
- `TasksController.ts:516` — `findOnboardedClients()` → replaced with org-joined query
- `profile.service.ts` — referenced `phone` and `operational_jurisdiction` on `IGoogleConnection` → rewired entire profile module to use `OrganizationModel` (phone dropped since it lives on `users` table now)

## Definition of Done
- `processManualEntry()` uses `findOneByOrganization(organizationId)` instead of `findByDomain(domain)` ✅
- All 4 broken deprecated methods removed from `GoogleConnectionModel` ✅
- Transitional interface fields cleaned from `IGoogleConnection` ✅
- `TasksController` uses org-joined query for onboarded clients ✅
- Profile module rewired from `GoogleConnectionModel` to `OrganizationModel` ✅
- `phone` removed from profile module (lives on `users` table, not connections/orgs) ✅
- No remaining references to removed methods ✅
- TypeScript compiles clean ✅
- Pipeline no longer crashes on manual PMS entry ✅
