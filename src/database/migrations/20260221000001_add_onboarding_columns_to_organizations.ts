import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.string("operational_jurisdiction", 500).nullable();
    table.boolean("onboarding_completed").defaultTo(false);
    table.boolean("onboarding_wizard_completed").defaultTo(false);
    table
      .jsonb("setup_progress")
      .defaultTo(
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
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("operational_jurisdiction");
    table.dropColumn("onboarding_completed");
    table.dropColumn("onboarding_wizard_completed");
    table.dropColumn("setup_progress");
  });
}
