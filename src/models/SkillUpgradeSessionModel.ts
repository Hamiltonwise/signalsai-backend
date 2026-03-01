import { BaseModel, QueryContext } from "./BaseModel";

export type SkillUpgradeSessionStatus =
  | "chatting"
  | "reading"
  | "proposals"
  | "compiling"
  | "completed"
  | "abandoned";

export type SkillUpgradeSessionResult = "learned" | "no_changes" | "all_rejected";

export interface ISkillUpgradeSession {
  id: string;
  skill_id: string;
  mind_id: string;
  status: SkillUpgradeSessionStatus;
  result: SkillUpgradeSessionResult | null;
  title: string | null;
  knowledge_buffer: string;
  sync_run_id: string | null;
  created_by_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export class SkillUpgradeSessionModel extends BaseModel {
  protected static tableName = "minds.skill_upgrade_sessions";

  static async createSession(
    skillId: string,
    mindId: string,
    adminId?: string,
    trx?: QueryContext
  ): Promise<ISkillUpgradeSession> {
    const [result] = await this.table(trx)
      .insert({
        skill_id: skillId,
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

  static async listBySkill(
    skillId: string,
    limit = 50,
    trx?: QueryContext
  ): Promise<ISkillUpgradeSession[]> {
    return this.table(trx)
      .where({ skill_id: skillId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async updateStatus(
    sessionId: string,
    status: SkillUpgradeSessionStatus,
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
    result: SkillUpgradeSessionResult,
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

  static async findActiveBySkill(
    skillId: string,
    trx?: QueryContext
  ): Promise<ISkillUpgradeSession | null> {
    const result = await this.table(trx)
      .where({ skill_id: skillId })
      .whereNotIn("status", ["completed", "abandoned"])
      .orderBy("created_at", "desc")
      .first();
    return result || null;
  }
}
