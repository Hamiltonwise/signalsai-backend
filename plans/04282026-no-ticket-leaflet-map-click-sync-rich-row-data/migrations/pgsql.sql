-- =============================================================================
-- Curate Page — photo_name column on location_competitors (PostgreSQL)
-- Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
--
-- Adds: location_competitors.photo_name — Google Places photo resource name
--   (e.g. "places/ChIJ.../photos/AdDdOWp..."). Used by the curate UI to render
--   thumbnails via the authed photo proxy at /api/practice-ranking/photo.
-- =============================================================================

-- TODO: fill during execution

ALTER TABLE location_competitors
  ADD COLUMN photo_name VARCHAR(500) NULL;
