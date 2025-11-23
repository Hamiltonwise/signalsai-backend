import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("otp_codes", (table) => {
    table.increments("id").primary();
    table.string("email").notNullable();
    table.string("code").notNullable();
    table.timestamp("expires_at").notNullable();
    table.boolean("used").defaultTo(false);
    table.timestamps(true, true);
    
    // Index for faster lookups
    table.index(["email", "code"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("otp_codes");
}
