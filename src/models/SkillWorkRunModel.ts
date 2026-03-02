import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type WorkRunStatus =
  | "pending"
  | "running"
  | "consulting"
  | "creating"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

export interface ISkillWorkRun {
  id: string;
  skill_id: string;
  triggered_by: string;
  triggered_at: Date;
  status: WorkRunStatus;
  artifact_type: string | null;
  artifact_url: string | null;
  artifact_content: string | null;
  artifact_attachment_type: string | null;
  artifact_attachment_url: string | null;
  title: string | null;
  description: string | null;
  approved_by_admin_id: string | null;
  approved_at: Date | null;
  rejection_category: string | null;
  rejection_reason: string | null;
  rejected_by_admin_id: string | null;
  rejected_at: Date | null;
  published_at: Date | null;
  publication_url: string | null;
  n8n_run_id: string | null;
  error: string | null;
  embedding: number[] | null;
  digest_batch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const VALID_TRANSITIONS: Record<WorkRunStatus, WorkRunStatus[]> = {
  pending: ["running", "failed"],
  running: ["consulting", "creating", "awaiting_review", "failed"],
  consulting: ["creating", "awaiting_review", "failed"],
  creating: ["awaiting_review", "failed"],
  awaiting_review: ["approved", "rejected"],
  approved: ["publishing", "published"],
  rejected: [],
  publishing: ["published", "failed"],
  published: [],
  failed: ["pending"],
};

export class SkillWorkRunModel extends BaseModel {
  protected static tableName = "minds.skill_work_runs";

  static isValidTransition(from: WorkRunStatus, to: WorkRunStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static async listBySkill(
    skillId: string,
    limit = 50,
    offset = 0,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    return this.table(trx)
      .where({ skill_id: skillId })
      .orderBy("triggered_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  static async listByStatus(
    status: WorkRunStatus,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    return this.table(trx)
      .where({ status })
      .orderBy("triggered_at", "desc");
  }

  static async findStuckRuns(
    timeoutMinutes: number,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    return this.table(trx)
      .whereIn("status", ["pending", "running", "consulting", "creating"])
      .where("triggered_at", "<", cutoff)
      .orderBy("triggered_at", "asc");
  }

  static async updateStatus(
    id: string,
    status: WorkRunStatus,
    extra: Partial<ISkillWorkRun> = {},
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status, ...extra, updated_at: new Date() });
  }

  static async countBySkillAndStatus(
    skillId: string,
    status: WorkRunStatus,
    trx?: QueryContext
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ skill_id: skillId, status })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async recentApproved(
    skillId: string,
    limit = 30,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    return this.table(trx)
      .where({ skill_id: skillId, status: "approved" })
      .orWhere({ skill_id: skillId, status: "published" })
      .orderBy("approved_at", "desc")
      .limit(limit);
  }

  static async recentRejected(
    skillId: string,
    limit = 20,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    return this.table(trx)
      .where({ skill_id: skillId, status: "rejected" })
      .orderBy("rejected_at", "desc")
      .limit(limit);
  }

  // ─── Works History Metadata (lightweight, for webhook payloads) ──

  static async getWorksHistoryMetadata(
    skillId: string,
    limit = 50,
    trx?: QueryContext
  ): Promise<Array<{ title: string; description: string; status: "approved" | "rejected"; rejection_reason: string | null }>> {
    const rows = await this.table(trx)
      .where({ skill_id: skillId })
      .whereIn("status", ["approved", "published", "rejected"])
      .select("title", "description", "status", "rejection_reason", "approved_at", "rejected_at")
      .orderByRaw("COALESCE(approved_at, rejected_at) DESC")
      .limit(limit);

    return rows.map((r: any) => ({
      title: r.title || "Untitled",
      description: r.description || "",
      status: r.status === "published" ? "approved" as const : r.status as "approved" | "rejected",
      rejection_reason: r.rejection_reason || null,
    }));
  }

  // ─── Embedding / Dedup ─────────────────────────────────────────

  static async setEmbedding(
    id: string,
    embedding: number[],
    trx?: QueryContext
  ): Promise<void> {
    const conn = trx || db;
    await conn.raw(
      `UPDATE minds.skill_work_runs SET embedding = ?::vector, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(embedding), id]
    );
  }

  static async findSimilarApprovedWorks(
    skillId: string,
    queryEmbedding: number[],
    threshold = 0.85,
    limit = 5,
    trx?: QueryContext
  ): Promise<Array<ISkillWorkRun & { similarity: number }>> {
    const conn = trx || db;
    const embeddingStr = JSON.stringify(queryEmbedding);

    const rows = await conn.raw(
      `SELECT *,
              1 - (embedding <=> ?::vector) AS similarity
       FROM minds.skill_work_runs
       WHERE skill_id = ?
         AND status IN ('approved', 'published')
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> ?::vector) > ?
       ORDER BY embedding <=> ?::vector
       LIMIT ?`,
      [embeddingStr, skillId, embeddingStr, threshold, embeddingStr, limit]
    );

    return rows.rows || rows;
  }

  // ─── Digest Support ───────────────────────────────────────────

  static async approvedBeyondRecent(
    skillId: string,
    recentLimit = 30,
    trx?: QueryContext
  ): Promise<ISkillWorkRun[]> {
    return this.table(trx)
      .where({ skill_id: skillId })
      .whereIn("status", ["approved", "published"])
      .whereNull("digest_batch_id")
      .orderBy("approved_at", "desc")
      .offset(recentLimit);
  }

  static async markDigested(
    ids: string[],
    digestBatchId: string,
    trx?: QueryContext
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.table(trx)
      .whereIn("id", ids)
      .update({ digest_batch_id: digestBatchId, updated_at: new Date() });
  }
}
