# Plan 03 — Database Schema Migration

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 01, 02 (GA4/GSC code removed so we can safely drop related columns)
**Estimated files:** 6 migration files + 6 model files

---

## Entry Conditions

- Plans 01 and 02 complete (no code references GA4/GSC columns)
- Database backup taken before execution
- Backend compiles cleanly

---

## Problem Statement

Restructure the data model: move profile fields from `google_accounts` to `users`, move org fields to `organizations`, rename `google_accounts` → `google_connections`, migrate FK references in `agent_results`, `tasks`, `practice_rankings` from `google_account_id` to `organization_id`.

---

## Migration 1: Add profile columns to `users` table

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_add_profile_columns_to_users.ts`

```sql
ALTER TABLE users
  ADD COLUMN first_name VARCHAR(255),
  ADD COLUMN last_name VARCHAR(255),
  ADD COLUMN phone VARCHAR(50),
  ADD COLUMN email_verified BOOLEAN DEFAULT false,
  ADD COLUMN email_verification_code VARCHAR(10),
  ADD COLUMN email_verification_expires_at TIMESTAMP;
```

**Rollback:** Drop these columns.

---

## Migration 2: Add org-level columns to `organizations` table

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_add_onboarding_columns_to_organizations.ts`

```sql
ALTER TABLE organizations
  ADD COLUMN operational_jurisdiction VARCHAR(500),
  ADD COLUMN onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN onboarding_wizard_completed BOOLEAN DEFAULT false,
  ADD COLUMN setup_progress JSONB DEFAULT '{"step1_api_connected": false, "step2_pms_uploaded": false, "dismissed": false, "completed": false}';
```

**Rollback:** Drop these columns.

---

## Migration 3: Copy data from `google_accounts` to `users` and `organizations`

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_migrate_data_from_google_accounts.ts`

**This is a data-only migration (no schema changes).** Run in transaction.

```sql
-- Copy profile fields to users (matched by user_id)
UPDATE users u
SET
  first_name = ga.first_name,
  last_name = ga.last_name,
  phone = ga.phone,
  email_verified = true  -- existing users are implicitly verified
FROM google_accounts ga
WHERE u.id = ga.user_id
  AND ga.first_name IS NOT NULL;

-- Copy org fields to organizations (matched by organization_id)
UPDATE organizations o
SET
  operational_jurisdiction = ga.operational_jurisdiction,
  onboarding_completed = ga.onboarding_completed,
  onboarding_wizard_completed = ga.onboarding_wizard_completed,
  setup_progress = ga.setup_progress
FROM google_accounts ga
WHERE o.id = ga.organization_id
  AND ga.organization_id IS NOT NULL;

-- Ensure organizations.name and domain are populated
UPDATE organizations o
SET
  name = COALESCE(o.name, ga.practice_name),
  domain = COALESCE(o.domain, ga.domain_name)
FROM google_accounts ga
WHERE o.id = ga.organization_id
  AND ga.organization_id IS NOT NULL;
```

**Validation queries (run after migration):**
```sql
-- Verify user data was copied
SELECT COUNT(*) FROM users WHERE first_name IS NOT NULL;
-- Compare with source
SELECT COUNT(*) FROM google_accounts WHERE first_name IS NOT NULL;

-- Verify org data was copied
SELECT COUNT(*) FROM organizations WHERE onboarding_completed = true;
-- Compare
SELECT COUNT(*) FROM google_accounts WHERE onboarding_completed = true AND organization_id IS NOT NULL;
```

**Rollback:** Set copied columns back to NULL (data loss acceptable for rollback).

---

## Migration 4: Add `organization_id` to dependent tables

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_add_org_id_to_dependent_tables.ts`

```sql
-- agent_results: add organization_id, backfill from google_accounts
ALTER TABLE agent_results ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

UPDATE agent_results ar
SET organization_id = ga.organization_id
FROM google_accounts ga
WHERE ar.google_account_id = ga.id;

-- tasks: add organization_id, backfill
ALTER TABLE tasks ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

UPDATE tasks t
SET organization_id = ga.organization_id
FROM google_accounts ga
WHERE t.google_account_id = ga.id;

-- practice_rankings: add organization_id, backfill
ALTER TABLE practice_rankings ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

UPDATE practice_rankings pr
SET organization_id = ga.organization_id
FROM google_accounts ga
WHERE pr.google_account_id = ga.id;
```

**Rollback:** Drop organization_id columns from these tables.

---

## Migration 5: Rename `google_accounts` → `google_connections` and clean up

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_rename_google_accounts_to_connections.ts`

```sql
-- Rename the table
ALTER TABLE google_accounts RENAME TO google_connections;

-- Drop moved columns
ALTER TABLE google_connections
  DROP COLUMN first_name,
  DROP COLUMN last_name,
  DROP COLUMN phone,
  DROP COLUMN practice_name,
  DROP COLUMN domain_name,
  DROP COLUMN operational_jurisdiction,
  DROP COLUMN onboarding_completed,
  DROP COLUMN onboarding_wizard_completed,
  DROP COLUMN setup_progress;

-- Drop user_id FK (connections belong to orgs now)
ALTER TABLE google_connections DROP COLUMN user_id;

