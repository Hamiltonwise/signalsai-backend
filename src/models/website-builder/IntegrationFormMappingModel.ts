import { BaseModel, QueryContext } from "../BaseModel";

export type MappingStatus = "active" | "broken";

export interface IIntegrationFormMapping {
  id: string;
  integration_id: string;
  website_form_name: string;
  vendor_form_id: string;
  vendor_form_name: string | null;
  field_mapping: Record<string, string>;
  status: MappingStatus;
  last_validated_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export class IntegrationFormMappingModel extends BaseModel {
  protected static tableName = "website_builder.website_integration_form_mappings";

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IIntegrationFormMapping | undefined> {
    return this.table(trx).where({ id }).first();
  }

  static async findByIntegrationId(
    integrationId: string,
    trx?: QueryContext,
  ): Promise<IIntegrationFormMapping[]> {
    return this.table(trx)
      .where({ integration_id: integrationId })
      .orderBy("created_at", "desc");
  }

  static async findByIntegrationAndWebsiteForm(
    integrationId: string,
    websiteFormName: string,
    trx?: QueryContext,
  ): Promise<IIntegrationFormMapping | undefined> {
    return this.table(trx)
      .where({ integration_id: integrationId, website_form_name: websiteFormName })
      .first();
  }

  static async create(
    data: {
      integration_id: string;
      website_form_name: string;
      vendor_form_id: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
      status?: MappingStatus;
    },
    trx?: QueryContext,
  ): Promise<IIntegrationFormMapping> {
    const [result] = await this.table(trx)
      .insert({
        ...data,
        field_mapping: data.field_mapping ?? {},
        status: data.status ?? "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return result as IIntegrationFormMapping;
  }

  static async update(
    id: string,
    data: {
      vendor_form_id?: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
      status?: MappingStatus;
      last_validated_at?: Date | null;
      last_error?: string | null;
    },
    trx?: QueryContext,
  ): Promise<IIntegrationFormMapping | undefined> {
    const [result] = await this.table(trx)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return result as IIntegrationFormMapping | undefined;
  }

  static async deleteById(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  static async updateStatus(
    id: string,
    status: MappingStatus,
    last_error: string | null = null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status, last_error, last_validated_at: new Date(), updated_at: new Date() });
  }

  /**
   * Mark all mappings for an integration as broken EXCEPT those whose
   * vendor_form_id is in the list of currently-valid vendor IDs.
   * Used by the daily validation job.
   */
  static async bulkMarkBrokenForMissingVendorForms(
    integrationId: string,
    validVendorFormIds: string[],
    trx?: QueryContext,
  ): Promise<number> {
    const qb = this.table(trx)
      .where({ integration_id: integrationId, status: "active" });
    if (validVendorFormIds.length > 0) {
      qb.whereNotIn("vendor_form_id", validVendorFormIds);
    }
    return qb.update({
      status: "broken",
      last_error: "Vendor form not found during daily validation",
      last_validated_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Mark all currently-active mappings for an integration as validated NOW.
   * Used after a successful daily validation pass to record liveness.
   */
  static async bulkMarkValidated(
    integrationId: string,
    validVendorFormIds: string[],
    trx?: QueryContext,
  ): Promise<number> {
    if (validVendorFormIds.length === 0) return 0;
    return this.table(trx)
      .where({ integration_id: integrationId, status: "active" })
      .whereIn("vendor_form_id", validVendorFormIds)
      .update({
        last_validated_at: new Date(),
        last_error: null,
        updated_at: new Date(),
      });
  }
}
