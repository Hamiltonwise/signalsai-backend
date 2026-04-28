/**
 * Pointer to the canonical migration. The plan-folder copy of this
 * file is intentionally kept thin — duplicating ~180 lines into the
 * plan folder adds maintenance burden and zero signal.
 *
 * Canonical location:
 *   src/database/migrations/20260428000010_sweep_stuck_pms_approvals.ts
 *
 * Pattern reference:
 *   src/database/migrations/20260423000002_reset_pms_data_org_36.ts
 *
 * Guards (REQUIRED — both must match or migration is a no-op):
 *   PMS_SWEEP_CONFIRM=true
 *   PMS_SWEEP_DB_NAME=<expected-DB_NAME>  // checked vs process.env.DB_NAME
 *
 * Run order:
 *   1. Deploy code (T1–T3).
 *   2. Set env vars + run knex migrate.
 *   3. Run scripts/pms-restart-stuck-jobs.ts to fire monthly_agents
 *      for each swept job.
 *   4. After 7-day rollback window, drop
 *      pms_jobs_sweep_backup_20260428 via a follow-up cleanup
 *      migration.
 */

export {};
