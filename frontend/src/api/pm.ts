import axios from "axios";
import { apiGet, apiPost, apiPut, apiDelete } from "./index";
import { getPriorityItem } from "../hooks/useLocalStorage";
import type {
  PmProject,
  PmProjectDetail,
  PmTask,
  PmStats,
  PmMyStats,
  PmMyTasksResponse,
  PmNotification,
  PmActivityEntry,
  CreateProjectInput,
  CreateTaskInput,
  PmAiSynthBatch,
  PmAiSynthBatchTask,
  PmTaskAttachment,
  PmTaskComment,
  PmVelocityData,
  ChartDataResponse,
} from "../types/pm";

const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env
    ?.VITE_API_URL ?? "/api";

function getAuthHeader(): Record<string, string> {
  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));
  const jwt = isPilot
    ? window.sessionStorage.getItem("token")
    : getPriorityItem("auth_token") || getPriorityItem("token");
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

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

// --- Bulk task operations ---

export async function bulkMoveTasksToProject(
  taskIds: string[],
  targetProjectId: string
): Promise<{ moved_task_ids: string[] }> {
  const res = await apiPost({
    path: "/pm/tasks/bulk/move-to-project",
    passedData: { task_ids: taskIds, target_project_id: targetProjectId },
  });
  return res.data;
}

export async function bulkDeleteTasks(
  taskIds: string[]
): Promise<{ deleted_count: number }> {
  const res = await apiPost({
    path: "/pm/tasks/bulk/delete",
    passedData: { task_ids: taskIds },
  });
  return res.data;
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

export async function getChartData(): Promise<ChartDataResponse> {
  const res = await apiGet({ path: "/pm/stats/chart-data" });
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

// --- Users ---

export async function fetchPmUsers(): Promise<
  Array<{ id: number; display_name: string; email: string }>
> {
  const res = await apiGet({ path: "/pm/users" });
  return res.data;
}

// --- ME tab ---

export async function fetchMyStats(): Promise<PmMyStats> {
  const res = await apiGet({ path: "/pm/stats/me" });
  return res.data;
}

export async function fetchMyVelocity(range: "7d" | "4w" | "3m" = "7d"): Promise<PmVelocityData> {
  const res = await apiGet({ path: `/pm/stats/velocity/me?range=${range}` });
  return res.data;
}

export async function fetchMyTasks(): Promise<PmMyTasksResponse> {
  const res = await apiGet({ path: "/pm/tasks/mine" });
  return res.data;
}

// --- Notifications ---

export async function fetchNotifications(): Promise<PmNotification[]> {
  const res = await apiGet({ path: "/pm/notifications" });
  return res.data;
}

export async function markNotificationsRead(): Promise<void> {
  await apiPut({ path: "/pm/notifications/read-all", passedData: {} });
}

export async function deleteAllNotifications(): Promise<void> {
  await apiDelete({ path: "/pm/notifications" });
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
    formData.append("scope", "project");
    formData.append("file", file);
    const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: formData });
    return res.data;
  }
  const res = await apiPost({
    path: "/pm/ai-synth/extract",
    passedData: { project_id: projectId, scope: "project", text },
  });
  return res.data;
}

export async function extractCrossProjectBatch(
  text?: string,
  file?: File
): Promise<PmAiSynthBatch> {
  if (file) {
    const formData = new FormData();
    formData.append("scope", "cross_project");
    formData.append("file", file);
    const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: formData });
    return res.data;
  }
  const res = await apiPost({
    path: "/pm/ai-synth/extract",
    passedData: { scope: "cross_project", text },
  });
  return res.data;
}

export async function fetchCrossProjectBatches(
  limit = 20,
  offset = 0
): Promise<{ data: PmAiSynthBatch[]; total: number }> {
  const res = await apiGet({
    path: `/pm/ai-synth/batches/cross-project?limit=${limit}&offset=${offset}`,
  });
  return res;
}

export async function setBatchTaskTargetProject(
  batchId: string,
  taskId: string,
  targetProjectId: string
): Promise<PmAiSynthBatchTask> {
  const res = await apiPut({
    path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/target-project`,
    passedData: { target_project_id: targetProjectId },
  });
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

// --- Task Attachments ---

export async function listAttachments(
  taskId: string
): Promise<PmTaskAttachment[]> {
  const res = await apiGet({ path: `/pm/tasks/${taskId}/attachments` });
  return res?.data?.attachments ?? [];
}

/**
 * Upload a single file to a task.
 *
 * Uses axios directly (bypassing apiPost) so callers can observe upload
 * progress via `onProgress(0..1)` for large files.
 */
export async function uploadAttachment(
  taskId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<PmTaskAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await axios.post(
    `${API_BASE}/pm/tasks/${taskId}/attachments`,
    formData,
    {
      headers: getAuthHeader(),
      onUploadProgress: (evt) => {
        if (!onProgress) return;
        const total = evt.total ?? file.size;
        if (!total) return;
        const pct = Math.min(1, (evt.loaded || 0) / total);
        onProgress(pct);
      },
    }
  );
  return data.data as PmTaskAttachment;
}

export async function getAttachmentDownloadUrl(
  taskId: string,
  attachmentId: string,
  opts?: { forceDownload?: boolean }
): Promise<{ url: string; expires_at: string }> {
  const qs = opts?.forceDownload ? "?download=1" : "";
  const res = await apiGet({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}/url${qs}`,
  });
  return res.data;
}

export async function getAttachmentTextContent(
  taskId: string,
  attachmentId: string
): Promise<{ text: string; truncated: boolean; total_bytes: number }> {
  const res = await apiGet({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}/text`,
  });
  return res.data;
}

export async function deleteAttachment(
  taskId: string,
  attachmentId: string
): Promise<void> {
  await apiDelete({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}`,
  });
}

// --- Task Comments ---

export async function listComments(taskId: string): Promise<PmTaskComment[]> {
  const res = await apiGet({ path: `/pm/tasks/${taskId}/comments` });
  return res?.data?.comments ?? [];
}

export async function createComment(
  taskId: string,
  body: string,
  mentions: number[]
): Promise<PmTaskComment> {
  const res = await apiPost({
    path: `/pm/tasks/${taskId}/comments`,
    passedData: { body, mentions },
  });
  return res.data;
}

export async function updateComment(
  taskId: string,
  commentId: string,
  body: string,
  mentions: number[]
): Promise<PmTaskComment> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/comments/${commentId}`,
    passedData: { body, mentions },
  });
  return res.data;
}

export async function deleteComment(
  taskId: string,
  commentId: string
): Promise<void> {
  await apiDelete({
    path: `/pm/tasks/${taskId}/comments/${commentId}`,
  });
}
