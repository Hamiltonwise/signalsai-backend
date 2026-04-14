-- MS SQL Server mirror: pm_task_attachments
-- Included for parity per convention; this project runs on Postgres in production.

IF OBJECT_ID(N'dbo.pm_task_attachments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.pm_task_attachments (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    task_id       UNIQUEIDENTIFIER NOT NULL,
    uploaded_by   INT NOT NULL,
    filename      NVARCHAR(500) NOT NULL,
    s3_key        NVARCHAR(1000) NOT NULL UNIQUE,
    mime_type     NVARCHAR(100) NOT NULL,
    size_bytes    BIGINT NOT NULL,
    created_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT FK_pm_task_attachments_task
      FOREIGN KEY (task_id) REFERENCES dbo.pm_tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_pm_task_attachments_task
    ON dbo.pm_task_attachments(task_id, created_at DESC);
END;

-- Rollback
-- DROP TABLE IF EXISTS dbo.pm_task_attachments;
