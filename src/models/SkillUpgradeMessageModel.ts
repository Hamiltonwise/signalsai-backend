import { BaseModel, QueryContext } from "./BaseModel";

export interface ISkillUpgradeMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
}

export class SkillUpgradeMessageModel extends BaseModel {
  protected static tableName = "minds.skill_upgrade_messages";

  static async createMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    trx?: QueryContext
  ): Promise<ISkillUpgradeMessage> {
    const [result] = await this.table(trx)
      .insert({
        session_id: sessionId,
        role,
        content,
        created_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async listBySession(
    sessionId: string,
    trx?: QueryContext
  ): Promise<ISkillUpgradeMessage[]> {
    return this.table(trx)
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
  }
}
