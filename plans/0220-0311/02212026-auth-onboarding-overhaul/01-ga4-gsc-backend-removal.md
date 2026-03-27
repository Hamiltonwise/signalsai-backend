# Plan 01 — GA4/GSC Backend Removal

**Parent:** 00-MASTER-PLAN.md
**Depends on:** Nothing (can execute first)
**Estimated files:** ~35 backend files

---

## Entry Conditions

- Codebase compiles and backend starts cleanly
- No in-flight changes to GA4/GSC backend code

---

## Problem Statement

Remove all GA4 and GSC backend infrastructure: routes, controllers, services, utilities. Strip references from shared services (data aggregator, agent orchestrator, settings, scope management). After this plan, the backend has zero GA4/GSC capability.

---

## Step 1: Delete GA4 Backend (entire directory)

**Action:** Delete the following files:

```
signalsai-backend/src/routes/ga4.ts
signalsai-backend/src/controllers/ga4/Ga4Controller.ts
signalsai-backend/src/controllers/ga4/feature-services/service.analytics-api.ts
signalsai-backend/src/controllers/ga4/feature-services/service.data-fetcher.ts
signalsai-backend/src/controllers/ga4/feature-services/service.data-processor.ts
signalsai-backend/src/controllers/ga4/feature-services/service.opportunity-detector.ts
signalsai-backend/src/controllers/ga4/feature-services/service.trend-calculator.ts
signalsai-backend/src/controllers/ga4/feature-utils/util.response-builder.ts
signalsai-backend/src/controllers/ga4/feature-utils/util.error-handler.ts
signalsai-backend/src/controllers/ga4/feature-utils/util.property-formatter.ts
signalsai-backend/src/controllers/ga4/feature-utils/util.date-ranges.ts
```

Also delete the `dist/` compiled versions if present.

---

## Step 2: Delete GSC Backend (entire directory)

**Action:** Delete the following files:

```
signalsai-backend/src/routes/gsc.ts
signalsai-backend/src/controllers/gsc/GscController.ts
signalsai-backend/src/controllers/gsc/feature-services/service.search-console-api.ts
signalsai-backend/src/controllers/gsc/feature-services/service.key-metrics.ts
signalsai-backend/src/controllers/gsc/feature-services/service.ai-ready-data.ts
signalsai-backend/src/controllers/gsc/feature-services/service.sites.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.error-handler.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.validation.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.device-data.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.opportunities.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.trend-score.ts
signalsai-backend/src/controllers/gsc/feature-utils/util.date-ranges.ts
```

Also delete `dist/` compiled versions if present.

---

## Step 3: Remove route registrations from index.ts

**File:** `signalsai-backend/src/index.ts`

**Remove:**
- Import: `import ga4Routes from "./routes/ga4";`
- Import: `import gscRoutes from "./routes/gsc";`
- Registration: `app.use("/api/ga4", ga4Routes);`
- Registration: `app.use("/api/gsc", gscRoutes);`

---

## Step 4: Strip GA4/GSC from data aggregator

**File:** `signalsai-backend/src/utils/dataAggregation/dataAggregator.ts`

**Remove:**
- Import of `getGA4AIReadyData`
- Import of `getGSCAIReadyData`
- Function `fetchGA4DataForRange()` entirely
- Function `fetchGSCDataForRange()` entirely
- GA4/GSC calls from `fetchAllServiceData()`
- `ga4Data` and `gscData` fields from `ServiceDataResult` type

**Keep:**
- `fetchGBPDataForRange()`
- `aggregateClarityDataForRange()`
- `fetchPMSDataForRange()`
- `fetchAllServiceData()` (modified — only GBP, Clarity, PMS)

---

## Step 5: Strip GA4/GSC from agent orchestrator

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`

**Remove:**
- `ga4_data` object references in daily data aggregation
- `gsc_data` object references in daily data aggregation
- GA4/GSC sections in monthly data fetching
- `ga4_data` assignment in response objects
- `gsc_data` assignment in response objects

**Keep:**
- GBP data handling
- Clarity data handling
- PMS data handling
- All orchestration logic

---

## Step 6: Strip GA4/GSC from agent input builder

**File:** `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts`

**Remove:**
- GA4 data sections from all payload builders
- GSC data sections from all payload builders

**Keep:**
- GBP, Clarity, PMS data sections
- Payload structure (just with fewer fields)

---

## Step 7: Strip GA4/GSC from scope definitions and management

**Files:**
- `signalsai-backend/src/controllers/googleauth/utils/scopeDefinitions.ts` — Remove `analytics.readonly` and `webmasters.readonly` scopes
- `signalsai-backend/src/controllers/auth/feature-services/ScopeManagementService.ts` — Remove GA4/GSC from REQUIRED_SCOPES, remove `ga4`/`gsc` incremental scope keys

---

## Step 8: Strip GA4/GSC from settings services

**Files:**
- `signalsai-backend/src/controllers/settings/feature-services/service.google-properties.ts` — Remove GA4/GSC property listing functions
- `signalsai-backend/src/controllers/settings/feature-utils/util.property-parser.ts` — Remove GA4/GSC property parsing
- `signalsai-backend/src/controllers/settings/feature-utils/util.scope-parser.ts` — Remove GA4/GSC scope parsing
- `signalsai-backend/src/controllers/settings/SettingsController.ts` — Remove GA4/GSC property management handlers

---

## Step 9: Strip GA4/GSC from admin/org utilities

**Files:**
- `signalsai-backend/src/controllers/admin-organizations/feature-utils/propertyIdsParser.ts` — Remove GA4/GSC parsing
- `signalsai-backend/src/controllers/admin-organizations/feature-services/ConnectionDetectionService.ts` — Remove GA4/GSC detection logic

---

## Step 10: Strip GA4/GSC from practice ranking services

**Files (read first to determine exact changes):**
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-computation.ts`
- `signalsai-backend/src/controllers/practice-ranking/feature-services/service.ranking-algorithm.ts`

**Action:** Remove any GA4/GSC data references from ranking calculations. Keep GBP-based ranking logic.

---

## Step 11: Clean up dist directory

**Action:** Delete `signalsai-backend/dist/` and rebuild.

---

## Step 12: Verify

- Run `npm run build` (or `tsc`) in backend — must compile cleanly
- Search for any remaining imports from deleted files — must find zero
- Search for `ga4` and `gsc` in backend src — only comments/documentation should remain

---

## Exit Conditions

- [ ] All GA4 backend files deleted
- [ ] All GSC backend files deleted
- [ ] Route registrations removed from index.ts
- [ ] Data aggregator no longer fetches GA4/GSC
- [ ] Agent orchestrator/input builder no longer include GA4/GSC data
- [ ] Scope definitions only include: openid, email, profile, business.manage
- [ ] Settings no longer manage GA4/GSC properties
- [ ] Backend compiles cleanly
- [ ] No remaining imports reference deleted files
