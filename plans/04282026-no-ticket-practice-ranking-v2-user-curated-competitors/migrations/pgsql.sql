-- =============================================================================
-- Practice Ranking v2 — User-Curated Competitor Lists
-- PostgreSQL migration script
--
-- Live source of truth:
--   src/database/migrations/20260428000001_practice_ranking_v2_curated_competitors.ts
-- This file mirrors that migration for documentation; the Knex migration is
-- what actually runs in any environment.
--
-- Plan: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
-- =============================================================================

BEGIN;

-- 1. Drop dead competitor_cache table (bypassed by location-bias rewrite).
DROP TABLE IF EXISTS competitor_cache;

-- 2. Create location_competitors
CREATE TABLE location_competitors (
  id BIGSERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  place_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  primary_type VARCHAR(100),
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  source VARCHAR(20) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT location_competitors_source_check
    CHECK (source IN ('initial_scrape', 'user_added'))
);

CREATE INDEX idx_location_competitors_location_id
  ON location_competitors(location_id);

-- Partial unique: one active row per (location, place_id); allows historical
-- soft-deleted rows for audit / re-add tracking.
CREATE UNIQUE INDEX uniq_location_competitors_active
  ON location_competitors(location_id, place_id)
  WHERE removed_at IS NULL;

-- 3. Add v2 onboarding columns to locations
ALTER TABLE locations
  ADD COLUMN location_competitor_onboarding_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE locations
  ADD COLUMN location_competitor_onboarding_finalized_at TIMESTAMPTZ;
ALTER TABLE locations
  ADD CONSTRAINT locations_competitor_onboarding_status_check
    CHECK (location_competitor_onboarding_status IN ('pending', 'curating', 'finalized'));

-- 4. Tag practice_rankings rows with competitor_source; backfill v1 legacy.
ALTER TABLE practice_rankings
  ADD COLUMN competitor_source VARCHAR(30);
ALTER TABLE practice_rankings
  ADD CONSTRAINT practice_rankings_competitor_source_check
    CHECK (
      competitor_source IS NULL OR competitor_source IN (
        'curated', 'discovered_v2_pending', 'discovered_v1_legacy'
      )
    );

UPDATE practice_rankings
SET competitor_source = 'discovered_v1_legacy'
WHERE competitor_source IS NULL;

-- 5. Switch the existing Practice Ranking schedule from interval_days=15
--    (drifting) to a calendar-aligned cron on the 1st & 15th UTC.
--    NOTE: next_run_at is computed by cron-parser inside the Knex migration;
--    setting it here to a sentinel; the worker recomputes on next pickup.
UPDATE schedules
SET schedule_type = 'cron',
    cron_expression = '0 0 1,15 * *',
    interval_days = NULL,
    timezone = 'UTC',
    next_run_at = date_trunc('month', now()) + INTERVAL '1 month',
    updated_at = now()
WHERE agent_key = 'ranking';

COMMIT;
