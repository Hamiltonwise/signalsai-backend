import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IPmsJob {
  id: number;
  domain: string;
  status: string;
  time_elapsed: number | null;
  is_approved: boolean;
  is_client_approved: boolean;
  response_log: Record<string, unknown> | null;
  raw_input_data: Record<string, unknown> | null;
  automation_status_detail: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface PmsJobFilters {
  domain?: string;
  status?: string;
  statuses?: string[];
  is_approved?: boolean;
}

export class PmsJobModel extends BaseModel {
  protected static tableName = "pms_jobs";
  protected static jsonFields = [
    "response_log",
    "raw_input_data",
    "automation_status_detail",
  ];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    return super.findById(id, trx);
  }

  static async create(
    data: Partial<IPmsJob>,
    trx?: QueryContext
  ): Promise<IPmsJob> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IPmsJob>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async findLatestByDomain(
    domain: string,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await this.table(trx)
      .where({ domain })
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findActiveAutomation(
    domain: string,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await this.table(trx)
      .where({ domain })
      .whereNotNull("automation_status_detail")
      .whereRaw(
        "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
      )
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listByDomain(
    domain: string,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      return qb.where({ domain }).orderBy("created_at", "desc");
    };
    return this.paginate<IPmsJob>(buildQuery, pagination, trx);
  }

  static async listAdmin(
    filters: PmsJobFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (filters.domain) {
        qb = qb.where("domain", filters.domain);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.statuses && filters.statuses.length > 0) {
        qb = qb.whereIn("status", filters.statuses);
      }
      if (filters.is_approved !== undefined) {
        qb = qb.where("is_approved", filters.is_approved);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IPmsJob>(buildQuery, pagination, trx);
  }

  static async updateApproval(
    id: number,
    isApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { is_approved: isApproved }, trx);
  }

  static async updateClientApproval(
    id: number,
    isClientApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { is_client_approved: isClientApproved }, trx);
  }

  static async updateAutomationStatus(
    id: number,
    statusDetail: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { automation_status_detail: statusDetail },
      trx
    );
  }

  /**
   * Find all active automation jobs (status is pending, processing, or awaiting_approval).
   * Optionally filter by domain.
   */
  static async findActiveAutomationJobs(
    domain?: string,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .whereNotNull("automation_status_detail")
      .whereRaw(
        "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
      )
      .select(
        "id",
        "domain",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "timestamp"
      )
      .orderBy("timestamp", "desc");

    if (domain) {
      query = query.where("domain", domain);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * Fetch all jobs for a domain with specific columns for key data aggregation.
   */
  static async findJobsForKeyData(
    domain: string,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    const rows = await this.table(trx)
      .select(
        "id",
        "timestamp",
        "response_log",
        "is_approved",
        "is_client_approved"
      )
      .where("domain", domain)
      .orderBy("timestamp", "asc");
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * Fetch the latest job for a domain with key data fields.
   */
  static async findLatestJobForKeyData(
    domain: string,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await this.table(trx)
      .select(
        "id",
        "timestamp",
        "status",
        "is_approved",
        "is_client_approved",
        "response_log"
      )
      .where("domain", domain)
      .orderBy("timestamp", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
