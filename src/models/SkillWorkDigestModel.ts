import { BaseModel, QueryContext } from "./BaseModel";

export interface ISkillWorkDigest {
  id: string;
  skill_id: string;
  summary: string;
  covers_from: Date;
  covers_to: Date;
  work_count: number;
  created_at: Date;
}

export class SkillWorkDigestModel extends BaseModel {
  protected static tableName = "minds.skill_work_digests";

  static async listBySkill(
    skillId: string,
    trx?: QueryContext
  ): Promise<ISkillWorkDigest[]> {
    return this.table(trx)
      .where({ skill_id: skillId })
      .orderBy("covers_to", "desc");
  }
}
