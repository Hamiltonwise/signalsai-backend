import { BaseModel, QueryContext } from "./BaseModel";

export interface IOtpCode {
  id: number;
  email: string;
  code: string;
  used: boolean;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export class OtpCodeModel extends BaseModel {
  protected static tableName = "otp_codes";

  static async create(
    data: { email: string; code: string; expires_at: Date },
    trx?: QueryContext
  ): Promise<IOtpCode> {
    return super.create(
      { ...data, email: data.email.toLowerCase() },
      trx
    );
  }

  static async findValidCode(
    email: string,
    code: string,
    trx?: QueryContext
  ): Promise<IOtpCode | undefined> {
    return this.table(trx)
      .where({ email: email.toLowerCase(), code, used: false })
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .first();
  }

  static async markUsed(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { used: true }, trx);
  }
}
