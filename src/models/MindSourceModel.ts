import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindSource {
  id: string;
  mind_id: string;
  name: string | null;
  url: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class MindSourceModel extends BaseModel {
  protected static tableName = "minds.mind_sources";

  static async listByMind(mindId: string, trx?: QueryContext): Promise<IMindSource[]> {
    return this.table(trx).where({ mind_id: mindId }).orderBy("created_at", "asc");
  }

  static async listActiveByMind(mindId: string, trx?: QueryContext): Promise<IMindSource[]> {
    return this.table(trx).where({ mind_id: mindId, is_active: true }).orderBy("created_at", "asc");
  }

  static async toggleActive(sourceId: string, isActive: boolean, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: sourceId }).update({ is_active: isActive, updated_at: new Date() });
  }
}
