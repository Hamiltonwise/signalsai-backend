import { BaseModel, QueryContext } from "./BaseModel";

export interface IGoogleProperty {
  id: number;
  google_connection_id: number;
  type: "gbp";
  external_id: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  selected: boolean;
  created_at: Date;
  updated_at: Date;
}

export class GooglePropertyModel extends BaseModel {
  protected static tableName = "google_properties";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    return super.findById(id, trx);
  }

  static async findByConnectionId(
    googleConnectionId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty[]> {
    const rows = await this.table(trx)
      .where({ google_connection_id: googleConnectionId });
    return rows.map((row: IGoogleProperty) =>
      this.deserializeJsonFields(row)
    );
  }

  static async create(
    data: Partial<IGoogleProperty>,
    trx?: QueryContext
  ): Promise<IGoogleProperty> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }
}
