/**
 * Admin Schedules API
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./index";

export interface Schedule {
  id: number;
  agent_key: string;
  display_name: string;
  description: string | null;
  schedule_type: "cron" | "interval_days";
  cron_expression: string | null;
  interval_days: number | null;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  latest_run: ScheduleRun | null;
}

export interface ScheduleRun {
  id: number;
  schedule_id: number;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export interface RegistryAgent {
  key: string;
  displayName: string;
  description: string;
}

const BASE = "/admin/schedules";

export async function fetchSchedules(): Promise<Schedule[]> {
  const res = await apiGet({ path: BASE });
  return res.data;
}

export async function fetchRegistry(): Promise<RegistryAgent[]> {
  const res = await apiGet({ path: `${BASE}/registry` });
  return res.data;
}

export async function fetchServerTime(): Promise<string> {
  const res = await apiGet({ path: `${BASE}/server-time` });
  return res.data.serverTime;
}

export async function fetchScheduleRuns(
  scheduleId: number,
  limit = 20,
  offset = 0,
): Promise<{ runs: ScheduleRun[]; total: number }> {
  const res = await apiGet({ path: `${BASE}/${scheduleId}/runs?limit=${limit}&offset=${offset}` });
  return { runs: res.data, total: res.total };
}

export async function createSchedule(data: {
  agent_key: string;
  display_name: string;
  description?: string;
  schedule_type: "cron" | "interval_days";
  cron_expression?: string;
  interval_days?: number;
  timezone?: string;
  enabled?: boolean;
}): Promise<Schedule> {
  const res = await apiPost({ path: BASE, passedData: data });
  return res.data;
}

export async function updateSchedule(
  id: number,
  data: Partial<{
    display_name: string;
    description: string;
    schedule_type: "cron" | "interval_days";
    cron_expression: string;
    interval_days: number;
    timezone: string;
    enabled: boolean;
  }>,
): Promise<Schedule> {
  const res = await apiPatch({ path: `${BASE}/${id}`, passedData: data });
  return res.data;
}

export async function deleteSchedule(id: number): Promise<void> {
  await apiDelete({ path: `${BASE}/${id}` });
}

export async function triggerScheduleRun(id: number): Promise<{ runId: number; message: string }> {
  const res = await apiPost({ path: `${BASE}/${id}/run`, passedData: {} });
  return res.data;
}
