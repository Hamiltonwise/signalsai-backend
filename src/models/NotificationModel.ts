import { BaseModel, QueryContext } from "./BaseModel";

export interface INotification {
  id: number;
  organization_id: number | null;
  location_id: number | null;
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

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  /**
   * Find notifications for an organization, optionally filtered by location.
   */
  static async findByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
      limit?: number;
    },
    trx?: QueryContext
  ): Promise<INotification[]> {
    const limit = options?.limit || 10;
    let query = this.table(trx)
      .where("organization_id", organizationId)
      .orderBy("created_at", "desc")
      .limit(limit);

    if (options?.locationId) {
      query = query.where("location_id", options.locationId);
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    const rows = await query.select("*");
    return rows.map((row: INotification) => this.deserializeJsonFields(row));
  }

  /**
   * Count unread notifications for an organization.
   */
  static async countUnreadByOrganization(
    organizationId: number,
    accessibleLocationIds?: number[],
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, read: false });

    if (accessibleLocationIds && accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    const result = await query.count("* as count").first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * Mark all notifications as read for an organization.
   */
  static async markAllReadByOrganization(
    organizationId: number,
    accessibleLocationIds?: number[],
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, read: false });

    if (accessibleLocationIds && accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    return query.update({
      read: true,
      read_timestamp: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Delete all notifications for an organization.
   */
  static async deleteAllByOrganization(
    organizationId: number,
    accessibleLocationIds?: number[],
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId });

    if (accessibleLocationIds && accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    return query.del();
  }

  /**
   * Find notification by ID and verify organization ownership.
   */
  static async findByIdAndOrganization(
    id: number,
    organizationId: number,
    trx?: QueryContext
  ): Promise<INotification | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: organizationId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
