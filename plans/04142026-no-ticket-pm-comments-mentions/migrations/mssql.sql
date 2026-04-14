-- MS SQL Server mirror: pm_task_comments + pm_notifications.type CHECK
-- Included for parity per convention; this project runs on Postgres in production.
-- Notes:
--   - MSSQL has no native INTEGER[] type; mentions is modeled as NVARCHAR(MAX)
--     storing a JSON-encoded integer array. Application-level encoding required.

IF OBJECT_ID(N'dbo.pm_task_comments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.pm_task_comments (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    task_id     UNIQUEIDENTIFIER NOT NULL,
    author_id   INT NOT NULL,
    body        NVARCHAR(MAX) NOT NULL,
    mentions    NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    edited_at   DATETIMEOFFSET NULL,
    created_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT FK_pm_task_comments_task
      FOREIGN KEY (task_id) REFERENCES dbo.pm_tasks(id) ON DELETE CASCADE,
    CONSTRAINT CK_pm_task_comments_mentions_json
      CHECK (ISJSON(mentions) = 1)
  );

  CREATE INDEX idx_pm_task_comments_task
    ON dbo.pm_task_comments(task_id, created_at ASC);
END;

-- Extend CHECK constraint on pm_notifications.type
IF EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.pm_notifications')
)
BEGIN
  DECLARE @cname sysname;
  SELECT @cname = name FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.pm_notifications');
  IF @cname IS NOT NULL
    EXEC('ALTER TABLE dbo.pm_notifications DROP CONSTRAINT ' + @cname);
END;

ALTER TABLE dbo.pm_notifications
  ADD CONSTRAINT pm_notifications_type_check
  CHECK (type IN (
    'task_assigned',
    'task_unassigned',
    'assignee_completed_task',
    'mention_in_comment',
    'task_commented'
  ));

-- Rollback
-- ALTER TABLE dbo.pm_notifications DROP CONSTRAINT pm_notifications_type_check;
-- ALTER TABLE dbo.pm_notifications
--   ADD CONSTRAINT pm_notifications_type_check
--   CHECK (type IN ('task_assigned', 'task_unassigned', 'assignee_completed_task'));
-- DROP TABLE IF EXISTS dbo.pm_task_comments;
