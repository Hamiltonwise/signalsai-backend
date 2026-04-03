-- pm_notifications table (MSSQL)
CREATE TABLE pm_notifications (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('task_assigned', 'task_unassigned', 'assignee_completed_task')),
  task_id UNIQUEIDENTIFIER NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  actor_user_id INT NOT NULL,
  metadata NVARCHAR(MAX) NULL,  -- JSON stored as nvarchar
  is_read BIT NOT NULL DEFAULT 0,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE INDEX idx_pm_notifications_user_feed
  ON pm_notifications (user_id, is_read, created_at DESC);
