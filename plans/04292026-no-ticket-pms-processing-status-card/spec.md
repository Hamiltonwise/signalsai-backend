# PMS Processing Status Card

## Why
The redesigned `/pmsStatistics` page still needs to communicate when PMS/referral intelligence is processing in the background. The previous matrix section provided that state, but the matrix itself is now removed from the dashboard surface.

## What
Add a non-blocking processing status card to the PMS dashboard that uses the existing Alloro Lottie processing treatment while keeping all other dashboard components visible with latest available values or explicit empty-state messaging.

## Context

**Relevant files:**
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — owns PMS job, approval, processing, polling, and dashboard props.
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` — renders the redesigned dashboard surface and should receive display-only processing state.
- `frontend/src/components/PMS/ReferralMatrices.tsx` — contains the existing Lottie/cogitating processing UI pattern to reuse or extract from.
- `frontend/src/assets/cogitating-spinner.json` — existing Alloro Lottie asset.
- `frontend/src/components/PMS/dashboard/PmsVitalsRow.tsx` — vitals should show latest values when present, not be hidden by background processing.
- `frontend/src/components/PMS/dashboard/PmsExecutiveSummary.tsx` — null-capable messaging should explain that referral intelligence appears after processing.
- `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx` — already has an empty PMS data message.
- `frontend/src/components/PMS/dashboard/PmsReferralMixCard.tsx` — needs clearer empty-state messaging instead of only zero-value percentages.
- `frontend/src/components/PMS/dashboard/PmsTopSourcesCard.tsx` — already has an upload/empty message.
- `frontend/src/components/PMS/dashboard/PmsVelocityCard.tsx` — already has an upload/empty message.
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — explicitly out of scope; do not modify.
- `frontend/src/components/PMS/PMSUploadWizardModal.tsx` — explicitly out of scope; do not modify.

**Patterns to follow:**
- `frontend/src/components/PMS/ReferralMatrices.tsx` — reuse the Alloro Lottie processing presentation and cogitating copy.
- `frontend/src/components/PMS/dashboard/*` — keep dashboard display components focused, typed, and under 200 lines.
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — keep job/process state orchestration in the container and pass a boolean/summary to the dashboard.

**Key decisions already made:**
- Do not bring back the combined doctor/marketing referral matrix.
- The processing card is additive and non-blocking; it must not replace the entire dashboard surface.
- Cards should prefer latest known PMS data when available.
- Empty states should be honest and null-capable; do not fabricate metrics.
- No new dependency is needed because `lottie-react` and the Lottie JSON asset already exist.

## Constraints

**Must:**
- Show a processing/status card when background PMS/referral processing is active.
- Use the existing Alloro Lottie asset and visual treatment.
- Keep hero, vitals, attention cards, charts, source cards, growth opportunities, and ingestion CTA visible during background processing.
- Pass processing state from `PMSVisualPillars` into dashboard display components instead of duplicating job logic inside cards.
- Preserve client approval banner and setup/error states.
- Keep upload/manual-entry modal files untouched.

**Must not:**
- Do not re-add or render the removed combined doctor/marketing matrix.
- Do not hide all dashboard components behind a loading screen during background processing.
- Do not show fabricated zero values as if they were real when data is absent.
- Do not add dependencies.
- Do not modify backend/API/schema code.
- Do not redesign upload/manual-entry flows or modal internals.

**Out of scope:**
- New backend process states.
- New polling endpoints.
- Referral matrix redesign.
- Changelog/finalization.

## Risk

**Level:** 2

**Risks identified:**
- The current matrix processing UI lives inside `ReferralMatrices.tsx`, which is now intentionally removed from the surface → **Mitigation:** extract or recreate only the small Lottie processing presentation in a dashboard component; do not reintroduce matrix rendering.
- Processing state is spread across `localProcessing`, `latestJobStatus`, `referralPending`, `automationStatus`, and approval state → **Mitigation:** compute one display boolean in `PMSVisualPillars` and pass it down as a prop.
- Showing stale values while processing could confuse users → **Mitigation:** label the card as background processing and keep latest-value cards unchanged; empty cards should clearly say data will appear after processing.
- Existing dashboard cards vary in empty-state quality → **Mitigation:** touch only cards that currently imply real zero values when no month/source data exists.

**Pushback:**
- Do not bolt this back into `ReferralMatrices`. That would undo the previous removal and create a zombie section. The loading/status treatment belongs as its own dashboard card.
- Do not make each card independently infer PMS job state. That would scatter business state through presentation components. One computed prop from the container is enough.

## Tasks

### T1: Processing State Contract
**Do:** Compute a dashboard-safe processing boolean/message in `PMSVisualPillars` and extend the dashboard prop type to receive it.  
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/PMS/dashboard/types.ts`, `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx`  
**Verify:** `cd frontend && npx tsc -b`

### T2: Lottie Status Card
**Do:** Add a focused `PmsProcessingStatusCard` that uses `lottie-react` with `cogitating-spinner.json`, Alloro styling, and concise background-processing copy. Render it below the hero and above PMS Vitals only when processing is active.  
**Files:** `frontend/src/components/PMS/dashboard/PmsProcessingStatusCard.tsx`, `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx`  
**Verify:** Manual: background processing state shows the card while other dashboard components remain visible.

### T3: Null-Capable Card Messaging
**Do:** Adjust cards that currently present absent data as real zeros so empty states say the data will appear after PMS processing finishes. Preserve latest value display when data exists.  
**Files:** `frontend/src/components/PMS/dashboard/PmsVitalsRow.tsx`, `frontend/src/components/PMS/dashboard/PmsReferralMixCard.tsx`, `frontend/src/components/PMS/dashboard/PmsExecutiveSummary.tsx`, `frontend/src/components/PMS/dashboard/PmsAttentionCards.tsx`, `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx`, `frontend/src/components/PMS/dashboard/PmsTopSourcesCard.tsx`, `frontend/src/components/PMS/dashboard/PmsVelocityCard.tsx`  
**Verify:** Manual: no-data and processing states show honest messaging without hiding the dashboard.

### T4: Frontend Verification
**Do:** Run type-check and lint scope checks for changed PMS dashboard files; run full lint and document unrelated pre-existing failures if still present.  
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/PMS/dashboard/*`  
**Verify:** `cd frontend && npx tsc -b`, `cd frontend && npx eslint src/components/PMS/PMSVisualPillars.tsx src/components/PMS/dashboard/*.tsx src/components/PMS/dashboard/*.ts`, `cd frontend && npm run lint`

## Done
- [ ] Processing card appears during background PMS/referral processing.
- [ ] Dashboard cards remain visible during background processing.
- [ ] Latest available values still render when data exists.
- [ ] Empty/null states explain that PMS data or referral intelligence will appear after processing.
- [ ] The combined doctor/marketing matrix is not rendered.
- [ ] No PMS upload/manual-entry modal files are modified.
- [ ] `cd frontend && npx tsc -b` passes or unrelated pre-existing errors are documented.
- [ ] Changed-file ESLint passes or unrelated pre-existing warnings are documented.
- [ ] Full `npm run lint` passes or unrelated pre-existing errors are documented.

## Revision Log

### Rev 1 — April 30, 2026
**Change:** Added `PmsAttentionCards.tsx` to the null-capable messaging scope.
**Reason:** The referral balance attention card can imply a fabricated `0% doctor · 100% self` split when no monthly data exists.
**Updated Done criteria:** No change.

### Rev 2 — April 30, 2026
**Change:** Added chart/source/velocity empty states to the null-capable messaging scope.
**Reason:** During active background processing, upload-focused empty copy is misleading when data has already been submitted and is still processing.
**Updated Done criteria:** No change.
