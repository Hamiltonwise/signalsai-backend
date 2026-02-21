import { BaseModel, QueryContext } from "./BaseModel";

export interface IUser {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_verified: boolean;
  email_verification_code: string | null;
  email_verification_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UserModel extends BaseModel {
  protected static tableName = "users";

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    return super.findById(id, trx);
  }

  static async findByEmail(
    email: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.table(trx).where({ email: normalizedEmail }).first();
  }

  static async create(
    data: {
      email: string;
      name?: string;
      password_hash?: string;
      email_verification_code?: string;
      email_verification_expires_at?: Date;
    },
    trx?: QueryContext
  ): Promise<IUser> {
    const record: Record<string, unknown> = {
      email: data.email.toLowerCase(),
      name: data.name || data.email.toLowerCase().split("@")[0],
    };
    if (data.password_hash) record.password_hash = data.password_hash;
    if (data.email_verification_code)
      record.email_verification_code = data.email_verification_code;
    if (data.email_verification_expires_at)
      record.email_verification_expires_at =
        data.email_verification_expires_at;
    return super.create(record, trx);
  }

  static async findOrCreate(
    email: string,
    name?: string,
    trx?: QueryContext
  ): Promise<IUser> {
    const existing = await this.findByEmail(email, trx);
    if (existing) return existing;
    return this.create({ email, name }, trx);
  }

  static async updateProfile(
    id: number,
    data: { first_name?: string; last_name?: string; phone?: string },
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async setEmailVerified(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        email_verified: true,
        email_verification_code: null,
        email_verification_expires_at: null,
      },
      trx
    );
  }

  static async setVerificationCode(
    id: number,
    code: string,
    expiresAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      {
        email_verification_code: code,
        email_verification_expires_at: expiresAt,
      },
      trx
    );
  }

  static async findByVerificationCode(
    email: string,
    code: string,
    trx?: QueryContext
  ): Promise<IUser | undefined> {
    const normalizedEmail = email.toLowerCase();
    return this.table(trx)
      .where({
        email: normalizedEmail,
        email_verification_code: code,
      })
      .where("email_verification_expires_at", ">", new Date())
      .first();
  }
}
