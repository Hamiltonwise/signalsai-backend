-- =============================================================================
-- Practice Ranking v2 — User-Curated Competitor Lists
-- Microsoft SQL Server migration script
--
-- NOTE: Project primary database is PostgreSQL (see src/database/config.ts).
-- This MSSQL script exists per CLAUDE.md migrations-folder convention as
-- documentation only — it is NOT applied automatically. Verify whether any
-- environment actually runs it before treating it as authoritative.
--
-- Live source of truth:
--   src/database/migrations/20260428000001_practice_ranking_v2_curated_competitors.ts
--
-- Plan: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
-- =============================================================================

BEGIN TRANSACTION;

-- 1. Drop dead competitor_cache table.
IF OBJECT_ID('dbo.competitor_cache', 'U') IS NOT NULL
  DROP TABLE dbo.competitor_cache;

-- 2. Create location_competitors
CREATE TABLE dbo.location_competitors (
  id BIGINT IDENTITY(1, 1) PRIMARY KEY,
  location_id INT NOT NULL
    CONSTRAINT FK_location_competitors_locations
    FOREIGN KEY REFERENCES dbo.locations(id) ON DELETE CASCADE,
  place_id NVARCHAR(255) NOT NULL,
  name NVARCHAR(255) NOT NULL,
  address NVARCHAR(MAX) NULL,
  primary_type NVARCHAR(100) NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  source NVARCHAR(20) NOT NULL
    CONSTRAINT CK_location_competitors_source
    CHECK (source IN ('initial_scrape', 'user_added')),
  added_at DATETIMEOFFSET NOT NULL
    CONSTRAINT DF_loc_comp_added_at DEFAULT SYSUTCDATETIME(),
  added_by_user_id INT NULL
    CONSTRAINT FK_location_competitors_users
    FOREIGN KEY REFERENCES dbo.users(id),
  removed_at DATETIMEOFFSET NULL,
  created_at DATETIMEOFFSET NOT NULL
    CONSTRAINT DF_loc_comp_created_at DEFAULT SYSUTCDATETIME(),
  updated_at DATETIMEOFFSET NOT NULL
    CONSTRAINT DF_loc_comp_updated_at DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_location_competitors_location_id
  ON dbo.location_competitors(location_id);

-- Filtered unique index: one active row per (location_id, place_id) pair.
CREATE UNIQUE INDEX UQ_location_competitors_active
  ON dbo.location_competitors(location_id, place_id)
  WHERE removed_at IS NULL;

-- 3. Add v2 onboarding columns to locations
ALTER TABLE dbo.locations
  ADD location_competitor_onboarding_status NVARCHAR(20) NOT NULL
    CONSTRAINT DF_loc_comp_onb_status DEFAULT 'pending'
    CONSTRAINT CK_loc_comp_onb_status
    CHECK (location_competitor_onboarding_status IN ('pending', 'curating', 'finalized'));
ALTER TABLE dbo.locations
  ADD location_competitor_onboarding_finalized_at DATETIMEOFFSET NULL;

-- 4. Tag practice_rankings rows with competitor_source; backfill v1 legacy.
ALTER TABLE dbo.practice_rankings
  ADD competitor_source NVARCHAR(30) NULL
    CONSTRAINT CK_practice_rankings_competitor_source
    CHECK (
      competitor_source IS NULL OR competitor_source IN (
        'curated', 'discovered_v2_pending', 'discovered_v1_legacy'
      )
    );

UPDATE dbo.practice_rankings
SET competitor_source = 'discovered_v1_legacy'
WHERE competitor_source IS NULL;

-- 5. Switch Practice Ranking schedule to calendar-aligned cron (1st & 15th UTC).
-- next_run_at sentinel; the worker recomputes via cron-parser on next pickup.
UPDATE dbo.schedules
SET schedule_type = 'cron',
    cron_expression = '0 0 1,15 * *',
    interval_days = NULL,
    timezone = 'UTC',
    next_run_at = DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)),
    updated_at = SYSUTCDATETIME()
WHERE agent_key = 'ranking';

COMMIT TRANSACTION;
