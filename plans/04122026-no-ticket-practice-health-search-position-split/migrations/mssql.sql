-- Migration: add Search Position columns to practice_rankings
-- Target: Microsoft SQL Server
-- Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
-- NOTE: Alloro's primary DB is PostgreSQL per CLAUDE.md stack memory. This file
-- is included per the --start convention for DB change plans. Verify during
-- execution whether MSSQL is actually a deployment target; if not, omit this
-- file from the final plan artifacts.

-- Up
-- TODO: fill during execution — MSSQL uses NVARCHAR(MAX) for JSON storage; NVARCHAR(MAX) + ISJSON constraint pattern
ALTER TABLE practice_rankings
  ADD search_position        INT              NULL,
      search_query           NVARCHAR(MAX)    NULL,
      search_lat             DECIMAL(10, 7)   NULL,
      search_lng             DECIMAL(10, 7)   NULL,
      search_radius_meters   INT              NULL,
      search_results         NVARCHAR(MAX)    NULL,
      search_checked_at      DATETIMEOFFSET   NULL,
      search_status          NVARCHAR(32)     NULL;

-- Enum-like constraint on search_status (Revision 1, Gap C)
-- TODO: confirm naming convention matches existing CHECK constraints in the schema
ALTER TABLE practice_rankings
  ADD CONSTRAINT CK_practice_rankings_search_status
    CHECK (search_status IS NULL OR search_status IN (
      'ok',
      'not_in_top_20',
      'bias_unavailable',
      'api_error'
    ));

-- Optional: ensure search_results is valid JSON
-- TODO: confirm if the existing ranking_factors / raw_data columns use this pattern; mirror if so
-- ALTER TABLE practice_rankings
--   ADD CONSTRAINT CK_practice_rankings_search_results_json
--     CHECK (search_results IS NULL OR ISJSON(search_results) = 1);

-- Down
-- TODO: fill during execution
ALTER TABLE practice_rankings
  DROP CONSTRAINT IF EXISTS CK_practice_rankings_search_status;

ALTER TABLE practice_rankings
  DROP COLUMN search_status,
              search_checked_at,
              search_results,
              search_radius_meters,
              search_lng,
              search_lat,
              search_query,
              search_position;
