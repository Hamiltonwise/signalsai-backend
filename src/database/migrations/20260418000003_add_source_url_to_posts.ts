import type { Knex } from "knex";

/**
 * T8 — Add `source_url` to `website_builder.posts` for the
 * Import-from-Identity pipeline.
 *
 * `source_url` is overloaded:
 *   - For doctor / service post types it stores the original URL the post was
 *     scraped from.
 *   - For the location post type it stores the `place_id` (we keep the column
 *     TEXT so dedup works the same way for both flavors).
 *
 * The partial unique index enforces "one imported post per (project, post type,
 * source)" — re-imports skip an existing match unless the admin opts into the
 * `overwrite` flag in the import service.
 *
 * See `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
 * task T8 / F4.
 */
export async function up(knex: Knex): Promise<void> {
  const hasSourceUrl = await knex.schema
    .withSchema("website_builder")
    .hasColumn("posts", "source_url");

  if (!hasSourceUrl) {
    await knex.schema
      .withSchema("website_builder")
      .alterTable("posts", (t) => {
        t.text("source_url").nullable();
      });
  }

  // Partial unique index: only enforce uniqueness when source_url is set.
  // Manual posts (no source_url) are unaffected.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_project_type_source
      ON website_builder.posts (project_id, post_type_id, source_url)
      WHERE source_url IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS website_builder.idx_posts_project_type_source`,
  );
  await knex.schema
    .withSchema("website_builder")
    .alterTable("posts", (t) => {
      t.dropColumn("source_url");
    });
}
