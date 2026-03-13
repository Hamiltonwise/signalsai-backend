import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IReview {
  id: string;
  location_id: number;
  google_review_name: string;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: Date | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: Date | null;
  synced_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ReviewFilters {
  minRating?: number;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export class ReviewModel extends BaseModel {
  protected static tableName = "website_builder.reviews";

  static async findByLocationId(
    locationId: number,
    filters?: ReviewFilters,
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx).where({ location_id: locationId });

    if (filters?.minRating) {
      query = query.where("stars", ">=", filters.minRating);
    }

    query = query.orderBy(
      "review_created_at",
      filters?.order || "desc"
    );

    query = query.limit(filters?.limit || 10);
    query = query.offset(filters?.offset || 0);

    return query;
  }

  static async upsertByGoogleName(
    data: Omit<IReview, "id" | "created_at" | "updated_at" | "synced_at">,
    trx?: QueryContext
  ): Promise<IReview> {
    const now = new Date();
    const insertData = {
      ...data,
      synced_at: now,
      created_at: now,
      updated_at: now,
    };

    const updateData = { ...data, synced_at: now, updated_at: now };
    delete (updateData as any).google_review_name;

    const [result] = await (trx || db)("website_builder.reviews")
      .insert(insertData)
      .onConflict("google_review_name")
      .merge(updateData)
      .returning("*");

    return result;
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IReview | undefined> {
    return super.findById(id, trx);
  }

  static async deleteByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ location_id: locationId }).del();
  }

  static async countByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.count({ location_id: locationId }, trx);
  }
}
