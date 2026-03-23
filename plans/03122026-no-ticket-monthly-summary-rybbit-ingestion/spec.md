# Add Rybbit Website Analytics to Monthly Summary Agent

## Why
The summary agent currently analyzes GBP + PMS data. Adding Rybbit website analytics (sessions, pageviews, bounce rate — current month vs previous month) gives it the full picture: online visibility (GBP) + website performance (Rybbit) + practice revenue (PMS). The summary prompt already lists "Website analytics → enrich if available" as an input.

## What
Wire `fetchRybbitMonthlyComparison()` (already exists) into `processMonthlyAgents()`. Pass the data into `buildSummaryPayload()` as a new `websiteAnalytics` field. The summary agent receives it as `additional_data.website_analytics` alongside GBP and PMS data. No prompt changes — Summary.md already handles it.

## Context

**Relevant files:**
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — `processMonthlyAgents()`, has `organizationId`, `startDate`, `endDate`
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — `buildSummaryPayload()`, needs `websiteAnalytics` param
- `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts` — `fetchRybbitMonthlyComparison()` already built
- `signalsai-backend/src/agents/monthlyAgents/Summary.md` — already says "Website analytics → enrich if available"

**Patterns to follow:**
- PMS data fetch pattern in `processMonthlyAgents()` (try/catch, log, continue with null)
- Proofline Rybbit integration pattern (just completed)

**Key decisions:**
- Previous month for comparison = offset `monthRange` back by one more month
- Data goes into summary payload only — opportunity/CRO/referral receive summary output, not raw data
- `fetchRybbitMonthlyComparison()` takes 4 date params (current start/end, previous start/end)

## Constraints

**Must:**
- Non-blocking — Rybbit failure must not block monthly agent chain
- Use existing `fetchRybbitMonthlyComparison()` from shared utility
- Match the PMS data pattern (try/catch with warning log)

**Must not:**
- Don't modify Summary.md prompt (already handles website analytics)
- Don't pass Rybbit data to downstream agents (they receive summary output)

**Out of scope:**
- Rybbit `metric` endpoint breakdowns (referrer, device, top pages — future enhancement)
- Frontend changes

## Risk

**Level:** 1

**Risks identified:**
- None. Identical pattern to the proofline integration.

## Tasks

### T1: Add websiteAnalytics to buildSummaryPayload
**Do:** In `service.agent-input-builder.ts`, add optional `websiteAnalytics` param to `buildSummaryPayload()`. If provided, include as `additional_data.website_analytics`.
**Files:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts`
**Verify:** `npx tsc --noEmit`

### T2: Wire Rybbit fetch into processMonthlyAgents
**Do:** In `service.agent-orchestrator.ts`, after PMS data fetch (around line 399) and before raw data prep (line 401):
1. Import `fetchRybbitMonthlyComparison` (already imported for daily — just add the function)
2. Compute previous month range: offset `startDate` back by one month
3. Call `fetchRybbitMonthlyComparison(organizationId, startDate, endDate, prevStartDate, prevEndDate)`
4. Pass result into `buildSummaryPayload()` as `websiteAnalytics`
5. Log whether data was available
**Files:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Verify:** `npx tsc --noEmit`

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] Summary payload includes `website_analytics` when `rybbit_site_id` exists
- [ ] Monthly agents still work when no `rybbit_site_id` exists (GBP + PMS only)
- [ ] Rybbit API failure does not break the monthly agent chain
