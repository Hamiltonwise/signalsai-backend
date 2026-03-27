# Plan 01 — Locations Foundation

**Date:** 2026-02-22
**Ticket:** no-ticket
**Tier:** Migration
**Depends on:** Nothing (first in sequence)

---

## Problem Statement

The system currently has no concept of "locations." Each organization can have multiple GBP (Google Business Profile) locations stored as a JSON blob in `google_connections.google_property_ids`. There is no first-class `locations` table, no `google_properties` table (model exists but table was never created), and no way to scope data to a specific location within an organization.

This plan introduces the foundational tables that all subsequent plans depend on.

---

## Context Summary

### Current State
- GBP locations stored as JSON array in `google_connections.google_property_ids.gbp[]`
- Each entry: `{ accountId: string, locationId: string, displayName: string }`
- `GooglePropertyModel.ts` exists but the `google_properties` DB table was never created
- No `locations` table exists
- User access is org-wide — no per-location scoping for managers/viewers
- `organization_users` has `role` but no `location_ids`

### Target State
- `locations` table: one row per physical location, owned by an organization
- `google_properties` table: links a location to its GBP identifiers
- `user_locations` pivot table: controls which locations non-admin users can access
- Admins get all locations by default; managers/viewers get explicit location grants

---

## Existing Patterns to Follow

