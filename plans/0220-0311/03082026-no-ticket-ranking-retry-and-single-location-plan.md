# Ranking Retry & Single Location Run

## Problem Statement

The admin practice ranking page lacks three operational controls:
1. No way to retry a single failed/completed location analysis
2. No way to retry an entire batch
3. No way to run ranking for just one location — selecting an org forces all its locations

## Context Summary

### Current Admin Trigger Flow
- `PracticeRanking.tsx` renders account dropdown → auto-populates ALL GBP locations → trigger sends all to `POST /trigger`
- `POST /trigger` accepts `{ googleAccountId, locations: [...] }` — already supports a 1-item array
- No retry endpoints exist on `practiceRanking.ts` routes

### Ranking Record Data (practice_rankings table)
Each record stores everything needed to re-run:
- `organization_id`, `location_id`
- `gbp_account_id`, `gbp_location_id`, `gbp_location_name`
- `batch_id`, `specialty`, `location` (market)
- `status` (pending/processing/completed/failed)

### Existing UI Components
- **Batch card** (`PracticeRanking.tsx:1330+`): Header row with status badge + delete button. Expandable to show individual locations.
- **JobRow** (`PracticeRanking.tsx:1496+`): Individual location row with status badge + delete button. Has `onDelete` callback pattern to follow for `onRetry`.
- Both already receive `getStatusBadge` and action button patterns.

### Pipeline
`processLocationRanking()` from `service.ranking-pipeline.ts` is the single-location processor. Takes ranking ID, connection ID, GBP details, specialty, market, domain, batch ID. Handles all 8 steps internally.

## Existing Patterns to Follow

1. **Delete endpoints** — `DELETE /:id` and `DELETE /batch/:batchId` already exist with the same ID-based lookup pattern retry will use
2. **Trigger async pattern** — `setImmediate()` + immediate response, used by `triggerBatchAnalysis` and the refactored `ranking-run`
3. **JobRow action buttons** — `onDelete` callback with `deletingJob` loading state. Retry follows the same pattern with `retryingJob` state.
4. **Status polling** — Frontend already polls `pending`/`processing` jobs. After retry resets status to `pending`, existing polling picks it up automatically.

## Proposed Approach

### Feature 1: Retry Single Location (`POST /retry/:id`)

**Backend** (`PracticeRankingController.ts` + `practiceRanking.ts`):

New endpoint: `POST /api/admin/practice-ranking/retry/:id`

Logic:
1. Look up ranking record by ID
2. Reject if status is `pending` or `processing` (guard against double-run)
3. Reset record: `status = "pending"`, clear `error_message`, clear `status_detail`, keep same `batch_id`
4. Return `{ success: true, rankingId }` immediately
5. `setImmediate()`: run identification + `processLocationRanking()` using data from the existing record
6. Get `google_connection_id` via `GooglePropertyModel.findByExternalId(gbp_location_id)` to resolve the OAuth connection

**Frontend** (`PracticeRanking.tsx`):

- Add `onRetry` callback prop to `JobRow` component
- Add retry button (RefreshCw icon) next to delete button, visible when `status === "failed" || status === "completed"`
- Add `retryingJob` state (number | null) for loading indicator
- `retryJob()` function: POST to `/retry/:id`, on success start polling that job, refresh jobs list
- After retry, job resets to `pending` → existing polling picks it up

### Feature 2: Retry Entire Batch (`POST /retry-batch/:batchId`)

**Backend** (`PracticeRankingController.ts` + `practiceRanking.ts`):

New endpoint: `POST /api/admin/practice-ranking/retry-batch/:batchId`

