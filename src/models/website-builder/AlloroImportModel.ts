import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IAlloroImport {
  id: string;
  filename: string;
  display_name: string;
  type: string;
  version: number;
  status: "active" | "published" | "deprecated";
  text_content: string | null;
  s3_key: string | null;
  s3_bucket: string | null;
  file_size: number | null;
  mime_type: string | null;
  content_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ImportFilters {
  type?: string;
  status?: string;
  search?: string;
}

export class AlloroImportModel extends BaseModel {
  protected static tableName = "website_builder.alloro_imports";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IAlloroImport | undefined> {
    return super.findById(id, trx);
  }

  static async findByFilenameAndStatus(
    filename: string,
    status: string,
    trx?: QueryContext
  ): Promise<IAlloroImport | undefined> {
    return this.table(trx).where({ filename, status }).first();
  }

  static async findByFilename(
    filename: string,
    trx?: QueryContext
  ): Promise<IAlloroImport[]> {
    return this.table(trx)
      .where({ filename })
      .orderBy("version", "desc");
  }

  static async findByFilenameAndVersion(
    filename: string,
    version: number,
    trx?: QueryContext
  ): Promise<IAlloroImport | undefined> {
    return this.table(trx).where({ filename, version }).first();
  }

  static async create(
    data: Partial<IAlloroImport>,
    trx?: QueryContext
  ): Promise<IAlloroImport> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateStatus(
    id: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status }, trx);
  }

  static async updateStatusByFilename(
    filename: string,
    fromStatus: string,
    toStatus: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ filename, status: fromStatus })
      .update({ status: toStatus, updated_at: (trx || db).fn.now() });
  }

  static async deleteByFilename(
    filename: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ filename }).del();
  }

  static async getLatestVersion(
    filename: string,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ filename })
      .max("version as max_version")
      .first();
    return (result?.max_version as number) || 0;
  }

  static async listAll(
    filters?: ImportFilters,
    trx?: QueryContext
  ): Promise<IAlloroImport[]> {
    let query = this.table(trx).select("*");
    if (filters?.type && filters.type !== "all") {
      query = query.where("type", filters.type);
    }
    return query.orderBy("filename", "asc").orderBy("version", "desc");
  }

  static async listWithFilters(
    filters: ImportFilters,
    trx?: QueryContext
  ): Promise<IAlloroImport[]> {
    let query = this.table(trx).select("*");

    if (filters.type && filters.type !== "all") {
      query = query.where("type", filters.type);
    }
    if (filters.status && filters.status !== "all") {
      query = query.where("status", filters.status);
    }
    if (filters.search) {
      const search = filters.search;
      query = query.where(function () {
        this.where("filename", "ilike", `%${search}%`).orWhere(
          "display_name",
          "ilike",
          `%${search}%`
        );
      });
    }

    return query.orderBy("filename", "asc").orderBy("version", "desc");
  }

  static async findVersionsForDeletion(
    filename: string,
    trx?: QueryContext
  ): Promise<Array<{ id: string; s3_key: string | null; version: number }>> {
    return this.table(trx)
      .where("filename", filename)
      .select("id", "s3_key", "version");
  }

  static async findPublishedVersionExcludingId(
    filename: string,
    excludeId: string,
    trx?: QueryContext
  ): Promise<IAlloroImport | undefined> {
    return this.table(trx)
      .where({ filename, status: "published" })
      .whereNot("id", excludeId)
      .first();
  }

  static async updateStatusReturning(
    id: string,
    status: string,
    trx?: QueryContext
  ): Promise<IAlloroImport> {
    const [updated] = await this.table(trx)
      .where("id", id)
      .update({ status, updated_at: (trx || db).fn.now() })
      .returning("*");
    return updated;
  }
}
