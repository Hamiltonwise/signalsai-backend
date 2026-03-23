# Remove Legacy Domain Columns & Fix Delete Service

**Date**: 02/22/2026
**Ticket**: no-ticket

---

## Problem Statement

Multiple tables still carry legacy `domain`/`domain_name` string columns from the pre-multi-location architecture:

1. **`agent_results.domain`** — used to associate results with a practice by domain string
2. **`practice_rankings.domain`** — denormalized from `google_connections.domain_name`
3. **`tasks.domain_name`** — used as primary identifier linking tasks to clients
4. **`pms_jobs.domain`** — primary scoping key for PMS job data
5. **`notifications.domain_name`** — stored alongside organization_id/location_id

These columns are now redundant because all five tables already have `organization_id` and `location_id` columns (added in recent migrations). All CRUD operations that reference these domain columns must be updated before the columns can be dropped.

Additionally:

- The `deleteOrganization` service must stop deleting from `audit_processes` and `clarity_data_store` (those belong to a separate app).
- Website builder FK cascades are already correct — all child tables (`pages`, `media`, `header_footer_code`, `user_edits`) already CASCADE from `projects`. The `alloro_imports` table has no FK relationships (standalone reference table). No changes needed.
- All admin pages must use organization-based filtering (not domain-based).

---

## Context Summary

- `organization_id` and `location_id` were backfilled into all tables in migrations `20260221000003`, `20260222000005`, and `20260222000006`
- All tables already have FK CASCADE on `organization_id` to `organizations`
- The domain columns are TEXT strings (not FK-constrained), so they can be dropped without FK impact
- System agent results (Guardian, Governance Sentinel) use `domain: "SYSTEM"` with `organization_id: null` — after removal, use `organization_id IS NULL` + `agent_type` filter instead
- `notificationHelper.ts` resolves domain → organization_id/location_id via google_connections lookup — this indirection must be replaced with direct org/location params
- `fetchClients()` is backed by `GoogleConnectionModel.findOnboardedClients()` which is already marked `@deprecated` — ready to replace with organizations query

---

## Existing Patterns to Follow

- Model interfaces (`IAgentResult`, `IPracticeRanking`, `ITask`, `IPmsJob`, `INotification`) define DB row shapes — must remove domain fields
- Model query methods use `organization_id` + `location_id` for scoping (already present alongside domain)
- Frontend types mirror backend interfaces — must also be updated
- Admin filter/list endpoints support `domain` query params — replace with `organization_id`

---

## Proposed Approach

### Part A: Remove `audit_processes`/`clarity_data_store` cleanup from delete service

**File**: `service.delete-organization.ts`

- Remove lines 43-46 (the `if (org.domain)` block that deletes from `audit_processes` and `clarity_data_store`)
- Update JSDoc comment to reflect removal

---

### Part B: Remove `domain` from `agent_results` CRUD

**Backend files to modify:**

1. **`AgentResultModel.ts`**
   - Remove `domain` from `IAgentResult` interface
   - Remove `domain` from `AgentResultFilters` interface — add `organization_id` filter
   - Remove `findByDomainAndAgent()` — replace with `findByOrgAndAgent(organizationId, agentType)` (or `findByLocationAndAgent` if callers have location context)
   - Remove `findLatestByDomainAndAgent()` — replace with org/location-scoped variant
   - Remove `listDomains()` method entirely
   - Remove domain filter from `listAdmin()` — add `organization_id` filter
   - Add `organization_id` to list admin query builder

2. **`service.governance-validator.ts`**
   - Remove `domain: "SYSTEM"` from Guardian and Governance Sentinel inserts — use `organization_id: null` to identify system results
   - Remove domain-based duplicate check — use `agent_type` + `date_start` + `organization_id IS NULL` instead

3. **`service.agent-input-builder.ts`**
   - **Keep `domain` in webhook payloads** — but derive it from `locations.domain` via the location_id (or from organization.domain)
   - Add `organization_id` and `location_id` to all webhook payloads
   - Affected functions: `buildProoflinePayload`, `buildSummaryPayload`, `buildOpportunityPayload`, `buildReferralEnginePayload`, `buildCroOptimizerPayload`, `buildCopyCompanionPayload`

4. **`AdminAgentOutputsController.ts`**
   - Remove `getDomains()` handler — replace with `getOrganizations()` that returns org id+name pairs
   - Update `/domains` route → `/organizations` in `routes/admin/agentOutputs.ts`

