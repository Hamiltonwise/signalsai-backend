import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IProgrammaticPage {
  id: number;
  specialty_slug: string;
  city_slug: string;
  page_slug: string;
  specialty_name: string;
  city_name: string;
  state: string;
  state_abbr: string;
  lat: number | null;
  lng: number | null;
  title: string;
  meta_description: string | null;
  competitors_snapshot: CompetitorSnapshot[] | null;
  content_sections: ContentSection[] | null;
  schema_markup: Record<string, unknown> | null;
  conversion_rate: number;
  page_views: number;
  checkup_starts: number;
  status: "draft" | "published" | "needs_refresh";
  needs_refresh: boolean;
  published_at: Date | null;
  competitors_refreshed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CompetitorSnapshot {
  placeId: string;
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  phone?: string;
  website?: string;
}

export interface ContentSection {
  type: "hero" | "market_overview" | "competitors" | "faq" | "cta";
  heading: string;
  body: string;
}

export class ProgrammaticPageModel extends BaseModel {
  protected static tableName = "programmatic_pages";
  protected static jsonFields = [
    "competitors_snapshot",
    "content_sections",
    "schema_markup",
    "hub_spoke_links",
  ];

  static async findBySlug(
    slug: string,
    trx?: QueryContext
  ): Promise<IProgrammaticPage | undefined> {
    return this.findOne({ page_slug: slug }, trx);
  }

  static async findPublished(
    trx?: QueryContext
  ): Promise<IProgrammaticPage[]> {
    const rows = await this.table(trx)
      .where({ status: "published" })
      .orderBy("page_views", "desc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async findBySpecialty(
    specialtySlug: string,
    trx?: QueryContext
  ): Promise<IProgrammaticPage[]> {
    const rows = await this.table(trx)
      .where({ specialty_slug: specialtySlug, status: "published" })
      .orderBy("city_name", "asc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async findByCity(
    citySlug: string,
    trx?: QueryContext
  ): Promise<IProgrammaticPage[]> {
    const rows = await this.table(trx)
      .where({ city_slug: citySlug, status: "published" })
      .orderBy("specialty_name", "asc");
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async findNeedingRefresh(
    trx?: QueryContext
  ): Promise<IProgrammaticPage[]> {
    const rows = await this.table(trx)
      .where({ needs_refresh: true })
      .orWhere("competitors_refreshed_at", "<", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    return rows.map((r: unknown) => this.deserializeJsonFields(r));
  }

  static async publishBatch(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("id", ids)
      .whereNotNull("competitors_snapshot")
      .update({
        status: "published",
        published_at: new Date(),
        updated_at: new Date(),
      });
  }

  static async incrementViews(
    pageSlug: string,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx)
      .where({ page_slug: pageSlug })
      .increment("page_views", 1);
  }

  static async incrementCheckupStarts(
    pageSlug: string,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx)
      .where({ page_slug: pageSlug })
      .increment("checkup_starts", 1);
  }

  static async update(
    id: number,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.updateById(id, data, trx);
  }

  static async getStats(trx?: QueryContext): Promise<{
    total: number;
    published: number;
    draft: number;
    needsRefresh: number;
    totalViews: number;
    totalCheckupStarts: number;
  }> {
    const knex = trx || db;
    const result = await this.table(trx)
      .select(
        knex.raw("COUNT(*) as total"),
        knex.raw("COUNT(*) FILTER (WHERE status = 'published') as published"),
        knex.raw("COUNT(*) FILTER (WHERE status = 'draft') as draft"),
        knex.raw("COUNT(*) FILTER (WHERE needs_refresh = true) as needs_refresh"),
        knex.raw("COALESCE(SUM(page_views), 0) as total_views"),
        knex.raw("COALESCE(SUM(checkup_starts), 0) as total_checkup_starts")
      )
      .first();

    return {
      total: parseInt(result.total, 10),
      published: parseInt(result.published, 10),
      draft: parseInt(result.draft, 10),
      needsRefresh: parseInt(result.needs_refresh, 10),
      totalViews: parseInt(result.total_views, 10),
      totalCheckupStarts: parseInt(result.total_checkup_starts, 10),
    };
  }
}
