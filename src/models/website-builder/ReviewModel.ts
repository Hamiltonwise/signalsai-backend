import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export type ReviewSource = "oauth" | "apify";

export interface IReview {
  id: string;
  location_id: number | null;
  google_review_name: string | null;
  source: ReviewSource;
  place_id: string | null;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: Date | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: Date | null;
  hidden: boolean;
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

export type ApifyReviewInput = {
  place_id: string;
  location_id: number | null;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: Date | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: Date | null;
};

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
    data: Omit<IReview, "id" | "hidden" | "created_at" | "updated_at" | "synced_at">,
    trx?: QueryContext
  ): Promise<IReview> {
    const now = new Date();
    const insertData = {
      ...data,
      hidden: false,
      synced_at: now,
      created_at: now,
      updated_at: now,
    };

    const updateData = { ...data, synced_at: now, updated_at: now };
    delete (updateData as any).google_review_name;

    const [result] = await (trx || db)("website_builder.reviews")
      .insert(insertData)
      .onConflict(db.raw("(google_review_name) WHERE google_review_name IS NOT NULL"))
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

  static async upsertApifyReview(
    data: ApifyReviewInput,
    trx?: QueryContext
  ): Promise<IReview> {
    const now = new Date();
    const insertData = {
      ...data,
      source: "apify" as const,
      google_review_name: null,
      synced_at: now,
      created_at: now,
      updated_at: now,
    };

    const updateData = {
      stars: data.stars,
      text: data.text,
      reviewer_photo_url: data.reviewer_photo_url,
      has_reply: data.has_reply,
      reply_text: data.reply_text,
      reply_date: data.reply_date,
      location_id: data.location_id,
      synced_at: now,
      updated_at: now,
    };

    const [result] = await (trx || db)("website_builder.reviews")
      .insert(insertData)
      .onConflict(db.raw("(place_id, reviewer_name, review_created_at) WHERE source = 'apify'"))
      .merge(updateData)
      .returning("*");

    return result;
  }

  static async replaceApifyReviewsForPlace(
    placeId: string,
    reviews: ApifyReviewInput[]
  ): Promise<number> {
    return db.transaction(async (trx) => {
      await this.table(trx)
        .where({ source: "apify", place_id: placeId })
        .del();

      for (const review of reviews) {
        await this.upsertApifyReview(review, trx);
      }

      return reviews.length;
    });
  }

  static async findByPlaceIds(
    placeIds: string[],
    filters?: ReviewFilters,
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx).whereIn("place_id", placeIds);

    if (filters?.minRating) {
      query = query.where("stars", ">=", filters.minRating);
    }

    query = query.orderBy("review_created_at", filters?.order || "desc");
    query = query.limit(filters?.limit || 10);
    query = query.offset(filters?.offset || 0);

    return query;
  }

  static async listForProject(
    opts: {
      locationIds: number[];
      placeIds: string[];
      search?: string;
      stars?: number;
      showHidden?: boolean;
    },
    trx?: QueryContext
  ): Promise<IReview[]> {
    const hasLocations = opts.locationIds.length > 0;
    const hasPlaces = opts.placeIds.length > 0;
    if (!hasLocations && !hasPlaces) return [];

    let query = this.table(trx).where(function () {
      if (hasLocations) this.whereIn("location_id", opts.locationIds);
      if (hasPlaces) this.orWhereIn("place_id", opts.placeIds);
    });

    if (opts.stars) {
      query = query.where("stars", opts.stars);
    }

    if (opts.search) {
      const term = `%${opts.search}%`;
      query = query.where(function () {
        this.whereILike("reviewer_name", term).orWhereILike("text", term);
      });
    }

    if (!opts.showHidden) {
      query = query.where("hidden", false);
    }

    return query.orderBy("review_created_at", "desc").limit(500);
  }

  static async toggleHidden(id: string, hidden: boolean, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).update({ hidden, updated_at: new Date() });
  }

  static async deleteReview(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).del();
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
