-- T2a — Unique index on media(project_id, s3_url) so repeat warmups + backfill
-- are idempotent via ON CONFLICT DO NOTHING.

-- TODO: fill during execution
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_project_s3url
  ON website_builder.media (project_id, s3_url)
  WHERE s3_url IS NOT NULL;

-- T2b — Backfill media rows from identity.extracted_assets.images for every
-- existing project. Runs once; re-run is a no-op thanks to the unique index.

-- TODO: fill during execution — pseudo-SQL; real migration uses Knex streaming
-- INSERT INTO website_builder.media (project_id, filename, display_name, s3_key, s3_url, mime_type, file_size, alt_text, compressed, created_at, updated_at)
-- SELECT
--   p.id AS project_id,
--   split_part(img->>'s3_url', '/', -1) AS filename,
--   substr(img->>'description', 1, 255) AS display_name,
--   NULL AS s3_key,
--   img->>'s3_url' AS s3_url,
--   'image/jpeg' AS mime_type,
--   0 AS file_size,
--   img->>'description' AS alt_text,
--   false AS compressed,
--   now(),
--   now()
-- FROM website_builder.projects p,
--      jsonb_array_elements(p.project_identity->'extracted_assets'->'images') AS img
-- WHERE img->>'s3_url' IS NOT NULL
-- ON CONFLICT (project_id, s3_url) DO NOTHING;
