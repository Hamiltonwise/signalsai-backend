import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostCategory {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export class PostCategoryModel extends BaseModel {
  protected static tableName = "website_builder.post_categories";

  static async findByPostTypeId(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<IPostCategory[]> {
    return this.table(trx)
      .where({ post_type_id: postTypeId })
      .orderBy("sort_order", "asc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPostCategory | undefined> {
    return super.findById(id, trx);
  }

  static async findBySlug(
    postTypeId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPostCategory | undefined> {
    return this.table(trx)
      .where({ post_type_id: postTypeId, slug })
      .first();
  }

  static async create(
    data: Partial<IPostCategory>,
    trx?: QueryContext
  ): Promise<IPostCategory> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPostCategory>,
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
