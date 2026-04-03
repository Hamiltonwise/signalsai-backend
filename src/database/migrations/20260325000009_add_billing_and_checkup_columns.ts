import type { Knex } from "knex";

/**
 * WO-STRIPE-WEBHOOK + WO-CHECKUP-SESSION-KEY
 *
 * Billing columns: subscription_cancelled_at, last_payment_at
 * Checkup columns: session_checkup_key, checkup_score, checkup_data, top_competitor_name
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    // Billing lifecycle
    if (!knex.schema.hasColumn) {
      // Knex doesn't support hasColumn inside alterTable, so use IF NOT EXISTS via raw after
    }
    table.timestamp("subscription_cancelled_at", { useTz: true }).nullable();
    table.timestamp("last_payment_at", { useTz: true }).nullable();

    // Checkup session linkage
    table.string("session_checkup_key", 100).nullable();
    table.integer("checkup_score").nullable();
    table.jsonb("checkup_data").nullable();
    table.string("top_competitor_name", 200).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("top_competitor_name");
    table.dropColumn("checkup_data");
    table.dropColumn("checkup_score");
    table.dropColumn("session_checkup_key");
    table.dropColumn("last_payment_at");
    table.dropColumn("subscription_cancelled_at");
  });
}
