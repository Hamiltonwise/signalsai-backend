import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IOrganizationUser {
  user_id: number;
  organization_id: number;
  role: "admin" | "manager" | "viewer";
  created_at: Date;
  updated_at: Date;
}

export interface IOrganizationUserWithUser extends IOrganizationUser {
  name: string;
  email: string;
}

export class OrganizationUserModel extends BaseModel {
  protected static tableName = "organization_users";

  static async findByUserAndOrg(
    userId: number,
    orgId: number,
    trx?: QueryContext
  ): Promise<IOrganizationUser | undefined> {
    return this.table(trx)
      .where({ user_id: userId, organization_id: orgId })
      .first();
  }

  static async findByUserId(
    userId: number,
    trx?: QueryContext
  ): Promise<IOrganizationUser | undefined> {
    return this.table(trx).where({ user_id: userId }).first();
  }

  static async create(
    data: {
      user_id: number;
      organization_id: number;
      role: string;
    },
    trx?: QueryContext
  ): Promise<IOrganizationUser> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateRole(
    userId: number,
    orgId: number,
    role: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ user_id: userId, organization_id: orgId })
      .update({ role, updated_at: new Date() });
  }

  static async deleteByUserAndOrg(
    userId: number,
    orgId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ user_id: userId, organization_id: orgId })
      .del();
  }

  static async listByOrgWithUsers(
    orgId: number,
    trx?: QueryContext
  ): Promise<IOrganizationUserWithUser[]> {
    return (trx || db)("organization_users")
      .join("users", "organization_users.user_id", "users.id")
      .where("organization_users.organization_id", orgId)
      .select(
        "organization_users.user_id",
        "organization_users.organization_id",
        "organization_users.role",
        "organization_users.created_at",
        "organization_users.updated_at",
        "users.name",
        "users.email"
      );
  }

  static async listUsersForOrg(
    orgId: number,
    trx?: QueryContext
  ): Promise<{ id: number; email: string; name: string | null; role: string; joined_at: Date }[]> {
    return (trx || db)("organization_users")
      .join("users", "organization_users.user_id", "users.id")
      .where("organization_users.organization_id", orgId)
      .select(
        "users.id",
        "users.email",
        "users.name",
        "organization_users.role",
        "organization_users.created_at as joined_at"
      );
  }

  static async findByOrgAndEmail(
    orgId: number,
    email: string,
    trx?: QueryContext
  ): Promise<IOrganizationUserWithUser | undefined> {
    return (trx || db)("organization_users")
      .join("users", "organization_users.user_id", "users.id")
      .where({
        "organization_users.organization_id": orgId,
        "users.email": email.toLowerCase(),
      })
      .first();
  }

  static async countByOrg(
    orgId: number,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ organization_id: orgId })
      .count("user_id as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
