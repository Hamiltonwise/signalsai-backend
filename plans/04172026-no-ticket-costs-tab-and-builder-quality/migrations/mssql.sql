-- T1 — ai_cost_events (MSSQL mirror of pgsql.sql).
-- Note: Alloro runs on Postgres in prod; this exists for parity per CLAUDE.md convention.

-- TODO: fill during execution
CREATE TABLE website_builder.ai_cost_events (
  id                     UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  project_id             UNIQUEIDENTIFIER NULL,
  event_type             NVARCHAR(64) NOT NULL,
  vendor                 NVARCHAR(32) NOT NULL DEFAULT 'anthropic',
  model                  NVARCHAR(128) NOT NULL,
  input_tokens           INT NOT NULL DEFAULT 0,
  output_tokens          INT NOT NULL DEFAULT 0,
  cache_creation_tokens  INT NULL,
  cache_read_tokens      INT NULL,
  estimated_cost_usd     DECIMAL(10,6) NOT NULL DEFAULT 0,
  metadata               NVARCHAR(MAX) NULL, -- JSON as string
  parent_event_id        UNIQUEIDENTIFIER NULL,
  created_at             DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_ai_cost_events_project
    FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_cost_events_parent
    FOREIGN KEY (parent_event_id) REFERENCES website_builder.ai_cost_events(id)
);

CREATE INDEX idx_ai_cost_events_project_created ON website_builder.ai_cost_events (project_id, created_at DESC);
CREATE INDEX idx_ai_cost_events_parent ON website_builder.ai_cost_events (parent_event_id) WHERE parent_event_id IS NOT NULL;
