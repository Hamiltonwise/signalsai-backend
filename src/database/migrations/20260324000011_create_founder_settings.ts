import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("founder_settings", (t) => {
    t.increments("id").primary();
    t.integer("org_id").notNullable().unique().references("id").inTable("organizations");
    t.jsonb("financial_config").defaultTo("{}");
    t.jsonb("watch_ledger").defaultTo("[]");
    t.jsonb("competitive_notes").defaultTo("{}");
    t.integer("founder_cash_on_hand").defaultTo(0);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("founder_settings");
}
