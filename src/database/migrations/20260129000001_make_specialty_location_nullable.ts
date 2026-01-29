import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.string("specialty").nullable().alter();
    table.string("location").nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.string("specialty").notNullable().alter();
    table.string("location").notNullable().alter();
  });
}
