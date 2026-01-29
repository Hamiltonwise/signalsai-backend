import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    // Location parameters from Identifier Agent for Apify search
    table.string("search_city").nullable();
    table.string("search_state").nullable();
    table.string("search_county").nullable();
    table.string("search_postal_code").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("search_city");
    table.dropColumn("search_state");
    table.dropColumn("search_county");
    table.dropColumn("search_postal_code");
  });
}
