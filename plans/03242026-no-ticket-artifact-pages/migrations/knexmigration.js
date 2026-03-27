/**
 * Add artifact page support columns to website_builder.pages
 *
 * page_type: 'sections' (default) | 'artifact'
 * artifact_s3_prefix: S3 key prefix for uploaded React app build files
 */

exports.up = async function (knex) {
  await knex.schema.withSchema('website_builder').alterTable('pages', (table) => {
    table.string('page_type', 20).notNullable().defaultTo('sections');
    table.string('artifact_s3_prefix', 500).nullable();
  });

  // Partial index for artifact page prefix matching in the renderer
  await knex.raw(`
    CREATE INDEX idx_pages_artifact_lookup
    ON website_builder.pages (project_id, page_type, path)
    WHERE page_type = 'artifact' AND status IN ('published', 'draft')
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS website_builder.idx_pages_artifact_lookup');
  await knex.schema.withSchema('website_builder').alterTable('pages', (table) => {
    table.dropColumn('artifact_s3_prefix');
    table.dropColumn('page_type');
  });
};

// TODO: fill during execution
