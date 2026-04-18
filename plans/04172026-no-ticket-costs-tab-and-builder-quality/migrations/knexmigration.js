// T1 — ai_cost_events Knex migration.
// Destination filename in execution: src/database/migrations/20260418000001_create_ai_cost_events.ts
// (TypeScript in execution; this .js scaffold captures the shape.)

// TODO: fill during execution — convert to .ts with Knex types
exports.up = async function (knex) {
  await knex.schema.withSchema('website_builder').createTable('ai_cost_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id')
      .nullable()
      .references('id')
      .inTable('website_builder.projects')
      .onDelete('CASCADE');
    t.text('event_type').notNullable();
    t.text('vendor').notNullable().defaultTo('anthropic');
    t.text('model').notNullable();
    t.integer('input_tokens').notNullable().defaultTo(0);
    t.integer('output_tokens').notNullable().defaultTo(0);
    t.integer('cache_creation_tokens').nullable();
    t.integer('cache_read_tokens').nullable();
    t.decimal('estimated_cost_usd', 10, 6).notNullable().defaultTo(0);
    t.jsonb('metadata').nullable();
    t.uuid('parent_event_id')
      .nullable()
      .references('id')
      .inTable('website_builder.ai_cost_events')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['project_id', 'created_at'], 'idx_ai_cost_events_project_created');
    t.index(['parent_event_id'], 'idx_ai_cost_events_parent');
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema('website_builder').dropTableIfExists('ai_cost_events');
};
