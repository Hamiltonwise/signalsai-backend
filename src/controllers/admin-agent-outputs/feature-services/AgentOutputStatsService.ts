import { AgentResultModel } from "../../../models/AgentResultModel";

export interface AgentOutputStats {
  byStatus: Record<string, number>;
  byAgentType: Record<string, number>;
  recentCount: number;
  total: number;
}

export async function getSummary(): Promise<AgentOutputStats> {
  const [byStatus, byAgentType, recentCount] = await Promise.all([
    AgentResultModel.getStatsByStatus(),
    AgentResultModel.getStatsByAgentType(true),
    AgentResultModel.getRecentCount(7, true),
  ]);

  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    byStatus,
    byAgentType,
    recentCount,
    total,
  };
}
