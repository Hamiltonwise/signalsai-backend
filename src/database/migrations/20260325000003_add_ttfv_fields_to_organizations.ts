import type { Knex } from "knex";

/**
 * TTFV sensor fields on organizations.
 * Tracks first login, time-to-first-value response, and billing prompt.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.timestamp("first_login_at").nullable();
    table.string("ttfv_response", 20).nullable(); // 'yes' | 'not_yet' | null
    table.timestamp("ttfv_responded_at").nullable();
    table.timestamp("billing_prompt_shown_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("billing_prompt_shown_at");
    table.dropColumn("ttfv_responded_at");
    table.dropColumn("ttfv_response");
    table.dropColumn("first_login_at");
  });
}
