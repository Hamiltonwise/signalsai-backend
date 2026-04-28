import type { Knex } from "knex";

/**
 * Creates `pms_column_mappings` — the cache + global-library table for the
 * PMS column-mapping system (see plans/04272026-no-ticket-pms-column-mapping-
 * ai-inference/spec.md).
 *
 * Two roles in one table:
 *   1. Org-scoped cache rows (`organization_id IS NOT NULL`, `is_global=false`):
 *      one entry per (organization_id, header_signature), upserted on every
 *      successful "Submit" in the modal. Subsequent uploads of the same
 *      signature for that org bypass AI inference entirely.
 *   2. Global library rows (`organization_id IS NULL`, `is_global=true`):
 *      seeded only by Knex seeds, read-only from app code. Acts as the
 *      Tier-2 fallback before AI inference.
 *
 * Indexes:
 *   - `(organization_id, header_signature)` UNIQUE partial WHERE
 *     `organization_id IS NOT NULL` — enforces one cache row per org/signature.
 *   - `(header_signature)` UNIQUE partial WHERE `is_global = true` — enforces
 *     one global-library row per signature.
 *   - `(header_signature)` non-unique — for fast Tier 1/2 lookup scans.
 *
 * Additive change to `pms_jobs`: nullable `column_mapping_id` FK with
 * `ON DELETE SET NULL`. Old rows remain untouched (NULL); new rows record
 * which mapping they were resolved against. Indexed for the admin-org-view
 * "what mapping did this job use" lookup.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pms_column_mappings", (table) => {
    table.increments("id").primary();
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.string("header_signature", 64).notNullable();
    table.jsonb("mapping").notNullable();
    table.boolean("is_global").notNullable().defaultTo(false);
    table.boolean("require_confirmation").notNullable().defaultTo(false);
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("last_used_at", { useTz: true })
      .nullable();
    table.integer("usage_count").notNullable().defaultTo(0);

    table.index(["header_signature"], "idx_pms_column_mappings_signature");
  });

  // Partial unique indexes (knex's `.unique()` chain doesn't support
  // partial WHERE clauses, so we use raw SQL).
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_pms_column_mappings_org_signature
      ON pms_column_mappings (organization_id, header_signature)
      WHERE organization_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_pms_column_mappings_global_signature
      ON pms_column_mappings (header_signature)
      WHERE is_global = true
  `);

  // Additive: pms_jobs.column_mapping_id FK -> pms_column_mappings.id
  // Nullable so existing rows back-fill safely. ON DELETE SET NULL preserves
  // job rows if a mapping is later removed (mappings are user-owned cache
  // entries; deleting one should never cascade-delete a job).
  await knex.schema.alterTable("pms_jobs", (table) => {
    table
      .integer("column_mapping_id")
      .nullable()
      .references("id")
      .inTable("pms_column_mappings")
      .onDelete("SET NULL");
    table.index(["column_mapping_id"], "idx_pms_jobs_column_mapping_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("pms_jobs", (table) => {
    table.dropIndex(["column_mapping_id"], "idx_pms_jobs_column_mapping_id");
    table.dropColumn("column_mapping_id");
  });

  await knex.raw(
    `DROP INDEX IF EXISTS uniq_pms_column_mappings_global_signature`
  );
  await knex.raw(
    `DROP INDEX IF EXISTS uniq_pms_column_mappings_org_signature`
  );
  await knex.schema.dropTableIfExists("pms_column_mappings");
}
