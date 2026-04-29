# PMS Statistics Redesign Without Upload Modal

## Why
The `/pmsStatistics` page needs to adopt the new PMS redesign reference so referral intelligence reads as a polished dashboard instead of a dense operational screen. The upload/manual-entry flow is not part of this redesign and must remain untouched.

## What
Redesign only the client-facing PMS Statistics dashboard surface using the reference at `/Users/rustinedave/Desktop/pms redesign`. Preserve existing data loading, approval, processing, wizard gating, and upload/manual-entry behavior without redesigning or modifying the PMS upload/manual entry modals.

## Context

**Relevant files:**
- `frontend/src/pages/Dashboard.tsx` — maps `/pmsStatistics` to `PMSVisualPillars`
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — current page container, data loading, banners, dashboard sections, and modal wiring
- `frontend/src/components/PMS/ReferralMatrices.tsx` — current referral intelligence matrix and processing states
- `frontend/src/api/pms.ts` — typed `fetchPmsKeyData` months/sources/totals contract
- `frontend/src/index.css` — existing Alloro tokens, PM light/dark variables, font families, and shared utility classes
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — explicitly out of scope; do not modify
- `frontend/src/components/PMS/PMSUploadWizardModal.tsx` — explicitly out of scope; do not modify
- `frontend/src/components/PMS/TemplateUploadModal.tsx` — explicitly out of scope; do not modify
- `frontend/src/components/PMS/DirectUploadModal.tsx` — explicitly out of scope; do not modify

**Patterns to follow:**
- `frontend/src/components/dashboard/focus/Sparkline.tsx` — small SVG chart component pattern
- `frontend/src/components/dashboard/focus/PMSCard.tsx` — PMS summary visual language already used in the Focus dashboard
- `frontend/src/components/PMS/ReferralMatrices.tsx` — preserve loading, pending, empty, and client confirmation states

**Key decisions already made:**
- This is a frontend-only redesign pass unless implementation discovers a hard data contract blocker.
- The route remains `/pmsStatistics`; do not rename routes or navigation labels.
- The dashboard should use real `keyData` and referral engine data. Do not invent trend, revenue, or duplicate-source metrics.
- Upload/manual entry modals are excluded. Existing CTA wiring may remain, but modal UI and flow files must not be touched.

## Constraints

**Must:**
- Keep PMS upload/manual-entry modals and their behavior unchanged.
- Keep approval, processing, setup-required, wizard demo, and no-data states functional.
- Split new dashboard display code out of `PMSVisualPillars.tsx` instead of making the monolith larger.
- Use existing Alloro/PM tokens and Tailwind classes; no prototype inline styles or hardcoded color hexes in component code.
- Keep components under 200 lines where practical by extracting cards/charts into focused files.

**Must not:**
- Do not modify `PMSManualEntryModal.tsx`, `PMSUploadWizardModal.tsx`, `PMSUploadModal.tsx`, `TemplateUploadModal.tsx`, or `DirectUploadModal.tsx`.
- Do not redesign the upload modal, manual entry modal, or CSV/template/direct upload flows.
- Do not add dependencies.
- Do not change database schema or create migrations.
- Do not refactor unrelated dashboard tabs.

**Out of scope:**
- Backend schema changes.
- New PMS ingestion behavior.
- Admin PMS pages.
- Exact parity for prototype-only metrics that are not exposed by current APIs.

## Risk

**Level:** 2

**Risks identified:**
- `PMSVisualPillars.tsx` is already oversized and mixes data orchestration with UI rendering → **Mitigation:** extract display-only dashboard components under the PMS area and keep orchestration in the existing container.
- The prototype uses local fake data, inline styles, and fields not fully exposed by `fetchPmsKeyData` → **Mitigation:** translate visuals to typed React/Tailwind using real available data; omit or gracefully degrade missing trend/dedup indicators rather than fabricating them.
- Upload/manual-entry code is wired into the same page component → **Mitigation:** preserve existing modal state and callbacks but do not edit modal files or redesign the ingestion flow.

**Pushback:**
- This does not belong as another large block inside `PMSVisualPillars.tsx`. That file is already architectural drift. The redesign should extract a dashboard surface and leave the container responsible for data/state only.
- The prototype’s growth/upside language can overpromise. Any displayed opportunity copy must come from existing referral engine output or conservative labels; no made-up revenue projections.

## Tasks

### T1: Dashboard Surface Extraction
**Do:** Create focused PMS dashboard display components and move only presentation logic out of `PMSVisualPillars.tsx`; keep data fetching, modal wiring, and state orchestration in the container.  
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/PMS/dashboard/*`  
**Verify:** `cd frontend && npx tsc -b`

### T2: Reference Layout Implementation
**Do:** Implement the redesigned dashboard sections: page title/sync status, vitals row, attention cards, executive summary, production chart, referral mix, top sources, referral velocity, growth opportunities, and unchanged CTA placement if retained.  
**Files:** `frontend/src/components/PMS/dashboard/*`, `frontend/src/index.css` only if a shared token/animation class is necessary  
**Verify:** Manual: compare `/pmsStatistics` against `/Users/rustinedave/Desktop/pms redesign/PMS Statistics.html`

### T3: State Preservation
**Do:** Ensure setup-required, loading, error, no-data, pending automation, client approval, wizard demo, and existing upload CTA paths still render correctly without changing modal internals.  
**Files:** `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/PMS/dashboard/*`  
**Verify:** Manual: exercise each visible state or inspect conditional branches for unchanged behavior

### T4: Frontend Verification
**Do:** Run type-check, lint, and visual responsive review for desktop/tablet/mobile.  
**Files:** `frontend/src/components/PMS/dashboard/*`, `frontend/src/components/PMS/PMSVisualPillars.tsx`  
**Verify:** `cd frontend && npx tsc -b`, `cd frontend && npm run lint`

## Done
- [ ] `/pmsStatistics` renders the redesigned PMS dashboard surface.
- [ ] The combined doctor/marketing source intelligence matrix section is not shown.
- [ ] No PMS upload/manual-entry modal files are modified.
- [ ] Existing upload/manual-entry behavior still opens the current flow if its CTA remains visible.
- [ ] Loading, empty, error, processing, approval, setup-required, and wizard states still render.
- [ ] `cd frontend && npx tsc -b` passes or unrelated pre-existing errors are documented.
- [ ] `cd frontend && npm run lint` passes or unrelated pre-existing errors are documented.

## Revision Log

### Rev 1 — April 29, 2026
**Change:** Removed the combined doctor/marketing source intelligence matrix from the redesigned PMS Statistics surface.
**Reason:** User requested removal of the section headed “See What Referrals Are Giving You the Most Value / Combined Doctor & Marketing Sources.”
**Updated Done criteria:** Added explicit verification that the combined source intelligence matrix is not shown.

### Rev 2 — April 29, 2026
**Change:** Removed the hero sync badge, updated date, and bottom metadata strip from the main PMS dashboard card.
**Reason:** User requested that the main card only retain the Update data CTA in that action area.
**Updated Done criteria:** No change.
