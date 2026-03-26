import { db } from "../database/connection";

export interface IReviewRequest {
  id: string;
  organization_id: number;
  location_id: number | null;
  place_id: string | null;
  recipient_email: string;
  recipient_phone: string | null;
  recipient_name: string | null;
  delivery_method: "email" | "sms";
  google_review_url: string;
  status: "sent" | "clicked" | "converted";
  sent_at: Date;
  clicked_at: Date | null;
  converted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class ReviewRequestModel {
  private static table() {
    return db("review_requests");
  }

  static async create(data: {
    organization_id: number;
    location_id?: number | null;
    place_id?: string | null;
    recipient_email?: string | null;
    recipient_phone?: string | null;
    recipient_name?: string | null;
    delivery_method: "email" | "sms";
    google_review_url: string;
  }): Promise<IReviewRequest> {
    const [row] = await this.table()
      .insert({
        organization_id: data.organization_id,
        location_id: data.location_id ?? null,
        place_id: data.place_id ?? null,
        recipient_email: data.recipient_email ?? "",
        recipient_phone: data.recipient_phone ?? null,
        recipient_name: data.recipient_name ?? null,
        delivery_method: data.delivery_method,
        google_review_url: data.google_review_url,
        status: "sent",
        sent_at: new Date(),
      })
      .returning("*");
    return row;
  }

  static async findById(id: string): Promise<IReviewRequest | undefined> {
    return this.table().where({ id }).first();
  }

  static async markClicked(id: string): Promise<void> {
    await this.table()
      .where({ id })
      .whereNot({ status: "converted" }) // don't regress from converted
      .update({ status: "clicked", clicked_at: new Date(), updated_at: new Date() });
  }

  static async markConverted(id: string): Promise<void> {
    await this.table()
      .where({ id })
      .update({ status: "converted", converted_at: new Date(), updated_at: new Date() });
  }

  static async listByOrganization(
    orgId: number,
    limit = 50,
    offset = 0
  ): Promise<{ requests: IReviewRequest[]; total: number }> {
    const [requests, [{ count }]] = await Promise.all([
      this.table()
        .where({ organization_id: orgId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset),
      this.table().where({ organization_id: orgId }).count("id as count"),
    ]);
    return { requests, total: Number(count) };
  }

  static async getStats(orgId: number): Promise<{
    total: number;
    clicked: number;
    converted: number;
  }> {
    const rows = await this.table()
      .where({ organization_id: orgId })
      .select("status")
      .count("id as count")
      .groupBy("status");

    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = Number(r.count);
    }

    const total = (counts.sent ?? 0) + (counts.clicked ?? 0) + (counts.converted ?? 0);
    return {
      total,
      clicked: (counts.clicked ?? 0) + (counts.converted ?? 0),
      converted: counts.converted ?? 0,
    };
  }

  static async countTodayByOrg(orgId: number): Promise<number> {
    const [{ count }] = await this.table()
      .where({ organization_id: orgId })
      .whereRaw("sent_at >= CURRENT_DATE")
      .count("id as count");
    return Number(count);
  }
}
