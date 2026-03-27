import { BaseModel, QueryContext } from "./BaseModel";

export class PmDailyBriefModel extends BaseModel {
  protected static tableName = "pm_daily_briefs";
  protected static jsonFields = ["recommended_tasks"];

  // pm_daily_briefs has no created_at/updated_at — override BaseModel.create
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const serialized = this.serializeJsonFields(data);
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }
}
