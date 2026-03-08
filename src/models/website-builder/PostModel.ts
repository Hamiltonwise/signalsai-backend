import { BaseModel, QueryContext } from "../BaseModel";

export interface IPost {
  id: string;
  project_id: string;
  post_type_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  custom_fields: Record<string, unknown>;
  status: "draft" | "published";
  sort_order: number;
  seo_data: Record<string, unknown> | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields (not always present)
  categories?: string[];
  tags?: string[];
}

export class PostModel extends BaseModel {
  protected static tableName = "website_builder.posts";
  protected static jsonFields = ["custom_fields", "seo_data"];

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IPost[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");
  }

  static async findByProjectAndType(
    projectId: string,
    postTypeId: string,
    status?: string,
    trx?: QueryContext
  ): Promise<IPost[]> {
    let query = this.table(trx).where({
      project_id: projectId,
      post_type_id: postTypeId,
    });
    if (status) {
      query = query.where({ status });
    }
    return query.orderBy("sort_order", "asc").orderBy("created_at", "desc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdAndProject(
    postId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return this.table(trx)
      .where({ id: postId, project_id: projectId })
      .first();
  }

  static async findBySlug(
    projectId: string,
    postTypeId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPost | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, post_type_id: postTypeId, slug })
      .first();
  }

  static async create(
    data: Partial<IPost>,
    trx?: QueryContext
  ): Promise<IPost> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPost>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }
}
