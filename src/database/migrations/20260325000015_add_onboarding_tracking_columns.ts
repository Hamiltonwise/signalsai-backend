import type { Knex } from "knex";

/**
 * Onboarding tracking columns on organizations.
 * monday_email_opened: tracks step 4 of onboarding checklist
 * onboarding_completed_at: timestamp when all 5 steps complete
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.boolean("monday_email_opened").defaultTo(false);
    table.timestamp("onboarding_completed_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("onboarding_completed_at");
    table.dropColumn("monday_email_opened");
  });
}
