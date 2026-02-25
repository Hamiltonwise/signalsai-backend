import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("website_builder.projects", (table) => {
    table.string("primary_color").nullable();
    table.string("accent_color").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("website_builder.projects", (table) => {
    table.dropColumn("primary_color");
    table.dropColumn("accent_color");
  });
}
