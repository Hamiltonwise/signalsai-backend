import type { Knex } from "knex";

/**
 * WO-48: Week 1 SEO Quick Win card data
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "week1_win");
  if (!has) {
    await knex.schema.alterTable("organizations", (table) => {
      table.jsonb("week1_win").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "week1_win");
  if (has) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("week1_win");
    });
  }
}
