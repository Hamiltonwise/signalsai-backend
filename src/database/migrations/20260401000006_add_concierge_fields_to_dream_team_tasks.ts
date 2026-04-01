import type { Knex } from "knex";

/**
 * Add task_type and blast_radius to dream_team_tasks for Concierge routing.
 */
export async function up(knex: Knex): Promise<void> {
  const hasType = await knex.schema.hasColumn("dream_team_tasks", "task_type");
  if (!hasType) {
    await knex.schema.alterTable("dream_team_tasks", (table) => {
      table.string("task_type", 30).defaultTo("manual"); // bug, feature_request, client_concern, red_escalation, manual
      table.string("blast_radius", 10).defaultTo("green"); // green, yellow, red
      table.string("assigned_to", 255).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("dream_team_tasks", (table) => {
    table.dropColumn("task_type");
    table.dropColumn("blast_radius");
    table.dropColumn("assigned_to");
  });
}
