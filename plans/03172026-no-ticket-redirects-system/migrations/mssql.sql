-- Redirects table for URL redirect management
-- Schema: website_builder

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'redirects' AND schema_id = SCHEMA_ID('website_builder'))
BEGIN
  CREATE TABLE website_builder.redirects (
    id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
    from_path   NVARCHAR(500) NOT NULL,
    to_path     NVARCHAR(500) NOT NULL,
    type        INT NOT NULL DEFAULT 301 CHECK (type IN (301, 302)),
    is_wildcard BIT NOT NULL DEFAULT 0,
    created_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );

  CREATE UNIQUE INDEX idx_redirects_project_from ON website_builder.redirects(project_id, from_path);
  CREATE INDEX idx_redirects_project_wildcard ON website_builder.redirects(project_id, is_wildcard);
END;
