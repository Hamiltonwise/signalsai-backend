import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostType {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: Record<string, unknown>[];
  single_template: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class PostTypeModel extends BaseModel {
  protected static tableName = "website_builder.post_types";
  protected static jsonFields = ["schema", "single_template"];

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IPostType[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("created_at", "asc");
    return rows.map((row: IPostType) => this.deserializeJsonFields(row));
  }

  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPostType | undefined> {
    const row = await this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPostType | undefined> {
    const row = await super.findById(id, trx);
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IPostType>,
    trx?: QueryContext
  ): Promise<IPostType> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPostType>,
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
