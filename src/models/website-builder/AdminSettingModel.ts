import { db } from "../../database/connection";
import { BaseModel, QueryContext } from "../BaseModel";

export interface IAdminSetting {
  id: number;
  category: string;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export class AdminSettingModel extends BaseModel {
  protected static tableName = "website_builder.admin_settings";

  static async findAll(trx?: QueryContext): Promise<IAdminSetting[]> {
    return this.table(trx).select("category", "key", "value", "updated_at");
  }

  static async findByCategoryAndKey(
    category: string,
    key: string,
    trx?: QueryContext
  ): Promise<IAdminSetting | undefined> {
    return this.table(trx).where({ category, key }).first();
  }

  static async upsert(
    category: string,
    key: string,
    value: string,
    trx?: QueryContext
  ): Promise<IAdminSetting> {
    const [row] = await this.table(trx)
      .insert({ category, key, value, created_at: new Date(), updated_at: new Date() })
      .onConflict(["category", "key"])
      .merge({
        value,
        updated_at: (trx || db).fn.now(),
      })
      .returning("*");
    return row;
  }
}
