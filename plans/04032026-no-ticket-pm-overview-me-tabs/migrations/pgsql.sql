-- pm_notifications table
CREATE TABLE pm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('task_assigned', 'task_unassigned', 'assignee_completed_task')),
  task_id UUID REFERENCES pm_tasks(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pm_notifications_user_feed
  ON pm_notifications (user_id, is_read, created_at DESC);
