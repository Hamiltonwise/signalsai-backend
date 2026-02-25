import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindDiscoveryBatch {
  id: string;
  mind_id: string;
  status: "open" | "closed";
  opened_at: Date;
  closed_at: Date | null;
}

export class MindDiscoveryBatchModel extends BaseModel {
  protected static tableName = "minds.mind_discovery_batches";

  static async findOpenByMind(mindId: string, trx?: QueryContext): Promise<IMindDiscoveryBatch | undefined> {
    return this.table(trx).where({ mind_id: mindId, status: "open" }).first();
  }

  static async createOpen(mindId: string, trx?: QueryContext): Promise<IMindDiscoveryBatch> {
    const [result] = await this.table(trx)
      .insert({
        mind_id: mindId,
        status: "open",
        opened_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async ensureOpenBatch(mindId: string, trx?: QueryContext): Promise<IMindDiscoveryBatch> {
    const existing = await this.findOpenByMind(mindId, trx);
    if (existing) return existing;
    return this.createOpen(mindId, trx);
  }

  static async closeBatch(batchId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ id: batchId })
      .update({ status: "closed", closed_at: new Date() });
  }
}
