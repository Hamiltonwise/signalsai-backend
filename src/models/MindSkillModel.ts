import { BaseModel, QueryContext } from "./BaseModel";

export type SkillStatus = "draft" | "ready" | "generating" | "failed";

export interface IMindSkill {
  id: string;
  mind_id: string;
  name: string;
  slug: string;
  definition: string;
  output_schema: object | null;
  status: SkillStatus;
  created_at: Date;
  updated_at: Date;
}

export class MindSkillModel extends BaseModel {
  protected static tableName = "minds.mind_skills";
  protected static jsonFields = ["output_schema"];

  static async listByMind(
    mindId: string,
    trx?: QueryContext,
  ): Promise<IMindSkill[]> {
    const rows = await this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("created_at", "asc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async findBySlug(
    mindId: string,
    slug: string,
    trx?: QueryContext,
  ): Promise<IMindSkill | undefined> {
    const row = await this.table(trx)
      .where({ mind_id: mindId, slug })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async updateStatus(
    id: string,
    status: SkillStatus,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status, updated_at: new Date() });
  }
}
