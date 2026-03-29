import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTrialStart = await knex.schema.hasColumn("organizations", "trial_start_at");
  if (!hasTrialStart) {
    await knex.schema.alterTable("organizations", (table) => {
      table.timestamp("trial_start_at").nullable();
      table.timestamp("trial_end_at").nullable();
      table.string("trial_status", 20).nullable();
    });
  }

  const hasSeqPos = await knex.schema.hasColumn("organizations", "trial_email_sequence_position");
  if (!hasSeqPos) {
    await knex.schema.alterTable("organizations", (table) => {
      table.integer("trial_email_sequence_position").defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("trial_start_at");
    table.dropColumn("trial_end_at");
    table.dropColumn("trial_status");
    table.dropColumn("trial_email_sequence_position");
  });
}
