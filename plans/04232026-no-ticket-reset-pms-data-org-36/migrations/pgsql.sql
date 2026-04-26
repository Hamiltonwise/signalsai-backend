-- Reset PMS + analysis data for organization_id = 36
-- Postgres-only. Wrapped in a single transaction.
-- This file is a REFERENCE for the knex migration — it is not executed directly.
-- The executable artifact is: src/database/migrations/20260423000001_reset_pms_data_org_36.ts
--
-- Usage (manual, for emergency / inspection only):
--   BEGIN;
--   \i pgsql.sql
--   -- verify counts, then either:
--   COMMIT;
--   -- or
--   ROLLBACK;

BEGIN;

-- ============================================================
-- UP — Snapshot then delete
-- ============================================================

-- 1. Snapshot tables (preserves original rows for rollback)
CREATE TABLE public.pms_jobs_reset_backup_org36_20260423 AS
  SELECT * FROM public.pms_jobs WHERE organization_id = 36;

CREATE TABLE public.agent_results_reset_backup_org36_20260423 AS
  SELECT * FROM public.agent_results WHERE organization_id = 36;

CREATE TABLE public.tasks_reset_backup_org36_20260423 AS
  SELECT * FROM public.tasks WHERE organization_id = 36;

-- agent_recommendations has no organization_id — reach it via agent_results
CREATE TABLE public.agent_recommendations_reset_backup_org36_20260423 AS
  SELECT ar.*
  FROM public.agent_recommendations ar
  JOIN public.agent_results r ON ar.agent_result_id = r.id
  WHERE r.organization_id = 36;

-- 2. Delete in FK-safe order
-- agent_recommendations first (no ON DELETE CASCADE from agent_results)
DELETE FROM public.agent_recommendations
WHERE agent_result_id IN (
  SELECT id FROM public.agent_results WHERE organization_id = 36
);

DELETE FROM public.agent_results  WHERE organization_id = 36;
DELETE FROM public.tasks          WHERE organization_id = 36;
DELETE FROM public.pms_jobs       WHERE organization_id = 36;

-- 3. Verification
-- SELECT 'pms_jobs'           AS t, COUNT(*) AS remaining FROM public.pms_jobs        WHERE organization_id = 36
-- UNION ALL SELECT 'agent_results',      COUNT(*) FROM public.agent_results           WHERE organization_id = 36
-- UNION ALL SELECT 'tasks',              COUNT(*) FROM public.tasks                   WHERE organization_id = 36
-- UNION ALL SELECT 'agent_recommendations', COUNT(*)
--   FROM public.agent_recommendations ar
--   JOIN public.agent_results r ON ar.agent_result_id = r.id
--   WHERE r.organization_id = 36;

COMMIT;

-- ============================================================
-- DOWN — Restore from snapshot, then drop snapshots
-- Run only if you need to revert.
-- ============================================================
--
-- BEGIN;
--
-- -- Guard: organization must still exist (FKs will violate otherwise)
-- -- SELECT 1 FROM public.organizations WHERE id = 36;
--
-- INSERT INTO public.pms_jobs              SELECT * FROM public.pms_jobs_reset_backup_org36_20260423;
-- INSERT INTO public.agent_results         SELECT * FROM public.agent_results_reset_backup_org36_20260423;
-- INSERT INTO public.tasks                 SELECT * FROM public.tasks_reset_backup_org36_20260423;
-- INSERT INTO public.agent_recommendations SELECT * FROM public.agent_recommendations_reset_backup_org36_20260423;
--
-- DROP TABLE public.pms_jobs_reset_backup_org36_20260423;
-- DROP TABLE public.agent_results_reset_backup_org36_20260423;
-- DROP TABLE public.tasks_reset_backup_org36_20260423;
-- DROP TABLE public.agent_recommendations_reset_backup_org36_20260423;
--
-- COMMIT;
