import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";
import { encrypt, decrypt } from "../utils/encryption";

export interface IPlatformCredential {
  id: string;
  mind_id: string;
  platform: string;
  credential_type: string;
  encrypted_credentials: string;
  label: string | null;
  status: string;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Columns returned in list/find queries (excludes encrypted_credentials). */
const SAFE_COLUMNS = [
  "id",
  "mind_id",
  "platform",
  "credential_type",
  "label",
  "status",
  "expires_at",
  "created_at",
  "updated_at",
];

export class PlatformCredentialModel extends BaseModel {
  protected static tableName = "minds.platform_credentials";

  /**
   * List all credentials for a mind.
   * Excludes encrypted_credentials for safety.
   */
  static async listByMind(
    mindId: string,
    trx?: QueryContext
  ): Promise<Omit<IPlatformCredential, "encrypted_credentials">[]> {
    return db("minds.platform_credentials")
      .select(SAFE_COLUMNS)
      .where({ mind_id: mindId })
      .orderBy("created_at", "desc");
  }

  /**
   * Find a credential by mind + platform.
   * Excludes encrypted_credentials for safety.
   */
  static async findByMindAndPlatform(
    mindId: string,
    platform: string,
    trx?: QueryContext
  ): Promise<Omit<IPlatformCredential, "encrypted_credentials"> | undefined> {
    return db("minds.platform_credentials")
      .select(SAFE_COLUMNS)
      .where({ mind_id: mindId, platform })
      .first();
  }

  /**
   * Create a new platform credential.
   * Encrypts the plaintext `credentials` field before inserting.
   */
  static async create(
    data: {
      mind_id: string;
      platform: string;
      credential_type?: string;
      credentials: string;
      label?: string | null;
      status?: string;
      expires_at?: Date | null;
    },
    trx?: QueryContext
  ): Promise<IPlatformCredential> {
    const { credentials, credential_type, ...rest } = data;
    const encrypted_credentials = encrypt(credentials);

    const [result] = await db("minds.platform_credentials")
      .insert({
        ...rest,
        credential_type: credential_type || "api_key",
        encrypted_credentials,
        status: rest.status || "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return result;
  }

  /**
   * Retrieve and decrypt credentials by ID.
   * Internal use only -- never expose the return value directly to clients.
   */
  static async getDecryptedCredentials(id: string): Promise<string | null> {
    const row = await db("minds.platform_credentials")
      .select("encrypted_credentials")
      .where({ id })
      .first();

    if (!row) return null;
    return decrypt(row.encrypted_credentials);
  }
}
