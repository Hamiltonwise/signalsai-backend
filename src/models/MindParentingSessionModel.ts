import { BaseModel, QueryContext } from "./BaseModel";

export type ParentingSessionStatus =
  | "chatting"
  | "reading"
  | "proposals"
  | "compiling"
  | "completed"
  | "abandoned";

export type ParentingSessionResult = "learned" | "no_changes" | "all_rejected";

export interface IMindParentingSession {
  id: string;
  mind_id: string;
  status: ParentingSessionStatus;
  result: ParentingSessionResult | null;
  title: string | null;
  knowledge_buffer: string;
  sync_run_id: string | null;
  created_by_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export class MindParentingSessionModel extends BaseModel {
  protected static tableName = "minds.mind_parenting_sessions";

  static async createSession(
    mindId: string,
    adminId?: string,
    trx?: QueryContext
  ): Promise<IMindParentingSession> {
    const [result] = await this.table(trx)
      .insert({
        mind_id: mindId,
        status: "chatting",
        knowledge_buffer: "",
        created_by_admin_id: adminId || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async listByMind(
    mindId: string,
    limit = 50,
    trx?: QueryContext
  ): Promise<IMindParentingSession[]> {
    return this.table(trx)
      .where({ mind_id: mindId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async updateStatus(
    sessionId: string,
    status: ParentingSessionStatus,
    trx?: QueryContext
  ): Promise<number> {
    const data: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (status === "completed" || status === "abandoned") {
      data.finished_at = new Date();
    }
    return this.table(trx)
      .where({ id: sessionId })
      .update(data);
  }

  static async setResult(
    sessionId: string,
    result: ParentingSessionResult,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: sessionId })
      .update({ result, updated_at: new Date() });
  }

  static async appendToBuffer(
    sessionId: string,
    content: string,
    trx?: QueryContext
  ): Promise<number> {
    const qb = this.table(trx).where({ id: sessionId });
    const knexRef = trx || require("../database/connection").db;
    return qb.update({
      knowledge_buffer: knexRef.raw("knowledge_buffer || ?", ["\n\n" + content]),
      updated_at: new Date(),
    });
  }

  static async setSyncRunId(
    sessionId: string,
    syncRunId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: sessionId })
      .update({ sync_run_id: syncRunId, updated_at: new Date() });
  }

  static async updateTitle(
    sessionId: string,
    title: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: sessionId })
      .update({ title, updated_at: new Date() });
  }

  static async findActiveByMind(
    mindId: string,
    trx?: QueryContext
  ): Promise<IMindParentingSession | null> {
    const result = await this.table(trx)
      .where({ mind_id: mindId })
      .whereNotIn("status", ["completed", "abandoned"])
      .orderBy("created_at", "desc")
      .first();
    return result || null;
  }
}
