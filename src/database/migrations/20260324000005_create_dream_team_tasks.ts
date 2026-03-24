import type { Knex } from "knex";

/**
 * Dream Team Tasks — action items extracted from Fireflies transcripts.
 * Linked to dream_team_nodes for ownership.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("dream_team_tasks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("node_id")
      .nullable()
      .references("id")
      .inTable("dream_team_nodes")
      .onDelete("SET NULL");
    table.string("owner_name", 100).notNullable();
    table.text("title").notNullable();
    table.text("description").nullable();
    table.string("status", 20).defaultTo("open"); // open, in_progress, done
    table.string("priority", 10).defaultTo("normal"); // low, normal, high, urgent
    table.string("source_type", 50).defaultTo("fireflies"); // fireflies, manual
    table.string("source_meeting_id", 200).nullable();
    table.string("source_meeting_title", 500).nullable();
    table.date("due_date").nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_dream_team_tasks_node_id ON dream_team_tasks(node_id)");
  await knex.raw("CREATE INDEX idx_dream_team_tasks_status ON dream_team_tasks(status)");
  await knex.raw("CREATE INDEX idx_dream_team_tasks_owner ON dream_team_tasks(owner_name)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dream_team_tasks");
}
