import type { Knex } from "knex";

/**
 * Adds a `user_agent` text column to leadgen_sessions so admin submissions
 * can distinguish anonymous sessions by device + browser before the user
 * submits an email.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("leadgen_sessions", (table) => {
    table.text("user_agent").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("leadgen_sessions", (table) => {
    table.dropColumn("user_agent");
  });
}
