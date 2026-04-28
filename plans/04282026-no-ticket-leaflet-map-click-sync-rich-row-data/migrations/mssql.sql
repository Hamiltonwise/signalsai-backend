-- =============================================================================
-- Curate Page — photo_name column on location_competitors (MSSQL)
-- Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
-- =============================================================================

-- TODO: fill during execution

ALTER TABLE location_competitors
  ADD photo_name NVARCHAR(500) NULL;
