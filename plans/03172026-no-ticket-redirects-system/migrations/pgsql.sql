-- Redirects table for URL redirect management
-- Schema: website_builder

CREATE TABLE IF NOT EXISTS website_builder.redirects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  from_path   TEXT NOT NULL,
  to_path     TEXT NOT NULL,
  type        INTEGER NOT NULL DEFAULT 301 CHECK (type IN (301, 302)),
  is_wildcard BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_redirects_project_from ON website_builder.redirects(project_id, from_path);
CREATE INDEX idx_redirects_project_wildcard ON website_builder.redirects(project_id, is_wildcard);
