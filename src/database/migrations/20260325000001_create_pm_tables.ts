import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Updated_at trigger function (shared across pm_ tables)
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
  await knex.schema.createTable("pm_projects", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 255).notNullable();
    t.text("description");
    t.string("color", 7).defaultTo("#D66853");
    t.string("icon", 50).defaultTo("folder");
    t.timestamp("deadline", { useTz: true });
    t.string("status", 20).defaultTo("active");
    t.uuid("created_by");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER pm_projects_updated_at
      BEFORE UPDATE ON pm_projects
      FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();
  `);

  // 3. pm_columns
  await knex.schema.createTable("pm_columns", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id")
      .notNullable()
      .references("id")
      .inTable("pm_projects")
      .onDelete("CASCADE");
    t.string("name", 50).notNullable();
    t.integer("position").notNullable();
    t.boolean("is_hidden").defaultTo(false);
  });

  // 4. pm_tasks
  await knex.schema.createTable("pm_tasks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id")
      .notNullable()
      .references("id")
      .inTable("pm_projects")
      .onDelete("CASCADE");
    t.uuid("column_id")
      .notNullable()
      .references("id")
      .inTable("pm_columns");
    t.string("title", 500).notNullable();
    t.text("description");
    t.string("priority", 5).defaultTo("P3");
    t.timestamp("deadline", { useTz: true });
    t.integer("position").notNullable().defaultTo(0);
    t.uuid("assigned_to");
    t.uuid("created_by");
    t.timestamp("completed_at", { useTz: true });
    t.string("source", 20).defaultTo("manual");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER pm_tasks_updated_at
      BEFORE UPDATE ON pm_tasks
      FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();
  `);

  // 5. pm_activity_log
  await knex.schema.createTable("pm_activity_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id")
      .notNullable()
      .references("id")
      .inTable("pm_projects")
      .onDelete("CASCADE");
    t.uuid("task_id");
    t.uuid("user_id");
    t.string("action", 50).notNullable();
    t.jsonb("metadata");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // 6. pm_daily_briefs
  await knex.schema.createTable("pm_daily_briefs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.date("brief_date").notNullable().unique();
    t.text("summary_html");
    t.integer("tasks_completed_yesterday");
    t.integer("tasks_overdue");
    t.integer("tasks_due_today");
    t.jsonb("recommended_tasks");
    t.timestamp("generated_at", { useTz: true });
  });

  // 7. Indexes
  await knex.raw(
    "CREATE INDEX idx_pm_tasks_board ON pm_tasks(project_id, column_id, position)"
  );
  await knex.raw(
    "CREATE INDEX idx_pm_tasks_user_deadline ON pm_tasks(assigned_to, deadline)"
  );
  await knex.raw(
    "CREATE INDEX idx_pm_tasks_upcoming ON pm_tasks(deadline) WHERE completed_at IS NULL"
  );
  await knex.raw(
    "CREATE INDEX idx_pm_activity_feed ON pm_activity_log(project_id, created_at DESC)"
  );
  await knex.raw(
    "CREATE INDEX idx_pm_briefs_date ON pm_daily_briefs(brief_date DESC)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pm_daily_briefs");
  await knex.schema.dropTableIfExists("pm_activity_log");
  await knex.schema.dropTableIfExists("pm_tasks");
  await knex.schema.dropTableIfExists("pm_columns");
  await knex.schema.dropTableIfExists("pm_projects");
  await knex.raw("DROP FUNCTION IF EXISTS pm_update_timestamp()");
}
