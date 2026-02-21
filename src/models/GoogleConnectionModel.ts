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
  // These fields still exist on the google_connections table during
  // migration. Plans 04+ will move them to Organization or remove them.
  // ---------------------------------------------------------------
  user_id: number;
  domain_name: string | null;
  practice_name: string | null;
  phone: string | null;
  operational_jurisdiction: string | null;
  first_name: string | null;
  last_name: string | null;
  onboarding_completed: boolean;
  onboarding_wizard_completed: boolean;
  setup_progress: Record<string, unknown> | null;
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
   * Find a connection by Google user ID and a secondary key.
   * During migration, the second parameter can be either a userId or an organizationId.
   * The method tries organization_id first, then falls back to user_id for backward compat.
   *
   * @deprecated Plan 04 will standardize this to organization_id only.
   */
  static async findByGoogleUserId(
    googleUserId: string,
    userOrOrgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    // Try organization_id first (new pattern)
    let row = await this.table(trx)
      .where({ google_user_id: googleUserId, organization_id: userOrOrgId })
      .first();

    // Fall back to user_id (old pattern) if not found
    if (!row) {
      row = await this.table(trx)
        .where({ google_user_id: googleUserId, user_id: userOrOrgId })
        .first();
    }

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
   * @deprecated Plan 04 will refactor callers to use organization-based lookups.
   */
  static async findByUserId(
    userId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx).where({ user_id: userId }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * @deprecated Plan 04 will remove this. Old google_accounts had onboarding_completed.
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
   * @deprecated Plan 04 will remove this. Old google_accounts had onboarding_completed.
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
   * @deprecated Plan 04 will remove this. Domain will live on Organization.
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
   * @deprecated Plan 04 will remove this. Domain will live on Organization.
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
