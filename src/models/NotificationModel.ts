import { BaseModel, QueryContext } from "./BaseModel";

export interface INotification {
  id: number;
  google_account_id: number | null;
  domain_name: string;
  title: string;
  message: string | null;
  type: "task" | "pms" | "agent" | "system" | "ranking";
  priority: string | null;
  read: boolean;
  read_timestamp: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class NotificationModel extends BaseModel {
  protected static tableName = "notifications";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<INotification | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdAndDomain(
    id: number,
    domainName: string,
    trx?: QueryContext
  ): Promise<INotification | undefined> {
    const row = await this.table(trx)
      .where({ id, domain_name: domainName })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByDomain(
    domainName: string,
    limit: number = 10,
    trx?: QueryContext
  ): Promise<INotification[]> {
    const rows = await this.table(trx)
      .where({ domain_name: domainName })
      .orderBy("created_at", "desc")
      .limit(limit)
      .select("*");
    return rows.map((row: INotification) =>
      this.deserializeJsonFields(row)
    );
  }

  static async countUnread(
    domainName: string,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ domain_name: domainName, read: false })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async create(
    data: Partial<INotification>,
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields({
      ...data,
      read: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const [result] = await this.table(trx).insert(serialized).returning("id");
    return typeof result === "object" ? result.id : result;
  }

  static async markRead(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      read: true,
      read_timestamp: new Date(),
      updated_at: new Date(),
    });
  }

  static async markAllRead(
    domainName: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ domain_name: domainName, read: false })
      .update({
        read: true,
        read_timestamp: new Date(),
        updated_at: new Date(),
      });
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  static async deleteAllByDomain(
    domainName: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ domain_name: domainName }).del();
  }
}
