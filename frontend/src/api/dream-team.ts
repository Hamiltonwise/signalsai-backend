/**
 * Dream Team API Client (WO16)
 */

import { apiGet, apiPatch, apiPost } from "./index";

export interface DreamTeamNode {
  id: string;
  role_title: string;
  display_name: string | null;
  node_type: "human" | "agent";
  department: string | null;
  parent_id: string | null;
  agent_key: string | null;
  kpi_targets: Array<{ name: string; target: string; unit?: string }>;
  health_status: "green" | "yellow" | "red" | "gray";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResumeEntry {
  id: string;
  node_id: string;
  entry_type: string;
  summary: string;
  created_by: string | null;
  created_at: string;
}

export interface RecentOutput {
  id: number;
  status: string;
  created_at: string;
  summary: string;
}

export interface KpiRow {
  name: string;
  target: string;
  current: string;
  status: string;
}

export async function fetchDreamTeam(): Promise<{ success: boolean; nodes: DreamTeamNode[] }> {
  return apiGet({ path: "/admin/dream-team" });
}

export async function fetchDreamTeamNode(id: string): Promise<{
  success: boolean;
  node: DreamTeamNode;
  resumeEntries: ResumeEntry[];
  recentOutputs: RecentOutput[];
  kpis: KpiRow[];
}> {
  return apiGet({ path: `/admin/dream-team/${id}` });
}

export async function updateDreamTeamNode(
  id: string,
  data: { kpi_targets?: any[]; is_active?: boolean },
): Promise<{ success: boolean; node: DreamTeamNode }> {
  return apiPatch({ path: `/admin/dream-team/${id}`, passedData: data });
}

export async function addResumeNote(
  id: string,
  summary: string,
  created_by?: string,
): Promise<{ success: boolean; entry: ResumeEntry }> {
  return apiPost({ path: `/admin/dream-team/${id}/resume`, passedData: { summary, created_by } });
}