- Foreign keys use `integer` type with `.references("id").inTable("table_name")`
- Tables have `created_at` and `updated_at` timestamps (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- Models extend `BaseModel` with `tableName`, `jsonFields`, and typed interface
- Migration files follow naming: `YYYYMMDD######_description.ts`
- Knex migration pattern with `up()` and `down()` functions

---

## Proposed Approach

### Migration: `20260222000001_create_locations_table.ts`

```sql
CREATE TABLE locations (
  id            SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,          -- Display name (e.g., "Downtown Office")
  domain        VARCHAR(255),                   -- Domain for this location (nullable, may inherit from org)
  is_primary    BOOLEAN NOT NULL DEFAULT false,  -- Whether this is the primary/default location
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_organization_id ON locations(organization_id);
CREATE UNIQUE INDEX idx_locations_one_primary_per_org ON locations(organization_id) WHERE is_primary = true;
```

**Rationale:**
- `is_primary` with a partial unique index ensures exactly one primary location per org
- `domain` is nullable because not every location needs its own domain (most practices share one)
- CASCADE on org delete ensures cleanup

### Migration: `20260222000002_create_google_properties_table.ts`

```sql
CREATE TABLE google_properties (
  id                    SERIAL PRIMARY KEY,
  location_id           INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  google_connection_id  INTEGER NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  type                  VARCHAR(50) NOT NULL DEFAULT 'gbp',
  external_id           VARCHAR(255) NOT NULL,   -- GBP location ID (e.g., "locations/123456")
  account_id            VARCHAR(255),            -- GBP account ID (e.g., "accounts/789")
  display_name          VARCHAR(255),
  metadata              JSONB,
  selected              BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_google_properties_location_id ON google_properties(location_id);
CREATE INDEX idx_google_properties_connection_id ON google_properties(google_connection_id);
CREATE UNIQUE INDEX idx_google_properties_unique_external ON google_properties(google_connection_id, external_id);
```

**Rationale:**
- Links a location to its GBP data via `location_id`
- Also references `google_connection_id` for OAuth token resolution
- `account_id` stores the GBP account identifier (needed for API calls)
- Unique constraint on `(google_connection_id, external_id)` prevents duplicate property entries
- Replaces the JSON blob in `google_connections.google_property_ids`

### Migration: `20260222000003_create_user_locations_table.ts`

```sql
CREATE TABLE user_locations (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, location_id)
);

CREATE INDEX idx_user_locations_location_id ON user_locations(location_id);
```

**Rationale:**
- Clean many-to-many join table
- Composite primary key prevents duplicates
- Only populated for manager/viewer users — admin users implicitly have access to all locations
- If no rows exist for a user, they have access to ALL locations (default behavior)

### Migration: `20260222000004_seed_locations_from_gbp.ts`

**Data seeding migration** — creates location rows from existing GBP data:

```
For each google_connection with google_property_ids.gbp[]:
  1. Get the organization_id from google_connections
  2. For each GBP entry in the array:
     a. CREATE a location row (org_id, name=displayName, domain=org.domain)
     b. CREATE a google_properties row linking location → GBP identifiers
  3. Mark the first location as is_primary = true

For organizations with NO GBP properties:
  1. CREATE a single default location (org_id, name=org.name, domain=org.domain, is_primary=true)
```

**Zero data loss guarantee:**
- This migration only INSERTS new rows — never modifies or deletes existing data
- The JSON blob in `google_connections.google_property_ids` is NOT removed (kept for backward compat until Plan 05 cleans it up)

### Models

**LocationModel.ts:**
```typescript
interface ILocation {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}
```

Key methods:
- `findById(id)`
- `findByOrganizationId(orgId)` — returns all locations for an org
- `findPrimaryByOrganizationId(orgId)` — returns the primary location
- `create(data)`, `updateById(id, data)`, `deleteById(id)`

**GooglePropertyModel.ts** (update existing model):
- Change `google_connection_id` → keep as-is (already correct)
- Add `location_id` field
- Add `account_id` field
- Update interface to match new table schema

**UserLocationModel.ts:**
```typescript
interface IUserLocation {
  user_id: number;
  location_id: number;
  created_at: Date;
}
```

Key methods:
- `findByUserId(userId)` — returns location IDs for a user
- `findByLocationId(locationId)` — returns user IDs with access
- `setLocationsForUser(userId, locationIds)` — replace all assignments
- `addLocationForUser(userId, locationId)`
- `removeLocationForUser(userId, locationId)`
- `hasAccess(userId, locationId)` — boolean check

---

## Architectural Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| `locations` as separate table (not reusing `google_properties`) | Separate table | A location can exist without GBP. `google_properties` is a child of `locations`, not a synonym. |
| `user_locations` pivot table (not comma-separated on `organization_users`) | Pivot table | Proper relational design. Enables JOINs, foreign key constraints, cascade deletes. No string parsing. |
| Empty `user_locations` = all access | Implicit grant | Avoids seeding N*M rows for every user. Admin role check happens at RBAC layer, not here. |
| `is_primary` with partial unique index | Database constraint | Prevents multiple primaries at the DB level, not just application logic. |
| Keep `google_connections.google_property_ids` after seeding | Backward compat | Don't break existing code. Later plans will migrate queries away from JSON blob. |

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Seed migration fails mid-way (partial locations created) | Level 2 | Run seed migration in a transaction. Each org's locations seeded atomically. |
| Orgs with no GBP data get no locations | Level 1 | Default location created for all orgs, even those without GBP. |
| `is_primary` partial unique index not supported by all PG versions | Level 1 | Requires PostgreSQL 9.5+. RDS supports this. |
| Existing `GooglePropertyModel.ts` interface changes | Level 1 | Model is unused — no breaking changes. |

---

## Failure Mode Analysis

- **Partial migration failure:** Seed migration wrapped in transaction per-org. If one org fails, others still succeed. Failed org logged and can be retried.
- **Duplicate GBP entries:** Unique index on `(google_connection_id, external_id)` prevents duplicates. Seed migration uses INSERT with conflict handling.
- **Concurrent location creation:** `is_primary` partial unique index prevents race conditions on primary assignment.

---

## Security Considerations

- `user_locations` access checks must be enforced at the API layer (RBAC middleware), not trusted from client.
- Location IDs must be validated against the user's organization before granting access.
- Admin users bypass `user_locations` checks entirely.

---

## Test Strategy

1. **Migration tests:**
   - Verify tables created with correct columns and constraints
   - Verify seed migration creates locations from existing GBP data
   - Verify orgs without GBP get a default location
   - Verify `is_primary` constraint works (only one per org)

2. **Model tests:**
   - CRUD operations on LocationModel
   - UserLocationModel access check logic
   - GooglePropertyModel with new schema

---

## Blast Radius Analysis

- **Tables created:** 3 new tables (`locations`, `google_properties`, `user_locations`)
- **Tables modified:** 0
- **Existing queries affected:** 0 (this is purely additive)
- **Frontend affected:** 0 (no UI changes in this plan)

---

## Definition of Done

- [ ] `locations` table exists with correct schema and indexes
- [ ] `google_properties` table exists with correct schema and indexes
- [ ] `user_locations` table exists with correct schema and indexes
- [ ] All existing GBP locations are seeded as `locations` + `google_properties` rows
- [ ] All organizations have at least one location (primary)
- [ ] `LocationModel.ts` created with CRUD + org queries
- [ ] `GooglePropertyModel.ts` updated to match new table schema
- [ ] `UserLocationModel.ts` created with access check methods
- [ ] `google_connections.google_property_ids` is NOT modified (backward compat)
- [ ] Migration is reversible (down function drops tables)
