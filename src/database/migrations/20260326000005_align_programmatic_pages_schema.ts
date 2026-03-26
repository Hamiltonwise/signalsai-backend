import type { Knex } from "knex";

/**
 * Align programmatic_pages table with model and service expectations.
 *
 * Fixes:
 * - Replace boolean `published` with enum `status` (draft/published/needs_refresh)
 * - Add missing columns: content_sections, page_views, checkup_starts, lat, lng, state
 * - Rename competitors_fetched_at -> competitors_refreshed_at
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("programmatic_pages", (table) => {
    // Add missing columns
    table.jsonb("content_sections").defaultTo("[]");
    table.integer("page_views").defaultTo(0);
    table.integer("checkup_starts").defaultTo(0);
    table.float("lat").nullable();
    table.float("lng").nullable();
    table.string("state", 100).nullable();

    // Add status column (will replace boolean published)
    table
      .enum("status", ["draft", "published", "needs_refresh"])
      .defaultTo("draft");

    // Rename competitors_fetched_at to competitors_refreshed_at
    table.renameColumn("competitors_fetched_at", "competitors_refreshed_at");
  });

  // Migrate existing published boolean to status enum
  await knex.raw(`
    UPDATE programmatic_pages
    SET status = CASE WHEN published = true THEN 'published' ELSE 'draft' END
  `);

  // Drop the old published column now that data is migrated
  await knex.schema.alterTable("programmatic_pages", (table) => {
    table.dropColumn("published");
  });

  // Replace the old published index with status index
  await knex.raw("DROP INDEX IF EXISTS idx_programmatic_pages_published");
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_status ON programmatic_pages(status)"
  );
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_page_views ON programmatic_pages(page_views DESC)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("programmatic_pages", (table) => {
    table.boolean("published").defaultTo(false);
  });

  await knex.raw(`
    UPDATE programmatic_pages
    SET published = (status = 'published')
  `);

  await knex.schema.alterTable("programmatic_pages", (table) => {
    table.dropColumn("content_sections");
    table.dropColumn("page_views");
    table.dropColumn("checkup_starts");
    table.dropColumn("lat");
    table.dropColumn("lng");
    table.dropColumn("state");
    table.dropColumn("status");
    table.renameColumn("competitors_refreshed_at", "competitors_fetched_at");
  });

  await knex.raw("DROP INDEX IF EXISTS idx_programmatic_pages_status");
  await knex.raw("DROP INDEX IF EXISTS idx_programmatic_pages_page_views");
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_published ON programmatic_pages(published)"
  );
}
