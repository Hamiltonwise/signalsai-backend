# Fix PMSVisualPillars TypeScript Errors

## Problem Statement
Mock data in PMSVisualPillars.tsx uses `pct_scheduled`, `pct_examined`, `pct_started` fields not defined on `DoctorReferral` / `NonDoctorReferral` interfaces in ReferralMatrices.tsx.

## Context Summary
- Both interfaces live in `ReferralMatrices.tsx` (canonical) and `ReferralEngineDashboard.tsx` (duplicate).
- The fields represent referral funnel conversion percentages — legitimate data the mock objects model.
- No rendering code references these fields yet, but they belong on the interface for type correctness.

## Existing Patterns to Follow
- All fields on these interfaces are optional (`?`).
- Number fields use `number | null` for nullable server values, plain `number` for percentages.

## Proposed Approach
Add `pct_scheduled?: number`, `pct_examined?: number`, `pct_started?: number` to both `DoctorReferral` and `NonDoctorReferral` in `ReferralMatrices.tsx` (the canonical location used by PMSVisualPillars).

## Risk Analysis
- Level 1 — Adding optional fields to interfaces. Zero breaking change.

## Definition of Done
- `tsc --noEmit` passes with 0 errors.
