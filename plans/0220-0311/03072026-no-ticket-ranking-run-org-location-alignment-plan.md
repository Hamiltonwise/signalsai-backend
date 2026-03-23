# Ranking Run Org-Location Alignment

## Problem Statement

The `POST /api/agents/ranking-run` endpoint processes practice rankings for all active organizations automatically, but it sources GBP location data from the deprecated `google_connections.google_property_ids` JSONB column instead of the canonical `locations` + `google_properties` tables.

Additionally, the endpoint runs synchronously — blocking the HTTP response until all orgs are processed (potentially 30+ minutes). This prevents the existing admin practice ranking page from picking up and visualizing batches in real-time as they're created.

## Context Summary

### Current State (`ranking-run` at `AgentsController.ts:1207`)
- Accepts optional `{ googleAccountId }` body; without it, processes all onboarded orgs
- Fetches orgs via `google_connections` join `organizations` where `onboarding_completed = true`
- Reads GBP locations from `google_connections.google_property_ids` (deprecated JSONB)
- Uses `resolveLocationId()` as a band-aid to map back to the `locations` table
- Runs synchronously — response blocks until all orgs complete
- Processes orgs sequentially, locations within each org sequentially (correct behavior, keep this)

### Target State (follow `proofline-run` pattern at `AgentsController.ts:93`)
- `proofline-run` uses `LocationModel.findByOrganizationId()` to get locations from the canonical table
- For each location, it gets GBP properties via the `google_properties` table
- It still queries `google_connections` for the OAuth2 connection (correct — that's where tokens live)

### Admin Page (`PracticeRanking.tsx`)
- Fetches all rankings via `GET /api/admin/practice-ranking/list` (queries `practice_rankings` table)
- Auto-polls any `pending`/`processing` batches via `GET /batch/:batchId/status`
- Groups by month, shows org name + location subtext
- **Will automatically pick up batches created by `ranking-run`** — no frontend changes needed, as long as `practice_rankings` records are created with correct `organization_id`, `location_id`, and `batch_id`

### Key Models
- `LocationModel.findByOrganizationId(orgId)` — returns all locations for an org (primary first)
- `GooglePropertyModel.findByLocationId(locationId)` — returns GBP properties linked to a location
- `GooglePropertyModel` fields: `external_id` (GBP location ID), `account_id` (GBP account ID), `display_name`, `google_connection_id`
- `identifyLocationMeta(gbpData, domain)` — calls n8n Identifier Agent webhook for specialty/market auto-detection

## Existing Patterns to Follow

1. **`proofline-run` pattern** for data access: `LocationModel.findByOrganizationId()` + `GooglePropertyModel.findByLocationId()`
2. **`triggerBatchAnalysis` pattern** for async: `setImmediate()` to kick off background work, return immediately with batch metadata
3. **`processBatch` / `processLocationRanking`** for the actual ranking pipeline — already works correctly, just needs correct inputs
4. **Batch tracker** (`service.batch-status-tracker`) for in-memory progress tracking during processing

## Proposed Approach

### Step 1: Refactor data access in `runRankingAgent`

Replace the legacy JSONB-based location discovery:

```
// OLD: reads from deprecated JSONB
const propertyIds = JSON.parse(account.google_property_ids);
const gbpLocations = propertyIds?.gbp || [];
```

With canonical model queries (following proofline-run):

```
// NEW: reads from locations + google_properties tables
const locations = await LocationModel.findByOrganizationId(orgId);
for (const location of locations) {
  const gbpProperties = await GooglePropertyModel.findByLocationId(location.id);
  // gbpProperties[].external_id = GBP location ID
  // gbpProperties[].account_id = GBP account ID
  // gbpProperties[].display_name = GBP display name
  // gbpProperties[].google_connection_id = which OAuth connection to use
}
```

### Step 2: Make it async

Change `runRankingAgent` to:
1. Collect all orgs + their locations/properties upfront (fast DB queries)
2. Create all `practice_rankings` records upfront with `status: "pending"` (one batch per org)
3. Return immediately with `{ success, batches: [{ orgName, batchId, locationCount, rankingIds }] }`
4. Use `setImmediate()` to kick off sequential background processing

The background processor:
- Iterates orgs sequentially
- Within each org, iterates locations sequentially
- Uses existing `processLocationRanking()` with retry logic
- Updates `practice_rankings` status as it goes (existing pipeline does this)

### Step 3: Adapt identification phase

Current `ranking-run` does upfront `identifyLocationMeta()` per location before creating records. Keep this — but source the GBP profile data using the correct OAuth connection from `google_properties.google_connection_id` rather than assuming a single connection per org.

Note: `processLocationRanking` also has its own specialty identifier via `service.specialty-identifier.ts`. The upfront identification in `ranking-run` is duplicative but harmless — the pipeline's identifier will use whatever was pre-set or re-detect.

### Step 4: Remove `resolveLocationId()` band-aid calls

Since we're sourcing `location.id` directly from the `locations` table, we no longer need `resolveLocationId()` to reverse-map GBP IDs back to location IDs.

## Risk Analysis

### Level 2 — Concern: Unseeded orgs
If any org wasn't properly seeded by migration `20260222000004`, they'd have no `locations` or `google_properties` rows. The refactored endpoint would skip them with a warning log. This is actually safer than the legacy path (which would process them with potentially stale JSONB data).

**Mitigation:** Log a clear warning when an onboarded org has zero locations.

### Level 2 — Concern: Async contract change
Any external caller (n8n workflow, cron job) currently expecting a synchronous response with full results would break. The response shape changes from `{ results: [...completed...] }` to `{ batches: [...pending...] }`.

**Mitigation:** Check how `ranking-run` is currently invoked. If via n8n/cron, the caller likely doesn't use the response body — it's fire-and-forget.

### Level 1 — Multi-connection orgs
An org could theoretically have multiple `google_connections` rows. `proofline-run` handles this by getting the OAuth client from the connection ID. We should get the `google_connection_id` from each `google_property` row rather than assuming one connection per org.

## Definition of Done

- [x] `runRankingAgent` sources locations from `LocationModel.findByOrganizationId()` + `GooglePropertyModel.findByLocationId()`
- [x] No references to `google_connections.google_property_ids` in the refactored function
- [x] Endpoint returns immediately with batch metadata (async via `setImmediate`)
- [x] Background processor creates one batch per org, processes locations sequentially with retry logic
- [x] `practice_rankings` records created with correct `organization_id`, `location_id`, `batch_id`
- [x] Existing admin practice ranking page picks up and visualizes auto-generated batches (no frontend changes)
- [x] Warning logged for orgs with zero locations
- [x] Existing `processLocationRanking` pipeline used unchanged

## Execution Log

**Date:** 2026-03-07
**File modified:** `signalsai-backend/src/controllers/agents/AgentsController.ts` — `runRankingAgent` function (lines 1207+)
**TypeScript:** Clean compile confirmed (`tsc --noEmit` passed)
**No frontend changes required.**
