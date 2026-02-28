import { BaseModel, QueryContext } from "./BaseModel";

export type SkillStatus = "draft" | "ready" | "active" | "paused" | "generating" | "failed";
export type TriggerType = "manual" | "daily" | "weekly" | "day_of_week";
export type PipelineMode = "review_and_stop" | "review_then_publish" | "auto_pipeline";
export type WorkCreationType = "text" | "markdown" | "image" | "video" | "pdf" | "docx" | "audio";
export type PublishTarget =
  | "post_to_x"
  | "post_to_instagram"
  | "post_to_facebook"
  | "post_to_youtube"
  | "post_to_gbp"
  | "internal_only";

export interface TriggerConfig {
  day?: string;
  time?: string;
  timezone?: string;
}

export interface IMindSkill {
  id: string;
  mind_id: string;
  name: string;
  slug: string;
  definition: string;
  output_schema: object | null;
  status: SkillStatus;
  work_creation_type: WorkCreationType | null;
  output_count: number;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  pipeline_mode: PipelineMode;
  work_publish_to: PublishTarget | null;
  publication_config: object | null;
  portal_key_hash: string | null;
  last_run_at: Date | null;
  next_run_at: Date | null;
  org_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class MindSkillModel extends BaseModel {
  protected static tableName = "minds.mind_skills";
  protected static jsonFields = [
    "output_schema",
    "trigger_config",
    "publication_config",
  ];

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

  static async findBySlugGlobal(
    slug: string,
    trx?: QueryContext,
  ): Promise<IMindSkill | undefined> {
    const row = await this.table(trx).where({ slug }).first();
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

  static async findDueSkills(trx?: QueryContext): Promise<IMindSkill[]> {
    const rows = await this.table(trx)
      .where({ status: "active" })
      .where("next_run_at", "<=", new Date())
      .orderBy("next_run_at", "asc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async updateRunTimestamps(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date | null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({
        last_run_at: lastRunAt,
        next_run_at: nextRunAt,
        updated_at: new Date(),
      });
  }
}
