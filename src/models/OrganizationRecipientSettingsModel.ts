import { BaseModel, QueryContext } from "./BaseModel";

export const RECIPIENT_CHANNELS = [
  "website_form",
  "agent_notifications",
] as const;

export type RecipientChannel = (typeof RECIPIENT_CHANNELS)[number];

export interface IOrganizationRecipientSetting {
  id: number;
  organization_id: number;
  channel: RecipientChannel;
  recipients: string[];
  created_at: Date;
  updated_at: Date;
}

export class OrganizationRecipientSettingsModel extends BaseModel {
  protected static tableName = "organization_recipient_settings";
  protected static jsonFields = ["recipients"];

  static async findByOrganizationAndChannel(
    organizationId: number,
    channel: RecipientChannel,
    trx?: QueryContext
  ): Promise<IOrganizationRecipientSetting | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId, channel })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listByOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<IOrganizationRecipientSetting[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId })
      .orderBy("channel", "asc");
    return rows.map((row: IOrganizationRecipientSetting) =>
      this.deserializeJsonFields(row)
    );
  }

  static async upsertRecipients(
    organizationId: number,
    channel: RecipientChannel,
    recipients: string[],
    trx?: QueryContext
  ): Promise<IOrganizationRecipientSetting> {
    const payload = this.serializeJsonFields({
      organization_id: organizationId,
      channel,
      recipients,
      updated_at: new Date(),
    });

    const [row] = await this.table(trx)
      .insert({
        ...payload,
        created_at: new Date(),
      })
      .onConflict(["organization_id", "channel"])
      .merge({
        recipients: payload.recipients,
        updated_at: payload.updated_at,
      })
      .returning("*");

    return this.deserializeJsonFields(row);
  }
}

