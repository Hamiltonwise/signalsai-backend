import type { Knex } from "knex";

const LEGACY_PRICES: Record<number, string> = {
  6: "price_1TCeKxDlp4RQpOXNnR7lkOy7",   // DentalEMR
  8: "price_1TCe5ZDlp4RQpOXN5FXiRWnF",   // Artful Orthodontics
  25: "price_1TCe5HDlp4RQpOXNMHWWf4UB",  // Caswell Orthodontics
  39: "price_1TCe5ZDlp4RQpOXN5FXiRWnF",  // One Endodontics
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.string("stripe_price_id", 255).nullable().defaultTo(null);
  });

  for (const [orgId, priceId] of Object.entries(LEGACY_PRICES)) {
    await knex("organizations")
      .where({ id: Number(orgId) })
      .update({ stripe_price_id: priceId });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("stripe_price_id");
  });
}
