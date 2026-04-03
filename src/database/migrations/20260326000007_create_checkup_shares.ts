import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("checkup_shares", (table) => {
    table.increments("id").primary();
    table.string("share_id", 20).notNullable().unique();
    table.integer("score").notNullable();
    table.string("city", 100).notNullable();
    table.string("specialty", 100);
    table.integer("rank");
    table.integer("total_competitors");
    table.string("top_competitor_name", 200);
    table.integer("views").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["share_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("checkup_shares");
}
