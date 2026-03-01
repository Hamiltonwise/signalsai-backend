import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "../BaseModel";
import { Knex } from "knex";

export interface IFormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: Record<string, string>;
  recipients_sent_to: string[];
  submitted_at: Date;
  is_read: boolean;
  sender_ip?: string;
  content_hash?: string;
}

export class FormSubmissionModel extends BaseModel {
  protected static tableName = "website_builder.form_submissions";

  static async create(
    data: Omit<IFormSubmission, "id" | "submitted_at" | "is_read">,
    trx?: QueryContext,
  ): Promise<IFormSubmission> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IFormSubmission | undefined> {
    return super.findById(id, trx);
  }

  static async findByProjectId(
    projectId: string,
    pagination: PaginationParams,
    filters?: { is_read?: boolean },
    trx?: QueryContext,
  ): Promise<PaginatedResult<IFormSubmission>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("project_id", projectId);
      if (filters?.is_read !== undefined) {
        qb = qb.where("is_read", filters.is_read);
      }
      return qb.orderBy("submitted_at", "desc");
    };
    return this.paginate<IFormSubmission>(buildQuery, pagination, trx);
  }

  static async markAsRead(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).update({ is_read: true });
  }

  static async markAsUnread(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).update({ is_read: false });
  }

  static async countUnreadByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, is_read: false })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async deleteById(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).del();
  }

  static async countRecentByIp(
    senderIp: string,
    windowMinutes: number,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where("sender_ip", senderIp)
      .where("submitted_at", ">=", new Date(Date.now() - windowMinutes * 60_000))
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countRecentByContentHash(
    projectId: string,
    contentHash: string,
    windowMinutes: number,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where("project_id", projectId)
      .where("content_hash", contentHash)
      .where("submitted_at", ">=", new Date(Date.now() - windowMinutes * 60_000))
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
