import { BaseModel, QueryContext } from "./BaseModel";

export interface ILocation {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  business_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class LocationModel extends BaseModel {
  protected static tableName = "locations";
  protected static jsonFields = ["business_data"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return super.findById(id, trx);
  }

  static async findByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ILocation[]> {
    return this.table(trx)
      .where({ organization_id: organizationId })
      .orderBy("is_primary", "desc")
      .orderBy("name", "asc");
  }

  static async findPrimaryByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return this.table(trx)
      .where({ organization_id: organizationId, is_primary: true })
      .first();
  }

  static async findByDomain(
    domain: string,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return this.table(trx).where({ domain }).first();
  }

  static async create(
    data: Omit<ILocation, "id" | "created_at" | "updated_at" | "business_data"> & { business_data?: Record<string, unknown> | null },
    trx?: QueryContext
  ): Promise<ILocation> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<ILocation>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }
}
