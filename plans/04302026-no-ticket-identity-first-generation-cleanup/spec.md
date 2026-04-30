# Identity-First Generation Cleanup

## Why
Single-page creation mostly reuses `project_identity`, but bulk creation and generation fallback paths can still re-scrape or depend on legacy `step_*` data. Identity should be the explicit contract for creating layouts and pages.

## What
After the identity model foundation exists, update website page/layout creation to use purpose-specific identity readiness checks, fix or remove the bulk create path, and stop silently falling back to legacy scrape data during generation.

## Context

**Relevant files:**
- `src/controllers/admin-websites/AdminWebsitesController.ts` — `startPipeline`, `createAllFromTemplate`, identity endpoints, and generation orchestration.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — currently prefers identity but falls back to legacy scrape columns.
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` — requires identity for layout generation.
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` — owns current bulk page row creation.
- `frontend/src/api/websites.ts` — has `createAllFromTemplate` API wrapper.
- `frontend/src/components/Admin/CreatePageModal.tsx` — current single-page creation path.

**Patterns to follow:**
- Identity access goes through `ProjectIdentityModel` from the foundation plan.
- Readiness checks come from the shared identity utility.
- Controllers orchestrate; model owns DB reads/writes.
- Behavior changes must be narrow and explicitly verified.

**Key decisions already made:**
- Identity is the contract for page and layout generation.
- Legacy `step_*` scrape fallback should be removed from active generation paths.
- Identity freshness warnings are out of scope.

## Constraints

**Must:**
- Execute only after `plans/04302026-no-ticket-project-identity-model-foundation/spec.md`.
- Make `startPipeline` rely on identity readiness rather than `step_gbp_scrape`.
- Decide whether `createAllFromTemplate` is dead or externally required before changing route compatibility.
- If kept, make `createAllFromTemplate` reuse identity and enqueue page generation without redundant scrape.
- Remove silent legacy identity shim from generation.

**Must not:**
- Drop legacy database columns in this plan.
- Change template markup contracts.
- Change frontend Create Page UX unless required for API compatibility.
- Add identity freshness warnings.

**Out of scope:**
- Physical DB cleanup for `step_*` columns.
- Broader controller decomposition.
- Persisting transient slot values for retries.

## Risk

**Level:** 3

**Risks identified:**
- External automation may still call `create-all-from-template` -> **Mitigation:** search codebase first, then check runtime/API usage if available before deleting; otherwise preserve route and fix behavior.
- Removing legacy fallback can block older projects without identity -> **Mitigation:** return explicit `IDENTITY_NOT_READY` and require warmup before generation.
- Bulk page creation may need per-page slot values instead of one shared `dynamicSlotValues` object -> **Mitigation:** keep current payload shape unless usage proves otherwise; do not invent a new bulk UX here.

**Pushback (if any):**
- This doesn't belong as a casual cleanup inside page generation. It changes the source-of-truth contract. If there are live projects created before identity backfill that still depend on `step_*`, they need warmup or a separate migration path rather than hidden fallback.

## Tasks

### T1: Bulk Endpoint Decision
**Do:** Verify whether `/api/admin/websites/:id/create-all-from-template` is used outside the visible frontend. If unused, remove route/API/controller/service. If used, keep it and make it identity-first.
**Files:** `src/routes/admin/websites.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.project-manager.ts`, `frontend/src/api/websites.ts`
**Verify:** `rg "createAllFromTemplate|create-all-from-template" frontend/src src`

### T2: Identity-First Start Pipeline
**Do:** Update single-page creation pipeline to use page-generation readiness from the shared identity utility. Return a clear blocked response when identity is not ready instead of requiring/scraping with `placeId`.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`
**Verify:** `npm run build`

### T3: Remove Legacy Generation Fallback
**Do:** Remove the silent legacy identity shim from page generation. Generation should read identity through the model and fail explicitly if it is not usable.
**Files:** `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
**Verify:** `npm run build`

### T4: Layout Generation Readiness Alignment
**Do:** Replace local identity parsing/readiness in layout generation with the shared utility/model and return the same blocked state semantics as page generation.
**Files:** `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts`
**Verify:** `npm run build`

## Done
- [x] Foundation plan is implemented first
- [x] `npm run build` passes
- [x] `cd frontend && npm run build` passes
- [x] `cd frontend && npx eslint src/api/websites.ts` passes
- [x] Single-page creation does not enqueue project scrape when identity is ready
- [x] Bulk creation is retained and reuses identity without redundant scrape
- [x] Page generation no longer uses legacy `step_*` fallback
- [x] Projects without usable identity fail clearly with `IDENTITY_NOT_READY`
