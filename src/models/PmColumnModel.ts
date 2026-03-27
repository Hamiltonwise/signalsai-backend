import { BaseModel, QueryContext } from "./BaseModel";

export class PmColumnModel extends BaseModel {
  protected static tableName = "pm_columns";
  protected static jsonFields: string[] = [];

  // pm_columns has no created_at/updated_at — override BaseModel.create
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const [result] = await this.table(trx).insert(data).returning("*");
    return result;
  }
}
