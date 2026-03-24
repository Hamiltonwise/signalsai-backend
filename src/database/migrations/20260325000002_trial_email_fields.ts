/**
 * Migration: Trial email tracking fields on organizations
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasStarted = await knex.schema.hasColumn("organizations", "trial_emails_started_at");
  if (!hasStarted) {
    await knex.schema.alterTable("organizations", (t) => {
      t.timestamp("trial_emails_started_at", { useTz: true });
      t.integer("trial_email_sequence_position").defaultTo(0);
    });
  }
  console.log("[Migration] Trial email fields added to organizations");
}

export async function down(knex: Knex): Promise<void> {
  const hasStarted = await knex.schema.hasColumn("organizations", "trial_emails_started_at");
  if (hasStarted) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("trial_emails_started_at");
      t.dropColumn("trial_email_sequence_position");
    });
  }
}
