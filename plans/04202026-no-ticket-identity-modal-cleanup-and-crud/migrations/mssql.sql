-- T2a — Unique index on media(project_id, s3_url) (MSSQL mirror).
-- Alloro runs on Postgres in prod; this exists for parity per CLAUDE.md.

-- TODO: fill during execution
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_media_project_s3url')
CREATE UNIQUE INDEX idx_media_project_s3url
  ON website_builder.media (project_id, s3_url)
  WHERE s3_url IS NOT NULL;

-- T2b — Backfill. MSSQL JSONB-equivalent would need OPENJSON(); omit for now
-- since Alloro is Postgres-only in prod.
