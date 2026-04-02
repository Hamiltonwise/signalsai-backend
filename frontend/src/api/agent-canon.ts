/**
 * Agent Canon Governance API Client
 */

import { apiGet, apiPatch, apiPost, apiPut } from "./index";

export interface CanonSpec {
  purpose: string;
  expectedBehavior: string;
  constraints: string[];
  owner: string;
}

export type GoldQuestionCategory = "BUG" | "DATA" | "CANON";

export interface GoldQuestion {
  id: string;
  question: string;
  expectedAnswer: string;
  actualAnswer: string | null;
  passed: boolean | null;
  testedAt: string | null;
  category?: GoldQuestionCategory;
}

export interface CanonAgent {
  id: string;
  slug: string;
  display_name: string;
  agent_group: string;
  trust_level: string;
  description: string;
  agent_key: string | null;
  canon_spec: CanonSpec;
  gold_questions: GoldQuestion[];
  gate_verdict: "PASS" | "FAIL" | "PENDING";
  gate_date: string | null;
  gate_expires: string | null;
}

export async function fetchCanonAgents(): Promise<{ success: boolean; agents: CanonAgent[] }> {
  return apiGet({ path: "/admin/agent-canon" });
}

export async function fetchCanonAgent(slug: string): Promise<{ success: boolean; agent: CanonAgent }> {
  return apiGet({ path: `/admin/agent-canon/${slug}` });
}

export async function updateCanonSpec(slug: string, spec: CanonSpec): Promise<{ success: boolean }> {
  return apiPatch({ path: `/admin/agent-canon/${slug}/spec`, passedData: spec });
}

export async function setGoldQuestions(slug: string, questions: GoldQuestion[]): Promise<{ success: boolean }> {
  return apiPut({ path: `/admin/agent-canon/${slug}/gold-questions`, passedData: { questions } });
}

export async function recordQuestionResult(
  slug: string,
  qid: string,
  actualAnswer: string,
  passed: boolean,
): Promise<{ success: boolean }> {
  return apiPatch({
    path: `/admin/agent-canon/${slug}/gold-questions/${qid}`,
    passedData: { actualAnswer, passed },
  });
}

export async function setVerdict(slug: string, verdict: "PASS" | "FAIL"): Promise<{ success: boolean }> {
  return apiPost({ path: `/admin/agent-canon/${slug}/verdict`, passedData: { verdict } });
}

export interface PulseAgent {
  slug: string;
  displayName: string;
  agentKey: string;
  health: "green" | "yellow" | "red" | "gray";
  trustLevel: string;
  gateVerdict: "PASS" | "FAIL" | "PENDING";
  gateExpires: string | null;
  goldQuestionsPassed: number;
  goldQuestionsTotal: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  totalRuns: number;
}

export async function fetchPulse(): Promise<{ success: boolean; pulse: PulseAgent[] }> {
  return apiGet({ path: "/admin/agent-canon/pulse" });
}

export interface SimulationResult {
  agentKey: string;
  success: boolean;
  output: Record<string, unknown>;
  error: string | null;
  durationMs: number;
  goldQuestionResults: Array<{
    id: string;
    question: string;
    expectedAnswer: string;
    actualAnswer: string;
    passed: boolean;
  }>;
}

export async function runSimulation(slug: string): Promise<{ success: boolean; result: SimulationResult }> {
  return apiPost({ path: `/admin/agent-canon/${slug}/simulate`, passedData: {} });
}
