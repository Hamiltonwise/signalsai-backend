import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "../BaseModel";

export interface IMedia {
  id: string;
  project_id: string;
  filename: string;
  display_name: string | null;
  original_filename: string | null;
  s3_key: string;
  s3_url: string;
  file_size: number;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  thumbnail_s3_key: string | null;
  thumbnail_s3_url: string | null;
  original_mime_type: string | null;
  compressed: boolean | null;
  alt_text: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MediaFilters {
  type?: "all" | "image" | "video" | "pdf";
  search?: string;
}

export interface MetadataUpdate {
  display_name?: string;
  alt_text?: string;
}

export class MediaModel extends BaseModel {
  protected static tableName = "website_builder.media";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IMedia | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Find media by ID scoped to a specific project (ownership check)
   */
  static async findByIdAndProject(
    id: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IMedia | undefined> {
    return this.table(trx)
      .where({ id, project_id: projectId })
      .first();
  }

  static async findByProjectId(
    projectId: string,
    pagination: PaginationParams,
    mimeTypeFilter?: string,
    search?: string,
    trx?: QueryContext
  ): Promise<PaginatedResult<IMedia>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("project_id", projectId);
      if (mimeTypeFilter) {
        qb = qb.where("mime_type", "like", `${mimeTypeFilter}%`);
      }
      if (search) {
        qb = qb.where("filename", "ilike", `%${search}%`);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IMedia>(buildQuery, pagination, trx);
  }

  /**
   * Find media by project with type/search filters and pagination.
   * Returns { data, total } where data is the paginated slice and total is full count.
   *
   * Search checks both filename and display_name (ilike).
   * Type filter maps: image -> image/%, video -> video/%, pdf -> application/pdf.
   */
  static async findByProjectWithFilters(
    projectId: string,
    filters: MediaFilters,
    pagination: { page: number; limit: number },
    trx?: QueryContext
  ): Promise<{ data: IMedia[]; total: number }> {
    const offset = (pagination.page - 1) * pagination.limit;

    const applyFilters = (qb: Knex.QueryBuilder): Knex.QueryBuilder => {
      qb = qb.where({ project_id: projectId });

      if (filters.type && filters.type !== "all") {
        if (filters.type === "image") {
          qb = qb.where("mime_type", "like", "image/%");
        } else if (filters.type === "video") {
          qb = qb.where("mime_type", "like", "video/%");
        } else if (filters.type === "pdf") {
          qb = qb.where("mime_type", "application/pdf");
        }
      }

      if (filters.search) {
        qb = qb.where(function (this: Knex.QueryBuilder) {
          this.where("filename", "ilike", `%${filters.search}%`).orWhere(
            "display_name",
            "ilike",
            `%${filters.search}%`
          );
        });
      }

      return qb;
    };

    const countResult = await applyFilters(this.table(trx))
      .count("* as count")
      .first();
    const total = parseInt(countResult?.count as string || "0");

    const data = await applyFilters(this.table(trx))
      .orderBy("created_at", "desc")
      .limit(pagination.limit)
      .offset(offset);

    return { data, total };
  }

  /**
   * Find all media for a project (non-paginated), ordered by created_at DESC.
   * Used for the user-facing website overview.
   */
  static async findAllByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IMedia[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc");
  }

  /**
   * Find media with only the fields needed for AI context building.
   * Returns display_name, s3_url, alt_text, mime_type, width, height.
   */
  static async findForAIContext(
    projectId: string,
    trx?: QueryContext
  ): Promise<
    Pick<
      IMedia,
      "display_name" | "s3_url" | "alt_text" | "mime_type" | "width" | "height"
    >[]
  > {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc")
      .select(
        "display_name",
        "s3_url",
        "alt_text",
        "mime_type",
        "width",
        "height"
      );
  }

  static async create(
    data: Partial<IMedia>,
    trx?: QueryContext
  ): Promise<IMedia> {
    return super.create(data as Record<string, unknown>, trx);
  }

  /**
   * Update media metadata (display_name, alt_text) and return updated record.
   * Always sets updated_at to current timestamp.
   */
  static async updateMetadata(
    id: string,
    updates: MetadataUpdate,
    trx?: QueryContext
  ): Promise<IMedia> {
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (updates.display_name !== undefined) updateData.display_name = updates.display_name;
    if (updates.alt_text !== undefined) updateData.alt_text = updates.alt_text;

    const [updated] = await this.table(trx)
      .where({ id })
      .update(updateData)
      .returning("*");
    return updated;
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async getProjectStorageUsage(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId })
      .sum("file_size as total")
      .first();
    return parseInt(result?.total as string, 10) || 0;
  }
}
