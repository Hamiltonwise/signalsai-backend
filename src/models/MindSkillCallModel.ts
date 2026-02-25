import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMindSkillCall {
  id: string;
  skill_id: string;
  caller_ip: string | null;
  request_payload: object | null;
  response_payload: object | null;
  status: "success" | "error";
  duration_ms: number;
  called_at: Date;
}

export class MindSkillCallModel extends BaseModel {
  protected static tableName = "minds.mind_skill_calls";
  protected static jsonFields = ["request_payload", "response_payload"];

  static async log(
    skillId: string,
    callerIp: string | null,
    requestPayload: object | null,
    responsePayload: object | null,
    status: "success" | "error",
    durationMs: number,
    trx?: QueryContext,
  ): Promise<IMindSkillCall> {
    const data = this.serializeJsonFields({
      skill_id: skillId,
      caller_ip: callerIp,
      request_payload: requestPayload,
      response_payload: responsePayload,
      status,
      duration_ms: durationMs,
      called_at: new Date(),
    });
    const [row] = await this.table(trx).insert(data).returning("*");
    return this.deserializeJsonFields(row);
  }

  static async countBySkill(
    skillId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ skill_id: skillId })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countBySkillToday(
    skillId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const result = await this.table(trx)
      .where({ skill_id: skillId })
      .where("called_at", ">=", today)
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async dailyCountsLast7Days(
    skillId: string,
    trx?: QueryContext,
  ): Promise<{ date: string; count: number }[]> {
    const rows = await (trx || db).raw(
      `
      SELECT
        to_char(called_at::date, 'YYYY-MM-DD') as date,
        COUNT(*)::int as count
      FROM minds.mind_skill_calls
      WHERE skill_id = ?
        AND called_at >= NOW() - INTERVAL '7 days'
      GROUP BY called_at::date
      ORDER BY called_at::date ASC
      `,
      [skillId],
    );
    return rows.rows || [];
  }
}
