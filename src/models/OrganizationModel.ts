import { BaseModel, QueryContext } from "./BaseModel";

export interface IOrganization {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "saas" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: "active" | "inactive" | "trial" | "cancelled";
  subscription_started_at: Date | null;
  subscription_updated_at: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_quantity_override: number | null;
  operational_jurisdiction: string | null;
  onboarding_completed: boolean;
  onboarding_wizard_completed: boolean;
  setup_progress: Record<string, unknown> | null;
  business_data: Record<string, unknown> | null;
  referral_code: string | null;
  referred_by_org_id: number | null;
  website_edits_this_month: number;
  website_edits_reset_at: Date | null;
  gbp_access_token: string | null;
  gbp_refresh_token: string | null;
  gbp_account_id: string | null;
  gbp_connected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class OrganizationModel extends BaseModel {
  protected static tableName = "organizations";
  protected static jsonFields = ["setup_progress", "business_data"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return super.findById(id, trx);
  }

  static async findByDomain(
    domain: string,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return this.table(trx).where({ domain }).first();
  }

  static async create(
    data: { name: string; domain?: string; referral_code?: string; referred_by_org_id?: number },
    trx?: QueryContext
  ): Promise<IOrganization> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async findByReferralCode(
    code: string,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return this.table(trx).where({ referral_code: code }).first();
  }

  static async updateById(
    id: number,
    data: Partial<IOrganization>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updateTier(
    id: number,
    tier: "DWY" | "DFY",
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { subscription_tier: tier, subscription_updated_at: new Date() },
      trx
    );
  }

  static async listAll(trx?: QueryContext): Promise<IOrganization[]> {
    return this.table(trx)
      .select("id", "name", "domain", "subscription_tier", "subscription_status", "created_at")
      .where("subscription_status", "active")
      .orderBy("created_at", "desc");
  }

  static async completeOnboarding(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { onboarding_completed: true }, trx);
  }

  static async updateSetupProgress(
    id: number,
    progress: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { setup_progress: progress } as Record<string, unknown>,
      trx
    );
  }
}
