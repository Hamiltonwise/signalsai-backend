/**
 * Simplified Agent Output Schemas
 *
 * These types define the EXACT structure n8n must return for each agent.
 * All governance/lineage overhead has been stripped — only fields consumed
 * by the backend (task creation) and frontend (dashboard rendering) remain.
 *
 * Each agent's n8n workflow writes its result directly to `agent_results`
 * via the `run_id` correlation key. The `agent_output` column must conform
 * to these schemas.
 */

import { z } from "zod";

// =====================================================================
// PROOFLINE AGENT (DAILY)
// =====================================================================

/**
 * Proofline Agent Output
 *
 * Consumed by: DashboardOverview (trajectory, title, explanation),
 * ApprovedInsightCard (proof_type, value_change, metric_signal)
 */
export interface ProoflineAgentOutput {
  title: string;
  proof_type: "win" | "loss";
  trajectory: string;
  explanation: string;
  value_change?: string;
  metric_signal?: string;
  source_type?: "visibility" | "engagement" | "reviews";
  citations?: string[];
}

export interface ProoflineSkippedOutput {
  skipped: true;
  reason: string;
}

// =====================================================================
// SUMMARY AGENT
// =====================================================================

export interface SummaryWin {
  title: string;
  description: string;
}

export interface SummaryRisk {
  title: string;
  description: string;
  severity?: "low" | "medium" | "high";
}

/**
 * Summary Agent Output
 *
 * Consumed by: Dashboard (wins/risks), Admin Editor, downstream agents
 * (Opportunity + CRO receive full blob as `additional_data`)
 */
export interface SummaryAgentOutput {
  wins: SummaryWin[];
  risks: SummaryRisk[];
  next_steps: string;
  action_nudge?: string;
}

// =====================================================================
// OPPORTUNITY AGENT
// =====================================================================

export interface OpportunityItem {
  title: string;
  type: "USER" | "ALLORO";
  explanation: string;
  category?: string;
  urgency?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Opportunity Agent Output (array wrapper)
 *
 * Consumed by: Task creator (opportunities[]), ApprovedInsightCard (title, steps, expected_lift)
 */
export interface OpportunityAgentOutputItem {
  opportunities: OpportunityItem[];
  title?: string;
  steps?: string[];
  expected_lift?: string;
}

export type OpportunityAgentOutput = OpportunityAgentOutputItem[];

// =====================================================================
// CRO OPTIMIZER AGENT
// =====================================================================

export interface CroOptimizerItem {
  title: string;
  type: "USER" | "ALLORO";
  explanation: string;
  category?: string;
  urgency?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CRO Optimizer Agent Output (array wrapper)
 *
 * Consumed by: Task creator only (no frontend rendering)
 */
export interface CroOptimizerAgentOutputItem {
  opportunities: CroOptimizerItem[];
}

export type CroOptimizerAgentOutput = CroOptimizerAgentOutputItem[];

// =====================================================================
// REFERRAL ENGINE AGENT
// =====================================================================

export interface ReferralTopFix {
  title: string;
  description: string;
  impact: string;
}

export interface ReferralGrowthSummary {
  top_three_fixes: ReferralTopFix[];
  estimated_additional_annual_revenue: number;
}

export interface ReferralDoctorReferral {
  referrer_name: string;
  referred: number;
  net_production: number;
  avg_production_per_referral: number;
  trend_label: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes: string;
}

export interface ReferralNonDoctorReferral {
  source_label: string;
  source_key: string;
  source_type: "digital" | "patient" | "other";
  referred: number;
  net_production: number;
  avg_production_per_referral: number;
  trend_label: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes: string;
}

export interface ReferralAutomationOpportunity {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  due_date?: string;
}

export interface ReferralPracticeAction {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  owner: string;
  due_date?: string;
}

/**
 * Referral Engine Agent Output
 *
 * Consumed by: Task creator (alloro_automation_opportunities + practice_action_plan),
 * Dashboard (growth summary, referral matrices, executive summary)
 */
export interface ReferralEngineAgentOutput {
  executive_summary?: string[];
  growth_opportunity_summary: ReferralGrowthSummary;
  doctor_referral_matrix: ReferralDoctorReferral[];
  non_doctor_referral_matrix: ReferralNonDoctorReferral[];
  alloro_automation_opportunities: ReferralAutomationOpportunity[];
  practice_action_plan: ReferralPracticeAction[];
  observed_period?: {
    start_date: string;
    end_date: string;
  };
  data_quality_flags?: string[];
  confidence?: number;
}

// ---------------------------------------------------------------------
// Zod schema for ReferralEngineAgentOutput
// ---------------------------------------------------------------------
//
// Mirrors the TS interface above. The top-level object is `.strict()` so
// unknown keys at the root fail validation. Nested objects are NOT strict,
// so minor LLM verbosity inside matrix rows / nested blocks does not cause
// hard validation failures (those are the most common drift points).
//
// Enums are tightened past the TS interface for `priority` and
// `source_type` to match the prompt's JSON output spec
// (`ReferralEngineAnalysis.md` lines 130-194). The TS interface keeps
// `priority: string` for backward compat with already-stored agent_results
// rows; this schema is the forward-going contract.

const trendLabelSchema = z.enum([
  "increasing",
  "decreasing",
  "new",
  "dormant",
  "stable",
]);

const prioritySchema = z.enum(["low", "medium", "high"]);

const sourceTypeSchema = z.enum(["digital", "patient", "other"]);

const referralTopFixSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.string(),
});

const referralGrowthSummarySchema = z.object({
  top_three_fixes: z.array(referralTopFixSchema),
  estimated_additional_annual_revenue: z.number(),
});

const referralDoctorReferralSchema = z.object({
  referrer_name: z.string(),
  referred: z.number(),
  net_production: z.number(),
  avg_production_per_referral: z.number(),
  trend_label: trendLabelSchema,
  notes: z.string(),
});

const referralNonDoctorReferralSchema = z.object({
  source_label: z.string(),
  source_key: z.string(),
  source_type: sourceTypeSchema,
  referred: z.number(),
  net_production: z.number(),
  avg_production_per_referral: z.number(),
  trend_label: trendLabelSchema,
  notes: z.string(),
});

const referralAutomationOpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: prioritySchema,
  impact: z.string(),
  effort: z.string(),
  category: z.string(),
  due_date: z.string().optional(),
});

const referralPracticeActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: prioritySchema,
  impact: z.string(),
  effort: z.string(),
  category: z.string(),
  owner: z.string(),
  due_date: z.string().optional(),
});

export const ReferralEngineAgentOutputSchema = z
  .object({
    executive_summary: z.array(z.string()).optional(),
    growth_opportunity_summary: referralGrowthSummarySchema,
    doctor_referral_matrix: z.array(referralDoctorReferralSchema),
    non_doctor_referral_matrix: z.array(referralNonDoctorReferralSchema),
    alloro_automation_opportunities: z.array(referralAutomationOpportunitySchema),
    practice_action_plan: z.array(referralPracticeActionSchema),
    observed_period: z
      .object({
        start_date: z.string(),
        end_date: z.string(),
      })
      .optional(),
    data_quality_flags: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type ReferralEngineAgentOutputZ = z.infer<
  typeof ReferralEngineAgentOutputSchema
>;
