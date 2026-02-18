import { BaseModel, QueryContext } from "../BaseModel";

export interface IUserEdit {
  id: number;
  organization_id: number;
  page_id: string | null;
  edit_type: string | null;
  created_at: Date;
}

export class UserEditModel extends BaseModel {
  protected static tableName = "website_builder.user_edits";

  static async create(
    data: Partial<IUserEdit>,
    trx?: QueryContext
  ): Promise<IUserEdit> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async countTodayByOrg(
    orgId: number,
    trx?: QueryContext
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.table(trx)
      .where({ organization_id: orgId })
      .where("created_at", ">=", today)
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
