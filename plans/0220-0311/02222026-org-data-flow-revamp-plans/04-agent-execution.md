# Plan 04 — Agent Execution: Populate organization_id + location_id

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Structural Feature
**Depends on:** Plans 01-03 (locations exist, columns exist, backfill done)

---

## Problem Statement

All agent execution code paths currently populate `organization_id` from `google_connections.organization_id` and use `domain` as a secondary key. None populate `location_id`. The task creator service has a bug where it falls back to `googleAccountId` (connection ID) when `organizationId` is null — storing a connection ID in an org_id column.

This plan updates all agent code to:
1. Resolve the correct `location_id` from the GBP location being processed
2. Always populate both `organization_id` and `location_id` on every insert
3. Fix the `organizationId ?? googleAccountId` fallback bug

---

## Context Summary

### Agent Code Paths That Insert Data

| Agent | File | What it inserts | Current org_id source | Current location resolution |
|-------|------|----------------|----------------------|----------------------------|
| Proofline (daily) | `AgentsController.ts:89-228` | `agent_results` | `account.organization_id` | None — no location |
| Monthly Agents | `AgentsController.ts:231-572` | `agent_results` (4 types) | `account.organization_id` | None |
| GBP Optimizer | `AgentsController.ts:870-1117` | `agent_results` | `account.organization_id` | None |
| Ranking Agent | `AgentsController.ts:1119-1351` | `practice_rankings` | `accOrgId \|\| accId` (bug) | `gbp_location_id` string only |
| Guardian/Governance | `service.governance-validator.ts:358-403` | `agent_results` | `null` (SYSTEM) | None (correct — global agent) |
| Task Creator | `service.task-creator.ts:21-437` | `tasks` | `organizationId ?? googleAccountId` (BUG) | None |
| PMS Upload | `pms-upload.service.ts:15-207` | `pms_jobs` | **MISSING** | **MISSING** |
| Notifications | `NotificationService.ts` | `notifications` | `account.organization_id \|\| null` | **MISSING** |

### Location Resolution Strategy

The GBP location being processed determines the `location_id`:

```
google_connections.google_property_ids.gbp[]
  → each entry has { accountId, locationId, displayName }
  → locationId matches google_properties.external_id
  → google_properties.location_id → locations.id
```

For agents that process ALL locations for an account (proofline, monthly), we need to determine which location the data belongs to. Currently these agents process per-domain, not per-location. The approach:

1. **Single-location orgs (majority today):** Use the primary location
2. **Multi-location orgs:** Agent must be refactored to run per-location (future enhancement — out of scope here, use primary location as default)

---

## Existing Patterns to Follow

- `account` object fetched from `google_connections` via `db("google_connections").where("id", googleAccountId).first()`
- `organization_id` extracted as `account.organization_id`
- Agent results stored with `organization_id`, `domain`, `agent_type`, `agent_input`, `agent_output`

---

## Proposed Approach

### Step 1: Create Location Resolution Utility

**New file:** `src/utils/locationResolver.ts`

```typescript
/**
 * Resolve the location_id for a given google connection and optional GBP location ID.
 *
 * Resolution order:
 * 1. If gbpLocationId provided → match google_properties.external_id → location_id
 * 2. If no match → use primary location for the organization
 * 3. If no organization → return null
 */
export async function resolveLocationId(
  organizationId: number | null,
  gbpLocationId?: string | null
): Promise<number | null>
```

This centralizes location resolution so every agent uses the same logic.

### Step 2: Update AgentsController.ts

#### Proofline Agent (`runProoflineAgent`, line 89)

Currently iterates ALL onboarded accounts:
```typescript
const accounts = await db("google_connections")
  .where("onboarding_completed", true)
  .select("*");
```

**Change:** After fetching account, resolve location:
```typescript
const locationId = await resolveLocationId(account.organization_id);
```

Then pass `location_id: locationId` to every `db("agent_results").insert()`.

#### Monthly Agents (`runMonthlyAgents`, line 231)

Same pattern — resolve location from the google_connection, pass to all 4 agent result inserts.

#### GBP Optimizer (`runGbpOptimizer`, line 870)

Already processes per-GBP-location. **Change:** Resolve `location_id` from the specific `gbpLocationId` being processed:
```typescript
const locationId = await resolveLocationId(account.organization_id, gbpLocationId);
```

#### Ranking Agent (`runRankingAgent`, line 1119)

Already iterates per-GBP-location. **Change:** Resolve `location_id` for each location:
```typescript
const locationId = await resolveLocationId(accOrgId, loc.locationId);
```

Pass `location_id: locationId` to the `practice_rankings` insert.

**Also fix:** Replace `organization_id: accOrgId || accId` with `organization_id: accOrgId` (remove the wrong fallback).

#### Guardian/Governance (SYSTEM agents)

No change. These are global agents with `organization_id: null` and `location_id: null`.

### Step 3: Update service.task-creator.ts

**Fix the critical bug on lines 43, 114, 216, 378:**

Before:
```typescript
organization_id: organizationId ?? googleAccountId,  // BUG: stores connection ID as org ID
```

After:
```typescript
organization_id: organizationId ?? null,  // Properly null if no org
```

