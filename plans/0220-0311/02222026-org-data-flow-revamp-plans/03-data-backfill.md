# Plan 03 — Data Backfill & Constraint Enforcement

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Migration
**Depends on:** Plan 01 (locations exist), Plan 02 (columns exist)

---

## Problem Statement

After Plans 01 and 02, the new `location_id` columns exist but are empty. The `organization_id` columns on some tables are nullable. Existing data needs to be backfilled to associate every row with the correct organization and location. After backfill, constraints need to be tightened.

**Zero data loss is the primary constraint.**

---

## Context Summary

### Data to Backfill

| Table | Rows to Fill | Resolution Strategy |
|-------|-------------|---------------------|
| `agent_results` | `location_id` | Match `domain` → `locations.domain` within same org |
| `tasks` | `location_id` | Match `domain_name` → `locations.domain` within same org |
| `pms_jobs` | `organization_id` + `location_id` | Match `domain` → `organizations.domain` → org_id; then `domain` → `locations.domain` |
| `practice_rankings` | `location_id` | Match `gbp_location_id` → `google_properties.external_id` → `location_id` |
| `notifications` | `location_id` | Match `domain_name` → `locations.domain` within same org |

### Resolution Chain

```
domain (string) → organizations.domain → organization_id
                → locations.domain (within org) → location_id

gbp_location_id (string) → google_properties.external_id → google_properties.location_id → location_id
```

### Edge Cases

1. **Rows with `domain` but no matching organization** — Orphaned data. Log warning, leave `location_id` NULL.
2. **Rows with `organization_id` but no matching location** — Use the org's primary location as fallback.
3. **SYSTEM agent results** (`domain = "SYSTEM"`, `organization_id = NULL`) — Skip. These are global, not per-org/location.
4. **Multiple locations per org** — Match by domain string. If ambiguous, use primary location.
5. **`pms_jobs` with no org_id** — Must resolve via `domain` → `organizations.domain`.

---

## Proposed Approach

### Migration: `20260222000006_backfill_location_ids.ts`

**Strategy:** Run as a single migration with multiple UPDATE statements, each wrapped in explanatory logging.

#### Step 1: Backfill `pms_jobs.organization_id`

```sql
UPDATE pms_jobs pj
SET organization_id = o.id
FROM organizations o
WHERE pj.domain = o.domain
  AND pj.organization_id IS NULL;
```

#### Step 2: Backfill `location_id` on all tables via domain match

For `agent_results`, `tasks`, `pms_jobs`, `notifications`:

```sql
-- agent_results
UPDATE agent_results ar
SET location_id = l.id
FROM locations l
WHERE ar.organization_id = l.organization_id
  AND ar.domain = l.domain
  AND ar.location_id IS NULL
  AND ar.organization_id IS NOT NULL;

-- Fallback: use primary location for rows with org_id but no domain match
UPDATE agent_results ar
SET location_id = l.id
FROM locations l
WHERE ar.organization_id = l.organization_id
  AND l.is_primary = true
  AND ar.location_id IS NULL
  AND ar.organization_id IS NOT NULL;
```

Same pattern for `tasks` (using `domain_name`), `pms_jobs`, and `notifications`.

#### Step 3: Backfill `practice_rankings.location_id` via GBP match

```sql
-- Primary match: gbp_location_id → google_properties.external_id
UPDATE practice_rankings pr
SET location_id = gp.location_id
FROM google_properties gp
WHERE pr.gbp_location_id = gp.external_id
  AND pr.organization_id IS NOT NULL
  AND pr.location_id IS NULL;

-- Fallback: use primary location for unmatched rows
UPDATE practice_rankings pr
SET location_id = l.id
FROM locations l
WHERE pr.organization_id = l.organization_id
  AND l.is_primary = true
  AND pr.location_id IS NULL
  AND pr.organization_id IS NOT NULL;
```

#### Step 4: Audit — Log unmatched rows

```sql
-- Count rows still without location_id (excluding SYSTEM)
SELECT 'agent_results' as table_name, COUNT(*) as unmatched
FROM agent_results WHERE location_id IS NULL AND organization_id IS NOT NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks WHERE location_id IS NULL AND organization_id IS NOT NULL
UNION ALL
SELECT 'pms_jobs', COUNT(*) FROM pms_jobs WHERE location_id IS NULL AND organization_id IS NOT NULL
UNION ALL
SELECT 'practice_rankings', COUNT(*) FROM practice_rankings WHERE location_id IS NULL AND organization_id IS NOT NULL
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications WHERE location_id IS NULL AND organization_id IS NOT NULL;
```

