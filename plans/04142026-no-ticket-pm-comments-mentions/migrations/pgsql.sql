-- PostgreSQL migration: pm_task_comments + extend pm_notifications.type CHECK
-- Run via knex; this mirror exists for manual/admin use.

-- (a) pm_task_comments
CREATE TABLE IF NOT EXISTS pm_task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL,
  body        TEXT NOT NULL,
  mentions    INTEGER[] NOT NULL DEFAULT '{}',
  edited_at   TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER pm_task_comments_updated_at
  BEFORE UPDATE ON pm_task_comments
  FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();

CREATE INDEX IF NOT EXISTS idx_pm_task_comments_task
  ON pm_task_comments(task_id, created_at ASC);

-- (b) Extend the CHECK constraint on pm_notifications.type
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
   WHERE r.relname = 'pm_notifications'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%type%'
   LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pm_notifications DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE pm_notifications
  ADD CONSTRAINT pm_notifications_type_check
  CHECK (type IN (
    'task_assigned',
    'task_unassigned',
    'assignee_completed_task',
    'mention_in_comment',
    'task_commented'
  ));

-- Rollback
-- ALTER TABLE pm_notifications DROP CONSTRAINT IF EXISTS pm_notifications_type_check;
-- ALTER TABLE pm_notifications
--   ADD CONSTRAINT pm_notifications_type_check
--   CHECK (type IN ('task_assigned', 'task_unassigned', 'assignee_completed_task'));
-- DROP TRIGGER IF EXISTS pm_task_comments_updated_at ON pm_task_comments;
-- DROP TABLE IF EXISTS pm_task_comments;
