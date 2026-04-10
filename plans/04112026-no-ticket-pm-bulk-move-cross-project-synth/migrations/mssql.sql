-- =============================================================================
-- PM Tool: is_backlog flag + cross-project AI synth support
-- Target: Microsoft SQL Server
-- Date: 2026-04-11
-- =============================================================================
--
-- NOTE: The PM tool currently targets PostgreSQL in production (see
-- src/database/migrations/*.ts, which use pg-specific features like
-- gen_random_uuid(), partial indexes, and JSONB). This file exists per the
-- /plans convention but is NOT expected to be executed against a live MSSQL
-- database for this feature. It is a translation reference in case the PM
-- tool is ever ported or a parallel MSSQL deployment becomes real.
--
-- If you are running this file, verify first that MSSQL has been set up
-- with the baseline pm_* tables, because those tables currently do not
-- exist in MSSQL schemas.
-- =============================================================================

BEGIN TRANSACTION;

-- -----------------------------------------------------------------------------
-- 1. pm_columns: add is_backlog flag
-- -----------------------------------------------------------------------------
ALTER TABLE pm_columns
  ADD is_backlog BIT NOT NULL CONSTRAINT DF_pm_columns_is_backlog DEFAULT 0;

-- Backfill existing Backlog columns by name.
UPDATE pm_columns
   SET is_backlog = 1
 WHERE name = 'Backlog';

-- Filtered index (MSSQL equivalent of PG partial index).
CREATE NONCLUSTERED INDEX idx_pm_columns_is_backlog
  ON pm_columns (project_id)
  WHERE is_backlog = 1;

-- -----------------------------------------------------------------------------
-- 2. pm_ai_synth_batches: allow NULL project_id for cross-project batches
-- -----------------------------------------------------------------------------
-- MSSQL requires the full column definition when altering nullability.
-- Assumes project_id is UNIQUEIDENTIFIER in the MSSQL schema (UUID analog).
ALTER TABLE pm_ai_synth_batches
  ALTER COLUMN project_id UNIQUEIDENTIFIER NULL;

-- -----------------------------------------------------------------------------
-- 3. pm_ai_synth_batch_tasks: add target_project_id
-- -----------------------------------------------------------------------------
ALTER TABLE pm_ai_synth_batch_tasks
  ADD target_project_id UNIQUEIDENTIFIER NULL;

ALTER TABLE pm_ai_synth_batch_tasks
  ADD CONSTRAINT FK_pm_ai_synth_batch_tasks_target_project
    FOREIGN KEY (target_project_id)
    REFERENCES pm_projects(id)
    ON DELETE SET NULL;

COMMIT TRANSACTION;

-- =============================================================================
-- DOWN (manual rollback)
-- =============================================================================
-- BEGIN TRANSACTION;
--
--   ALTER TABLE pm_ai_synth_batch_tasks
--     DROP CONSTRAINT FK_pm_ai_synth_batch_tasks_target_project;
--   ALTER TABLE pm_ai_synth_batch_tasks
--     DROP COLUMN target_project_id;
--
--   -- Only re-assert NOT NULL if no existing rows violate it
--   IF NOT EXISTS (SELECT 1 FROM pm_ai_synth_batches WHERE project_id IS NULL)
--   BEGIN
--     ALTER TABLE pm_ai_synth_batches
--       ALTER COLUMN project_id UNIQUEIDENTIFIER NOT NULL;
--   END
--   ELSE
--   BEGIN
--     RAISERROR('Cannot restore NOT NULL: cross-project batches exist with NULL project_id. Resolve first.', 16, 1);
--     ROLLBACK;
--     RETURN;
--   END
--
--   DROP INDEX idx_pm_columns_is_backlog ON pm_columns;
--
--   ALTER TABLE pm_columns
--     DROP CONSTRAINT DF_pm_columns_is_backlog;
--   ALTER TABLE pm_columns
--     DROP COLUMN is_backlog;
--
-- COMMIT TRANSACTION;
