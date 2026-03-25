import type { Knex } from "knex";

/**
 * WO-BILLING-RECOVERY: payment_failed_at on organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "payment_failed_at");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.timestamp("payment_failed_at", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "payment_failed_at");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("payment_failed_at");
    });
  }
}
