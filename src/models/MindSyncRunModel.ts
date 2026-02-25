import { BaseModel, QueryContext } from "./BaseModel";

export type SyncRunType = "scrape_compare" | "compile_publish";
export type SyncRunStatus = "queued" | "running" | "failed" | "completed";

export interface IMindSyncRun {
  id: string;
  mind_id: string;
  batch_id: string | null;
  type: SyncRunType;
  status: SyncRunStatus;
  created_by_admin_id: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
}

export class MindSyncRunModel extends BaseModel {
  protected static tableName = "minds.mind_sync_runs";

  static async hasActiveRun(mindId: string, trx?: QueryContext): Promise<boolean> {
    const result = await this.table(trx)
      .where({ mind_id: mindId })
      .whereIn("status", ["queued", "running"])
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) > 0;
  }

  static async createRun(
    mindId: string,
    type: SyncRunType,
    adminId?: string,
    batchId?: string,
    trx?: QueryContext
  ): Promise<IMindSyncRun> {
    const [result] = await this.table(trx)
      .insert({
        mind_id: mindId,
        batch_id: batchId || null,
        type,
        status: "queued",
        created_by_admin_id: adminId || null,
        created_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async markRunning(runId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: runId }).update({
      status: "running",
      started_at: new Date(),
    });
  }

  static async markCompleted(runId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: runId }).update({
      status: "completed",
      finished_at: new Date(),
    });
  }

  static async markFailed(runId: string, errorMessage: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: runId }).update({
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date(),
    });
  }

  static async listByMind(mindId: string, limit = 20, trx?: QueryContext): Promise<IMindSyncRun[]> {
    return this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async listByBatch(batchId: string, limit = 20, trx?: QueryContext): Promise<IMindSyncRun[]> {
    return this.table(trx)
      .where({ batch_id: batchId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findActiveByMind(mindId: string, trx?: QueryContext): Promise<IMindSyncRun | null> {
    const result = await this.table(trx)
      .where({ mind_id: mindId })
      .whereIn("status", ["queued", "running"])
      .first();
    return result || null;
  }

  static async findLatestCompletedScrape(mindId: string, trx?: QueryContext): Promise<IMindSyncRun | null> {
    const result = await this.table(trx)
      .where({ mind_id: mindId, type: "scrape_compare", status: "completed" })
      .orderBy("finished_at", "desc")
      .first();
    return result || null;
  }
}
