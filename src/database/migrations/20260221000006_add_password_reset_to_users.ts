import { Knex } from "knex";

/**
 * Add password reset code columns to users table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("password_reset_code", 10).nullable();
    table.timestamp("password_reset_expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("password_reset_code");
    table.dropColumn("password_reset_expires_at");
  });
}
