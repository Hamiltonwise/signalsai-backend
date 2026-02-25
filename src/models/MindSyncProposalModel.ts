import { BaseModel, QueryContext } from "./BaseModel";

export type ProposalType = "NEW" | "UPDATE" | "CONFLICT";
export type ProposalStatus = "pending" | "approved" | "rejected" | "finalized";

export interface IMindSyncProposal {
  id: string;
  sync_run_id: string;
  mind_id: string;
  type: ProposalType;
  summary: string;
  target_excerpt: string | null;
  proposed_text: string;
  reason: string;
  status: ProposalStatus;
  created_at: Date;
  updated_at: Date;
}

export class MindSyncProposalModel extends BaseModel {
  protected static tableName = "minds.mind_sync_proposals";

  static async listByRun(syncRunId: string, trx?: QueryContext): Promise<IMindSyncProposal[]> {
    return this.table(trx)
      .where({ sync_run_id: syncRunId })
      .orderBy("created_at", "asc");
  }

  static async listApprovedByMind(mindId: string, trx?: QueryContext): Promise<IMindSyncProposal[]> {
    return this.table(trx)
      .where({ mind_id: mindId, status: "approved" })
      .orderBy("created_at", "asc");
  }

  static async countApprovedByMind(mindId: string, trx?: QueryContext): Promise<number> {
    const result = await this.table(trx)
      .where({ mind_id: mindId, status: "approved" })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async hasApprovedUnfinalized(mindId: string, trx?: QueryContext): Promise<boolean> {
    const count = await this.countApprovedByMind(mindId, trx);
    return count > 0;
  }

  static async updateStatus(
    proposalId: string,
    status: ProposalStatus,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: proposalId }).update({
      status,
      updated_at: new Date(),
    });
  }

  static async finalizeApproved(mindId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ mind_id: mindId, status: "approved" })
      .update({ status: "finalized", updated_at: new Date() });
  }

  static async bulkInsert(
    proposals: Array<{
      sync_run_id: string;
      mind_id: string;
      type: ProposalType;
      summary: string;
      target_excerpt?: string;
      proposed_text: string;
      reason: string;
    }>,
    trx?: QueryContext
  ): Promise<IMindSyncProposal[]> {
    const rows = proposals.map((p) => ({
      ...p,
      target_excerpt: p.target_excerpt || null,
      status: "pending" as const,
      created_at: new Date(),
      updated_at: new Date(),
    }));
    return this.table(trx).insert(rows).returning("*");
  }

  static async countByRunAndStatus(
    syncRunId: string,
    trx?: QueryContext
  ): Promise<Record<string, number>> {
    const rows = await this.table(trx)
      .where({ sync_run_id: syncRunId })
      .select("status")
      .count("* as count")
      .groupBy("status");
    const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, finalized: 0 };
    for (const row of rows) {
      counts[row.status as string] = parseInt(row.count as string, 10);
    }
    return counts;
  }
}
