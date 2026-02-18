import { BaseModel, QueryContext } from "./BaseModel";

export interface IGoogleAccount {
  id: number;
  user_id: number;
  google_user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_type: string | null;
  expiry_date: Date | null;
  scopes: string | null;
  domain_name: string | null;
  practice_name: string | null;
  phone: string | null;
  operational_jurisdiction: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_id: number | null;
  onboarding_completed: boolean;
  onboarding_wizard_completed: boolean;
  google_property_ids: Record<string, unknown> | null;
  setup_progress: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class GoogleAccountModel extends BaseModel {
  protected static tableName = "google_accounts";
  protected static jsonFields = ["google_property_ids", "setup_progress"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleAccount | undefined> {
    return super.findById(id, trx);
  }

  static async findByUserId(
    userId: number,
    trx?: QueryContext
  ): Promise<IGoogleAccount | undefined> {
    const row = await this.table(trx).where({ user_id: userId }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByGoogleUserId(
    googleUserId: string,
    userId: number,
    trx?: QueryContext
  ): Promise<IGoogleAccount | undefined> {
    const row = await this.table(trx)
      .where({ google_user_id: googleUserId, user_id: userId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByDomain(
    domainName: string,
    trx?: QueryContext
  ): Promise<IGoogleAccount | undefined> {
    const row = await this.table(trx)
      .where({ domain_name: domainName })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findOnboardedAccounts(
    trx?: QueryContext
  ): Promise<IGoogleAccount[]> {
    const rows = await this.table(trx)
      .where("onboarding_completed", true)
      .select("id", "domain_name", "practice_name", "google_property_ids")
      .orderBy("practice_name", "asc");
    return rows.map((row: IGoogleAccount) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findOnboardedClients(
    trx?: QueryContext
  ): Promise<Pick<IGoogleAccount, "id" | "domain_name" | "email">[]> {
    return this.table(trx)
      .where("onboarding_completed", true)
      .select("id", "domain_name", "email")
      .orderBy("domain_name", "asc");
  }

  static async getDomainFromAccountId(
    accountId: number,
    trx?: QueryContext
  ): Promise<string | null> {
    const account = await this.table(trx)
      .where({ id: accountId })
      .select("domain_name")
      .first();
    return account?.domain_name || null;
  }

  static async create(
    data: Partial<IGoogleAccount>,
    trx?: QueryContext
  ): Promise<IGoogleAccount> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IGoogleAccount>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updatePropertyIds(
    id: number,
    propertyIds: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { google_property_ids: propertyIds } as Record<string, unknown>,
      trx
    );
  }

  static async findByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<Pick<IGoogleAccount, "id" | "email" | "google_property_ids">[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId })
      .select("id", "email", "google_property_ids");
    return rows.map((row: IGoogleAccount) => this.deserializeJsonFields(row));
  }

  static async updateTokens(
    id: number,
    tokens: {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expiry_date?: Date;
      scopes?: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, tokens as Record<string, unknown>, trx);
  }
}
