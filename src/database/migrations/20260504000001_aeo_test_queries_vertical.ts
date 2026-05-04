import type { Knex } from "knex";

/**
 * Card 4 — AEO Test Queries Vertical-Aware Seeding (May 4 2026).
 *
 * State at write time:
 *   - aeo_test_queries.vertical column exists already (created by migration
 *     20260502000004) but is nullable and partially populated. Some rows
 *     have vertical='endodontist' (Cold-Outbound carry-over noun), most
 *     have vertical=NULL.
 *   - aeo_test_queries.specialty is NOT NULL with values
 *     ('endodontics' | 'general').
 *
 * Card 4 contract:
 *   - Normalize vertical to vocabulary_configs canonical keys
 *     ('endodontics' | 'orthodontics' | etc.)
 *   - Make vertical NOT NULL with default 'endodontics' so the existing 25
 *     rows match their content
 *   - Add an index on vertical for the polling-loader filter
 *   - Insert 25 orthodontics seed queries (handled by the seed migration
 *     immediately after this one)
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("aeo_test_queries");
  if (!hasTable) {
    throw new Error(
      "[Card 4] aeo_test_queries table missing. Run 20260502000004_create_aeo_test_queries first.",
    );
  }

  // 1. Backfill: normalize 'endodontist' (Cold Outbound noun) to
  //    'endodontics' (vocabulary_configs canonical key); fill NULLs
  //    using the row's specialty bucket as the source of truth, mapping
  //    'general' to 'endodontics' (the existing 25 rows are all endo or
  //    cross-specialty owner queries shipped from the March 26 spec).
  await knex.raw(
    `UPDATE aeo_test_queries
       SET vertical = 'endodontics'
       WHERE vertical IS NULL OR vertical = 'endodontist' OR vertical = 'general'`,
  );

  // 2. Set the column NOT NULL with default 'endodontics'. Done in two
  //    steps because some PG versions reject setting NOT NULL while a row
  //    is still NULL (the UPDATE above guarantees no NULLs remain).
  await knex.raw(
    `ALTER TABLE aeo_test_queries ALTER COLUMN vertical SET DEFAULT 'endodontics'`,
  );
  await knex.raw(
    `ALTER TABLE aeo_test_queries ALTER COLUMN vertical SET NOT NULL`,
  );

  // 3. Index for the polling loader's WHERE filter.
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_aeo_test_queries_vertical ON aeo_test_queries(vertical)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_aeo_test_queries_vertical`);
  await knex.raw(`ALTER TABLE aeo_test_queries ALTER COLUMN vertical DROP NOT NULL`);
  await knex.raw(`ALTER TABLE aeo_test_queries ALTER COLUMN vertical DROP DEFAULT`);
}
