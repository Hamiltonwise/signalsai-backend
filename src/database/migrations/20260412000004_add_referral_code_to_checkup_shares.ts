import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("checkup_shares", (table) => {
    table.string("referral_code", 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("checkup_shares", (table) => {
    table.dropColumn("referral_code");
  });
}
