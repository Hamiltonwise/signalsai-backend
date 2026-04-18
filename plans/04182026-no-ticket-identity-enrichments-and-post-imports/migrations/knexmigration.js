// F1 — multi-location columns on projects.
// T8 — source_url on posts.
// Destination filenames at execution:
//   src/database/migrations/{ts}_add_multi_location_to_projects.ts
//   src/database/migrations/{ts+1}_add_source_url_to_posts.ts
// (TypeScript in execution; this .js scaffold captures both shapes.)

// TODO: fill during execution — split into two .ts files with Knex types
exports.up = async function (knex) {
  // --- F1: multi-location on projects ---
  const hasIds = await knex.schema
    .withSchema('website_builder')
    .hasColumn('projects', 'selected_place_ids');
  const hasPrimary = await knex.schema
    .withSchema('website_builder')
    .hasColumn('projects', 'primary_place_id');

  if (!hasIds || !hasPrimary) {
    await knex.schema.withSchema('website_builder').alterTable('projects', (t) => {
      if (!hasIds) t.specificType('selected_place_ids', 'TEXT[]').notNullable().defaultTo('{}');
      if (!hasPrimary) t.text('primary_place_id').nullable();
    });
  }

  // Backfill: existing singletons populate the array + primary pointer.
  await knex.raw(`
    UPDATE website_builder.projects
       SET selected_place_ids = ARRAY[selected_place_id],
           primary_place_id = selected_place_id
     WHERE selected_place_id IS NOT NULL
       AND selected_place_ids = '{}'
  `);

  // --- T8: posts.source_url ---
  const hasSourceUrl = await knex.schema
    .withSchema('website_builder')
    .hasColumn('posts', 'source_url');
  if (!hasSourceUrl) {
    await knex.schema.withSchema('website_builder').alterTable('posts', (t) => {
      t.text('source_url').nullable();
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_project_type_source
      ON website_builder.posts (project_id, post_type_id, source_url)
      WHERE source_url IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS website_builder.idx_posts_project_type_source`);
  await knex.schema.withSchema('website_builder').alterTable('posts', (t) => {
    t.dropColumn('source_url');
  });
  await knex.schema.withSchema('website_builder').alterTable('projects', (t) => {
    t.dropColumn('primary_place_id');
    t.dropColumn('selected_place_ids');
  });
};
