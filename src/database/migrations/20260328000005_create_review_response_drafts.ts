import type { Knex } from "knex";

/**
 * WO-49: Review Auto-Draft Response storage
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("review_response_drafts");
  if (!exists) {
    await knex.schema.createTable("review_response_drafts", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.integer("organization_id").unsigned().notNullable();
      table.string("review_id", 200).nullable();
      table.string("reviewer_name", 200).nullable();
      table.integer("rating").nullable();
      table.text("review_text").nullable();
      table.text("body").notNullable();
      table.string("status", 20).notNullable().defaultTo("pending");
      table.timestamp("approved_at", { useTz: true }).nullable();
      table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("review_response_drafts");
}