**Add location_id to all task creation:**

All four task creator functions receive `googleAccountId`, `domain`, `organizationId` as params. **Change signature** to also accept `locationId`:

```typescript
export async function createTasksFromOpportunityOutput(
  googleAccountId: number,
  domain: string,
  organizationId: number | null,
  locationId: number | null,    // NEW
  agentOutput: any,
  agentResultId: number
)
```

Pass `location_id: locationId` to every `db("tasks").insert()`.

**Callers** (in `AgentsController.ts`) must pass the resolved `locationId`.

### Step 4: Update pms-upload.service.ts

PMS upload receives `domain` from request body. **Change:**

1. After `GoogleConnectionModel.findByDomain(domain)`, resolve location:
```typescript
const locationId = await resolveLocationId(account.organization_id);
```

2. Pass `organization_id` and `location_id` to `PmsJobModel.create()`:
```typescript
const job = await PmsJobModel.create({
  organization_id: account.organization_id,
  location_id: locationId,
  domain: domain,
  // ... rest
});
```

### Step 5: Update NotificationService.ts

`createNotification()` and `createNotificationForDomain()` already resolve the google_connection. **Change:** Add location resolution:

```typescript
const locationId = await resolveLocationId(account.organization_id);
const notificationData = {
  organization_id: account.organization_id || null,
  location_id: locationId,
  domain_name: data.domain_name,
  // ... rest
};
```

### Step 6: Update PmsJobModel interface

Add `organization_id` and `location_id` to `IPmsJob`:

```typescript
export interface IPmsJob {
  id: number;
  domain: string;
  organization_id: number | null;   // NEW
  location_id: number | null;       // NEW
  status: string;
  // ... rest
}
```

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Centralized `resolveLocationId()` utility | Single function for all agents | Prevents inconsistent resolution logic across agent code paths. |
| Primary location as default | When no specific GBP location is being processed | Most orgs have one location. Multi-location agents will be enhanced later. |
| Fix `organizationId ?? googleAccountId` bug | Replace with `organizationId ?? null` | Connection ID is never a valid org ID. Better to have NULL than wrong data. |
| Pass `locationId` through function params | Explicit parameter threading | Avoids hidden state. Each function declares its dependencies. |
| PMS jobs get org_id at upload time | Resolve from domain → google_connection → org | PMS upload is the only entry point for job creation. Domain is available. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| `resolveLocationId()` returns null for valid data | Level 2 | Fallback to primary location. Log warning if no location found. |
| Changing task creator function signatures | Level 2 | All callers are in AgentsController.ts — controlled blast radius. |
| PMS upload: `GoogleConnectionModel.findByDomain()` is deprecated | Level 3 | This method queries a dropped column. **Must update to use `organizations.domain` lookup instead.** |
| Agent runs during migration window | Level 1 | New code handles null location_id gracefully. Old data isn't broken. |

---

## Failure Mode Analysis

- **Location not found:** `resolveLocationId()` returns null. Row inserted with `location_id: null`. No crash.
- **Google connection not found for PMS domain:** Existing error handling catches this — returns 404.
- **Task creator receives null locationId:** Tasks created with `location_id: null`. Dashboard still shows them (filtered by org_id).

---

## Security Considerations

- No authorization changes. This is internal data population logic.
- Location_id values come from trusted DB lookups, not user input.

---

## Performance Considerations

- `resolveLocationId()` adds 1-2 DB queries per agent run. Negligible cost.
- Could cache location lookups per-org if needed. Not worth it at current scale.

---

## Test Strategy

1. **Unit test `resolveLocationId()`:** Various scenarios — with gbpLocationId, without, no org, no locations
2. **Integration test:** Run monthly agents for a test account, verify agent_results have location_id
3. **Integration test:** Upload PMS data, verify pms_jobs has org_id + location_id
4. **Integration test:** Verify tasks created by agents have location_id
5. **Regression test:** Guardian/Governance agents still create with null org_id and null location_id

---

## Blast Radius Analysis

- **Files modified:** ~6 backend files
  - `src/utils/locationResolver.ts` (NEW)
  - `src/controllers/agents/AgentsController.ts`
  - `src/controllers/agents/feature-services/service.task-creator.ts`
  - `src/controllers/pms/pms-services/pms-upload.service.ts`
  - `src/controllers/notifications/feature-services/NotificationService.ts`
  - `src/models/PmsJobModel.ts`
- **Existing behavior:** All inserts now include `location_id` field (nullable). No existing queries break.
- **Frontend:** No changes.

---

## Definition of Done

- [ ] `resolveLocationId()` utility created and tested
- [ ] All `agent_results` inserts include `location_id`
- [ ] All `tasks` inserts include `location_id`
- [ ] All `pms_jobs` inserts include `organization_id` + `location_id`
- [ ] All `notifications` inserts include `location_id`
- [ ] All `practice_rankings` inserts include `location_id` (integer FK, not just GBP string)
- [ ] `organizationId ?? googleAccountId` bug fixed (replaced with `organizationId ?? null`)
- [ ] SYSTEM agents still insert with null org_id and null location_id
- [ ] PMS domain lookup updated to use `organizations.domain` (not deprecated `google_connections.domain_name`)
