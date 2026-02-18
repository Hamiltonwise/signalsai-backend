import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IPracticeRanking {
  id: number;
  google_account_id: number;
  domain: string;
  specialty: string | null;
  location: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_location_name: string | null;
  batch_id: string | null;
  observed_at: Date | null;
  status: "pending" | "processing" | "completed" | "failed";
  status_detail: Record<string, unknown> | null;
  rank_keywords: string | null;
  search_city: string | null;
  search_state: string | null;
  search_county: string | null;
  search_postal_code: string | null;
  llm_analysis: Record<string, unknown> | null;
  ranking_factors: Record<string, unknown> | null;
  raw_data: Record<string, unknown> | null;
  rank_score: number | null;
  rank_position: number | null;
  total_competitors: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RankingFilters {
  status?: string;
  gbp_location_id?: string;
  batch_id?: string;
}

export class PracticeRankingModel extends BaseModel {
  protected static tableName = "practice_rankings";
  protected static jsonFields = [
    "status_detail",
    "llm_analysis",
    "ranking_factors",
    "raw_data",
  ];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    return super.findById(id, trx);
  }

  static async findByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx).where({ batch_id: batchId });
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }

  static async create(
    data: Partial<IPracticeRanking>,
    trx?: QueryContext
  ): Promise<IPracticeRanking> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateById(
    id: number,
    data: Partial<IPracticeRanking>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updateStatus(
    id: number,
    status: string,
    statusDetail?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const updateData: Record<string, unknown> = { status };
    if (statusDetail !== undefined) {
      updateData.status_detail = statusDetail;
    }
    return super.updateById(id, updateData, trx);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async deleteByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ batch_id: batchId }).del();
  }

  static async listByAccount(
    googleAccountId: number,
    filters: RankingFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPracticeRanking>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("google_account_id", googleAccountId);
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.gbp_location_id) {
        qb = qb.where("gbp_location_id", filters.gbp_location_id);
      }
      if (filters.batch_id) {
        qb = qb.where("batch_id", filters.batch_id);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IPracticeRanking>(buildQuery, pagination, trx);
  }

  static async findLatestByAccountAndLocation(
    googleAccountId: number,
    gbpLocationId: string,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    const row = await this.table(trx)
      .where({
        google_account_id: googleAccountId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .orderBy("created_at", "desc")
      .first();
    return row
      ? this.deserializeJsonFields(row)
      : undefined;
  }

  static async findLatestBatchByAccount(
    googleAccountId: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    const row = await this.table(trx)
      .where({ google_account_id: googleAccountId })
      .orderBy("created_at", "desc")
      .first();
    return row
      ? this.deserializeJsonFields(row)
      : undefined;
  }

  static async findLatestCompletedByLocations(
    googleAccountId: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx)
      .where({
        google_account_id: googleAccountId,
        status: "completed",
      })
      .orderBy("created_at", "desc");
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findPreviousByLocation(
    googleAccountId: number,
    gbpLocationId: string,
    beforeDate: Date,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx)
      .where({
        google_account_id: googleAccountId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .where("created_at", "<", beforeDate)
      .orderBy("created_at", "desc");
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }
}
