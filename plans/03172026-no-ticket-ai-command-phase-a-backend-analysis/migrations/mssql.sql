-- AI Command tables for batch analysis and recommendations
-- Schema: website_builder

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ai_command_batches' AND schema_id = SCHEMA_ID('website_builder'))
BEGIN
  CREATE TABLE website_builder.ai_command_batches (
    id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    project_id    UNIQUEIDENTIFIER NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
    prompt        NVARCHAR(MAX) NOT NULL,
    targets       NVARCHAR(MAX) NOT NULL DEFAULT '{}',
    status        NVARCHAR(20) NOT NULL DEFAULT 'analyzing'
                  CHECK (status IN ('analyzing', 'ready', 'executing', 'completed', 'failed')),
    summary       NVARCHAR(MAX),
    stats         NVARCHAR(MAX) NOT NULL DEFAULT '{"total":0,"pending":0,"approved":0,"rejected":0,"executed":0,"failed":0}',
    created_by    UNIQUEIDENTIFIER,
    created_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ai_command_recommendations' AND schema_id = SCHEMA_ID('website_builder'))
BEGIN
  CREATE TABLE website_builder.ai_command_recommendations (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    batch_id        UNIQUEIDENTIFIER NOT NULL REFERENCES website_builder.ai_command_batches(id) ON DELETE CASCADE,
    target_type     NVARCHAR(20) NOT NULL CHECK (target_type IN ('page_section', 'layout', 'post')),
    target_id       UNIQUEIDENTIFIER NOT NULL,
    target_label    NVARCHAR(500) NOT NULL,
    target_meta     NVARCHAR(MAX) NOT NULL DEFAULT '{}',
    recommendation  NVARCHAR(MAX) NOT NULL,
    instruction     NVARCHAR(MAX) NOT NULL,
    current_html    NVARCHAR(MAX) NOT NULL,
    status          NVARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
    execution_result NVARCHAR(MAX),
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );

  CREATE INDEX idx_ai_cmd_rec_batch ON website_builder.ai_command_recommendations(batch_id);
  CREATE INDEX idx_ai_cmd_rec_batch_status ON website_builder.ai_command_recommendations(batch_id, status);
  CREATE INDEX idx_ai_cmd_rec_target ON website_builder.ai_command_recommendations(target_type, target_id);
END;
