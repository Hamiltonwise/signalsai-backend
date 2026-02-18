import { BaseModel, QueryContext } from "./BaseModel";

export interface IUser {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
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
    data: { email: string; name?: string },
    trx?: QueryContext
  ): Promise<IUser> {
    return super.create(
      {
        email: data.email.toLowerCase(),
        name: data.name || data.email.toLowerCase().split("@")[0],
      },
      trx
    );
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
}
