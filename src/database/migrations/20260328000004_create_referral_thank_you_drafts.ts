import type { Knex } from "knex";

/**
 * WO-47: Referral Thank-You Auto-Draft storage
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("referral_thank_you_drafts");
  if (!exists) {
    await knex.schema.createTable("referral_thank_you_drafts", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.integer("organization_id").unsigned().notNullable();
      table.string("gp_name", 200).notNullable();
      table.string("patient_initials", 10).nullable();
      table.string("procedure_type", 200).nullable();
      table.text("body").notNullable();
      table.string("status", 20).notNullable().defaultTo("pending");
      table.string("sent_method", 20).nullable();
      table.string("gp_email", 200).nullable();
      table.timestamp("sent_at", { useTz: true }).nullable();
      table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("referral_thank_you_drafts");
}
