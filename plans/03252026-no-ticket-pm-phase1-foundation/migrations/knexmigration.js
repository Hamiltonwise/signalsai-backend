// Knex migration scaffold for PM module tables
// TODO: Convert to TypeScript (.ts) during execution per codebase convention
// Migration filename: 20260325000001_create_pm_tables.ts

exports.up = async function (knex) {
  // 1. Create updated_at trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION pm_update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. pm_projects
  await knex.schema.createTable('pm_projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('color', 7).defaultTo('#D66853');
    table.string('icon', 50).defaultTo('folder');
    table.timestamp('deadline', { useTz: true });
    table.string('status', 20).defaultTo('active');
    table.uuid('created_by');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER pm_projects_updated_at
      BEFORE UPDATE ON pm_projects
      FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();
  `);

  // 3. pm_columns
  await knex.schema.createTable('pm_columns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('pm_projects').onDelete('CASCADE');
    table.string('name', 50).notNullable();
    table.integer('position').notNullable();
    table.boolean('is_hidden').defaultTo(false);
  });

  // 4. pm_tasks
  await knex.schema.createTable('pm_tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('pm_projects').onDelete('CASCADE');
    table.uuid('column_id').notNullable().references('id').inTable('pm_columns');
    table.string('title', 500).notNullable();
    table.text('description');
    table.string('priority', 5).defaultTo('P3');
    table.timestamp('deadline', { useTz: true });
    table.integer('position').notNullable().defaultTo(0);
    table.uuid('assigned_to');
    table.uuid('created_by');
    table.timestamp('completed_at', { useTz: true });
    table.string('source', 20).defaultTo('manual');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER pm_tasks_updated_at
      BEFORE UPDATE ON pm_tasks
      FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();
  `);

  // 5. pm_activity_log
  await knex.schema.createTable('pm_activity_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('pm_projects').onDelete('CASCADE');
    table.uuid('task_id');
    table.uuid('user_id');
    table.string('action', 50).notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // 6. pm_daily_briefs
  await knex.schema.createTable('pm_daily_briefs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('brief_date').notNullable().unique();
    table.text('summary_html');
    table.integer('tasks_completed_yesterday');
    table.integer('tasks_overdue');
    table.integer('tasks_due_today');
    table.jsonb('recommended_tasks');
    table.timestamp('generated_at', { useTz: true });
  });

  // 7. Indexes
  await knex.raw('CREATE INDEX idx_pm_tasks_board ON pm_tasks(project_id, column_id, position)');
  await knex.raw('CREATE INDEX idx_pm_tasks_user_deadline ON pm_tasks(assigned_to, deadline)');
  await knex.raw('CREATE INDEX idx_pm_tasks_upcoming ON pm_tasks(deadline) WHERE completed_at IS NULL');
  await knex.raw('CREATE INDEX idx_pm_activity_feed ON pm_activity_log(project_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_pm_briefs_date ON pm_daily_briefs(brief_date DESC)');
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('pm_daily_briefs');
  await knex.schema.dropTableIfExists('pm_activity_log');
  await knex.schema.dropTableIfExists('pm_tasks');
  await knex.schema.dropTableIfExists('pm_columns');
  await knex.schema.dropTableIfExists('pm_projects');
  await knex.raw('DROP FUNCTION IF EXISTS pm_update_timestamp()');
};
