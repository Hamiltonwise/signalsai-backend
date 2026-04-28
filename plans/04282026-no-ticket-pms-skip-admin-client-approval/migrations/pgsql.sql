-- =====================================================================
-- One-shot recovery: unstick PMS jobs trapped in admin/client approval.
--
-- Direct-execution variant (Postgres). The canonical artifact is the
-- knex migration at:
--   src/database/migrations/20260428000010_sweep_stuck_pms_approvals.ts
-- This .sql exists for emergency manual application and for review.
--
-- GUARDS: this script does NOT enforce env-var guards. Run only against
-- a DB you have explicitly confirmed by name. Prefer the knex
-- migration, which enforces guards programmatically.
--
-- Match condition (canonical):
--   is_approved = false
--   AND automation_status_detail->>'currentStep' IN
--       ('admin_approval', 'client_approval')
-- =====================================================================

BEGIN;

-- 1. Pre-counts.
SELECT 'matched' AS bucket, COUNT(*) AS rows
FROM public.pms_jobs
WHERE is_approved = false
  AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval')
UNION ALL
SELECT 'null_status', COUNT(*)
FROM public.pms_jobs
WHERE is_approved = false
  AND automation_status_detail IS NULL;

-- 2. Snapshot matched rows.
CREATE TABLE public.pms_jobs_sweep_backup_20260428 AS
SELECT * FROM public.pms_jobs
WHERE is_approved = false
  AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval');

-- 3. Verify snapshot count matches.
SELECT
  (SELECT COUNT(*) FROM public.pms_jobs_sweep_backup_20260428) AS snapshot,
  (SELECT COUNT(*) FROM public.pms_jobs
   WHERE is_approved = false
     AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval')) AS matched;
-- ABORT if these two values differ.

-- 4. Apply the unstuck update.
UPDATE public.pms_jobs
SET is_approved = true,
    is_client_approved = true,
    status = 'approved',
    automation_status_detail = jsonb_set(
      jsonb_set(
        automation_status_detail,
        '{steps,admin_approval,status}', '"skipped"'::jsonb
      ),
      '{steps,client_approval,status}', '"skipped"'::jsonb
    )
WHERE id IN (SELECT id FROM public.pms_jobs_sweep_backup_20260428);

-- 5. Post-mutation verification (must return 0).
SELECT COUNT(*) AS still_unapproved
FROM public.pms_jobs
WHERE id IN (SELECT id FROM public.pms_jobs_sweep_backup_20260428)
  AND is_approved = false;

-- 6. Commit only if step 5 returned 0.
COMMIT;
-- ROLLBACK; -- uncomment instead of COMMIT to abort.

-- =====================================================================
-- DOWN (rollback) — if you need to revert after commit:
-- =====================================================================
-- BEGIN;
-- UPDATE public.pms_jobs t
-- SET is_approved = b.is_approved,
--     is_client_approved = b.is_client_approved,
--     status = b.status,
--     automation_status_detail = b.automation_status_detail
-- FROM public.pms_jobs_sweep_backup_20260428 b
-- WHERE t.id = b.id;
-- DROP TABLE public.pms_jobs_sweep_backup_20260428;
-- COMMIT;
