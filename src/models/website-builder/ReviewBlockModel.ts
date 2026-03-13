import { BaseModel, QueryContext } from "../BaseModel";

export interface IReviewBlock {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class ReviewBlockModel extends BaseModel {
  protected static tableName = "website_builder.review_blocks";
  protected static jsonFields = ["sections"];

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IReviewBlock[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("created_at", "asc");
    return rows.map((row: IReviewBlock) => this.deserializeJsonFields(row));
  }

  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IReviewBlock | undefined> {
    const row = await this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IReviewBlock | undefined> {
    const row = await super.findById(id, trx);
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IReviewBlock>,
    trx?: QueryContext
  ): Promise<IReviewBlock> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IReviewBlock>,
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
