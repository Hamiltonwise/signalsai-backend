import type { Knex } from "knex";

/**
 * WO18: Batch Checkup Runner — results table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("batch_checkup_results", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("batch_id").notNullable();
    table.string("practice_name", 200).nullable();
    table.string("city", 100).nullable();
    table.string("state", 50).nullable();
    table.integer("score").nullable();
    table.string("top_competitor_name", 200).nullable();
    table.integer("top_competitor_reviews").nullable();
    table.integer("practice_reviews").nullable();
    table.text("primary_gap").nullable();
    table.string("place_id", 200).nullable();
    table.text("email_paragraph").nullable();
    table.string("status", 20).defaultTo("pending");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_batch_checkup_batch_id ON batch_checkup_results(batch_id)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("batch_checkup_results");
}
