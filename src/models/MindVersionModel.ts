import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindVersion {
  id: string;
  mind_id: string;
  version_number: number;
  brain_markdown: string;
  created_by_admin_id: string | null;
  created_at: Date;
}

export class MindVersionModel extends BaseModel {
  protected static tableName = "minds.mind_versions";

  static async findLatestByMind(mindId: string, trx?: QueryContext): Promise<IMindVersion | undefined> {
    return this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("version_number", "desc")
      .first();
  }

  static async listByMind(mindId: string, trx?: QueryContext): Promise<IMindVersion[]> {
    return this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("version_number", "desc");
  }

  static async getNextVersionNumber(mindId: string, trx?: QueryContext): Promise<number> {
    const latest = await this.findLatestByMind(mindId, trx);
    return latest ? latest.version_number + 1 : 1;
  }

  static async createVersion(
    mindId: string,
    brainMarkdown: string,
    adminId?: string,
    trx?: QueryContext
  ): Promise<IMindVersion> {
    const nextVersion = await this.getNextVersionNumber(mindId, trx);
    const [result] = await this.table(trx)
      .insert({
        mind_id: mindId,
        version_number: nextVersion,
        brain_markdown: brainMarkdown,
        created_by_admin_id: adminId || null,
        created_at: new Date(),
      })
      .returning("*");
    return result;
  }
}
