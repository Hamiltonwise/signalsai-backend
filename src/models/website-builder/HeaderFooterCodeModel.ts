import { BaseModel, QueryContext } from "../BaseModel";

export interface IHeaderFooterCode {
  id: string;
  project_id: string | null;
  template_id: string | null;
  name: string;
  code: string;
  location: "header" | "footer";
  is_enabled: boolean;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class HeaderFooterCodeModel extends BaseModel {
  protected static tableName = "website_builder.header_footer_code";

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("sort_order", "asc");
  }

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    return this.table(trx)
      .where({ template_id: templateId })
      .orderBy("sort_order", "asc");
  }

  static async create(
    data: Partial<IHeaderFooterCode>,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateById(
    id: string,
    data: Partial<IHeaderFooterCode>,
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

  static async updateSortOrder(
    id: string,
    sortOrder: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { sort_order: sortOrder }, trx);
  }

  static async toggleEnabled(
    id: string,
    isEnabled: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { is_enabled: isEnabled }, trx);
  }
}
