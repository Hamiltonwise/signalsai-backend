# Fix Monthly Agents Domain Validation — Align with Org-Centered Execution Model

**Date:** 2026-03-10
**Ticket:** no-ticket
**Tier:** Minor Change
**Related:** Plan 04 (02222026-org-data-flow-revamp-plans/04-agent-execution.md)

---

## Problem Statement

The `POST /api/agents/monthly-agents-run` endpoint still requires `domain` as a mandatory request body parameter (line 324 of `AgentsController.ts`). This is a leftover from the domain-centered execution model that was replaced by the org+location model in February 2026.

All 3 callers (pms-upload, pms-approval, pms-retry) must awkwardly resolve `domain` from the organization just to pass it to an endpoint that already joins the `organizations` table internally. When `org.domain` is null or empty, the endpoint returns 400 and the pipeline fails silently because all callers use fire-and-forget axios calls.

**Observed failure:**
```
POST /api/agents/monthly-agents-run - STARTING
Account ID: 56
Domain:
Force run: true
PMS Job ID: 112
Location ID: 18
[PMS] Failed to trigger monthly agents retry: Request failed with status code 400
```

---

## Context Summary

### Current Flow (Broken)
```
Caller → resolves org?.domain (can be "") → sends in request body
  → AgentsController validates !domain → 400 if empty
  → But internally already joins org table: o.domain as domain_name
  → domain param only used for: logging (line 299), admin email (line 568)
  → All data inserts use account.organization_id + locationId (correct)
```

### Where `domain` Is Used Post-Validation
1. **Logging** (line 299): `log(\`Domain: ${domain}\`)` — cosmetic only
2. **Admin email** (line 567-568): `notifyAdminsMonthlyAgentComplete(domain, ...)` — display text in admin notification email, uses `domain` as `practiceName`

### Callers That Send `domain`
| Caller | File | How it resolves domain |
|--------|------|----------------------|
| PMS Upload (manual entry) | `pms-upload.service.ts:113` | `domain` from request body (already has it) |
| PMS Approval | `pms-approval.service.ts:202` | `org?.domain \|\| ""` — can be empty |
| PMS Retry | `pms-retry.service.ts:216` | `org?.domain \|\| ""` — can be empty |

### What the Endpoint Already Has Internally
Line 334-338: Already fetches `o.domain as domain_name` and `o.name as practice_name` from the org join. The request `domain` parameter is redundant.

---

## Existing Patterns to Follow

- Proofline agent: Does NOT require domain as a parameter. Iterates accounts with org join, uses `domain_name` from the join result for display.
- All data inserts: Use `organization_id` + `location_id` (integer FKs), not domain strings.
- `resolveLocationId()`: Centralized utility for location resolution — already used in monthly agents (line 351-353).

---

## Proposed Approach

### 1. AgentsController.ts — `runMonthlyAgents`

**a) Remove `domain` from required validation (line 324):**
```
Before: if (!googleAccountId || !domain)
After:  if (!googleAccountId)
```

**b) Use internal org-joined `domain_name`/`practice_name` for logging and admin email:**
- Line 299: Change `log(\`Domain: ${domain}\`)` → `log(\`Domain: ${account.domain_name || "N/A"}\`)` (move after account fetch)
- Line 567-568: Change `notifyAdminsMonthlyAgentComplete(domain, ...)` → `notifyAdminsMonthlyAgentComplete(account.practice_name || account.domain_name || "Unknown", ...)`

**c) Remove `domain` from destructured params (line 293):**
- Keep accepting it for backward compat (other callers may still send it), but don't require it.

### 2. notificationHelper.ts — `notifyAdminsMonthlyAgentComplete`

**Rename parameter for clarity:**
```
Before: (domain: string, agentResults, tasksCreated)
After:  (practiceName: string, agentResults, tasksCreated)
```

Update internal references from `domain` to `practiceName`. This is a display-only change — the function uses this value for email summary text.

### 3. pms-retry.service.ts — `retryMonthlyAgents`

**a) Remove the org lookup that only exists to resolve domain (lines 204-207):**
```typescript
// DELETE: No longer needed
const org = job.organization_id
  ? await OrganizationModel.findById(job.organization_id)
  : null;
```

**b) Remove `domain` from the axios payload (line 216):**
```typescript
// Before
{ googleAccountId: account.id, domain: org?.domain || "", force: true, pmsJobId: jobId, locationId: job.location_id }
// After
{ googleAccountId: account.id, force: true, pmsJobId: jobId, locationId: job.location_id }
```

**c) Fix fire-and-forget error handling (lines 209-231):**
The current pattern returns success even when the HTTP call fails. Change to `await` the axios call so failures propagate:
```typescript
await axios.post(...);
```
If the POST fails, the error will propagate to the outer catch block which already handles it properly (lines 238-249).

### 4. pms-approval.service.ts — `approveAndTrigger`

**a) Remove the org lookup for domain (lines 190-192):**
Same pattern as retry — delete the `OrganizationModel.findById` call that only exists to resolve domain.

**b) Remove `domain` from the axios payload (line 202):**
Same change — remove `domain: org?.domain || ""`.

**c) Fix fire-and-forget error handling:**
Same issue — `await` the axios call.

### 5. pms-upload.service.ts — `handleManualEntry`

**a) Keep `domain` in payload if it's already available from the request context:**
This caller already has `domain` from the request body. It's fine to keep sending it (the endpoint will accept but not require it). No change needed unless we want to clean it up.

**Decision:** Leave as-is. The upload service has domain from the user's request — no lookup needed, no empty string risk.

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Removing domain validation breaks something downstream | Level 1 | Domain is not used for any data operation. Only logging + email display. Internal join provides the same data. |
| Changing fire-and-forget to awaited calls | Level 2 | Retry/approval functions already have proper error handling in their outer try/catch. Await ensures errors propagate correctly. |
| `notifyAdminsMonthlyAgentComplete` parameter rename | Level 1 | Only 1 caller. Internal-only function. |
| `account.domain_name` or `account.practice_name` could be null | Level 1 | Fallback chain: `practice_name || domain_name || "Unknown"`. |

---

## Blast Radius Analysis

- **Files modified:** 4
  - `signalsai-backend/src/controllers/agents/AgentsController.ts` (validation + logging + admin email call)
  - `signalsai-backend/src/utils/core/notificationHelper.ts` (parameter rename)
  - `signalsai-backend/src/controllers/pms/pms-services/pms-retry.service.ts` (remove domain, fix await)
  - `signalsai-backend/src/controllers/pms/pms-services/pms-approval.service.ts` (remove domain, fix await)
- **Frontend:** None
- **Database:** None
- **API contract:** `domain` becomes optional (non-breaking — callers can still send it)

---

## Definition of Done

- [x] `runMonthlyAgents` no longer requires `domain` in request body
- [x] Logging uses internally-resolved org name instead of request `domain`
- [x] Admin email uses `practice_name` from org join
- [x] `notifyAdminsMonthlyAgentComplete` parameter renamed from `domain` to `practiceName`
- [x] PMS retry service removes unnecessary org lookup for domain
- [x] PMS approval service removes unnecessary org lookup for domain
- [x] Both retry and approval `await` the axios call instead of fire-and-forget
- [x] PMS Job 112 / Account 56 scenario no longer returns 400
