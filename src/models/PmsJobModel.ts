import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IPmsJob {
  id: number;
  organization_id: number | null;
  location_id: number | null;
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
  organization_id?: number;
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

  static async listAdmin(
    filters: PmsJobFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (filters.organization_id) {
        qb = qb.where("organization_id", filters.organization_id);
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
   * Optionally filter by organization.
   */
  static async findActiveAutomationJobs(
    organizationId?: number,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .whereNotNull("automation_status_detail")
      .whereRaw(
        "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
      )
      .select(
        "id",
        "organization_id",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "created_at"
      )
      .orderBy("created_at", "desc");

    if (organizationId) {
      query = query.where("organization_id", organizationId);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * List jobs for an organization, optionally filtered by location.
   */
  static async listByOrganization(
    organizationId: number,
    pagination: PaginationParams,
    options?: {
      locationId?: number | null;
      status?: string;
      isApproved?: boolean;
    },
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("organization_id", organizationId);
      if (options?.locationId) {
        qb = qb.where("location_id", options.locationId);
      }
      if (options?.status) {
        qb = qb.where("status", options.status);
      }
      if (options?.isApproved !== undefined) {
        qb = qb.where("is_approved", options.isApproved);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IPmsJob>(buildQuery, pagination, trx);
  }

  /**
   * Fetch jobs for key data aggregation by organization.
   */
  static async findJobsForKeyDataByOrganization(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .select(
        "id",
        "created_at",
        "response_log",
        "is_approved",
        "is_client_approved"
      )
      .where("organization_id", organizationId)
      .orderBy("created_at", "asc");

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }
}
