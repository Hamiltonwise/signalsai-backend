-- PostgreSQL migration: pm_task_attachments
-- Run as part of the knex migration; this mirror exists for manual/admin use.

CREATE TABLE IF NOT EXISTS pm_task_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  uploaded_by   INTEGER NOT NULL,
  filename      VARCHAR(500) NOT NULL,
  s3_key        VARCHAR(1000) NOT NULL UNIQUE,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_task
  ON pm_task_attachments(task_id, created_at DESC);

-- Rollback
-- DROP TABLE IF EXISTS pm_task_attachments;