Logic:
1. Look up all rankings in the batch
2. Filter to only `failed` or `completed` records — skip any still `pending`/`processing` (soft retry: don't block on stragglers)
3. If no retryable records found, return 400
4. Reset retryable records: `status = "pending"`, clear `error_message`, clear `status_detail`
5. Return `{ success: true, batchId, retryCount, skippedCount }` immediately
6. `setImmediate()`: loop through retryable rankings sequentially, run identification + `processLocationRanking()` for each with retry logic (reuse the same pattern from `ranking-run` background loop)

**Frontend** (`PracticeRanking.tsx`):

- Add retry button on batch card header (next to delete button), visible when batch status is `failed` or `completed`
- Add `retryingBatch` state (string | null) for loading indicator
- `retryBatch()` function: POST to `/retry-batch/:batchId`, on success add batch to `pollingBatches`, refresh jobs list

### Feature 3: Single Location Selection in Trigger UI

**Backend**: No changes. `POST /trigger` already accepts a 1-item `locations` array.

**Frontend** (`PracticeRanking.tsx`):

- Replace the current "auto-select all locations" behavior with a checkbox list
- When account is selected, show all GBP locations with checkboxes (all checked by default for backward compat)
- User can uncheck locations they don't want to run
- `locationForms` state derived from checked locations only
- Trigger button label updates: `Run Analysis (2 of 5 locations)` when subset selected
- "Select All / Deselect All" toggle for convenience

Changes to `useEffect` at line 600-612:
- Instead of directly setting `locationForms`, set a `selectedLocationIds` Set (all selected by default)
- `locationForms` computed from `selectedLocationIds`

New state:
- `selectedLocationIds: Set<string>` — tracks which GBP location IDs are checked

## Risk Analysis

### Level 2 — Concern: Retry race condition
If someone retries a job that's still processing (e.g., status update lagged), two processes could update the same record concurrently.

**Mitigation:** Backend rejects retry if status is `pending` or `processing`. Frontend hides retry button for those statuses.

### Level 1 — No new dependencies
All three features use existing infrastructure: `processLocationRanking`, `GooglePropertyModel`, `setImmediate` async pattern, existing polling.

### Level 1 — OAuth lookup via google_properties
Retry endpoints resolve the OAuth connection via `GooglePropertyModel.findByExternalId(gbp_location_id)` → `google_connection_id`. This is one extra query per retry. Storing `google_connection_id` directly on `practice_rankings` would eliminate it but requires a migration — not worth it yet. Revisit if retry becomes a hot path.

### Note — Hardcoded fallback specialty
The `"orthodontist"` fallback when identification fails is hardcoded in multiple files. Not blocking for this work. Separate cleanup ticket recommended.

## Definition of Done

### Feature 1 — Retry Single Location
- [x] `POST /retry/:id` endpoint exists and validates status
- [x] Resets record and re-runs pipeline in background
- [x] Gets OAuth connection from `google_properties` table (not legacy JSONB)
- [x] JobRow has retry button visible on `failed`/`completed` status
- [x] Retry triggers polling and UI updates automatically

### Feature 2 — Retry Entire Batch
- [x] `POST /retry-batch/:batchId` endpoint exists
- [x] Soft retry: only re-runs `failed`/`completed` locations, skips `pending`/`processing`
- [x] Resets retryable records and re-runs sequentially in background
- [x] Batch card has retry button visible when batch has failed/completed locations
- [x] Batch polling resumes after retry

### Feature 3 — Single Location Selection
- [x] Location checkboxes appear when account is selected
- [x] All checked by default (backward compat)
- [x] Trigger button reflects selected count
- [x] Select All / Deselect All toggle
- [x] Trigger sends only checked locations to `/trigger`

## Execution Log

**Date:** 2026-03-08

**Files modified:**

Backend:
- `signalsai-backend/src/routes/practiceRanking.ts` — added 2 retry routes
- `signalsai-backend/src/controllers/practice-ranking/PracticeRankingController.ts` — added `retryRanking` + `retryBatch` + imports

Frontend:
- `signalsai/src/pages/admin/PracticeRanking.tsx` — retry buttons on JobRow + batch card, location checkboxes with select all/deselect all, locationForms changed from state to computed

**TypeScript:** Both frontend and backend compile clean.
