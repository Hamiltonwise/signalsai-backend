import { Knex } from "knex";

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TYPE support_ticket_status ADD VALUE IF NOT EXISTS 'archived';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex("support_tickets")
    .where("status", "archived")
    .update({ status: "wont_fix" });
}
