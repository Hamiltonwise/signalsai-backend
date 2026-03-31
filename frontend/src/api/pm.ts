import { apiGet, apiPost, apiPut, apiDelete } from "./index";
import type {
  PmProject,
  PmProjectDetail,
  PmTask,
  PmStats,
  PmActivityEntry,
  PmDailyBrief,
  CreateProjectInput,
  CreateTaskInput,
  PmAiSynthBatch,
  PmVelocityData,
} from "../types/pm";

// --- Projects ---

export async function fetchProjects(
  status: string = "active"
): Promise<PmProject[]> {
  const res = await apiGet({ path: `/pm/projects?status=${status}` });
  return res.data;
}

export async function fetchProject(id: string): Promise<PmProjectDetail> {
  const res = await apiGet({ path: `/pm/projects/${id}` });
  return res.data;
}

export async function createProject(
  data: CreateProjectInput
): Promise<PmProject> {
  const res = await apiPost({ path: "/pm/projects", passedData: data });
  return res.data;
}

export async function updateProject(
  id: string,
  data: Partial<PmProject>
): Promise<PmProject> {
  const res = await apiPut({ path: `/pm/projects/${id}`, passedData: data });
  return res.data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiDelete({ path: `/pm/projects/${id}` });
}

export async function archiveProject(id: string): Promise<PmProject> {
  const res = await apiPut({ path: `/pm/projects/${id}/archive`, passedData: {} });
  return res.data;
}

// --- Tasks ---

export async function createTask(
  projectId: string,
  data: CreateTaskInput
): Promise<PmTask> {
  const res = await apiPost({ path: `/pm/projects/${projectId}/tasks`, passedData: data });
  return res.data;
}

export async function updateTask(
  taskId: string,
  data: Partial<PmTask>
): Promise<PmTask> {
  const res = await apiPut({ path: `/pm/tasks/${taskId}`, passedData: data });
  return res.data;
}

export async function moveTask(
  taskId: string,
  columnId: string,
  position: number
): Promise<PmTask> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/move`,
    passedData: {
      column_id: columnId,
      position,
    },
  });
  return res.data;
}

export async function assignTask(
  taskId: string,
  assignedTo: number | null
): Promise<PmTask> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/assign`,
    passedData: {
      assigned_to: assignedTo,
    },
  });
  return res.data;
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiDelete({ path: `/pm/tasks/${taskId}` });
}

// --- Stats ---

export async function fetchStats(): Promise<PmStats> {
  const res = await apiGet({ path: "/pm/stats" });
  return res.data;
}

export async function fetchVelocity(range: "7d" | "4w" | "3m" = "7d"): Promise<PmVelocityData> {
  const res = await apiGet({ path: `/pm/stats/velocity?range=${range}` });
  return res.data;
}

// --- Activity ---

export async function fetchGlobalActivity(
  limit: number = 20,
  offset: number = 0
): Promise<{ data: PmActivityEntry[]; total: number }> {
  const res = await apiGet({
    path: `/pm/activity?limit=${limit}&offset=${offset}`,
  });
  return res;
}

export async function fetchProjectActivity(
  projectId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ data: PmActivityEntry[]; total: number }> {
  const res = await apiGet({
    path: `/pm/activity/projects/${projectId}/activity?limit=${limit}&offset=${offset}`,
  });
  return res;
}

export async function clearActivity(): Promise<void> {
  await apiDelete({ path: "/pm/activity" });
}

// --- Daily Brief ---

export async function fetchLatestBrief(): Promise<PmDailyBrief | null> {
  const res = await apiGet({ path: "/pm/daily-brief" });
  return res.data;
}

export async function fetchBriefHistory(
  limit: number = 10,
  offset: number = 0
): Promise<{ data: PmDailyBrief[]; total: number }> {
  const res = await apiGet({
    path: `/pm/daily-brief/history?limit=${limit}&offset=${offset}`,
  });
  return res;
}

// --- Users ---

export async function fetchPmUsers(): Promise<
  Array<{ id: number; display_name: string; email: string }>
> {
  const res = await apiGet({ path: "/pm/users" });
  return res.data;
}

// --- AI Synth Batches ---

export async function extractBatch(
  projectId: string,
  text?: string,
  file?: File
): Promise<PmAiSynthBatch> {
  if (file) {
    const formData = new FormData();
    formData.append("project_id", projectId);
    formData.append("file", file);
    const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: formData });
    return res.data;
  }
  const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: { project_id: projectId, text } });
  return res.data;
}

export async function fetchBatches(
  projectId: string,
  limit = 20,
  offset = 0
): Promise<{ data: PmAiSynthBatch[]; total: number }> {
  const res = await apiGet({ path: `/pm/ai-synth/batches?project_id=${projectId}&limit=${limit}&offset=${offset}` });
  return res;
}

export async function fetchBatch(batchId: string): Promise<PmAiSynthBatch> {
  const res = await apiGet({ path: `/pm/ai-synth/batches/${batchId}` });
  return res.data;
}

export async function approveBatchTask(batchId: string, taskId: string): Promise<any> {
  const res = await apiPut({ path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/approve`, passedData: {} });
  return res.data;
}

export async function rejectBatchTask(batchId: string, taskId: string): Promise<any> {
  const res = await apiPut({ path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/reject`, passedData: {} });
  return res.data;
}

export async function deleteBatch(batchId: string): Promise<void> {
  await apiDelete({ path: `/pm/ai-synth/batches/${batchId}` });
}
