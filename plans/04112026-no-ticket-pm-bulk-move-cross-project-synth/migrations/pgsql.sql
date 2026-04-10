-- =============================================================================
-- PM Tool: is_backlog flag + cross-project AI synth support
-- Target: PostgreSQL (production target — matches knex config)
-- Date: 2026-04-11
-- =============================================================================
--
-- This migration is the primary production migration. The knex variant
-- (knexmigration.js) is the committed form that actually runs; this file
-- exists per the /plans convention so the raw DDL is reviewable alongside
-- the spec. Execution is via `npx knex migrate:latest`, not this file.
--
-- Forward-compatible / additive. Safe under concurrent writes:
--   - ADD COLUMN with DEFAULT is metadata-only on PG ≥ 11 for non-volatile defaults
--   - Backfill is a single UPDATE targeted by indexed column `name`
--   - DROP NOT NULL on pm_ai_synth_batches.project_id is metadata-only
--   - New FK column on pm_ai_synth_batch_tasks is additive
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. pm_columns: add is_backlog flag + partial index
-- -----------------------------------------------------------------------------
ALTER TABLE pm_columns
  ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing Backlog columns by name. This is the ONLY place the
-- legacy name check is tolerated — going forward, all code reads is_backlog.
UPDATE pm_columns
   SET is_backlog = TRUE
 WHERE name = 'Backlog';

-- Partial index for fast "find backlog column for project X" lookups.
-- Only one Backlog column exists per project by convention, so this is tiny.
CREATE INDEX idx_pm_columns_is_backlog
  ON pm_columns (project_id)
  WHERE is_backlog = TRUE;

-- -----------------------------------------------------------------------------
-- 2. pm_ai_synth_batches: allow NULL project_id for cross-project batches
-- -----------------------------------------------------------------------------
ALTER TABLE pm_ai_synth_batches
  ALTER COLUMN project_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. pm_ai_synth_batch_tasks: add target_project_id for cross-project batches
-- -----------------------------------------------------------------------------
ALTER TABLE pm_ai_synth_batch_tasks
  ADD COLUMN target_project_id UUID
    REFERENCES pm_projects(id) ON DELETE SET NULL;

-- Optional index for history queries — skipped for v1 (low cardinality expected).
-- Add later if batch task listings become slow.

COMMIT;

-- =============================================================================
-- DOWN (manual rollback — use with care)
-- =============================================================================
-- BEGIN;
--   ALTER TABLE pm_ai_synth_batch_tasks DROP COLUMN IF EXISTS target_project_id;
--
--   -- Only re-assert NOT NULL if no existing rows violate it
--   DO $$
--   BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pm_ai_synth_batches WHERE project_id IS NULL) THEN
--       ALTER TABLE pm_ai_synth_batches ALTER COLUMN project_id SET NOT NULL;
--     ELSE
--       RAISE EXCEPTION 'Cannot restore NOT NULL: cross-project batches exist with NULL project_id. Resolve first.';
--     END IF;
--   END $$;
--
--   DROP INDEX IF EXISTS idx_pm_columns_is_backlog;
--   ALTER TABLE pm_columns DROP COLUMN IF EXISTS is_backlog;
-- COMMIT;
