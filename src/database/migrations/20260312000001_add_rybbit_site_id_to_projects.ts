import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.string("rybbit_site_id", 50).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.dropColumn("rybbit_site_id");
    });
}
