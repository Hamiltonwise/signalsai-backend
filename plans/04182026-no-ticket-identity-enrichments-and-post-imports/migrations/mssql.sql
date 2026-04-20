-- F1 — multi-location columns on projects (MSSQL mirror).
-- MSSQL has no native TEXT[]; use NVARCHAR(MAX) holding JSON-encoded array.
-- Alloro runs on Postgres in prod; this exists for parity.

-- TODO: fill during execution
IF COL_LENGTH('website_builder.projects', 'selected_place_ids') IS NULL
  ALTER TABLE website_builder.projects ADD selected_place_ids NVARCHAR(MAX) NOT NULL DEFAULT '[]';
IF COL_LENGTH('website_builder.projects', 'primary_place_id') IS NULL
  ALTER TABLE website_builder.projects ADD primary_place_id NVARCHAR(MAX) NULL;

UPDATE website_builder.projects
  SET selected_place_ids = '["' + selected_place_id + '"]',
      primary_place_id = selected_place_id
  WHERE selected_place_id IS NOT NULL AND selected_place_ids = '[]';

-- T8 — add source_url to posts (MSSQL mirror).
IF COL_LENGTH('website_builder.posts', 'source_url') IS NULL
  ALTER TABLE website_builder.posts ADD source_url NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_posts_project_type_source')
CREATE UNIQUE INDEX idx_posts_project_type_source
  ON website_builder.posts (project_id, post_type_id, source_url)
  WHERE source_url IS NOT NULL;
