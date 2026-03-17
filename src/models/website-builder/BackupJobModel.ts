import { db } from "../../database/connection";

const TABLE = "website_builder.backup_jobs";

export interface IBackupJob {
  id: string;
  project_id: string;
  type: "backup" | "restore";
  status: "queued" | "processing" | "completed" | "failed";
  progress_message: string | null;
  progress_current: number;
  progress_total: number;
  s3_key: string | null;
  file_size: number | null;
  filename: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export class BackupJobModel {
  static async create(data: {
    project_id: string;
    type: "backup" | "restore";
    filename?: string;
  }): Promise<IBackupJob> {
    const [result] = await db(TABLE)
      .insert({
        project_id: data.project_id,
        type: data.type,
        status: "queued",
        filename: data.filename || null,
        created_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async findById(id: string): Promise<IBackupJob | null> {
    return db(TABLE).where({ id }).first() || null;
  }

  static async findByProjectId(
    projectId: string,
    type?: "backup" | "restore"
  ): Promise<IBackupJob[]> {
    let query = db(TABLE)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc");
    if (type) {
      query = query.where({ type });
    }
    return query;
  }

  static async findCompletedBackups(projectId: string): Promise<IBackupJob[]> {
    return db(TABLE)
      .where({ project_id: projectId, type: "backup", status: "completed" })
      .orderBy("created_at", "desc");
  }

  static async findActive(
    projectId: string,
    type?: "backup" | "restore"
  ): Promise<IBackupJob | null> {
    let query = db(TABLE)
      .where({ project_id: projectId })
      .whereIn("status", ["queued", "processing"]);
    if (type) {
      query = query.where({ type });
    }
    const row = await query.first();
    if (!row) return null;

    // Auto-expire stale jobs (stuck for 30+ minutes in queued or processing)
    const createdAt = new Date(row.created_at).getTime();
    const staleThreshold = 30 * 60 * 1000;
    if (Date.now() - createdAt > staleThreshold) {
      await db(TABLE).where({ id: row.id }).update({
        status: "failed",
        error_message: row.status === "queued"
          ? "Job never started (worker may not have been running)"
          : "Job timed out",
      });
      return null;
    }

    return row;
  }

  static async markProcessing(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ status: "processing" });
  }

  static async updateProgress(
    id: string,
    message: string,
    current: number,
    total: number
  ): Promise<void> {
    await db(TABLE).where({ id }).update({
      progress_message: message,
      progress_current: current,
      progress_total: total,
    });
  }

  static async markCompleted(
    id: string,
    data: { s3_key?: string; file_size?: number; filename?: string } = {}
  ): Promise<void> {
    await db(TABLE).where({ id }).update({
      status: "completed",
      s3_key: data.s3_key || undefined,
      file_size: data.file_size || undefined,
      filename: data.filename || undefined,
      completed_at: new Date(),
    });
  }

  static async markFailed(id: string, errorMessage: string): Promise<void> {
    await db(TABLE).where({ id }).update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date(),
    });
  }

  static async deleteById(id: string): Promise<void> {
    await db(TABLE).where({ id }).del();
  }

  static async countByProjectId(
    projectId: string,
    type: "backup" | "restore"
  ): Promise<number> {
    const [{ count }] = await db(TABLE)
      .where({ project_id: projectId, type, status: "completed" })
      .count("id as count");
    return Number(count);
  }

  static async findOldestCompleted(
    projectId: string
  ): Promise<IBackupJob | null> {
    return (
      db(TABLE)
        .where({ project_id: projectId, type: "backup", status: "completed" })
        .orderBy("created_at", "asc")
        .first() || null
    );
  }
}
