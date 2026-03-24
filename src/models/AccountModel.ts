/**
 * Account Model — billing entity above organizations
 *
 * An Account represents a customer (e.g., Kargoli / One Endodontics).
 * It owns one or more Locations. It holds billing/subscription state.
 */

import { db } from "../database/connection";

export interface IAccount {
  id: string;
  name: string;
  owner_user_id: number | null;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  baa_signed: boolean;
  baa_signed_at: Date | null;
  legacy_organization_id: number | null;
  created_at: Date;
}

export class AccountModel {
  static async findById(id: string): Promise<IAccount | undefined> {
    return db("accounts").where({ id }).first();
  }

  static async findByLegacyOrgId(orgId: number): Promise<IAccount | undefined> {
    return db("accounts").where({ legacy_organization_id: orgId }).first();
  }

  static async findByOwnerId(userId: number): Promise<IAccount[]> {
    return db("accounts").where({ owner_user_id: userId });
  }

  static async listAll(): Promise<IAccount[]> {
    return db("accounts").orderBy("created_at", "desc");
  }

  static async create(data: Partial<IAccount>): Promise<IAccount> {
    const [row] = await db("accounts").insert(data).returning("*");
    return row;
  }

  static async updateById(
    id: string,
    data: Partial<IAccount>,
  ): Promise<number> {
    return db("accounts").where({ id }).update(data);
  }
}
