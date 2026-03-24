import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.string("page_type", 20).notNullable().defaultTo("sections");
      t.string("artifact_s3_prefix", 500).nullable();
    });

  await knex.raw(`
    CREATE INDEX idx_pages_artifact_lookup
    ON website_builder.pages (project_id, page_type, path)
    WHERE page_type = 'artifact' AND status IN ('published', 'draft')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "DROP INDEX IF EXISTS website_builder.idx_pages_artifact_lookup"
  );
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.dropColumn("artifact_s3_prefix");
      t.dropColumn("page_type");
    });
}
