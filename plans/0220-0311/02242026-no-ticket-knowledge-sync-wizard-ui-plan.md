# Knowledge Sync Wizard UI Overhaul

## Problem Statement

The Knowledge Sync tab currently renders 3 sections (Discovery, Sync Runs, Proposals) as a flat layout. The user wants a **wizard-style batch-centric flow** with 3 horizontal slides and animated step progress adapted from the `ClientProgressTimeline` pattern. Additionally, sync runs are not scoped to batches (missing `batch_id` FK), so runs and proposals float disconnected from the batch that produced them.

## Context Summary

- Backend has 25 API endpoints under `/api/admin/minds` (super-admin only)
- `mind_sync_runs` table has no `batch_id` column — runs are mind-scoped, not batch-scoped
- Frontend uses React 19 + TypeScript + Tailwind v4 + Framer Motion + Lucide icons
- `ClientProgressTimeline.tsx` provides the horizontal step animation pattern (SVG rotating borders, gradient progress line, spring physics)
- `OnboardingContainer.tsx` provides the slide transition pattern (`AnimatePresence mode="wait"`)

## Existing Patterns to Follow

- `ClientProgressTimeline` — horizontal step nodes with animated SVG borders for current step
- `OnboardingContainer` — `AnimatePresence` slide transitions (adapt y-axis to x-axis)
- `ActionButton`, `StatusPill`, `EmptyState` from `DesignSystem.tsx`
- `apiGet/apiPost/apiPatch/apiDelete` from `api/index.ts`
- Models: extend `BaseModel`, static methods, schema-qualified table names
- Controllers: named exported async functions
- Response envelope: `{ success: true, data: ... }` / `{ error: "message" }`

## Proposed Approach

### Phase 1 — Backend: Migration + Model

New migration adds `batch_id UUID REFERENCES minds.mind_discovery_batches(id) ON DELETE SET NULL` to `mind_sync_runs`. Update `MindSyncRunModel` to accept/store batch_id and add `listByBatch` + `findActiveByBatch` methods.

### Phase 2 — Backend: Service + Controller + Route

- `createSyncRun` accepts optional `batchId`
- `startScrapeCompare`/`startCompile` auto-resolve open batch and pass `batch.id`
- New route: `GET /:mindId/batches/:batchId/sync-runs`
- Extend `getMindStatus` to return `openBatchId`, `activeSyncRunId`, `latestScrapeRunId`

### Phase 3 — Frontend: API Module Updates

Add `batch_id` to `SyncRun` type, update `MindStatus` interface, add `listSyncRunsByBatch` function.

### Phase 4 — Frontend: SyncStepTimeline Component

Adapted from `ClientProgressTimeline`. Horizontal step nodes with human-friendly labels, animated gradient progress line, SVG rotating border on current step.

### Phase 5 — Frontend: Wizard Container + 3 Slides

**Wizard Container** — derives correct slide from server state on mount, horizontal slide transitions via `AnimatePresence`.

**Slide 1 (Discovery & Triage)** — post list with approve/ignore, "Run Discovery" button, "Continue to Sync" when all triaged.

**Slide 2 (Sync Run Progress)** — `SyncStepTimeline` with live polling (3s), auto-advance on completion.

**Slide 3 (Proposals Review)** — approve/reject proposals, bulk approve, "Compile & Publish" with inline progress.

### Phase 6 — Frontend: Wire Up

Replace `MindKnowledgeSyncTab` import in `MindDetail.tsx` with `KnowledgeSyncWizard`.

## Risk Analysis

| Risk | Level | Mitigation |
|---|---|---|
| Existing runs have no batch_id (nullable column) | L1 | Wizard only shows current batch's runs; old orphaned runs not displayed |
| Race condition on slide transition | L2 | API call must succeed before animation starts; error stays on current slide |
| Partial unique index on active runs unchanged | L1 | Constraint still works — one active run per mind regardless of batch |

## Definition of Done

1. Migration adds `batch_id` to `mind_sync_runs` without error
2. Starting runs stores `batch_id` automatically
3. `GET /:mindId/status` returns `openBatchId`, `activeSyncRunId`, `latestScrapeRunId`
4. Wizard opens on correct slide based on server state
5. Horizontal slide transitions animate correctly
6. `SyncStepTimeline` shows human-readable step labels with rotating border animation
7. Full flow: Discovery → Triage → Scrape & Compare → Proposals → Compile & Publish
8. Page reload resumes on correct slide
9. TypeScript compiles, Vite builds
