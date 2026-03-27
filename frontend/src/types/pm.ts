export interface PmProject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  deadline: string | null;
  status: "active" | "archived" | "completed";
  created_by: number;
  created_at: string;
  updated_at: string;
  // Computed fields from list endpoint
  total_tasks?: number;
  completed_tasks?: number;
  effective_deadline?: string | null;
  latest_task_deadline?: string | null;
  tasks_by_status?: {
    backlog: number;
    todo: number;
    in_progress: number;
    done: number;
  };
  daily_activity?: Array<{ date: string; count: number }>;
}

export interface PmColumn {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_hidden: boolean;
  tasks: PmTask[];
}

export interface PmTask {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3" | "P4" | "P5" | null;
  deadline: string | null;
  position: number;
  assigned_to: number | null;
  created_by: number;
  completed_at: string | null;
  source: "manual" | "ai_synth";
  created_at: string;
  updated_at: string;
}

export interface PmProjectDetail extends PmProject {
  columns: PmColumn[];
}

export interface PmActivityEntry {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: number;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: { id: number; display_name: string; email: string };
  project?: { id: string; name: string; color: string };
  task?: { id: string; title: string };
}

export interface PmStats {
  focus_today: { count: number; subtitle: string; severity: "green" | "amber" | "red" };
  this_week: { count: number; subtitle: string };
  backlog: { count: number; subtitle: string; severity: "normal" | "amber" };
}

export interface PmVelocityData {
  completed_total: number;
  overdue_total: number;
  data: Array<{ label: string; period_start: string; completed: number; overdue: number }>;
}

export interface PmDailyBrief {
  id: string;
  brief_date: string;
  summary_html: string | null;
  tasks_completed_yesterday: number;
  tasks_overdue: number;
  tasks_due_today: number;
  recommended_tasks: Array<{ task_id: string; title: string; reason: string }> | null;
  generated_at: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  deadline?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: "P1" | "P2" | "P3" | "P4" | "P5";
  deadline?: string;
  column_id: string;
  assigned_to?: number;
  source?: "manual" | "ai_synth";
}

export interface PmAiSynthBatch {
  id: string;
  project_id: string;
  source_text: string;
  source_filename: string | null;
  status: "synthesizing" | "pending_review" | "completed";
  total_proposed: number;
  total_approved: number;
  total_rejected: number;
  created_by: number;
  created_at: string;
  tasks?: PmAiSynthBatchTask[];
}

export interface PmAiSynthBatchTask {
  id: string;
  batch_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3";
  deadline_hint: string | null;
  status: "pending" | "approved" | "rejected";
  created_task_id: string | null;
  created_at: string;
}
