-- PM Module Database Schema
-- All tables use pm_ prefix in public schema

-- 1. Updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION pm_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. pm_projects
CREATE TABLE pm_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#D66853',
  icon VARCHAR(50) DEFAULT 'folder',
  deadline TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER pm_projects_updated_at
  BEFORE UPDATE ON pm_projects
  FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();

-- 3. pm_columns
CREATE TABLE pm_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  position INTEGER NOT NULL,
  is_hidden BOOLEAN DEFAULT FALSE
);

-- 4. pm_tasks
CREATE TABLE pm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES pm_columns(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority VARCHAR(5) DEFAULT 'P3',
  deadline TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  assigned_to UUID,
  created_by UUID,
  completed_at TIMESTAMPTZ,
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER pm_tasks_updated_at
  BEFORE UPDATE ON pm_tasks
  FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();

-- 5. pm_activity_log
CREATE TABLE pm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  task_id UUID,
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. pm_daily_briefs
CREATE TABLE pm_daily_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date DATE NOT NULL UNIQUE,
  summary_html TEXT,
  tasks_completed_yesterday INTEGER,
  tasks_overdue INTEGER,
  tasks_due_today INTEGER,
  recommended_tasks JSONB,
  generated_at TIMESTAMPTZ
);

-- 7. Indexes
CREATE INDEX idx_pm_tasks_board ON pm_tasks(project_id, column_id, position);
CREATE INDEX idx_pm_tasks_user_deadline ON pm_tasks(assigned_to, deadline);
CREATE INDEX idx_pm_tasks_upcoming ON pm_tasks(deadline) WHERE completed_at IS NULL;
CREATE INDEX idx_pm_activity_feed ON pm_activity_log(project_id, created_at DESC);
CREATE INDEX idx_pm_briefs_date ON pm_daily_briefs(brief_date DESC);
