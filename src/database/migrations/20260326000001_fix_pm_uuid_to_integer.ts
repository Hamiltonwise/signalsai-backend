import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // created_by and assigned_to were UUID but auth system uses integer IDs
  await knex.schema.alterTable("pm_projects", (t) => {
    t.dropColumn("created_by");
  });
  await knex.schema.alterTable("pm_projects", (t) => {
    t.integer("created_by");
  });

  await knex.schema.alterTable("pm_tasks", (t) => {
    t.dropColumn("assigned_to");
    t.dropColumn("created_by");
  });
  await knex.schema.alterTable("pm_tasks", (t) => {
    t.integer("assigned_to");
    t.integer("created_by");
  });

  await knex.schema.alterTable("pm_activity_log", (t) => {
    t.dropColumn("user_id");
  });
  await knex.schema.alterTable("pm_activity_log", (t) => {
    t.integer("user_id");
  });

  // Recreate the index that references assigned_to
  await knex.raw("DROP INDEX IF EXISTS idx_pm_tasks_user_deadline");
  await knex.raw(
    "CREATE INDEX idx_pm_tasks_user_deadline ON pm_tasks(assigned_to, deadline)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("pm_projects", (t) => {
    t.dropColumn("created_by");
  });
  await knex.schema.alterTable("pm_projects", (t) => {
    t.uuid("created_by");
  });

  await knex.schema.alterTable("pm_tasks", (t) => {
    t.dropColumn("assigned_to");
    t.dropColumn("created_by");
  });
  await knex.schema.alterTable("pm_tasks", (t) => {
    t.uuid("assigned_to");
    t.uuid("created_by");
  });

  await knex.schema.alterTable("pm_activity_log", (t) => {
    t.dropColumn("user_id");
  });
  await knex.schema.alterTable("pm_activity_log", (t) => {
    t.uuid("user_id");
  });

  await knex.raw("DROP INDEX IF EXISTS idx_pm_tasks_user_deadline");
  await knex.raw(
    "CREATE INDEX idx_pm_tasks_user_deadline ON pm_tasks(assigned_to, deadline)"
  );
}
