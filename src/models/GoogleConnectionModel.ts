import { BaseModel, QueryContext } from "./BaseModel";

export interface IGoogleConnection {
  id: number;
  google_user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_type: string | null;
  expiry_date: Date | null;
  scopes: string | null;
  organization_id: number;
  google_property_ids: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;

  // ---------------------------------------------------------------
  // Transitional fields (carried over from IGoogleAccount)
  // These fields were dropped in migration 20260221000004.
  // Keeping in interface temporarily for callers that still reference them.
  // ---------------------------------------------------------------
  domain_name?: string | null;
  practice_name?: string | null;
  phone?: string | null;
  operational_jurisdiction?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  onboarding_completed?: boolean;
  onboarding_wizard_completed?: boolean;
  setup_progress?: Record<string, unknown> | null;
}

export class GoogleConnectionModel extends BaseModel {
  protected static tableName = "google_connections";
  protected static jsonFields = ["google_property_ids", "setup_progress"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Find a connection by Google user ID.
   * The user_id column was dropped in migration 20260221000004.
   * Looks up by google_user_id only; optionally narrows by organization_id.
   */
  static async findByGoogleUserId(
    googleUserId: string,
    organizationId?: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const query = this.table(trx).where({ google_user_id: googleUserId });

    if (organizationId) {
      query.andWhere({ organization_id: organizationId });
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId });
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findOneByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: orgId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IGoogleConnection>,
    trx?: QueryContext
  ): Promise<IGoogleConnection> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IGoogleConnection>,
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

  // =====================================================================
  // Backward-compatible methods (temporary)
  // These methods preserve the old GoogleAccountModel signatures so that
  // callers compile while migration Plans 04+ refactor them away.
  // =====================================================================

  /**
   * @deprecated Use organizations table directly. Kept for backward compat during migration.
   */
  static async findOnboardedAccounts(
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where("onboarding_completed", true)
      .select("id", "domain_name", "practice_name", "google_property_ids")
      .orderBy("practice_name", "asc");
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  /**
   * @deprecated Use organizations table directly. Kept for backward compat during migration.
   */
  static async findOnboardedClients(
    trx?: QueryContext
  ): Promise<Pick<IGoogleConnection, "id" | "email">[]> {
    return this.table(trx)
      .where("onboarding_completed", true)
      .select("id", "domain_name", "email")
      .orderBy("domain_name", "asc");
  }

  /**
   * @deprecated Use LocationModel/OrganizationModel. Kept for backward compat during migration.
   */
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

  /**
   * @deprecated Use LocationModel/OrganizationModel. Kept for backward compat during migration.
   */
  static async findByDomain(
    domainName: string,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx)
      .where({ domain_name: domainName })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Generic findOne for arbitrary where clauses.
   * @deprecated Plan 04 will replace callers with specific query methods.
   */
  static async findOne(
    where: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx).where(where).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
