-- =============================================================================
-- Practice Ranking v2 — Self-filter cache + rich competitor fields (PostgreSQL)
-- Spec: plans/04282026-no-ticket-competitor-onboarding-map-rich-data-and-self-filter/spec.md
--
-- Adds:
--   1. locations.client_place_id, client_lat, client_lng — cached identifiers
--      for the practice itself, used to filter the practice out of its own
--      curated competitor list.
--   2. location_competitors.phone, location_competitors.website — captured
--      from existing Places API payloads to enrich the curate-page rows.
-- =============================================================================

-- TODO: fill during execution

ALTER TABLE locations
  ADD COLUMN client_place_id VARCHAR(255) NULL,
  ADD COLUMN client_lat NUMERIC(10, 7) NULL,
  ADD COLUMN client_lng NUMERIC(10, 7) NULL;

ALTER TABLE location_competitors
  ADD COLUMN phone VARCHAR(50) NULL,
  ADD COLUMN website TEXT NULL;
