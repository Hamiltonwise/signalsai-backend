import { BaseModel, QueryContext } from "./BaseModel";

export interface IMindMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
}

export class MindMessageModel extends BaseModel {
  protected static tableName = "minds.mind_messages";

  static async listByConversation(
    conversationId: string,
    limit = 50,
    trx?: QueryContext
  ): Promise<IMindMessage[]> {
    return this.table(trx)
      .where({ conversation_id: conversationId })
      .orderBy("created_at", "asc")
      .limit(limit);
  }

  static async getRecentMessages(
    conversationId: string,
    limit = 20,
    trx?: QueryContext
  ): Promise<IMindMessage[]> {
    const rows = await this.table(trx)
      .where({ conversation_id: conversationId })
      .orderBy("created_at", "desc")
      .limit(limit);
    return rows.reverse();
  }

  static async addMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    trx?: QueryContext
  ): Promise<IMindMessage> {
    const [result] = await this.table(trx)
      .insert({
        conversation_id: conversationId,
        role,
        content,
        created_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async deleteByConversation(conversationId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ conversation_id: conversationId }).del();
  }

  static async countByConversation(conversationId: string, trx?: QueryContext): Promise<number> {
    const result = await this.table(trx)
      .where({ conversation_id: conversationId })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
