/**
 * Governance service for admin agent insights.
 *
 * Handles governance ID retrieval (PASS/REJECT IDs per agent) and
 * by-ids lookup for recommendation details.
 */

import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";

export interface GovernanceIdsResult {
  passed: number[];
  rejected: number[];
  counts: { passed: number; rejected: number };
}

export interface ByIdsResult {
  passed: any[];
  rejected: any[];
  counts: { passed: number; rejected: number };
}

/**
 * Fetch all PASS and REJECT recommendation IDs for a specific agent type.
 */
export async function fetchGovernanceIds(
  agentType: string
): Promise<GovernanceIdsResult> {
  const passed = await AgentRecommendationModel.findIdsByAgentAndStatus(agentType, "PASS");
  const rejected = await AgentRecommendationModel.findIdsByAgentAndStatus(agentType, "REJECT");

  return {
    passed,
    rejected,
    counts: {
      passed: passed.length,
      rejected: rejected.length,
    },
  };
}

/**
 * Fetch recommendation details by arrays of passed and rejected IDs.
 */
export async function fetchByIds(
  passedIds?: number[],
  rejectedIds?: number[]
): Promise<ByIdsResult> {
  const passedRecs =
    passedIds && Array.isArray(passedIds) && passedIds.length > 0
      ? await AgentRecommendationModel.findByIds(passedIds)
      : [];

  const rejectedRecs =
    rejectedIds && Array.isArray(rejectedIds) && rejectedIds.length > 0
      ? await AgentRecommendationModel.findByIds(rejectedIds)
      : [];

  return {
    passed: passedRecs,
    rejected: rejectedRecs,
    counts: {
      passed: passedRecs.length,
      rejected: rejectedRecs.length,
    },
  };
}
