# Plan 02 — Schema Consistency

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Migration
**Depends on:** Plan 01 (locations table must exist)

---

## Problem Statement

Several data tables are missing `organization_id`, `location_id`, or both. Some tables that have `organization_id` have it as nullable when it should be NOT NULL. The `domain` column is used as an implicit scoping key across many tables but is not backed by foreign key constraints.

This plan adds the missing columns and prepares them for the backfill in Plan 03.

---

## Context Summary

### Tables Needing Changes

| Table | Has `organization_id` | Has `location_id` | Action |
|-------|----------------------|-------------------|--------|
| `agent_results` | YES (nullable) | NO | Add `location_id` |
| `tasks` | YES (nullable) | NO | Add `location_id` |
| `pms_jobs` | **NO** | NO | Add `organization_id` + `location_id` |
| `practice_rankings` | YES (nullable) | NO | Add `location_id` (already has `gbp_location_id` string) |
| `notifications` | YES (nullable) | NO | Add `location_id` |

### Tables Already Correct (No Changes)
- `google_connections` — has `organization_id` NOT NULL
- `website_builder.projects` — has `organization_id` (1:1 per org, no location concept)
- `website_builder.user_edits` — has `organization_id` + `user_id`
- `agent_recommendations` — child of `agent_results` via FK, inherits scoping

### Tables Excluded (Per Scope Decision)
- `clarity_data_store` — skipped
- `audit_processes` — skipped (leadgen tool)

---

## Existing Patterns to Follow

- Previous migration `20260221000003` added `organization_id` with `.nullable()` first, then backfilled in a separate step
- Foreign keys reference `locations(id)` with ON DELETE SET NULL (data survives location deletion)
- Column additions are always nullable initially, then made NOT NULL after backfill

---

## Proposed Approach

### Migration: `20260222000005_add_location_id_to_dependent_tables.ts`

Add `location_id` column (nullable) to all five tables:

```typescript
export async function up(knex: Knex): Promise<void> {
  // 1. agent_results — add location_id
  await knex.schema.alterTable("agent_results", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 2. tasks — add location_id
  await knex.schema.alterTable("tasks", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 3. pms_jobs — add BOTH organization_id AND location_id
  await knex.schema.alterTable("pms_jobs", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 4. practice_rankings — add location_id
  await knex.schema.alterTable("practice_rankings", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 5. notifications — add location_id
  await knex.schema.alterTable("notifications", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // Add indexes for location_id on all tables
  await knex.raw(`CREATE INDEX idx_agent_results_location_id ON agent_results(location_id)`);
  await knex.raw(`CREATE INDEX idx_tasks_location_id ON tasks(location_id)`);
  await knex.raw(`CREATE INDEX idx_pms_jobs_org_id ON pms_jobs(organization_id)`);
  await knex.raw(`CREATE INDEX idx_pms_jobs_location_id ON pms_jobs(location_id)`);
  await knex.raw(`CREATE INDEX idx_practice_rankings_location_id ON practice_rankings(location_id)`);
  await knex.raw(`CREATE INDEX idx_notifications_location_id ON notifications(location_id)`);
}
```

**Why nullable first:**
- Cannot add NOT NULL column to table with existing rows without a default
- Plan 03 handles backfill, then a subsequent migration makes columns NOT NULL

**Why ON DELETE SET NULL (not CASCADE):**
- Deleting a location should NOT delete all agent results, tasks, PMS jobs
- Data survives; queries filter by `location_id IS NOT NULL` or use org-level scoping
- Alternative: ON DELETE RESTRICT (prevent location deletion if data exists) — but SET NULL is safer for admin workflows

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| All columns nullable initially | Two-phase migration | Can't add NOT NULL to existing rows. Backfill in Plan 03, then constrain. |
| ON DELETE SET NULL for location_id | Preserve data | Deleting a location shouldn't cascade-delete all associated data. Orphaned rows queryable at org level. |
| ON DELETE SET NULL for pms_jobs.organization_id | Preserve data | Same reasoning. PMS jobs are audit records. |
| Separate indexes per table | Query performance | location_id will be a frequent WHERE clause after migration. |
| `location_id` as integer FK (not the GBP string) | Consistent with `locations.id` | `practice_rankings.gbp_location_id` is a GBP API string. `location_id` is our internal integer FK. Both kept — different purposes. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Adding columns to large tables causes lock | Level 2 | `ALTER TABLE ADD COLUMN ... NULL` is a metadata-only operation in PostgreSQL — no table rewrite, no long lock. |
| Index creation on large tables | Level 1 | Use `CREATE INDEX CONCURRENTLY` if tables are large. For current data volume, standard CREATE INDEX is fine. |
| `pms_jobs` getting organization_id might conflict with existing queries | Level 1 | Column is nullable and unused until Plan 03 backfills it. No existing code references it. |

---

## Failure Mode Analysis

- **Migration rollback:** Down function drops the added columns. Clean reversal.
- **Partial migration failure:** Each ALTER TABLE is independent. If one fails, others may have succeeded. Down function handles this by checking column existence before dropping.
- **Application behavior during migration:** New columns are nullable and unused. No code reads them yet. Zero application impact.

---

## Security Considerations

- No security changes in this plan. Columns are added but not yet used in queries or authorization.

---

## Test Strategy

1. Verify all five tables have `location_id` column after migration
2. Verify `pms_jobs` has `organization_id` column after migration
3. Verify all foreign key constraints point to correct tables
4. Verify indexes exist
5. Verify existing data is unchanged (no rows modified)
6. Verify down migration cleanly removes columns

---

## Blast Radius Analysis

- **Tables modified:** 5 (`agent_results`, `tasks`, `pms_jobs`, `practice_rankings`, `notifications`)
- **Columns added:** 6 total (5x `location_id`, 1x `organization_id`)
- **Existing data modified:** 0 rows (nullable columns with no default)
- **Existing queries affected:** 0 (new columns not referenced yet)
- **Application impact:** None

---

## Definition of Done

- [ ] `agent_results.location_id` exists (nullable, FK → locations.id)
- [ ] `tasks.location_id` exists (nullable, FK → locations.id)
- [ ] `pms_jobs.organization_id` exists (nullable, FK → organizations.id)
- [ ] `pms_jobs.location_id` exists (nullable, FK → locations.id)
- [ ] `practice_rankings.location_id` exists (nullable, FK → locations.id)
- [ ] `notifications.location_id` exists (nullable, FK → locations.id)
- [ ] All indexes created
- [ ] Existing data unchanged
- [ ] Migration is reversible
