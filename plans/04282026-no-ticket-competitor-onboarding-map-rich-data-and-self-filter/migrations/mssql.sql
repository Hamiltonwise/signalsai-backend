-- =============================================================================
-- Practice Ranking v2 — Self-filter cache + rich competitor fields (MSSQL)
-- Spec: plans/04282026-no-ticket-competitor-onboarding-map-rich-data-and-self-filter/spec.md
--
-- Adds:
--   1. locations.client_place_id, client_lat, client_lng — cached identifiers
--      for the practice itself.
--   2. location_competitors.phone, location_competitors.website — captured
--      from existing Places API payloads.
-- =============================================================================

-- TODO: fill during execution

ALTER TABLE locations
  ADD client_place_id NVARCHAR(255) NULL,
      client_lat DECIMAL(10, 7) NULL,
      client_lng DECIMAL(10, 7) NULL;

ALTER TABLE location_competitors
  ADD phone NVARCHAR(50) NULL,
      website NVARCHAR(MAX) NULL;
