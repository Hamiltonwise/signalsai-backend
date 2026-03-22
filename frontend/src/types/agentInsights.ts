/**
 * TypeScript interfaces for Admin Agent Insights feature
 */

export interface AgentInsightSummary {
  agent_type: string;
  pass_rate: number; // 0 to 1
  confidence_rate: number; // 0 to 1
  total_recommendations: number;
  fixed_count: number;
}

export interface AgentRecommendation {
  id: number;
  agent_result_id: number;
  source_agent_type: "guardian" | "governance_sentinel";
  agent_under_test: string;

  // Core fields
  title: string;
  explanation: string | null;

  // Metadata
  type: string | null; // 'ALLORO', 'USER'
  category: string | null; // 'Operational', 'Experience'
  urgency: string | null; // 'Immediate', 'Next Visit'
  severity: number;

  // Agent verdict info
  verdict: string | null; // 'PASS', 'FAIL', 'PENDING_VERIFICATION'
  confidence: number | null; // 0 to 1

  // Action details
  suggested_action: string | null;
  rule_reference: string | null;
  evidence_links: Array<{ url: string; label: string }>;
  escalation_required: boolean;

  // Tracking
  status: "PASS" | "REJECT" | null;

  // Timestamps
  observed_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AgentInsightsSummaryResponse {
  success: boolean;
  data: AgentInsightSummary[];
  pagination: PaginationInfo;
  period?: {
    startDate: string;
    endDate: string;
  };
  message?: string;
}

export interface AgentRecommendationsResponse {
  success: boolean;
  data: AgentRecommendation[];
  pagination: PaginationInfo;
}

export interface UpdateRecommendationStatusResponse {
  success: boolean;
  message: string;
  data: {
    id: number;
    status: string;
  };
}
