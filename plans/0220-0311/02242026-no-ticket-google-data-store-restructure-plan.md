# Google Data Store Restructure + Proofline Payload Fix

## Problem Statement

The `google_data_store` table has three structural problems:

1. **Missing scope columns** — No `organization_id` or `location_id`. Data is keyed by `domain` only, which breaks for multi-location orgs and makes it impossible to query per-location history.
2. **Dead columns** — `ga4_data` and `gsc_data` still exist (373 rows have actual legacy data). GA4/GSC integrations were removed from the app. These columns waste space and create confusion.
3. **`google_account_id` going stale** — Recent rows have NULL `google_account_id` because the multi-location refactor stopped passing it.

Additionally, the Proofline agent payload is the only agent that doesn't wrap its data in `additional_data`, inconsistent with every other agent (Summary, Opportunity, CRO Optimizer, Referral Engine, Guardian/Governance, Copy Companion).

## Context Summary

### Current `google_data_store` schema
```
id (serial PK)
google_account_id (bigint, nullable) — legacy, going stale
domain (varchar 255)
date_start (date)
date_end (date)
run_type (varchar 50) — "daily" | "monthly"
ga4_data (jsonb) — DEAD
gbp_data (jsonb) — active, stores raw GBP API response
gsc_data (jsonb) — DEAD
created_at (timestamp)
updated_at (timestamp)
```

### Current state: 403 rows
- 310 daily, 93 monthly
- 373 rows with ga4/gsc data (legacy, pre-removal)
- 30 rows without ga4/gsc data (recent)
- 22 rows with NULL google_account_id (from multi-location changes)
- 8 distinct domains

### Write points (4 total, all internal code)
1. `AgentsController.ts:194` — `runProoflineAgent()` per-location loop
2. `AgentsController.ts:407` — `runMonthlyAgents()` single location
3. `service.agent-orchestrator.ts:708` — `processClient()` daily
4. `service.agent-orchestrator.ts:734` — `processClient()` monthly

### Read points
**Zero** — nobody reads from this table. It's write-only.

### `gbp_data` JSONB structure (daily)
```json
{
  "yesterday": {
    "locations": [{
      "locationId": "4129627917318103385",
      "displayName": "Caswell Orthodontics - Mililani, HI",
      "data": {
        "performance": { "series": [{ "dailyMetricTimeSeries": [...7 metrics...] }] },
        "reviews": { "allTime": {...}, "window": { "reviewDetails": [...] } },
        "profile": { "title", "websiteUri", "phoneNumber", ... },
        "meta": { ... }
      }
    }]
  },
  "dayBeforeYesterday": { ...same structure... }
}
```

### Agent payload patterns
| Agent | Uses `additional_data`? | Consumes GBP? |
|-------|------------------------|---------------|
| Proofline (daily) | **NO** — flat at root | Yes, extracted metrics |
| Summary (monthly) | Yes | Yes, raw monthData |
| Opportunity (monthly) | Yes | No, uses Summary output |
| Referral Engine (monthly) | Yes | No, PMS only |
| CRO Optimizer (monthly) | Yes | No, uses Summary output |
| Copy Companion | Yes | Yes, profile+posts |
| Guardian/Governance | Yes | No, agent outputs |

## Existing Patterns to Follow

- All other agent payloads use `additional_data` as the wrapper for agent-consumed data
- DB migrations in `src/database/migrations/` with timestamp naming: `YYYYMMDDHHMMSS_description.ts`
- `rawData` construction happens in orchestrator, passed back to controller for DB insert
- `organization_id` and `location_id` columns were added to other tables (agent_results, tasks, notifications) in migration `20260222000005`

## Proposed Approach

### Change 1: Migration — Add columns, drop columns

Create migration: `20260224000001_restructure_google_data_store.ts`

**up:**
1. Add `organization_id` (integer, nullable, FK to organizations)
2. Add `location_id` (integer, nullable, FK to locations)
3. Drop `ga4_data` column
4. Drop `gsc_data` column
5. Add index on `(organization_id, location_id, run_type, date_start)`

**down:**
1. Add `ga4_data` (jsonb, nullable)
2. Add `gsc_data` (jsonb, nullable)
3. Drop `location_id`
4. Drop `organization_id`
5. Drop index

Note: 373 rows of legacy ga4/gsc data will be permanently deleted. This data is no longer used anywhere — GA4/GSC integrations are removed. The `google_account_id` column is kept for backward reference but new rows will rely on `organization_id` + `location_id`.

### Change 2: Update rawData construction in orchestrator

**`service.agent-orchestrator.ts` — `processDailyAgent` (line ~121):**

Current:
```typescript
const rawData = {
  domain,
  date_start: dates.dayBeforeYesterday,
  date_end: dates.yesterday,
  run_type: "daily",
  gbp_data: { yesterday, dayBeforeYesterday },
  created_at: new Date(),
  updated_at: new Date(),
};
```

