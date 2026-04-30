import { db } from "../../database/connection";
import {
  BaseModel,
  QueryContext,
} from "../BaseModel";
import {
  createProjectIdentityShell,
  getProjectIdentityBrandMirror,
  parseProjectIdentity,
  prepareProjectIdentityForSave,
  setProjectIdentityWarmupStatus,
  type ProjectIdentityRecord,
  type WarmupStatus,
} from "../../controllers/admin-websites/feature-utils/util.project-identity";

export class ProjectIdentityModel extends BaseModel {
  protected static tableName = "website_builder.projects";

  static async findEnvelopeByProjectId<T = ProjectIdentityRecord>(
    projectId: string,
    trx?: QueryContext,
  ): Promise<{ exists: boolean; identity: T | null }> {
    const row = await this.table(trx)
      .where("id", projectId)
      .select("project_identity")
      .first();

    return {
      exists: Boolean(row),
      identity: row ? parseProjectIdentity<T>(row.project_identity) : null,
    };
  }

  static async findByProjectId<T = ProjectIdentityRecord>(
    projectId: string,
    trx?: QueryContext,
  ): Promise<T | null> {
    const row = await this.table(trx)
      .where("id", projectId)
      .select("project_identity")
      .first();

    if (!row) return null;
    return parseProjectIdentity<T>(row.project_identity);
  }

  static async updateByProjectId(
    projectId: string,
    identity: ProjectIdentityRecord,
    options: { mirrorBrand?: boolean } = {},
    trx?: QueryContext,
  ): Promise<number> {
    const nextIdentity = prepareProjectIdentityForSave(identity);
    const payload: Record<string, unknown> = {
      project_identity: JSON.stringify(nextIdentity),
      updated_at: db.fn.now(),
    };

    if (options.mirrorBrand) {
      Object.assign(payload, getProjectIdentityBrandMirror(nextIdentity));
    }

    return this.table(trx).where("id", projectId).update(payload);
  }

  static async patchByProjectId(
    projectId: string,
    updater: (identity: ProjectIdentityRecord) => ProjectIdentityRecord | void,
    options: { mirrorBrand?: boolean } = {},
    trx?: QueryContext,
  ): Promise<ProjectIdentityRecord | null> {
    const existing =
      await this.findByProjectId<ProjectIdentityRecord>(projectId, trx);
    const identity = existing || createProjectIdentityShell();
    const updatedIdentity = updater(identity) || identity;
    const updated = await this.updateByProjectId(
      projectId,
      updatedIdentity,
      options,
      trx,
    );

    return updated === 0 ? null : updatedIdentity;
  }

  static async setWarmupStatus(
    projectId: string,
    status: WarmupStatus,
    trx?: QueryContext,
  ): Promise<number> {
    const existing =
      await this.findByProjectId<ProjectIdentityRecord>(projectId, trx);
    const identity = setProjectIdentityWarmupStatus(
      existing || createProjectIdentityShell(),
      status,
    );

    return this.table(trx)
      .where("id", projectId)
      .update({
        project_identity: JSON.stringify(identity),
        updated_at: db.fn.now(),
      });
  }
}
