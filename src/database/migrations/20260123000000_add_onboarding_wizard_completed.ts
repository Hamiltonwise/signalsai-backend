import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_accounts", (table) => {
    table.boolean("onboarding_wizard_completed").defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_accounts", (table) => {
    table.dropColumn("onboarding_wizard_completed");
  });
}
