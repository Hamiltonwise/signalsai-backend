# Plan 08 — Agent Infrastructure Update

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 03 (schema — organization_id columns exist), 04 (backend auth — org-based middleware)
**Estimated files:** ~12 files

---

## Entry Conditions

- Plan 03 complete (agent_results, tasks, practice_rankings all have `organization_id` column populated)
- Plan 04 complete (controllers use `req.organizationId`)
- Plan 01 complete (GA4/GSC data fetching removed from aggregator and orchestrator)
- Backend compiles cleanly

---

## Problem Statement

Update the agent infrastructure to use `organization_id` instead of `google_account_id` as the primary key for data storage, retrieval, and API routing. Update agent payloads, orchestrator, task creator, and frontend API calls.

---

## Step 1: Update AgentResultModel

**File:** `signalsai-backend/src/models/AgentResultModel.ts`

**Update interface:**
- Add `organization_id: number`
- Mark `google_account_id` as deprecated/optional (if Migration 6 hasn't run yet) or remove (if it has)

**Update queries:**
- All `WHERE google_account_id = ?` → `WHERE organization_id = ?`
- `findByGoogleAccountId()` → `findByOrganizationId(organizationId)`
- `findLatestByGoogleAccountId()` → `findLatestByOrganizationId(organizationId)`
- Insert statements: use `organization_id` instead of `google_account_id`

---

## Step 2: Update TaskModel

**File:** `signalsai-backend/src/models/TaskModel.ts`

**Same pattern as Step 1:**
- Add `organization_id` to interface
- Update all queries from `google_account_id` to `organization_id`
- Update create/insert to use `organization_id`

---

## Step 3: Update PracticeRankingModel

**File:** `signalsai-backend/src/models/PracticeRankingModel.ts`

**Same pattern:**
- Add `organization_id` to interface
- Update `listByAccount(googleAccountId)` → `listByOrganization(organizationId)`
- Update `findLatestByAccountAndLocation(googleAccountId)` → `findLatestByOrganizationAndLocation(organizationId)`
- Update all WHERE clauses

---

## Step 4: Update Agent Orchestrator

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`

**Current pattern:**
```typescript
const { id: googleAccountId, domain_name: domain } = account;
fetchAllServiceData(oauth2Client, googleAccountId, domain, ...);
// Store result with google_account_id: googleAccountId
```

**New pattern:**
```typescript
const organizationId = req.organizationId; // or from function param
const connection = await GoogleConnectionModel.findByOrganization(organizationId);
const oauth2Client = await getValidOAuth2ClientByOrg(organizationId);
fetchAllServiceData(oauth2Client, organizationId, domain, ...);
// Store result with organization_id: organizationId
```

**Changes:**
- Replace all `googleAccountId` references with `organizationId`
- Look up google_connection from organization (for OAuth client)
- Look up domain from organization (not google_accounts)
- Store all results with `organization_id`
- Update `fetchAllServiceData()` signature if it takes googleAccountId param

---

## Step 5: Update Agent Input Builder

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts`

**All 6+ payload builder functions:**
- Replace `googleAccountId` field with `organizationId` in payload objects
- Update function signatures if they accept googleAccountId param

---

## Step 6: Update Webhook Orchestrator

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.webhook-orchestrator.ts`

**If this sends `googleAccountId` to external webhooks (n8n):**
- Replace with `organizationId`
- **WARNING:** External webhook consumers must be updated simultaneously. Document which webhooks are affected.

---

## Step 7: Update Task Creator

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.task-creator.ts`

**Current:** Creates tasks with `google_account_id: googleAccountId`

**New:** Creates tasks with `organization_id: organizationId`

---

## Step 8: Update AgentsController

**File:** `signalsai-backend/src/controllers/agents/AgentsController.ts`

**Route parameter changes:**
- `GET /agents/latest/:googleAccountId` → `GET /agents/latest/:organizationId`
- `GET /agents/getLatestReferralEngineOutput/:googleAccountId` → `GET /agents/getLatestReferralEngineOutput/:organizationId`

OR better: Remove route parameters entirely and use `req.organizationId` from rbac middleware. This is more secure — users can only see their own org's data.

**Controller handler changes:**
- All handlers that read `req.params.googleAccountId` → use `req.organizationId`
- All database queries → use `organization_id`
- All result storage → use `organization_id`

**Batch/scheduled agent runs:**
- Current: iterate over all google_accounts with `onboarding_completed = true`
- New: iterate over all organizations with `onboarding_completed = true`
- For each org: look up google_connection if GBP data is needed

---

## Step 9: Update Tasks Controller

**File:** `signalsai-backend/src/controllers/tasks/TasksController.ts`

**Current:** Uses `googleAccountId` from header/query to resolve domain and filter tasks.

**New:** Uses `organizationId` from rbac middleware to filter tasks. Domain resolved from `organizations.domain`.

---

## Step 10: Update Notifications Controller

**File:** `signalsai-backend/src/controllers/notifications/NotificationsController.ts`

**Same pattern as Tasks:** Replace domain-filtering via google_account_id with org-based filtering.

---

## Step 11: Update agent routes

**File:** `signalsai-backend/src/routes/agentsV2.ts`

**Update route definitions:**
- Change `:googleAccountId` params to `:organizationId` (or remove if using middleware)
- Ensure `authenticateToken` + `rbacMiddleware` are applied

---

## Step 12: Update frontend agent API

**File:** `signalsai/src/api/agents.ts`

**Update:**
- Replace `google_account_id` in request params/body with `organization_id`
- If endpoints now use middleware-based org resolution, remove explicit ID passing
- Update TypeScript interfaces

**File:** `signalsai/src/api/agentOutputs.ts`
- Same updates

---

## Step 13: Update frontend types

**File:** `signalsai/src/types/agentOutputs.ts`
- Replace `google_account_id: number | null` with `organization_id: number | null`

**File:** `signalsai/src/types/tasks.ts`
- Replace `google_account_id?: number` with `organization_id?: number` in all interfaces

**File:** `signalsai/src/api/notifications.ts`
- Replace `google_account_id?: number` with `organization_id?: number`

---

## Step 14: Update admin pages

**File:** `signalsai/src/pages/admin/PracticeRanking.tsx`
- Replace `google_account_id` references with `organization_id`

**File:** `signalsai/src/pages/admin/OrganizationManagement.tsx`
- Replace `google_account_id` in URL params with `organization_id`

---

## Step 15: Update data aggregator function signature

**File:** `signalsai-backend/src/utils/dataAggregation/dataAggregator.ts`

**Current:** `fetchAllServiceData(oauth2Client, googleAccountId, domain, propertyIds, ...)`

**New:** `fetchAllServiceData(oauth2Client, organizationId, domain, propertyIds, ...)`

Update internal queries accordingly.

---

## Verification

1. Agent batch runs work: iterate over organizations, fetch GBP data, store results with organization_id
2. Agent results retrievable by organization_id
3. Tasks created with organization_id
4. Frontend displays agent outputs correctly
5. Admin pages show correct data
6. No remaining `google_account_id` references in agent infrastructure

---

## Exit Conditions

- [ ] AgentResultModel uses organization_id for all queries
- [ ] TaskModel uses organization_id for all queries
- [ ] PracticeRankingModel uses organization_id for all queries
- [ ] Agent orchestrator stores results with organization_id
- [ ] Agent input builder sends organizationId in payloads
- [ ] Task creator uses organization_id
- [ ] AgentsController uses organization_id (not route params with googleAccountId)
- [ ] Tasks/Notifications controllers use organization_id
- [ ] Frontend agent/task types updated
- [ ] Frontend API calls use organization_id
- [ ] Admin pages updated
- [ ] Backend compiles cleanly
- [ ] Agent batch runs execute successfully
