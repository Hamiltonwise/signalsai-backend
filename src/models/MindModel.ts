import { BaseModel, QueryContext } from "./BaseModel";

export interface IMind {
  id: string;
  name: string;
  slug: string;
  personality_prompt: string;
  published_version_id: string | null;
  available_work_types: string[];
  available_publish_targets: string[];
  rejection_categories: string[];
  portal_key_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export class MindModel extends BaseModel {
  protected static tableName = "minds.minds";
  protected static jsonFields = [
    "available_work_types",
    "available_publish_targets",
    "rejection_categories",
  ];

  static async findByName(name: string, trx?: QueryContext): Promise<IMind | undefined> {
    const row = await this.table(trx).where({ name }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findBySlug(slug: string, trx?: QueryContext): Promise<IMind | undefined> {
    const row = await this.table(trx).where({ slug }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listAll(trx?: QueryContext): Promise<IMind[]> {
    const rows = await this.table(trx).orderBy("created_at", "asc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
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

  static async updatePortalKeyHash(
    mindId: string,
    hash: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: mindId })
      .update({ portal_key_hash: hash, updated_at: new Date() });
  }
}
