import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMindConversation {
  id: string;
  mind_id: string;
  title: string | null;
  message_count: number;
  created_by_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class MindConversationModel extends BaseModel {
  protected static tableName = "minds.mind_conversations";

  static async listByMind(mindId: string, limit = 50, trx?: QueryContext): Promise<IMindConversation[]> {
    return this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("updated_at", "desc")
      .limit(limit);
  }

  static async createConversation(
    mindId: string,
    adminId?: string,
    trx?: QueryContext
  ): Promise<IMindConversation> {
    const now = new Date();
    const [result] = await this.table(trx)
      .insert({
        mind_id: mindId,
        created_by_admin_id: adminId || null,
        message_count: 0,
        created_at: now,
        updated_at: now,
      })
      .returning("*");
    return result;
  }

  static async updateTitle(convId: string, title: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: convId }).update({ title });
  }

  static async incrementMessageCount(convId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ id: convId })
      .update({
        message_count: db.raw("message_count + 1"),
        updated_at: new Date(),
      });
  }

  static async resetMessageCount(convId: string, count: number, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: convId }).update({
      message_count: count,
      updated_at: new Date(),
    });
  }

  static async touchUpdatedAt(convId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: convId }).update({ updated_at: new Date() });
  }
}
