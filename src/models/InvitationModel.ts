import { BaseModel, QueryContext } from "./BaseModel";

export interface IInvitation {
  id: number;
  email: string;
  organization_id: number;
  role: string;
  token: string;
  expires_at: Date;
  status: "pending" | "accepted" | "expired";
  created_at: Date;
  updated_at: Date;
}

export class InvitationModel extends BaseModel {
  protected static tableName = "invitations";

  static async findByToken(
    token: string,
    trx?: QueryContext
  ): Promise<IInvitation | undefined> {
    return this.table(trx).where({ token }).first();
  }

  static async findPendingByEmail(
    email: string,
    trx?: QueryContext
  ): Promise<IInvitation | undefined> {
    return this.table(trx)
      .where({ email: email.toLowerCase(), status: "pending" })
      .first();
  }

  static async findPendingByOrg(
    orgId: number,
    trx?: QueryContext
  ): Promise<IInvitation[]> {
    return this.table(trx)
      .where({ organization_id: orgId, status: "pending" });
  }

  static async findPendingByOrgAndEmail(
    orgId: number,
    email: string,
    trx?: QueryContext
  ): Promise<IInvitation | undefined> {
    return this.table(trx)
      .where({
        organization_id: orgId,
        email: email.toLowerCase(),
        status: "pending",
      })
      .first();
  }

  static async listPendingByOrgWithSelect(
    orgId: number,
    trx?: QueryContext
  ): Promise<Pick<IInvitation, "id" | "email" | "role" | "created_at" | "expires_at">[]> {
    return this.table(trx)
      .where({ organization_id: orgId, status: "pending" })
      .select("id", "email", "role", "created_at", "expires_at");
  }

  static async create(
    data: Partial<IInvitation>,
    trx?: QueryContext
  ): Promise<IInvitation> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateStatus(
    id: number,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status }, trx);
  }
}
