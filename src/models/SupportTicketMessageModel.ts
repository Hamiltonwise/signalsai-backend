import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export type SupportMessageAuthorRole = "client" | "admin" | "system";
export type SupportMessageVisibility = "client_visible" | "internal";

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_user_id: number | null;
  author_role: SupportMessageAuthorRole;
  visibility: SupportMessageVisibility;
  body: string;
  created_at: Date | string;
  updated_at: Date | string;
  author_name?: string | null;
  author_email?: string | null;
}

export class SupportTicketMessageModel extends BaseModel {
  protected static tableName = "support_ticket_messages";

  static async create(
    data: Partial<SupportTicketMessage>,
    trx?: QueryContext
  ): Promise<SupportTicketMessage> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async listForTicket(
    ticketId: string,
    options: { includeInternal?: boolean } = {},
    trx?: QueryContext
  ): Promise<SupportTicketMessage[]> {
    const query = this.table(trx)
      .select(
        "support_ticket_messages.*",
        "users.email as author_email",
        db.raw(
          "COALESCE(users.name, NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS author_name"
        )
      )
      .leftJoin("users", "users.id", "support_ticket_messages.author_user_id")
      .where("support_ticket_messages.ticket_id", ticketId)
      .orderBy("support_ticket_messages.created_at", "asc");

    if (!options.includeInternal) {
      query.where("support_ticket_messages.visibility", "client_visible");
    }

    return query;
  }
}
