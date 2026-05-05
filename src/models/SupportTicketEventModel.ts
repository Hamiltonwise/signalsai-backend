import { BaseModel, QueryContext } from "./BaseModel";

export interface SupportTicketEvent {
  id: string;
  ticket_id: string;
  actor_user_id: number | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}

export class SupportTicketEventModel extends BaseModel {
  protected static tableName = "support_ticket_events";
  protected static jsonFields = ["metadata"];

  static async create(
    data: Partial<SupportTicketEvent>,
    trx?: QueryContext
  ): Promise<SupportTicketEvent> {
    const serialized = this.serializeJsonFields(data as Record<string, unknown>);
    const [row] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(row);
  }
}
