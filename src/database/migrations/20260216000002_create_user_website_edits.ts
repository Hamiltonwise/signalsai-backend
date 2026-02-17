import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('website_builder').createTable('user_edits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // References
    table.integer('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('website_builder.projects').onDelete('CASCADE');
    table.uuid('page_id').notNullable().references('id').inTable('website_builder.pages').onDelete('CASCADE');

    // Edit details
    table.string('component_class').notNullable();
    table.text('instruction').notNullable();
    table.integer('tokens_used').nullable();

    // Result
    table.boolean('success').notNullable().defaultTo(true);
    table.text('error_message').nullable();

    // Timestamp
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
  });

  // Index for rate limiting queries (org + date)
  await knex.schema.withSchema('website_builder').alterTable('user_edits', (table) => {
    table.index(['organization_id', 'created_at'], 'idx_user_edits_org_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('website_builder').dropTableIfExists('user_edits');
}
