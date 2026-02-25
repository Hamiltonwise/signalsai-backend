import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("mind_sync_runs", (table) => {
    table
      .uuid("batch_id")
      .nullable()
      .references("id")
      .inTable("minds.mind_discovery_batches")
      .onDelete("SET NULL");
    table.index(["batch_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("mind_sync_runs", (table) => {
    table.dropIndex(["batch_id", "status"]);
    table.dropColumn("batch_id");
  });
}
