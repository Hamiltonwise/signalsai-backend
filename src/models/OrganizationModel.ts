import { BaseModel, QueryContext } from "./BaseModel";

export interface IOrganization {
  id: number;
  name: string;
  domain: string | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_updated_at: Date | null;
  operational_jurisdiction: string | null;
  onboarding_completed: boolean;
  onboarding_wizard_completed: boolean;
  setup_progress: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class OrganizationModel extends BaseModel {
  protected static tableName = "organizations";
  protected static jsonFields = ["setup_progress"];

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
    data: { name: string; domain?: string },
    trx?: QueryContext
  ): Promise<IOrganization> {
    return super.create(data as Record<string, unknown>, trx);
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
      .select("id", "name", "domain", "subscription_tier", "created_at")
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
