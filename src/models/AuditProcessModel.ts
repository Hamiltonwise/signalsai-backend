import { BaseModel, QueryContext } from "./BaseModel";

export interface IAuditProcess {
  id: string;
  domain?: string;
  practice_search_string?: string;
  status?: string;
  realtime_status?: string;
  error_message?: string;
  step_screenshots?: unknown;
  step_website_analysis?: unknown;
  step_self_gbp?: unknown;
  step_competitors?: unknown;
  step_gbp_analysis?: unknown;
  [key: string]: unknown;
  created_at: Date;
  updated_at: Date;
}

export class AuditProcessModel extends BaseModel {
  protected static tableName = "audit_processes";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IAuditProcess | undefined> {
    return super.findById(id, trx);
  }

  static async updateById(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data, trx);
  }
}
