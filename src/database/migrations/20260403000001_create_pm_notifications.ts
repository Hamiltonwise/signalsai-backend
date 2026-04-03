import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pm_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("user_id").notNullable(); // recipient
    table
      .enum("type", ["task_assigned", "task_unassigned", "assignee_completed_task"])
      .notNullable();
    table
      .uuid("task_id")
      .nullable()
      .references("id")
      .inTable("pm_tasks")
      .onDelete("CASCADE");
    table.integer("actor_user_id").notNullable(); // who triggered
    table.jsonb("metadata").nullable(); // { task_title, project_name }
    table.boolean("is_read").notNullable().defaultTo(false);
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ["user_id", "is_read", "created_at"],
      "idx_pm_notifications_user_feed"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pm_notifications");
}
