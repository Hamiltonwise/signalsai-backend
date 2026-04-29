# Fix PMS Production Trend Source

## Why
The PMS production trend chart is plotting `productionTotal` from monthly rollups, but procedure-log data can bucket all patient/practice production into the first referral month. That makes actual production look like it dropped in later months even when raw service-month production increased.

## What
Separate referral-attributed production from actual production-by-service-month, then make the dashboard chart use actual monthly production while keeping referral attribution and source ranking intact.

## Context

**Relevant files:**
- `src/utils/pms/adapters/procedureLogAdapter.ts` — builds procedure-log `monthly_rollup` from raw PMS rows.
- `src/utils/pms/adapters/templateAdapter.ts` — builds template/pre-aggregated `monthly_rollup`.
- `src/utils/pms/applyColumnMapping.ts` — owns PMS rollup output types.
- `src/utils/pms/monthlyProduction.ts` — calculates actual production by service month from raw mapped PMS rows.
- `src/utils/pms/pmsAggregator.ts` — aggregates approved PMS jobs into `/pms/keyData` months/sources.
- `src/models/PmsJobModel.ts` — should own PMS job database reads used by aggregation.
- `frontend/src/api/pms.ts` — typed `/pms/keyData` response contract.
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — maps API months into dashboard data.
- `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx` — renders the production/referral trend chart.

**Patterns to follow:**
- Keep routes/controllers thin; PMS aggregation logic stays in services/utils, DB reads go through models.
- Keep dashboard components typed and dumb; data interpretation happens before rendering.
- Preserve existing PMS upload/manual-entry UI behavior.

**Key decisions already made:**
- `productionTotal` for charting should mean actual production in that calendar/service month.
- Referral counts and source rankings stay referral-attribution based.
- Add explicit `attributedProductionTotal` when old attribution semantics still need to be exposed.
- No database schema migration is required; existing `response_log` and `raw_input_data` JSON fields are sufficient.

## Constraints

**Must:**
- Preserve existing source ranking behavior, which is based on attributed source production.
- Keep existing approved PMS jobs readable even when they do not have the new field.
- Use `raw_input_data` + column mapping to recover actual production for existing procedure-log jobs where possible.
- Fall back safely to existing `production_total` when raw rows or mappings are missing.
- Keep `/pms/keyData` backward compatible enough that unrelated consumers do not break.

**Must not:**
- Touch PMS upload/manual-entry modal UX.
- Redesign the chart.
- Introduce a new dependency.
- Add DB schema changes.
- Silently change referral counts or source production attribution.

**Out of scope:**
- Reworking referral attribution rules.
- Reprocessing all historical jobs in the database.
- Fixing existing unrelated backend model/query layering drift outside the PMS aggregation path.

## Risk

**Level:** 3 — Structural Risk

**Risks identified:**
- Changing `productionTotal` semantics can break agent inputs or dashboard metrics that expected attributed production → **Mitigation:** add explicit `actualProductionTotal` and `attributedProductionTotal`, map `productionTotal` to actual only at the API/dashboard contract boundary, and keep attributed values available.
- Existing jobs may not contain enough raw input/mapping data to recover true service-month production → **Mitigation:** fallback to current `production_total` and avoid fabricating values.
- PMS aggregation currently has DB access inside utility/service code, which violates the model boundary → **Mitigation:** add a focused `PmsJobModel` read method for approved aggregation rows instead of expanding inline Knex usage.

**Pushback:**
- Do not “fix” this by flipping chart math or manually sorting values. That would be fake correctness. The bug is semantic: one field is being used for two different meanings.
- Do not overwrite source-ranking production with service-month production. Source ranking is attribution; the trend chart is time-series operations. Mixing those again recreates the problem.

## Tasks

### T1: Define explicit PMS production fields
**Do:** Extend PMS rollup/types so months can carry both actual service-month production and attributed production. Procedure-log mapping should accumulate actual production by each row's date month while preserving existing patient/practice dedupe attribution. Template/pre-aggregated data can set actual production equal to existing production.
**Files:** `src/utils/pms/applyColumnMapping.ts`, `src/utils/pms/adapters/procedureLogAdapter.ts`, `src/utils/pms/adapters/templateAdapter.ts`
**Verify:** `npx tsc --noEmit`

### T2: Aggregate actual production safely
**Do:** Update PMS aggregation to return actual monthly production for chart months, preserve attributed source totals, and recover actual production from `raw_input_data` + mapping for existing procedure-log jobs when the new rollup field is absent. Move the needed approved-job read into `PmsJobModel`.
**Files:** `src/models/PmsJobModel.ts`, `src/models/PmsColumnMappingModel.ts`, `src/utils/pms/monthlyProduction.ts`, `src/utils/pms/pmsAggregator.ts`, `src/controllers/pms/pms-services/pms-data.service.ts`
**Verify:** `npx tsc --noEmit`

### T3: Update frontend data contract
**Do:** Add typed API fields for actual and attributed monthly production, then map the dashboard chart to the actual monthly value. Keep cards/source rankings on their current aggregate/source values unless explicitly tied to the trend chart.
**Files:** `frontend/src/api/pms.ts`, `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/PMS/dashboard/types.ts`, `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx`
**Verify:** `cd frontend && npx tsc -b`

### T4: Validate against the reported graph
**Do:** Confirm Jan/Feb/Mar production trend uses service-month production values, not first-referral-month attribution. Confirm referral line and source rankings still use existing attribution behavior.
**Files:** `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx`, `src/utils/pms/pmsAggregator.ts`
**Verify:** Manual: `/pmsstatitics` production trend should rise for March when raw March production is higher; source ranking should remain unchanged.

## Done
- [ ] `npx tsc --noEmit` passes for backend.
- [ ] `cd frontend && npx tsc -b` passes.
- [ ] `/pms/keyData` months expose actual production and attributed production distinctly.
- [ ] Production trend chart uses actual service-month production.
- [ ] Referral counts and source rankings remain attribution-based.
- [ ] PMS upload/manual-entry modal files are untouched.
