import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("first_name", 255).nullable();
    table.string("last_name", 255).nullable();
    table.string("phone", 50).nullable();
    table.boolean("email_verified").defaultTo(false);
    table.string("email_verification_code", 10).nullable();
    table.timestamp("email_verification_expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("first_name");
    table.dropColumn("last_name");
    table.dropColumn("phone");
    table.dropColumn("email_verified");
    table.dropColumn("email_verification_code");
    table.dropColumn("email_verification_expires_at");
  });
}
