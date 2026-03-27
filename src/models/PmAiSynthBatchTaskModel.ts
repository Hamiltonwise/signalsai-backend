import { BaseModel, QueryContext } from "./BaseModel";

export class PmAiSynthBatchTaskModel extends BaseModel {
  protected static tableName = "pm_ai_synth_batch_tasks";
  protected static jsonFields: string[] = [];

  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const [result] = await this.table(trx).insert(data).returning("*");
    return result;
  }
}
