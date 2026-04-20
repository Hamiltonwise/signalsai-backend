import type { Knex } from "knex";

/**
 * Unique partial index on `website_builder.media (project_id, s3_url)`
 * (scoped to `s3_url IS NOT NULL`).
 *
 * Enables idempotent inserts from both the live warmup image pipeline
 * (`util.image-processor.ts`) and the backfill migration
 * (`20260420000002_backfill_media_from_identity_images.ts`). Both paths use
 * `ON CONFLICT (project_id, s3_url) DO NOTHING`.
 *
 * See `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T2.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_project_s3url
      ON website_builder.media (project_id, s3_url)
      WHERE s3_url IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS website_builder.idx_media_project_s3url`,
  );
}