5. **`AgentOutputListService.ts`**
   - Remove `"domain"` from `LIST_COLUMNS` — add `"organization_id"` if not present

6. **`buildAgentOutputFilters.ts`**
   - Remove `domain` filter mapping — add `organization_id` filter

**Frontend files to modify:**

7. **`types/agentOutputs.ts`**
   - Remove `domain` from `AgentOutput` interface — add `organization_id`
   - Remove `domain` from `FetchAgentOutputsRequest` — add `organization_id`
   - Remove `DomainsResponse` — add `OrganizationsResponse` (id + name)

8. **`api/agentOutputs.ts`**
   - Remove `fetchDomains()` — add `fetchOrganizations()` that calls new endpoint

9. **`pages/admin/AgentOutputsList.tsx`**
   - Replace `domains` state with `organizations` state (array of `{ id, name }`)
   - Replace `selectedDomain` with `selectedOrganizationId`
   - Replace domain filter dropdown with organization filter dropdown (shows org names)
   - Remove domain display in output cards — show organization name instead

---

### Part C: Remove `domain` from `practice_rankings` CRUD

**Backend files to modify:**

1. **`PracticeRankingModel.ts`**
   - Remove `domain` from `IPracticeRanking` interface

2. **`PracticeRankingController.ts`**
   - Remove `domain: account.domain_name` from INSERT at ~line 120
   - Remove `"domain"` from SELECT columns at ~line 360
   - Add `organization_name` to list response (JOIN with organizations table, or enrich in formatter)

3. **`service.llm-webhook-handler.ts`**
   - Line 116: Remove `domain_name: ranking.domain` from task creation — use `organization_id` and `location_id` from the ranking row directly

4. **`service.ranking-pipeline.ts`**
   - Remove `domain` parameter from `analyzeRanking()` function signature
   - For client website URL derivation (`https://${domain}`): pull domain from `locations.domain` via the location_id
   - For display name: use GBP location name or location name instead of domain

5. **`service.ranking-computation.ts`**
   - Remove `domain` parameter from `processBatch()` function signature
   - Thread through updated calls

6. **`util.ranking-formatter.ts`**
   - Remove `domain: ranking.domain` from all formatter functions
   - Add `organization_name` to formatted output (resolve from ranking.organization_id)

**Frontend files to modify:**

7. **`pages/admin/PracticeRanking.tsx`**
   - Remove `domain` from `GoogleAccount`, `RankingJob`, `RankingResult` interfaces
   - Add `organization_name` to `RankingJob` and `BatchGroup` interfaces
   - Change batch header display from `{getWeekLabel(batch.createdAt)}: {batch.domain}` → `{getWeekLabel(batch.createdAt)}: {batch.organizationName}`
   - Add organization filter dropdown to filter ranking history by organization
   - Replace all domain fallback displays with GBP location name or organization name

8. **`components/dashboard/RankingsDashboard.tsx`**
   - Remove `domain` from `RankingResult` interface
   - Replace domain fallback display with GBP location name

---

### Part D: Remove `domain_name` from `tasks` CRUD

**Backend files to modify:**

1. **`TaskModel.ts`**
   - Remove `domain_name` from `ITask` interface
   - Remove `findByIdAndDomain()` — replace with `findByIdAndOrg(id, organizationId)`
   - Remove `findByDomainApproved()` — replace with `findByOrgApproved(organizationId)`
   - Remove `findRecentByDomain()` — replace with `findRecentByOrg(organizationId, agentType, limit)`
   - Update `findUserTasksForApproval()` to select `organization_id` instead of `domain_name`
   - Remove `domain_name` filter from `listAdmin()` — add/use `organization_id` filter

2. **`TasksController.ts`**
   - Replace `domain_name` access control check with `organization_id` check
   - Replace `domain_name` in createTask — use `organization_id` and `location_id` only
   - Remove `GoogleConnectionModel.findByDomain(domain_name)` validation — validate org existence via `OrganizationModel.findById` instead
   - Replace `getClients()` endpoint with `getOrganizations()` — query `organizations` table directly instead of deprecated `findOnboardedClients()`

3. **`TaskFilteringService.ts`**
   - Remove `domain_name` filter parsing — add `organization_id` filter

4. **`TaskApprovalService.ts`**
   - Replace `groupTasksByDomain()` with `groupTasksByOrg()` — group by `organization_id`
   - Update notification creation to pass `organization_id` instead of `domain_name`

5. **`service.task-creator.ts`**
   - Remove `domain_name: domain` from all task insert payloads (opportunity, CRO optimizer, referral engine agents)

