import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface ITask {
  id: number;
  domain_name: string;
  google_account_id: number | null;
  title: string;
  description: string | null;
  category: "ALLORO" | "USER";
  agent_type: string | null;
  status: "pending" | "in_progress" | "complete" | "archived";
  is_approved: boolean;
  created_by_admin: boolean;
  due_date: Date | null;
  completed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskAdminFilters {
  domain_name?: string;
  status?: string;
  category?: string;
  agent_type?: string;
  is_approved?: boolean;
  date_from?: string;
  date_to?: string;
}

export class TaskModel extends BaseModel {
  protected static tableName = "tasks";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdAndDomain(
    id: number,
    domainName: string,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    const row = await this.table(trx)
      .where({ id, domain_name: domainName })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByDomainApproved(
    domainName: string,
    trx?: QueryContext
  ): Promise<ITask[]> {
    const rows = await this.table(trx)
      .where({ domain_name: domainName, is_approved: true })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc")
      .select("*");
    return rows.map((row: ITask) => this.deserializeJsonFields(row));
  }

  static async findByMetadataField(
    field: string,
    value: string,
    trx?: QueryContext
  ): Promise<ITask[]> {
    const rows = await this.table(trx)
      .whereRaw(`metadata::jsonb->>'${field}' = ?`, [value]);
    return rows.map((row: ITask) => this.deserializeJsonFields(row));
  }

  static async create(
    data: Partial<ITask>,
    trx?: QueryContext
  ): Promise<ITask> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<ITask>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async markComplete(
    id: number,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    const now = new Date();
    await this.table(trx).where({ id }).update({
      status: "complete",
      completed_at: now,
      updated_at: now,
    });
    return this.findById(id, trx);
  }

  static async findUserTasksForApproval(
    taskIds: number[],
    trx?: QueryContext
  ): Promise<Array<{ domain_name: string }>> {
    return this.table(trx)
      .whereIn("id", taskIds)
      .where("is_approved", false)
      .where("category", "USER")
      .select("domain_name");
  }

  static async archive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "archived",
      updated_at: new Date(),
    });
  }

  static async bulkArchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({
      status: "archived",
      updated_at: new Date(),
    });
  }

  static async bulkUpdateStatus(
    ids: number[],
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (status === "complete") {
      updateData.completed_at = new Date();
    }
    return this.table(trx).whereIn("id", ids).update(updateData);
  }

  static async bulkUpdateApproval(
    ids: number[],
    isApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({
      is_approved: isApproved,
      updated_at: new Date(),
    });
  }

  static async bulkInsert(
    tasks: Partial<ITask>[],
    trx?: QueryContext
  ): Promise<void> {
    const serialized = tasks.map((task) =>
      this.serializeJsonFields({
        ...task,
        created_at: new Date(),
        updated_at: new Date(),
      })
    );
    await this.table(trx).insert(serialized);
  }

  static async listAdmin(
    filters: TaskAdminFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<ITask>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (filters.domain_name) {
        qb = qb.where("domain_name", filters.domain_name);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      } else {
        qb = qb.whereNot("status", "archived");
      }
      if (filters.category) {
        qb = qb.where("category", filters.category);
      }
      if (filters.agent_type) {
        qb = qb.where("agent_type", filters.agent_type);
      }
      if (filters.is_approved !== undefined) {
        qb = qb.where("is_approved", filters.is_approved);
      }
      if (filters.date_from) {
        qb = qb.where("created_at", ">=", filters.date_from);
      }
      if (filters.date_to) {
        qb = qb.where("created_at", "<=", filters.date_to);
      }
      return qb.orderBy("created_at", "desc");
    };

    return this.paginate<ITask>(buildQuery, pagination, trx);
  }

  static async findRecentByDomain(
    domainName: string,
    agentType: string,
    limit: number,
    trx?: QueryContext
  ): Promise<ITask[]> {
    const rows = await this.table(trx)
      .where({ domain_name: domainName, agent_type: agentType })
      .orderBy("created_at", "desc")
      .limit(limit);
    return rows.map((row: ITask) => this.deserializeJsonFields(row));
  }
}
