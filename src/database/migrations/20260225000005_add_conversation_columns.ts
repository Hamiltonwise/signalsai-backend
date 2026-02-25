import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("mind_conversations", (table) => {
    table.text("title").nullable();
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
    table.integer("message_count").notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("mind_conversations", (table) => {
    table.dropColumn("message_count");
    table.dropColumn("updated_at");
    table.dropColumn("title");
  });
}
