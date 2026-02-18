import { BaseModel, QueryContext } from "../BaseModel";

export interface ITemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

export class TemplateModel extends BaseModel {
  protected static tableName = "website_builder.templates";

  static async findAll(trx?: QueryContext): Promise<ITemplate[]> {
    return this.table(trx).orderBy("name", "asc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ITemplate | undefined> {
    return super.findById(id, trx);
  }
}
