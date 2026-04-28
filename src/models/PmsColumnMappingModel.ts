import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";
import type { ColumnMapping } from "../types/pmsMapping";

/**
 * Persistence layer for `pms_column_mappings` — the per-org cache and the
 * engineering-controlled global library.
 *
 * Two row shapes share one table (see migration
 * 20260427000001_create_pms_column_mappings.ts):
 *   - org cache: `organization_id IS NOT NULL`, `is_global=false`,
 *     `require_confirmation=false`. Tier 1 dispatch.
 *   - global library: `organization_id IS NULL`, `is_global=true`,
 *     `require_confirmation=true` (default). Tier 2 dispatch. Seed-only.
 *
 * `seedGlobal` is the only writer for global rows and is called from the
 * Knex seed file — never from app code.
 */

export interface IPmsColumnMapping {
  id: number;
  organization_id: number | null;
  header_signature: string;
  mapping: ColumnMapping;
  is_global: boolean;
  require_confirmation: boolean;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
  usage_count: number;
}

export class PmsColumnMappingModel extends BaseModel {
  protected static tableName = "pms_column_mappings";
  protected static jsonFields = ["mapping"];

  /**
   * Tier 1 dispatch: look up an org-cached mapping by signature.
   * Returns `undefined` when the org has never confirmed this signature.
   */
  static async findByOrgAndSignature(
    organizationId: number,
    headerSignature: string,
    trx?: QueryContext
  ): Promise<IPmsColumnMapping | undefined> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        header_signature: headerSignature,
        is_global: false,
      })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Tier 2 dispatch: look up a global-library entry by signature.
   * Engineering-curated; never written from app code.
   */
  static async findGlobalBySignature(
    headerSignature: string,
    trx?: QueryContext
  ): Promise<IPmsColumnMapping | undefined> {
    const row = await this.table(trx)
      .where({ header_signature: headerSignature, is_global: true })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Clone-on-confirm (D2): upsert the resolved mapping into the org's cache
   * on every successful submit. Even when the user didn't edit anything,
   * the upsert confirms intent and bumps `usage_count`.
   *
   * Returns the row's id so the caller can attach it to `pms_jobs.column_mapping_id`.
   */
  static async upsertOrgMapping(
    organizationId: number,
    headerSignature: string,
    mapping: ColumnMapping,
    trx?: QueryContext
  ): Promise<IPmsColumnMapping> {
    const existing = await this.findByOrgAndSignature(
      organizationId,
      headerSignature,
      trx
    );

    if (existing) {
      await this.table(trx)
        .where({ id: existing.id })
        .update({
          mapping: this.toJson(mapping),
          updated_at: new Date(),
          last_used_at: new Date(),
          usage_count: (existing.usage_count ?? 0) + 1,
        });
      const refreshed = await this.table(trx)
        .where({ id: existing.id })
        .first();
      return this.deserializeJsonFields(refreshed);
    }

    const [inserted] = await this.table(trx)
      .insert({
        organization_id: organizationId,
        header_signature: headerSignature,
        mapping: this.toJson(mapping),
        is_global: false,
        require_confirmation: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_used_at: new Date(),
        usage_count: 1,
      })
      .returning("*");
    return this.deserializeJsonFields(inserted);
  }

  /**
   * Bump `usage_count` and refresh `last_used_at` on every cache hit.
   * Called from the resolver on Tier 1 / Tier 2 hits — fire-and-forget
   * style; failures here are non-fatal.
   */
  static async touchUsage(id: number, trx?: QueryContext): Promise<void> {
    const knexInstance = trx ?? db;
    await this.table(trx)
      .where({ id })
      .update({
        last_used_at: new Date(),
        usage_count: knexInstance.raw("usage_count + 1"),
      });
  }

  /**
   * Idempotent global-library writer. ONLY called from the Knex seed file.
   * Uses the `(header_signature) WHERE is_global = true` partial unique
   * index for the `ON CONFLICT DO NOTHING` semantics.
   *
   * Returns the row id whether it was just inserted or already existed.
   */
  static async seedGlobal(
    headerSignature: string,
    mapping: ColumnMapping,
    requireConfirmation: boolean,
    trx?: QueryContext
  ): Promise<number> {
    const existing = await this.findGlobalBySignature(headerSignature, trx);
    if (existing) return existing.id;

    const [inserted] = await this.table(trx)
      .insert({
        organization_id: null,
        header_signature: headerSignature,
        mapping: this.toJson(mapping),
        is_global: true,
        require_confirmation: requireConfirmation,
        created_at: new Date(),
        updated_at: new Date(),
        last_used_at: null,
        usage_count: 0,
      })
      .returning("id");
    return typeof inserted === "object" ? inserted.id : inserted;
  }
}