Log these counts. If any are non-zero, log the specific domains that couldn't be matched.

### Migration: `20260222000007_enforce_org_id_constraints.ts`

**After backfill is confirmed successful**, tighten constraints:

```typescript
// Make organization_id NOT NULL on tables where it was nullable
// NOTE: Only do this AFTER confirming backfill success and no orphaned rows

// pms_jobs — new column, should now be filled
// DO NOT make NOT NULL yet if there are unmatched rows
// Instead, add a CHECK constraint that logs warnings

// For now, just add composite indexes for the new query patterns:
await knex.raw(`CREATE INDEX idx_agent_results_org_location ON agent_results(organization_id, location_id)`);
await knex.raw(`CREATE INDEX idx_tasks_org_location ON tasks(organization_id, location_id)`);
await knex.raw(`CREATE INDEX idx_pms_jobs_org_location ON pms_jobs(organization_id, location_id)`);
await knex.raw(`CREATE INDEX idx_practice_rankings_org_location ON practice_rankings(organization_id, location_id)`);
await knex.raw(`CREATE INDEX idx_notifications_org_location ON notifications(organization_id, location_id)`);
```

**Decision: Do NOT make `organization_id` NOT NULL in this plan.**

Reasoning: Some rows may be legitimately unmatched (orphaned data, SYSTEM records). Making NOT NULL would require deleting or force-assigning data. Instead:
- Add composite indexes for query performance
- Application code should populate org_id + location_id on all new inserts (Plan 04)
- A future cleanup plan can enforce NOT NULL after confirming all code paths populate correctly

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Domain-based matching for backfill | Match `domain` → `locations.domain` | Domain is the only common key between old data and new locations table. |
| Primary location as fallback | When domain doesn't match any specific location | Ensures no row is left without a location_id if it has an org_id. |
| Skip SYSTEM records | `organization_id IS NULL` → skip | Guardian/Governance agents are global, not per-org. |
| Don't enforce NOT NULL yet | Keep nullable | Prevents data loss. Enforce in code first (Plan 04), then constrain later. |
| Composite indexes added | `(organization_id, location_id)` | These will be the primary query pattern going forward. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Domain mismatch leaves rows without location_id | Level 2 | Primary location fallback catches most cases. Audit query identifies stragglers. |
| `pms_jobs` domain doesn't match any organization | Level 2 | These are genuinely orphaned. Log them. Don't delete. |
| Backfill query performance on large tables | Level 1 | Current data volume is small. If needed, batch with LIMIT/OFFSET. |
| Multiple locations with same domain in one org | Level 1 | Unlikely (domains are typically unique per org). First match wins. |

---

## Failure Mode Analysis

- **Partial backfill:** Each UPDATE is independent. Partial completion is safe — unmatched rows keep NULL.
- **Wrong location assignment:** Possible if domain matches wrong location. Mitigated by scoping match within same org_id.
- **Migration timeout:** Unlikely at current scale. If needed, run backfill as a standalone script outside migration.

---

## Security Considerations

- Backfill is a data-only operation. No authorization changes.
- No sensitive data is moved or exposed.

---

## Test Strategy

1. **Pre-backfill audit:** Count rows per table with NULL org_id / location_id
2. **Post-backfill audit:** Same counts — should be significantly reduced
3. **Spot check:** Verify 5-10 specific rows that location_id matches expected location
4. **SYSTEM records:** Confirm they are unchanged (still NULL org_id, NULL location_id)
5. **Composite index verification:** EXPLAIN ANALYZE on sample queries

---

## Blast Radius Analysis

- **Tables modified:** 5 (data updates only, no schema changes)
- **Rows modified:** All existing rows with NULL location_id (estimated hundreds, not thousands)
- **Existing queries affected:** 0 (queries don't use location_id yet)
- **Application impact:** None (new columns not yet referenced in code)

---

## Definition of Done

- [ ] All `pms_jobs` rows have `organization_id` populated (where domain matches an org)
- [ ] All rows across 5 tables have `location_id` populated (where org_id exists)
- [ ] SYSTEM records (org_id NULL) are untouched
- [ ] Audit query shows unmatched row count (ideally 0 for org-owned data)
- [ ] Composite indexes created on all 5 tables
- [ ] No existing data deleted or corrupted
- [ ] Migration is reversible (down sets location_id/org_id back to NULL and drops indexes)
