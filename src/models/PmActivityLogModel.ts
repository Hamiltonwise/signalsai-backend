import { BaseModel, QueryContext } from "./BaseModel";

export class PmActivityLogModel extends BaseModel {
  protected static tableName = "pm_activity_log";
  protected static jsonFields = ["metadata"];

  // pm_activity_log has created_at (DB default) but no updated_at
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const serialized = this.serializeJsonFields(data);
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }
}
