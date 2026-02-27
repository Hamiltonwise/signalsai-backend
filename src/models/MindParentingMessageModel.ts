import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindParentingMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
}

export class MindParentingMessageModel extends BaseModel {
  protected static tableName = "minds.mind_parenting_messages";

  static async createMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    trx?: QueryContext
  ): Promise<IMindParentingMessage> {
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
  ): Promise<IMindParentingMessage[]> {
    return this.table(trx)
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
  }

  static async countBySession(
    sessionId: string,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ session_id: sessionId })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
