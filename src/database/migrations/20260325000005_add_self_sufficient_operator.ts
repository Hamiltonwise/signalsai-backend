import type { Knex } from "knex";

/**
 * T2-A: Self-sufficient operator flag on organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "self_sufficient_operator");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.boolean("self_sufficient_operator").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "self_sufficient_operator");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("self_sufficient_operator");
    });
  }
}
