/**
 * TypeScript interfaces for Agent data structures
 */

export interface ProoflineAgentData {
  title: string;
  proof_type: string;
  explanation: string;
  value_change?: number | string;
  metric_signal?: string;
  source_type?: string;
  citations?: string[];
  [key: string]: unknown;
}

export interface SummaryAgentWin {
  title: string;
  description: string;
  metric?: string;
  value?: string;
}

export interface SummaryAgentRisk {
  title: string;
  description: string;
  severity?: "low" | "medium" | "high";
}

export interface SummaryAgentData {
  wins: SummaryAgentWin[];
  risks: SummaryAgentRisk[];
  next_steps: string;
  action_nudge?: string;
  [key: string]: unknown;
}

export interface OpportunityItem {
  title: string;
  type: "USER" | "ALLORO";
  explanation: string;
  category?: string;
  urgency?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

export interface OpportunityAgentData {
  opportunities: OpportunityItem[];
  title?: string;
  steps?: string[];
  expected_lift?: string;
  [key: string]: unknown;
}

export interface WebhookResult {
  webhookUrl: string;
  success: boolean;
  data?: Array<ProoflineAgentData | SummaryAgentData | OpportunityAgentData>;
  error?: string;
  attempts?: number;
}

export interface AgentResponse {
  webhooks: WebhookResult[];
  successCount?: number;
  totalCount?: number;
}

export type AgentType =
  | "proofline"
  | "summary"
  | "opportunity"
  | "cro_optimizer"
  | "referral_engine";

export const PROOF_TYPES = [
  "metric_improvement",
  "user_behavior",
  "conversion_rate",
  "engagement",
  "traffic_growth",
  "other",
] as const;

export type ProofType = (typeof PROOF_TYPES)[number];
