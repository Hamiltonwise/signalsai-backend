---
id: spec-reset-pms-data-org-36
created: 2026-04-23
ticket: no-ticket
mode: --start
status: planning
---

# Reset PMS Data for Organization 36 (Production)

## Why
Org 36 needs a clean PMS + analysis-pipeline state without destroying the organization record, users, or locations. Current platform has no first-class reset action — only full `DELETE FROM organizations` with FK CASCADE. A targeted, rollback-safe data wipe is required.

## What
A single knex migration that:
1. Snapshots every row it's about to delete into backup tables (`<table>_reset_backup_org36_<timestamp>`).
2. Deletes `pms_jobs`, `agent_results`, `agent_recommendations` (via join), and `tasks` for `organization_id = 36`.
3. On `db:rollback`, restores every deleted row from the backups, then drops the backup tables.

**Done when:**
- `npm run db:migrate` on prod wipes org 36's PMS + analysis state, with zero FK violations.
- `npm run db:rollback` on prod restores the exact rows (id, FK, JSONB, timestamps intact).
- Admin UI at `/admin/organizations/36` → PMS tab shows empty state.
- Referral matrix for org 36 renders the empty-state component.
- No other organization's data is touched.

## Context

**Relevant files (read-only, referenced for understanding):**
- `src/database/migrations/20260222000007_fix_fk_cascade_for_org_delete.ts` — confirms CASCADE on org delete for pms_jobs, agent_results, tasks, notifications.
- `src/database/migrations/20260221000003_add_org_id_to_dependent_tables.ts` — schema for agent_results, tasks with org_id + location_id FKs.
- `src/models/AgentRecommendationModel.ts` — confirms `agent_recommendations.agent_result_id → agent_results.id` has **no** DB-level CASCADE; deletion is manual via `deleteByAgentResultId()`.
- `src/utils/pms/pmsAggregator.ts:149-291` — referral matrix is computed on read from `pms_jobs.response_log`; wiping pms_jobs automatically clears matrices.
- `src/database/config.ts` — knex config; migration dir `./src/database/migrations`, extension `ts`, env vars `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`.
- `src/database/connection.ts` — confirms migrations do NOT autorun on app startup (only `testConnection()`). Safe from accidental re-fire.
- `package.json:10-14` — `db:migrate` → `knex migrate:latest`, `db:rollback` → `knex migrate:rollback`.

**Patterns to follow:**
- Migration file naming: `YYYYMMDDHHmmss_snake_case_slug.ts` — last migration is `20260418000002`, so this one is `20260423000001_reset_pms_data_org_36.ts`.
- Migration shape: `export async function up(knex: Knex): Promise<void>` + `export async function down(knex: Knex): Promise<void>`. See `20260418000000_add_retry_count_to_audit_processes.ts` for reference.
- Raw SQL via `knex.raw(..., [bindings])` to avoid string interpolation of the org id.
- Data migrations precedent: `20260225000003_seed_croseo_mind.ts` (seed insert + down delete) and `20260227000003_backfill_mind_brain_chunks.ts` (derived data clear). Neither snapshots on delete — **we go further** because user explicitly wants rollback to restore.

**Reference file:** `src/database/migrations/20260227000003_backfill_mind_brain_chunks.ts` — closest analog for a non-schema data migration. We extend its pattern with snapshot tables for true rollback.

## Constraints

**Must:**
- Target `organization_id = 36` exactly. Use a bound parameter, not string interpolation.
- Guard against accidental non-prod execution: check `DB_NAME` matches the prod DB name. If not, log a loud skip and return early. User to confirm exact prod `DB_NAME` value before execution.
- Delete in FK-safe order: `agent_recommendations` (via join) → `agent_results` → `tasks` → `pms_jobs`.
- Create snapshot tables BEFORE any DELETE. Snapshot tables use schema `public` (default) and a deterministic suffix `_reset_backup_org36_20260423` (matches migration date; makes rollback mapping obvious).
- Down migration must restore rows with original `id` values preserved (INSERT SELECT copies the id column directly).
- Run everything inside the implicit knex migration transaction so a mid-way failure rolls back cleanly.
- Use postgres-only SQL (`CREATE TABLE … AS SELECT`). No portability to mssql.

**Must not:**
- Touch `notifications`, `organizations`, `locations`, `users`, `google_data_store`, `schedules`, or `schedule_runs`.
- Delete any other org's rows.
- Modify any app code, models, or routes.
- Use `CASCADE` on DROP TABLE for the backup tables (no FKs should reference them, but be explicit).
- Introduce any new dependency.

**Out of scope:**
- A generic reusable "reset org" admin action (would be a separate Level 3+ plan).
- Soft-delete infrastructure (the codebase uses hard deletes; adding soft-delete is a platform-level change).
- Archival of backup tables to S3 / long-term storage (backups live in the same DB; caller drops them via `db:rollback` or manually).
- Cleanup of Proofline's `google_data_store` rows for org 36 (not classified as analysis output per option 2).

