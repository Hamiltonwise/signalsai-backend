import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostTag {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export class PostTagModel extends BaseModel {
  protected static tableName = "website_builder.post_tags";

  static async findByPostTypeId(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<IPostTag[]> {
    return this.table(trx)
      .where({ post_type_id: postTypeId })
      .orderBy("name", "asc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPostTag | undefined> {
    return super.findById(id, trx);
  }

  static async findBySlug(
    postTypeId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPostTag | undefined> {
    return this.table(trx)
      .where({ post_type_id: postTypeId, slug })
      .first();
  }

  static async create(
    data: Partial<IPostTag>,
    trx?: QueryContext
  ): Promise<IPostTag> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPostTag>,
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