-- Make organization_id NOT NULL (all existing rows should have it by now)
-- First handle any NULL organization_id rows
ALTER TABLE google_connections ALTER COLUMN organization_id SET NOT NULL;

-- Rename FK columns in dependent tables
ALTER TABLE google_properties RENAME COLUMN google_account_id TO google_connection_id;
```

**Rollback:** Reverse rename, re-add columns, restore user_id.

**CRITICAL NOTE:** Before making organization_id NOT NULL, verify no rows have NULL:
```sql
SELECT COUNT(*) FROM google_accounts WHERE organization_id IS NULL;
```
If any exist, decide: delete orphans or assign a default org.

---

## Migration 6: Drop `google_account_id` from dependent tables (final cleanup)

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_drop_google_account_id_from_dependent_tables.ts`

```sql
ALTER TABLE agent_results DROP COLUMN google_account_id;
ALTER TABLE tasks DROP COLUMN google_account_id;
ALTER TABLE practice_rankings DROP COLUMN google_account_id;
```

**Rollback:** Re-add columns (data will be lost — this is a one-way migration).

**WARNING:** Only execute this after ALL code references to `google_account_id` in these tables have been updated (Plans 04, 08).

---

## Model Updates

After migrations, update these model files:

### `UserModel.ts`
- Add to interface: `first_name`, `last_name`, `phone`, `email_verified`, `email_verification_code`, `email_verification_expires_at`
- Add methods: `updateProfile(id, data)`, `setEmailVerified(id)`, `findByVerificationCode(email, code)`

### `OrganizationModel.ts`
- Add to interface: `operational_jurisdiction`, `onboarding_completed`, `onboarding_wizard_completed`, `setup_progress`
- Add `jsonFields = ["setup_progress"]`
- Add methods: `completeOnboarding(id)`, `updateSetupProgress(id, progress)`

### `GoogleConnectionModel.ts` (renamed from GoogleAccountModel.ts)
- Rename file from `GoogleAccountModel.ts` to `GoogleConnectionModel.ts`
- Rename class from `GoogleAccountModel` to `GoogleConnectionModel`
- Update `tableName` from `"google_accounts"` to `"google_connections"`
- Remove from interface: `user_id`, `first_name`, `last_name`, `phone`, `practice_name`, `domain_name`, `operational_jurisdiction`, `onboarding_completed`, `onboarding_wizard_completed`, `setup_progress`
- Update: `organization_id` is now required (not nullable)
- Update method: `findByOrganization(orgId)` becomes primary lookup
- Remove method: `findByUserId(userId)` — no longer relevant
- Keep methods for token management: `updateTokens()`, `findById()`

### `GooglePropertyModel.ts`
- Update interface: `google_account_id` → `google_connection_id`
- Update queries: WHERE clauses reference `google_connection_id`

### `AgentResultModel.ts`
- Add `organization_id` to interface
- Update all queries from `google_account_id` to `organization_id`
- Eventually remove `google_account_id` from interface (after Migration 6)

### `TaskModel.ts`
- Same pattern as AgentResultModel

### `PracticeRankingModel.ts`
- Same pattern as AgentResultModel

---

## Update all imports across codebase

Every file that imports `GoogleAccountModel` must be updated to import `GoogleConnectionModel`:

- Search for: `from.*GoogleAccountModel`
- Replace with: `GoogleConnectionModel`
- Update variable names: `googleAccount` → `googleConnection` (where semantically appropriate)

**Files known to import GoogleAccountModel:**
- `src/middleware/tokenRefresh.ts`
- `src/middleware/rbac.ts`
- `src/middleware/superAdmin.ts`
- `src/auth/oauth2Helper.ts`
- `src/controllers/onboarding/OnboardingController.ts`
- `src/controllers/onboarding/feature-services/ProfileCompletionService.ts`
- `src/controllers/onboarding/feature-services/GbpOnboardingService.ts`
- `src/controllers/settings/SettingsController.ts`
- `src/controllers/settings/feature-services/service.properties.ts`
- `src/controllers/profile/profile.controller.ts`
- `src/controllers/auth/AuthController.ts`
- `src/controllers/auth/feature-services/OAuthFlowService.ts`
- `src/controllers/agents/AgentsController.ts`
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts`
- `src/controllers/tasks/TasksController.ts`
- `src/controllers/notifications/NotificationsController.ts`
- `src/controllers/admin-organizations/` (multiple files)
- `src/utils/dataAggregation/dataAggregator.ts`

---

## Verification

1. Run all migrations forward on staging DB
2. Verify data integrity with validation queries
3. Run all migrations backward (rollback test)
4. Run forward again
5. Update all model files
6. Backend must compile cleanly
7. Run any existing tests

---

## Exit Conditions

- [ ] All 6 migrations created and tested
- [ ] Data successfully migrated (users have profile fields, orgs have onboarding state)
- [ ] `google_connections` table exists with correct schema
- [ ] `google_accounts` table no longer exists
- [ ] All model files updated with new interfaces and methods
- [ ] All imports updated from GoogleAccountModel → GoogleConnectionModel
- [ ] Dependent tables have `organization_id` populated
- [ ] Backend compiles cleanly