## Risk

**Level:** 3 (Structural Risk — production data deletion with no UI undo path)

**Risks identified:**

1. **Migration re-runs against another env.** Once committed, any future env (staging refresh, local dev setup, disaster-recovery rebuild) running `db:migrate` will execute this file. If that env has an `id=36` org, data loss happens silently. → **Mitigation:** hard-guard via `DB_NAME` env check. Migration is a no-op if `DB_NAME !== <prod-name>` and logs a clear skip message. User supplies the exact prod DB_NAME at execution time.

2. **Backup-table id collision on rollback.** Between `up` and a later `down`, new rows may be written to `agent_results` / `tasks` / `pms_jobs` with new IDs. Restoring old IDs via INSERT is safe (postgres sequences won't conflict because new rows take higher IDs), BUT if org 36 is deleted entirely between up and down, restored rows will FK-violate on organizations. → **Mitigation:** down migration checks `organizations.id = 36` exists before restoring; if missing, abort with a clear error.

3. **Pending unrelated migrations piggyback on prod run.** `npm run db:migrate` applies ALL pending migrations, not just this one. → **Mitigation:** pre-flight step — run `SELECT name FROM knex_migrations_lock` and compare to the files list; confirm only this migration is pending. Documented in the run plan.

4. **Long-running DELETE blocks writes.** Org 36's row counts unknown — if large, DELETEs may hold locks. → **Mitigation:** pre-flight query to measure row counts before approving the prod run. If any table >10k rows for org 36, reconsider batching (likely not needed for a single org's operational data).

5. **JSONB fidelity on snapshot/restore.** `response_log` in pms_jobs is JSONB. `CREATE TABLE AS SELECT` preserves type. `INSERT SELECT` round-trips JSONB without mutation. → **No action needed, but verify post-rollback with a checksum.**

**Blast radius:**
- Direct table writes (DELETE + CREATE + INSERT): `pms_jobs`, `agent_results`, `agent_recommendations`, `tasks` (org 36 scope only).
- Derived side effects: referral matrix empty on `/admin/organizations/36`, analysis dashboards empty, Referral Engine Analysis agent will have no PMS source next run, Guardian/Governance monthly data cleared.
- Backup tables created: 4 new tables in `public` schema, prefixed `<name>_reset_backup_org36_20260423`. These persist until `db:rollback` drops them OR someone manually drops them.

**Pushback:**
- A knex migration is an unusual vehicle for a one-shot prod data reset. A standalone script under `scripts/` (e.g., `scripts/reset-org-pms.ts`) would be semantically cleaner and wouldn't pollute migration history. **User chose migration for rollback-ability** — understood and accepted, but flagging the trade-off: this migration will forever show up in `knex_migrations`, the backup tables persist until explicitly dropped, and any new env initialization will hit the guard path. If this is a one-time operation, a script with manual `BEGIN; … COMMIT;` is more idiomatic. Recommending: proceed with migration as requested, but delete the migration file + the `knex_migrations` row + the backup tables once rollback window has passed, so future envs don't carry this artifact.

## Tasks

### T1: Scaffold migration file with snapshot + delete + restore logic
**Do:**
- Create `src/database/migrations/20260423000001_reset_pms_data_org_36.ts`.
- Implement `up()`:
  1. Read `DB_NAME` env; if not the configured prod name, log skip + return.
  2. Pre-flight: `SELECT COUNT(*)` for each target table where `organization_id = 36` (and join for agent_recommendations). Log counts.
  3. `CREATE TABLE public.pms_jobs_reset_backup_org36_20260423 AS SELECT * FROM public.pms_jobs WHERE organization_id = 36`.
  4. Same for `agent_results`, `tasks`.
  5. For `agent_recommendations`: `CREATE TABLE … AS SELECT ar.* FROM agent_recommendations ar JOIN agent_results r ON ar.agent_result_id = r.id WHERE r.organization_id = 36`.
  6. DELETE agent_recommendations via subquery join.
  7. DELETE agent_results where org 36.
  8. DELETE tasks where org 36.
  9. DELETE pms_jobs where org 36.
  10. Log final counts (should be zero for all four).
- Implement `down()`:
  1. Verify `organizations.id = 36` exists (abort if not).
  2. `INSERT INTO pms_jobs SELECT * FROM pms_jobs_reset_backup_org36_20260423`.
  3. Same for `agent_results`, `tasks`, `agent_recommendations`.
  4. `DROP TABLE` each backup.
- Use `knex.raw(sql, [36])` for all org-id bindings.
- Match the file structure of `20260418000000_add_retry_count_to_audit_processes.ts` (imports, exports, jsdoc).

**Files:** `src/database/migrations/20260423000001_reset_pms_data_org_36.ts` (new)
**Depends on:** none
**Verify:** `npx tsc --noEmit` passes; file visible in `knex migrate:list` output as pending.

