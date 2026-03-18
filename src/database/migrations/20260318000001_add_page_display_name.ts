import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.text("display_name").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.dropColumn("display_name");
    });
}