New:
```typescript
const rawData = {
  organization_id: organizationId,
  location_id: locationId || null,
  domain,
  date_start: dates.dayBeforeYesterday,
  date_end: dates.yesterday,
  run_type: "daily",
  gbp_data: { yesterday, dayBeforeYesterday },
  created_at: new Date(),
  updated_at: new Date(),
};
```

Same change for `processMonthlyAgents` (line ~284) — add `organization_id` and `location_id` to rawData.

### Change 3: Wrap Proofline payload in `additional_data`

**`service.agent-input-builder.ts` — `buildProoflinePayload`:**

Current return:
```typescript
return {
  agent: "proofline",
  domain,
  location: { ... },
  period: { ... },
  visibility: { ... },
  engagement: { ... },
  reviews: { ... },
};
```

New return:
```typescript
return {
  agent: "proofline",
  domain,
  additional_data: {
    location: { ... },
    period: { ... },
    visibility: { ... },
    engagement: { ... },
    reviews: { ... },
  },
};
```

This aligns Proofline with every other agent webhook payload pattern. The `agent` and `domain` fields stay at root level (consistent with Summary, Opportunity, etc.).

### Change 4: Simplify `gbp_data` stored in google_data_store

Currently `gbp_data` stores the raw nested Google API response with `locations[0].data.performance.series[0].dailyMetricTimeSeries[]` etc. This is the same deeply nested structure that made the payload unreadable.

For daily runs, store a **pre-processed flat structure** that mirrors the payload shape:

```json
{
  "yesterday": {
    "visibility": {
      "impressions_search_desktop": 12,
      "impressions_search_mobile": 45,
      "impressions_maps_desktop": 3,
      "impressions_maps_mobile": 28
    },
    "engagement": {
      "call_clicks": 0,
      "website_clicks": 2,
      "direction_requests": 1
    },
    "reviews": {
      "allTime": { "count": 74, "average": 4.9 },
      "newReviews": [...]
    },
    "profile": {
      "title": "...",
      "category": "...",
      "address": "...",
      "phone": "...",
      "website": "..."
    }
  },
  "dayBefore": { ...same structure... }
}
```

For monthly runs, keep the raw `gbpData` as-is (Summary agent consumes it raw via `additional_data: { ...monthData }`).

This means we add a `flattenDailyGbpData()` helper in the input builder that extracts the same data the payload builder already extracts, but stores it in `gbp_data` for historical reference.

## Architectural Decisions

### Why keep `google_account_id` column
It's still referenced by 385 existing rows. Dropping it would require a data migration to backfill `organization_id` on old rows. Instead, we keep it as a legacy reference and add the new columns alongside. New inserts will populate `organization_id` + `location_id`.

### Why not backfill old rows
The 373 legacy rows with ga4/gsc data are historical artifacts. The ga4/gsc JSONB content is not used anywhere. No code reads from this table. Backfilling `organization_id`/`location_id` on old rows would require mapping `google_account_id` → org → location, which isn't always 1:1. Not worth the complexity.

### Why flatten daily gbp_data
The raw Google API response is 10+ levels deep. The Proofline builder already has `extractMetricTotal()` to navigate it. Storing the pre-processed version means if we later build trending/comparison features, we can query directly from `gbp_data` JSONB without re-implementing the extraction logic.

Monthly data stays raw because the Summary agent receives it raw (via `additional_data: { ...monthData }`).

## Risk Analysis

| Risk | Level | Mitigation |
|---|---|---|
| Dropping ga4_data/gsc_data permanently deletes legacy data | Level 2 | Data not used anywhere. No code reads it. 373 rows of dead data. |
| Proofline webhook (n8n) must handle `additional_data` wrapper | Level 3 | This changes the webhook payload shape. The n8n workflow must be updated to read from `body.additional_data` instead of `body`. Must coordinate with n8n side. |
| Monthly agents unaffected | Level 1 | Only Proofline payload changes shape. Monthly rawData gets new columns but same gbp_data format. |
| Migration on production DB | Level 2 | Standard ALTER TABLE. No data rewrite needed for new columns (nullable). Column drops are instant (PostgreSQL marks them as dropped). |

## Security Considerations

No new security surface. `organization_id` and `location_id` are internal IDs already used throughout the system.

## Performance Considerations

- Adding index on `(organization_id, location_id, run_type, date_start)` enables efficient future queries
- Dropping two JSONB columns reduces row size by ~30% for new rows
- Flattening daily `gbp_data` reduces JSONB size significantly (no more nested Google API wrapper objects)

## Definition of Done

1. Migration runs clean — `organization_id` and `location_id` columns added, `ga4_data` and `gsc_data` dropped, index created
2. All 4 write points pass `organization_id` and `location_id` in rawData
3. Proofline payload wrapped in `additional_data`
4. Daily `gbp_data` stored in flat/processed format
5. `npx tsc --noEmit` passes
6. Proofline agent runs successfully (curl test)
7. Monthly agents unaffected (no regression)
