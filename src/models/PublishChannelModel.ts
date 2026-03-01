import { BaseModel, QueryContext } from "./BaseModel";

export interface IPublishChannel {
  id: string;
  name: string;
  webhook_url: string;
  description: string | null;
  status: "active" | "disabled";
  created_at: Date;
  updated_at: Date;
}

export class PublishChannelModel extends BaseModel {
  protected static tableName = "minds.publish_channels";

  static async listAll(
    trx?: QueryContext,
  ): Promise<IPublishChannel[]> {
    return this.table(trx)
      .orderBy("created_at", "asc");
  }

  static async listActive(
    trx?: QueryContext,
  ): Promise<IPublishChannel[]> {
    return this.table(trx)
      .where({ status: "active" })
      .orderBy("created_at", "asc");
  }
}
