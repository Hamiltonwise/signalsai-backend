import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IClarityData {
  domain: string;
  report_date: string;
  data: Record<string, unknown>;
  created_at: Date;
}

export class ClarityDataModel extends BaseModel {
  protected static tableName = "clarity_data_store";
  protected static jsonFields = ["data"];

  static async upsert(
    domain: string,
    reportDate: string,
    data: unknown,
    trx?: QueryContext
  ): Promise<void> {
    const jsonData = this.toJson(data);
    await this.table(trx)
      .insert({
        domain,
        report_date: reportDate,
        data: jsonData,
        created_at: new Date(),
      })
      .onConflict(["domain", "report_date"])
      .merge({
        data: jsonData,
        created_at: (trx || db).fn.now(),
      });
  }

  static async findByDomainAndDateRange(
    domain: string,
    startDate: string,
    endDate: string,
    trx?: QueryContext
  ): Promise<IClarityData[]> {
    const rows = await this.table(trx)
      .where("domain", domain)
      .andWhereBetween("report_date", [startDate, endDate]);
    return rows.map((row: IClarityData) =>
      this.deserializeJsonFields(row)
    );
  }
}
