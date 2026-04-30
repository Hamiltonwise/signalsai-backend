# Project Identity Model Foundation

## Why
Website identity is already the source of truth for page/layout generation, but parsing and persistence are scattered across controllers and services. This creates drift, duplicated JSON handling, and inconsistent readiness checks.

## What
Create a small `ProjectIdentityModel` plus pure identity utility helpers, then migrate low-risk identity reads/writes to them without changing generation behavior.

## Context

**Relevant files:**
- `src/models/website-builder/ProjectModel.ts` — existing project table model and pattern reference.
- `src/controllers/admin-websites/AdminWebsitesController.ts` — currently owns many direct `project_identity` reads/writes.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — writes identity and warmup status.
- `src/controllers/admin-websites/feature-services/service.slot-prefill.ts` — deterministic identity reads for slot defaults.
- `src/controllers/admin-websites/feature-services/service.slot-generator.ts` — LLM slot generation from identity.

**Patterns to follow:**
- Models own Knex access; services call models.
- Keep utility helpers pure and DB-free.
- Preserve existing API response behavior unless explicitly changed in the second plan.

**Key decisions already made:**
- `project_identity` remains JSONB on `website_builder.projects`; no schema migration.
- This plan does not remove legacy `step_*` fallback.
- This plan does not add identity freshness warnings.

## Constraints

**Must:**
- Add `src/models/website-builder/ProjectIdentityModel.ts`.
- Add one shared identity utility under `src/controllers/admin-websites/feature-utils/`.
- Centralize parsing, serialization, warmup status access, and purpose-specific readiness checks.
- Mirror brand colors to legacy project columns when full identity is replaced.

**Must not:**
- Change the generated page output.
- Remove legacy scrape fallback.
- Refactor unrelated website controller endpoints.
- Add dependencies.

**Out of scope:**
- Fixing `createAllFromTemplate`.
- Removing `step_gbp_scrape`, `step_website_scrape`, or `step_image_analysis`.
- UI freshness warnings.

## Risk

**Level:** 2

**Risks identified:**
- Identity writes may stop mirroring brand color columns correctly -> **Mitigation:** model method owns full identity update plus mirror update.
- Helpers may become too generic and vague -> **Mitigation:** use purpose-specific readiness helpers rather than a single overloaded `isReady`.
- Partial migration can leave two patterns in place -> **Mitigation:** migrate identity endpoints, warmup status, slot prefill, and slot generator in this pass; leave higher-risk generation paths for the next plan.

**Pushback (if any):**
- Do not turn this into a broad website-builder model cleanup. This belongs as a focused identity boundary first. The rest of the website-builder direct Knex drift is real, but mixing it here will muddy the intent.

## Tasks

### T1: Identity Utilities
**Do:** Add pure helpers for parsing `project_identity`, default shell creation, warmup status extraction, full identity validation, and purpose-specific readiness checks.
**Files:** `src/controllers/admin-websites/feature-utils/util.project-identity.ts`
**Verify:** `npm run build`

### T2: Project Identity Model
**Do:** Add a model that owns `project_identity` reads/writes, warmup status updates, brand mirror updates, and transactional patch updates.
**Files:** `src/models/website-builder/ProjectIdentityModel.ts`
**Verify:** `npm run build`

### T3: Low-Risk Consumer Migration
**Do:** Replace local parse/update helpers in identity endpoints, identity warmup status updates, slot prefill, and slot generator with the new utility/model.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`, `src/controllers/admin-websites/feature-services/service.slot-prefill.ts`, `src/controllers/admin-websites/feature-services/service.slot-generator.ts`
**Verify:** `npm run build`

## Done
- [x] `npm run build` passes
- [x] Identity warmup still writes `project_identity.meta.warmup_status`
- [x] Identity JSON save still mirrors primary/accent colors to project columns
- [x] Create Page slot prefill still works from identity
- [x] No generation behavior changed by the foundation pass
