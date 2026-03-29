import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("knowledge_heuristics", (table) => {
    table.increments("id").primary();
    table
      .string("source")
      .notNullable()
      .comment("knowledge_lattice or sentiment_lattice");
    table.string("leader_name").notNullable();
    table.string("category").notNullable();
    table.text("core_principle").notNullable();
    table.text("agent_heuristic").notNullable();
    table.text("anti_pattern").notNullable();
    table.jsonb("tags").notNullable().defaultTo("[]");
    table.timestamps(true, true);
  });

  // Index on tags for JSONB containment queries
  await knex.raw(
    `CREATE INDEX idx_knowledge_heuristics_tags ON knowledge_heuristics USING GIN (tags)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("knowledge_heuristics");
}
