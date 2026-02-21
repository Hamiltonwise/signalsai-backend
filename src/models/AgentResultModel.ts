import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IAgentResult {
  id: number;
  organization_id: number;
  domain: string;
  agent_type: string;
  date_start: string | null;
  date_end: string | null;
  data: Record<string, unknown> | null;
  agent_input: Record<string, unknown> | null;
  agent_output: Record<string, unknown> | null;
  status: "success" | "pending" | "error" | "archived";
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentResultFilters {
  domain?: string;
  agent_type?: string;
  status?: string;
  exclude_status?: string;
  date_from?: string;
  date_to?: string;
}

export class AgentResultModel extends BaseModel {
  protected static tableName = "agent_results";
  protected static jsonFields = ["data", "agent_input", "agent_output"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    return super.findById(id, trx);
  }

  static async findByDomainAndAgent(
    domain: string,
    agentType: string,
    dateStart?: string,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    let query = this.table(trx).where({ domain, agent_type: agentType });
    if (dateStart) {
      query = query.where({ date_start: dateStart });
    }
    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findLatestByDomainAndAgent(
    domain: string,
    agentType: string,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    const row = await this.table(trx)
      .where({ domain, agent_type: agentType })
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IAgentResult>,
    trx?: QueryContext
  ): Promise<IAgentResult> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IAgentResult>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async archive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status: "archived" }, trx);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async listAdmin(
    filters: AgentResultFilters,
    pagination: PaginationParams,
    trx?: QueryContext,
    columns?: string[]
  ): Promise<PaginatedResult<IAgentResult>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (columns && columns.length > 0) {
        qb = qb.select(columns);
      }
      if (filters.domain) {
        qb = qb.where("domain", filters.domain);
      }
      if (filters.agent_type) {
        qb = qb.where("agent_type", filters.agent_type);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.exclude_status) {
        qb = qb.whereNot("status", filters.exclude_status);
      }
      if (filters.date_from) {
        qb = qb.where("created_at", ">=", filters.date_from);
      }
      if (filters.date_to) {
        qb = qb.where("created_at", "<=", filters.date_to);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IAgentResult>(buildQuery, pagination, trx);
  }

  static async findByIdWithDetails(
    id: number,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    const row = await this.table(trx).where("id", id).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async unarchive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status: "success" }, trx);
  }

  static async bulkArchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("id", ids)
      .whereNot("status", "archived")
      .update({
        status: "archived",
        updated_at: new Date(),
      });
  }

  static async bulkUnarchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("id", ids)
      .where("status", "archived")
      .update({
        status: "success",
        updated_at: new Date(),
      });
  }

  static async bulkDelete(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  static async getStatsByStatus(
    trx?: QueryContext
  ): Promise<Record<string, number>> {
    const rows = await this.table(trx)
      .select("status")
      .count("* as count")
      .groupBy("status");

    const result: Record<string, number> = {};
    rows.forEach((row: any) => {
      result[row.status] = parseInt(row.count, 10);
    });
    return result;
  }

  static async getStatsByAgentType(
    excludeArchived = true,
    trx?: QueryContext
  ): Promise<Record<string, number>> {
    let query = this.table(trx)
      .select("agent_type")
      .count("* as count")
      .groupBy("agent_type");

    if (excludeArchived) {
      query = query.whereNot("status", "archived");
    }

    const rows = await query;
    const result: Record<string, number> = {};
    rows.forEach((row: any) => {
      result[row.agent_type] = parseInt(row.count, 10);
    });
    return result;
  }

  static async getRecentCount(
    days: number,
    excludeArchived = true,
    trx?: QueryContext
  ): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    let query = this.table(trx)
      .where("created_at", ">=", dateThreshold)
      .count("* as count");

    if (excludeArchived) {
      query = query.whereNot("status", "archived");
    }

    const result = await query.first();
    return parseInt((result as any)?.count || "0", 10);
  }

  static async listDomains(
    excludeValues?: string[],
    trx?: QueryContext
  ): Promise<string[]> {
    let query = this.table(trx)
      .distinct("domain")
      .whereNotNull("domain")
      .orderBy("domain", "asc");

    if (excludeValues && excludeValues.length > 0) {
      query = query.whereNotIn("domain", excludeValues);
    }

    const rows = await query;
    return rows.map((row: { domain: string }) => row.domain).filter(Boolean);
  }

  static async listAgentTypes(trx?: QueryContext): Promise<string[]> {
    const rows = await this.table(trx)
      .distinct("agent_type")
      .whereNotNull("agent_type")
      .orderBy("agent_type", "asc");
    return rows.map((row: { agent_type: string }) => row.agent_type);
  }

  /**
   * Delete agent results by agent type array and date range.
   * Used by the clear-month-data endpoint to remove guardian and
   * governance_sentinel results for a specific month.
   */
  static async deleteByAgentTypesAndDateRange(
    agentTypes: string[],
    startDate: string,
    endDateTime: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("agent_type", agentTypes)
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .del();
  }
}
