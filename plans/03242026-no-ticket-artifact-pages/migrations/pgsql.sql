-- Artifact Pages: add page_type and artifact_s3_prefix to pages table
-- page_type: 'sections' (default, existing behavior) or 'artifact' (uploaded React app)
-- artifact_s3_prefix: S3 key prefix where the artifact bundle files are stored

ALTER TABLE website_builder.pages
  ADD COLUMN page_type VARCHAR(20) NOT NULL DEFAULT 'sections',
  ADD COLUMN artifact_s3_prefix VARCHAR(500);

-- Index for artifact page lookups (prefix matching in renderer)
CREATE INDEX idx_pages_artifact_lookup
  ON website_builder.pages (project_id, page_type, path)
  WHERE page_type = 'artifact' AND status IN ('published', 'draft');

-- TODO: fill during execution
