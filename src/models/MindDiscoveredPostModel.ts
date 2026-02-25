import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindDiscoveredPost {
  id: string;
  mind_id: string;
  source_id: string;
  batch_id: string;
  url: string;
  title: string | null;
  published_at: Date | null;
  status: "pending" | "approved" | "ignored" | "processed";
  discovered_at: Date;
  processed_at: Date | null;
  last_error: string | null;
  sync_run_id: string | null;
}

export class MindDiscoveredPostModel extends BaseModel {
  protected static tableName = "minds.mind_discovered_posts";

  static async listByBatch(
    batchId: string,
    trx?: QueryContext
  ): Promise<IMindDiscoveredPost[]> {
    return this.table(trx).where({ batch_id: batchId }).orderBy("discovered_at", "desc");
  }

  static async listApprovedByBatch(
    batchId: string,
    limit: number,
    trx?: QueryContext
  ): Promise<IMindDiscoveredPost[]> {
    return this.table(trx)
      .where({ batch_id: batchId, status: "approved" })
      .orderBy("discovered_at", "asc")
      .limit(limit);
  }

  static async countByBatchAndStatus(
    batchId: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ batch_id: batchId, status })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async hasPendingInBatch(batchId: string, trx?: QueryContext): Promise<boolean> {
    const count = await this.countByBatchAndStatus(batchId, "pending", trx);
    return count > 0;
  }

  static async updateStatus(
    postId: string,
    status: "pending" | "approved" | "ignored" | "processed",
    trx?: QueryContext
  ): Promise<number> {
    const update: Record<string, unknown> = { status };
    if (status === "processed") {
      update.processed_at = new Date();
    }
    return this.table(trx).where({ id: postId }).update(update);
  }

  static async markProcessed(
    postId: string,
    syncRunId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: postId }).update({
      status: "processed",
      processed_at: new Date(),
      sync_run_id: syncRunId,
    });
  }

  static async tryInsert(
    data: {
      mind_id: string;
      source_id: string;
      batch_id: string;
      url: string;
      title?: string;
      published_at?: Date;
    },
    trx?: QueryContext
  ): Promise<IMindDiscoveredPost | null> {
    try {
      const [result] = await this.table(trx)
        .insert({
          ...data,
          status: "pending",
          discovered_at: new Date(),
        })
        .returning("*");
      return result;
    } catch (err: any) {
      // Unique constraint violation — duplicate, skip
      if (err.code === "23505") return null;
      throw err;
    }
  }
}