**Frontend files to modify:**

6. **`types/tasks.ts`**
   - Remove `domain_name` from `ActionItem`, `CreateActionItemRequest`, `FetchActionItemsRequest`
   - Replace `ClientOption` with `OrganizationOption` (`{ id: number; name: string }`)
   - Update `ClientsResponse` → `OrganizationsResponse`

7. **`api/tasks.ts`**
   - Update `createTask` to use `organization_id` instead of `domain_name`
   - Update `fetchAllTasks` filter params — `organization_id` instead of `domain_name`
   - Replace `fetchClients()` with `fetchOrganizations()` — call updated endpoint

8. **`components/Admin/CreateTaskModal.tsx`**
   - Replace domain selector with organization selector (dropdown shows org names, value is org ID)
   - Update form state from `domain_name: ""` to `organization_id: 0`

9. **`components/Admin/ActionItemsHub.tsx`**
   - Replace "Client" filter label → "Organization"
   - Replace `clients` state with `organizations` state
   - Replace `selectedClient` with `selectedOrganization`
   - Map dropdown options from `org.name` instead of `client.domain_name`
   - Replace `task.domain_name` display with organization name (resolve from task.organization_id)

---

### Part E: Remove `domain` from `pms_jobs` CRUD

**Backend files to modify:**

1. **`PmsJobModel.ts`**
   - Remove `domain` from `IPmsJob` interface
   - Remove `domain` from `PmsJobFilters` — add `organization_id` filter
   - Replace `findLatestByDomain(domain)` → `findLatestByOrg(organizationId)`
   - Replace `findActiveAutomation(domain)` → `findActiveAutomationByOrg(organizationId)`
   - Replace `listByDomain(domain, pagination)` → `listByOrg(organizationId, pagination)`
   - Replace `findJobsForKeyData(domain)` → `findJobsForKeyDataByOrg(organizationId)`
   - Replace `findLatestJobForKeyData(domain)` → `findLatestJobForKeyDataByOrg(organizationId)`
   - Update `listAdmin()` to filter by `organization_id` instead of `domain`
   - Update `findActiveAutomationJobs()` to filter by `organization_id` instead of `domain`

2. **`pms-upload.service.ts`**
   - Remove `domain: domain` from both manual entry and file upload inserts
   - Accept `organizationId` and `locationId` directly instead of resolving from domain

3. **`pms-data.service.ts`**
   - Replace `domain` filter with `organization_id` in all raw queries
   - Replace `where("domain", domain)` with `where("organization_id", organizationId)`

4. **`PmsController.ts`**
   - Update `listJobs` to accept `organization_id` query param instead of `domain`
   - Update all PMS endpoints that currently accept domain to accept org/location IDs

**Frontend files to modify:**

5. **`components/Admin/PMSAutomationCards.tsx`**
   - Replace `domainFilter` state with `organizationFilter` (org ID)
   - Replace `availableDomains` with list of organizations (fetch from org endpoint)
   - Update domain filter dropdown → organization filter dropdown (show org names)
   - Replace `job.domain` display with organization name
   - Update `fetchPmsJobs` call to pass `organization_id` instead of `domain`

6. **`api/pms.ts`**
   - Update `fetchPmsJobs` params — `organization_id` instead of `domain`
   - Update all PMS API functions that pass `domain` to pass `organization_id`

---

### Part F: Remove `domain_name` from `notifications` CRUD

**Backend files to modify:**

1. **`NotificationModel.ts`**
   - Remove `domain_name` from `INotification` interface
   - Replace `findByDomain(domainName)` → `findByOrg(organizationId)`
   - Replace `countUnread(domainName)` → `countUnreadByOrg(organizationId)`
   - Replace `findByIdAndDomain(id, domainName)` → `findByIdAndOrg(id, organizationId)`
   - Replace `markAllRead(domainName)` → `markAllReadByOrg(organizationId)`
   - Replace `deleteAllByDomain(domainName)` → `deleteAllByOrg(organizationId)`

2. **`notificationHelper.ts`**
   - Change `createNotification` signature from `(domain, title, ...)` to `(organizationId, locationId, title, ...)`
   - Remove the google_connections lookup that resolves domain → org_id/location_id
   - Accept org_id and location_id directly

3. **All callers of `createNotification`** — update to pass org_id/location_id instead of domain string

---

### Part G: Database Migration — Drop Columns

**Single migration file**: `20260222000008_drop_legacy_domain_columns.ts`