### T2: Pre-flight dry-run on staging or a prod snapshot
**Do:**
- Take a prod snapshot or restore to a staging DB.
- Run `npm run db:migrate` against that snapshot.
- Query the 4 backup tables: confirm row counts match pre-delete counts.
- Query the 4 live tables: confirm zero rows for org 36.
- Run `npm run db:rollback`: confirm live tables restored to original counts and IDs, backups dropped.
- Hit `/admin/organizations/36` → PMS tab in the staging app; confirm empty state before rollback and original data after.

**Files:** none (operational)
**Depends on:** T1
**Verify:** pre/post row counts match; rollback restores exact IDs and JSONB content (spot-check one `response_log` row for byte equality via checksum).

### T3: Prod execution
**Do:**
- Confirm `DB_NAME` matches prod.
- Confirm no other pending migrations: `SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 5` and diff against `src/database/migrations/` listing. Only this migration should be missing.
- Pre-flight count query against prod: `SELECT COUNT(*) FROM pms_jobs WHERE organization_id = 36`, same for agent_results, tasks, and the agent_recommendations join. Record counts.
- Run `npm run db:migrate` on prod EC2.
- Verify logs show the guard passed, snapshot counts match, deletion counts match.
- Spot-check `/admin/organizations/36` PMS tab shows empty state.
- Leave backup tables in place until the rollback window closes (recommend 7 days).

**Files:** none (operational)
**Depends on:** T2
**Verify:** Manual — logs, DB counts, UI.

### T4: Post-rollback-window cleanup
**Do:**
- After the rollback window (suggest 7 days post-migration), drop the 4 backup tables manually:
  ```sql
  DROP TABLE IF EXISTS public.pms_jobs_reset_backup_org36_20260423;
  DROP TABLE IF EXISTS public.agent_results_reset_backup_org36_20260423;
  DROP TABLE IF EXISTS public.agent_recommendations_reset_backup_org36_20260423;
  DROP TABLE IF EXISTS public.tasks_reset_backup_org36_20260423;
  ```
- Optional: consider deleting this migration file + its `knex_migrations` row from the repo so new env bootstraps don't carry the reset artifact. Separate PR.

**Files:** none (operational; optional follow-up PR)
**Depends on:** T3 + rollback window elapsed
**Verify:** `\dt *reset_backup*` in psql returns nothing.

## Done
- [ ] `src/database/migrations/20260423000001_reset_pms_data_org_36.ts` exists, follows naming convention, passes `npx tsc --noEmit`.
- [ ] Staging dry-run: migrate + rollback produces byte-identical original state (checksum on one `response_log` row).
- [ ] Prod `DB_NAME` guard verified in code.
- [ ] Prod pre-flight counts recorded.
- [ ] Only this migration is pending before prod run.
- [ ] Prod migrate executed; org 36 PMS + analysis data wiped; backups present.
- [ ] Admin UI at `/admin/organizations/36` PMS tab shows empty state.
- [ ] Referral matrix component renders empty state for org 36.
- [ ] No regression: a different org (pick one, e.g., org 1) still shows its PMS data.
- [ ] Rollback window communicated to stakeholders.

## Deviations from CLAUDE.md

- **`migrations/` subfolder contains only `pgsql.sql` + `knexmigration.ts` scaffold, no `mssql.sql`.** User explicitly specified pgsql only; project is postgres-only per `src/database/config.ts`. Noted and accepted.
- **This is a data migration, not a schema migration.** CLAUDE.md says the `migrations/` subfolder is for schema changes. Including it here anyway because the deliverable format IS a knex migration file, and scaffolding it matches user intent.

## Revision Log

### Rev 1 — 2026-04-23 (during T1 execution)

**Change 1:** Migration filename bumped from `20260423000001_reset_pms_data_org_36.ts` to `20260423000002_reset_pms_data_org_36.ts`.
**Reason:** `20260423000001` was already taken by `20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts`. Discovered during `ls src/database/migrations/`.

**Change 2:** Guard pattern changed from hardcoded `PROD_DB_NAME` constant to a dual-env-var opt-in.
- Before: migration file would hardcode the prod DB name as a string constant.
- After: migration requires BOTH `RESET_ORG_36_CONFIRM=true` AND `RESET_ORG_36_DB_NAME=<expected>` to be set at run time, AND `DB_NAME` must equal `RESET_ORG_36_DB_NAME`. Any failing check is a no-op with a clear log.
**Reason:** Safer. No prod DB name leaks into the repo. Any future env bootstrap running `db:migrate` is immune unless the operator explicitly sets both env vars. The `CONFIRM` flag is belt-and-suspenders against accidental invocation.
**Updated Done criteria:** "Prod `DB_NAME` guard verified in code" reinterpreted as "dual env-var guard verified; `RESET_ORG_36_CONFIRM` + `RESET_ORG_36_DB_NAME` both required at prod run time."
