import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_accounts", (table) => {
    table.jsonb("setup_progress").defaultTo(
      JSON.stringify({
        step1_api_connected: false,
        step2_pms_uploaded: false,
        dismissed: false,
        completed: false,
      })
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_accounts", (table) => {
    table.dropColumn("setup_progress");
  });
}