```
agent_results: DROP COLUMN domain
practice_rankings: DROP COLUMN domain
tasks: DROP COLUMN domain_name
pms_jobs: DROP COLUMN domain
notifications: DROP COLUMN domain_name
```

Down migration re-adds columns as nullable TEXT (data is not recoverable).

---

## Risk Analysis

### Level 2 — Concern: External webhook payloads (n8n)

The `service.agent-input-builder.ts` sends `domain` in payloads to n8n agent webhooks. **Resolution**: Keep `domain` in webhook payloads but derive it from `locations.domain` at call time. Also add `organization_id` and `location_id` to payloads. The following agents send domain:

- `buildProoflinePayload` (Proofline agent)
- `buildSummaryPayload` (Summary agent)
- `buildOpportunityPayload` (Opportunity agent)
- `buildReferralEnginePayload` (Referral Engine agent)
- `buildCroOptimizerPayload` (CRO Optimizer agent)
- `buildCopyCompanionPayload` (Copy Companion agent)
- `buildGuardianGovernancePayload` does NOT send domain (no change needed)

### Level 2 — Concern: System agent results

Guardian/Governance Sentinel results currently use `domain: "SYSTEM"` with `organization_id: null`. **Resolution**: Use `organization_id IS NULL` as the identifier for system results. The `agent_type` values (`"guardian"`, `"governance_sentinel"`) are already unique and sufficient for querying.

### Level 1 — Suggestion: Admin filter standardization

All admin pages will use organization-based filtering:

- **Action Items Hub**: "Client" dropdown → "Organization" dropdown (backed by organizations table)
- **Agent Outputs**: domain dropdown → organization dropdown
- **AI PMS Automation**: domain dropdown → organization dropdown
- **Practice Ranking**: add organization filter; batch headers show `{Week}: {Organization Name}` instead of `{Week}: {domain}`

---

## Blast Radius Analysis

- **agent_results**: Model (6 methods), 1 controller, 2 services, 1 filter builder, 1 list service, 3 frontend files
- **practice_rankings**: Model, 1 controller, 3 services, 1 formatter util, 2 frontend files
- **tasks**: Model (5 methods), 1 controller, 2 services, 4 frontend files
- **pms_jobs**: Model (7+ methods), 1 controller, 2 services, 2 frontend files
- **notifications**: Model (5 methods), 1 helper, multiple callers
- **delete service**: 2 lines removed (isolated change)
- **Website builder cascades**: No changes needed (all already CASCADE)

Total: ~40 files across backend + frontend

---

## Definition of Done

- [ ] `audit_processes`/`clarity_data_store` cleanup removed from `deleteOrganization` service
- [ ] All `agent_results.domain` reads/writes replaced with `organization_id`/`location_id`; webhook payloads derive domain from location
- [ ] All `practice_rankings.domain` reads/writes replaced; batch headers show org name
- [ ] All `tasks.domain_name` reads/writes replaced; "clients" → "organizations" in admin UI
- [ ] All `pms_jobs.domain` reads/writes replaced with `organization_id`
- [ ] All `notifications.domain_name` reads/writes replaced with `organization_id`
- [ ] All admin pages filter by organization (Action Items Hub, Agent Outputs, PMS Automation, Practice Ranking)
- [ ] Webhook payloads still include `domain` (derived from location) + new `organization_id`/`location_id` fields
- [ ] Frontend types updated (domain fields removed, organization fields added)
- [ ] Migration created to drop all domain columns
- [ ] Backend `npx tsc --noEmit` passes
- [ ] Frontend `npx tsc --noEmit` passes
- [ ] Vite build succeeds
- [ ] Website builder cascades verified (no changes needed)

---

## Revision Log

### Rev 1 — 02/22/2026

- **Added**: `pms_jobs.domain` removal (Part E) — 7+ model methods, 2 services, controller, 2 frontend files
- **Added**: `notifications.domain_name` removal (Part F) — 5 model methods, notification helper, all callers
- **Changed**: Webhook payloads now keep `domain` (derived from location) + add `organization_id`/`location_id` per user feedback
- **Changed**: System agent results use `organization_id IS NULL` instead of `domain: "SYSTEM"` per user feedback
- **Added**: Admin filter standardization across 4 admin pages (Action Items Hub, Agent Outputs, PMS Automation, Practice Ranking)
- **Added**: Practice Ranking batch header format change: `{Week}: {domain}` → `{Week}: {Organization Name}`
- **Added**: Action Items Hub "Client" → "Organization" rename, backed by organizations table query
- **Updated**: Blast radius from ~30 to ~40 files
