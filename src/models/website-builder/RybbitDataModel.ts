import { BaseModel, QueryContext } from "../BaseModel";

export interface IRybbitData {
  id: string;
  project_id: string;
  report_date: string;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class RybbitDataModel extends BaseModel {
  protected static tableName = "website_builder.rybbit_data";
  protected static jsonFields = ["data"];

  static async upsert(
    projectId: string,
    reportDate: string,
    data: unknown,
    trx?: QueryContext,
  ): Promise<void> {
    const jsonData = this.toJson(data);
    const now = new Date();
    await this.table(trx)
      .insert({
        project_id: projectId,
        report_date: reportDate,
        data: jsonData,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["project_id", "report_date"])
      .merge({
        data: jsonData,
        updated_at: now,
      });
  }

  static async findByProjectAndDateRange(
    projectId: string,
    startDate: string,
    endDate: string,
    trx?: QueryContext,
  ): Promise<IRybbitData[]> {
    const rows = await this.table(trx)
      .where("project_id", projectId)
      .andWhereBetween("report_date", [startDate, endDate])
      .orderBy("report_date", "desc");
    return rows.map((row: IRybbitData) => this.deserializeJsonFields(row));
  }
}
