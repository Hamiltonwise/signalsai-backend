import type { Knex } from "knex";

/**
 * WO-WEBHOOK-HEALTH: Webhook receipt tracking for health monitoring.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("webhook_receipts");
  if (!exists) {
    await knex.schema.createTable("webhook_receipts", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("webhook_name", 100).notNullable();
      t.string("event_type", 200).nullable();
      t.timestamp("received_at", { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(
      "CREATE INDEX idx_webhook_receipts_name ON webhook_receipts(webhook_name)",
    );
    await knex.raw(
      "CREATE INDEX idx_webhook_receipts_received ON webhook_receipts(received_at)",
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("webhook_receipts");
}
