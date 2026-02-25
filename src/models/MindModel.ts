import { BaseModel, QueryContext } from "./BaseModel";

export interface IMind {
  id: string;
  name: string;
  slug: string;
  personality_prompt: string;
  published_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class MindModel extends BaseModel {
  protected static tableName = "minds.minds";

  static async findByName(name: string, trx?: QueryContext): Promise<IMind | undefined> {
    return this.table(trx).where({ name }).first();
  }

  static async findBySlug(slug: string, trx?: QueryContext): Promise<IMind | undefined> {
    return this.table(trx).where({ slug }).first();
  }

  static async listAll(trx?: QueryContext): Promise<IMind[]> {
    return this.table(trx).orderBy("created_at", "asc");
  }

  static async setPublishedVersion(
    mindId: string,
    versionId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: mindId })
      .update({ published_version_id: versionId, updated_at: new Date() });
  }
}
