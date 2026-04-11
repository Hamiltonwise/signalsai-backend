-- Migration: add Search Position columns to practice_rankings
-- Target: PostgreSQL
-- Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md

-- Up
-- TODO: fill during execution — confirm decimal precision against existing lat/lng usage in src/models
ALTER TABLE practice_rankings
  ADD COLUMN search_position        INTEGER          NULL,
  ADD COLUMN search_query           TEXT             NULL,
  ADD COLUMN search_lat             DECIMAL(10, 7)   NULL,
  ADD COLUMN search_lng             DECIMAL(10, 7)   NULL,
  ADD COLUMN search_radius_meters   INTEGER          NULL,
  ADD COLUMN search_results         JSONB            NULL,
  ADD COLUMN search_checked_at      TIMESTAMPTZ      NULL,
  ADD COLUMN search_status          VARCHAR(32)      NULL;

-- Enum-like constraint on search_status (Revision 1, Gap C)
-- TODO: confirm naming convention matches existing CHECK constraints in the schema
ALTER TABLE practice_rankings
  ADD CONSTRAINT practice_rankings_search_status_check
    CHECK (search_status IS NULL OR search_status IN (
      'ok',
      'not_in_top_20',
      'bias_unavailable',
      'api_error'
    ));

-- Down
-- TODO: fill during execution — match the column list above exactly
ALTER TABLE practice_rankings
  DROP CONSTRAINT IF EXISTS practice_rankings_search_status_check;

ALTER TABLE practice_rankings
  DROP COLUMN IF EXISTS search_status,
  DROP COLUMN IF EXISTS search_checked_at,
  DROP COLUMN IF EXISTS search_results,
  DROP COLUMN IF EXISTS search_radius_meters,
  DROP COLUMN IF EXISTS search_lng,
  DROP COLUMN IF EXISTS search_lat,
  DROP COLUMN IF EXISTS search_query,
  DROP COLUMN IF EXISTS search_position;
