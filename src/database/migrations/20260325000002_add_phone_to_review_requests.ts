import type { Knex } from "knex";

/**
 * Add phone number and delivery method to review_requests.
 * Supports SMS delivery via Twilio alongside email.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("review_requests", (table) => {
    table.string("recipient_phone", 20).nullable();
    table.string("delivery_method", 10).notNullable().defaultTo("email"); // "email" | "sms"
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("review_requests", (table) => {
    table.dropColumn("delivery_method");
    table.dropColumn("recipient_phone");
  });
}
